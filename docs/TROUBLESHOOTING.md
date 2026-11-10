# Troubleshooting

## Running locally

| Symptom | Cause | Fix |
| --- | --- | --- |
| `npm ci` fails with an engine error | Node is older than 20 | Install Node 22 (`nvm install` reads `.nvmrc`) |
| `Port 3200 is in use` | Another process (maybe an earlier run) has the port | Stop it, or `npm run offline -- --port=3201` |
| The page loads but says "Could not load Account Focus" | The server stopped, or live mode cannot reach Snowflake | Check the terminal; try `npm run offline` |
| Fonts look plain | No internet; Google Fonts did not load | Nothing to fix: system fonts are used |
| `fixtures.json is out of date` in tests | Seed data or the engine changed | `npm run fixtures && npm run engine-sql` |
| Decisions vanished after a restart | Offline mode keeps decisions in memory | Expected; live mode stores them in Snowflake |

## Snowflake

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Configuration is incomplete: SNOWFLAKE_USER` on start | `.env` is missing live settings | Fill them in (SETUP_SNOWFLAKE.md, step 6) or `npm run offline` |
| `JWT token is invalid` | The public key on the user does not match `.keys/rsa_key.p8` | Re-copy the public key body into `06_service_user.sql` and rerun the `ALTER USER` line |
| `No scoring run yet` | The engine has not run | `CALL ACCOUNT_FOCUS.CORE.SP_SCORE_ALL('scripted');` |
| `Object does not exist or not authorized` | Scripts ran out of order, or the wrong role | Rerun 01 → 07 in order; check the role in the worksheet |
| Account identifier rejected | You pasted the URL | Use `ORGNAME-ACCOUNTNAME`, without `.snowflakecomputing.com` |
| `MODEL_FALLBACK` in the audit trail | Cortex is not available on your account | Use `'scripted'`, or ask your admin for `SNOWFLAKE.CORTEX_USER` |
| `04_seed.sql` is slow in the UI | It loads about 400 KB of JSON | Wait a few seconds; it runs once |

## Salesforce

| Symptom | Cause | Fix |
| --- | --- | --- |
| `sf: command not found` | CLI not installed | Install it (SETUP_SALESFORCE.md, step 2) and open a new terminal |
| `No authorization information found` | Not signed in to that alias | `sf org login web --alias account-focus` |
| Apex fails on `Industry` | The org has restricted picklist values | Remove `Industry=…` from the failing line in `salesforce/seed.apex`, or add the value |
| `Unexpected rows in the export` from `npm run sync-sql` | Records without the `GTM-` account number | Re-run the seed; it marks only its own records |

## Slack

| Symptom | Cause | Fix |
| --- | --- | --- |
| `SLACK_BOT_TOKEN: Must start with xoxb-` | Wrong token pasted | Use the Bot User OAuth Token (SETUP_SLACK.md, step 4) |
| `Slack bot could not connect` | App-level token missing `connections:write`, or Socket Mode off | Regenerate the token with that scope; check the manifest's Socket Mode |
| `/focus` says "dispatch_failed" | The server is not running | Start it; Socket Mode needs the process running |
| `/focus` is not found | App not installed in this workspace | Install it (SETUP_SLACK.md, step 2) |
| "Only the seller who owns this book can decide" | `FOCUS_SELLER_SLACK_IDS` does not include you | Add your member ID, or leave it empty |
| `send-brief` says `not_in_channel` | The bot is not in that channel | Invite it: `/invite @Account Focus` |
