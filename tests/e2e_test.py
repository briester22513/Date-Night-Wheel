"""
End-to-end test in an emulated iPhone 13 (Chromium engine with iPhone viewport, touch, and UA).
Run from the project folder:
    python3 -m pip install playwright && python3 -m playwright install chromium
    python3 tests/e2e_test.py
"""
import json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8765
BASE = f"http://localhost:{PORT}/"
SHOTS = os.path.join(ROOT, "tests", "screenshots")
os.makedirs(SHOTS, exist_ok=True)

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("  ✓ " if cond else "  ✗ ") + name + (f"  [{detail}]" if detail and not cond else ""))

def pointer_key(page):
    """Ask the browser which slice is physically under the pointer tip right now.

    The wheel's rotating layer is pointer-events:none by design (see styles.css —
    otherwise its rotated square hit-box can shadow controls near it), so a real
    finger tap can never land on a .seg. We briefly re-enable hit-testing on just
    the rotor for this check, so we're independently reading the same pixel a
    person would be looking at, not trusting the app's own bookkeeping.
    """
    page.evaluate("() => document.getElementById('wheelWrap').scrollIntoView({block: 'center'})")
    return page.evaluate("""() => {
        const rotor = document.getElementById('rotor');
        const prevPE = rotor.style.pointerEvents;
        rotor.style.pointerEvents = 'auto';
        const wrap = document.getElementById('wheelWrap').getBoundingClientRect();
        const x = wrap.left + wrap.width / 2;
        const y = Math.max(1, wrap.top + wrap.height * 0.12); // just under the pointer tip, inside the slice body
        const el = document.elementFromPoint(x, y);
        const seg = el && el.closest ? el.closest('.seg') : null;
        rotor.style.pointerEvents = prevPE;
        return seg ? seg.dataset.key : ('MISS:' + (el ? el.tagName + (el.id ? '#' + el.id : '') : 'none'));
    }""")

def segment_keys(page):
    return page.evaluate("() => Array.from(document.querySelectorAll('#rotor .seg')).map(p => p.dataset.key)")

def spin_and_verify(page, label, trigger="#spinBtn"):
    before = page.evaluate("() => document.getElementById('rotor').style.transform")
    page.locator(trigger).click()
    page.wait_for_timeout(400)
    mid1 = page.evaluate("() => document.getElementById('rotor').style.transform")
    page.wait_for_timeout(500)
    mid2 = page.evaluate("() => document.getElementById('rotor').style.transform")
    page.wait_for_selector("#resultSheet.open", timeout=12000)
    page.wait_for_timeout(450)  # let the sheet settle
    result_key = page.get_attribute("#resultSheet", "data-result-key")
    landed_key = page.get_attribute("#wheelWrap", "data-landed-key")
    # Hide the sheet+scrim momentarily so elementFromPoint sees the wheel, not the overlay
    page.evaluate("() => { document.getElementById('scrim').style.visibility='hidden'; document.getElementById('resultSheet').style.visibility='hidden'; }")
    under = pointer_key(page)
    page.evaluate("() => { document.getElementById('scrim').style.visibility=''; document.getElementById('resultSheet').style.visibility=''; }")
    animated = before != mid1 and mid1 != mid2
    ok = animated and result_key == landed_key == under
    return ok, dict(label=label, result=result_key, landed=landed_key, under=under, animated=animated)

def close_sheet(page):
    page.locator("#resultSheet [data-close]").click()
    page.wait_for_selector("#resultSheet", state="hidden", timeout=3000)

def main():
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)], cwd=ROOT,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        with sync_playwright() as p:
            iphone = dict(p.devices["iPhone 13"])
            iphone.pop("default_browser_type", None)
            browser = p.chromium.launch()

            # ── Context A: share API present (like iPhone Safari) ──
            ctx = browser.new_context(**iphone)
            ctx.add_init_script("""
                window.__shared = [];
                navigator.share = async (d) => { window.__shared.push(d); };
            """)
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.goto(BASE)
            page.wait_for_selector("#rotor .seg")
            page.screenshot(path=f"{SHOTS}/01-iphone-home.png")

            print("\n1–2. Spinning repeatedly and pointer ⇄ result agreement")
            spins = []
            for i in range(10):
                ok, info = spin_and_verify(page, f"spin {i+1}", "#spinBtn" if i % 2 == 0 else "#hubSpin")
                spins.append(ok)
                check(f"spin {i+1}: animated, pointer matches card ({info['result']})", ok, json.dumps(info))
                if i == 0:
                    page.screenshot(path=f"{SHOTS}/02-iphone-result.png")
                close_sheet(page)
            # Spin Again button inside the card
            page.locator("#spinBtn").click()
            page.wait_for_selector("#resultSheet.open", timeout=12000)
            page.locator("[data-act='again']").click()
            page.wait_for_selector("#resultSheet", state="hidden", timeout=3000)
            page.wait_for_selector("#resultSheet.open", timeout=12000)
            page.wait_for_timeout(450)
            page.evaluate("() => { scrim.style.visibility='hidden'; resultSheet.style.visibility='hidden'; }")
            check("Spin again re-spins and still matches", page.get_attribute("#resultSheet", "data-result-key") == pointer_key(page))
            page.evaluate("() => { scrim.style.visibility=''; resultSheet.style.visibility=''; }")
            close_sheet(page)

            print("\n3. Filters change the wheel")
            data = page.evaluate("() => RVA_DATA.OPTIONS")
            by_id = {o["id"]: o for o in data}
            ids = lambda keys: [k.split(":")[1] for k in keys]
            all_keys = segment_keys(page)
            page.locator(".mode[data-mode='eat']").click()
            eat = ids(segment_keys(page))
            check("Eat tab → only eat options", eat and all(by_id[i]["category"] == "eat" for i in eat), str(eat))
            page.locator(".mode[data-mode='play']").click()
            play = ids(segment_keys(page))
            check("Play tab → only play options", play and all(by_id[i]["category"] == "play" for i in play), str(play))
            page.locator(".mode[data-mode='create']").click()
            create = ids(segment_keys(page))
            check("Create tab → only create options", create and all(by_id[i]["category"] == "create" for i in create), str(create))
            page.locator(".mode[data-mode='all']").click()
            page.locator(".chip.budget[data-price='1']").click()
            cheap = ids(segment_keys(page))
            check("Budget $ → only $ options", cheap and all(by_id[i]["price"] == 1 for i in cheap), str(cheap))
            page.locator(".chip.budget[data-price='1']").click()
            page.locator(".chip.mood[data-mood='competitive']").click()
            comp = ids(segment_keys(page))
            check("Mood Competitive → every slice is competitive", comp and all("competitive" in by_id[i]["moods"] for i in comp), str(comp))
            ok, info = spin_and_verify(page, "filtered spin")
            check("Spin with filters still matches pointer", ok, json.dumps(info)); close_sheet(page)
            page.locator(".chip.mood[data-mood='competitive']").click()
            page.locator(".mode[data-mode='play']").click()
            page.locator(".chip.mood[data-mood='romantic']").click()
            indoor_text = page.inner_text("#matchCount"); indoor_ids = ids(segment_keys(page))
            page.locator("#indoorToggle").click()
            outdoor_text = page.inner_text("#matchCount"); outdoor_ids = ids(segment_keys(page))
            check("Indoor-only ON hides outdoor spots", all(by_id[i]["indoor"] for i in indoor_ids))
            check("Indoor-only OFF lets outdoor spots in (count changes)", indoor_text != outdoor_text and "libbyhill" in outdoor_ids, f"{indoor_text} → {outdoor_text}")
            page.locator("#indoorToggle").click()
            page.locator(".chip.mood[data-mood='romantic']").click()
            # empty state
            page.locator(".mode[data-mode='create']").click()
            page.locator(".chip.budget[data-price='3']").click()
            check("Impossible filters show the empty state", page.is_visible("#emptyState"))
            check("…and Spin is disabled", page.is_disabled("#spinBtn"))
            page.locator("#emptyReset").click()
            check("Clear filters restores the wheel", not page.is_visible("#emptyState") and page.is_enabled("#spinBtn"))

            print("\n   Full Date / Build our night / Surprise")
            page.locator(".mode[data-mode='full']").click()
            nk = segment_keys(page)
            check("Full Date tab → whole-night slices", nk and all(k.startswith("n:") for k in nk), str(nk[:3]))
            ok, info = spin_and_verify(page, "full date")
            stops = page.locator("#resultSheet .stop").count()
            check(f"Full Date spin matches pointer and has {stops} stops", ok and stops in (2, 3), json.dumps(info))
            page.screenshot(path=f"{SHOTS}/03-iphone-full-date.png")
            close_sheet(page)
            page.locator(".mode[data-mode='all']").click()
            ok, info = spin_and_verify(page, "build night", "#nightBtn")
            check("‘Build our whole night’ switches to Full Date and spins", ok and info["result"].startswith("n:"), json.dumps(info))
            close_sheet(page)
            page.locator(".chip.budget[data-price='2']").click()
            page.locator("#surpriseBtn").click()
            page.wait_for_timeout(300)
            hidden_labels = page.evaluate("() => Array.from(document.querySelectorAll('#rotor .lbl-main tspan:last-child')).every(t => t.textContent === '?')")
            check("Surprise us hides the labels while spinning", hidden_labels)
            page.wait_for_selector("#resultSheet.open", timeout=12000)
            page.wait_for_timeout(450)
            revealed = page.evaluate("() => Array.from(document.querySelectorAll('#rotor .lbl-main tspan:last-child')).every(t => t.textContent !== '?')")
            page.evaluate("() => { scrim.style.visibility='hidden'; resultSheet.style.visibility='hidden'; }")
            match = page.get_attribute("#resultSheet", "data-result-key") == pointer_key(page)
            page.evaluate("() => { scrim.style.visibility=''; resultSheet.style.visibility=''; }")
            budgets_cleared = page.evaluate("() => document.querySelectorAll('.chip.budget[aria-pressed=\"true\"]').length === 0")
            check("Surprise reveals labels on landing, clears budget/mood, matches pointer", revealed and match and budgets_cleared)

            print("\n4. Send to her (Web Share API)")
            page.locator("[data-act='share']").click()
            page.wait_for_timeout(300)
            shared = page.evaluate("() => window.__shared")
            check("navigator.share called with title, text, and url", shared and shared[-1].get("url", "").startswith(BASE) and shared[-1].get("text"), str(shared))
            shared_url = shared[-1]["url"] if shared else BASE
            current_key = page.get_attribute("#resultSheet", "data-result-key")

            print("\n5. Favorites & history persist after refresh")
            page.locator("[data-act='fav']").click()
            page.locator("[data-act='done']").click()
            fav_pressed = page.get_attribute("[data-act='fav']", "aria-pressed")
            page.reload(); page.wait_for_selector("#rotor .seg")
            check("Favorite count badge survives reload", page.inner_text("#savedCount") == "1" and page.is_visible("#savedCount"))
            stored = page.evaluate("() => ({f: JSON.parse(localStorage.getItem('rvadn.v1.favorites')), h: JSON.parse(localStorage.getItem('rvadn.v1.history'))})")
            check("localStorage holds the favorite and the history entry", stored["f"][0]["key"] == current_key and stored["h"][0]["key"] == current_key and fav_pressed == "true")
            page.locator("#savedBtn").click(); page.wait_for_selector("#savedSheet.open")
            check("Saved sheet lists the favorite", page.locator("#savedList .item").count() == 1)
            page.locator("#tabHist").click()
            check("History tab lists the completed date", page.locator("#savedList .item").count() == 1)
            page.screenshot(path=f"{SHOTS}/04-iphone-saved.png")
            page.locator("#savedList .i-main").first.click()
            page.wait_for_selector("#resultSheet.open")
            check("Tapping a saved date reopens its card", page.get_attribute("#resultSheet", "data-result-key") == current_key)
            check("Prefs persisted (last mode restored after reload)", page.evaluate("() => RVAApp.debug().mode") in ("all", "full"))

            print("\n   Shared link opens the same card")
            p2 = ctx.new_page(); p2.goto(shared_url)
            p2.wait_for_selector("#resultSheet.open", timeout=5000)
            check("Opening the shared URL shows the same date", p2.get_attribute("#resultSheet", "data-result-key") == current_key, shared_url)
            check("…labelled as sent to you", "Sent to you" in p2.inner_text("#resultBody"))
            p2.close()
            p3 = ctx.new_page(); p3.goto(BASE + "?date=lostletter"); p3.wait_for_selector("#resultSheet.open")
            check("?date=lostletter deep link works", "Lost Letter" in p3.inner_text("#resultTitle")); p3.close()
            p4 = ctx.new_page(); p4.goto(BASE + "?date=doesnotexist"); p4.wait_for_timeout(600)
            check("Bad deep link fails gracefully (no card, no crash)", not p4.is_visible("#resultSheet")); p4.close()

            print("\n7. Responsive iPhone layout")
            page.goto(BASE); page.wait_for_selector("#rotor .seg")
            overflow = page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
            check("No horizontal scroll on iPhone width", overflow <= 0, str(overflow))
            tap_sizes = page.evaluate("() => Array.from(document.querySelectorAll('.mode,.chip,.spin-btn,.ghost,.toggle,.saved-btn')).map(b => Math.round(b.getBoundingClientRect().height))")
            check("Tap targets are at least 34px tall", min(tap_sizes) >= 34, str(tap_sizes))
            check("No JavaScript errors in the console", not errors, str(errors))
            ctx.close()

            # ── Context B: no Web Share (desktop browsers) → clipboard fallback ──
            print("\n   Share fallback when Web Share is unavailable")
            ctx2 = browser.new_context(viewport={"width": 1280, "height": 860}, permissions=["clipboard-read", "clipboard-write"])
            ctx2.add_init_script("delete Navigator.prototype.share; delete navigator.share;")
            d = ctx2.new_page(); d.goto(BASE); d.wait_for_selector("#rotor .seg")
            d.screenshot(path=f"{SHOTS}/05-desktop.png")
            d.locator("#spinBtn").click(); d.wait_for_selector("#resultSheet.open", timeout=12000)
            d.locator("[data-act='share']").click(); d.wait_for_timeout(400)
            clip = d.evaluate("() => navigator.clipboard.readText()")
            check("Falls back to copying the link", "?date=" in clip or "?night=" in clip, clip)
            check("…and tells you it copied", "copied" in d.inner_text("#toast").lower())
            ctx2.close()

            # ── Context C: reduced motion still visibly spins ──
            ctx3 = browser.new_context(**iphone, reduced_motion="reduce")
            r = ctx3.new_page(); r.goto(BASE); r.wait_for_selector("#rotor .seg")
            ok, info = spin_and_verify(r, "reduced motion")
            check("Reduced-motion users still see a (shorter) spin that matches", ok, json.dumps(info))
            ctx3.close()
            browser.close()
    finally:
        server.terminate()

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
