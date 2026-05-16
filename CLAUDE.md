# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Run crawler directly with tsx (no build step, fastest for local use)
npm run crawl     # Run crawler via node --import tsx/esm (mirrors how CI runs it)
npx tsc --noEmit  # Type-check without emitting files
```

Key environment variables (all optional):

| Variable | Default | Description |
|---|---|---|
| `RECENCY_DAYS` | `7` | Only include demos released within N days. Set to `0` to disable. |
| `MAX_DEMOS` | `100` | Hard cap on enriched demos to avoid runaway API calls. |

Example: `RECENCY_DAYS=30 MAX_DEMOS=200 npm run dev`

Output is written to `dist/index.html`.

## Architecture

Two source files, no runtime dependencies — only the Node 20+ built-in `fetch`.

**`src/crawler.ts`** — entry point. Paginates the Steam Store search API (`/search/results/`) filtering by `filter=demos&os=mac&sort_by=Released_DESC`, then enriches each result by calling `/api/appdetails` per app. The `appid` is not returned by the search API directly; it is parsed from the `logo` image URL (`/steam/apps/<appid>/`). Applies two early-exit guards: `RECENCY_DAYS` (stops when a release date is older than the cutoff) and `MAX_DEMOS` (hard cap). Writes `dist/index.html` by calling `generateHtml`.

**`src/html.ts`** — pure function `generateHtml(demos: Demo[])`. Produces a self-contained HTML file (inline CSS, no JS). Layout: single-column list of cards, each with a horizontally-scrollable image strip (header capsule + all screenshots) and a "Try demo →" CTA. No external assets.

**`Demo` interface** (defined in `crawler.ts`, imported by `html.ts`):
```ts
{ appid, name, shortDescription, headerImage, screenshots, releaseDate, storeUrl }
```

## GitHub Actions

`.github/workflows/crawl.yml` runs every Monday at 09:00 UTC and on `workflow_dispatch`. It:
1. Runs the crawler and captures the demo count from stdout
2. Commits `dist/index.html` only if it changed
3. Posts a Slack notification via `secrets.SLACK_WEBHOOK_URL` (Slack Incoming Webhook URL)

The `RECENCY_DAYS` and `MAX_DEMOS` inputs are exposed as `workflow_dispatch` parameters.
