// Document library: first-page previews and an in-page viewer, both drawn with pdf.js.
// Without JavaScript every card stays a plain link to its PDF.
const PDFJS = "/vendor/pdfjs/";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ZOOMS = [.5, .75, 1, 1.25, 1.5, 2];
const MAX_PIXELS = 12e6; // per page canvas; phone browsers refuse canvases much larger than 16 MP
document.documentElement.classList.add("js");

let library;
const pdfjs = () => (library ??= import(`${PDFJS}pdf.min.mjs`).then(lib => {
  lib.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.mjs`;
  // Warnings about damaged files would only clutter the console; the card or viewer already says so.
  return { lib, worker: new lib.PDFWorker({ verbosity: lib.VerbosityLevel.ERRORS }) };
}));
const documents = new Map();
function load(url) {
  if (!documents.has(url)) documents.set(url, pdfjs().then(({ lib, worker }) =>
    lib.getDocument({ url, worker, standardFontDataUrl: `${PDFJS}standard_fonts/`, wasmUrl: `${PDFJS}wasm/`, verbosity: lib.VerbosityLevel.ERRORS,
      disableAutoFetch: true, disableStream: true }).promise));
  return documents.get(url);
}
const el = (tag, attrs = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), attrs);
  node.append(...kids);
  return node;
};
async function draw(page, width) {
  const base = page.getViewport({ scale: 1 }), viewport = page.getViewport({ scale: width / base.width });
  const canvas = el("canvas", { width: Math.ceil(viewport.width), height: Math.ceil(viewport.height) });
  await page.render({ canvas, viewport }).promise;
  return { canvas, ratio: `${base.width} / ${base.height}` };
}

async function preview(card) {
  try {
    const [{ lib }, pdf] = await Promise.all([pdfjs(), load(card.href)]);
    const page = await pdf.getPage(1), base = page.getViewport({ scale: 1 });
    const { canvas } = await draw(page, 640 * base.width / Math.max(base.width, base.height));
    card.querySelector(".doc-face").append(canvas);
    card.classList.add("ready");
    const info = (await pdf.getMetadata().catch(() => null))?.info;
    const date = info?.CreationDate && lib.PDFDateString.toDateObject(info.CreationDate);
    card.querySelector(".doc-meta").textContent = [`${pdf.numPages} ${pdf.numPages === 1 ? "page" : "pages"}`,
      date && `${MONTHS[date.getMonth()]} ${date.getFullYear()}`].filter(Boolean).join(" · ");
  } catch {
    card.classList.add("failed");
  }
}

function createViewer() {
  // aria-disabled rather than disabled, so reaching the last page or zoom step keeps keyboard focus.
  const button = (text, label, action) => {
    const node = el("button", { type: "button", className: "v-btn", title: label, ariaLabel: label, textContent: text });
    node.addEventListener("click", () => { if (node.getAttribute("aria-disabled") !== "true") action(); });
    return node;
  };
  const off = (node, value) => node.setAttribute("aria-disabled", String(value));
  const title = el("b", { className: "v-title" }), count = el("span", { className: "v-count" }), zoomText = el("span", { className: "v-zoom" });
  const previous = button("‹", "Previous page", () => go(-1)), next = button("›", "Next page", () => go(1));
  const zoomOut = button("−", "Zoom out", () => zoomBy(-1)), zoomIn = button("+", "Zoom in", () => zoomBy(1));
  const download = el("a", { className: "v-btn v-download", download: "", textContent: "Download" });
  const list = el("div", { className: "v-list" }), scroller = el("div", { className: "v-scroll", tabIndex: 0, ariaLabel: "Pages" }, list);
  title.id = "viewer-title";
  const dialog = el("dialog", { className: "viewer" },
    el("header", { className: "v-bar" }, title, el("div", { className: "v-group" }, previous, count, next),
      el("div", { className: "v-group v-zoom-group" }, zoomOut, zoomText, zoomIn), download, Object.assign(button("✕", "Close", () => dialog.close()), { className: "v-btn v-close" })),
    scroller);
  let pdf = null, zoom = 2, current = 1, session = 0;
  const pages = () => [...list.querySelectorAll(".v-page")];
  const near = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting) render(target);
      else if (target.dataset.zoom) { target.replaceChildren(); delete target.dataset.zoom; }
    }
  }, { root: scroller, rootMargin: "800px 0px" });
  async function render(slot) {
    const key = String(ZOOMS[zoom]), run = session;
    if (!pdf || slot.dataset.zoom === key) return;
    slot.dataset.zoom = key;
    const page = await pdf.getPage(Number(slot.dataset.page)), base = page.getViewport({ scale: 1 });
    const width = Math.min(slot.clientWidth * Math.min(devicePixelRatio || 1, 2), Math.sqrt(MAX_PIXELS * base.width / base.height));
    const { canvas, ratio } = await draw(page, width);
    if (run !== session || slot.dataset.zoom !== key) return;
    slot.style.aspectRatio = ratio;
    slot.replaceChildren(canvas);
  }
  function show(n) {
    current = n;
    count.textContent = pdf ? `${n} / ${pdf.numPages}` : "– / –";
    off(previous, !pdf || n <= 1);
    off(next, !pdf || n >= pdf.numPages);
  }
  function go(delta) {
    pages()[Math.min(Math.max(current + delta, 1), pages().length) - 1]?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  function applyZoom() {
    list.style.setProperty("--zoom", ZOOMS[zoom]);
    zoomText.textContent = `${Math.round(ZOOMS[zoom] * 100)}%`;
    off(zoomOut, !pdf || zoom === 0);
    off(zoomIn, !pdf || zoom === ZOOMS.length - 1);
    for (const slot of pages()) { near.unobserve(slot); near.observe(slot); }
  }
  function zoomBy(step) {
    const anchor = pages()[current - 1], offset = anchor ? (scroller.scrollTop - anchor.offsetTop) / anchor.offsetHeight : 0;
    zoom = Math.min(Math.max(zoom + step, 0), ZOOMS.length - 1);
    applyZoom();
    if (anchor) scroller.scrollTop = anchor.offsetTop + offset * anchor.offsetHeight;
  }
  scroller.addEventListener("scroll", () => {
    const line = scroller.scrollTop + scroller.clientHeight / 3;
    let n = 1;
    for (const slot of pages()) if (slot.offsetTop <= line) n = Number(slot.dataset.page);
    if (pdf && n !== current) show(n);
  }, { passive: true });
  dialog.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const action = { ArrowRight: () => go(1), PageDown: () => go(1), ArrowLeft: () => go(-1), PageUp: () => go(-1), "+": () => zoomBy(1), "=": () => zoomBy(1), "-": () => zoomBy(-1) }[event.key];
    if (action) { event.preventDefault(); action(); }
  });
  dialog.setAttribute("aria-labelledby", title.id);
  dialog.addEventListener("close", () => { session++; pdf = null; list.replaceChildren(); });
  document.body.append(dialog);
  return async function open(card) {
    const run = ++session;
    title.textContent = card.querySelector(".doc-title").textContent;
    download.href = card.href;
    zoom = 2; pdf = null;
    list.replaceChildren();
    show(1); applyZoom();
    dialog.showModal();
    scroller.focus();
    try {
      const loaded = await load(card.href), first = (await loaded.getPage(1)).getViewport({ scale: 1 });
      if (run !== session) return;
      pdf = loaded;
      for (let n = 1; n <= pdf.numPages; n++) {
        const slot = el("div", { className: "v-page" });
        slot.dataset.page = n;
        slot.style.aspectRatio = `${first.width} / ${first.height}`;
        list.append(slot);
      }
      show(1); applyZoom();
    } catch {
      if (run !== session) return;
      list.replaceChildren(el("p", { className: "v-error" }, "This document could not be shown. ", el("a", { href: card.href, download: "", textContent: "Download" })));
    }
  };
}

const cards = [...document.querySelectorAll("a.doc")];
if (cards.length) {
  const open = createViewer();
  const watcher = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { watcher.unobserve(entry.target); preview(entry.target); }
  }, { rootMargin: "200px" });
  for (const card of cards) {
    watcher.observe(card);
    card.addEventListener("click", event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      open(card);
    });
  }
}
