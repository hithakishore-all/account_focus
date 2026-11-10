/*
 * Account Focus application engine: the rules that sit on top of a scoring run.
 * Shared by the web console, the Slack bot and the static demo page, so all three behave the same.
 * Works in Node and in the browser (no imports). A store supplies the run and persists decisions.
 */
(function (root) {
  'use strict';
  var DECISIONS = ['accepted', 'snoozed', 'rejected'];
  var REASONS = ['Already working it', 'Wrong timing', 'Bad data', 'Not my account', 'Disagree with the signal'];

  function HttpError(status, message) { var e = new Error(message); e.status = status; return e; }

  function summary(a) {
    return { key: a.key, name: a.name, motion: a.motion, industry: a.industry, region: a.region, scores: a.scores,
             action: { kind: a.action.kind, title: a.action.title, due: a.action.due }, why: a.why.text,
             why_refs: a.why.refs, slot: a.slot, rank: a.rank, rest_reason: a.rest_reason, decision: a.decision || null,
             missing_roles: Object.keys(a.roles).filter(function (r) { return a.roles[r].state === 'missing'; }) };
  }

  /* An in-memory store over a fixtures snapshot (offline mode and the static demo). */
  function createMemoryStore(run, clock) {
    var feedback = [], audit = (run.audit || []).slice(), handoffs = [];
    return {
      mode: 'offline',
      getRun: function () { return Promise.resolve(run); },
      listFeedback: function () { return Promise.resolve(feedback.slice()); },
      addFeedback: function (f) { feedback.push(f); return Promise.resolve(f); },
      listAudit: function () { return Promise.resolve(audit.slice()); },
      addAudit: function (e) { audit.push(e); return Promise.resolve(e); },
      addHandoff: function (h) { handoffs.push(h); return Promise.resolve(h); },
      reset: function () { feedback = []; audit = (run.audit || []).slice(); handoffs = []; return Promise.resolve(); },
      now: clock || function () { return new Date().toISOString(); },
      health: function () { return Promise.resolve({ ok: true }); }
    };
  }

  function createEngine(store) {
    function decisionsFor(run) {
      return store.listFeedback().then(function (list) {
        var today = run.as_of, m = {};
        list.forEach(function (f) { if (f.day === today) m[f.account] = f; });
        return m;
      });
    }
    function withDecision(a, d) {
      var c = JSON.parse(JSON.stringify(a));
      c.decision = d[a.key] || null;
      return c;
    }
    function load(key) {
      return store.getRun().then(function (run) {
        var a = run.accounts[key];
        if (!a) {
          var k = String(key || '').toLowerCase();
          var hit = Object.keys(run.accounts).map(function (x) { return run.accounts[x]; })
            .filter(function (x) { return x.key.toLowerCase() === k || x.name.toLowerCase().indexOf(k) >= 0; });
          if (hit.length === 1) a = hit[0];
          else if (hit.length > 1) throw HttpError(400, 'More than one account matches "' + key + '": ' + hit.map(function (x) { return x.name; }).join(', '));
        }
        if (!a) throw HttpError(404, 'No account matches "' + key + '".');
        return { run: run, a: a };
      });
    }
    return {
      REASONS: REASONS,
      brief: function () {
        return store.getRun().then(function (run) {
          return decisionsFor(run).then(function (d) {
            var picks = run.brief.picks.map(function (k) { return summary(withDecision(run.accounts[k], d)); });
            return { as_of: run.as_of, model: run.model, version: run.version, owner: run.owner, seller: run.seller, book_size: Object.keys(run.accounts).length,
                     picks: picks, rest: run.brief.rest.map(function (k) { return summary(withDecision(run.accounts[k], d)); }),
                     decided: picks.filter(function (p) { return p.decision; }).length, stats: run.stats };
          });
        });
      },
      account: function (key) {
        return load(key).then(function (x) { return decisionsFor(x.run).then(function (d) { return withDecision(x.a, d); }); });
      },
      prep: function (key) {
        return load(key).then(function (x) {
          if (!x.a.prep) throw HttpError(404, 'No exec prep for ' + x.a.name + ' yet. In this prototype exec prep exists for Keystone, Northstar and Pacific Crest.');
          return { account: x.a.key, name: x.a.name, prep: x.a.prep };
        });
      },
      decide: function (key, body) {
        body = body || {};
        var decision = body.decision, reason = body.reason || null, actor = body.actor || 'unknown', via = body.via || 'web';
        if (DECISIONS.indexOf(decision) < 0) return Promise.reject(HttpError(400, 'decision must be one of: ' + DECISIONS.join(', ') + '.'));
        if (decision === 'rejected' && REASONS.indexOf(reason) < 0) return Promise.reject(HttpError(400, 'A rejection needs a reason: ' + REASONS.join(', ') + '.'));
        if (decision !== 'rejected') reason = null;
        return load(key).then(function (x) {
          if (x.run.brief.picks.indexOf(x.a.key) < 0) throw HttpError(400, x.a.name + ' is not in today\'s five, so there is nothing to decide.');
          return decisionsFor(x.run).then(function (d) {
            if (d[x.a.key]) throw HttpError(409, x.a.name + ' was already ' + d[x.a.key].decision + ' today by ' + d[x.a.key].actor + '.');
            var f = { account: x.a.key, decision: decision, reason: reason, actor: actor, via: via, day: x.run.as_of, at: store.now() };
            return store.addFeedback(f).then(function () {
              return store.addAudit({ at: f.at, actor: actor, event: 'PICK_' + decision.toUpperCase(), level: 'HUMAN',
                detail: x.a.name + (reason ? ' · ' + reason : '') + ' · via ' + via });
            }).then(function () { return f; });
          });
        });
      },
      handoff: function (key, body) {
        body = body || {};
        return load(key).then(function (x) {
          var a = x.a;
          var contacts = Object.keys(a.roles).filter(function (r) { return a.roles[r].contact_id; })
            .map(function (r) { return { role: r, contact_id: a.roles[r].contact_id, name: a.roles[r].name, title: a.roles[r].title }; });
          var h = { target: 'gtm-orbit/outreach-brief', account_key: a.key, salesforce_account_id: a.salesforce_id, account_name: a.name,
                    motion: a.motion, action: a.action, why_now: a.why.text, evidence_refs: a.why.refs, contacts: contacts,
                    requested_by: body.actor || 'unknown', at: store.now() };
          return store.addHandoff(h).then(function () {
            return store.addAudit({ at: h.at, actor: h.requested_by, event: 'HANDOFF_TO_ORBIT', detail: a.name + ' · why now + ' + h.evidence_refs.length + ' evidence IDs' });
          }).then(function () { return h; });
        });
      },
      audit: function (limit) {
        return store.listAudit().then(function (l) { return l.slice().sort(function (x, y) { return x.at < y.at ? 1 : -1; }).slice(0, limit || 200); });
      },
      evaluation: function () {
        return store.getRun().then(function (run) { return Object.assign({ as_of: run.as_of, stats: run.stats }, run.evaluation || {}); });
      },
      logAudit: function (e) { return store.addAudit(Object.assign({ at: store.now() }, e)); }
    };
  }

  var api = { createEngine: createEngine, createMemoryStore: createMemoryStore, REASONS: REASONS, DECISIONS: DECISIONS, HttpError: HttpError };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FocusEngine = api;
})(typeof window !== 'undefined' ? window : this);
