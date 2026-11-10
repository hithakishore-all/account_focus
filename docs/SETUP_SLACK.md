# Set up the Slack bot (optional)

About 10 minutes. Works with offline mode too. You need a Slack workspace where you can install apps (a free workspace you create is fine).

## 1. Create the app from the manifest

[api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From a manifest** → pick your workspace → paste the contents of `app/slack-manifest.yml` → **Create**.

## 2. Install it

**Install App** (left menu) → **Install to Workspace** → **Allow**.

## 3. Open your .env

```bash
cd app && cp -n .env.example .env
```

## 4. Bot token

**OAuth & Permissions** → copy **Bot User OAuth Token** (starts with `xoxb-`) → paste after `SLACK_BOT_TOKEN=` in `app/.env`.

## 5. App-level token (for Socket Mode)

**Basic Information** → **App-Level Tokens** → **Generate Token and Scopes** → name it `socket`, add scope `connections:write` → **Generate** → copy (starts with `xapp-`) → paste after `SLACK_APP_TOKEN=`.

Paste tokens yourself and keep them out of chats and commits; `.env` is git-ignored.

## 6. Start and try it

```bash
npm run offline      # or npm start for live mode
```

The log says **Slack bot connected**. In Slack, invite the bot to a channel or open its DM, then try:

| Command | What you get |
| --- | --- |
| `/focus` | Your five for today, with Accept, Snooze 3 days, Reject and Details buttons |
| `/focus northstar` | One account: scores, why now, next move, buying group, gaps |
| `/focus prep keystone` | Exec prep, every line tagged public or internal |
| `/focus help` | The commands |

Reject opens a form with the five fixed reasons. Decisions made in Slack show up in the console and the audit trail, and the other way round.

## 7. Optional: limit who can decide

Set `FOCUS_SELLER_SLACK_IDS` to a comma-separated list of Slack member IDs (profile → ⋯ → **Copy member ID**). Others can view but not decide.

## 8. Optional: the 8:00 brief

Set `FOCUS_BRIEF_CHANNEL` to a channel ID (channel details → bottom) or your member ID, then:

```bash
npm run send-brief
```

To send it every weekday at 8:00 on a Mac or Linux machine, add a cron line (`crontab -e`):

```
0 8 * * 1-5 cd /path/to/account-focus/app && /usr/local/bin/npm run send-brief >> /tmp/account-focus-brief.log 2>&1
```
