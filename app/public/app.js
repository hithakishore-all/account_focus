/* Account Focus web console. Talks to the HTTP API; the static demo swaps in the same engine in the browser. */
(function () {
  'use strict';
  var ROLE_NAMES = { economic_buyer: 'Economic buyer', champion: 'Champion', technical_evaluator: 'Technical evaluator', executive_sponsor: 'Executive sponsor' };

  /* ---------- API: HTTP, or the in-browser engine for the static demo ---------- */
  function httpApi() {
    function call(method, url, body) {
      return fetch(url, { method: method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; }); });
    }
    return {
      health: function () { return call('GET', '/api/health'); },
      brief: function () { return call('GET', '/api/brief'); },
      account: function (k) { return call('GET', '/api/accounts/' + encodeURIComponent(k)); },
      prep: function (k) { return call('GET', '/api/accounts/' + encodeURIComponent(k) + '/prep'); },
      decide: function (k, d, reason) { return call('POST', '/api/accounts/' + encodeURIComponent(k) + '/decision', { decision: d, reason: reason }); },
      handoff: function (k) { return call('POST', '/api/accounts/' + encodeURIComponent(k) + '/handoff', {}); },
      audit: function () { return call('GET', '/api/audit?limit=200'); },
      evaluation: function () { return call('GET', '/api/evaluation'); },
      reasons: function () { return call('GET', '/api/reasons'); },
      reset: function () { return call('POST', '/api/reset', {}); }
    };
  }
  function staticApi(fixtures) {
    var store = FocusEngine.createMemoryStore(fixtures, function () { return new Date().toISOString(); });
    var e = FocusEngine.createEngine(store);
    var actor = 'Alex Rivera (demo)';
    return {
      health: function () { return Promise.resolve({ ok: true, mode: 'demo', as_of: fixtures.as_of, version: fixtures.version }); },
      brief: e.brief, account: e.account, prep: e.prep,
      decide: function (k, d, reason) { return e.decide(k, { decision: d, reason: reason, actor: actor, via: 'web' }); },
      handoff: function (k) { return e.handoff(k, { actor: actor }); },
      audit: function () { return e.audit(200); }, evaluation: e.evaluation,
      reasons: function () { return Promise.resolve(FocusEngine.REASONS); },
      reset: function () { return store.reset(); }
    };
  }
  var api = window.FOCUS_FIXTURES ? staticApi(window.FOCUS_FIXTURES) : httpApi();

  /* ---------- state ---------- */
  var state = { brief: null, current: null, account: null, tab: 'signals', prepOpen: false, prep: null, handoff: null, mode: null };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var cite = function (r) { return '<button class="cite" type="button" data-ref="' + esc(r) + '">' + esc(r) + '</button>'; };
  var vis = function (v) { return '<span class="vis ' + v + '">' + v + '</span>'; };
  function fmtDay(iso) { if (!iso) return ''; var d = new Date(iso + 'T00:00:00Z'); return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove('show'); }, 3600); }
  function fail(e) { toast(e.message || 'Something went wrong.'); }

  function ring(p, explore) {
    var r = 18, c = 2 * Math.PI * r, v = p == null ? 0 : Math.max(0, Math.min(100, p));
    return '<svg class="ring" viewBox="0 0 44 44" aria-hidden="true"><circle class="track" cx="22" cy="22" r="' + r + '" fill="none" stroke-width="4"/>' +
      '<circle class="val" cx="22" cy="22" r="' + r + '" fill="none" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + (c * v / 100).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 22 22)"/>' +
      '<text x="22" y="26.5" text-anchor="middle">' + (p == null ? '—' : p) + '</text></svg>';
  }
  function decisionTag(d) { if (!d) return ''; var t = { accepted: 'Accepted', snoozed: 'Snoozed', rejected: 'Rejected' }[d.decision]; return '<span class="tag d-' + d.decision + '">' + t + '</span>'; }

  /* ---------- render ---------- */
  function renderDay() {
    var b = state.brief, s = b.stats;
    $('dayTitle').textContent = 'Good morning, ' + b.owner.name.split(' ')[0] + '. Here are your five.';
    $('daySub').innerHTML = '<b>' + fmtDay(b.as_of) + '</b> · ' + b.book_size + ' accounts in your book · scored 06:00 · model ' + esc(b.model) + ' · ' + esc(b.version);
    var needData = b.rest.filter(function (r) { return r.slot === 'verify' || r.slot === 'unscored'; }).length;
    $('tiles').innerHTML = [
      ['<b>' + b.decided + ' / ' + b.picks.length + '</b><span>picks decided</span>', ''],
      ['<b>' + s.counted + '</b><span>signals counted, ' + s.not_counted + ' from our side ignored</span>', ''],
      ['<b>' + s.removed + '</b><span>uncited claim' + (s.removed === 1 ? '' : 's') + ' removed</span>', s.removed ? 'warn' : ''],
      ['<b>' + needData + '</b><span>accounts need data</span>', needData ? 'warn' : '']
    ].map(function (t) { return '<div class="tile ' + t[1] + '">' + t[0] + '</div>'; }).join('');
  }

  function renderRail() {
    var b = state.brief;
    $('picks').innerHTML = b.picks.map(function (p, i) {
      var ex = p.slot === 'exploration';
      return '<li><button class="pick' + (ex ? ' explore' : '') + '" type="button" data-key="' + p.key + '" aria-current="' + (p.key === state.current) + '">' + ring(p.scores.P, ex) +
        '<span class="pname"><span class="n">' + (ex ? '✦' : i + 1) + '</span>' + esc(p.name) + '</span>' +
        '<span class="pwhy">' + esc(p.why) + '</span>' +
        '<span class="pmeta"><span class="tag">' + esc(p.motion) + '</span><span class="tag k-' + p.action.kind + '">' + p.action.kind + '</span>' + (ex ? '<span class="tag explore">Exploration</span>' : '') + decisionTag(p.decision) + '</span></button></li>';
    }).join('');
    $('rest').innerHTML = b.rest.map(function (r) {
      return '<li><button type="button" data-key="' + r.key + '" aria-current="' + (r.key === state.current) + '"><span class="rn">' + esc(r.name) + '</span><span class="rs">' + (r.scores.P == null ? '—' : r.scores.P) + '</span><span class="rr">' + esc(r.rest_reason || '') + '</span></button></li>';
    }).join('');
  }

  function meter(name, v, note, cls) {
    return '<div class="meter ' + (cls || '') + '"><span class="meter-name">' + name + '</span><span class="meter-val">' + (v == null ? '—' : v) + '</span><div class="bar"><i style="width:' + (v || 0) + '%"></i></div><span class="meter-note">' + esc(note) + '</span></div>';
  }

  function renderAccount() {
    var a = state.account; if (!a) return;
    var s = a.scores, comp = a.components;
    var aNote = s.A == null ? 'Not enough data' : 'Fit ' + comp.A.fit + ' · whitespace ' + comp.A.whitespace + ' · alignment ' + comp.A.alignment;
    var mNote = s.M == null ? 'Not enough data' : comp.M.events_used + ' events used' + (a.motion === 'Renewal risk' ? ' (risk signals)' : '');
    var missing = Object.keys(a.roles).filter(function (r) { return a.roles[r].state === 'missing'; }).map(function (r) { return ROLE_NAMES[r].toLowerCase(); });
    var rNote = missing.length ? 'Missing: ' + missing.join(', ') : 'All four roles mapped';
    var cNote = comp.C.length ? comp.C.join('; ') : 'Fresh data, matched speakers';
    var sigTab = '<ul class="sig">' + a.signals.map(function (x) {
      return '<li id="sig-' + esc(x.ref) + '"><div><div class="src src-' + x.source + '">' + x.source + '<span class="side ' + x.side + '">' + x.side + '</span></div><div class="meta">' + esc(x.date) + ' · ' + esc(x.type) + '</div></div>' +
        '<div><p class="txt">' + esc(x.text) + '</p>' + (x.speaker ? '<p class="who">' + esc(x.speaker) + (x.speaker_side ? ' · ' + (x.speaker_side === 'customer' ? 'customer' : 'our side') : '') + '</p>' : '') +
        '<p class="meta"><span class="mono">' + esc(x.ref) + '</span> · <span class="counted ' + x.count + '">' + ({ counted: 'counted', half: 'counted at half weight (speaker unverified)', not_counted: 'not counted: spoken by our side', context: 'context only, no score effect' })[x.count] + '</span></p></div></li>';
    }).join('') + '</ul>';
    var roleTab = '<div class="roles">' + Object.keys(a.roles).map(function (r) {
      var x = a.roles[r], label = x.state === 'engaged' ? 'Engaged' : x.state === 'mapped' ? 'Mapped, not engaged' : 'Missing';
      return '<div class="role ' + x.state + '"><b>' + ROLE_NAMES[r] + '</b><span>' + (x.name ? esc(x.name) + (x.title ? ', ' + esc(x.title) : '') : label) + '</span><small>' + (x.name ? label + (x.days_since != null ? ' · ' + x.days_since + ' days ago' : '') : 'nobody mapped yet') + '</small></div>';
    }).join('') + '</div>' + (a.blocked.length ? '<p class="blocked">Never suggested: ' + a.blocked.map(function (b) { return esc(b.name + ', ' + b.title + ' (' + b.reason + ')'); }).join('; ') + '</p>' : '') +
      '<p class="formula">Readiness counts required roles, not contacts: engaged in the last 60 days = 1, mapped = 0.5, missing = 0.</p>';
    var gapTab = a.gaps.length ? a.gaps.map(function (g) { return '<div class="gap ' + g.severity + '"><b>' + esc(g.type) + '</b><p>' + esc(g.text) + '</p><div class="cites">' + g.refs.map(cite).join('') + '</div></div>'; }).join('') : '<p class="empty">No gaps or contradictions found.</p>';
    var vTab = a.valuemap.length ? '<div class="tbl-wrap"><table class="vmap"><thead><tr><th>Their priority</th><th>Our value</th><th>Proof (fictional)</th><th>What they told us</th></tr></thead><tbody>' +
      a.valuemap.map(function (v) { return '<tr><td>' + esc(v.priority) + ' ' + vis(v.vis) + '<div class="cites">' + cite(v.ref) + '</div></td><td>' + esc(v.value_prop) + '</td><td>' + esc(v.proof) + '</td><td>' + esc(v.inside || '—') + (v.inside_ref ? '<div class="cites">' + cite(v.inside_ref) + '</div>' : '') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '<p class="empty">No stated priority matched to a value proposition yet.</p>';
    var tabs = [['signals', 'Signals', a.signals.length, sigTab], ['roles', 'Buying group', 4, roleTab], ['gaps', 'Gaps', a.gaps.length, gapTab], ['value', 'Value map', a.valuemap.length, vTab]];
    var p = a.pipeline;
    var stages = [['Signals', p.signals], ['Score', p.score], ['Pick', p.pick], ['Explain', p.explain], ['Validate', p.validate]];
    $('acct').innerHTML =
      '<div class="acct-head"><div><h2 class="acct-name">' + esc(a.name) + '</h2><p class="facts">' + esc(a.industry || '—') + ' · ' + esc(a.region) + ' · ' + (a.employees ? a.employees.toLocaleString('en-US') + ' employees' : 'employees unknown') + ' · ' + esc(a.motion) + ' · <span class="mono">' + a.key + '</span></p></div>' +
      '<div class="prio"><div class="prio-big">' + (s.P == null ? '—' : s.P) + '</div><div class="prio-lab">' + (s.P == null ? 'not scored' : 'Focus priority') + ' · baseline ' + (a.baseline_score == null ? 'none' : a.baseline_score.toFixed(2)) + '</div></div></div>' +
      '<div class="why"><span class="why-lab">Why now</span><p>' + esc(a.why.text) + '</p><div class="cites">' + a.why.refs.map(cite).join('') + '</div></div>' +
      '<div class="meters">' + meter('Attractiveness', s.A, aNote) + meter(a.motion === 'Renewal risk' ? 'Risk momentum' : 'Momentum', s.M, mNote) +
      meter('Readiness', s.R, rNote, s.R < 40 ? 'low' : '') + meter('Confidence', s.C, cNote, s.C < 50 ? 'lowc' : '') + '</div>' +
      '<p class="formula">Priority <b>= √(Attractiveness × Momentum)</b>. Readiness and Confidence choose the action; they never move the rank.</p>' +
      '<div class="pipe"><div class="pipe-head"><h3>How this pick was made</h3><button class="ghost" type="button" id="replay">Replay</button></div><ol class="stages" id="stages">' +
      stages.map(function (x, i) { return '<li class="stage ' + (i === 4 && a.why.removed.length ? 'flag' : 'done') + '"><span class="dot"></span><b>' + x[0] + '</b><span class="out">' + esc(x[1]) + '</span></li>'; }).join('') + '</ol>' +
      (a.why.removed.length ? '<p class="removed" id="removedLine">Validator removed: <s>' + esc(a.why.removed[0].text) + '</s> ' + esc(a.why.removed[0].reason.replace(/^./, function (c) { return c.toUpperCase(); })) + '.</p>' : '') + '</div>' +
      '<div class="tabs" role="tablist">' + tabs.map(function (t) { return '<button class="tab" role="tab" type="button" data-tab="' + t[0] + '" aria-selected="' + (state.tab === t[0]) + '">' + t[1] + '<span class="n">' + t[2] + '</span></button>'; }).join('') + '</div>' +
      '<div class="tabpanel" role="tabpanel">' + tabs.filter(function (t) { return t[0] === state.tab; })[0][3] + '</div>';
  }

  function renderMove() {
    var a = state.account; if (!a) return;
    var act = a.action, d = a.decision, inFive = a.slot === 'ranked' || a.slot === 'exploration';
    var dec = '';
    if (d) dec = '<p class="decided ' + d.decision + '">' + ({ accepted: 'Accepted. Added to today\'s plan.', snoozed: 'Snoozed for 3 days.', rejected: 'Rejected: ' + esc(d.reason) + '. Out for 14 days unless a strong new event lands.' })[d.decision] + ' <span class="sub">' + esc(d.actor) + '</span></p>';
    var prep = '';
    if (state.prepOpen && state.prep) prep = renderPrep(state.prep.prep);
    else if (a.prep) prep = '<div class="prep"><div class="prep-head"><h3>Exec prep</h3><span class="sub">' + esc(a.prep.exec) + '</span></div><p class="sub" style="margin-top:6px">Point of view, their priorities, questions, proof and landmines. Every line is tagged public or internal.</p><div class="actions"><button class="ghost" type="button" id="openPrep">Open exec prep</button></div></div>';
    else prep = '<div class="prep"><h3>Exec prep</h3><p class="sub" style="margin-top:6px">Not written for this account yet. In this prototype exec prep exists for Keystone, Northstar and Pacific Crest.</p></div>';
    var hand = '';
    if (inFive && act.kind !== 'Rescue') {
      hand = '<div class="handoff"><p>Hand this account to Orbit\'s outreach brief. Focus passes its why now, contacts and evidence IDs; Orbit drafts, validates and waits for your approval.</p><div><button class="ghost" type="button" id="handoff">Prepare outreach in Orbit</button></div>' +
        (state.handoff && state.handoff.account_key === a.key ? '<pre>' + esc(JSON.stringify({ target: state.handoff.target, account_key: state.handoff.account_key, action: state.handoff.action.title, why_now: state.handoff.why_now, evidence_refs: state.handoff.evidence_refs, contacts: state.handoff.contacts.map(function (c) { return c.name + ' (' + c.role + ')'; }) }, null, 2)) + '</pre>' : '') + '</div>';
    }
    $('move').innerHTML = '<p class="move-kind">' + (act.kind === 'Hold' || act.kind === 'Deprioritize' ? 'No move today' : 'Next move · ' + act.kind) + '</p>' +
      '<h2>' + esc(act.title) + '</h2><p class="who">' + esc(act.who) + (act.due ? ' · due ' + fmtDay(act.due) : '') + '</p>' +
      '<ol class="points">' + act.points.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
      (inFive ? '<div class="actions"><button class="primary" type="button" data-act="accepted"' + (d ? ' disabled' : '') + '>Accept</button><button class="ghost" type="button" data-act="snoozed"' + (d ? ' disabled' : '') + '>Snooze 3 days</button><button class="danger" type="button" data-act="rejected"' + (d ? ' disabled' : '') + '>Reject</button></div>' + dec
        : '<p class="decided info">Not in today\'s five. ' + esc(a.rest_reason || '') + '</p>') + hand + prep;
  }

  function renderPrep(p) {
    return '<div class="prep"><div class="prep-head"><h3>Exec prep · ' + esc(p.exec) + '</h3><button class="ghost" type="button" id="closePrep">Close</button></div>' +
      '<div class="prep-sec"><h3>Point of view</h3>' + (p.pov ? '<p class="pov">' + esc(p.pov.text) + '</p><div class="cites">' + p.pov.refs.map(cite).join('') + '</div>' : '<p class="sub">No point of view passed the validator.</p>') + '</div>' +
      '<div class="prep-sec"><h3>Their priorities, in their words</h3><ol>' + p.priorities.map(function (x) { return '<li>' + esc(x.text) + ' ' + vis(x.vis) + ' ' + cite(x.ref) + '</li>'; }).join('') + '</ol></div>' +
      '<div class="prep-sec"><h3>Discovery questions</h3><ol>' + p.questions.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol></div>' +
      '<div class="prep-sec"><h3>Proof</h3><p style="font-size:.9rem">' + esc(p.proof || '—') + '</p></div>' +
      '<div class="prep-sec"><h3>Landmines</h3><ul>' + p.landmines.map(function (x) { return '<li>' + esc(x.text) + ' ' + vis(x.vis) + ' ' + cite(x.ref) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="prep-sec"><h3>The ask</h3><p style="font-size:.9rem">' + esc(p.ask) + '</p></div></div>';
  }

  function renderSlack() {
    var b = state.brief;
    $('slack').innerHTML = '<div class="sl-row"><div class="sl-ava"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="16" cy="16" r="4" fill="currentColor"/></svg></div><div>' +
      '<p><span class="sl-name">Account Focus</span><span class="sl-app">APP</span><span class="sl-time">8:00 AM</span></p>' +
      '<p style="margin:4px 0 8px"><b>Your five for ' + fmtDay(b.as_of) + '</b> · ' + b.decided + ' of ' + b.picks.length + ' decided</p>' +
      b.picks.map(function (p, i) {
        var d = p.decision;
        return '<div class="sl-block"><p><b>' + (p.slot === 'exploration' ? '✦ Exploration · ' : (i + 1) + '. ') + esc(p.name) + '</b> · ' + esc(p.motion) + ' · priority <b>' + p.scores.P + '</b></p><p>' + esc(p.why) + '</p><p><b>' + p.action.kind + ':</b> ' + esc(p.action.title) + (p.action.due ? ' (due ' + fmtDay(p.action.due) + ')' : '') + '</p>' +
          (d ? '<p class="sl-ctx">' + ({ accepted: '✅ Accepted', snoozed: '⏸ Snoozed 3 days', rejected: '✖ Rejected: ' + esc(d.reason) })[d.decision] + ' by ' + esc(d.actor) + '</p>'
             : '<div class="sl-btns"><button class="sl-btn go" type="button" data-sk="' + p.key + '" data-act="accepted">Accept</button><button class="sl-btn" type="button" data-sk="' + p.key + '" data-act="snoozed">Snooze 3 days</button><button class="sl-btn no" type="button" data-sk="' + p.key + '" data-act="rejected">Reject</button><button class="sl-btn" type="button" data-sk="' + p.key + '" data-act="open">Details</button></div>') +
          '<p class="sl-ctx">Evidence: ' + p.why_refs.map(function (r) { return '<span class="sl-code">' + esc(r) + '</span>'; }).join(' ') + '</p></div>';
      }).join('') +
      '<p class="sl-ctx" style="margin-top:6px">Try <span class="sl-code">/focus northstar</span> for one account or <span class="sl-code">/focus prep keystone</span> for exec prep.</p></div></div>';
  }

  function pct(x) { return Math.round(x * 100) + '%'; }
  function renderEval(ev) {
    var bt = ev.backtest, ex = ev.extraction, g = ev.groundedness;
    $('eval').innerHTML = '<p class="eyebrow">Evaluation</p><h1>Does the ranking find accounts that convert?</h1>' +
      '<p class="eval-intro">Account Focus is judged on two separate things: whether its picks convert better than the baseline score, and whether every sentence it writes is supported by evidence. A persuasive explanation of a bad ranking is the failure we guard against. Every number below is computed by the app from the files in data/seed.</p>' +
      '<p class="disclaimer"><b>Synthetic data.</b> The backtest history and the labelled call segments are generated, with buying signals planted so extraction can be scored against known answers. They show the method, not real-world results. The generating assumptions are written in data/generate_data.py.</p>' +
      '<div class="kpis">' +
      '<article class="kpi"><span class="lab">Precision@5: picks that converted within 60 days</span><div class="cmp"><div class="focus"><span>Account Focus</span><b>' + pct(bt.precision_focus) + '</b></div><div><span>Baseline score</span><b>' + pct(bt.precision_baseline) + '</b></div></div><p class="delta">' + (bt.relative_lift >= 0 ? '+' : '') + Math.round(bt.relative_lift * 100) + '% relative · top decile ' + bt.top_decile_lift.toFixed(1) + '× <small>· ' + bt.snapshots + ' weekly snapshots, ' + bt.sellers + ' sellers</small></p></article>' +
      '<article class="kpi"><span class="lab">Call signal precision against planted labels</span><div class="cmp"><div class="focus"><span>Two-stage read (offline rules)</span><b>' + ex.two_stage_rules.precision.toFixed(2) + '</b></div><div><span>Counting tracker hits</span><b>' + ex.tracker.precision.toFixed(2) + '</b></div></div><p class="delta">Recall ' + ex.two_stage_rules.recall.toFixed(2) + ' vs ' + ex.tracker.recall.toFixed(2) + ' <small>· ' + ex.segments + ' labelled segments; live mode reads them with Cortex</small></p></article>' +
      '<article class="kpi"><span class="lab">Groundedness: sentences shown with valid evidence</span><div class="cmp"><div class="focus"><span>After the validator</span><b>100%</b></div><div><span>Before the validator</span><b>' + pct((g.sentences - g.removed) / g.sentences) + '</b></div></div><p class="delta">' + g.removed + ' uncited claim' + (g.removed === 1 ? '' : 's') + ' removed <small>· ' + g.sentences + ' drafted sentences in today\'s run</small></p></article></div>' +
      '<section class="eval-sec"><h2>How the online test works</h2><div class="steps4">' +
      '<article><b>Holdout</b><p>One in five matched accounts gets no Focus picks, so lift is measured against what sellers would have done anyway.</p></article>' +
      '<article><b>Exploration slot</b><p>One pick in five is an attractive account the model is less sure about, so it learns from more than its own favourites.</p></article>' +
      '<article><b>Separate the funnel</b><p>Accepted, acted on, meeting, opportunity and pipeline are counted separately. High acceptance with no meetings means the ranking is wrong.</p></article>' +
      '<article><b>Replayable</b><p>Every run is stored with its scoring date and version, so any past pick can be replayed exactly as it was made.</p></article></div></section>';
  }

  function renderTrail(rows) {
    $('trail').innerHTML = rows.map(function (r) { return '<tr class="' + (r.level || '') + '"><td class="t">' + esc(r.at.replace('T', ' ').slice(0, 19)) + '</td><td>' + esc(r.actor) + '</td><td class="evt">' + esc(r.event) + '</td><td>' + esc(r.detail) + '</td></tr>'; }).join('');
  }

  /* ---------- data flow ---------- */
  function refreshBrief() { return api.brief().then(function (b) { state.brief = b; renderDay(); renderRail(); renderSlack(); }); }
  function refreshTrail() { return api.audit().then(renderTrail); }
  function select(key, scroll) {
    state.current = key; state.tab = 'signals'; state.prepOpen = false; state.prep = null;
    if (state.brief) renderRail();
    return api.account(key).then(function (a) {
      state.account = a; renderAccount(); renderMove();
      if (scroll && window.innerWidth < 860) $('acct').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).catch(fail);
  }
  function reloadAccount() { return api.account(state.current).then(function (a) { state.account = a; renderAccount(); renderMove(); }); }

  function decide(key, decision, reason) {
    return api.decide(key, decision, reason).then(function () {
      var name = (state.brief.picks.filter(function (p) { return p.key === key; })[0] || {}).name || key;
      toast({ accepted: 'Accepted. ' + name + ' is in today\'s plan.', snoozed: 'Snoozed. ' + name + ' comes back in 3 days.', rejected: 'Rejected. ' + name + ' stays out for 14 days unless a strong new event lands.' }[decision]);
      return Promise.all([refreshBrief(), refreshTrail(), key === state.current ? reloadAccount() : null]);
    }).catch(fail);
  }

  var rejectKey = null;
  function askReject(key) {
    rejectKey = key;
    var p = state.brief.picks.filter(function (x) { return x.key === key; })[0];
    $('rejectTitle').textContent = 'Why reject ' + (p ? p.name : 'this pick') + '?';
    $('rejectForm').reset(); $('rejectError').hidden = true;
    $('rejectDlg').showModal();
  }

  function replay() {
    var items = Array.prototype.slice.call(document.querySelectorAll('#stages .stage')), rm = $('removedLine'), a = state.account;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    items.forEach(function (s) { s.className = 'stage'; }); if (rm) rm.hidden = true;
    (function step(i) {
      if (i > 0) items[i - 1].className = 'stage done';
      if (i === items.length) { if (a.why.removed.length) { items[4].className = 'stage flag'; if (rm) rm.hidden = false; } return; }
      items[i].className = 'stage active'; setTimeout(function () { step(i + 1); }, reduce ? 60 : 650);
    })(0);
  }

  function flashRef(ref) {
    if (state.tab !== 'signals') { state.tab = 'signals'; renderAccount(); }
    var li = document.getElementById('sig-' + ref);
    if (li) { li.classList.add('hl'); li.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function () { li.classList.remove('hl'); }, 1600); }
    else toast(ref + ' is a CRM record; in live mode it opens in Salesforce.');
  }

  var VIEWS = ['focus', 'slack', 'evaluation'];
  function setView(v) {
    if (VIEWS.indexOf(v) < 0) v = 'focus';
    VIEWS.forEach(function (n) { $('view-' + n).hidden = n !== v; });
    Array.prototype.forEach.call(document.querySelectorAll('.view-link'), function (x) { x.setAttribute('aria-current', x.dataset.view === v ? 'page' : 'false'); });
    if (v === 'evaluation') api.evaluation().then(renderEval).catch(fail);
    if (location.hash.slice(1) !== v) history.replaceState(null, '', '#' + v);
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.view) return setView(b.dataset.view);
    if (b.dataset.sk) {
      if (b.dataset.act === 'open') { setView('focus'); return select(b.dataset.sk, true); }
      return b.dataset.act === 'rejected' ? askReject(b.dataset.sk) : decide(b.dataset.sk, b.dataset.act);
    }
    if (b.dataset.key) return select(b.dataset.key, true);
    if (b.dataset.tab) { state.tab = b.dataset.tab; return renderAccount(); }
    if (b.dataset.ref) return flashRef(b.dataset.ref);
    if (b.dataset.act) return b.dataset.act === 'rejected' ? askReject(state.current) : decide(state.current, b.dataset.act);
    if (b.id === 'replay') return replay();
    if (b.id === 'openPrep') return api.prep(state.current).then(function (p) { state.prep = p; state.prepOpen = true; renderMove(); }).catch(fail);
    if (b.id === 'closePrep') { state.prepOpen = false; return renderMove(); }
    if (b.id === 'handoff') return api.handoff(state.current).then(function (h) { state.handoff = h; renderMove(); refreshTrail(); toast('Sent to Orbit\'s outreach brief with Focus context.'); }).catch(fail);
    if (b.id === 'rejectCancel') return $('rejectDlg').close();
    if (b.id === 'resetBtn') return api.reset().then(function () { state.handoff = null; return Promise.all([refreshBrief(), refreshTrail(), reloadAccount()]); }).then(function () { toast('Demo decisions cleared.'); }).catch(fail);
  });
  $('rejectForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var r = new FormData(e.target).get('reason');
    if (!r) { $('rejectError').textContent = 'Pick a reason first.'; $('rejectError').hidden = false; return; }
    $('rejectDlg').close();
    decide(rejectKey, 'rejected', r);
  });
  window.addEventListener('hashchange', function () { setView(location.hash.slice(1)); });

  /* ---------- boot ---------- */
  Promise.all([api.health(), api.reasons()]).then(function (res) {
    var h = res[0];
    state.mode = h.mode;
    var m = $('mode');
    m.textContent = h.mode === 'live' ? 'Live · Snowflake' : h.mode === 'demo' ? 'Demo · fictional data' : 'Offline · fictional data';
    m.className = 'mode' + (h.mode === 'live' ? ' live' : '');
    if (h.mode !== 'live') $('resetBtn').hidden = false;
    $('reasons').innerHTML = '<legend class="sub">Reason</legend>' + res[1].map(function (r, i) { return '<label><input type="radio" name="reason" id="reason-' + i + '" value="' + esc(r) + '"> ' + esc(r) + '</label>'; }).join('');
    return refreshBrief();
  }).then(function () {
    setView(location.hash.slice(1));
    refreshTrail();
    return select(state.brief.picks[0].key, false);
  }).catch(function (e) {
    $('acct').innerHTML = '<p class="empty">Could not load Account Focus: ' + esc(e.message) + '</p>';
    $('mode').textContent = 'Not connected';
  });
})();
