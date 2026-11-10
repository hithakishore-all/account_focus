# Security

Account Focus is a portfolio prototype that runs on fictional data. Even so, please report anything that could expose credentials or let someone act as another user.

**Report a problem:** open a private security advisory on this repository (Security → Advisories → Report a vulnerability). Please do not open a public issue for security problems.

## What the project does to stay safe

- No real customer data: every company, person and number is fictional; emails use `.example`.
- Secrets stay local: `app/.env` and `app/.keys/` are git-ignored. Never commit tokens or keys.
- Snowflake: the app uses a `TYPE = SERVICE` user with key-pair authentication and a role that can only read runs and write decisions, hand-offs and audit events.
- Network: the server binds to 127.0.0.1 by default; the Slack bot uses Socket Mode, so no inbound URL is exposed.
- Input checks: decisions accept only fixed values; request bodies are capped at 50 KB.

If a key or token is ever committed, rotate it first (Snowflake: `ALTER USER … SET RSA_PUBLIC_KEY = …`; Slack: regenerate the token), then remove it from history.
