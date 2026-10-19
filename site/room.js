// Room model in centimetres: x along the photographed wall, y into the room, z up.
// The checks illustrate the engine's rules; they do not run its layout search.
export const ROOM = { w: 420, d: 360, h: 265 };
export const WINDOW = { x0: 260, x1: 384, sill: 103.5, top: 230.5 };
export const DOOR = { hinge: [420, 330], leaf: 90 };
// Camera of the photos, in Three.js metres (see room-scene.js).
export const CAMERA = { pos: [.3, 2.15, 3.8], target: [0, 1, -.45], aspect: 1.5 };
export const KEPT = { id: "chair", name: "POÄNG", kind: "Armchair", w: 68, d: 82, h: 100, x: 60, y: 62, angle: -45, kept: true };
export const PIECES = [
  { id: "sofa", n: 1, name: "KLIPPAN", kind: "Sofa", w: 180, d: 88, h: 66 },
  { id: "table", n: 2, name: "LISABO", kind: "Coffee table", w: 118, d: 50, h: 50 },
  { id: "bookcase", n: 3, name: "BILLY", kind: "Bookcase", w: 80, d: 28, h: 202 },
  { id: "painting", n: 4, name: "Wall art", kind: "Wall art", w: 60, d: 3.5, h: 80, wall: true },
];
export const UNPLACED = { name: "Floor lamp", reason: "Size missing" };
// [x, y, angle] for floor pieces, [x, z] for wall art; angle 0 puts a piece's back to the photographed wall.
const LAYOUTS = [
  { sofa: [210, 44, 0], table: [210, 160, 0], bookcase: [14, 200, -90], painting: [210, 150], rug: [210, 170, 0] },
  { sofa: [44, 220, -90], table: [160, 220, -90], bookcase: [170, 14, 0], painting: [75, 160], rug: [170, 220, 90] },
  { sofa: [322, 44, 0], table: [322, 160, 0], bookcase: [14, 175, -90], painting: [170, 150], rug: [300, 170, 0] },
];
export function layout(index) {
  return [{ ...KEPT }, ...PIECES.map(piece => {
    const [x, b, angle = 0] = LAYOUTS[index][piece.id];
    return piece.wall ? { ...piece, x, y: piece.d / 2, z: b, angle } : { ...piece, x, y: b, angle };
  })];
}
export const rugAt = index => { const [x, y, angle] = LAYOUTS[index].rug; return { id: "rug", x, y, angle }; };

// Capture taps, in order: two per wall, ceiling, window corners, door corners, kept furniture, shutter.
export const CAPTURE = [
  { key: "walls", label: "Walls", taps: [[170, 0, 0], [330, 0, 0], [0, 140, 0], [0, 280, 0], [420, 30, 0], [420, 170, 0]] },
  { key: "height", label: "Height", taps: [[200, 0, 265]] },
  { key: "window", label: "Window", taps: [[260, 0, 103.5], [384, 0, 230.5]] },
  { key: "door", label: "Door", taps: [[420, 240, 0], [420, 240, 210]] },
  { key: "furniture", label: "Furniture", taps: [[60, 62, 50]] },
  { key: "photo", label: "Photo", taps: ["shutter"] },
];
export const TAPS = CAPTURE.flatMap(step => step.taps);
// The front wall is behind the camera; it closes once both side walls are traced.
export const progress = n => ({ back: n >= 2, left: n >= 4, right: n >= 6, front: n >= 6, height: n >= 7, window: n >= 9, door: n >= 11, kept: n >= 12, photo: n >= 13 });

export function footprint(item) {
  const a = item.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [
    item.x + u * item.w / 2 * c - v * item.d / 2 * s,
    item.y + u * item.w / 2 * s + v * item.d / 2 * c,
  ]);
}
// Separating-axis test for convex polygons; touching edges do not overlap.
function overlaps(a, b) {
  return [a, b].every(polygon => polygon.every((point, i) => {
    const next = polygon[(i + 1) % polygon.length], axis = [point[1] - next[1], next[0] - point[0]];
    const [p, q] = [a, b].map(shape => shape.map(([x, y]) => x * axis[0] + y * axis[1]));
    return Math.max(...p) > Math.min(...q) + 1e-6 && Math.max(...q) > Math.min(...p) + 1e-6;
  }));
}
export const doorSwing = [DOOR.hinge, ...Array.from({ length: 17 }, (_, i) => {
  const a = Math.PI / 2 * i / 16;
  return [DOOR.hinge[0] - DOOR.leaf * Math.cos(a), DOOR.hinge[1] - DOOR.leaf * Math.sin(a)];
})];
const windowZone = [[WINDOW.x0, 0], [WINDOW.x1, 0], [WINDOW.x1, 60], [WINDOW.x0, 60]];
function distance(px, py, polygon) {
  let inside = false, best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[j], [bx, by] = polygon[i];
    if ((by > py) !== (ay > py) && px < (ax - bx) * (py - by) / (ay - by) + bx) inside = !inside;
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
  }
  return inside ? 0 : best;
}
// A cell whose centre keeps 30 cm from walls and furniture can carry a 60 cm wide path.
// ponytail: 5 cm grid flood fill, fine for a handful of pieces; use a visibility graph if rooms get crowded.
const GRID = 5, COLS = ROOM.w / GRID, ROWS = ROOM.d / GRID, ENTRY = [390, 285];
export function walkway(items) {
  const solids = items.filter(item => !item.wall).map(footprint);
  const free = new Uint8Array(COLS * ROWS), reached = new Uint8Array(COLS * ROWS);
  const centre = i => [(i % COLS + .5) * GRID, (Math.floor(i / COLS) + .5) * GRID];
  for (let i = 0; i < free.length; i++) {
    const [x, y] = centre(i);
    free[i] = Math.min(x, y, ROOM.w - x, ROOM.d - y) >= 30 && solids.every(p => distance(x, y, p) >= 30) ? 1 : 0;
  }
  let start = -1, best = 25;
  for (let i = 0; i < free.length; i++) {
    const d = Math.hypot(centre(i)[0] - ENTRY[0], centre(i)[1] - ENTRY[1]);
    if (free[i] && d < best) { best = d; start = i; }
  }
  const queue = start < 0 ? [] : [start];
  if (start >= 0) reached[start] = 1;
  while (queue.length) {
    const i = queue.shift(), c = i % COLS, r = (i - c) / COLS;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, n = nr * COLS + nc;
      if (nc >= 0 && nr >= 0 && nc < COLS && nr < ROWS && free[n] && !reached[n]) { reached[n] = 1; queue.push(n); }
    }
  }
  const cut = items.filter(item => !item.wall && !reached.some((hit, i) => hit && distance(...centre(i), footprint(item)) <= 36)).map(item => item.id);
  return { reached, cut, grid: GRID, cols: COLS };
}

export function check(items) {
  const issues = [], add = (id, rule, other) => issues.push(other ? { id, rule, other } : { id, rule });
  const floor = items.filter(item => !item.wall), art = items.filter(item => item.wall);
  for (const item of items) {
    if (footprint(item).some(([x, y]) => x < -.5 || y < -.5 || x > ROOM.w + .5 || y > ROOM.d + .5)) add(item.id, "wall");
  }
  for (const [i, a] of floor.entries()) for (const b of floor.slice(i + 1)) {
    if (overlaps(footprint(a), footprint(b))) { add(a.id, "overlap", b.id); add(b.id, "overlap", a.id); }
  }
  for (const piece of art) {
    const left = piece.x - piece.w / 2, right = piece.x + piece.w / 2, low = piece.z - piece.h / 2, high = piece.z + piece.h / 2;
    if (right > WINDOW.x0 && left < WINDOW.x1 && high > WINDOW.sill && low < WINDOW.top) add(piece.id, "cover");
    for (const other of floor) {
      const p = footprint(other), xs = p.map(([x]) => x);
      // Only furniture standing against the wall can meet wall art; then heights decide (a mirror may hang above a dresser).
      if (p.some(([, y]) => y < 6) && Math.max(...xs) > left && Math.min(...xs) < right && other.h > low) add(piece.id, "overlap", other.id);
    }
  }
  for (const item of floor) {
    if (overlaps(footprint(item), doorSwing)) add(item.id, "door");
    if (item.h > WINDOW.sill && overlaps(footprint(item), windowZone)) add(item.id, "window");
  }
  // A blocked door already explains why nothing can be reached.
  if (!issues.some(issue => issue.rule === "door")) {
    for (const id of walkway(items).cut) if (!issues.some(issue => issue.id === id)) add(id, "path");
  }
  return issues;
}

// Projection through the photo camera; returns 0–1 image coordinates.
const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const length = Math.hypot(...a); return a.map(v => v / length); };
const FORWARD = unit(sub(CAMERA.target, CAMERA.pos)), RIGHT = unit(cross(FORWARD, [0, 1, 0])), UP = cross(RIGHT, FORWARD);
const HALF_HEIGHT = Math.tan(37 * Math.PI / 180) / CAMERA.aspect; // room-scene.js: vertical fov from a 74° horizontal fov
export function project([x, y, z]) {
  const d = sub([(x - 210) / 100, z / 100, (y - 180) / 100], CAMERA.pos), depth = dot(d, FORWARD);
  return [(dot(d, RIGHT) / (depth * HALF_HEIGHT * CAMERA.aspect) + 1) / 2, (1 - dot(d, UP) / (depth * HALF_HEIGHT)) / 2];
}
export function corners(item) {
  if (!item.wall) return footprint(item).flatMap(([x, y]) => [[x, y, 0], [x, y, item.h]]);
  const out = [];
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) for (const y of [0, item.d]) out.push([item.x + dx * item.w / 2, y, item.z + dz * item.h / 2]);
  return out;
}
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = list => list.reduce((out, q) => { while (out.length > 1 && turn(out.at(-2), out.at(-1), q) <= 0) out.pop(); out.push(q); return out; }, []);
  const lower = half(p), upper = half(p.reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
export const outline = item => hull(corners(item).map(project));
export const markerPoint = item => project(item.wall ? [item.x, item.y, item.z] : [item.x, item.y, item.h + 8]);
