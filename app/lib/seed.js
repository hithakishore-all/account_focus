'use strict';
// Loads the generated seed inputs (data/seed) and the evaluation datasets.
const fs = require('fs');
const path = require('path');

const SEED = path.join(__dirname, '..', '..', 'data', 'seed');

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(SEED, name), 'utf8'));
}

function loadInput() {
  return {
    config: readJson('config.json'),
    accounts: readJson('accounts.json'),
    signals: readJson('signals.json'),
    contacts: readJson('contacts.json'),
    drafts: readJson('drafts.json'),
    prep: readJson('prep.json'),
    catalog: readJson('catalog.json'),
    valuemap: readJson('valuemap.json'),
    feedback: []
  };
}

function loadBacktest() {
  const lines = fs.readFileSync(path.join(SEED, 'backtest.csv'), 'utf8').trim().split(/\r?\n/);
  const head = lines.shift().split(',');
  return lines.map((l) => {
    const v = l.split(',');
    const r = {};
    head.forEach((h, i) => { r[h] = ['seller', 'account'].includes(h) ? v[i] : Number(v[i]); });
    return r;
  });
}

function loadSegments() {
  return fs.readFileSync(path.join(SEED, 'gong_segments.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
}

module.exports = { loadInput, loadBacktest, loadSegments, SEED };
