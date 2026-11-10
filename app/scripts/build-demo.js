#!/usr/bin/env node
'use strict';
// Builds demo/index.html: the real console (same HTML, CSS, app.js and engine) with the fixtures
// inlined, so it runs as one file with no server. Used for GitHub Pages and the portfolio card.
const fs = require('fs');
const path = require('path');

const app = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(app, p), 'utf8');
const safe = (s) => s.replace(/<\/(script)/gi, '<\\/$1');

let html = read('public/index.html');
html = html.replace('<link rel="stylesheet" href="styles.css">', () => '<style>\n' + read('public/styles.css') + '</style>');
html = html.replace('<script src="lib/engine.js"></script>', () =>
  '<script>window.FOCUS_FIXTURES = ' + safe(JSON.stringify(require('../mock/fixtures.json'))) + ';</script>\n<script>\n' + safe(read('lib/engine.js')) + '</script>');
html = html.replace('<script src="app.js"></script>', () => '<script>\n' + safe(read('public/app.js')) + '</script>');
html = html.replace('<title>Account Focus</title>', '<title>Account Focus · demo</title>');
if (/src="(app|lib\/engine)\.js"|href="styles\.css"/.test(html)) throw new Error('an asset was not inlined');

const out = path.join(app, '..', 'demo', 'index.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('Wrote', path.relative(process.cwd(), out), `(${Math.round(html.length / 1024)} KB)`);
