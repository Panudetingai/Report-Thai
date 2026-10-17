// การรวมค่า (Phase 3): ตัวตรวจการออกแบบต้องยอมรับ sum/count/… เฉพาะ band ที่ engine แทนค่าได้
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeTemplate } from "../src/fields.ts";

const DATA = { items: [{ amount: 10, category: "A" }] };
const text = (t) => ({ type: "text", x: 0, y: 0, w: 50, h: 5, text: t });

test("sum ใน band สรุป/ท้ายกลุ่ม/หัวกลุ่มไม่ถูกตั้งปัญหา", () => {
  const tpl = {
    bands: [
      { type: "groupHeader", groupBy: "item.category", height: 5, elements: [text("หมวด {{ group.value }} {{ group.count }}")] },
      { type: "detail", dataSource: "items", height: 5, elements: [text("{{ item.amount }}")] },
      { type: "groupFooter", height: 5, elements: [text("รวม {{ sum(item.amount) }}")] },
      { type: "summary", height: 5, elements: [text("รวม {{ sum(item.amount, 0) }} {{ count() }}")] },
    ],
  };
  const { problems } = analyzeTemplate(tpl, DATA);
  assert.deepEqual(problems, []);
});

test("sum ใน band รายการถูกตั้งปัญหาว่าใช้ไม่ได้ที่นั่น", () => {
  const tpl = { bands: [{ type: "detail", dataSource: "items", height: 5, elements: [text("{{ sum(item.amount) }}")] }] };
  const { problems } = analyzeTemplate(tpl, DATA);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].reason, "aggregate");
});

import { describeAggregate, designDisplay } from "../src/bind.ts";

test("ป้ายการรวมบนกระดาษออกแบบอ่านรู้เรื่อง ไม่ขึ้นเป็นฟิลด์หาย", () => {
  assert.equal(describeAggregate("sum(item.amount)"), "รวม [Amount]");
  assert.equal(describeAggregate("sum(item.amount, 0)"), "รวม [Amount]");
  assert.equal(describeAggregate("count()"), "นับทั้งหมด");
  assert.equal(describeAggregate("group.value"), "[ค่ากลุ่ม]");
  assert.equal(describeAggregate("customer.name"), null);
  assert.equal(designDisplay("รวม {{ sum(item.amount) }} บาท", DATA), "รวม รวม [Amount] บาท");
});
