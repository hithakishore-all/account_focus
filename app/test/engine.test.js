'use strict';
// Unit tests for the scoring engine, the validator and the Snowflake procedure wrapper.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const core = require('../lib/core');
const { loadInput, loadBacktest, loadSegments } = require('../lib/seed');

const run = core.buildRun(loadInput());

test('brief: five picks, hero first, exploration slot last', () => {
  assert.deepEqual(run.brief.picks, ['GTM-0024', 'GTM-0011', 'GTM-0012', 'GTM-0001', 'GTM-0002']);
  assert.equal(run.accounts['GTM-0002'].slot, 'exploration');
  assert.equal(run.brief.picks.length + run.brief.rest.length, 25);
});

test('priority is the geometric mean of attractiveness and momentum', () => {
  for (const a of Object.values(run.accounts)) {
    if (a.scores.P == null) continue;
    assert.equal(a.scores.P, Math.round(Math.sqrt(a.scores.A * a.scores.M)), a.name);
  }
});

test('routing: hot account with the wrong people is multithread, not dropped', () => {
  const ns = run.accounts['GTM-0001'];
  assert.ok(ns.scores.P >= 75 && ns.scores.R < 40);
  assert.equal(ns.action.kind, 'Multithread');
  assert.ok(run.brief.picks.includes('GTM-0001'));
});

test('tracker trap: rep-spoken hits do not count, so Copperline is not picked', () => {
  const c = run.accounts['GTM-0017'];
  assert.equal(c.signals.find((s) => s.ref === 'GONG-8955#3').count, 'not_counted');
  assert.equal(c.scores.M, 0);
  assert.ok(!run.brief.picks.includes('GTM-0017'));
});

test('unknown is not low: missing data is unscored, never ranked', () => {
  const q = run.accounts['GTM-0007'];
  assert.equal(q.scores.P, null);
  assert.equal(q.slot, 'unscored');
  assert.equal(q.action.kind, 'Research');
});

test('low confidence routes to verify and stays out of the five', () => {
  const c = run.accounts['GTM-0003'];
  assert.ok(c.scores.C < 50);
  assert.equal(c.action.kind, 'Verify');
  assert.ok(!run.brief.picks.includes('GTM-0003'));
});

test('validator removes the uncited Keystone claim and keeps cited ones', () => {
  const k = run.accounts['GTM-0024'];
  assert.equal(k.why.removed.length, 1);
  assert.match(k.why.removed[0].text, /moving off its current scheduling vendor/);
  assert.ok(k.why.refs.length >= 3);
  const v = core.validate([{ text: 'a', refs: ['X'] }, { text: 'b', refs: [] }, { text: 'c', refs: ['Y'] }], { X: 1 });
  assert.equal(v.kept.length, 1);
  assert.equal(v.removed.length, 2);
});

test('opted-out contacts are never suggested', () => {
  const ns = run.accounts['GTM-0001'];
  assert.ok(ns.blocked.some((b) => b.name === 'Morgan Ellis'));
  assert.ok(Object.values(ns.roles).every((r) => r.name !== 'Morgan Ellis'));
});

test('gaps: contradiction, single-threaded and new executive are detected', () => {
  assert.ok(run.accounts['GTM-0011'].gaps.some((g) => g.type === 'Narrative mismatch'));
  assert.ok(run.accounts['GTM-0001'].gaps.some((g) => g.type === 'Single-threaded'));
  assert.ok(run.accounts['GTM-0002'].gaps.some((g) => g.type === 'New executive, no relationship'));
});

test('cooldown: an account rejected yesterday stays out without a strong new event', () => {
  const input = loadInput();
  input.feedback = [{ account: 'GTM-0011', decision: 'rejected', reason: 'Wrong timing', actor: 't', via: 'test', day: '2026-11-08', at: '2026-11-08T17:00:00Z' }];
  const r = core.buildRun(input);
  assert.ok(!r.brief.picks.includes('GTM-0011'));
  assert.equal(r.accounts['GTM-0011'].slot, 'cooldown');
  assert.equal(r.brief.picks.length, 5);
});

test('motion cap: no more than three picks from one motion', () => {
  const counts = {};
  run.brief.picks.forEach((k) => { const m = run.accounts[k].motion; counts[m] = (counts[m] || 0) + 1; });
  Object.values(counts).forEach((n) => assert.ok(n <= 3));
});

test('evaluation numbers are computed from the data files', () => {
  const bt = core.backtest(loadBacktest());
  assert.equal(bt.snapshots, 96);
  assert.ok(bt.precision_focus > bt.precision_baseline);
  const ex = core.extraction(loadSegments());
  assert.equal(ex.segments, 214);
  assert.ok(ex.two_stage_rules.precision > ex.tracker.precision);
  assert.ok(ex.two_stage_rules.precision < 1, 'the offline rules should not grade themselves perfectly');
});

test('generated files are up to date with the engine and the seed data', () => {
  const { execFileSync } = require('child_process');
  execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'build-fixtures.js'), '--check']);
  execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'build-engine-sql.js'), '--check']);
});

test('the Snowflake procedure produces the same brief as offline mode', () => {
  // Run the generated procedure body against a fake `snowflake` object that serves the seed files.
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'snowflake', '05_engine.sql'), 'utf8');
  const body = sql.split('$$')[1];
  const input = loadInput();
  const cfgRows = Object.entries(input.config).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]);
  const inserts = [];
  const table = {
    'SELECT K, V FROM AF_CONFIG': cfgRows,
    'SELECT DATA FROM AF_CATALOG': [[input.catalog]],
    'SELECT DATA FROM AF_ACCOUNT ORDER BY K': input.accounts.slice().sort((a, b) => (a.key < b.key ? -1 : 1)).map((x) => [x]),
    'SELECT DATA FROM AF_SIGNAL ORDER BY K': input.signals.slice().sort((a, b) => (a.ref < b.ref ? -1 : 1)).map((x) => [x]),
    'SELECT DATA FROM AF_CONTACT ORDER BY K': input.contacts.slice().sort((a, b) => (a.id < b.id ? -1 : 1)).map((x) => [x]),
    'SELECT DATA FROM AF_VALUEMAP ORDER BY K': input.valuemap.map((x) => [x]),
    'SELECT ACCOUNT_KEY, DATA FROM AF_DRAFT': Object.entries(input.drafts),
    'SELECT ACCOUNT_KEY, DATA FROM AF_PREP': Object.entries(input.prep),
    'SELECT DATA FROM AF_BACKTEST': loadBacktest().map((x) => [x]),
    'SELECT DATA FROM AF_SEGMENT': loadSegments().map((x) => [x]),
    'SELECT MAX(RUN_ID) FROM AF_RUN': [[1]]
  };
  const snowflake = { execute({ sqlText, binds }) {
    let rows = table[sqlText];
    if (!rows && sqlText.startsWith('SELECT ACCOUNT_KEY, DECISION')) rows = [];
    if (!rows && sqlText.startsWith('INSERT')) { inserts.push({ sqlText, binds }); rows = []; }
    if (!rows) throw new Error('Unexpected SQL in test: ' + sqlText);
    let i = -1;
    return { next: () => ++i < rows.length, getColumnValue: (n) => rows[i][n - 1] };
  } };
  const result = new Function('snowflake', 'MODEL', body)(snowflake, 'scripted');
  assert.deepEqual(result.picks, run.brief.picks);
  assert.equal(result.removed_claims, 1);
  const runInsert = inserts.find((x) => x.sqlText.startsWith('INSERT INTO AF_RUN'));
  const stored = JSON.parse(runInsert.binds[3]);
  const offline = require('../mock/fixtures.json');
  assert.deepEqual(stored.brief, offline.brief);
  assert.deepEqual(stored.evaluation, offline.evaluation);
  assert.equal(inserts.length, 3);
});
