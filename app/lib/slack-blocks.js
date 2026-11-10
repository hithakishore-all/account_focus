'use strict';
// Slack Block Kit layouts for the brief, one account and exec prep. Pure functions, so tests can check them.

const KIND_EMOJI = { Pursue: ':dart:', Multithread: ':busts_in_silhouette:', Rescue: ':rotating_light:', Expand: ':chart_with_upwards_trend:',
  Verify: ':mag:', Hold: ':hourglass_flowing_sand:', Deprioritize: ':zzz:', Research: ':memo:' };
const DECIDED = { accepted: ':white_check_mark: Accepted', snoozed: ':double_vertical_bar: Snoozed 3 days', rejected: ':x: Rejected' };

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function decisionButtons(key) {
  return { type: 'actions', block_id: 'focus_' + key, elements: [
    { type: 'button', text: { type: 'plain_text', text: 'Accept' }, style: 'primary', action_id: 'focus_accept', value: key },
    { type: 'button', text: { type: 'plain_text', text: 'Snooze 3 days' }, action_id: 'focus_snooze', value: key },
    { type: 'button', text: { type: 'plain_text', text: 'Reject' }, style: 'danger', action_id: 'focus_reject', value: key },
    { type: 'button', text: { type: 'plain_text', text: 'Details' }, action_id: 'focus_details', value: key }] };
}

function briefBlocks(brief, consoleUrl) {
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: 'Your five for ' + fmtDate(brief.as_of) } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${brief.owner.name} · ${brief.book_size} accounts in your book · ${brief.decided} of ${brief.picks.length} decided · fictional demo data` }] }];
  brief.picks.forEach((p, i) => {
    const label = p.slot === 'exploration' ? ':sparkles: Exploration' : `${i + 1}.`;
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn',
      text: `*${label} ${p.name}* · ${p.motion} · priority *${p.scores.P}*\n${p.why}\n${KIND_EMOJI[p.action.kind] || ''} *${p.action.kind}:* ${p.action.title}${p.action.due ? ' (due ' + fmtDate(p.action.due) + ')' : ''}` } });
    if (p.decision) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `${DECIDED[p.decision.decision]}${p.decision.reason ? ': ' + p.decision.reason : ''} by ${p.decision.actor}` }] });
    else blocks.push(decisionButtons(p.key));
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'Evidence: ' + p.why_refs.map((r) => '`' + r + '`').join(' ') }] });
  });
  blocks.push({ type: 'divider' });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn',
    text: 'Try `/focus northstar` for one account or `/focus prep keystone` for exec prep.' + (consoleUrl ? ` <${consoleUrl}|Open the console>` : '') }] });
  return blocks;
}

function accountBlocks(a) {
  const s = a.scores;
  const roles = Object.keys(a.roles).map((r) => {
    const x = a.roles[r];
    const name = r.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase());
    return `• ${name}: ${x.state === 'missing' ? '_missing_' : x.name + (x.title ? ', ' + x.title : '') + ' (' + x.state + ')'}`;
  }).join('\n');
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: a.name } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${a.industry || ''} · ${a.region} · ${a.motion} · \`${a.key}\`` }] },
    { type: 'section', fields: [
      { type: 'mrkdwn', text: `*Priority*\n${s.P == null ? 'not scored' : s.P}` },
      { type: 'mrkdwn', text: `*Attractiveness · Momentum*\n${s.A == null ? '—' : s.A} · ${s.M == null ? '—' : s.M}` },
      { type: 'mrkdwn', text: `*Readiness*\n${s.R}` }, { type: 'mrkdwn', text: `*Confidence*\n${s.C}` }] },
    { type: 'section', text: { type: 'mrkdwn', text: `*Why now*\n${a.why.text}` } },
    { type: 'section', text: { type: 'mrkdwn', text: `*${a.action.kind}:* ${a.action.title}\n${a.action.points.map((p) => '• ' + p).join('\n')}` } },
    { type: 'section', text: { type: 'mrkdwn', text: `*Buying group*\n${roles}` } }];
  if (a.gaps.length) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*Gaps*\n' + a.gaps.map((g) => `• *${g.type}.* ${g.text}`).join('\n') } });
  if (a.slot === 'ranked' || a.slot === 'exploration') {
    if (a.decision) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `${DECIDED[a.decision.decision]} by ${a.decision.actor}` }] });
    else blocks.push(decisionButtons(a.key));
  } else blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `Not in today's five: ${a.rest_reason}` }] });
  return blocks;
}

function prepBlocks(x) {
  const p = x.prep;
  const tag = (v) => (v === 'public' ? '`public`' : '`internal`');
  return [
    { type: 'header', text: { type: 'plain_text', text: 'Exec prep · ' + x.name } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `For ${p.exec}. Every line is tagged public or internal; never quote internal lines as public.` }] },
    { type: 'section', text: { type: 'mrkdwn', text: `*Point of view*\n${p.pov ? p.pov.text : '_none passed the validator_'}` } },
    { type: 'section', text: { type: 'mrkdwn', text: '*Their priorities*\n' + p.priorities.map((r, i) => `${i + 1}. ${r.text} ${tag(r.vis)}`).join('\n') } },
    { type: 'section', text: { type: 'mrkdwn', text: '*Discovery questions*\n' + p.questions.map((q, i) => `${i + 1}. ${q}`).join('\n') } },
    { type: 'section', text: { type: 'mrkdwn', text: `*Proof*\n${p.proof || '—'}` } },
    { type: 'section', text: { type: 'mrkdwn', text: '*Landmines*\n' + p.landmines.map((r) => `• ${r.text} ${tag(r.vis)}`).join('\n') } },
    { type: 'section', text: { type: 'mrkdwn', text: `*The ask*\n${p.ask}` } }];
}

function rejectModal(key, name, reasons) {
  return { type: 'modal', callback_id: 'focus_reject_submit', private_metadata: key,
    title: { type: 'plain_text', text: 'Reject pick' }, submit: { type: 'plain_text', text: 'Reject' }, close: { type: 'plain_text', text: 'Cancel' },
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `Why reject *${name}*? Your reason goes to the team that can fix it.` } },
      { type: 'input', block_id: 'reason', label: { type: 'plain_text', text: 'Reason' },
        element: { type: 'radio_buttons', action_id: 'value', options: reasons.map((r) => ({ text: { type: 'plain_text', text: r }, value: r })) } }] };
}

const HELP = '*Account Focus*\n• `/focus` your five for today\n• `/focus <account>` one account, for example `/focus northstar`\n• `/focus prep <account>` exec prep, for example `/focus prep keystone`';

module.exports = { briefBlocks, accountBlocks, prepBlocks, rejectModal, HELP, fmtDate };
