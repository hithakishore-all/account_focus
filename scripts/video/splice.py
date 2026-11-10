#!/usr/bin/env python3
"""Splice real Slack footage into the recorded walkthrough.

  FOCUS_SLACK_SPLICE=4 python3 scripts/video/record.py      # leaves a gap marker in out/timeline.json
  python3 scripts/video/splice.py <slack.mp4> <captions.json> [crop=W:H:X:Y]

captions.json: [{"t": 0, "color": "#4dc2c8", "meta": "16 / 20 · Alex · account executive", "title": "...", "body": "..."}, ...]
Each caption shows from its t (seconds into the Slack clip) until the next one. The crop removes browser chrome and
banners from a screen recording; check one frame first. Writes out/account-focus-walkthrough.spliced.mp4 and
out/chapters.spliced.json.
"""
import json, os, subprocess, sys, asyncio
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "out")

async def render_caps(caps):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1280, "height": 800})
        await pg.set_content('<body style="background:transparent;margin:0"></body>')
        await pg.add_script_tag(path=os.path.join(HERE, "overlay.js"))
        paths = []
        for i, c in enumerate(caps):
            await pg.evaluate("c => window.__fw.cap(c)", c); await pg.wait_for_timeout(900)
            await pg.evaluate("() => document.getElementById('fw-cur').style.display = 'none'")
            path = os.path.join(OUT, f"splice-cap{i}.png"); await pg.locator("#fw-cap").screenshot(path=path, omit_background=True); paths.append(path)
        await b.close(); return paths

def main():
    clip, capfile = sys.argv[1], sys.argv[2]
    crop = sys.argv[3] if len(sys.argv) > 3 else None
    caps = json.load(open(capfile)); tl = json.load(open(os.path.join(OUT, "timeline.json"))); S = tl["splice"]
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", clip]))
    pngs = asyncio.run(render_caps(caps))
    v = "[1:v]fps=30," + (f"crop={crop}," if crop else "") + "scale=1280:-2:flags=lanczos,pad=1280:800:0:0:color=0x0b141a,setsar=1[s0];"
    for i, c in enumerate(caps):
        end = caps[i + 1]["t"] if i + 1 < len(caps) else dur + 1
        v += f"[s{i}][{i + 2}:v]overlay=24:H-h-20:enable='between(t,{c['t']},{end})'[s{i + 1}];"
    f = (f"[0:v]split[m1][m2];[m1]trim=0:{S},setpts=PTS-STARTPTS,fps=30,format=yuv420p[a];"
         f"[m2]trim=start={S},setpts=PTS-STARTPTS,fps=30,format=yuv420p[c];" + v +
         f"[s{len(caps)}]format=yuv420p[b];[a][b][c]concat=n=3:v=1:a=0[v]")
    src = os.path.join(OUT, "account-focus-walkthrough.mp4"); part = os.path.join(OUT, "spliced.part.mp4")
    args = ["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-i", clip] + sum([["-i", p] for p in pngs], []) + \
           ["-filter_complex", f, "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart", "-an", part]
    if subprocess.run(args).returncode != 0: sys.exit("ffmpeg failed")
    os.replace(part, os.path.join(OUT, "account-focus-walkthrough.spliced.mp4"))
    ch = json.load(open(os.path.join(OUT, "chapters.json")))
    new = [x for x in ch if x["t"] < S]
    for c in caps:
        who, role = c["meta"].split(" · ")[1:3]
        new.append({"t": round(S + c["t"], 2), "title": c["title"], "persona": who, "role": role, "color": c["color"]})
    new += [dict(x, t=round(x["t"] + dur, 2)) for x in ch if x["t"] >= S]
    json.dump(new, open(os.path.join(OUT, "chapters.spliced.json"), "w"), indent=1)
    print("Wrote out/account-focus-walkthrough.spliced.mp4 and out/chapters.spliced.json")

if __name__ == "__main__":
    main()
