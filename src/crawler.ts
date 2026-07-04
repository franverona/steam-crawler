import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

export interface StoredDemo extends Demo {
  addedAt: string;
}

export interface DemoDatabase {
  latestBatch: number[];
  demos: StoredDemo[];
  lastCrawledAt?: string;
}

export interface CrawlOptions {
  recencyDays?: number;
  maxDemos?: number;
  delayMs?: number;
  knownIds?: Set<number>;
  consecutiveKnownLimit?: number;
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

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  maxAttempts = 3,
  backoffMs = 1000,
): Promise<Response> {
  let res!: Response;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      res = await fetch(url, init);
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts - 1) throw lastError;
      await sleep(backoffMs * 2 ** attempt);
      continue;
    }
    if (res.ok) return res;
    const shouldRetry = res.status === 429 || res.status >= 500;
    if (!shouldRetry || attempt === maxAttempts - 1) return res;
    await sleep(backoffMs * 2 ** attempt);
  }
  return res;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Handles "16 May, 2026" (day-first) and "May 16, 2026" (month-first).
// Falls back to new Date() for any other format V8 can parse.
export function parseReleaseDate(raw: string): Date | null {
  const parts = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/)   // "16 May, 2026"
              ?? raw.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/); // "May 16, 2026"
  if (parts) {
    const [, a, b, c] = parts;
    const [day, monthStr, year] = /^\d/.test(a)
      ? [parseInt(a, 10), b, parseInt(c, 10)]
      : [parseInt(b, 10), a, parseInt(c, 10)];
    const month = MONTHS[monthStr.toLowerCase().slice(0, 3)];
    if (month !== undefined) return new Date(year, month, day);
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const res = await fetchWithRetry(`${SEARCH_URL}?${params}`, {
    headers: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) throw new Error(`Search API returned ${res.status}`);
  return res.json() as Promise<SearchResponse>;
}

async function fetchStoreTags(appid: number): Promise<string[]> {
  const res = await fetchWithRetry(`https://store.steampowered.com/app/${appid}/`, {
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
  const res = await fetchWithRetry(`${DETAILS_URL}?${params}`);
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
  const res = await fetchWithRetry(`${DETAILS_URL}?${params}`);
  if (!res.ok) return null;
  const json = (await res.json()) as Record<string, { success: boolean; data: AppDetailsData }>;
  const entry = json[String(appid)];
  return entry?.success ? entry.data : null;
}

export async function crawl(options: CrawlOptions = {}): Promise<Demo[]> {
  const recencyDays = options.recencyDays ?? parseInt(process.env.RECENCY_DAYS ?? '7', 10);
  const maxDemos = options.maxDemos ?? parseInt(process.env.MAX_DEMOS ?? '100', 10);
  const delayMs = options.delayMs ?? 300;
  const knownIds = options.knownIds ?? new Set<number>();
  const consecutiveKnownLimit = options.consecutiveKnownLimit ?? 5;

  const cutoff = recencyDays > 0
    ? new Date(Date.now() - recencyDays * 86_400_000)
    : null;

  const demos: Demo[] = [];
  const seen = new Set<number>();
  let start = 0;
  let hitCutoff = false;
  let consecutiveKnown = 0;

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

      if (knownIds.has(appid)) {
        consecutiveKnown++;
        if (consecutiveKnown >= consecutiveKnownLimit) {
          hitCutoff = true;
          break;
        }
        continue;
      }
      await sleep(delayMs);
      const details = await fetchAppDetails(appid);
      if (!details) continue;
      if (details.release_date?.coming_soon) continue;
      if (details.type === 'dlc' || details.type === 'music') continue;

      const releaseDate = parseReleaseDate(details.release_date?.date ?? '');
      if (cutoff && releaseDate && releaseDate < cutoff) {
        hitCutoff = true;
        break;
      }

      const tags = await fetchStoreTags(appid);

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
        releaseDate: releaseDate ? toIsoDate(releaseDate) : '',
        storeUrl: `https://store.steampowered.com/app/${appid}/`,
        tags,
        trailerThumbnail: firstMovie?.thumbnail,
        trailerVideoUrl: firstMovie?.hls_h264 ?? firstMovie?.dash_h264 ?? firstMovie?.dash_av1,
      });
      consecutiveKnown = 0;

      console.log(`    [${demos.length}] ${details.name}`);
    }

    start += page.items.length;
  }

  console.log(`Done — ${demos.length} new demos found.`);
  return demos;
}

export function pruneOldDemos(demos: StoredDemo[], maxAgeDays: number, now = Date.now()): StoredDemo[] {
  if (maxAgeDays <= 0) return demos;
  const cutoff = new Date(now - maxAgeDays * 86_400_000).toISOString().slice(0, 10);
  return demos.filter(d => d.addedAt >= cutoff);
}

async function main() {
  const dbPath = join('docs', 'demos.json');

  let db: DemoDatabase = { latestBatch: [], demos: [] };
  try {
    const raw = await readFile(dbPath, 'utf8');
    db = JSON.parse(raw) as DemoDatabase;
  } catch {
    // First run — start with empty database
  }

  const knownIds = new Set(db.demos.map(d => d.appid));
  const newDemos = await crawl({ knownIds });

  const addedAt = new Date().toISOString().slice(0, 10);
  const newStoredDemos: StoredDemo[] = newDemos.map(d => ({ ...d, addedAt }));

  db = {
    latestBatch: newStoredDemos.map(d => d.appid),
    demos: [...newStoredDemos, ...db.demos],
    lastCrawledAt: new Date().toISOString(),
  };

  const maxAgeDays = parseInt(process.env.MAX_AGE_DAYS ?? '180', 10);
  const beforePrune = db.demos.length;
  db.demos = pruneOldDemos(db.demos, maxAgeDays);
  const pruned = beforePrune - db.demos.length;
  if (pruned > 0) {
    const remaining = new Set(db.demos.map(d => d.appid));
    db.latestBatch = db.latestBatch.filter(id => remaining.has(id));
    console.log(`Pruned ${pruned} demos older than ${maxAgeDays} days.`);
  }

  await mkdir('docs', { recursive: true });
  await writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8');

  console.log(`Done — ${newDemos.length} new demos added. ${db.demos.length} total in database.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
