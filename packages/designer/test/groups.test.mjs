// กลุ่มซ้อนในหน้าออกแบบ — กติกาจับคู่ต้องตรงกับ engine (tr-core Template::group_levels)
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupLevels, historyReducer, initialHistory } from "../src/state.ts";

const band = (type, extra = {}) => ({ type, height: 8, elements: [], ...extra });

test("groupLevels: ไม่ระบุ groupBy ที่ท้ายกลุ่ม → ท้ายกลุ่มแรกคู่กับชั้นในสุด", () => {
  const t = { bands: [band("groupHeader", { groupBy: "item.region" }), band("groupHeader", { groupBy: "item.cat" }), band("detail"), band("groupFooter"), band("groupFooter")] };
  assert.deepEqual(groupLevels(t), [
    { key: "item.region", header: 0, footer: 4 },
    { key: "item.cat", header: 1, footer: 3 },
  ]);
});

test("groupLevels: ระบุ groupBy ที่ท้ายกลุ่ม → จับคู่ตามฟิลด์", () => {
  const t = { bands: [band("groupHeader", { groupBy: "a" }), band("groupHeader", { groupBy: "b" }), band("groupFooter", { groupBy: "a" }), band("groupFooter")] };
  assert.deepEqual(groupLevels(t).map((l) => [l.key, l.footer]), [["a", 2], ["b", 3]]);
});

test("เพิ่มกลุ่มย่อย แล้วลบหัวกลุ่มชั้นใน → ท้ายกลุ่มคู่กันหายด้วย", () => {
  const t0 = { schemaVersion: "1.0", page: { size: "A4" }, bands: [band("groupHeader", { groupBy: "item.region" }), band("detail", { dataSource: "items" }), band("groupFooter"), band("summary")] };
  let h = initialHistory(t0, {});
  h = historyReducer(h, { type: "addGroupLevel", groupBy: "item.cat" });
  // หน้าออกแบบเรียง band ตามลำดับมาตรฐาน (รายการก่อนหัวกลุ่ม) — engine ไม่สนตำแหน่งของหัวกลุ่ม
  assert.deepEqual(h.template.bands.map((b) => b.type), ["detail", "groupHeader", "groupHeader", "groupFooter", "groupFooter", "summary"]);
  const levels = groupLevels(h.template);
  assert.deepEqual(levels.map((l) => [l.key, l.header, l.footer]), [["item.region", 1, 4], ["item.cat", 2, 3]], "ท้ายกลุ่มเดิมยังคู่กับชั้นนอก");
  h = historyReducer(h, { type: "removeBand", band: 2 });
  assert.deepEqual(h.template.bands.map((b) => b.type), ["detail", "groupHeader", "groupFooter", "summary"]);
});

test("ส่วนเนื้อหา (section) คงลำดับเดิมเมื่อสลับกับรายการ — ลำดับนี้คือลำดับที่ engine พิมพ์", async () => {
  const { normalizeTemplate } = await import("../src/state.ts");
  const t = { bands: [band("summary"), band("section", { name: "ก" }), band("detail"), band("section", { name: "ข" }), band("title")] };
  assert.deepEqual(normalizeTemplate(t).bands.map((b) => b.name ?? b.type), ["title", "ก", "detail", "ข", "summary"]);
});
