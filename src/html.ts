import type { Demo } from './crawler.ts';

function formatDate(raw: string): string {
  const d = new Date(raw);
  return isNaN(d.getTime())
    ? raw
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function demoCard(demo: Demo): string {
  const allImages = [demo.headerImage, ...demo.screenshots]
    .filter(Boolean)
    .map(
      src =>
        `<img class="strip-img" src="${escapeHtml(src)}" alt="" loading="lazy">`,
    )
    .join('');

  return `
  <article class="card">
    <div class="card-meta">
      <h2 class="card-title">
        <a href="${escapeHtml(demo.storeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(demo.name)}</a>
      </h2>
      <div class="card-right">
        ${demo.releaseDate ? `<span class="release-date">${escapeHtml(formatDate(demo.releaseDate))}</span>` : ''}
        <a class="cta" href="${escapeHtml(demo.storeUrl)}" target="_blank" rel="noopener noreferrer">Try demo &rarr;</a>
      </div>
    </div>
    <div class="image-strip">${allImages}</div>
    ${demo.tags.length > 0 ? `<div class="tags">${demo.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    <p class="description">${escapeHtml(demo.shortDescription)}</p>
  </article>`;
}

export function generateHtml(demos: Demo[]): string {
  const generatedAt = new Date().toUTCString();
  const weekLabel = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const cards = demos.map(demoCard).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Steam Mac Demos — Week of ${escapeHtml(weekLabel)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f1923;
      color: #c6d4df;
      min-height: 100vh;
      padding: 2.5rem 1.5rem;
    }

    header {
      text-align: center;
      margin-bottom: 3rem;
    }

    header h1 {
      font-size: 2rem;
      font-weight: 700;
      color: #fff;
      letter-spacing: -0.5px;
    }

    header .subtitle {
      margin-top: 0.35rem;
      color: #6b7a87;
      font-size: 0.875rem;
    }

    .list {
      display: flex;
      flex-direction: column;
      gap: 2rem;
      max-width: 1000px;
      margin: 0 auto;
    }

    /* ── Card ── */
    .card {
      background: #1c2a38;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid #2a3f5a;
    }

    /* ── Title row ── */
    .card-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.9rem 1.1rem;
      flex-wrap: wrap;
    }

    .card-title {
      font-size: 1.1rem;
      font-weight: 600;
      line-height: 1.3;
    }

    .card-title a {
      color: #66c0f4;
      text-decoration: none;
    }

    .card-title a:hover { text-decoration: underline; }

    .card-right {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-shrink: 0;
    }

    .release-date {
      font-size: 0.78rem;
      color: #6b7a87;
      white-space: nowrap;
    }

    .cta {
      display: inline-block;
      padding: 0.35rem 0.9rem;
      background: #4c6b8a;
      color: #fff;
      border-radius: 5px;
      font-size: 0.8rem;
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
      transition: background 0.15s;
    }

    .cta:hover { background: #66c0f4; color: #0f1923; }

    /* ── Image strip ── */
    .image-strip {
      display: flex;
      gap: 4px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      -webkit-overflow-scrolling: touch;
      background: #0f1923;
      padding: 4px;
      scrollbar-width: thin;
      scrollbar-color: #2a3f5a transparent;
    }

    .image-strip::-webkit-scrollbar { height: 5px; }
    .image-strip::-webkit-scrollbar-thumb { background: #2a3f5a; border-radius: 3px; }

    .strip-img {
      flex-shrink: 0;
      height: 200px;
      width: auto;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      border-radius: 5px;
      scroll-snap-align: start;
      display: block;
    }

    /* first image is the header capsule (460×215 ratio) */
    .strip-img:first-child {
      aspect-ratio: 460 / 215;
    }

    /* ── Tags ── */
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      padding: 0.5rem 1.1rem;
      border-top: 1px solid #2a3f5a;
    }

    .tag {
      font-size: 0.68rem;
      font-weight: 600;
      padding: 0.18rem 0.5rem;
      border-radius: 3px;
      background: #1e3a5a;
      color: #66c0f4;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    /* ── Description ── */
    .description {
      padding: 0.85rem 1.1rem 1rem;
      font-size: 0.875rem;
      line-height: 1.6;
      color: #8f98a0;
      border-top: 1px solid #2a3f5a;
    }

    footer {
      text-align: center;
      margin-top: 3.5rem;
      color: #4a5a6a;
      font-size: 0.8rem;
    }

    footer a { color: #4a5a6a; }
    footer a:hover { color: #66c0f4; }
  </style>
</head>
<body>
  <header>
    <h1>Steam Mac Demos</h1>
    <p class="subtitle">Week of ${escapeHtml(weekLabel)} &mdash; ${demos.length} demo${demos.length !== 1 ? 's' : ''}</p>
  </header>

  <main class="list">
${cards}
  </main>

  <footer>
    <p>Generated ${escapeHtml(generatedAt)} &mdash; data from <a href="https://store.steampowered.com">Steam</a></p>
  </footer>
</body>
</html>`;
}
