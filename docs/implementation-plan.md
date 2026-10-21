# Senior Project Site Rebuild Implementation Plan

**Goal:** Replace the current site with the approved two-page design: a features page with three interactive figures and a document library with an in-page PDF viewer.

**Architecture:** Plain HTML pages in `site/` enhanced by native ES modules. A pure room model (`room.js`) feeds DOM components (`figures.js`); photos are pre-rendered stills with an on-demand Three.js render. `scripts/build.mjs` copies `site/`, injects document cards from the PDFs it finds, and vendors Three.js and pdf.js into `dist/`.

**Tech Stack:** HTML, CSS, JavaScript modules, Three.js 0.186.1, pdfjs-dist 6.4.299, Node 22 (`node:test`), Python Playwright + Google Chrome for browser tests and stills.

**Spec:** `docs/design.md`

## Global Constraints

- Copy rules from the spec: no "system 1"/"team 1"; "subsystem" once per page (footer); "senior project" once on the features page.
- Everything loads from the site's own origin; CSP in `site/_headers` stays `'self'`-only apart from `blob:` images and `'wasm-unsafe-eval'`.
- No inline `style` attributes or inline scripts (CSP has no `'unsafe-inline'`); set styles through CSSOM or classes.
- Pages must work at 320–1440 px without horizontal page scroll, honour `prefers-reduced-motion`, and stay readable without JavaScript.
- Centimetres everywhere in the room model; x along the photographed wall, y into the room, z up.

## Review Focus

- PDF names with spaces, `&`, `#` or Turkish letters must link, preview and download correctly (Task 2 unit test, Task 6 fixture `03 Öneri & Plan.pdf`).
- A long PDF must open quickly and render only pages near the viewport (Task 6: 30-page fixture, fewer canvases than pages after opening).
- A corrupt PDF must show a failed card and a viewer message with a download link, without breaking other cards (Task 6: `broken.pdf` fixture).
- Without WebGL, "Update photo" must fail quietly with a disabled "Photo unavailable" button (Task 6: Chrome launched with `--disable-webgl`).
- Keyboard-only use of every figure: capture advances with Enter, plans select with 1–4, move with arrows, rotate with R (Task 6).

---

### Task 1: Room model

**Files:** Create `site/room.js`, `tests/room.test.mjs`. Delete `site/demo-layout.js`, `tests/demo-layout.test.mjs`.

**Interfaces — Produces:** `ROOM, WINDOW, DOOR, CAMERA, KEPT, PIECES, UNPLACED, CAPTURE, TAPS`, `progress(count) → {back,left,right,front,height,window,door,kept,photo}`, `layout(i) → Item[]`, `rugAt(i)`, `footprint(item) → [x,y][]`, `doorSwing`, `walkway(items) → {reached, cut, grid, cols}`, `check(items) → {id, rule, other?}[]` with rules `wall|overlap|cover|door|window|path`, `project([x,y,z]) → [u,v]` (0–1 image coordinates), `corners(item)`, `outline(item)`, `markerPoint(item)`.

- [ ] **Step 1: Write the failing tests** — `layouts pass every check` (`check(layout(i))` is `[]` for i = 0, 1, 2); `each rule names the piece that breaks it` (table at 380,290 → `door`; bookcase at 345,14 → `window`; art at z 80 → `overlap` with sofa; art at x 300 → `cover`; table x 450 → `wall`; sofa and table stacked → `overlap` both ways; pieces boxed in → `path`); `a blocked door does not cascade` (only the `door` issue); `projection matches the stills` (`project([420,0,0])` ≈ `[899/1200, 489/800]` within 0.002; every tap in `TAPS` except the shutter projects inside 0–1).
- [ ] **Step 2: Run** `node --test tests/room.test.mjs` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement `site/room.js`** from the approved mock engine, adding `CAPTURE`/`TAPS`/`progress` and the door-before-path rule.
- [ ] **Step 4: Run** `node --test tests/room.test.mjs` — Expected: PASS.

### Task 2: Build and document cards

**Files:** Rewrite `scripts/build.mjs`; create `scripts/documents.mjs`, `tests/documents.test.mjs`; modify `package.json` (add `pdfjs-dist` 6.4.299; scripts `test`, `test:browser`, `photos`).

**Interfaces — Produces:** `documentTitle(fileName) → string`, `sortDocuments(fileNames) → string[]`, `documentCards(fileNames) → string` (HTML for `<ul class="docs">`, or the empty-state paragraph). Build env: `OUT_DIR` (default `dist`), `DOCS_DIR` (default `site/documents`). Output: `dist/vendor/{three.module.js,three.core.js,RoundedBoxGeometry.js,three-LICENSE.txt}`, `dist/vendor/pdfjs/{pdf.min.mjs,pdf.worker.min.mjs,standard_fonts/,wasm/,LICENSE}`.

- [ ] **Step 1: Write the failing tests** — `01 Project Proposal.pdf` → "Project Proposal"; `02-design_report.pdf` → "Design report"; `Poster.PDF` → "Poster"; `["10 B.pdf","2 A.pdf"]` sorts to `["2 A.pdf","10 B.pdf"]`; `03 R&D <draft>.pdf` card has `href="03%20R%26D%20%3Cdraft%3E.pdf"` and text `R&amp;D &lt;draft&gt;`; `documentCards([])` contains "No documents yet."
- [ ] **Step 2: Run** `node --test tests/documents.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** `scripts/documents.mjs`, then the build: recursive copy of `site/` without `documents/*.pdf`, copy PDFs from `DOCS_DIR`, replace `<!-- documents -->` in `documents/index.html`, vendor files (RoundedBoxGeometry import rewritten to `./three.module.js`).
- [ ] **Step 4: Run** `npm install && npm test && npm run build` — Expected: tests pass; `dist/vendor/pdfjs/pdf.worker.min.mjs` exists.

### Task 3: Photo renderer and stills

**Files:** Create `site/room-scene.js` (from the mock renderer; imports `./vendor/three.module.js`; `PCFShadowMap`), `scripts/render-photos.py`, `site/photos/{capture,layout-1,layout-2,layout-3}.jpg`. Delete `site/demo-scene.js`, `site/room-preview.png`.

**Interfaces — Produces:** `createRoomScene(canvas) → { draw(items, { doorOpen = true }) }` rendering at the canvas size with the camera `room.js` projects through.

- [ ] **Step 1: Implement** the renderer and the script (build, serve `dist/` on a free port, render capture with the door closed and layouts with their rug, save JPEG quality 0.86 to `site/photos/`).
- [ ] **Step 2: Run** `npm run photos` — Expected: four JPEGs; overlaying `outline(item)` on `layout-1.jpg` frames each piece (visual check).

### Task 4: Features page

**Files:** Create `site/figures.js`, rewrite `site/index.html`, `site/app.js`, `site/styles.css`. Delete `site/demo.js`, `site/demo.css`, `site/explanations.js`, `site/illustrations.js`.

**Interfaces — Consumes:** Task 1 exports, Task 3 `createRoomScene`. **Produces:** `store`, `designStore(i)`, `captureStore(done)`, `capturePhoto`, `capturePlan`, `captureChips`, `photoView(st, {scale, update})`, `designPlan(st, {scale, editable, tags})`, `segmented`, `unplaced`, `selectedInfo`, `updateButton`, `resetButton`, `rulesList`. `app.js` mounts into `#capture-figure`, `#arrangement-figure`, `#checks-figure`, replacing their fallback `<img>`.

- [ ] **Step 1: Implement** components from the approved mock without language switching; keyboard: capture SVG is a focusable button (Enter/Space advances); plans accept 1–4, arrows (5 cm, Shift 1 cm) and R/Shift+R (15°); live status text for capture progress and broken rules; WebGL failure disables the update button as "Photo unavailable".
- [ ] **Step 2: Run** `npm run build && npm run preview` and open `http://127.0.0.1:4173` — Expected: all three figures work as in mockup v2.

### Task 5: Documents page

**Files:** Create `site/documents/index.html`, `site/documents.js`; styles in `site/styles.css`; update `site/404.html`, `site/_headers`.

**Interfaces — Consumes:** Task 2 card markup (`a.doc[href]` with `.doc-face`, `.doc-title`, `.doc-meta`). **Produces:** viewer dialog `dialog.viewer` with buttons labelled "Previous page", "Next page", "Zoom out", "Zoom in", "Close", link "Download", status `.v-count` ("n / N") and `.v-zoom` ("100%").

- [ ] **Step 1: Implement** lazy previews (shared `PDFWorker`, page 1 at 640 px, `.ready`/`.failed`), the viewer (lazy page rendering within 800 px of view, zoom steps 50/75/100/125/150/200 %, keyboard arrows/PageUp/PageDown/+/−), error message with download link, CSP additions (`img-src 'self' data: blob:`, `worker-src 'self'`, `'wasm-unsafe-eval'`).
- [ ] **Step 2: Run** `DOCS_DIR=tests/fixtures/documents npm run build && npm run preview` — Expected: cards show previews; viewer opens in place.

### Task 6: Browser verification

**Files:** Rewrite `tests/browser.py`; delete `tests/demo_browser.py`; create fixtures in `tests/fixtures/documents/` (`01 Sample Report.pdf` 3 pages, `02 Sample Slides.pdf` 16:9, `03 Öneri & Plan.pdf`, `04 Long Report.pdf` 30 pages, `broken.pdf`).

- [ ] **Step 1: Write** the test: build into a temp dir with the fixtures, serve it with `_headers` applied, then check copy rules, capture to completion by keyboard, layout switch and linked selection, a door conflict by keyboard then "Update photo" producing a `blob:` photo, previews ready/failed counts, viewer paging/zoom/Escape/focus return, lazy rendering on the long fixture, the broken-PDF message, no horizontal overflow at 1440/1024/768/390/320, no-JS fallbacks, reduced motion, and the WebGL-disabled update button. Fail on any console error.
- [ ] **Step 2: Run** `npm test && python3 tests/browser.py` — Expected: all pass, no console errors.

### Task 7: Documentation

**Files:** `README.md`, `docs/verification.md`.

- [ ] **Step 1: Update** README (adding documents, naming, scripts, tests, deploy) and record verification results.
