"""Render the room photos in site/photos/ from the built site (run `npm run photos`).

Re-run after changing layouts in site/room.js or the scene in site/room-scene.js,
so the photos keep matching the plan markers. Needs Python Playwright and Google Chrome.
"""
import base64
import functools
import http.server
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT / "dist")))
threading.Thread(target=server.serve_forever, daemon=True).start()
RENDER = """async name => {
  const [{ createRoomScene }, room] = await Promise.all([import("/room-scene.js"), import("/room.js")]);
  const canvas = Object.assign(document.createElement("canvas"), { width: 1200, height: 800 });
  const scene = createRoomScene(canvas), index = Number(name.slice(-1)) - 1;
  if (name === "capture") scene.draw([room.KEPT], { doorOpen: false });
  else scene.draw([...room.layout(index), room.rugAt(index)]);
  return canvas.toDataURL("image/jpeg", .86);
}"""
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--enable-unsafe-swiftshader"])
    page = browser.new_page()
    page.goto(f"http://127.0.0.1:{server.server_port}/404.html")
    (ROOT / "site/photos").mkdir(exist_ok=True)
    for name in ["capture", "layout-1", "layout-2", "layout-3"]:
        data = page.evaluate(RENDER, name)
        (ROOT / f"site/photos/{name}.jpg").write_bytes(base64.b64decode(data.split(",", 1)[1]))
        print(f"site/photos/{name}.jpg")
    browser.close()
server.shutdown()
