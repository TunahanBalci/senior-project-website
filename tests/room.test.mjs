import test from "node:test";
import assert from "node:assert/strict";
import { layout, check, project, progress, TAPS, PIECES } from "../site/room.js";

const move = (index, id, changes) => {
  const items = layout(index);
  Object.assign(items.find(item => item.id === id), changes);
  return items;
};
const has = (issues, expected) => issues.some(issue => Object.entries(expected).every(([key, value]) => issue[key] === value));

test("the three layouts pass every check", () => {
  for (const index of [0, 1, 2]) assert.deepEqual(check(layout(index)), [], `layout ${index + 1}`);
});

test("each rule names the piece that breaks it", () => {
  assert.ok(has(check(move(0, "table", { x: 400, y: 160 })), { id: "table", rule: "wall" }));
  const stacked = check(move(0, "table", { x: 210, y: 44 }));
  assert.ok(has(stacked, { id: "table", rule: "overlap", other: "sofa" }));
  assert.ok(has(stacked, { id: "sofa", rule: "overlap", other: "table" }));
  assert.ok(has(check(move(0, "table", { x: 380, y: 290 })), { id: "table", rule: "door" }));
  assert.deepEqual(check(move(0, "bookcase", { x: 345, y: 14, angle: 0 })), [{ id: "bookcase", rule: "window" }]);
  assert.ok(has(check(move(0, "painting", { x: 300 })), { id: "painting", rule: "cover" }));
  assert.ok(has(check(move(0, "painting", { z: 80 })), { id: "painting", rule: "overlap", other: "sofa" }), "wall art lowered into the sofa overlaps in 3D");
  assert.ok(has(check(move(0, "table", { x: 73, y: 200, angle: -90 })), { id: "bookcase", rule: "path" }), "a table parked in front of the bookcase cuts its path");
});

test("a blocked door does not also report every piece as unreachable", () => {
  const issues = check(move(0, "table", { x: 380, y: 290 }));
  assert.equal(issues.filter(issue => issue.rule === "path").length, 0);
});

test("pieces keep their published sizes", () => {
  assert.deepEqual(PIECES.map(({ id, w, d, h }) => [id, w, d, h]), [
    ["sofa", 180, 88, 66], ["table", 118, 50, 50], ["bookcase", 80, 28, 202], ["painting", 60, 3.5, 80],
  ]);
});

test("projection matches the camera used for the photos", () => {
  const close = ([u, v], [x, y]) => Math.abs(u - x / 1200) < .002 && Math.abs(v - y / 800) < .002;
  assert.ok(close(project([420, 0, 0]), [899, 489]), "back-right floor corner");
  assert.ok(close(project([0, 0, 0]), [340, 475]), "back-left floor corner");
  for (const tap of TAPS.filter(t => t !== "shutter")) {
    const [u, v] = project(tap);
    assert.ok(u > 0 && u < 1 && v > 0 && v < 1, `tap ${tap} is inside the photo`);
  }
});

test("capture progress unlocks steps in order", () => {
  assert.deepEqual(progress(0), { back: false, left: false, right: false, front: false, height: false, window: false, door: false, kept: false, photo: false });
  assert.equal(progress(6).front, true);
  assert.equal(progress(6).height, false);
  assert.equal(progress(TAPS.length).photo, true);
});
