'use strict';
// Reads configuration from the environment (.env) and command-line flags, and explains what is missing.
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

function flag(name) { return process.argv.includes('--' + name); }
function opt(name) {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}

function load() {
  const env = process.env;
  const offline = flag('offline') || env.FOCUS_MODE === 'offline' || (!env.SNOWFLAKE_ACCOUNT && env.FOCUS_MODE !== 'live');
  return {
    mode: offline ? 'offline' : 'live',
    host: opt('host') || env.FOCUS_HOST || '127.0.0.1',
    port: Number(opt('port') || env.FOCUS_PORT || 3200),
    slack: {
      enabled: !flag('no-slack') && Boolean(env.SLACK_BOT_TOKEN || env.SLACK_APP_TOKEN),
      botToken: env.SLACK_BOT_TOKEN, appToken: env.SLACK_APP_TOKEN,
      sellerIds: (env.FOCUS_SELLER_SLACK_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
      briefChannel: env.FOCUS_BRIEF_CHANNEL,
      consoleUrl: env.FOCUS_PUBLIC_URL || null
    },
    snowflake: {
      account: env.SNOWFLAKE_ACCOUNT, username: env.SNOWFLAKE_USER, privateKeyPath: env.SNOWFLAKE_PRIVATE_KEY_PATH,
      privateKeyPass: env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE || undefined,
      role: env.SNOWFLAKE_ROLE || 'ACCOUNT_FOCUS_APP', warehouse: env.SNOWFLAKE_WAREHOUSE || 'ACCOUNT_FOCUS_WH',
      database: env.SNOWFLAKE_DATABASE || 'ACCOUNT_FOCUS', schema: env.SNOWFLAKE_SCHEMA || 'CORE'
    }
  };
}

/* Each check names the exact setting and the doc step that fixes it. */
function check(cfg) {
  const problems = [];
  if (cfg.mode === 'live') {
    const s = cfg.snowflake;
    if (!s.account) problems.push({ key: 'SNOWFLAKE_ACCOUNT', fix: 'docs/SETUP_SNOWFLAKE.md, step 6' });
    if (!s.username) problems.push({ key: 'SNOWFLAKE_USER', fix: 'docs/SETUP_SNOWFLAKE.md, step 6' });
    if (!s.privateKeyPath) problems.push({ key: 'SNOWFLAKE_PRIVATE_KEY_PATH', fix: 'docs/SETUP_SNOWFLAKE.md, step 5' });
    else if (!fs.existsSync(path.resolve(__dirname, '..', s.privateKeyPath))) problems.push({ key: 'SNOWFLAKE_PRIVATE_KEY_PATH', fix: 'No file at ' + s.privateKeyPath + '. See docs/SETUP_SNOWFLAKE.md, step 5' });
  }
  if (cfg.slack.enabled) {
    if (!cfg.slack.botToken || !cfg.slack.botToken.startsWith('xoxb-')) problems.push({ key: 'SLACK_BOT_TOKEN', fix: 'Must start with xoxb-. See docs/SETUP_SLACK.md, step 4' });
    if (!cfg.slack.appToken || !cfg.slack.appToken.startsWith('xapp-')) problems.push({ key: 'SLACK_APP_TOKEN', fix: 'Must start with xapp-. See docs/SETUP_SLACK.md, step 5' });
  }
  return problems;
}

module.exports = { load, check };
