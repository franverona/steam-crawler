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
  const screenshots = demo.screenshots.filter(Boolean);
  const allImages = [demo.headerImage, ...screenshots].filter(Boolean);
  const hasTrailer = !!(demo.trailerThumbnail && demo.trailerVideoUrl);

  const trailerThumb = hasTrailer
    ? `<div class="thumb trailer-thumb active" data-video="${escapeHtml(demo.trailerVideoUrl!)}" title="Watch trailer"><img src="${escapeHtml(demo.trailerThumbnail!)}" alt="Trailer" loading="lazy" onerror="this.style.display='none'"><span class="play-icon">&#9654;</span></div>`
    : '';

  // If a trailer is active, no screenshot thumb starts active
  const thumbs = allImages
    .map((src, i) => {
      const active = !hasTrailer && i === (screenshots[0] ? 1 : 0);
      return `<img class="thumb${active ? ' active' : ''}" src="${escapeHtml(src)}" alt="" loading="lazy" onerror="this.style.display='none'">`;
    })
    .join('');

  const mainViewer = hasTrailer
    ? `<video class="main-video" data-hls="${escapeHtml(demo.trailerVideoUrl!)}" controls></video>`
    : `<img class="main-img" src="${escapeHtml(screenshots[0] || demo.headerImage)}" alt="" onerror="this.style.display='none'">`;

  return `
  <article class="card">
    <div class="card-header">
      <h2 class="card-title">
        <a href="${escapeHtml(demo.storeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(demo.name)}</a>
      </h2>
      <a class="cta" href="${escapeHtml(demo.storeUrl)}" target="_blank" rel="noopener noreferrer">Try demo &rarr;</a>
    </div>
    <div class="card-body">
      <div class="card-media">
        <div class="main-viewer">
          ${mainViewer}
        </div>
        <div class="thumb-strip">${trailerThumb}${thumbs}</div>
      </div>
      <div class="card-info">
        <img class="capsule" src="${escapeHtml(demo.headerImage)}" alt="${escapeHtml(demo.name)}" loading="lazy" onerror="this.style.display='none'">
        <p class="description">${escapeHtml(demo.shortDescription)}</p>
        ${demo.releaseDate ? `<div class="meta-row"><span class="meta-label">RELEASE DATE:</span> <span class="meta-value">${escapeHtml(formatDate(demo.releaseDate))}</span></div>` : ''}
        ${demo.tags.length > 0 ? `<div class="tags"><span class="meta-label">Popular user-defined tags:</span><div class="tag-list">${demo.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div></div>` : ''}
      </div>
    </div>
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
      background: #1b2838;
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
      gap: 2.5rem;
      max-width: 1000px;
      margin: 0 auto;
    }

    /* ── Card ── */
    .card {
      background: #16202d;
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid #2a475e;
    }

    /* ── Card header: title bar ── */
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.75rem 1rem;
      background: #0d1b26;
      border-bottom: 1px solid #2a475e;
    }

    .card-title {
      font-size: 1.25rem;
      font-weight: 400;
      line-height: 1.3;
    }

    .card-title a {
      color: #c6d4df;
      text-decoration: none;
    }

    .card-title a:hover { color: #fff; }

    .cta {
      display: inline-block;
      padding: 0.4rem 1rem;
      background: #4c7a9e;
      color: #fff;
      border-radius: 3px;
      font-size: 0.8rem;
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
      flex-shrink: 0;
      transition: background 0.15s;
    }

    .cta:hover { background: #66c0f4; color: #0f1923; }

    /* ── Two-column body ── */
    .card-body {
      display: grid;
      grid-template-columns: 1fr 300px;
    }

    /* ── Left: media column ── */
    .card-media {
      background: #000;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .main-viewer {
      background: #000;
      aspect-ratio: 16 / 9;
    }

    .main-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }

    .thumb-strip {
      display: flex;
      gap: 2px;
      overflow-x: auto;
      background: #1b2838;
      padding: 4px;
      scrollbar-width: thin;
      scrollbar-color: #2a475e transparent;
    }

    .thumb-strip::-webkit-scrollbar { height: 5px; }
    .thumb-strip::-webkit-scrollbar-thumb { background: #2a475e; border-radius: 3px; }

    .thumb {
      flex-shrink: 0;
      height: 54px;
      width: auto;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      border-radius: 2px;
      cursor: pointer;
      opacity: 0.6;
      border: 2px solid transparent;
      transition: opacity 0.1s, border-color 0.1s;
    }

    .thumb:first-child {
      aspect-ratio: 460 / 215;
    }

    .thumb:hover { opacity: 1; }

    .thumb.active {
      opacity: 1;
      border-color: #66c0f4;
    }

    .trailer-thumb {
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .trailer-thumb img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      pointer-events: none;
    }

    .play-icon {
      position: relative;
      z-index: 1;
      font-size: 1.1rem;
      color: #fff;
      text-shadow: 0 0 6px rgba(0,0,0,0.9);
      pointer-events: none;
    }

    .main-video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
      background: #000;
    }

    /* ── Right: info panel ── */
    .card-info {
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      background: #16202d;
      border-left: 1px solid #2a475e;
    }

    .capsule {
      width: 100%;
      height: auto;
      aspect-ratio: 460 / 215;
      object-fit: cover;
      border-radius: 3px;
      display: block;
    }

    .description {
      font-size: 0.8rem;
      line-height: 1.55;
      color: #acbbc8;
    }

    .meta-row {
      font-size: 0.72rem;
      display: flex;
      gap: 0.4rem;
      align-items: baseline;
      flex-wrap: wrap;
    }

    .meta-label {
      font-size: 0.68rem;
      color: #6b7a87;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 600;
    }

    .meta-value {
      color: #66c0f4;
    }

    /* ── Tags ── */
    .tags {
      margin-top: auto;
    }

    .tag-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      margin-top: 0.4rem;
    }

    .tag {
      font-size: 0.68rem;
      padding: 0.18rem 0.5rem;
      border-radius: 2px;
      background: #1e3a5a;
      color: #66c0f4;
      border: 1px solid #2a5a8a;
      white-space: nowrap;
    }

    footer {
      text-align: center;
      margin-top: 3.5rem;
      color: #4a5a6a;
      font-size: 0.8rem;
    }

    footer a { color: #4a5a6a; }
    footer a:hover { color: #66c0f4; }

    @media (max-width: 680px) {
      .card-body { grid-template-columns: 1fr; }
      .card-info { border-left: none; border-top: 1px solid #2a475e; }
    }
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

  <script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script>
  <script>
    var hlsInstances = new WeakMap();

    function attachHls(video, src) {
      if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        var hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
        hlsInstances.set(video, hls);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
      }
    }

    function teardownVideo(viewer) {
      var video = viewer.querySelector('.main-video');
      if (!video) return;
      video.pause();
      var hls = hlsInstances.get(video);
      if (hls) { hls.destroy(); hlsInstances.delete(video); }
    }

    // Initialize paused trailers already rendered in the main viewer
    document.querySelectorAll('.main-video[data-hls]').forEach(function(video) {
      attachHls(video, video.dataset.hls);
    });

    document.querySelectorAll('.thumb-strip').forEach(function(strip) {
      strip.addEventListener('click', function(e) {
        var thumb = e.target.closest('.thumb');
        if (!thumb) return;
        var card = strip.closest('.card');
        var viewer = card.querySelector('.main-viewer');
        strip.querySelectorAll('.thumb').forEach(function(t) { t.classList.remove('active'); });
        thumb.classList.add('active');
        if (thumb.dataset.video) {
          var existing = viewer.querySelector('.main-video');
          if (existing) {
            existing.play();
          } else {
            var video = document.createElement('video');
            video.className = 'main-video';
            video.controls = true;
            viewer.innerHTML = '';
            viewer.appendChild(video);
            attachHls(video, thumb.dataset.video);
            video.play();
          }
        } else {
          teardownVideo(viewer);
          var img = viewer.querySelector('.main-img');
          if (img) {
            img.src = thumb.src;
          } else {
            viewer.innerHTML = '<img class="main-img" src="' + thumb.src + '" alt="" onerror="this.style.display=\'none\'">';
          }
        }
      });
    });
  </script>
</body>
</html>`;
}
