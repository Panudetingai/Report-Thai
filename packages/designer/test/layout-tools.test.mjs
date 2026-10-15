import { test } from "node:test";
import assert from "node:assert/strict";
import { alignChanges, groupMembers } from "../src/layout-tools.js";

const els = [
  { x: 10, y: 5, w: 20, h: 10 },
  { x: 50, y: 20, w: 30, h: 6 },
  { x: 100, y: 40, w: 10, h: 10 },
];
// คืนทุก element หลังใช้ patch (รายการที่ไม่ถูกแก้คงค่าเดิม)
const apply = (changes) => {
  const out = els.map((e) => ({ ...e }));
  for (const c of changes) out[c.ei] = { ...out[c.ei], ...c.patch };
  return out;
};

test("ชิดซ้าย/ขวา/บน/ล่าง", () => {
  assert.deepEqual(apply(alignChanges(els, [0, 1, 2], "left", 0, 180)).map((e) => e.x), [10, 10, 10]);
  assert.deepEqual(apply(alignChanges(els, [0, 1, 2], "right", 0, 180)).map((e) => e.x + e.w), [110, 110, 110]);
  assert.deepEqual(apply(alignChanges(els, [0, 1, 2], "top", 0, 180)).map((e) => e.y), [5, 5, 5]);
  assert.deepEqual(apply(alignChanges(els, [0, 1, 2], "bottom", 0, 180)).map((e) => e.y + e.h), [50, 50, 50]);
});

test("กึ่งกลาง: จุดกึ่งกลางของแต่ละรายการตรงกับกลางของกลุ่ม", () => {
  const out = apply(alignChanges(els, [0, 1, 2], "hcenter", 0, 180));
  const centers = out.map((e) => e.x + e.w / 2);
  assert.ok(centers.every((c) => Math.abs(c - 60) < 0.01), JSON.stringify(centers));
});

test("เว้นระยะแนวนอนเท่ากัน: ตัวแรกและตัวสุดท้ายคงที่", () => {
  const out = apply(alignChanges(els, [0, 1, 2], "distH", 0, 180));
  assert.equal(out[0].x, 10);
  assert.equal(out[2].x, 100);
  const gap1 = out[1].x - (out[0].x + out[0].w);
  const gap2 = out[2].x - (out[1].x + out[1].w);
  assert.ok(Math.abs(gap1 - gap2) < 0.01);
});

test("เว้นระยะต้องมีอย่างน้อย 3 รายการ", () => {
  assert.deepEqual(alignChanges(els, [0, 1], "distH", 0, 180), []);
});

test("ความกว้าง/ความสูงเท่ากับรายการหลัก", () => {
  const out = apply(alignChanges(els, [0, 1, 2], "sameW", 2, 180));
  assert.deepEqual(out.map((e) => e.w), [10, 10, 10]);
});

test("groupMembers: ไม่มีกลุ่มคืนตัวเอง มีกลุ่มคืนทั้งกลุ่ม", () => {
  const g = [{ group: "a" }, {}, { group: "a" }];
  assert.deepEqual(groupMembers(g, 1), [1]);
  assert.deepEqual(groupMembers(g, 0), [0, 2]);
});
