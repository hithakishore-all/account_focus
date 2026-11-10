'use strict';
// Live store: reads the latest scoring run from Snowflake and writes decisions, hand-offs and audit
// events back. Logs in as the key-pair service user (no password). The run itself is produced inside
// Snowflake by ACCOUNT_FOCUS.CORE.SP_SCORE_ALL, which runs the same core engine as offline mode.
const fs = require('fs');
const path = require('path');

function createSnowflakeStore(cfg) {
  const snowflake = require('snowflake-sdk');
  snowflake.configure({ logLevel: 'ERROR' });
  const s = cfg.snowflake;
  const conn = snowflake.createConnection({
    account: s.account, username: s.username, authenticator: 'SNOWFLAKE_JWT',
    privateKey: undefined, privateKeyPath: path.resolve(__dirname, '..', s.privateKeyPath), privateKeyPass: s.privateKeyPass,
    role: s.role, warehouse: s.warehouse, database: s.database, schema: s.schema, application: 'AccountFocus'
  });
  let ready = null;
  function connect() {
    if (!ready) ready = new Promise((resolve, reject) => conn.connect((err) => (err ? reject(err) : resolve())));
    return ready;
  }
  // Snowflake does not bind JavaScript undefined, so callers pass '' and SQL uses NULLIF.
  function q(sqlText, binds) {
    return connect().then(() => new Promise((resolve, reject) => {
      conn.execute({ sqlText, binds: (binds || []).map((b) => (b == null ? '' : b)),
        complete: (err, stmt, rows) => (err ? reject(err) : resolve(rows || [])) });
    }));
  }
  const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
  let cache = null, cachedAt = 0;

  return {
    mode: 'live',
    getRun() {
      if (cache && Date.now() - cachedAt < 60000) return Promise.resolve(cache);
      return q('SELECT PAYLOAD FROM AF_RUN ORDER BY CREATED_AT DESC LIMIT 1').then((rows) => {
        if (!rows.length) throw Object.assign(new Error('No scoring run yet. In Snowflake run: CALL ACCOUNT_FOCUS.CORE.SP_SCORE_ALL(\'scripted\');'), { status: 503 });
        cache = parse(rows[0].PAYLOAD); cachedAt = Date.now();
        return cache;
      });
    },
    listFeedback() {
      return q('SELECT ACCOUNT_KEY, DECISION, REASON, ACTOR, VIA, DAY, TO_VARCHAR(AT, \'YYYY-MM-DD"T"HH24:MI:SS"Z"\') AS AT FROM AF_FEEDBACK')
        .then((rows) => rows.map((r) => ({ account: r.ACCOUNT_KEY, decision: r.DECISION, reason: r.REASON, actor: r.ACTOR, via: r.VIA,
          day: typeof r.DAY === 'string' ? r.DAY : new Date(r.DAY).toISOString().slice(0, 10), at: r.AT })));
    },
    addFeedback(f) {
      return q('INSERT INTO AF_FEEDBACK (ACCOUNT_KEY, DECISION, REASON, ACTOR, VIA, DAY, AT) SELECT ?, ?, NULLIF(?, \'\'), ?, ?, TO_DATE(?), TO_TIMESTAMP_NTZ(?)',
        [f.account, f.decision, f.reason, f.actor, f.via, f.day, f.at.replace('Z', '')]).then(() => f);
    },
    listAudit() {
      return q('SELECT TO_VARCHAR(AT, \'YYYY-MM-DD"T"HH24:MI:SS"Z"\') AS AT, ACTOR, EVENT, LEVEL, DETAIL FROM AF_AUDIT ORDER BY AT DESC LIMIT 200')
        .then((rows) => rows.map((r) => ({ at: r.AT, actor: r.ACTOR, event: r.EVENT, level: r.LEVEL || undefined, detail: r.DETAIL })));
    },
    addAudit(e) {
      return q('INSERT INTO AF_AUDIT (AT, ACTOR, EVENT, LEVEL, DETAIL) SELECT TO_TIMESTAMP_NTZ(?), ?, ?, NULLIF(?, \'\'), ?',
        [e.at.replace('Z', ''), e.actor, e.event, e.level, e.detail]).then(() => e);
    },
    addHandoff(h) {
      return q('INSERT INTO AF_HANDOFF (ACCOUNT_KEY, PAYLOAD, AT) SELECT ?, PARSE_JSON(?), TO_TIMESTAMP_NTZ(?)',
        [h.account_key, JSON.stringify(h), h.at.replace('Z', '')]).then(() => h);
    },
    now: () => new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    health() { return q('SELECT CURRENT_ROLE() AS R, CURRENT_WAREHOUSE() AS W').then((r) => ({ ok: true, role: r[0].R, warehouse: r[0].W })); },
    close() { return new Promise((resolve) => (conn.isUp() ? conn.destroy(() => resolve()) : resolve())); }
  };
}

module.exports = { createSnowflakeStore };
