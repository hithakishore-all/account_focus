#!/usr/bin/env node
'use strict';
// Builds app/mock/fixtures.json: the offline snapshot. It runs the same core engine that the
// Snowflake stored procedure runs (snowflake/05_engine.sql is generated from app/lib/core.js),
// over the same seed data, so offline and live show the same numbers.
//   node scripts/build-fixtures.js          write the snapshot
//   node scripts/build-fixtures.js --check  exit 1 if the snapshot is out of date
const fs = require('fs');
const path = require('path');
const core = require('../lib/core');
const { loadInput, loadBacktest, loadSegments } = require('../lib/seed');

function build() {
  const input = loadInput();
  const run = core.buildRun(input);
  run.evaluation = {
    backtest: core.backtest(loadBacktest()),
    extraction: core.extraction(loadSegments()),
    groundedness: { sentences: run.stats.sentences, removed: run.stats.removed }
  };
  run.generated_from = 'data/seed + app/lib/core.js';
  return JSON.stringify(run, null, 1) + '\n';
}

const out = path.join(__dirname, '..', 'mock', 'fixtures.json');
const text = build();
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (cur !== text) { console.error('fixtures.json is out of date. Run: npm run fixtures'); process.exit(1); }
  console.log('fixtures.json is up to date.');
} else {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  console.log('Wrote', path.relative(process.cwd(), out));
}
