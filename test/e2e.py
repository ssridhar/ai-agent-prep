"""Browser test. Needs: pip install playwright && playwright install chromium.
Usage: start the server first (PORT=4399 PREP_DATA_DIR=/tmp/prep node server.js), then
       python3 test/e2e.py http://localhost:4399 /tmp/prep
"""
import json, sys, pathlib
from playwright.sync_api import sync_playwright

BASE, DATA = sys.argv[1], pathlib.Path(sys.argv[2])
SHOTS = pathlib.Path(__file__).parent / "screenshots"
SHOTS.mkdir(exist_ok=True)
errors = []

def chrome(p):
    try:
        return p.chromium.launch(channel="chrome")
    except Exception:
        return p.chromium.launch()

with sync_playwright() as p:
    b = chrome(p)
    page = b.new_page(viewport={"width": 1280, "height": 900})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and "youtube" not in m.text.lower() and "ytimg" not in m.text.lower() and "ERR_" not in m.text and errors.append(m.text))

    page.goto(BASE)
    page.wait_for_selector("text=Welcome")
    page.screenshot(path=str(SHOTS / "1-welcome.png"))

    page.fill("#start", "2026-11-16")
    page.click("#start-btn")
    page.wait_for_selector("text=Day 1: Mental model + install")
    assert page.locator(".task").count() == 2

    page.check('[data-check="w1d1-install"]')
    page.fill('[data-note="1"]', "Model is stateless!")
    page.wait_for_timeout(600)
    saved = json.loads((DATA / "progress.json").read_text())
    assert saved["startDate"] == "2026-11-16"
    assert saved["tasks"]["w1d1-install"]["done"] is True
    assert saved["notes"]["1"] == "Model is stateless!"
    page.screenshot(path=str(SHOTS / "2-today.png"), full_page=True)

    # Video modal plays the right video in-app, and Mark watched ticks the day task
    page.click('[data-play="karpathy-intro"]')
    src = page.get_attribute("#vm-iframe", "src")
    assert "youtube-nocookie.com/embed/zjkBMFhNj_g" in src, src
    page.screenshot(path=str(SHOTS / "3-video.png"))
    page.click("#vm-watched")
    page.click("#vm-close")
    assert page.locator('[data-check="w1d1-video"]').is_checked()

    # Survives a reload (from disk) even with browser storage cleared
    page.evaluate("localStorage.clear()")
    page.reload()
    page.wait_for_selector("text=Day 1")
    assert page.locator('[data-check="w1d1-install"]').is_checked()
    assert page.input_value('[data-note="1"]') == "Model is stateless!"

    # Copy button + other views
    page.goto(BASE + "/#/day/10")
    page.wait_for_selector("text=Your first tool loop")
    assert page.locator("pre.code").count() >= 1
    page.screenshot(path=str(SHOTS / "4-day10.png"), full_page=True)

    for route, text in [("plan", "Week 6"), ("videos", "Deep Dive"), ("project", "Milestones"),
                        ("interview", "trust boundaries"), ("resources", "OWASP"), ("settings", "Export backup")]:
        page.goto(f"{BASE}/#/{route}")
        page.wait_for_selector(f"text={text}")
        page.screenshot(path=str(SHOTS / f"5-{route}.png"), full_page=True)

    page.goto(BASE + "/#/interview")
    page.check('[data-iq="q1"]')
    page.wait_for_timeout(500)
    assert json.loads((DATA / "progress.json").read_text())["interview"]["q1"] is True

    # Dark mode renders
    dark = b.new_page(color_scheme="dark", viewport={"width": 1280, "height": 900})
    dark.goto(BASE + "/#/plan")
    dark.wait_for_selector("text=Week 1")
    dark.screenshot(path=str(SHOTS / "6-dark-plan.png"))
    b.close()

assert not errors, errors
print("E2E PASSED")
