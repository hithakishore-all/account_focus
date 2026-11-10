#!/usr/bin/env python3
"""Record the captioned Account Focus walkthrough from the real app.

  make video                 (or: python3 scripts/video/record.py)
Starts the app offline on a free port, drives it with Playwright, captures the Chrome screencast,
and encodes scripts/video/out/account-focus-walkthrough.mp4 plus a poster and chapters.json.
Optional: FOCUS_FONT_DIR=<folder with @fontsource packages> when Google Fonts cannot be reached.
"""
import asyncio, base64, json, os, shutil, socket, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(HERE, "out")
FRAMES = os.path.join(OUT, "frames")
W, H = 1280, 800

ALEX = ("Alex", "account executive", "#4dc2c8")
ENGINE = ("Account Focus", "the engine", "#a99dff")
REVOPS = ("Dev", "RevOps", "#f0914f")
TOTAL = 16

def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p

def font_css(font_dir):
    faces = [("Sora", "sora", [500, 600, 700]), ("Source Sans 3", "source-sans-3", [400, 500, 600, 700]), ("JetBrains Mono", "jetbrains-mono", [400, 500])]
    css, files = [], {}
    for fam, pkg, weights in faces:
        for w in weights:
            name = f"{pkg}-latin-{w}-normal.woff2"
            files[name] = os.path.join(font_dir, "node_modules", "@fontsource", pkg, "files", name)
            css.append(f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{w};font-display:block;src:url(https://fonts.gstatic.com/local/{name}) format('woff2')}}")
    return "\n".join(css), files

class Recorder:
    def __init__(self):
        self.frames, self.chapters, self.n, self.t0 = [], [], 0, None
    async def start(self, page):
        self.cdp = await page.context.new_cdp_session(page)
        self.cdp.on("Page.screencastFrame", self.on_frame)
        await self.cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 92, "maxWidth": W, "maxHeight": H})
    def on_frame(self, ev):
        now = time.monotonic()
        if self.t0 is None: self.t0 = now
        self.n += 1
        path = os.path.join(FRAMES, f"{self.n:06d}.jpg")
        with open(path, "wb") as f: f.write(base64.b64decode(ev["data"]))
        self.frames.append((now - self.t0, path))
        asyncio.ensure_future(self.cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]}))
    async def stop(self):
        await self.cdp.send("Page.stopScreencast"); self.end = time.monotonic() - self.t0
    def mark(self, title, persona):
        self.chapters.append({"t": round(time.monotonic() - (self.t0 or time.monotonic()), 2), "title": title, "persona": persona[0], "role": persona[1], "color": persona[2]})

async def main():
    shutil.rmtree(OUT, ignore_errors=True); os.makedirs(FRAMES)
    port = free_port()
    server = subprocess.Popen(["node", os.path.join(ROOT, "app", "server.js"), "--offline", "--no-slack", f"--port={port}"], stdout=subprocess.PIPE)
    base = f"http://127.0.0.1:{port}"
    for _ in range(50):
        try: urllib.request.urlopen(base + "/api/health"); break
        except Exception: time.sleep(0.2)
    urllib.request.urlopen(urllib.request.Request(base + "/api/reset", data=b"{}", headers={"content-type": "application/json"}, method="POST"))
    rec = Recorder(); step = [0]
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            ctx = await browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1, color_scheme="light")
            await ctx.add_init_script(path=os.path.join(HERE, "overlay.js"))
            fd = os.environ.get("FOCUS_FONT_DIR")
            if fd:
                css, files = font_css(fd)
                await ctx.route("**/fonts.googleapis.com/**", lambda r: r.fulfill(status=200, content_type="text/css", body=css))
                async def gstatic(r):
                    name = r.request.url.rsplit("/", 1)[-1]
                    if name in files: await r.fulfill(status=200, content_type="font/woff2", body=open(files[name], "rb").read())
                    else: await r.abort()
                await ctx.route("**/fonts.gstatic.com/**", gstatic)
            page = await ctx.new_page()
            await page.goto(base + "/#focus"); await page.wait_for_load_state("networkidle"); await page.wait_for_timeout(800)
            fw = lambda js, *a: page.evaluate(js, *a)

            async def cap(persona, title, body):
                step[0] += 1
                rec.mark(title, persona)
                await fw("c => window.__fw.cap(c)", {"color": persona[2], "meta": f"{step[0]:02d} / {TOTAL} · {persona[0]} · {persona[1]}", "title": title, "body": body})
                await page.wait_for_timeout(700)
            async def to(loc):
                await loc.scroll_into_view_if_needed()
                b = await loc.bounding_box()
                x = b["x"] + (b["width"] / 2 if b["width"] < 160 else 60); y = b["y"] + min(b["height"] / 2, 22)
                await fw("([x, y]) => window.__fw.cur(x, y)", [x, y]); await page.wait_for_timeout(850)
                return x, y
            async def click(loc, settle=900):
                x, y = await to(loc)
                await fw("([x, y]) => window.__fw.ripple(x, y)", [x, y]); await page.wait_for_timeout(250)
                await loc.click(); await page.wait_for_load_state("networkidle"); await page.wait_for_timeout(settle)
            async def show(loc, label, secs, top=96, scroll=True):
                if scroll:
                    await loc.evaluate("(e, top) => { const r = e.getBoundingClientRect(); if (r.top < top || r.bottom > innerHeight - 200) window.scrollTo({ top: scrollY + r.top - top, behavior: 'smooth' }); }", top)
                    await page.wait_for_timeout(300)
                # wait until scrolling has stopped, so the box is measured where the element really is
                await page.wait_for_function("() => new Promise(r => { let a = scrollY; setTimeout(() => r(Math.abs(scrollY - a) < 1), 150); })", timeout=5000)
                await page.wait_for_timeout(150)
                b = await loc.bounding_box()
                await fw("([r, l]) => window.__fw.hl(r, l)", [b, label])
                await page.wait_for_timeout(int(secs * 1000))
            async def nohl(): await fw("() => window.__fw.nohl()")
            async def top_of_page(): await fw("() => window.scrollTo({ top: 0, behavior: 'smooth' })"); await page.wait_for_timeout(600)

            await rec.start(page)
            # Title card
            rec.mark("Account Focus", ENGINE)
            await fw("c => window.__fw.card(c)", {"logo": "GTM Orbit", "title": "Account Focus", "tag": "Five accounts a day, why now, and the next move.",
                "one": "The daily decision layer inside GTM Orbit. It turns shared account signals into focused seller action, and every recommendation links to its evidence.",
                "small": "NO SOUND · ALL DATA IS FICTIONAL · SALESFORCE · GONG · SNOWFLAKE · SLACK"})
            await page.wait_for_timeout(5200)
            await fw("() => window.__fw.nocard()"); await page.wait_for_timeout(900)

            # 1 the five
            await cap(ALEX, "Five picks, not fifty", "Alex owns 25 accounts. Each morning Focus ranks them by attractiveness × momentum and brings forward five.")
            await show(page.locator(".rail .picks"), "Today's five", 4.2, scroll=False)
            # 2 why now
            await cap(ALEX, "Why now, with evidence", "Each pick explains itself in one sentence. The chips are the evidence: a Gong moment, an earnings call, a news item.")
            await show(page.locator(".why"), "Why now · 3 sources", 4.6, scroll=False)
            # 3 four numbers
            await cap(ENGINE, "Four numbers, not one", "Attractiveness and momentum set the rank. Readiness and confidence choose the action, so a hot account is never buried.")
            await show(page.locator(".meters"), "A 85 · M 91 · R 88 · C 92", 4.8)
            # 4 replay
            await cap(ENGINE, "Every pick shows its working", "Signals are read, scored, picked, explained, then validated. Replay runs the five stages.")
            await click(page.locator("#replay"), settle=200)
            await show(page.locator("#stages"), "Signals → Validate", 4.2, top=150)
            # 5 validator
            await cap(ENGINE, "Uncited claims are removed", "The draft said Keystone was leaving its current vendor. No evidence supports that, so the validator took it out.")
            await show(page.locator("#removedLine"), "Validator · 1 claim removed", 5.0, top=170)
            await nohl()
            # 6 check the evidence
            await cap(ALEX, "Evidence you can check", "Clicking a chip jumps to the source. The CFO said it herself, on a call, and only customer-spoken lines count.")
            await top_of_page()
            await click(page.locator(".why .cite").first, settle=1200)
            await show(page.locator('[id="sig-GONG-9120#4"]'), "Gong · CFO · counted", 4.2)
            # 7 exec prep
            await nohl(); await top_of_page()
            await cap(ALEX, "Exec prep, public vs internal", "A point of view, her priorities in her own words, questions and landmines. Every line says whether it is public.")
            await click(page.locator("#openPrep"))
            await page.locator("#move").evaluate("e => e.scrollTo({ top: e.scrollHeight, behavior: 'smooth' })"); await page.wait_for_timeout(700)
            await show(page.locator(".prep-sec").nth(1), "Public · internal tags", 5.0, scroll=False)
            # 8 accept and hand off
            await nohl()
            await cap(ALEX, "Accept, then hand off to Orbit", "Alex accepts the pick. Prepare outreach passes the why now, contacts and evidence IDs to Orbit's brief flow.")
            await click(page.locator("#closePrep"), settle=500)
            await page.locator("#move").evaluate("e => e.scrollTo({ top: 0 })")
            await click(page.locator('#move button[data-act="accepted"]'), settle=1100)
            await click(page.locator("#handoff"), settle=900)
            await show(page.locator(".handoff pre"), "Hand-off · evidence IDs", 4.6, scroll=False)
            # 9 hot account wrong people
            await nohl(); await top_of_page()
            await cap(ALEX, "Hot account, wrong people", "Northstar is moving fast, but nobody who owns the budget has joined a call. Focus says multithread, not drop it.")
            await click(page.locator('button.pick[data-key="GTM-0001"]'))
            await show(page.locator(".meter").nth(2), "Readiness 38 · Multithread", 4.6)
            # 10 gaps
            await nohl()
            await cap(ENGINE, "Gaps found for you", "Every customer statement comes from one person, and the opportunity's next step has been open 17 days.")
            await click(page.locator('button.tab[data-tab="gaps"]'), settle=600)
            await show(page.locator(".tabpanel"), "Single-threaded · stalled next step", 4.6)
            # 11 contradiction
            await nohl(); await top_of_page()
            await cap(ENGINE, "Contradictions surface", "Pacific Crest's CEO is consolidating vendors from 14 to 5. Our open proposal is an add-on. Reframe it.")
            await click(page.locator('button.pick[data-key="GTM-0011"]'))
            await click(page.locator('button.tab[data-tab="gaps"]'), settle=600)
            await show(page.locator(".gap.high").first, "Narrative mismatch", 4.6)
            # 12 tracker trap
            await nohl(); await top_of_page()
            await cap(ENGINE, "Our own questions don't count", "Copperline had nine budget and pricing tracker hits. All nine were questions from our rep, so momentum is zero.")
            await click(page.locator('.rest button[data-key="GTM-0017"]'))
            await show(page.locator('[id="sig-GONG-8955#3"]'), "Not counted · our side", 4.8)
            # 13 unknown is not low
            await nohl(); await top_of_page()
            await cap(ENGINE, "Unknown is not low", "Quarry & Pine has no baseline score and no calls. It is marked not scored and sent for research, never ranked low.")
            await click(page.locator('.rest button[data-key="GTM-0007"]'))
            await show(page.locator(".acct-head"), "Not scored · research first", 4.2, scroll=False)
            # 14 reject with a reason
            await nohl()
            await cap(ALEX, "Reject with a reason", "Alex passes on Juniper Ridge for now. The reason goes to the team that can fix it, and the account rests for 14 days.")
            await click(page.locator('button.pick[data-key="GTM-0002"]'))
            await click(page.locator('#move button[data-act="rejected"]'), settle=600)
            await click(page.locator("#reason-1"), settle=400)
            await click(page.locator("#rejectForm button.danger"), settle=1000)
            await show(page.locator('button.pick[data-key="GTM-0002"]'), "Rejected · back in 14 days", 3.6, scroll=False)
            # 15 slack
            await nohl()
            await cap(ALEX, "The same brief in Slack", "At 8:00 the five arrive as a Slack message. Decisions made there and in the console stay in sync.")
            await click(page.locator('button.view-link[data-view="slack"]'))
            await show(page.locator(".sl-block").nth(0), "Accepted in the console", 4.4)
            # 16 evaluation
            await nohl(); await top_of_page()
            await cap(REVOPS, "Proof, not persuasion", "RevOps checks the ranking against the baseline and the wording against its evidence. Every number is computed by the app.")
            await click(page.locator('button.view-link[data-view="evaluation"]'))
            await show(page.locator(".kpis"), "Precision@5 · signal precision · groundedness", 5.6)
            await nohl()
            await click(page.locator('button.view-link[data-view="focus"]'), settle=600)
            await fw("() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })"); await page.wait_for_timeout(900)
            await show(page.locator(".trail"), "Audit trail · every decision", 4.6, scroll=False)
            # closing card
            await nohl(); await fw("() => window.__fw.nocap()")
            rec.mark("Try it yourself", ENGINE)
            await fw("c => window.__fw.card(c)", {"logo": "GTM Orbit", "title": "Account Focus", "tag": "Try it: hithakishore-all.github.io/account-focus",
                "one": "Code, Snowflake scripts, Slack bot and docs: github.com/hithakishore-all/account-focus",
                "small": "FICTIONAL DATA · 20 AUTOMATED TESTS · RUNS OFFLINE WITH ONE COMMAND"})
            await page.wait_for_timeout(5000)
            await rec.stop()
            await browser.close()
    finally:
        server.terminate()
    with open(os.path.join(OUT, "chapters.json"), "w") as f: json.dump(rec.chapters, f, indent=1)
    with open(os.path.join(OUT, "timeline.json"), "w") as f: json.dump({"frames": len(rec.frames), "end": rec.end}, f)
    encode(rec)

def encode(rec):
    lines = ["ffconcat version 1.0"]
    fr = rec.frames
    for i, (t, path) in enumerate(fr):
        nxt = fr[i + 1][0] if i + 1 < len(fr) else rec.end
        lines += [f"file '{path}'", f"duration {max(0.001, nxt - t):.4f}"]
    lines.append(f"file '{fr[-1][1]}'")
    lst = os.path.join(OUT, "frames.ffconcat")
    open(lst, "w").write("\n".join(lines) + "\n")
    part = os.path.join(OUT, "account-focus-walkthrough.part.mp4")
    final = os.path.join(OUT, "account-focus-walkthrough.mp4")
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-vf", "fps=30,format=yuv420p",
                        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart", "-an", part])
    if r.returncode != 0: sys.exit("ffmpeg failed")
    os.replace(part, final)
    print(f"Wrote {final} ({os.path.getsize(final) / 1e6:.1f} MB, {rec.end:.0f} s, {len(rec.chapters)} chapters)")

if __name__ == "__main__":
    asyncio.run(main())
