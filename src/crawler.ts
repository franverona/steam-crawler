import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateHtml } from './html.ts';

const SEARCH_URL = 'https://store.steampowered.com/search/results/';
const DETAILS_URL = 'https://store.steampowered.com/api/appdetails';
const PAGE_SIZE = 50;

export interface Demo {
  appid: number;
  name: string;
  shortDescription: string;
  headerImage: string;
  screenshots: string[];
  releaseDate: string;
  storeUrl: string;
  tags: string[];
  trailerThumbnail?: string;
  trailerVideoUrl?: string;
}

export interface CrawlOptions {
  recencyDays?: number;
  maxDemos?: number;
  delayMs?: number;
}

interface SearchItem {
  name: string;
  logo: string; // appid is encoded in the URL: .../steam/apps/<appid>/...
}

interface SearchResponse {
  items: SearchItem[];
}

interface AppMovie {
  id: number;
  name: string;
  thumbnail: string;
  // Modern Steam API serves streaming formats only (DASH/HLS), not embeddable without a JS library.
  hls_h264?: string;
  dash_h264?: string;
  dash_av1?: string;
  highlight: boolean;
}

interface AppDetailsData {
  type: string; // 'game' | 'dlc' | 'music' | 'demo' | etc.
  name: string;
  short_description: string;
  header_image: string;
  release_date: { coming_soon: boolean; date: string };
  screenshots: Array<{ path_thumbnail: string; path_full: string }>;
  genres?: Array<{ id: string; description: string }>;
  categories?: Array<{ id: number; description: string }>;
  movies?: AppMovie[];
  fullgame?: { appid: string; name: string };
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

// Steam returns dates like "16 May, 2026" or "May 16, 2026" depending on locale.
export function parseReleaseDate(raw: string): Date | null {
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

async function fetchSearchPage(start: number): Promise<SearchResponse> {
  const params = new URLSearchParams({
    query: '',
    start: String(start),
    count: String(PAGE_SIZE),
    sort_by: 'Released_DESC',
    filter: 'demos',
    os: 'mac',
    json: '1',
  });
  const res = await fetch(`${SEARCH_URL}?${params}`, {
    headers: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) throw new Error(`Search API returned ${res.status}`);
  return res.json() as Promise<SearchResponse>;
}

async function fetchStoreTags(appid: number): Promise<string[]> {
  const res = await fetch(`https://store.steampowered.com/app/${appid}/`, {
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      // Bypass age gates
      Cookie: 'birthtime=0; lastagecheckage=1-0-1900; mature_content=1',
    },
  });
  if (!res.ok) return [];
  const html = await res.text();
  const tags: string[] = [];
  const re = /class="app_tag"[^>]*>\s*([^<]+?)\s*<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1].trim();
    if (tag && tag !== '+') tags.push(tag);
  }
  return tags;
}

async function fetchMovies(appid: number): Promise<AppMovie[]> {
  const params = new URLSearchParams({ appids: String(appid), filters: 'movies', l: 'english' });
  const res = await fetch(`${DETAILS_URL}?${params}`);
  if (!res.ok) return [];
  const json = (await res.json()) as Record<string, { success: boolean; data: { movies?: AppMovie[] } }>;
  const entry = json[String(appid)];
  return entry?.success ? (entry.data.movies ?? []) : [];
}

async function fetchAppDetails(appid: number): Promise<AppDetailsData | null> {
  const params = new URLSearchParams({
    appids: String(appid),
    filters: 'basic,short_description,screenshots,genres,categories,movies,fullgame',
    l: 'english',
  });
  const res = await fetch(`${DETAILS_URL}?${params}`);
  if (!res.ok) return null;
  const json = (await res.json()) as Record<string, { success: boolean; data: AppDetailsData }>;
  const entry = json[String(appid)];
  return entry?.success ? entry.data : null;
}

export async function crawl(options: CrawlOptions = {}): Promise<Demo[]> {
  const recencyDays = options.recencyDays ?? parseInt(process.env.RECENCY_DAYS ?? '7', 10);
  const maxDemos = options.maxDemos ?? parseInt(process.env.MAX_DEMOS ?? '100', 10);
  const delayMs = options.delayMs ?? 300;

  const cutoff = recencyDays > 0
    ? new Date(Date.now() - recencyDays * 86_400_000)
    : null;

  const demos: Demo[] = [];
  const seen = new Set<number>();
  let start = 0;
  let hitCutoff = false;

  console.log(`Crawling Steam Mac demos${cutoff ? ` (past ${recencyDays} days)` : ''}…`);

  while (demos.length < maxDemos && !hitCutoff) {
    const page = await fetchSearchPage(start);

    if (page.items.length === 0) break;
    console.log(`  page start=${start}  items=${page.items.length}`);

    for (const item of page.items) {
      if (demos.length >= maxDemos) break;

      // appid is embedded in the logo URL: .../steam/apps/<appid>/...
      const match = item.logo.match(/\/apps\/(\d+)\//);
      if (!match) continue;
      const appid = parseInt(match[1], 10);
      if (seen.has(appid)) continue;
      seen.add(appid);

      await sleep(delayMs);
      const [details, tags] = await Promise.all([
        fetchAppDetails(appid),
        fetchStoreTags(appid),
      ]);
      if (!details) continue;
      if (details.release_date?.coming_soon) continue;
      if (details.type === 'dlc' || details.type === 'music') continue;

      const releaseDate = parseReleaseDate(details.release_date?.date ?? '');
      if (cutoff && releaseDate && releaseDate < cutoff) {
        hitCutoff = true;
        break;
      }

      // Demo apps rarely carry their own movies; fall back to the full game's page.
      let movies = details.movies ?? [];
      if (movies.length === 0 && details.fullgame?.appid) {
        movies = await fetchMovies(parseInt(details.fullgame.appid, 10));
      }
      const firstMovie = movies[0];
      demos.push({
        appid,
        name: details.name,
        shortDescription: details.short_description,
        headerImage: details.header_image,
        screenshots: (details.screenshots ?? []).map(s => s.path_thumbnail),
        releaseDate: details.release_date?.date ?? '',
        storeUrl: `https://store.steampowered.com/app/${appid}/`,
        tags,
        trailerThumbnail: firstMovie?.thumbnail,
        trailerVideoUrl: firstMovie?.hls_h264,
      });

      console.log(`    [${demos.length}] ${details.name}`);
    }

    start += page.items.length;
  }

  console.log(`Done — ${demos.length} demos collected.`);
  return demos;
}

async function main() {
  const demos = await crawl();
  const html = generateHtml(demos);

  const outDir = 'dist';
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, 'index.html');
  await writeFile(outPath, html, 'utf8');
  console.log(`Output written to ${outPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
