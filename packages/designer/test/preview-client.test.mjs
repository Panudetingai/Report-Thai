// กันบั๊กเดิม: เคยเก็บ InitOutput (raw wasm exports) ไว้เรียกตรง ๆ
// ทำให้ preview_template คืน [ptr, len] ดิบ แล้ว JSON.parse พังที่ position 7
// เทสต์นี้ต้องผ่าน "client wrapper" ไม่ใช่เรียก wasm-bindgen glue ตรง ๆ
//
// ข้ามการโหลดผ่าน document.baseURI ด้วยการส่ง binary เป็น bytes (ข้าม fetch)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

import { initThaireport, isReady, previewTemplate } from "../../client/src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const wasmDir = join(here, "../public/tr-wasm");

const wasmOpts = () => ({
  moduleUrl: pathToFileURL(join(wasmDir, "tr_wasm.js")).href,
  binary: readFileSync(join(wasmDir, "tr_wasm_bg.wasm")),
});

const TEMPLATE = {
  schemaVersion: "1.0",
  page: { size: "A4", margin: [15, 15, 15, 15], orientation: "portrait" },
  fonts: [{ family: "Sarabun", embed: true }],
  user_dict: [],
  bands: [
    { type: "title", height: 20, elements: [
      { type: "text", x: 0, y: 4, w: 180, h: 10, font: "Sarabun", size: 14, bold: true, align: "center", text: "หัวเรื่อง", overflow: "wrap" },
    ] },
    { type: "detail", dataSource: "items", height: 8, elements: [] },
  ],
};

test("initThaireport คืน promise เดิมเมื่อเรียกซ้ำ", async () => {
  const a = initThaireport(wasmOpts());
  const b = initThaireport(wasmOpts());
  assert.equal(a, b);
  await a;
  assert.equal(isReady(), true);
});

test("previewTemplate คืน PDF จริง (ไม่ใช่ error จาก JSON.parse)", async () => {
  await initThaireport(wasmOpts());
  const res = await previewTemplate(TEMPLATE, { items: [{ no: 1, name: "ตัวอย่าง", amount: "100.00" }] });

  assert.equal(res.ok, true, `render ไม่สำเร็จ: ${res.error}`);
  assert.equal(typeof res.pdf_base64, "string");
  assert.ok(res.page_count >= 1);
  assert.equal(res.bytes, Buffer.from(res.pdf_base64, "base64").length);
  assert.equal(Buffer.from(res.pdf_base64, "base64").subarray(0, 5).toString(), "%PDF-");
});

test("previewTemplate ข้อมูลหลายหน้านับ page_count ถูก", async () => {
  await initThaireport(wasmOpts());
  const items = Array.from({ length: 60 }, (_, i) => ({ no: i + 1, name: `รายการ ${i + 1}`, amount: "10.00" }));
  const res = await previewTemplate(TEMPLATE, { items });
  assert.equal(res.ok, true, `render ไม่สำเร็จ: ${res.error}`);
  assert.ok(res.page_count > 1, `ควรขึ้นหลายหน้า ได้ ${res.page_count}`);
});

test("template เสีย ต้องได้ error ที่อ่านรู้เรื่อง ไม่ใช่ throw", async () => {
  await initThaireport(wasmOpts());
  const res = await previewTemplate({ page: { size: "ไม่มีจริง" } }, {});
  assert.equal(res.ok, false);
  assert.match(res.error, /template/i);
});
