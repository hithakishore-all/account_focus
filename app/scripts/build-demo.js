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

// Walkthrough video with clickable chapters above the live console (chapters come from scripts/video/record.py).
const chaptersFile = path.join(app, '..', 'docs', 'video', 'chapters.json');
const VIDEO = 'https://hithakishore-all.github.io/img/account-focus-walkthrough.mp4';
const POSTER = 'https://hithakishore-all.github.io/img/account-focus-walkthrough-poster.jpg';
if (fs.existsSync(chaptersFile)) {
  const chapters = JSON.parse(fs.readFileSync(chaptersFile, 'utf8'));
  const color = { Alex: 'var(--accent)', 'Account Focus': 'var(--explore)', Dev: 'var(--human)' };
  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const items = chapters.map((c, i) => {
    const title = i === 0 ? 'What Account Focus is' : i === chapters.length - 1 ? 'Where to try it' : c.title;
    return `<li><button type="button" data-t="${Math.max(0, c.t).toFixed(1)}"><span class="wt-time">${mmss(Math.max(0, c.t))}</span><span class="wt-who" style="color:${color[c.persona] || 'var(--ink-3)'}">${esc(c.persona)}</span><span class="wt-title">${esc(title)}</span></button></li>`;
  }).join('');
  const section = `
<section class="wt gutter" aria-labelledby="wt-h">
  <div class="wt-grid">
    <div class="wt-vid"><video id="wt-video" controls playsinline preload="metadata" poster="${POSTER}" src="${VIDEO}"></video></div>
    <div class="wt-side">
      <h2 id="wt-h">Watch the walkthrough</h2>
      <p class="sub">The console below, driven end to end, then the real Slack bot and the hand-off into GTM Orbit. About 3¾ minutes, no sound: captions explain each step. Click a chapter to jump.</p>
      <ol class="wt-chapters" id="wt-chapters">${items}</ol>
    </div>
  </div>
  <div class="wt-try"><h2>Try it yourself</h2><p class="sub">The same console with the same fictional book of 25 accounts. Click a pick, open the evidence, accept or reject. Nothing leaves your browser.</p></div>
</section>`;
  const style = `<style>
.wt { padding-block: 22px 4px; }
.wt-grid { display: grid; grid-template-columns: minmax(0, 1.9fr) minmax(260px, 1fr); gap: 18px; align-items: start; }
.wt-vid video { display: block; width: 100%; aspect-ratio: 16 / 10; border-radius: 14px; background: #0b141a; box-shadow: var(--shadow); }
.wt-side { display: grid; gap: 8px; }
.wt-side h2, .wt-try h2 { font-size: 1.15rem; }
.wt-chapters { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 2px; max-height: 470px; overflow-y: auto; }
.wt-chapters button { width: 100%; text-align: left; display: grid; grid-template-columns: 42px 98px minmax(0, 1fr); gap: 8px; align-items: baseline; border: 0; background: none; border-radius: 8px; padding: 6px 8px; font-size: .9rem; }
.wt-chapters button:hover { background: var(--panel-2); }
.wt-chapters button[aria-current="true"] { background: var(--accent-soft); }
.wt-time { font: 500 .78rem var(--mono); color: var(--ink-3); font-variant-numeric: tabular-nums; }
.wt-who { font-size: .8rem; font-weight: 600; }
.wt-try { margin-top: 26px; padding-top: 18px; border-top: 1px solid var(--line); display: grid; gap: 4px; }
@media (max-width: 900px) { .wt-grid { grid-template-columns: minmax(0, 1fr); } .wt-chapters { max-height: none; } }
</style>`;
  const script = `<script>
(function () {
  var v = document.getElementById('wt-video'), bs = Array.prototype.slice.call(document.querySelectorAll('#wt-chapters button'));
  bs.forEach(function (b) { b.addEventListener('click', function () { v.currentTime = Number(b.dataset.t) + 0.05; v.play().catch(function () {}); }); });
  v.addEventListener('timeupdate', function () {
    var cur = 0; bs.forEach(function (b, i) { if (v.currentTime >= Number(b.dataset.t)) cur = i; });
    bs.forEach(function (b, i) { b.setAttribute('aria-current', String(i === cur)); });
  });
})();
</script>`;
  html = html.replace('</header>', () => '</header>' + section);
  html = html.replace('</head>', () => style + '\n</head>');
  html = html.replace('</body>', () => script + '\n</body>');
}
if (/src="(app|lib\/engine)\.js"|href="styles\.css"/.test(html)) throw new Error('an asset was not inlined');

const out = path.join(app, '..', 'demo', 'index.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('Wrote', path.relative(process.cwd(), out), `(${Math.round(html.length / 1024)} KB)`);
