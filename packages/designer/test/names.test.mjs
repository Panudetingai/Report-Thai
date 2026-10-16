// ชื่อกรอบ/กลุ่มแบบ Figma: เลขถัดไป, ชื่อเริ่มต้น, ตั้งชื่อตอนเพิ่ม
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanName, frameLabel, groupLabel, nextFrameName, nextGroupName, withFrameNames } from "../src/names.js";
import { historyReducer, initialHistory } from "../src/state.js";

const rect = (extra = {}) => ({ type: "rectangle", x: 0, y: 0, w: 20, h: 10, ...extra });
const tpl = (elements) => ({ page: { size: "A4" }, bands: [{ type: "title", height: 40, elements }] });

test("เลขถัดไปของกรอบ/กลุ่มนับจากทั้งเทมเพลต", () => {
  assert.equal(nextFrameName(tpl([])), "กรอบ 1");
  assert.equal(nextFrameName(tpl([rect({ name: "กรอบ 1" }), rect({ name: "กรอบ 3" }), rect({ name: "ยอดรวม" })])), "กรอบ 4");
  assert.equal(nextGroupName(tpl([{ type: "text", group: "a", group_name: "กลุ่ม 2" }])), "กลุ่ม 3");
});

test("ตั้งชื่อเฉพาะกรอบใหม่ที่ยังไม่มีชื่อ และไม่ซ้ำกันเองในชุดเดียว", () => {
  const out = withFrameNames(tpl([rect({ name: "กรอบ 1" })]), [rect(), { type: "text" }, rect(), rect({ name: "เดิม" })]);
  assert.deepEqual(out.map((e) => e.name), ["กรอบ 2", undefined, "กรอบ 3", "เดิม"]);
});

test("ป้ายที่แสดงและการทำความสะอาดชื่อ", () => {
  assert.equal(frameLabel(rect()), "กรอบ");
  assert.equal(frameLabel(rect({ name: "  ยอดรวม " })), "ยอดรวม");
  assert.equal(groupLabel([{ group: "g" }, { group: "g", group_name: "หัวบิล" }], "g"), "หัวบิล");
  assert.equal(groupLabel([{ group: "g" }], "g"), "กลุ่ม");
  assert.equal(cleanName("   "), undefined);
  assert.equal(cleanName("  กล่อง   ยอด "), "กล่อง ยอด");
});

test("reducer: เพิ่มกรอบแล้วได้ชื่ออัตโนมัติ (addEl / addElAt / addEls)", () => {
  let s = initialHistory(tpl([rect({ name: "กรอบ 1" })]), {});
  s = historyReducer(s, { type: "addEl", band: 0, element: rect() });
  s = historyReducer(s, { type: "addElAt", band: 0, element: rect(), x: 5, y: 5 });
  s = historyReducer(s, { type: "addEls", band: 0, elements: [rect({ name: "สำเนา" }), rect()], offset: 3 });
  assert.deepEqual(s.template.bands[0].elements.map((e) => e.name), ["กรอบ 1", "กรอบ 2", "กรอบ 3", "สำเนา", "กรอบ 4"]);
});
