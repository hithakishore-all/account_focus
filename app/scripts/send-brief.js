#!/usr/bin/env node
'use strict';
// Posts today's brief to Slack (a channel ID, or a user ID for a direct message).
//   npm run send-brief                     uses FOCUS_BRIEF_CHANNEL from .env
//   npm run send-brief -- --to=U0123ABC    sends to one person
// Schedule it at 8:00 on weekdays with cron or your scheduler of choice (see README).
const { load } = require('../lib/config');
const { createEngine, createMemoryStore } = require('../lib/engine');
const B = require('../lib/slack-blocks');

async function main() {
  const cfg = load();
  const to = (process.argv.find((a) => a.startsWith('--to=')) || '').slice(5) || cfg.slack.briefChannel;
  if (!cfg.slack.botToken || !cfg.slack.botToken.startsWith('xoxb-')) throw new Error('SLACK_BOT_TOKEN is missing. See docs/SETUP_SLACK.md, step 4.');
  if (!to) throw new Error('Set FOCUS_BRIEF_CHANNEL in .env or pass --to=<channel or user ID>.');
  const store = cfg.mode === 'offline' ? createMemoryStore(require('../mock/fixtures.json')) : require('../lib/store-snowflake').createSnowflakeStore(cfg);
  const engine = createEngine(store);
  const brief = await engine.brief();
  const { WebClient } = require('@slack/web-api');
  const client = new WebClient(cfg.slack.botToken);
  let channel = to;
  if (/^U[A-Z0-9]+$/.test(to)) channel = (await client.conversations.open({ users: to })).channel.id;
  await client.chat.postMessage({ channel, text: `Your five for ${B.fmtDate(brief.as_of)}`, blocks: B.briefBlocks(brief, cfg.slack.consoleUrl) });
  await engine.logAudit({ actor: 'slack', event: 'BRIEF_DM_SENT', detail: `${brief.owner.name} · ${brief.picks.length} picks · to ${to}` });
  if (store.close) await store.close();
  console.log(`Sent the brief (${brief.picks.length} picks) to ${to}.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
