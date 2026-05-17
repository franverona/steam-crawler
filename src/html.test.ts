import { describe, it, expect } from 'vitest';
import { generateHtml } from './html.ts';
import type { Demo } from './crawler.ts';

const base: Demo = {
  appid: 12345,
  name: 'Test Game Demo',
  shortDescription: 'A great test game.',
  headerImage: 'https://example.com/header.jpg',
  screenshots: ['https://example.com/ss1.jpg', 'https://example.com/ss2.jpg'],
  releaseDate: '16 May, 2026',
  storeUrl: 'https://store.steampowered.com/app/12345/',
  tags: ['Action', 'Indie'],
};

const withTrailer: Demo = {
  ...base,
  trailerThumbnail: 'https://example.com/trailer-thumb.jpg',
  trailerVideoUrl: 'https://example.com/stream.m3u8',
};

describe('generateHtml', () => {
  it('includes the game name and store link', () => {
    const html = generateHtml([base]);
    expect(html).toContain('Test Game Demo');
    expect(html).toContain('https://store.steampowered.com/app/12345/');
  });

  it('includes the short description', () => {
    expect(generateHtml([base])).toContain('A great test game.');
  });

  it('includes the header image and all screenshots in the strip', () => {
    const html = generateHtml([base]);
    expect(html).toContain('https://example.com/header.jpg');
    expect(html).toContain('https://example.com/ss1.jpg');
    expect(html).toContain('https://example.com/ss2.jpg');
  });

  it('escapes HTML special characters in name and description', () => {
    const demo = { ...base, name: '<script>alert("xss")</script>', shortDescription: 'A & B > C' };
    const html = generateHtml([demo]);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &gt; C');
  });

  it('escapes HTML in URLs', () => {
    const demo = { ...base, storeUrl: 'https://example.com/?a=1&b=2' };
    const html = generateHtml([demo]);
    expect(html).not.toContain('?a=1&b=2');
    expect(html).toContain('?a=1&amp;b=2');
  });

  it('shows correct demo count in subtitle', () => {
    expect(generateHtml([])).toContain('0 demos');
    expect(generateHtml([base])).toContain('1 demo');
    expect(generateHtml([base, base])).toContain('2 demos');
  });

  it('renders without error when there are no screenshots', () => {
    const html = generateHtml([{ ...base, screenshots: [] }]);
    expect(html).toContain('Test Game Demo');
    expect(html).toContain('https://example.com/header.jpg');
  });

  it('omits the release date element when releaseDate is empty', () => {
    const html = generateHtml([{ ...base, releaseDate: '' }]);
    expect(html).not.toContain('<span class="release-date">');
  });

  it('falls back to raw string for an unparseable release date', () => {
    const html = generateHtml([{ ...base, releaseDate: 'Coming Soon' }]);
    expect(html).toContain('Coming Soon');
  });

  it('produces valid HTML structure', () => {
    const html = generateHtml([base]);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('</html>');
    expect(html).toContain('<article class="card">');
  });

  // ── Tags ──────────────────────────────────────────────────────────────────

  it('renders each tag in the card', () => {
    const html = generateHtml([base]);
    expect(html).toContain('Action');
    expect(html).toContain('Indie');
    expect(html).toContain('class="tag"');
  });

  it('omits the tags section when the tags array is empty', () => {
    const html = generateHtml([{ ...base, tags: [] }]);
    expect(html).not.toContain('Popular user-defined tags');
  });

  // ── Trailer ───────────────────────────────────────────────────────────────

  it('renders a <video data-hls> in the main viewer when a trailer is present', () => {
    const html = generateHtml([withTrailer]);
    expect(html).toContain('class="main-video"');
    expect(html).toContain('data-hls="https://example.com/stream.m3u8"');
    expect(html).toContain('controls');
  });

  it('does not autoplay the initial video (no autoplay HTML attribute)', () => {
    const html = generateHtml([withTrailer]);
    expect(html).not.toMatch(/<video[^>]*autoplay/);
  });

  it('renders a trailer thumb with data-video and marks it active', () => {
    const html = generateHtml([withTrailer]);
    expect(html).toContain('class="thumb trailer-thumb active"');
    expect(html).toContain('data-video="https://example.com/stream.m3u8"');
    expect(html).toContain('https://example.com/trailer-thumb.jpg');
  });

  it('does not mark any screenshot thumb as active when a trailer is present', () => {
    const html = generateHtml([withTrailer]);
    // The only active thumb should be the trailer-thumb — no plain "thumb active" class
    expect(html).not.toContain('class="thumb active"');
  });

  it('renders <img class="main-img"> in the main viewer when there is no trailer', () => {
    const html = generateHtml([base]);
    expect(html).toContain('class="main-img"');
    expect(html).not.toContain('class="main-video"');
  });

  it('marks the first screenshot thumb as active when there is no trailer', () => {
    const html = generateHtml([base]);
    expect(html).toContain('class="thumb active"');
  });

  it('does not render a trailer thumb element when trailerThumbnail or trailerVideoUrl is missing', () => {
    const noThumb = generateHtml([{ ...base, trailerThumbnail: undefined, trailerVideoUrl: undefined }]);
    expect(noThumb).not.toContain('class="thumb trailer-thumb');

    const thumbOnly = generateHtml([{ ...base, trailerThumbnail: 'https://example.com/t.jpg', trailerVideoUrl: undefined }]);
    expect(thumbOnly).not.toContain('class="thumb trailer-thumb');
  });

  it('includes the hls.js script tag', () => {
    const html = generateHtml([base]);
    expect(html).toContain('hls.js');
  });

  it('adds onerror hide handler to all CDN images', () => {
    const html = generateHtml([base]);
    // Every <img> that loads a CDN URL should have the onerror handler
    const imgTags = html.match(/<img\b[^>]*>/g) ?? [];
    const cdnImgs = imgTags.filter(tag => tag.includes('example.com') || tag.includes('steamstatic'));
    expect(cdnImgs.length).toBeGreaterThan(0);
    cdnImgs.forEach(tag => {
      expect(tag).toContain("onerror=\"this.style.display='none'\"");
    });
  });
});
