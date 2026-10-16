// กรอบแบบ Figma frame: ลูกในกรอบ, การวางของลงกรอบ, ลำดับซ้อนกรอบอยู่ใต้ของข้างใน
import { test } from "node:test";
import assert from "node:assert/strict";
import { frameAt, frameChildren, placeInFrame, settleOrder, textBoxInFrame, withFrameChildren } from "../src/frames.js";
import { historyReducer, initialHistory } from "../src/state.js";

const frame = { type: "rectangle", x: 10, y: 10, w: 60, h: 30 };
const inText = { type: "text", x: 12, y: 12, w: 40, h: 8, text: "ใน" };
const outText = { type: "text", x: 80, y: 12, w: 20, h: 8, text: "นอก" };
const half = { type: "text", x: 60, y: 12, w: 20, h: 8, text: "ครึ่ง" };

test("ลูกของกรอบ = อยู่ข้างในทั้งชิ้น ไม่ว่าจะอยู่ชั้นไหน (เหมือน Figma)", () => {
  assert.deepEqual(frameChildren([frame, inText, outText, half], 0), [1]);
  // กรอบเส้นขอบโปร่งที่วาดทับข้อความ (กรอบอยู่ชั้นบน) ก็ยังเป็นพ่อ
  assert.deepEqual(frameChildren([inText, frame], 1), [0]);
  assert.deepEqual(frameChildren([inText, frame], 0), []);
  // กล่องเท่ากันพอดี: ตัวล่างเป็นพ่อ ไม่เป็นพ่อลูกกันเอง
  assert.deepEqual(frameChildren([frame, { ...frame }], 0), [1]);
  assert.deepEqual(frameChildren([frame, { ...frame }], 1), []);
});

test("เลือกกรอบ = ได้ของข้างในทุกชั้นด้วย", () => {
  const inner = { type: "rectangle", x: 12, y: 20, w: 30, h: 15 };
  const deep = { type: "text", x: 14, y: 22, w: 10, h: 5 };
  assert.deepEqual(withFrameChildren([frame, inner, deep, outText], [0]), [0, 1, 2]);
  assert.deepEqual(withFrameChildren([frame, inner, deep, outText], [3]), [3]);
});

test("วางข้อความลงในกรอบ: กว้างเต็มกรอบและอยู่ข้างใน", () => {
  const el = { type: "text", w: 80, h: 8 };
  assert.deepEqual(placeInFrame([frame], el, 30, 38), { frame: 0, x: 11.5, y: 30.5, w: 57, h: 8 });
  assert.equal(placeInFrame([frame], el, 5, 5), null);
  assert.equal(placeInFrame([frame], { type: "table", w: 10, h: 10 }, 30, 20), null);
  assert.equal(frameAt([frame, { ...frame, x: 20 }], 25, 20), 1);
});

test("ข้อความเต็มกรอบเมื่อดับเบิลคลิกกรอบ", () => {
  assert.deepEqual(textBoxInFrame(frame), { x: 11.5, y: 11.5, w: 57, h: 27 });
});

test("วาดกรอบครอบข้อความเดิม: กรอบถอยไปอยู่ใต้ข้อความ", () => {
  assert.deepEqual(settleOrder([outText, inText, frame]), [0, 2, 1]);
  assert.equal(settleOrder([frame, inText, outText]), null);
  // กรอบซ้อนกรอบ: กรอบนอกอยู่ใต้สุด
  const inner = { type: "rectangle", x: 12, y: 12, w: 20, h: 10 };
  const order = settleOrder([inText, inner, frame]);
  assert.deepEqual(order.indexOf(2) < order.indexOf(0), true);
});

test("reducer setOrder จัดลำดับตามที่ส่งมา", () => {
  const tpl = { page: { size: "A4" }, bands: [{ type: "title", height: 50, elements: [inText, frame] }] };
  const s0 = initialHistory(tpl, {});
  const s1 = historyReducer(s0, { type: "setOrder", band: 0, order: [1, 0], record: true });
  assert.deepEqual(s1.template.bands[0].elements.map((e) => e.type), ["rectangle", "text"]);
  assert.equal(s1.past.length, 1);
  assert.equal(historyReducer(s0, { type: "setOrder", band: 0, order: [0], record: true }), s0);
});
