// ทดสอบตรรกะที่ไม่ผูกกับ React: การผูกค่า (ให้ตรง engine), undo, แคตตาล็อก, CSV
import { test } from "node:test";
import assert from "node:assert/strict";
import { bindPreview, bindSegments, lookup, resolveExpr, tableSourceOf } from "../src/bind.js";
import { historyReducer, initialHistory } from "../src/state.js";
import { analyzeTemplate, buildCatalog, isSafeAuto, remapTemplate, suggestFields } from "../src/fields.js";
import { parseCsv } from "../src/csv.js";

const DATA = {
  company: { name: "บริษัท ก" },
  items: [{ name: "ปากกา", qty: 2, price: "10.00" }],
  products: [{ name: "สมุด", qty: 1 }],
};

test("item. คือ prefix ตายตัวของ engine ไม่ขึ้นกับชื่อ data source", () => {
  const row = DATA.products[0];
  assert.equal(bindPreview("{{ item.name }}", DATA, { row }), "สมุด");
  assert.equal(resolveExpr("item.name", DATA, { row }).value, "สมุด");
});

test("items[0].name ใช้ได้เหมือน engine", () => {
  assert.equal(bindPreview("{{ items[0].name }}", DATA), "ปากกา");
  assert.equal(lookup(DATA, "items[0].qty"), 2);
  assert.equal(lookup(DATA, "items[5].qty"), undefined);
});

test("ค่าที่ไม่พบ: engine ให้ว่าง แต่หน้าออกแบบคงตัวแปรไว้ให้เห็น", () => {
  assert.equal(bindPreview("{{ missing.x }}", DATA), "{{ missing.x }}");
  assert.deepEqual(bindSegments("ก {{ missing.x }}", DATA)[1], { raw: "{{ missing.x }}", reason: "missing" });
});

test("ฟังก์ชัน/ตัวกรองยังไม่รองรับ → unsupported", () => {
  assert.equal(resolveExpr("price | round", DATA).reason, "unsupported");
});

test("table ไม่ระบุ data_source ใช้ band หรือ items ตามที่ engine ทำ", () => {
  assert.equal(tableSourceOf({ type: "table" }, { dataSource: "products" }), "products");
  assert.equal(tableSourceOf({ type: "table" }, {}), "items");
  assert.equal(tableSourceOf({ type: "table", data_source: "x" }, { dataSource: "y" }), "x");
});

test("undo: แก้ค่าต่อเนื่องในช่องเดียวกันรวมเป็นขั้นเดียว", () => {
  let h = initialHistory({ bands: [{ type: "detail", height: 8, elements: [] }] }, DATA);
  for (const c of ["1", "12", "123"]) {
    h = historyReducer(h, { type: "patchBand", band: 0, patch: { name: c }, record: true, key: "band:0:name" });
  }
  assert.equal(h.past.length, 1);
});

test("undo: คลิกเฉยๆ (snapshot ไม่ทำให้เปลี่ยนค่า) ไม่ควรเกิดขั้นว่างใน flow ปกติ", () => {
  const template = { bands: [{ type: "detail", height: 8, elements: [{ type: "text", x: 0, y: 0, w: 10, h: 5, text: "a" }] }] };
  let h = initialHistory(template, DATA);
  h = historyReducer(h, { type: "patchEl", band: 0, el: 0, patch: { x: 2 }, record: true, key: "el:0:0:x" });
  h = historyReducer(h, { type: "undo" });
  assert.equal(h.template.bands[0].elements[0].x, 0);
  assert.equal(h.future.length, 1);
});

test("undo: การแก้ไขที่ไม่มี key ไม่ถูกรวมกัน และการ redo ทำงาน", () => {
  let h = initialHistory({ bands: [{ type: "detail", height: 8, elements: [] }] }, DATA);
  h = historyReducer(h, { type: "patchBand", band: 0, patch: { height: 3 }, record: true });
  h = historyReducer(h, { type: "patchBand", band: 0, patch: { height: 4 }, record: true });
  assert.equal(h.past.length, 2);
  h = historyReducer(h, { type: "undo" });
  h = historyReducer(h, { type: "redo" });
  assert.equal(h.template.bands[0].height, 4);
});

test("แคตตาล็อก: แยกค่าเดี่ยวกับรายการแถว และชนิดข้อมูล", () => {
  const c = buildCatalog({ doc: { no: "INV-1", date: "2026-10-15", total: 120.5 }, items: [{ name: "a", qty: 1, meta: { color: "red" } }] });
  assert.deepEqual(c.scalars.map((s) => [s.path, s.type]), [["doc.no", "ข้อความ"], ["doc.date", "วันที่"], ["doc.total", "ตัวเลข"]]);
  assert.equal(c.sources[0].name, "items");
  assert.ok(c.sources[0].fields.some((f) => f.path === "meta.color"));
});

test("analyzeTemplate: จับฟิลด์ที่ไม่มีในข้อมูล และแยกตามแถว", () => {
  const template = {
    bands: [
      { type: "title", height: 10, elements: [{ type: "text", text: "{{ company.name }} {{ company.nope }}" }] },
      { type: "detail", dataSource: "items", height: 8, elements: [{ type: "text", text: "{{ item.name }} {{ item.amt }}" }] },
    ],
  };
  const { problems } = analyzeTemplate(template, DATA);
  assert.deepEqual(problems.map((p) => [p.expr, p.source, p.reason]), [
    ["company.nope", null, "missing"],
    ["item.amt", "items", "missing"],
  ]);
});

test("analyzeTemplate: ไม่มีแถวข้อมูล → norows ไม่ใช่ missing", () => {
  const template = { bands: [{ type: "detail", dataSource: "items", height: 8, elements: [{ type: "text", text: "{{ item.name }}" }] }] };
  assert.equal(analyzeTemplate(template, {}).problems[0].reason, "norows");
});

test("suggestFields: เสนอฟิลด์ชื่อใกล้เคียง และ remapTemplate เปลี่ยนทั้ง template", () => {
  const catalog = buildCatalog({ items: [{ name: "a", amount: 5 }, { name: "b", amount: 7 }] });
  const template = {
    bands: [{ type: "detail", dataSource: "items", height: 8, elements: [{ type: "table", data_source: "items", columns: [{ header: "x", field: "{{ item.amt }}" }] }] }],
  };
  const { problems } = analyzeTemplate(template, { items: [{ name: "a", amount: 5 }] });
  const top = suggestFields(problems[0], catalog)[0];
  assert.equal(top.path, "amount");
  const next = remapTemplate(template, new Map([["item.amt", "item.amount"]]));
  assert.equal(next.bands[0].elements[0].columns[0].field, "{{ item.amount }}");
  assert.equal(template.bands[0].elements[0].columns[0].field, "{{ item.amt }}", "ไม่แก้ของเดิม");
});

test("CSV: quoted field, escaped quote, CRLF, BOM, ค่าเป็นข้อความ", () => {
  const rows = parseCsv('﻿no,name,code\r\n1,"ปากกา, ด้ามใหญ่",007\r\n2,"เขา ""ดี""",\r\n');
  assert.deepEqual(rows, [
    { no: "1", name: "ปากกา, ด้ามใหญ่", code: "007" },
    { no: "2", name: 'เขา "ดี"', code: "" },
  ]);
});

test("CSV: ข้อผิดพลาดที่ต้องแจ้ง", () => {
  assert.throws(() => parseCsv('a,b\n"x'), /ไม่ปิด/);
  assert.throws(() => parseCsv("a,a\n1,2"), /ซ้ำ/);
  assert.throws(() => parseCsv(""), /ไม่มีข้อมูล/);
});

test("ไม่จับคู่อัตโนมัติข้ามกลุ่ม: company.name ต้องไม่ถูกเดาเป็น customer.name", () => {
  const catalog = buildCatalog({ customer: { name: "ก", tax_id: "1" } });
  const template = { bands: [{ type: "title", height: 10, elements: [{ type: "text", text: "{{ company.name }}" }] }] };
  const { problems } = analyzeTemplate(template, { customer: { name: "ก", tax_id: "1" } });
  const top = suggestFields(problems[0], catalog)[0];
  assert.equal(top.path, "customer.name", "ยังแนะนำให้เลือกได้");
  assert.equal(isSafeAuto(problems[0], top), false, "แต่ไม่ใช้อัตโนมัติ");
});

test("จับคู่อัตโนมัติได้เมื่ออยู่กลุ่มเดียวกัน และฟิลด์ในแถวที่ชื่อใกล้กัน", () => {
  const catalog = buildCatalog({ company: { name: "ก", tax_id: "1" }, items: [{ name: "a", amount: 1 }] });
  const scalar = analyzeTemplate({ bands: [{ type: "title", height: 10, elements: [{ type: "text", text: "{{ company.tax }}" }] }] }, { company: { name: "ก", tax_id: "1" } }).problems[0];
  assert.equal(isSafeAuto(scalar, suggestFields(scalar, catalog)[0]), true);
  const row = analyzeTemplate({ bands: [{ type: "detail", dataSource: "items", height: 8, elements: [{ type: "text", text: "{{ item.amt }}" }] }] }, { items: [{ name: "a", amount: 1 }] }).problems[0];
  assert.equal(isSafeAuto(row, suggestFields(row, catalog)[0]), true);
});

// ---- กติกา band รายการที่มีตาราง (engine วาดซ้ำทั้ง band ต่อแถว ถ้ามี element อื่นอยู่ด้วย) ----
import { countStrays, initialHistory as init2, historyReducer as reduce, normalizeTemplate, planMove, planPlacement } from "../src/state.js";

const tableBand = () => ({
  type: "detail",
  dataSource: "items",
  height: 8,
  elements: [{ type: "table", x: 0, y: 0, w: 180, h: 8, data_source: "items", columns: [{ width: 180, header: "h", field: "{{ item.name }}" }] }],
});
const summaryBand = () => ({ type: "summary", height: 10, elements: [] });
const textEl = (extra = {}) => ({ type: "text", x: 0, y: 0, w: 60, h: 8, text: "ข้อความ", ...extra });

test("วาง element อื่นลง band ตาราง → ไปที่ band สรุปที่ต่อจากตาราง (สร้างให้ถ้ายังไม่มี)", () => {
  const t = { bands: [{ type: "title", height: 10, elements: [] }, tableBand()] };
  const plan = planPlacement(t, 1, "text");
  assert.equal(plan.template.bands.length, 3);
  assert.equal(plan.template.bands[plan.band].type, "summary");
  assert.equal(plan.template.bands[1].elements.length, 1, "band ตารางยังมีตารางอย่างเดียว");
  assert.equal(plan.elIndex, 0);
});

test("ถ้ามี band สรุปอยู่แล้ว ใช้ band นั้น ไม่สร้างซ้ำ", () => {
  const t = { bands: [tableBand(), summaryBand()] };
  const plan = planPlacement(t, 0, "text");
  assert.equal(plan.band, 1);
  assert.equal(plan.template.bands.length, 2);
});

test("วางตารางลง band รายการที่มีตารางอยู่แล้ว → แจ้ง error", () => {
  assert.ok(planPlacement({ bands: [tableBand()] }, 0, "table").error);
});

test("วางตารางลง band รายการที่มี element อื่น → ย้าย element เดิมออกก่อน", () => {
  const band = { type: "detail", dataSource: "items", height: 8, elements: [textEl({ text: "เดิม" })] };
  const plan = planPlacement({ bands: [band] }, 0, "table");
  assert.equal(plan.template.bands[0].elements.length, 0);
  assert.equal(plan.template.bands[1].elements[0].text, "เดิม");
});

test("normalizeTemplate: เทมเพลตที่มี element ค้างใน band ตาราง (จากไฟล์เก่า) ถูกย้ายออกให้ถูกกติกา", () => {
  const t = { bands: [{ type: "detail", dataSource: "items", height: 8, elements: [textEl(), { ...tableBand().elements[0] }] }] };
  assert.equal(countStrays(t), 1);
  const n = normalizeTemplate(t);
  assert.equal(countStrays(n), 0);
  assert.equal(n.bands.find((b) => b.type === "detail").elements.length, 1);
  assert.equal(n.bands.find((b) => b.type === "summary").elements[0].text, "ข้อความ");
});

test("normalizeTemplate: เรียง band ตามลำดับมาตรฐาน", () => {
  const n = normalizeTemplate({ bands: [summaryBand(), { type: "title", height: 10, elements: [] }] });
  assert.deepEqual(n.bands.map((b) => b.type), ["title", "summary"]);
});

test("initialHistory และ load ทำให้เทมเพลตถูกกติกาเสมอ", () => {
  const h = init2({ bands: [{ type: "detail", dataSource: "items", height: 8, elements: [textEl(), tableBand().elements[0]] }] }, {});
  assert.equal(countStrays(h.template), 0);
});

test("addEl: ข้อความที่เพิ่มลง band ตาราง ไปอยู่ band สรุป และ undo ได้", () => {
  let h = init2({ bands: [tableBand()] }, {});
  h = reduce(h, { type: "addEl", band: 0, element: textEl() });
  assert.equal(h.template.bands.length, 2);
  assert.equal(countStrays(h.template), 0);
  assert.equal(h.template.bands[1].elements.length, 1);
  h = reduce(h, { type: "undo" });
  assert.equal(h.template.bands.length, 1);
});

test("transferEl: ลากข้อความจาก band อื่นไปวางใต้ตาราง → band สรุป", () => {
  const t = { bands: [{ type: "title", height: 10, elements: [textEl()] }, tableBand()] };
  let h = init2(t, {});
  h = reduce(h, { type: "transferEl", fromBand: 0, fromEl: 0, toBand: 1, x: 3, y: 4, record: false });
  assert.equal(h.template.bands[0].elements.length, 0);
  assert.equal(countStrays(h.template), 0);
  const sum = h.template.bands.find((b) => b.type === "summary");
  assert.equal(sum.elements.length, 1);
});

test("planMove: ให้ผลเหมือน transferEl (ใช้เลือก element หลังย้ายใน UI)", () => {
  const t = { bands: [{ type: "title", height: 10, elements: [textEl()] }, tableBand()] };
  const plan = planMove(t, 0, 0, 1);
  assert.equal(plan.template.bands[plan.band].type, "summary");
  assert.equal(plan.elIndex, 0);
});

test("ย้ายข้อความระหว่าง band ทั่วไปไม่ถูกเปลี่ยนเส้นทาง", () => {
  const t = { bands: [{ type: "title", height: 10, elements: [textEl()] }, summaryBand()] };
  const plan = planMove(t, 0, 0, 1);
  assert.equal(plan.band, 1);
  assert.equal(plan.template.bands.length, 2);
});

// ---- หลาย element พร้อมกัน ----
test("patchEls: แก้หลาย element พร้อมกันเป็นขั้น undo เดียว และคงพื้นที่ band", () => {
  const band = { type: "title", height: 20, elements: [textEl({ x: 1, y: 1 }), textEl({ x: 30, y: 2 })] };
  let h = initialHistory({ page: { size: "A4", margin: [15, 15, 15, 15] }, bands: [band] }, {});
  h = reduce(h, { type: "patchEls", band: 0, changes: [{ ei: 0, patch: { x: 5 } }, { ei: 1, patch: { x: 500 } }], record: true });
  const els = h.template.bands[0].elements;
  assert.equal(els[0].x, 5);
  assert.ok(els[1].x + els[1].w <= 180 + 0.01, "ไม่ล้นพื้นที่เนื้อหา");
  assert.equal(h.past.length, 1);
  h = reduce(h, { type: "undo" });
  assert.equal(h.template.bands[0].elements[0].x, 1);
});

test("addEls: คัดลอกต่อท้าย band และเลื่อนเล็กน้อย", () => {
  let h = initialHistory({ page: { size: "A4", margin: [15, 15, 15, 15] }, bands: [{ type: "title", height: 20, elements: [textEl({ x: 1, y: 1 })] }] }, {});
  h = reduce(h, { type: "addEls", band: 0, elements: [textEl({ x: 1, y: 1 })], offset: 3 });
  assert.equal(h.template.bands[0].elements.length, 2);
  assert.equal(h.template.bands[0].elements[1].x, 4);
});

test("removeEls: ลบหลาย element พร้อมกัน", () => {
  let h = initialHistory({ bands: [{ type: "title", height: 20, elements: [textEl(), textEl(), textEl()] }] }, {});
  h = reduce(h, { type: "removeEls", band: 0, indexes: [0, 2] });
  assert.equal(h.template.bands[0].elements.length, 1);
});
