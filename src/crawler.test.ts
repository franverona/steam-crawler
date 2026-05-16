import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crawl, parseReleaseDate } from './crawler.ts';

function makeSearchResponse(items: { name: string; appid: number }[]) {
  return {
    items: items.map(({ name, appid }) => ({
      name,
      logo: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/capsule_sm_120.jpg`,
    })),
  };
}

function makeDetailsResponse(appid: number, overrides: Record<string, unknown> = {}) {
  return {
    [appid]: {
      success: true,
      data: {
        name: `Game ${appid}`,
        short_description: `Description for ${appid}`,
        header_image: `https://example.com/${appid}/header.jpg`,
        release_date: { coming_soon: false, date: '16 May, 2026' },
        screenshots: [
          { path_thumbnail: `https://example.com/${appid}/ss1.jpg`, path_full: '' },
          { path_thumbnail: `https://example.com/${appid}/ss2.jpg`, path_full: '' },
        ],
        ...overrides,
      },
    },
  };
}

function mockFetch(searchItems: { name: string; appid: number }[], detailsOverrides: Record<number, Record<string, unknown>> = {}) {
  let searchCalls = 0;
  return vi.fn(async (url: string) => {
    if (url.includes('/search/results/')) {
      // Return items only on the first page; subsequent pages are empty to stop pagination.
      const items = searchCalls++ === 0 ? makeSearchResponse(searchItems).items : [];
      return { ok: true, json: async () => ({ items }) } as Response;
    }
    const match = url.match(/appids=(\d+)/);
    const appid = match ? parseInt(match[1], 10) : 0;
    return { ok: true, json: async () => makeDetailsResponse(appid, detailsOverrides[appid] ?? {}) } as Response;
  });
}

beforeEach(() => { vi.stubGlobal('fetch', undefined); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('parseReleaseDate', () => {
  it('parses a valid Steam date string', () => {
    const d = parseReleaseDate('16 May, 2026');
    expect(d).toBeInstanceOf(Date);
    expect(d!.getFullYear()).toBe(2026);
  });

  it('returns null for an invalid date', () => {
    expect(parseReleaseDate('not a date')).toBeNull();
    expect(parseReleaseDate('')).toBeNull();
  });
});

describe('crawl', () => {
  it('returns a demo for each valid search result', async () => {
    vi.stubGlobal('fetch', mockFetch([{ name: 'Game A', appid: 111 }, { name: 'Game B', appid: 222 }]));
    const demos = await crawl({ recencyDays: 0, delayMs: 0 });
    expect(demos).toHaveLength(2);
    expect(demos[0].appid).toBe(111);
    expect(demos[1].appid).toBe(222);
  });

  it('extracts appid from the logo URL', async () => {
    vi.stubGlobal('fetch', mockFetch([{ name: 'Game A', appid: 99999 }]));
    const demos = await crawl({ recencyDays: 0, delayMs: 0 });
    expect(demos[0].appid).toBe(99999);
    expect(demos[0].storeUrl).toBe('https://store.steampowered.com/app/99999/');
  });

  it('maps all screenshots from appdetails', async () => {
    vi.stubGlobal('fetch', mockFetch([{ name: 'Game A', appid: 111 }]));
    const demos = await crawl({ recencyDays: 0, delayMs: 0 });
    expect(demos[0].screenshots).toEqual([
      'https://example.com/111/ss1.jpg',
      'https://example.com/111/ss2.jpg',
    ]);
  });

  it('skips items where appdetails returns success: false', async () => {
    let searchCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/search/results/')) {
        const items = searchCalls++ === 0 ? makeSearchResponse([{ name: 'Bad', appid: 111 }]).items : [];
        return { ok: true, json: async () => ({ items }) } as Response;
      }
      return { ok: true, json: async () => ({ 111: { success: false } }) } as Response;
    }));
    const demos = await crawl({ recencyDays: 0, delayMs: 0 });
    expect(demos).toHaveLength(0);
  });

  it('respects maxDemos cap', async () => {
    vi.stubGlobal('fetch', mockFetch([
      { name: 'A', appid: 1 },
      { name: 'B', appid: 2 },
      { name: 'C', appid: 3 },
    ]));
    const demos = await crawl({ recencyDays: 0, maxDemos: 2, delayMs: 0 });
    expect(demos).toHaveLength(2);
  });

  it('stops when release date is older than recencyDays cutoff', async () => {
    const oldDate = '1 Jan, 2000';
    vi.stubGlobal('fetch', mockFetch(
      [{ name: 'Old', appid: 111 }, { name: 'AlsoOld', appid: 222 }],
      { 111: { release_date: { date: oldDate } }, 222: { release_date: { date: oldDate } } },
    ));
    const demos = await crawl({ recencyDays: 7, delayMs: 0 });
    expect(demos).toHaveLength(0);
  });

  it('returns empty array when search returns no items', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ items: [] }),
    } as Response)));
    const demos = await crawl({ recencyDays: 0, delayMs: 0 });
    expect(demos).toHaveLength(0);
  });

  it('throws when the search API returns a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 } as Response)));
    await expect(crawl({ recencyDays: 0, delayMs: 0 })).rejects.toThrow('429');
  });
});
