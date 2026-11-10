# Contributing

Thanks for looking. This is a portfolio prototype, but issues and pull requests are welcome.

1. Fork and clone, then `cd app && npm ci`.
2. Make your change. If you touch scoring (`app/lib/core.js`) or the seed data (`data/generate_data.py`), regenerate:
   ```bash
   python3 data/generate_data.py
   cd app && npm run fixtures && npm run engine-sql && npm run demo
   ```
3. Run `npm test`. All tests must pass; one test fails on purpose if generated files are out of date.
4. Keep data fictional (`.example` emails, invented companies) and never commit `.env` or keys.
5. Open a pull request that says what changed and why.

Style: plain JavaScript (Node 20+), no build step, `core.js` and `engine.js` stay dependency-free because they also run inside Snowflake and the browser.
