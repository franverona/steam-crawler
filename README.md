# Steam Weekly Demos

Crawls the Steam Store for Mac demos released in the past week and maintains a growing database served as a live GitHub Pages site.

## Usage

```bash
npm install
npm run dev
```

New demos are written to `docs/demos.json`. The report is served from `docs/index.html` via GitHub Pages.

### Options

| Variable | Default | Description |
|---|---|---|
| `RECENCY_DAYS` | `7` | Demos released within N days. `0` = no cutoff. |
| `MAX_DEMOS` | `100` | Maximum demos to fetch. |
| `MAX_AGE_DAYS` | `180` | Prune demos older than N days from the database. `0` = keep all. |

```bash
RECENCY_DAYS=30 MAX_DEMOS=200 npm run dev
```

## Automation

A GitHub Actions workflow runs every Friday at 16:00 UTC, appends new demos to `docs/demos.json`, commits it, and posts a Slack notification with a link to the GitHub Pages report.

**Required secret:** `SLACK_WEBHOOK_URL` — an [Incoming Webhook](https://api.slack.com/messaging/webhooks) URL from your Slack app.

```bash
gh secret set SLACK_WEBHOOK_URL --body "https://hooks.slack.com/services/..."
```

**GitHub Pages setup (one-time):** make the repo public, then enable Pages in Settings → Pages → source: `main` branch, `/docs` folder.

You can also trigger a run manually from the Actions tab with custom `recency_days`, `max_demos`, and `max_age_days` inputs.
