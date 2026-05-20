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
        type: 'game',
        name: `Game ${appid}`,
        short_description: `Description for ${appid}`,
        header_image: `https://example.com/${appid}/header.jpg`,
        release_date: { coming_soon: false, date: '16 May, 2026' },
        screenshots: [
          { path_thumbnail: `https://example.com/${appid}/ss1.jpg`, path_full: '' },
          { path_thumbnail: `https://example.com/${appid}/ss2.jpg`, path_full: '' },
        ],
        movies: [],
        ...overrides,
      },
    },
  };
}

function mockFetch(
  searchItems: { name: string; appid: number }[],
  detailsOverrides: Record<number, Record<string, unknown>> = {},
) {
  let searchCalls = 0;
  return vi.fn(async (url: string) => {
    if (url.includes('/search/results/')) {
      const items = searchCalls++ === 0 ? makeSearchResponse(searchItems).items : [];
      return { ok: true, json: async () => ({ items }) } as unknown as Response;
    }
    // Store page fetch used by fetchStoreTags — return empty HTML (no tags)
    if (url.includes('store.steampowered.com/app/')) {
      return { ok: true, text: async () => '' } as unknown as Response;
    }
    // appdetails — used by fetchAppDetails and fetchMovies
    const match = url.match(/appids=(\d+)/);
    const appid = match ? parseInt(match[1], 10) : 0;
    return { ok: true, json: async () => makeDetailsResponse(appid, detailsOverrides[appid] ?? {}) } as unknown as Response;
  });
}

beforeEach(() => { vi.stubGlobal('fetch', undefined); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('parseReleaseDate', () => {
  it('parses day-first format "16 May, 2026"', () => {
    const d = parseReleaseDate('16 May, 2026');
    expect(d).toBeInstanceOf(Date);
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(4); // May = 4
    expect(d!.getDate()).toBe(16);
  });

  it('parses month-first format "May 16, 2026"', () => {
    const d = parseReleaseDate('May 16, 2026');
    expect(d).toBeInstanceOf(Date);
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(4);
    expect(d!.getDate()).toBe(16);
  });

  it('parses without the trailing comma ("16 May 2026")', () => {
    const d = parseReleaseDate('16 May 2026');
    expect(d).toBeInstanceOf(Date);
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(4);
    expect(d!.getDate()).toBe(16);
  });

  it('parses all twelve months correctly', () => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    months.forEach((m, i) => {
      const d = parseReleaseDate(`1 ${m}, 2024`);
      expect(d).toBeInstanceOf(Date);
      expect(d!.getMonth()).toBe(i);
    });
  });

  it('returns null for an invalid date string', () => {
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

  it('stores releaseDate as an ISO date string (YYYY-MM-DD)', async () => {
    vi.stubGlobal('fetch', mockFetch([{ name: 'Game A', appid: 111 }]));
    const demos = await crawl({ recencyDays: 0, delayMs: 0 });
    expect(demos[0].releaseDate).toBe('2026-05-16'); // '16 May, 2026' → ISO
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
        return { ok: true, json: async () => ({ items }) } as unknown as Response;
      }
      if (url.includes('store.steampowered.com/app/')) {
        return { ok: true, text: async () => '' } as unknown as Response;
      }
      return { ok: true, json: async () => ({ 111: { success: false } }) } as unknown as Response;
    }));
    const demos = await crawl({ recencyDays: 0, delayMs: 0 });
    expect(demos).toHaveLength(0);
  });

  it('deduplicates appids that appear on multiple pages', async () => {
    let searchCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/search/results/')) {
        // Both pages return the same appid to simulate pagination overlap
        const items = searchCalls++ < 2 ? makeSearchResponse([{ name: 'Dup', appid: 111 }]).items : [];
        return { ok: true, json: async () => ({ items }) } as unknown as Response;
      }
      if (url.includes('store.steampowered.com/app/')) {
        return { ok: true, text: async () => '' } as unknown as Response;
      }
      const match = url.match(/appids=(\d+)/);
      const appid = match ? parseInt(match[1], 10) : 0;
      return { ok: true, json: async () => makeDetailsResponse(appid) } as unknown as Response;
    }));
    const demos = await crawl({ recencyDays: 0, delayMs: 0 });
    expect(demos).toHaveLength(1);
    expect(demos[0].appid).toBe(111);
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
    } as unknown as Response)));
    const demos = await crawl({ recencyDays: 0, delayMs: 0 });
    expect(demos).toHaveLength(0);
  });

  it('throws when the search API returns a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 } as unknown as Response)));
    await expect(crawl({ recencyDays: 0, delayMs: 0 })).rejects.toThrow('429');
  });

  it('skips items where coming_soon is true', async () => {
    vi.stubGlobal('fetch', mockFetch(
      [{ name: 'Soon', appid: 111 }],
      { 111: { release_date: { coming_soon: true, date: '' } } },
    ));
    const demos = await crawl({ recencyDays: 0, delayMs: 0 });
    expect(demos).toHaveLength(0);
  });

  it('skips items where type is dlc', async () => {
    vi.stubGlobal('fetch', mockFetch(
      [{ name: 'DLC', appid: 111 }],
      { 111: { type: 'dlc' } },
    ));
    const demos = await crawl({ recencyDays: 0, delayMs: 0 });
    expect(demos).toHaveLength(0);
  });

  it('skips items where type is music', async () => {
    vi.stubGlobal('fetch', mockFetch(
      [{ name: 'Soundtrack', appid: 111 }],
      { 111: { type: 'music' } },
    ));
    const demos = await crawl({ recencyDays: 0, delayMs: 0 });
    expect(demos).toHaveLength(0);
  });

  it('sets trailerThumbnail and trailerVideoUrl from the first movie', async () => {
    const movie = {
      id: 123,
      name: 'Trailer',
      thumbnail: 'https://example.com/thumb.jpg',
      hls_h264: 'https://example.com/stream.m3u8',
      highlight: true,
    };
    vi.stubGlobal('fetch', mockFetch(
      [{ name: 'Game A', appid: 111 }],
      { 111: { movies: [movie] } },
    ));
    const demos = await crawl({ recencyDays: 0, delayMs: 0 });
    expect(demos[0].trailerThumbnail).toBe('https://example.com/thumb.jpg');
    expect(demos[0].trailerVideoUrl).toBe('https://example.com/stream.m3u8');
  });

  it('fetches full game movies when the demo has none', async () => {
    const fullGameMovie = {
      id: 456,
      name: 'Full Game Trailer',
      thumbnail: 'https://example.com/fullgame-thumb.jpg',
      hls_h264: 'https://example.com/fullgame-stream.m3u8',
      highlight: true,
    };
    vi.stubGlobal('fetch', mockFetch(
      [{ name: 'Demo', appid: 111 }],
      {
        111: { movies: [], fullgame: { appid: '99999', name: 'Full Game' } },
        99999: { movies: [fullGameMovie] },
      },
    ));
    const demos = await crawl({ recencyDays: 0, delayMs: 0 });
    expect(demos[0].trailerThumbnail).toBe('https://example.com/fullgame-thumb.jpg');
    expect(demos[0].trailerVideoUrl).toBe('https://example.com/fullgame-stream.m3u8');
  });

  it('leaves trailerThumbnail undefined when no movies exist anywhere', async () => {
    vi.stubGlobal('fetch', mockFetch([{ name: 'Game A', appid: 111 }]));
    const demos = await crawl({ recencyDays: 0, delayMs: 0 });
    expect(demos[0].trailerThumbnail).toBeUndefined();
    expect(demos[0].trailerVideoUrl).toBeUndefined();
  });

  // ── knownIds ──────────────────────────────────────────────────────────────

  it('skips demos whose appid is in knownIds', async () => {
    vi.stubGlobal('fetch', mockFetch([{ name: 'Known', appid: 111 }, { name: 'New', appid: 222 }]));
    const demos = await crawl({ recencyDays: 0, delayMs: 0, knownIds: new Set([111]) });
    expect(demos).toHaveLength(1);
    expect(demos[0].appid).toBe(222);
  });

  it('stops after consecutiveKnownLimit consecutive known demos', async () => {
    // Items: new(1), known(2), known(3), known(4) — limit=3, should stop before fetching any more
    const items = [
      { name: 'New', appid: 1 },
      { name: 'Known A', appid: 2 },
      { name: 'Known B', appid: 3 },
      { name: 'Known C', appid: 4 },
      { name: 'Also New', appid: 5 }, // should not be reached
    ];
    vi.stubGlobal('fetch', mockFetch(items));
    const demos = await crawl({
      recencyDays: 0,
      delayMs: 0,
      knownIds: new Set([2, 3, 4, 5]),
      consecutiveKnownLimit: 3,
    });
    expect(demos).toHaveLength(1);
    expect(demos[0].appid).toBe(1);
  });

  it('resets consecutive known counter when a new demo is found', async () => {
    // known, known, new, known, known — limit=3, should not stop
    const items = [
      { name: 'Known A', appid: 1 },
      { name: 'Known B', appid: 2 },
      { name: 'New', appid: 3 },
      { name: 'Known C', appid: 4 },
      { name: 'Known D', appid: 5 },
    ];
    vi.stubGlobal('fetch', mockFetch(items));
    const demos = await crawl({
      recencyDays: 0,
      delayMs: 0,
      knownIds: new Set([1, 2, 4, 5]),
      consecutiveKnownLimit: 3,
    });
    expect(demos).toHaveLength(1);
    expect(demos[0].appid).toBe(3);
  });
});
