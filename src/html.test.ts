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
});
