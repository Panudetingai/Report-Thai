// ฟังก์ชันจัดรูปแบบใน {{ }} — ตัวแยกนิพจน์ต้องตรงกับ engine (tr-core/src/expr.rs) และตัวตรวจการออกแบบต้องรู้จัก
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExpr, toSource } from "../src/expr.ts";
import { analyzeTemplate, remapTemplate } from "../src/fields.ts";
import { designDisplay } from "../src/bind.ts";

test("parseExpr: รูปแบบเดียวกับ engine", () => {
  assert.deepEqual(parseExpr("item.name"), { kind: "path", value: "item.name" });
  assert.equal(toSource(parseExpr(" number( item.amount , 0 ) ")), "number(item.amount, 0)");
  assert.equal(toSource(parseExpr("thaidate(doc.date, 'short')")), 'thaidate(doc.date, "short")');
  assert.equal(toSource(parseExpr("bahttext(sum(item.amount))")), "bahttext(sum(item.amount))");
  for (const bad of ["number(", "number(a b", "x)", "number(a,)", '"open', "a.b(c)"]) {
    assert.equal(parseExpr(bad), null, bad);
  }
});

const DATA = { total: 10, doc: { date: "2026-10-17" }, items: [{ amount: 10, cat: "A" }] };
const text = (t) => ({ type: "text", x: 0, y: 0, w: 50, h: 5, text: t });

test("ตัวตรวจ: ฟังก์ชันจัดรูปแบบผูกได้ ตรวจฟิลด์ข้างใน", () => {
  const tpl = {
    bands: [
      { type: "title", height: 5, elements: [text("{{ bahttext(total) }} {{ thaidate(doc.date, 'short') }}")] },
      { type: "detail", dataSource: "items", height: 5, elements: [text("{{ number(item.amount) }}")] },
      { type: "summary", height: 5, elements: [text("{{ bahttext(sum(item.amount)) }} {{ thaidigits(count()) }}")] },
    ],
  };
  assert.deepEqual(analyzeTemplate(tpl, DATA).problems, []);
});

test("ตัวตรวจ: ฟิลด์หายในฟังก์ชันชี้ไปที่ฟิลด์ · ฟังก์ชันไม่รู้จัก · รวมค่าผิดที่", () => {
  const tpl = {
    bands: [
      { type: "title", height: 5, elements: [text("{{ number(totl) }} {{ format(total) }}")] },
      { type: "detail", dataSource: "items", height: 5, elements: [text("{{ bahttext(sum(item.amount)) }}")] },
    ],
  };
  const got = analyzeTemplate(tpl, DATA).problems.map((p) => [p.expr, p.reason]);
  assert.deepEqual(got, [
    ["totl", "missing"],
    ["format(total)", "unsupported"],
    ["bahttext(sum(item.amount))", "aggregate"],
  ]);
});

test("จับคู่ฟิลด์ใหม่ได้แม้อยู่ในฟังก์ชัน", () => {
  const tpl = { bands: [{ type: "title", height: 5, elements: [text("{{ totl }} / {{ number(totl, 0) }}")] }] };
  const out = remapTemplate(tpl, new Map([["totl", "total"]]));
  assert.equal(out.bands[0].elements[0].text, "{{ total }} / {{ number(total, 0) }}");
});

test("ป้ายบนกระดาษออกแบบ: ฟิลด์หายในฟังก์ชันขึ้นเตือน", () => {
  assert.equal(designDisplay("{{ number(total) }}", DATA), "[Total]");
  assert.equal(designDisplay("{{ bahttext(total) }}", DATA), "[Total] (ตัวอักษร)");
});
