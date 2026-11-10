# Changelog

## 1.1.0 · 2026-11-10

- **Prepare outreach in Orbit** now starts GTM Orbit's outreach brief through Orbit's existing `POST /api/runs` (GTM Orbit unchanged). The console shows the result and an **Open in GTM Orbit** link. The audit trail records `ORBIT_RUN_STARTED` or `ORBIT_NOT_REACHED`.
- New settings `ORBIT_URL` (default `http://127.0.0.1:3030`) and `ORBIT_HANDOFF=off`.
- The old "Sent to Orbit" message showed even though nothing was sent; it now reports what actually happened.
- README: running Account Focus and GTM Orbit side by side.

## 1.0.0 · 2026-11-09

First release.

- Scoring engine with four dimensions (Attractiveness, Momentum, Readiness, Confidence), event clustering, action routing, gap detection and a validator that removes uncited claims.
- The same engine runs offline in Node and inside Snowflake as `SP_SCORE_ALL`, generated from one file and checked by a parity test.
- Web console: today's five, the account page with replayable pick explanation, exec prep, Slack brief preview, evaluation and audit trail.
- Slack bot: `/focus`, `/focus <account>`, `/focus prep <account>`, decision buttons and a reject form; `npm run send-brief` for the 8:00 brief.
- Hand-off to GTM Orbit's outreach brief.
- Snowflake scripts (setup, tables, views, seed, engine, service user, checks), Salesforce seed Apex and sync scripts.
- Fictional data generator, synthetic evaluation data, 20 automated tests and a static demo build.
