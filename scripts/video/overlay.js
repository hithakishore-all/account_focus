/* Walkthrough overlay: caption card, highlight box, cursor and title card, injected into every page load.
   Everything is prefixed fw- so it never collides with the app's own CSS. */
(function () {
  if (window.top !== window) return;
  var css = `
  #fw-cap{position:fixed;left:24px;bottom:24px;width:480px;z-index:2147483600;background:#0f1d2b;color:#eef3f5;border-radius:14px;
    border-left:6px solid var(--fw-c,#4dc2c8);padding:14px 18px 16px;box-shadow:0 18px 40px rgba(5,12,20,.35);font:15px/1.45 "Source Sans 3",system-ui,sans-serif;
    opacity:0;transform:translateY(10px);transition:opacity .35s ease,transform .35s ease;pointer-events:none}
  #fw-cap.fw-on{opacity:1;transform:none}
  #fw-cap .fw-meta{font:500 12px "JetBrains Mono",ui-monospace,monospace;color:#f5b301;letter-spacing:.04em}
  #fw-cap .fw-title{font:600 19px/1.25 "Sora",system-ui,sans-serif;margin:4px 0 4px;letter-spacing:-.01em}
  #fw-cap .fw-body{color:#c9d5da}
  #fw-hl{position:fixed;z-index:2147483500;border:3px solid #f5b301;border-radius:10px;box-shadow:0 0 0 6px rgba(245,179,1,.18),0 0 28px rgba(245,179,1,.35);
    pointer-events:none;opacity:0;transition:left .5s ease,top .5s ease,width .5s ease,height .5s ease,opacity .3s ease}
  #fw-hl.fw-on{opacity:1}
  #fw-hl .fw-tab{position:absolute;left:-3px;top:-30px;background:#f5b301;color:#1b1400;font:600 12px "JetBrains Mono",ui-monospace,monospace;
    padding:5px 9px;border-radius:7px 7px 7px 0;white-space:nowrap}
  #fw-hl.fw-below .fw-tab{top:auto;bottom:-30px;border-radius:0 7px 7px 7px}
  #fw-cur{position:fixed;z-index:2147483647;width:26px;height:30px;left:640px;top:420px;pointer-events:none;transition:left .75s cubic-bezier(.3,.7,.2,1),top .75s cubic-bezier(.3,.7,.2,1);
    filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))}
  #fw-cur.fw-hide{opacity:0}
  .fw-ripple{position:fixed;z-index:2147483646;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #f5b301;pointer-events:none;animation:fw-rip .6s ease-out forwards}
  @keyframes fw-rip{to{transform:scale(3.4);opacity:0}}
  #fw-card{position:fixed;inset:0;z-index:2147483640;display:grid;place-items:center;text-align:center;color:#eef3f5;
    background:radial-gradient(1200px 600px at 20% 10%,#14535a 0%,transparent 60%),radial-gradient(900px 600px at 90% 90%,#5a2c10 0%,transparent 55%),#0b141a;
    opacity:0;transition:opacity .6s ease;pointer-events:none;font-family:"Source Sans 3",system-ui,sans-serif}
  #fw-card.fw-on{opacity:1}
  #fw-card .fw-inner{max-width:820px;padding:0 40px}
  #fw-card .fw-logo{display:inline-flex;align-items:center;gap:12px;font:600 18px "Sora",system-ui,sans-serif;color:#9fd9dc}
  #fw-card h1{font:700 64px/1.05 "Sora",system-ui,sans-serif;letter-spacing:-.03em;margin:22px 0 14px}
  #fw-card .fw-tag{font:500 24px/1.35 "Sora",system-ui,sans-serif;color:#f0914f}
  #fw-card p.fw-one{font-size:20px;color:#c9d5da;margin:18px auto 0;max-width:700px}
  #fw-card .fw-small{margin-top:30px;font:500 13px "JetBrains Mono",ui-monospace,monospace;color:#8aa1a8;letter-spacing:.06em}`;
  function boot() {
    if (document.getElementById('fw-cap')) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var cap = document.createElement('div'); cap.id = 'fw-cap';
    cap.innerHTML = '<div class="fw-meta"></div><div class="fw-title"></div><div class="fw-body"></div>';
    var hl = document.createElement('div'); hl.id = 'fw-hl'; hl.innerHTML = '<span class="fw-tab"></span>';
    var cur = document.createElement('div'); cur.id = 'fw-cur';
    cur.innerHTML = '<svg viewBox="0 0 26 30" width="26" height="30"><path d="M3 2 L3 24 L9 18.5 L13 27.5 L17 25.8 L13 17 L21 17 Z" fill="#fff" stroke="#0f1d2b" stroke-width="2" stroke-linejoin="round"/></svg>';
    var card = document.createElement('div'); card.id = 'fw-card';
    [cap, hl, cur, card].forEach(function (n) { document.body.appendChild(n); });
    try {
      var s = JSON.parse(localStorage.getItem('fw-state') || '{}');
      if (s.cap) { fill(s.cap); cap.classList.add('fw-on'); }
      if (s.cur) { cur.style.transition = 'none'; cur.style.left = s.cur[0] + 'px'; cur.style.top = s.cur[1] + 'px'; requestAnimationFrame(function () { cur.style.transition = ''; }); }
    } catch (e) {}
  }
  function save(k, v) { try { var s = JSON.parse(localStorage.getItem('fw-state') || '{}'); s[k] = v; localStorage.setItem('fw-state', JSON.stringify(s)); } catch (e) {} }
  function fill(c) {
    var cap = document.getElementById('fw-cap');
    cap.style.setProperty('--fw-c', c.color);
    cap.querySelector('.fw-meta').textContent = c.meta;
    cap.querySelector('.fw-title').textContent = c.title;
    cap.querySelector('.fw-body').textContent = c.body;
  }
  window.__fw = {
    cap: function (c) { boot(); var cap = document.getElementById('fw-cap'); cap.classList.remove('fw-on');
      setTimeout(function () { fill(c); cap.classList.add('fw-on'); }, 180); save('cap', c); },
    nocap: function () { boot(); document.getElementById('fw-cap').classList.remove('fw-on'); save('cap', null); },
    cur: function (x, y) { boot(); var c = document.getElementById('fw-cur'); c.style.left = x + 'px'; c.style.top = y + 'px'; save('cur', [x, y]); },
    ripple: function (x, y) { var r = document.createElement('div'); r.className = 'fw-ripple'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.body.appendChild(r); setTimeout(function () { r.remove(); }, 700); },
    hl: function (r, label) { boot(); var h = document.getElementById('fw-hl'), pad = 6;
      h.style.left = (r.x - pad) + 'px'; h.style.top = (r.y - pad) + 'px'; h.style.width = (r.width + 2 * pad) + 'px'; h.style.height = (r.height + 2 * pad) + 'px';
      h.querySelector('.fw-tab').textContent = label; h.classList.toggle('fw-below', r.y < 110); h.classList.add('fw-on'); },
    nohl: function () { boot(); document.getElementById('fw-hl').classList.remove('fw-on'); },
    card: function (c) { boot(); var k = document.getElementById('fw-card');
      k.innerHTML = '<div class="fw-inner"><div class="fw-logo"><svg viewBox="0 0 32 32" width="34" height="34"><circle cx="16" cy="16" r="11" fill="none" stroke="#4dc2c8" stroke-width="2.6"/><circle cx="16" cy="16" r="4" fill="#eef3f5"/><circle cx="26" cy="9" r="3.4" fill="#f0914f"/></svg>' + c.logo + '</div>' +
        '<h1>' + c.title + '</h1><div class="fw-tag">' + c.tag + '</div><p class="fw-one">' + c.one + '</p><div class="fw-small">' + c.small + '</div></div>';
      k.classList.add('fw-on'); document.getElementById('fw-cur').classList.add('fw-hide'); },
    nocard: function () { boot(); document.getElementById('fw-card').classList.remove('fw-on'); document.getElementById('fw-cur').classList.remove('fw-hide'); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
