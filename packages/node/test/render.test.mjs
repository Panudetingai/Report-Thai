// ทดสอบแพ็กเกจกับ addon จริง (ต้องรัน `npm run build` ก่อน)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { renderPdf, validateTemplate } = require(join(here, "..", "index.js"));
const templates = join(here, "..", "..", "..", "templates");

test("renderPdf คืน PDF จริงจาก template ตัวอย่าง", async () => {
  const tpl = readFileSync(join(templates, "receipt.json"), "utf8");
  const data = JSON.parse(readFileSync(join(templates, "receipt.data.json"), "utf8"));
  const pdf = await renderPdf(tpl, data);
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
});

test("renderPdf รับ object และไม่บล็อก: เรียกพร้อมกันหลายงานได้", async () => {
  const tpl = JSON.parse(readFileSync(join(templates, "quotation.json"), "utf8"));
  const data = JSON.parse(readFileSync(join(templates, "quotation.data.json"), "utf8"));
  const outs = await Promise.all([1, 2, 3].map(() => renderPdf(tpl, data)));
  for (const pdf of outs) assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
});

test("template เสียต้อง reject ด้วยข้อความที่อ่านรู้เรื่อง", async () => {
  await assert.rejects(renderPdf({ page: { size: "ไม่มีจริง" } }, {}), (e) => /template|size|ขนาด/i.test(String(e.message)));
});

test("validateTemplate คืนผลโดยไม่ throw", () => {
  const ok = validateTemplate(JSON.parse(readFileSync(join(templates, "receipt.json"), "utf8")));
  assert.equal(ok.ok, true);
  const bad = validateTemplate({ page: { size: "ไม่มีจริง" } });
  assert.equal(bad.ok, false);
  assert.ok(bad.error);
});

test("fontsDir ผิดได้ error ที่ชัดเจน", async () => {
  await assert.rejects(renderPdf({}, {}, { fontsDir: "/ไม่มีโฟลเดอร์นี้" }), /Sarabun|ฟอนต์|font|template/i);
});
