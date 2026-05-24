# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Run crawler directly with tsx (no build step, fastest for local use)
npm run crawl     # Run crawler via node --import tsx/esm (mirrors how CI runs it)
npm test          # Run tests with vitest
npx tsc --noEmit  # Type-check without emitting files
```

Key environment variables (all optional):

| Variable | Default | Description |
|---|---|---|
| `RECENCY_DAYS` | `7` | Only include demos released within N days. Set to `0` to disable. |
| `MAX_DEMOS` | `100` | Hard cap on enriched demos to avoid runaway API calls. |
| `MAX_AGE_DAYS` | `180` | Prune demos from the database older than N days. Set to `0` to keep all. |

Example: `RECENCY_DAYS=30 MAX_DEMOS=200 npm run dev`

Output is written to `docs/demos.json`.

## Architecture

One source file, no runtime dependencies — only the Node 24+ built-in `fetch`.

**`src/crawler.ts`** — entry point. Paginates the Steam Store search API (`/search/results/`) filtering by `filter=demos&os=mac&sort_by=Released_DESC`, then enriches each result by calling `/api/appdetails` per app. The `appid` is not returned by the search API directly; it is parsed from the `logo` image URL (`/steam/apps/<appid>/`). Applies three early-exit guards: `RECENCY_DAYS` (stops when a release date is older than the cutoff), `MAX_DEMOS` (hard cap), and `consecutiveKnownLimit` (stops after N consecutive demos already in the database, default 5). Tags are scraped from the store page HTML (not the API) via a separate fetch that sets a cookie to bypass age gates. A 300ms delay (`delayMs` in `CrawlOptions`) is inserted between per-app fetches to avoid rate limiting. All outbound fetch calls go through `fetchWithRetry` (3 attempts, exponential backoff starting at 1s), which retries on 429 and 5xx only. Reads `docs/demos.json` on startup to build the known-ids set, then merges new demos back into it after crawling.

**`docs/index.html`** — static template committed to the repo. Fetches `./demos.json` at runtime, renders demo cards with inline JS, and provides a Latest/All toggle. Demos in `latestBatch` are badged as "New". Requires being served over HTTP (GitHub Pages) — does not work as a `file://` URL.

**`docs/demos.json`** — persistent demo database committed to the repo and updated on every workflow run.

**`Demo` interface** (defined in `crawler.ts`):
```ts
{ appid, name, shortDescription, headerImage, screenshots, releaseDate, storeUrl, tags, trailerThumbnail?, trailerVideoUrl? }
```
`releaseDate` is stored as `YYYY-MM-DD`. `trailerVideoUrl` prefers `hls_h264`; falls back to `dash_h264` then `dash_av1`.

**`StoredDemo` interface** extends `Demo` with `addedAt: string` (ISO date, set when first inserted).

**`DemoDatabase` shape** (the `docs/demos.json` structure):
```ts
{ latestBatch: number[], demos: StoredDemo[] }
```
`latestBatch` contains the appids added in the most recent run and is replaced on every run.

## GitHub Actions

`.github/workflows/crawl.yml` runs on `workflow_dispatch` only. It:
1. Runs `npm test`
2. Runs the crawler; new demos are merged into `docs/demos.json`
3. Commits and pushes `docs/demos.json` to `main` (`[skip ci]` prevents re-triggering)
4. Posts a Slack failure notification if any step fails
5. Posts a Slack success notification with new demo count, total in database, and a link to the GitHub Pages report

The `RECENCY_DAYS`, `MAX_DEMOS`, and `MAX_AGE_DAYS` inputs are exposed as `workflow_dispatch` parameters.

# Notes

- Always run tests to check if changes are correct.
- If you need to run the crawler locally, use `MAX_DEMOS=5` unless told otherwise.
