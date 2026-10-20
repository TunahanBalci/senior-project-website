"""Build the site with fixture documents, serve it with the production headers and exercise both pages.
Waits use expect(), not wait_for_function(): the site's CSP rightly blocks the eval the latter needs.

Needs Node, Python Playwright and Google Chrome. Run with `npm run test:browser`.
"""
import base64
import functools
import http.server
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.parse
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
WORK = Path(tempfile.mkdtemp(prefix="dizoda-test-"))
OUT, DOCS = WORK / "site", WORK / "documents"
SHOTS = Path("/tmp/dizoda-preview")
SHOTS.mkdir(exist_ok=True)
HEADERS = dict(line.strip().split(": ", 1) for line in (ROOT / "site/_headers").read_text().splitlines() if ": " in line)
SERVED = {}
PIXEL = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
TEAM_PHOTOS = ["tunahan_balci.jpg", "berre_yazgi.jpg"]


def build(out, docs):
    subprocess.run(["node", "scripts/build.mjs"], cwd=ROOT, check=True, capture_output=True, env={**os.environ, "OUT_DIR": str(out), "DOCS_DIR": str(docs)})


class Site(http.server.SimpleHTTPRequestHandler):
    """Static server with the production headers and byte ranges, like Cloudflare Pages; counts bytes sent per path."""

    def end_headers(self):
        for name, value in HEADERS.items():
            self.send_header(name, value)
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def log_message(self, *args):
        pass

    def do_GET(self):
        path, match = self.translate_path(self.path), re.fullmatch(r"bytes=(\d+)-(\d*)", self.headers.get("Range", ""))
        if not (match and os.path.isfile(path)):
            return super().do_GET()
        size = os.path.getsize(path)
        start, end = int(match[1]), min(int(match[2]) if match[2] else size - 1, size - 1)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        with open(path, "rb") as source:
            source.seek(start)
            self.copy(source, end - start + 1, size)

    def copyfile(self, source, outputfile):
        self.copy(source, None, os.fstat(source.fileno()).st_size)

    def copy(self, source, length, size):
        key, left = urllib.parse.unquote(self.path), length
        while left is None or left > 0:
            chunk = source.read(65536 if left is None else min(65536, left))
            if not chunk:
                break
            try:
                self.wfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                break
            SERVED[key] = SERVED.get(key, 0) + len(chunk)
            left = None if left is None else left - len(chunk)
            if size > 1_000_000:
                time.sleep(.004)  # pace large files so a cancelled download stops early, as over a real network


def open_page(browser, path, **options):
    page = browser.new_page(**{"viewport": {"width": 1440, "height": 1000}, **options})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    # Software WebGL reports a ReadPixels stall when a photo canvas is read back; that is driver noise, not a site error.
    page.on("console", lambda message: errors.append(message.text) if message.type in ("error", "warning") and "GL Driver Message" not in message.text else None)
    page.goto(BASE + path, wait_until="networkidle")
    return page, errors


def screen_point(page, svg, x, y):
    return page.evaluate("([svg, x, y]) => { const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()); return [p.x, p.y]; }", [svg.element_handle(), x, y])


def focused(page):
    return page.evaluate("document.activeElement.getAttribute('aria-label') || document.activeElement.textContent")


def large_pdf(browser, path):
    """A text first page followed by two pages of incompressible noise, about 6 MB."""
    page = browser.new_page()
    page.set_content("<style>@page{margin:0}section{height:100vh;page-break-after:always;padding:24mm;box-sizing:border-box}img{width:100%}</style>"
                     "<section><h1>Large Scan</h1><p>The preview needs only this page.</p></section><section><img></section><section><img></section>")
    page.evaluate("""() => Promise.all([...document.images].map(img => new Promise(done => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 1000, height: 1000 }), ctx = canvas.getContext('2d');
      const data = ctx.createImageData(1000, 1000);
      for (let i = 0; i < data.data.length; i++) data.data[i] = i % 4 === 3 ? 255 : Math.random() * 256;
      ctx.putImageData(data, 0, 0); img.onload = done; img.src = canvas.toDataURL('image/png');
    })))""")
    page.pdf(path=str(path), format="A4")
    page.close()


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--enable-unsafe-swiftshader"])
        shutil.copytree(ROOT / "tests/fixtures/documents", DOCS)
        large_pdf(browser, DOCS / "06 Large Scan.pdf")
        build(OUT, DOCS)
        for name in TEAM_PHOTOS:  # stand-ins while the real team photos are not in site/team/
            if not (OUT / "team" / name).exists():
                (OUT / "team" / name).write_bytes(PIXEL)
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Site, directory=str(OUT)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        BASE = f"http://127.0.0.1:{server.server_port}"
        passed = []

        # Features page: copy rules.
        page, errors = open_page(browser, "/")
        text = page.locator("body").inner_text().lower()
        assert text.count("senior project") == 1 and text.count("subsystem") == 1, "senior project / subsystem mentions"
        for banned in ["system 1", "system 2", "team 1", "team 2", "app screen"]:
            assert banned not in text, banned
        assert "tunahan balcı" in text and "berre yazgı" in text
        assert "in development" not in text
        assert page.locator(".title").inner_text().strip() == "Dizoda Furniture Engine", "the hero holds only the title"
        assert "mobile application" in page.locator(".abstract").inner_text()
        assert [" ".join(t.split()) for t in page.locator(".feature h2").all_inner_texts()] == ["1 Room capture", "2 Arrangements", "3 Placement checks"]
        passed.append("copy rules; hero with title and summary only")

        # Meet the Team: advisor, jury and team cards with photos, after the features.
        team = page.locator("section.team")
        assert team.locator("h2").inner_text() == "Meet the Team"
        assert team.locator("h3").all_inner_texts() == ["Project advisor", "Jury members", "Team members"]
        assert team.locator(".person .name").all_inner_texts() == ["Asst. Prof. Dr. Mehmet Evren Coşkun", "Dr. Ayşenur Birtürk", "Dr. Eren Ulu", "Tunahan Balcı", "Berre Yazgı"]
        assert page.evaluate("document.querySelector('section.team').compareDocumentPosition(document.querySelector('#checks-title')) & Node.DOCUMENT_POSITION_PRECEDING"), "team comes after the features"
        team.scroll_into_view_if_needed()
        for img in team.locator(".person img").all():
            expect(img).to_have_js_property("complete", True)
        assert team.locator(".person img").evaluate_all("images => images.map(i => i.naturalWidth > 0)") == [True] * 5, "every photo loads"
        missing = browser.new_page()
        missing.route("**/team/berre_yazgi.jpg", lambda route: route.fulfill(status=404))
        missing.goto(BASE + "/", wait_until="networkidle")
        missing.locator("section.team").scroll_into_view_if_needed()
        card = missing.locator(".person", has_text="Berre Yazgı")
        expect(card).to_have_class(re.compile(r"\bno-photo\b"))
        assert card.locator(".portrait").evaluate("e => getComputedStyle(e, '::before').content") == '"BY"', "initials replace a missing photo"
        missing.close()
        passed.append("meet the team: advisor, jury and team cards with photos; initials when a photo is missing")

        # Room capture: keyboard through every step, restart by keyboard, then a pointer tap.
        capture = page.locator("#capture-figure")
        capture.get_by_role("button", name="Place the next capture point").focus()
        for _ in range(13):
            page.keyboard.press("Enter")
        expect(capture.locator(".chip.done")).to_have_count(6)
        expect(capture.get_by_role("button", name="Capture complete")).to_have_count(1)
        assert capture.locator(".plan .ring.hidden").count() == 1, "the corner behind the armchair is computed"
        assert capture.locator(".plan .kept").count() == 1 and capture.locator(".plan .cam").count() == 1
        expect(capture.get_by_role("status")).to_have_text("Capture complete.")
        capture.get_by_role("button", name="Restart capture").focus()
        page.keyboard.press("Enter")
        expect(capture.locator(".chip.done")).to_have_count(0)
        assert focused(page) == "Place the next capture point", "restarting moves focus back to the photo"
        capture.locator(".target").click()
        expect(capture.locator(".atap")).to_have_count(1)
        capture.locator(".photo svg").click(position={"x": 5, "y": 5})
        expect(capture.locator(".atap")).to_have_count(1)
        passed.append("room capture by keyboard and pointer; restart keeps focus; taps away from the target are ignored")

        # Arrangements: layout switch by keyboard and linked selection.
        arrangement = page.locator("#arrangement-figure")
        arrangement.get_by_role("button", name="Layout 2").focus()
        page.keyboard.press("Enter")
        assert arrangement.locator(".photo img").get_attribute("src") == "/photos/layout-2.jpg"
        assert focused(page) == "Layout 2", "switching layouts keeps focus on the button"
        arrangement.locator('.photo [data-id="sofa"]').click()
        expect(arrangement.locator('.plan .num.sel[data-id="sofa"]')).to_have_count(1)
        expect(arrangement.locator(".selinfo")).to_contain_text("180 × 88 × 66 cm")
        arrangement.get_by_role("application", name="Room plan").focus()
        page.keyboard.press("2")
        expect(arrangement.locator('.photo .pin.sel[data-id="table"]')).to_have_count(1)
        expect(arrangement.locator(".photo .outline")).to_have_count(1)
        assert arrangement.locator(".unplaced").inner_text().replace("\n", " ").strip() == "Floor lamp Size missing"
        passed.append("layout switch by keyboard and linked plan/photo selection")

        # Placement checks: keyboard conflict, photo update and reset by keyboard, pointer drag, wall art in 3D.
        checks = page.locator("#checks-figure")
        plan = checks.get_by_role("application", name="Editable room plan")
        touch = lambda locator: locator.evaluate("e => getComputedStyle(e).touchAction")
        assert touch(capture.locator(".plan")) == "auto" and touch(arrangement.locator(".plan")) == "auto", "read-only plans let the page scroll"
        assert touch(checks.locator(".plan")) == "none", "the editable plan keeps drags"
        plan.focus()
        page.keyboard.press("2")
        for _ in range(20):
            page.keyboard.press("ArrowDown")
        expect(checks.locator(".rules li.bad")).to_have_text(["Door swing clear"])
        expect(checks.get_by_role("status")).to_have_text("Blocks the door")
        before = checks.locator('.plan [data-id="table"] polygon').get_attribute("points")
        page.keyboard.press("r")
        assert checks.locator('.plan [data-id="table"] polygon').get_attribute("points") != before, "R rotates"
        expect(checks.locator(".photo.stale")).to_have_count(1)
        checks.get_by_role("button", name="Update photo").focus()
        page.keyboard.press("Enter")
        expect(checks.locator(".photo img")).to_have_attribute("src", re.compile(r"^blob:"), timeout=120000)
        expect(checks.locator(".photo.stale")).to_have_count(0)
        assert focused(page) == "Update photo", "focus stays on the update button"
        checks.get_by_role("button", name="Reset").focus()
        page.keyboard.press("Enter")
        expect(checks.locator(".rules li.bad")).to_have_count(0)
        assert checks.locator(".photo img").get_attribute("src") == "/photos/layout-3.jpg"
        assert focused(page) == "Reset", "focus stays on the reset button"
        svg = checks.locator(".plan")
        start, end = screen_point(page, svg, 14, 175), screen_point(page, svg, 322, 50)
        page.mouse.move(*start)
        page.mouse.down()
        page.mouse.move(*end, steps=10)
        page.mouse.up()
        expect(checks.locator(".rules li.bad", has_text="Window clear")).to_have_count(1)
        checks.get_by_role("button", name="Reset").click()
        plan.focus()
        page.keyboard.press("4")
        for _ in range(12):
            page.keyboard.press("ArrowRight")
        expect(checks.locator(".rules li.bad")).to_have_count(0)
        for _ in range(14):
            page.keyboard.press("ArrowDown")
        expect(checks.locator(".rules li.bad", has_text="No overlap, in 3D")).to_have_count(1)
        passed.append("placement checks: door, window, wall art above the sofa allowed and lowered into it; rotate; keyboard update and reset keep focus; drag; touch scrolling")

        # Tablet widths keep each figure side by side.
        for width in [1024, 768]:
            page.set_viewport_size({"width": width, "height": 800})
            photo, built = capture.locator(".photo").bounding_box(), capture.locator(".plan").bounding_box()
            assert built["x"] >= photo["x"] + photo["width"] - 1, f"capture plan beside the photo at {width}"
            rules, edit = checks.locator(".rules").bounding_box(), checks.locator(".plan").bounding_box()
            assert rules["x"] >= edit["x"] + edit["width"] - 1, f"rules beside the editable plan at {width}"
        page.set_viewport_size({"width": 390, "height": 844})
        plan.focus()
        page.keyboard.press("2")
        hit = checks.locator(".handle circle").evaluate_all("cs => Math.max(...cs.map(c => c.getBoundingClientRect().width))")
        assert hit >= 24, f"rotate handle is {hit:.1f} px on a phone"
        assert not errors, errors
        page.set_viewport_size({"width": 1440, "height": 1000})
        page.screenshot(path=str(SHOTS / "features-1440.png"), full_page=True)
        page.close()
        passed.append("tablet widths side by side; phone-sized rotate handle")

        # Documents page: previews, viewer, lazy pages, special names, broken file, partial downloads.
        page, errors = open_page(browser, "/documents/", reduced_motion="reduce", device_scale_factor=2)
        cards = page.locator("a.doc")
        assert cards.locator(".doc-title").all_inner_texts() == ["Sample Report", "Sample Slides", "Öneri & Plan", "Long Report", "Large Scan", "Broken"]
        for i in range(cards.count()):
            cards.nth(i).scroll_into_view_if_needed()
        expect(page.locator("a.doc.ready, a.doc.failed")).to_have_count(6, timeout=60000)
        assert page.locator("a.doc.ready").count() == 5 and page.locator("a.doc.failed").count() == 1
        assert cards.nth(0).locator(".doc-meta").inner_text().startswith("3 pages")
        large = (OUT / "documents/06 Large Scan.pdf").stat().st_size
        assert SERVED.get("/documents/06 Large Scan.pdf", 0) < .4 * large, f"preview read {SERVED.get('/documents/06 Large Scan.pdf')} of {large} bytes"
        assert cards.nth(2).get_attribute("href") == "03%20%C3%96neri%20%26%20Plan.pdf"
        response = page.request.get(BASE + "/documents/03%20%C3%96neri%20%26%20Plan.pdf")
        assert response.status == 200 and response.headers["content-type"] == "application/pdf"
        cards.nth(0).click()
        viewer = page.locator("dialog.viewer")
        expect(viewer).to_be_visible()
        page.wait_for_selector("dialog.viewer .v-page canvas")
        expect(viewer.locator(".v-count")).to_have_text("1 / 3")
        page.keyboard.press("ArrowRight")
        expect(viewer.locator(".v-count")).to_have_text("2 / 3")
        viewer.get_by_role("button", name="Next page").focus()
        page.keyboard.press("Enter")
        expect(viewer.locator(".v-count")).to_have_text("3 / 3")
        assert focused(page) == "Next page", "the last page keeps focus on the button"
        viewer.get_by_role("button", name="Zoom in").click()
        expect(viewer.locator(".v-zoom")).to_have_text("125%")
        assert viewer.get_by_role("link", name="Download").get_attribute("href").endswith("/documents/01%20Sample%20Report.pdf")
        page.screenshot(path=str(SHOTS / "viewer-1440.png"))
        page.keyboard.press("Escape")
        expect(viewer).to_be_hidden()
        assert page.evaluate("document.activeElement.classList.contains('doc')"), "focus returns to the card"
        cards.nth(3).click()
        page.wait_for_selector("dialog.viewer .v-page canvas")
        assert viewer.locator(".v-page").count() == 30
        for _ in range(3):
            viewer.get_by_role("button", name="Zoom in").click()
        expect(viewer.locator(".v-zoom")).to_have_text("200%")
        for _ in range(45):
            viewer.locator(".v-scroll").evaluate("e => e.scrollBy(0, 1800)")
            page.wait_for_timeout(120)
        expect(viewer.locator(".v-count")).to_have_text("30 / 30", timeout=20000)
        page.wait_for_timeout(1500)
        count, largest = viewer.locator(".v-page canvas").evaluate_all("cs => [cs.length, Math.max(0, ...cs.map(c => c.width * c.height))]")
        assert count <= 8, f"{count} pages stay rendered after scrolling through"
        assert largest <= 12_100_000, f"largest page canvas is {largest} pixels"
        viewer.get_by_role("button", name="Close").click()
        cards.nth(2).click()
        expect(viewer.locator(".v-count")).to_have_text("1 / 1")
        viewer.get_by_role("button", name="Close").click()
        cards.nth(5).click()
        expect(viewer.locator(".v-error")).to_contain_text("could not be shown")
        viewer.get_by_role("button", name="Close").click()
        assert not errors, errors
        passed.append("documents: titles, previews from partial downloads, viewer paging, zoom, focus, pages released while scrolling, pixel cap, special names, broken file")
        page.close()

        # Widths, phone viewer and reduced motion.
        for path in ["/", "/documents/"]:
            page, errors = open_page(browser, path, reduced_motion="reduce")
            for width in [1440, 1024, 768, 390, 320]:
                page.set_viewport_size({"width": width, "height": 900})
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"{path} overflows at {width}"
            if path == "/":
                assert page.evaluate("getComputedStyle(document.documentElement).scrollBehavior") == "auto"
                assert page.evaluate("getComputedStyle(document.querySelector('.target .pulse')).animationName") == "none"
            page.set_viewport_size({"width": 390, "height": 844})
            page.screenshot(path=str(SHOTS / f"{'features' if path == '/' else 'documents'}-390.png"), full_page=True)
            if path == "/documents/":
                page.locator("a.doc").first.click()
                page.wait_for_selector("dialog.viewer .v-page canvas")
                box = page.locator("dialog.viewer").bounding_box()
                assert box["width"] <= 390 and box["x"] >= 0, "viewer fits a phone screen"
                expect(page.locator("dialog.viewer").get_by_role("link", name="Download")).to_be_visible()
                expect(page.locator("dialog.viewer").get_by_role("button", name="Zoom in")).to_be_visible()
                page.screenshot(path=str(SHOTS / "viewer-390.png"))
            assert not errors, errors
            page.close()
        passed.append("five widths without overflow; phone viewer with download and zoom; reduced motion")

        # Without JavaScript: photos and plain PDF links remain.
        static = browser.new_context(java_script_enabled=False).new_page()
        static.goto(BASE + "/")
        assert static.locator(".figure > img").count() == 3
        assert all(static.locator(".figure > img").evaluate_all("images => images.map(i => i.complete && i.naturalWidth > 0)"))
        static.goto(BASE + "/documents/")
        assert static.locator("a.doc[href$='.pdf']").count() == 6
        passed.append("readable without JavaScript")
        browser.close()

        # Without WebGL the update fails quietly.
        no_gl = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--disable-webgl", "--disable-3d-apis"])
        page, errors = open_page(no_gl, "/")
        page.locator("#checks-figure").get_by_role("application", name="Editable room plan").focus()
        page.keyboard.press("2")
        page.keyboard.press("ArrowDown")
        page.locator("#checks-figure").get_by_role("button", name="Update photo").click()
        expect(page.locator("#checks-figure").get_by_role("button", name="Photo unavailable")).to_be_disabled()
        assert all("WebGL" in error for error in errors), errors
        no_gl.close()
        passed.append("update photo without WebGL")

    (WORK / "empty").mkdir()
    build(WORK / "empty-site", WORK / "empty")
    assert "No documents yet." in (WORK / "empty-site/documents/index.html").read_text()
    assert (OUT / "404.html").exists()
    passed.append("empty document folder; 404 page")
    server.shutdown()
    print(json.dumps({"passed": passed}, ensure_ascii=False, indent=1))
finally:
    shutil.rmtree(WORK, ignore_errors=True)
