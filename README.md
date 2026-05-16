# Steam Weekly Demos

Crawls the Steam Store for Mac demos released in the past week and generates a browsable HTML report.

## Usage

```bash
npm install
npm run dev
```

Output is written to `dist/index.html`. Open it in any browser.

### Options

| Variable | Default | Description |
|---|---|---|
| `RECENCY_DAYS` | `7` | Demos released within N days. `0` = no cutoff. |
| `MAX_DEMOS` | `100` | Maximum demos to fetch. |

```bash
RECENCY_DAYS=30 MAX_DEMOS=200 npm run dev
```

## Automation

A GitHub Actions workflow runs every Monday at 09:00 UTC, commits the updated `dist/index.html`, and posts a Slack notification.

**Required secret:** `SLACK_WEBHOOK_URL` — an [Incoming Webhook](https://api.slack.com/messaging/webhooks) URL from your Slack app.

```bash
gh secret set SLACK_WEBHOOK_URL --body "https://hooks.slack.com/services/..."
```

You can also trigger a run manually from the Actions tab with custom `recency_days` and `max_demos` inputs.
