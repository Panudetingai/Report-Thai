// ต้นไม้เลเยอร์แบบ Figma: กรอบเป็นพ่อ, กลุ่มเป็น node, เรียงบนสุดก่อน
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLayerTree, nodeIndexes, parentFrameOf } from "../src/layers.ts";

const frame = { type: "rectangle", x: 0, y: 0, w: 100, h: 50 };
const inner = { type: "rectangle", x: 10, y: 10, w: 40, h: 20 };
const t = (x, y, extra = {}) => ({ type: "text", x, y, w: 10, h: 5, ...extra });

const shape = (nodes) => nodes.map((n) => (n.children.length ? [n.kind, n.ei ?? n.group, shape(n.children)] : [n.kind, n.ei ?? n.group]));

test("ของในกรอบอยู่ใต้กรอบ และเลือกกรอบที่ใกล้ที่สุด", () => {
  const els = [frame, inner, t(12, 12), t(60, 10), t(200, 0)];
  assert.equal(parentFrameOf(els, 2), 1);
  assert.equal(parentFrameOf(els, 3), 0);
  assert.equal(parentFrameOf(els, 4), -1);
  assert.deepEqual(shape(buildLayerTree(els)), [
    ["el", 4],
    ["frame", 0, [["el", 3], ["frame", 1, [["el", 2]]]]],
  ]);
});

test("กลุ่มเป็น node ของตัวเอง อยู่ในกรอบเมื่อสมาชิกอยู่ในกรอบเดียวกัน", () => {
  const els = [frame, t(5, 5, { group: "g1" }), t(20, 5, { group: "g1" }), t(200, 0)];
  assert.deepEqual(shape(buildLayerTree(els)), [
    ["el", 3],
    ["frame", 0, [["group", "g1", [["el", 2], ["el", 1]]]]],
  ]);
});

test("กลุ่มที่มีกรอบเป็นสมาชิก: ของในกรอบยังอยู่ใต้กรอบ", () => {
  const els = [{ ...frame, group: "g" }, t(5, 5), t(200, 0, { group: "g" })];
  const tree = buildLayerTree(els);
  assert.deepEqual(shape(tree), [["group", "g", [["el", 2], ["frame", 0, [["el", 1]]]]]]);
  assert.deepEqual(nodeIndexes(tree[0]), [0, 1, 2]);
});

test("กรอบที่อยู่ชั้นบนของข้อความ (กรอบเส้นโปร่ง) ก็ยังเป็นพ่อ", () => {
  assert.deepEqual(shape(buildLayerTree([t(5, 5), frame])), [["frame", 1, [["el", 0]]]]);
});

test("กลุ่มสมาชิกเดียวไม่สร้าง node", () => {
  assert.deepEqual(shape(buildLayerTree([t(0, 0, { group: "solo" })])), [["el", 0]]);
});
