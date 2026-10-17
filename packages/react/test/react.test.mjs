// @thaireport/react ใน Node: สร้าง PDF ด้วย WASM จริง และ render ฝั่งเซิร์ฟเวอร์ (Next.js SSR) ต้องไม่พัง
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { initThaireport } from "@thaireport/client";
import { DownloadPdfButton, ReportViewer, renderReport } from "../dist/index.js";
import { contentKey } from "../dist/core.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const json = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const template = json("templates/receipt.json");
const data = json("templates/receipt.data.json");

// Node ไม่มี fetch สำหรับ file:// — ส่งไบต์ของ WASM ให้ตรงๆ (browser โหลดเองจาก URL ในแพ็กเกจ)
const clientDir = dirname(createRequire(import.meta.url).resolve("@thaireport/client"));
await initThaireport({ binary: readFileSync(join(clientDir, "../wasm/tr_wasm_bg.wasm")) });

test("renderReport ได้ PDF จริงพร้อมจำนวนหน้า", async () => {
  const { pdf, pages } = await renderReport(template, data);
  assert.equal(new TextDecoder().decode(pdf.slice(0, 5)), "%PDF-");
  assert.equal(pages, 1);
});

test("template ผิด → Error ที่อ่านรู้เรื่อง", async () => {
  await assert.rejects(renderReport({ schemaVersion: "9.9", bands: [] }, {}), /schemaVersion/);
});

test("contentKey เปลี่ยนเมื่อเนื้อหาเปลี่ยนเท่านั้น (object ใหม่ที่เนื้อหาเดิม = คีย์เดิม)", () => {
  assert.equal(contentKey(template, { ...data }), contentKey(template, structuredClone(data)));
  assert.notEqual(contentKey(template, data), contentKey(template, { ...data, total: "1" }));
});

test("SSR: ReportViewer แสดงสถานะกำลังสร้าง ไม่แตะ browser API", () => {
  const html = renderToString(createElement(ReportViewer, { template, data, loading: "รอสักครู่" }));
  assert.match(html, /data-status="loading"/);
  assert.match(html, /รอสักครู่/);
  assert.doesNotMatch(html, /<iframe/);
});

test("SSR: ไม่มี template → idle ไม่ขึ้นข้อความกำลังสร้าง", () => {
  const html = renderToString(createElement(ReportViewer, { template: null }));
  assert.match(html, /data-status="idle"/);
  assert.doesNotMatch(html, /กำลังสร้าง/);
});

test("SSR: DownloadPdfButton เป็นปุ่มที่กดได้", () => {
  const html = renderToString(createElement(DownloadPdfButton, { template, data, className: "btn" }, "ดาวน์โหลดใบเสร็จ"));
  assert.match(html, /<button type="button" class="btn"[^>]*>ดาวน์โหลดใบเสร็จ<\/button>/);
});
