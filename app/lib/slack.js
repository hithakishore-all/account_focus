'use strict';
// Slack bot (Bolt, Socket Mode: no public URL needed). Shares the engine with the web console.
const { App, LogLevel } = require('@slack/bolt');
const B = require('./slack-blocks');

function createSlackApp(engine, cfg, log) {
  const app = new App({ token: cfg.slack.botToken, appToken: cfg.slack.appToken, socketMode: true, logLevel: LogLevel.WARN });
  const sellerIds = cfg.slack.sellerIds;

  function allowed(userId) { return !sellerIds.length || sellerIds.includes(userId); }
  async function actorName(client, userId) {
    try { const u = await client.users.info({ user: userId }); return u.user.real_name || u.user.name; } catch (e) { return userId; }
  }

  app.command('/focus', async ({ command, ack, respond }) => {
    await ack();
    const text = (command.text || '').trim();
    try {
      if (!text) return respond({ response_type: 'ephemeral', blocks: B.briefBlocks(await engine.brief(), cfg.slack.consoleUrl), text: 'Your five for today' });
      if (/^help$/i.test(text)) return respond({ response_type: 'ephemeral', text: B.HELP });
      const m = text.match(/^prep\s+(.+)$/i);
      if (m) return respond({ response_type: 'ephemeral', blocks: B.prepBlocks(await engine.prep(m[1])), text: 'Exec prep' });
      return respond({ response_type: 'ephemeral', blocks: B.accountBlocks(await engine.account(text)), text });
    } catch (e) {
      return respond({ response_type: 'ephemeral', text: e.status ? e.message : 'Something went wrong. Check the server log.' });
    }
  });

  async function decide({ ack, body, client, respond }, decision) {
    await ack();
    const key = body.actions[0].value;
    if (!allowed(body.user.id)) return respond({ response_type: 'ephemeral', replace_original: false, text: 'Only the seller who owns this book can decide on picks.' });
    try {
      await engine.decide(key, { decision, actor: await actorName(client, body.user.id), via: 'slack' });
      const brief = await engine.brief();
      return respond({ replace_original: true, blocks: B.briefBlocks(brief, cfg.slack.consoleUrl), text: 'Updated' });
    } catch (e) {
      return respond({ response_type: 'ephemeral', replace_original: false, text: e.status ? e.message : 'Could not save that decision.' });
    }
  }
  app.action('focus_accept', (args) => decide(args, 'accepted'));
  app.action('focus_snooze', (args) => decide(args, 'snoozed'));
  app.action('focus_details', async ({ ack, body, respond }) => {
    await ack();
    try { await respond({ response_type: 'ephemeral', replace_original: false, blocks: B.accountBlocks(await engine.account(body.actions[0].value)), text: 'Details' }); }
    catch (e) { await respond({ response_type: 'ephemeral', replace_original: false, text: e.message }); }
  });
  app.action('focus_reject', async ({ ack, body, client, respond }) => {
    await ack();
    if (!allowed(body.user.id)) return respond({ response_type: 'ephemeral', replace_original: false, text: 'Only the seller who owns this book can decide on picks.' });
    const a = await engine.account(body.actions[0].value);
    await client.views.open({ trigger_id: body.trigger_id, view: B.rejectModal(a.key, a.name, engine.REASONS) });
  });
  app.view('focus_reject_submit', async ({ ack, body, view, client }) => {
    const reason = view.state.values.reason && view.state.values.reason.value.selected_option && view.state.values.reason.value.selected_option.value;
    if (!reason) return ack({ response_action: 'errors', errors: { reason: 'Pick a reason.' } });
    try {
      await engine.decide(view.private_metadata, { decision: 'rejected', reason, actor: await actorName(client, body.user.id), via: 'slack' });
      await ack();
      await client.chat.postMessage({ channel: body.user.id, text: `Rejected. It stays out for 14 days unless a strong new event lands. Reason: ${reason}.` });
    } catch (e) {
      await ack({ response_action: 'errors', errors: { reason: e.message } });
    }
  });
  app.error(async (err) => log('Slack error: ' + (err && err.message)));
  return app;
}

module.exports = { createSlackApp };
