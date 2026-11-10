'use strict';
// End-to-end smoke test: starts the real server offline on a free port and walks the workflow over HTTP,
// including the failure paths a seller can hit.
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const B = require('../lib/slack-blocks');

function freePort() {
  return new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
}

let proc, base, orbit, orbitCalls = [];
test.before(async () => {
  // a stand-in for GTM Orbit's POST /api/runs, so the hand-off is tested end to end
  const orbitPort = await freePort();
  orbit = require('http').createServer((q, r) => { let b = ''; q.on('data', (d) => { b += d; }); q.on('end', () => {
    orbitCalls.push({ method: q.method, url: q.url, body: JSON.parse(b || '{}') });
    r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ jobId: 'job_test' })); }); }).listen(orbitPort, '127.0.0.1');
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--offline', '--no-slack', `--port=${port}`],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ORBIT_URL: `http://127.0.0.1:${orbitPort}`, ORBIT_HANDOFF: '' } });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 8000);
    proc.stdout.on('data', (d) => { if (String(d).includes('console at')) { clearTimeout(t); resolve(); } });
    proc.on('exit', (c) => reject(new Error('server exited with ' + c)));
  });
});
test.after(() => { if (proc) proc.kill('SIGTERM'); if (orbit) orbit.close(); });

const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, body: await r.json() }));
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));

test('health reports offline mode and the pinned demo date', async () => {
  const r = await get('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.mode, 'offline');
  assert.equal(r.body.as_of, '2026-11-09');
});

test('the console page is served', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Account Focus/);
});

test('full workflow: brief, account, prep, decide, hand off, audit', async () => {
  const brief = await get('/api/brief');
  assert.equal(brief.body.picks.length, 5);
  assert.equal(brief.body.decided, 0);
  const k = brief.body.picks[0].key;

  const acct = await get('/api/accounts/' + k);
  assert.equal(acct.body.name, 'Keystone Elevator Services');
  assert.ok(acct.body.why.refs.length > 0);

  const prep = await get('/api/accounts/keystone/prep');
  assert.equal(prep.status, 200);
  assert.ok(prep.body.prep.priorities.every((p) => ['public', 'internal'].includes(p.vis)));

  const ok = await post('/api/accounts/' + k + '/decision', { decision: 'accepted' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.decision, 'accepted');

  const again = await post('/api/accounts/' + k + '/decision', { decision: 'rejected', reason: 'Wrong timing' });
  assert.equal(again.status, 409, 'one decision per account per day');

  const rej = await post('/api/accounts/northstar/decision', { decision: 'rejected', reason: 'Already working it' });
  assert.equal(rej.status, 200);

  const hand = await post('/api/accounts/pacific/handoff');
  assert.equal(hand.status, 200);
  assert.equal(hand.body.target, 'gtm-orbit/outreach-brief');
  assert.ok(hand.body.evidence_refs.length > 0);

  const after = await get('/api/brief');
  assert.equal(after.body.decided, 2);

  const audit = await get('/api/audit');
  const events = audit.body.map((e) => e.event);
  assert.ok(events.includes('PICK_ACCEPTED') && events.includes('PICK_REJECTED') && events.includes('HANDOFF_TO_ORBIT') && events.includes('CLAIM_REMOVED'));

  const reset = await post('/api/reset');
  assert.equal(reset.status, 200);
  assert.equal((await get('/api/brief')).body.decided, 0);
});

test('failure paths return clear 4xx errors', async () => {
  assert.equal((await post('/api/accounts/GTM-0012/decision', { decision: 'maybe' })).status, 400);
  const noReason = await post('/api/accounts/GTM-0012/decision', { decision: 'rejected' });
  assert.equal(noReason.status, 400);
  assert.match(noReason.body.error, /needs a reason/);
  const notPick = await post('/api/accounts/GTM-0017/decision', { decision: 'accepted' });
  assert.equal(notPick.status, 400);
  assert.match(notPick.body.error, /not in today's five/);
  assert.equal((await get('/api/accounts/does-not-exist')).status, 404);
  assert.equal((await get('/api/accounts/h')).status, 400, 'ambiguous names are rejected');
  assert.equal((await get('/api/accounts/GTM-0012/prep')).status, 404);
  assert.equal((await get('/api/nope')).status, 404);
});

test('evaluation is served from the run', async () => {
  const r = await get('/api/evaluation');
  assert.ok(r.body.backtest.precision_focus > 0);
  assert.equal(r.body.extraction.segments, 214);
});

test('Slack blocks build for the brief, an account and exec prep', async () => {
  const brief = (await get('/api/brief')).body;
  const blocks = B.briefBlocks(brief, null);
  assert.ok(blocks.filter((b) => b.type === 'actions').length === 5);
  const a = (await get('/api/accounts/GTM-0001')).body;
  assert.ok(B.accountBlocks(a).some((b) => b.type === 'section'));
  const p = (await get('/api/accounts/GTM-0024/prep')).body;
  assert.equal(B.prepBlocks(p)[0].type, 'header');
  assert.equal(B.rejectModal('GTM-0024', 'Keystone', ['A', 'B']).blocks[1].element.options.length, 2);
  assert.ok(JSON.stringify(blocks).length < 30000, 'Slack messages must stay under the size limit');
});

test('hand-off starts an outreach brief in GTM Orbit and logs it', async () => {
  const r = await post('/api/accounts/GTM-0024/handoff');
  assert.equal(r.status, 200);
  assert.equal(r.body.orbit.status, 'started');
  assert.equal(r.body.orbit.job_id, 'job_test');
  assert.match(r.body.orbit.console_url, /#GTM-0024$/);
  assert.deepEqual(orbitCalls.at(-1), { method: 'POST', url: '/api/runs', body: { account: 'GTM-0024' } });
  const a = await get('/api/audit?limit=5');
  assert.ok(a.body.some((e) => e.event === 'ORBIT_RUN_STARTED'));
});
