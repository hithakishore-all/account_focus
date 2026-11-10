#!/usr/bin/env node
'use strict';
// Generates snowflake/05_engine.sql: a JavaScript stored procedure that embeds app/lib/core.js verbatim,
// so Snowflake scores accounts with exactly the code that offline mode and the tests run.
//   node scripts/build-engine-sql.js          write the file
//   node scripts/build-engine-sql.js --check  exit 1 if it is out of date
const fs = require('fs');
const path = require('path');

const corePath = path.join(__dirname, '..', 'lib', 'core.js');
const core = fs.readFileSync(corePath, 'utf8').replace(/\nif \(typeof module[^\n]*\n?$/, '\n');
if (core.includes('$$')) throw new Error('core.js must not contain $$');

const wrapper = `
// ---- Snowflake wrapper: read inputs, run the engine, write the run ----
var api = AccountFocusCore();
function q(sql, binds) { return snowflake.execute({ sqlText: sql, binds: binds || [] }); }
function col(sql) { var rs = q(sql), out = []; while (rs.next()) out.push(rs.getColumnValue(1)); return out; }
function keyed(sql) { var rs = q(sql), out = {}; while (rs.next()) out[rs.getColumnValue(1)] = rs.getColumnValue(2); return out; }
var raw = keyed("SELECT K, V FROM AF_CONFIG"), config = {};
Object.keys(raw).forEach(function (k) { try { config[k] = JSON.parse(raw[k]); } catch (e) { config[k] = raw[k]; } });
var mode = (MODEL || config.model || 'scripted').toLowerCase();
if (mode !== 'scripted' && mode !== 'cortex') throw new Error("MODEL must be 'scripted' or 'cortex'");
var feedback = [], fr = q("SELECT ACCOUNT_KEY, DECISION, REASON, ACTOR, VIA, TO_VARCHAR(DAY, 'YYYY-MM-DD'), TO_VARCHAR(AT, 'YYYY-MM-DD\\"T\\"HH24:MI:SS\\"Z\\"') FROM AF_FEEDBACK");
while (fr.next()) feedback.push({ account: fr.getColumnValue(1), decision: fr.getColumnValue(2), reason: fr.getColumnValue(3), actor: fr.getColumnValue(4), via: fr.getColumnValue(5), day: fr.getColumnValue(6), at: fr.getColumnValue(7) });
var catalog = col("SELECT DATA FROM AF_CATALOG")[0] || { value_props: [], proof_points: [] };
var input = { config: config, accounts: col("SELECT DATA FROM AF_ACCOUNT ORDER BY K"), signals: col("SELECT DATA FROM AF_SIGNAL ORDER BY K"),
  contacts: col("SELECT DATA FROM AF_CONTACT ORDER BY K"), valuemap: col("SELECT DATA FROM AF_VALUEMAP ORDER BY K"),
  drafts: keyed("SELECT ACCOUNT_KEY, DATA FROM AF_DRAFT"), prep: keyed("SELECT ACCOUNT_KEY, DATA FROM AF_PREP"), catalog: catalog, feedback: feedback };
var hooks = { modelName: mode === 'cortex' ? 'cortex:' + config.cortex_model : 'scripted' }, modelErrors = 0;
if (mode === 'cortex') {
  hooks.draftWhyNow = function (a, signals, s, kind) {
    var evidence = signals.slice(0, 12).map(function (x) { return '[' + x.ref + '] ' + x.date + ' ' + x.type + ': ' + x.text + (x.speaker ? ' (' + x.speaker + ')' : ''); }).join('\\n');
    var prompt = 'You write the one-sentence "why now" for a B2B seller about the account ' + a.name + ' (' + a.motion + ', next action: ' + kind + ').\\n' +
      'Use only the evidence below. Every sentence must cite the evidence IDs it relies on. Do not invent facts.\\n' +
      'Return only JSON: [{"text": "...", "refs": ["ID", ...]}] with one or two sentences.\\nEvidence:\\n' + evidence;
    try {
      var rs = q("SELECT SNOWFLAKE.CORTEX.COMPLETE(?, ?)", [config.cortex_model, prompt]); rs.next();
      var t = String(rs.getColumnValue(1)), i = t.indexOf('['), j = t.lastIndexOf(']');
      return JSON.parse(t.slice(i, j + 1));
    } catch (e) { modelErrors++; return null; }
  };
}
var run = api.buildRun(input, hooks);
run.evaluation = { backtest: api.backtest(col("SELECT DATA FROM AF_BACKTEST")), extraction: api.extraction(col("SELECT DATA FROM AF_SEGMENT")),
  groundedness: { sentences: run.stats.sentences, removed: run.stats.removed } };
if (modelErrors) run.audit.push({ at: run.as_of + 'T06:02:40Z', actor: 'focus', event: 'MODEL_FALLBACK', level: 'WARN', detail: modelErrors + ' model calls failed; scripted wording used instead' });
q("INSERT INTO AF_RUN (AS_OF, VERSION, MODEL, PAYLOAD) SELECT TO_DATE(?), ?, ?, PARSE_JSON(?)", [run.as_of, run.version, run.model, JSON.stringify(run)]);
var runId = col("SELECT MAX(RUN_ID) FROM AF_RUN")[0];
var scoreRows = Object.keys(run.accounts).map(function (k) { var a = run.accounts[k];
  return { key: a.key, name: a.name, motion: a.motion, A: a.scores.A, M: a.scores.M, R: a.scores.R, C: a.scores.C, P: a.scores.P,
           action: a.action.kind, slot: a.slot, rank: a.rank, why: a.why.text, refs: a.why.refs }; });
q("INSERT INTO AF_SCORE SELECT ?, TO_DATE(?), f.value:key::STRING, f.value:name::STRING, f.value:motion::STRING, f.value:A::NUMBER, f.value:M::NUMBER, " +
  "f.value:R::NUMBER, f.value:C::NUMBER, f.value:P::NUMBER, f.value:action::STRING, f.value:slot::STRING, f.value:rank::NUMBER, f.value:why::STRING, f.value:refs::ARRAY " +
  "FROM TABLE(FLATTEN(INPUT => PARSE_JSON(?))) f", [runId, run.as_of, JSON.stringify(scoreRows)]);
q("INSERT INTO AF_AUDIT (AT, ACTOR, EVENT, LEVEL, DETAIL) SELECT CURRENT_TIMESTAMP()::TIMESTAMP_NTZ, f.value:actor::STRING, f.value:event::STRING, f.value:level::STRING, f.value:detail::STRING " +
  "FROM TABLE(FLATTEN(INPUT => PARSE_JSON(?))) f", [JSON.stringify(run.audit)]);
return { run_id: runId, as_of: run.as_of, model: run.model, picks: run.brief.picks, removed_claims: run.stats.removed, model_errors: modelErrors };
`;

const sql = `-- Account Focus · 05 engine. GENERATED by app/scripts/build-engine-sql.js from app/lib/core.js. Do not edit by hand.
-- Creates SP_SCORE_ALL(MODEL): reads the inputs, scores every account, builds the brief, validates the wording,
-- and writes one run to AF_RUN (plus AF_SCORE rows and audit events).
--   CALL ACCOUNT_FOCUS.CORE.SP_SCORE_ALL('scripted');   -- scripted wording, works on any account including trials
--   CALL ACCOUNT_FOCUS.CORE.SP_SCORE_ALL('cortex');     -- why-now drafted by Cortex COMPLETE, then validated
USE ROLE ACCOUNT_FOCUS_ADMIN;
USE WAREHOUSE ACCOUNT_FOCUS_WH;
USE SCHEMA ACCOUNT_FOCUS.CORE;

CREATE OR REPLACE PROCEDURE SP_SCORE_ALL(MODEL STRING)
RETURNS VARIANT
LANGUAGE JAVASCRIPT
EXECUTE AS OWNER
COMMENT = 'Account Focus scoring run. Same engine as the Node app (app/lib/core.js).'
AS
$$
${core}${wrapper}$$;

-- Nightly run at 06:00 Pacific on weekdays. Created suspended; resume it when you want it to run.
CREATE OR REPLACE TASK AF_NIGHTLY
  WAREHOUSE = ACCOUNT_FOCUS_WH
  SCHEDULE = 'USING CRON 0 6 * * MON-FRI America/Los_Angeles'
  COMMENT = 'Rescore Account Focus every weekday morning'
AS CALL SP_SCORE_ALL('scripted');
-- ALTER TASK AF_NIGHTLY RESUME;
`;

const out = path.join(__dirname, '..', '..', 'snowflake', '05_engine.sql');
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (cur !== sql) { console.error('snowflake/05_engine.sql is out of date. Run: npm run engine-sql'); process.exit(1); }
  console.log('05_engine.sql is up to date.');
} else {
  fs.writeFileSync(out, sql);
  console.log('Wrote', path.relative(process.cwd(), out));
}
