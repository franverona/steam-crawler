import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { generateHtml } from './html.ts';

const SEARCH_URL = 'https://store.steampowered.com/search/results/';
const DETAILS_URL = 'https://store.steampowered.com/api/appdetails';
const PAGE_SIZE = 50;
const DELAY_MS = 300;
// Fetch demos released within this many days; set to 0 to disable the cutoff.
const RECENCY_DAYS = parseInt(process.env.RECENCY_DAYS ?? '7', 10);
// Hard cap on total demos enriched (avoids runaway API calls).
const MAX_DEMOS = parseInt(process.env.MAX_DEMOS ?? '100', 10);

export interface Demo {
  appid: number;
  name: string;
  shortDescription: string;
  headerImage: string;
  screenshots: string[];
  releaseDate: string;
  storeUrl: string;
}

interface SearchItem {
  name: string;
  logo: string; // appid is encoded in the URL: .../steam/apps/<appid>/...
}

interface SearchResponse {
  items: SearchItem[];
}

interface AppDetailsData {
  name: string;
  short_description: string;
  header_image: string;
  release_date: { coming_soon: boolean; date: string };
  screenshots: Array<{ path_thumbnail: string; path_full: string }>;
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

// Steam returns dates like "16 May, 2026" or "May 16, 2026" depending on locale.
function parseReleaseDate(raw: string): Date | null {
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

async function fetchAppDetails(appid: number): Promise<AppDetailsData | null> {
  const params = new URLSearchParams({
    appids: String(appid),
    filters: 'basic,short_description,screenshots',
    l: 'english',
  });
  const res = await fetch(`${DETAILS_URL}?${params}`);
  if (!res.ok) return null;
  const json = (await res.json()) as Record<string, { success: boolean; data: AppDetailsData }>;
  const entry = json[String(appid)];
  return entry?.success ? entry.data : null;
}

async function crawl(): Promise<Demo[]> {
  const cutoff = RECENCY_DAYS > 0
    ? new Date(Date.now() - RECENCY_DAYS * 86_400_000)
    : null;

  const demos: Demo[] = [];
  let start = 0;
  let hitCutoff = false;

  console.log(`Crawling Steam Mac demos${cutoff ? ` (past ${RECENCY_DAYS} days)` : ''}…`);

  while (demos.length < MAX_DEMOS && !hitCutoff) {
    const page = await fetchSearchPage(start);

    if (page.items.length === 0) break;
    console.log(`  page start=${start}  items=${page.items.length}`);

    for (const item of page.items) {
      if (demos.length >= MAX_DEMOS) break;

      // appid is embedded in the logo URL: .../steam/apps/<appid>/...
      const match = item.logo.match(/\/apps\/(\d+)\//);
      if (!match) continue;
      const appid = parseInt(match[1], 10);

      await sleep(DELAY_MS);
      const details = await fetchAppDetails(appid);
      if (!details) continue;

      const releaseDate = parseReleaseDate(details.release_date?.date ?? '');
      if (cutoff && releaseDate && releaseDate < cutoff) {
        hitCutoff = true;
        break;
      }

      demos.push({
        appid,
        name: details.name,
        shortDescription: details.short_description,
        headerImage: details.header_image,
        screenshots: (details.screenshots ?? []).map(s => s.path_thumbnail),
        releaseDate: details.release_date?.date ?? '',
        storeUrl: `https://store.steampowered.com/app/${appid}/`,
      });

      console.log(`    [${demos.length}] ${details.name}`);
    }

    start += page.items.length;
    if (page.items.length === 0) break;
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

main().catch(err => {
  console.error(err);
  process.exit(1);
});
