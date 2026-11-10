#!/usr/bin/env node
'use strict';
// Account Focus: web console + HTTP API + optional Slack bot.
//   npm start            live mode when Snowflake is configured in .env, otherwise offline
//   npm run offline      always offline (fixtures snapshot, no accounts needed)
const path = require('path');
const express = require('express');
const { load, check } = require('./lib/config');
const { createEngine, createMemoryStore } = require('./lib/engine');

function log(msg) { process.stdout.write(`[account-focus] ${msg}\n`); }

function createStore(cfg) {
  if (cfg.mode === 'offline') return createMemoryStore(require('./mock/fixtures.json'));
  return require('./lib/store-snowflake').createSnowflakeStore(cfg);
}

function createServer(cfg, store) {
  const engine = createEngine(store);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '50kb' }));
  app.use(express.static(path.join(__dirname, 'public')));
  // engine.js is shared with the browser (the static demo uses it); serve it read-only
  app.get('/lib/engine.js', (req, res) => res.sendFile(path.join(__dirname, 'lib', 'engine.js')));

  const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res))
    .then((out) => res.json(out))
    .catch((e) => {
      const status = e.status || 500;
      if (status >= 500) log(`error on ${req.method} ${req.path}: ${e.message}`);
      res.status(status).json({ error: status >= 500 && !e.status ? 'Server error. Check the server log.' : e.message });
    });
  const actor = (req) => String((req.body && req.body.actor) || req.get('x-focus-actor') || 'Alex Rivera (web)').slice(0, 80);

  app.get('/api/health', wrap(async () => {
    const h = await store.health();
    const run = await store.getRun().catch((e) => ({ error: e.message }));
    return { ok: h.ok && !run.error, mode: cfg.mode, as_of: run.as_of || null, version: run.version || null,
             slack: cfg.slack.enabled, problems: check(cfg), detail: run.error || undefined };
  }));
  app.get('/api/brief', wrap(() => engine.brief()));
  app.get('/api/accounts/:key', wrap((req) => engine.account(req.params.key)));
  app.get('/api/accounts/:key/prep', wrap((req) => engine.prep(req.params.key)));
  app.post('/api/accounts/:key/decision', wrap((req) => engine.decide(req.params.key, {
    decision: req.body && req.body.decision, reason: req.body && req.body.reason, actor: actor(req), via: 'web' })));
  app.post('/api/accounts/:key/handoff', wrap((req) => engine.handoff(req.params.key, { actor: actor(req) })));
  app.get('/api/audit', wrap((req) => engine.audit(Math.min(500, Number(req.query.limit) || 200))));
  app.get('/api/evaluation', wrap(() => engine.evaluation()));
  app.get('/api/reasons', wrap(() => engine.REASONS));
  app.post('/api/reset', wrap(async () => {
    if (!store.reset) { const e = new Error('Reset is only available offline.'); e.status = 400; throw e; }
    await store.reset();
    return { ok: true };
  }));
  app.use('/api', (req, res) => res.status(404).json({ error: `No API route ${req.method} ${req.path}` }));
  return { app, engine };
}

function main() {
  const cfg = load();
  const problems = check(cfg);
  if (problems.length) {
    log('Configuration is incomplete:');
    problems.forEach((p) => log(`  ${p.key}: ${p.fix}`));
    if (cfg.mode === 'live') { log('Fix the settings above, or run offline with: npm run offline'); process.exit(1); }
    log('Slack is turned off until the tokens are fixed.');
    cfg.slack.enabled = false;
  }
  const store = createStore(cfg);
  const { app, engine } = createServer(cfg, store);
  const server = app.listen(cfg.port, cfg.host, () => {
    log(`${cfg.mode} mode · console at http://${cfg.host}:${cfg.port}`);
    if (cfg.host === '127.0.0.1') log('Only this computer can open it. Set FOCUS_HOST=0.0.0.0 to share it on your network.');
  });
  server.on('error', (e) => {
    log(e.code === 'EADDRINUSE' ? `Port ${cfg.port} is in use. Stop the other process or run with --port=3201.` : e.message);
    process.exit(1);
  });
  let slack = null;
  if (cfg.slack.enabled) {
    slack = require('./lib/slack').createSlackApp(engine, cfg, log);
    slack.start().then(() => log('Slack bot connected (Socket Mode). Try /focus in Slack.'))
      .catch((e) => log('Slack bot could not connect: ' + e.message + '. See docs/TROUBLESHOOTING.md#slack'));
  } else log('Slack bot off (no tokens in .env, or --no-slack).');

  let closing = false;
  const shutdown = (sig) => {
    if (closing) return; closing = true;
    log(`${sig} received, shutting down.`);
    const tasks = [new Promise((r) => server.close(r))];
    if (slack) tasks.push(slack.stop().catch(() => {}));
    if (store.close) tasks.push(store.close());
    Promise.all(tasks).then(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) main();
module.exports = { createServer, createStore };
