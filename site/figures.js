// Interactive figures: room capture, layout plans and photos. Built from room.js data.
import * as R from "./room.js";

const SVG = "http://www.w3.org/2000/svg";
function el(ns, tag, attrs = {}, kids = []) {
  const node = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) node.append(kid);
  return node;
}
export const h = (tag, attrs, ...kids) => el(null, tag, attrs, kids);
const s = (tag, attrs, ...kids) => el(SVG, tag, attrs, kids);
const cls = (...names) => names.filter(Boolean).join(" ");
const pts = poly => poly.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const px = ([u, v]) => [u * 1200, v * 800];
const P = point => px(R.project(point));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const motion = matchMedia("(prefers-reduced-motion: reduce)");
let uid = 0;

export function store(state) {
  const listeners = new Set();
  return {
    state,
    set(patch) { Object.assign(state, patch); for (const listener of listeners) listener(state); },
    listen(listener) { listeners.add(listener); listener(state); },
  };
}

const RULE_TEXT = { wall: "Crosses a wall", door: "Blocks the door", window: "Blocks the window", cover: "Covers the window", path: "No 60 cm path" };
const kindOf = id => (id === R.KEPT.id ? R.KEPT : R.PIECES.find(piece => piece.id === id)).kind.toLowerCase();
const issueText = issue => (issue.rule === "overlap" ? `Overlaps the ${kindOf(issue.other)}` : RULE_TEXT[issue.rule]);
const cache = new WeakMap();
function analysis(items) {
  if (!cache.has(items)) cache.set(items, { issues: R.check(items) });
  return cache.get(items);
}
// Floor reachable from the door: path centres from walkway(), widened by the 30 cm half-width.
function walkPath(items) {
  const result = analysis(items);
  if (result.walk) return result.walk;
  const { reached, grid, cols } = R.walkway(items), rows = reached.length / cols, area = new Uint8Array(reached.length), disk = [];
  for (let dr = -6; dr <= 6; dr++) for (let dc = -6; dc <= 6; dc++) if (dr * dr + dc * dc <= 36) disk.push([dc, dr]);
  reached.forEach((hit, i) => {
    if (!hit) return;
    const c = i % cols, r = (i - c) / cols;
    for (const [dc, dr] of disk) if (c + dc >= 0 && r + dr >= 0 && c + dc < cols && r + dr < rows) area[(r + dr) * cols + c + dc] = 1;
  });
  let d = "";
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols;) {
    if (!area[r * cols + c]) { c++; continue; }
    const start = c;
    while (c < cols && area[r * cols + c]) c++;
    d += `M${start * grid} ${r * grid}h${(c - start) * grid}v${grid}h${(start - c) * grid}z`;
  }
  return (result.walk = d);
}

// ---------- state ----------
const moved = (a, b) => ["x", "y", "z", "angle"].some(key => Math.abs((a[key] ?? 0) - (b[key] ?? 0)) > .5);
const isStale = state => state.items.some((item, i) => moved(item, state.photoItems[i]));
const isEdited = state => { const base = R.layout(state.layout); return state.items.some((item, i) => moved(item, base[i])); };
const photoOf = index => `/photos/layout-${index + 1}.jpg`;
export const designStore = (index = 0) => store({ layout: index, items: R.layout(index), photoItems: R.layout(index), photoUrl: photoOf(index), selected: null, dragging: false, busy: false, failed: false });
export const captureStore = () => store({ count: 0, flash: false });
function setLayout(st, index) {
  st.set({ layout: index, items: R.layout(index), photoItems: R.layout(index), photoUrl: photoOf(index) });
}
function edit(st, change) {
  const items = st.state.items.map(item => ({ ...item })), item = items.find(i => i.id === st.state.selected);
  if (!item || item.kept) return;
  change(item);
  if (item.wall) {
    item.x = clamp(item.x, item.w / 2, R.ROOM.w - item.w / 2);
    item.z = clamp(item.z, item.h / 2, R.ROOM.h - item.h / 2);
  } else {
    item.x = clamp(item.x, 0, R.ROOM.w);
    item.y = clamp(item.y, 0, R.ROOM.d);
    item.angle = ((Math.round(item.angle) + 180) % 360 + 360) % 360 - 180;
  }
  st.set({ items });
}
let renderer;
function renderPhoto(items, index) {
  renderer ??= import("./room-scene.js").then(({ createRoomScene }) => {
    const canvas = Object.assign(document.createElement("canvas"), { width: 1200, height: 800 });
    return { canvas, scene: createRoomScene(canvas) };
  });
  return renderer.then(({ canvas, scene }) => new Promise((resolve, reject) => {
    scene.draw([...items, R.rugAt(index)]);
    canvas.toBlob(blob => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("No photo"))), "image/jpeg", .9);
  }));
}
async function updatePhoto(st) {
  if (st.state.busy || st.state.failed) return;
  st.set({ busy: true });
  const items = structuredClone(st.state.items);
  try {
    const url = await renderPhoto(items, st.state.layout);
    if (st.state.photoUrl.startsWith("blob:")) URL.revokeObjectURL(st.state.photoUrl);
    st.set({ busy: false, photoUrl: url, photoItems: items });
  } catch {
    renderer = null;
    st.set({ busy: false, failed: true });
  }
}

// ---------- plan ----------
const ALL = { back: true, left: true, right: true, front: true, height: true, window: true, door: true, kept: true, photo: true };
function frame(scale) {
  const dimY = -(34 + 14 * scale), dimX = 442 + 6 * scale, barY = 404 + 6 * scale;
  const left = -40 - 8 * scale, top = dimY - 18 - 12 * scale, right = dimX + 8 + 18 * scale, bottom = barY + 8 + 14 * scale;
  return { dimY, dimX, barY, artY: -(8 + 12 * scale), left, right, view: `${left} ${top} ${right - left} ${bottom - top}` };
}
function shell(k, scale, id) {
  const f = frame(scale), n = [], line = (x1, y1, x2, y2, c = "wall") => s("line", { class: c, x1, y1, x2, y2 });
  const text = (x, y, value, extra = {}) => s("text", { class: "dim", x, y, "font-size": 12 * scale, ...extra, text: value });
  n.push(s("defs", {}, s("pattern", { id: `hatch${id}`, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" },
    s("line", { class: "hatch", x1: 0, y1: 0, x2: 0, y2: 6 }))));
  if (k.front) n.push(s("rect", { class: "floor", x: 0, y: 0, width: 420, height: 360 }));
  const grid = [];
  for (let x = 50; x < 420; x += 50) grid.push(line(x, 0, x, 360, "grid"));
  for (let y = 50; y < 360; y += 50) grid.push(line(0, y, 420, y, "grid"));
  n.push(s("g", {}, grid));
  if (k.door) n.push(s("path", { class: "swing", d: "M420 330 L330 330 A90 90 0 0 1 420 240 Z" }));
  if (k.back) {
    if (!k.left) n.push(line(-40, 0, 0, 0, "wall ext"));
    if (!k.right) n.push(line(420, 0, 460, 0, "wall ext"));
    n.push(...(k.window ? [line(0, 0, 260, 0), line(384, 0, 420, 0)] : [line(0, 0, 420, 0)]));
  }
  if (k.left) { n.push(line(0, 0, 0, 360)); if (!k.front) n.push(line(0, 360, 0, 400, "wall ext")); }
  if (k.right) n.push(...(k.door ? [line(420, 0, 420, 240), line(420, 330, 420, 360)] : [line(420, 0, 420, 360)]));
  if (k.front) n.push(line(0, 360, 420, 360));
  if (k.window) n.push(s("rect", { class: "win", x: 260, y: -3.5, width: 124, height: 7 }), line(260, 0, 384, 0, "win-line"));
  if (k.door) n.push(line(420, 330, 330, 330, "leaf"));
  if (k.left && k.right) n.push(line(0, f.dimY, 420, f.dimY, "dimline"), line(0, f.dimY - 6, 0, f.dimY + 6, "dimline"),
    line(420, f.dimY - 6, 420, f.dimY + 6, "dimline"), text(210, f.dimY - 6, "420 cm", { "text-anchor": "middle" }));
  if (k.front) {
    const x = f.dimX + 8 + 4 * scale;
    n.push(line(f.dimX, 0, f.dimX, 360, "dimline"), line(f.dimX - 6, 0, f.dimX + 6, 0, "dimline"), line(f.dimX - 6, 360, f.dimX + 6, 360, "dimline"),
      text(x, 180, "360 cm", { "text-anchor": "middle", transform: `rotate(90 ${x} 180)` }),
      line(0, f.barY, 100, f.barY, "scale"), line(0, f.barY - 6, 0, f.barY + 6, "scale"), line(100, f.barY - 6, 100, f.barY + 6, "scale"),
      text(108, f.barY + 4 * scale, "1 m"));
  }
  if (k.height) n.push(text(420, f.barY + 4 * scale, "↕ 265 cm", { "text-anchor": "end" }));
  if (k.photo) n.push(s("path", { class: "cam", d: "M240 371 l-11 19 h22 z" }));
  return n;
}
const lock = (x, y, k) => s("path", { class: "lock", d: `M${x - 5 * k} ${y - k}h${10 * k}v${8 * k}h${-10 * k}z M${x - 3 * k} ${y - k}v${-3 * k}a${3 * k} ${3 * k} 0 0 1 ${6 * k} 0v${3 * k}` });
const keptShape = (id, scale) => s("g", { class: "kept-piece" }, s("polygon", { class: "piece kept", fill: `url(#hatch${id})`, points: pts(R.footprint(R.KEPT)) }), lock(R.KEPT.x, R.KEPT.y, scale));

function pieceLayer(state, { scale, id, editable, tags }) {
  const f = frame(scale), bad = new Map(), n = [], { issues } = analysis(state.items);
  for (const issue of issues) if (!bad.has(issue.id)) bad.set(issue.id, issue);
  if (editable && (state.dragging || issues.some(issue => issue.rule === "path"))) n.push(s("path", { class: "walk", d: walkPath(state.items) }));
  for (const item of state.items) {
    if (item.kept) { n.push(keptShape(id, scale)); continue; }
    const c = cls("piece", item.wall && "art", item.id === state.selected && "sel", bad.has(item.id) && "bad");
    n.push(s("g", { "data-id": item.id }, item.wall
      ? s("rect", { class: c, x: item.x - item.w / 2, y: 3.5, width: item.w, height: 6 })
      : s("polygon", { class: c, points: pts(R.footprint(item)) })));
  }
  for (const item of state.items) if (!item.kept) {
    const [x, y] = item.wall ? [item.x, f.artY] : [item.x, item.y];
    n.push(s("g", { class: cls("num", item.id === state.selected && "sel", bad.has(item.id) && "bad"), "data-id": item.id, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` },
      item.wall && s("line", { class: "tick", x1: 0, y1: 12 * scale, x2: 0, y2: -f.artY }),
      s("circle", { r: 12 * scale }), s("text", { y: 4.3 * scale, "font-size": 12 * scale, "text-anchor": "middle", text: item.n })));
  }
  const sel = state.items.find(item => item.id === state.selected);
  if (editable && sel && !sel.wall) {
    const a = sel.angle * Math.PI / 180, fx = -Math.sin(a), fy = Math.cos(a), r = sel.d / 2 + 26 * scale, hx = sel.x + fx * r, hy = sel.y + fy * r;
    n.push(s("g", { class: "handle", "data-handle": "" },
      s("line", { x1: sel.x + fx * sel.d / 2, y1: sel.y + fy * sel.d / 2, x2: hx, y2: hy }),
      s("circle", { class: "hit", cx: hx, cy: hy, r: 22 * scale }),
      s("circle", { cx: hx, cy: hy, r: 10 * scale }),
      s("text", { x: hx, y: hy + 4.5 * scale, "font-size": 13 * scale, "text-anchor": "middle", text: "↻" })));
  }
  if (tags) for (const [itemId, issue] of bad) {
    const item = state.items.find(i => i.id === itemId), label = issueText(issue);
    const w = label.length * 6.3 * scale + 14 * scale, ht = 19 * scale, poly = item.wall ? [[item.x, 0], [item.x, 12]] : R.footprint(item);
    const top = Math.min(...poly.map(p => p[1])), bottom = Math.max(...poly.map(p => p[1]));
    let y = item.wall ? 16 : top - 8 - ht;
    if (y < f.dimY + 8) y = bottom + 8;
    const x = clamp(item.x - w / 2, f.left + 4, f.right - w - 4);
    n.push(s("g", { class: "tag", transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` },
      s("rect", { width: w, height: ht, rx: 4 * scale }),
      s("text", { x: w / 2, y: ht / 2 + 4 * scale, "font-size": 11 * scale, "text-anchor": "middle", text: label })));
  }
  return n;
}
const KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
export function designPlan(st, { scale = 1, editable = false, tags = true } = {}) {
  const id = ++uid, help = `plan-help-${id}`;
  const svg = s("svg", { class: cls("plan", editable && "editable"), viewBox: frame(scale).view, tabindex: "0", role: "application",
    "aria-label": editable ? "Editable room plan" : "Room plan", "aria-describedby": help });
  const description = h("p", { class: "sr-only", id: help, text: editable
    ? "Numbers 1 to 4 select a piece. Arrow keys move it by 5 cm, with Shift by 1 cm; up and down set the height of wall art. R and Shift+R rotate by 15 degrees."
    : "Numbers 1 to 4 select a piece; it is highlighted in the photo too." });
  let drag = null;
  const toPlan = event => { const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse()); return [p.x, p.y]; };
  svg.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const handle = event.target.closest("[data-handle]"), hit = event.target.closest("[data-id]");
    const itemId = handle ? st.state.selected : hit?.dataset.id, item = st.state.items.find(i => i.id === itemId);
    if (!item) { st.set({ selected: null }); return; }
    if (!editable) { st.set({ selected: itemId }); return; }
    event.preventDefault();
    svg.focus({ preventScroll: true });
    const [x, y] = toPlan(event);
    drag = handle ? { rotate: true } : { dx: x - item.x, dy: y - item.y };
    svg.setPointerCapture(event.pointerId);
    st.set({ selected: itemId, dragging: true });
  });
  svg.addEventListener("pointermove", event => {
    if (!drag) return;
    const [x, y] = toPlan(event);
    edit(st, item => {
      if (drag.rotate) item.angle = Math.round((Math.atan2(y - item.y, x - item.x) * 180 / Math.PI - 90) / 5) * 5;
      else if (item.wall) item.x = x - drag.dx;
      else { item.x = x - drag.dx; item.y = y - drag.dy; }
    });
  });
  const end = () => { if (drag) { drag = null; st.set({ dragging: false }); } };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) svg.addEventListener(type, end);
  svg.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const piece = R.PIECES.find(p => String(p.n) === event.key);
    if (piece) { event.preventDefault(); st.set({ selected: piece.id }); return; }
    if (event.key === "Escape") { st.set({ selected: null }); return; }
    if (!editable) return;
    const step = event.shiftKey ? 1 : 5, delta = KEYS[event.key];
    if (delta) {
      event.preventDefault();
      if (!st.state.selected) st.set({ selected: R.PIECES[0].id });
      edit(st, item => { item.x += delta[0] * step; if (item.wall) item.z -= delta[1] * step; else item.y += delta[1] * step; });
    } else if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      edit(st, item => { if (!item.wall) item.angle += event.shiftKey ? -15 : 15; });
    }
  });
  st.listen(state => svg.replaceChildren(...shell(ALL, scale, id), ...pieceLayer(state, { scale, id, editable, tags })));
  return h("div", { class: "plan-box" }, svg, description);
}

// ---------- capture ----------
const TAP_STEPS = R.CAPTURE.flatMap(step => step.taps.map((_, i) => ({ step, last: i === step.taps.length - 1 })));
const SHUTTER = [600, 716];
function advance(cs) {
  const { count } = cs.state;
  if (count >= R.TAPS.length) return;
  const shutter = R.TAPS[count] === "shutter";
  cs.set({ count: count + 1, flash: shutter && !motion.matches });
  if (shutter) setTimeout(() => cs.set({ flash: false }), 500);
}
export function capturePhoto(cs, { scale = 1 } = {}) {
  const svg = s("svg", { viewBox: "0 0 1200 800", preserveAspectRatio: "none", tabindex: "0", role: "button", "aria-label": "Place the next capture point" });
  const wrap = h("div", { class: "photo capture" }, h("img", { src: "/photos/capture.jpg", alt: "The room before capture, with the armchair that stays", width: "1200", height: "800", draggable: "false" }), svg);
  const dots = [];
  for (let x = 15; x < 420; x += 30) for (let y = 15; y < 360; y += 30) {
    if (Math.hypot(x - R.KEPT.x, y - R.KEPT.y) < 58) continue;
    const [u, v] = P([x, y, 0]);
    if (u > 0 && u < 1200 && v > 0 && v < 800) dots.push([u, v]);
  }
  svg.addEventListener("pointerdown", event => {
    const { count } = cs.state;
    if (count >= R.TAPS.length || event.button !== 0) return;
    const r = svg.getBoundingClientRect(), x = (event.clientX - r.left) / r.width * 1200, y = (event.clientY - r.top) / r.height * 800;
    const [tx, ty] = R.TAPS[count] === "shutter" ? SHUTTER : P(R.TAPS[count]);
    if (Math.hypot(x - tx, y - ty) <= 120) advance(cs);
  });
  svg.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); advance(cs); } });
  cs.listen(state => {
    const k = R.progress(state.count), n = [];
    const line = (a, b, c) => { const [x1, y1] = P(a), [x2, y2] = P(b); return s("line", { class: c, x1, y1, x2, y2 }); };
    n.push(s("g", { class: "afloor" }, dots.map(([x, y]) => s("circle", { cx: x, cy: y, r: 2.6 * scale }))));
    if (k.back) n.push(line([k.left ? 0 : -170, 0, 0], [k.right ? 420 : 590, 0, 0], "aline"));
    if (k.left) n.push(line([0, 0, 0], [0, 420, 0], "aline"));
    if (k.right) n.push(line([420, 0, 0], [420, 420, 0], "aline"));
    const corner = (p, hidden) => { const [x, y] = P(p); return s("circle", { class: cls("acorner", hidden && "hidden"), cx: x, cy: y, r: 15 * scale }); };
    if (k.back && k.left) n.push(corner([0, 0, 0], true));
    if (k.back && k.right) n.push(corner([420, 0, 0]));
    if (k.height) {
      const [x1, y1] = P([200, 0, 0]), [x2, y2] = P([200, 0, 265]), w = 92 * scale, ht = 30 * scale, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      n.push(s("g", { class: "ahigh" }, s("line", { x1, y1, x2, y2 }), s("circle", { cx: x1, cy: y1, r: 5 * scale }), s("circle", { cx: x2, cy: y2, r: 5 * scale }),
        s("rect", { x: mx - w / 2, y: my - ht / 2, width: w, height: ht, rx: ht / 2 }), s("text", { x: mx, y: my + 6 * scale, "font-size": 17 * scale, "text-anchor": "middle", text: "265 cm" })));
    }
    const quad = points => s("polygon", { class: "aopen", points: pts(points.map(P)) });
    if (k.window) n.push(quad([[260, 0, 103.5], [384, 0, 103.5], [384, 0, 230.5], [260, 0, 230.5]]));
    if (k.door) n.push(quad([[420, 240, 0], [420, 330, 0], [420, 330, 210], [420, 240, 210]]));
    if (k.kept) {
      const c = R.corners(R.KEPT).map(P), edges = [];
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        edges.push([c[i * 2], c[j * 2]], [c[i * 2 + 1], c[j * 2 + 1]], [c[i * 2], c[i * 2 + 1]]);
      }
      n.push(s("g", { class: "akeep" }, edges.map(([a, b]) => s("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }))));
    }
    for (const tap of R.TAPS.slice(0, state.count)) if (tap !== "shutter") { const [x, y] = P(tap); n.push(s("circle", { class: "atap", cx: x, cy: y, r: 7 * scale })); }
    if (state.count < R.TAPS.length) {
      const tap = R.TAPS[state.count];
      if (tap === "shutter") n.push(s("g", { class: "shutter", transform: `translate(${SHUTTER[0]} ${SHUTTER[1]})` }, s("circle", { class: "o", r: 36 * scale }), s("circle", { class: "i", r: 27 * scale })));
      else { const [x, y] = P(tap); n.push(s("g", { class: "target", transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, s("circle", { class: "pulse", r: 26 * scale }), s("circle", { class: "core", r: 8 * scale }))); }
    }
    svg.replaceChildren(...n);
    svg.setAttribute("aria-label", state.count < R.TAPS.length ? (R.TAPS[state.count] === "shutter" ? "Take the photo" : "Place the next capture point") : "Capture complete");
    wrap.classList.toggle("flash", state.flash);
  });
  return wrap;
}
export function capturePlan(cs, { scale = 1 } = {}) {
  const id = ++uid, svg = s("svg", { class: "plan", viewBox: frame(scale).view, role: "img", "aria-label": "Room plan built from the capture" });
  cs.listen(state => {
    const k = R.progress(state.count), n = shell(k, scale, id);
    const ring = (x, y, hidden) => s("circle", { class: cls("ring", hidden && "hidden"), cx: x, cy: y, r: 9 * scale });
    if (k.back && k.left) n.push(ring(0, 0, true));
    if (k.back && k.right) n.push(ring(420, 0));
    if (k.front) n.push(ring(0, 360), ring(420, 360));
    for (const tap of R.TAPS.slice(0, Math.min(state.count, 6))) n.push(s("circle", { class: "ptap", cx: tap[0], cy: tap[1], r: 4.5 * scale }));
    if (k.kept) n.push(keptShape(id, scale));
    svg.replaceChildren(...n);
  });
  return svg;
}
export function captureChips(cs) {
  const chips = h("div", { class: "chips" }), status = h("p", { class: "sr-only", role: "status" });
  cs.listen(state => {
    let start = 0;
    const nodes = R.CAPTURE.map(step => {
      const end = start + step.taps.length, phase = state.count >= end ? "done" : state.count >= start ? "active" : "todo";
      start = end;
      return h("span", { class: `chip ${phase}`, "aria-current": phase === "active" ? "step" : null }, h("i", { "aria-hidden": "true" }), step.label);
    });
    if (state.count) nodes.push(h("button", { type: "button", class: "chip-reset", "aria-label": "Restart capture", title: "Restart", text: "↺", onclick: event => {
      const photo = event.currentTarget.closest("figure")?.querySelector(".photo.capture svg");
      cs.set({ count: 0 });
      photo?.focus();
    } }));
    chips.replaceChildren(...nodes);
    const last = TAP_STEPS[state.count - 1];
    status.textContent = state.count === R.TAPS.length ? "Capture complete." : last?.last ? `${last.step.label} done.` : "";
  });
  return h("div", { class: "capture-steps" }, chips, status);
}

// ---------- photo ----------
export function photoView(st, { scale = 1, update = true } = {}) {
  const img = h("img", { alt: "Room photo with numbered furniture", width: "1200", height: "800", draggable: "false" });
  const svg = s("svg", { viewBox: "0 0 1200 800", preserveAspectRatio: "none" });
  const wrap = h("div", { class: "photo" }, img, svg, update && updateButton(st, "photo-update"));
  const select = id => st.set({ selected: id });
  svg.addEventListener("pointerdown", event => select(event.target.closest("[data-id]")?.dataset.id ?? null));
  svg.addEventListener("keydown", event => {
    const pin = event.target.closest("[data-id]");
    if (pin && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); select(pin.dataset.id); }
  });
  st.listen(state => {
    if (img.getAttribute("src") !== state.photoUrl) img.setAttribute("src", state.photoUrl);
    const bad = new Set(analysis(state.items).issues.map(issue => issue.id)), focused = svg.contains(document.activeElement) && document.activeElement.dataset.id, n = [];
    wrap.classList.toggle("stale", isStale(state));
    wrap.classList.toggle("busy", state.busy);
    state.items.forEach((item, i) => { if (moved(item, state.photoItems[i])) n.push(s("polygon", { class: "ghost", points: pts(R.outline(item).map(px)) })); });
    const sel = state.items.find(item => item.id === state.selected);
    if (sel) n.push(s("polygon", { class: "outline", points: pts(R.outline(sel).map(px)) }));
    for (const item of state.items) if (!item.kept) {
      const [x, y] = px(R.markerPoint(item));
      n.push(s("g", { class: cls("pin", item.id === state.selected && "sel", bad.has(item.id) && "bad"), "data-id": item.id, tabindex: "0", role: "button",
        "aria-label": `${item.n}, ${item.kind}`, "aria-pressed": String(item.id === state.selected), transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` },
        s("circle", { r: 17 * scale }), s("text", { y: 5.8 * scale, "font-size": 16 * scale, "text-anchor": "middle", text: item.n })));
    }
    svg.replaceChildren(...n);
    if (focused) svg.querySelector(`[data-id="${focused}"]`)?.focus();
  });
  return wrap;
}

// ---------- controls ----------
export function segmented(st) {
  const buttons = [0, 1, 2].map(i => h("button", { type: "button", "aria-label": `Layout ${i + 1}`, onclick: () => setLayout(st, i), text: String(i + 1) }));
  st.listen(state => buttons.forEach((button, i) => {
    button.classList.toggle("on", i === state.layout);
    button.setAttribute("aria-pressed", String(i === state.layout));
  }));
  return h("div", { class: "seg", role: "group", "aria-label": "Layout" }, h("span", { class: "seg-label", "aria-hidden": "true", text: "Layout" }), buttons);
}
export const unplaced = () => h("div", { class: "unplaced" }, h("i", { "aria-hidden": "true" }), h("b", { text: R.UNPLACED.name }), h("span", { text: R.UNPLACED.reason }));
export function selectedInfo(st) {
  const wrap = h("div", { class: "selinfo", "aria-live": "polite" });
  st.listen(state => {
    const item = state.items.find(i => i.id === state.selected);
    wrap.replaceChildren(...(item && !item.kept ? [h("span", { class: "n", text: String(item.n) }), h("b", { text: item.name }), h("span", { class: "k", text: item.kind }),
      h("span", { class: "dims", text: `${item.w} × ${item.d} × ${item.h} cm` })] : []));
  });
  return wrap;
}
// aria-disabled rather than disabled, so a button that just did its job keeps keyboard focus.
const unavailable = button => button.getAttribute("aria-disabled") === "true";
export function updateButton(st, className) {
  const button = h("button", { type: "button", class: className, onclick: () => { if (!unavailable(button)) updatePhoto(st); } });
  st.listen(state => {
    button.textContent = state.failed ? "Photo unavailable" : "Update photo";
    button.setAttribute("aria-disabled", String(state.failed || state.busy || !isStale(state)));
    button.classList.toggle("busy", state.busy);
  });
  return button;
}
export function resetButton(st, className) {
  const button = h("button", { type: "button", class: className, text: "Reset", onclick: () => { if (!unavailable(button)) setLayout(st, st.state.layout); } });
  st.listen(state => button.setAttribute("aria-disabled", String(!isEdited(state))));
  return button;
}
const RULES = [["wall", "Inside the room"], ["overlap", "No overlap, in 3D"], ["door", "Door swing clear"], ["window", "Window clear"], ["path", "60 cm path to every piece"]];
export function rulesList(st) {
  const list = h("ul", { class: "rules" }), status = h("p", { class: "sr-only", role: "status" });
  st.listen(state => {
    const { issues } = analysis(state.items), broken = new Set(issues.map(issue => (issue.rule === "cover" ? "window" : issue.rule)));
    list.replaceChildren(...RULES.map(([key, label]) => h("li", { class: broken.has(key) ? "bad" : null }, h("i", { "aria-hidden": "true" }), label)));
    status.textContent = [...new Set(issues.map(issueText))].join(". ");
  });
  return h("div", { class: "rules-box" }, list, status);
}
