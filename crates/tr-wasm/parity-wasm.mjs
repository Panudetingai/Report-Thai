// Phase 0 ข้อ 3: WASM/native parity — รันด้วย node parity-wasm.mjs
// เทียบ wrap_thai + measure_thai_width ระหว่าง WASM (pkg-node) กับ native dump
import { readFileSync } from "node:fs";
import pkg from "./pkg-node/tr_wasm.js";
const { wrap_thai, measure_thai_width, segment_thai } = pkg;

import { join } from "node:path";
const root = join(import.meta.dirname, "..", "..");
const sentences = readFileSync(join(root, "tests/golden/th/sentences.txt"), "utf8").split("\n");
const fontPath =
  process.env.PARITY_FONT ||
  (process.platform === "win32"
    ? "C:\\Windows\\Fonts\\tahoma.ttf"
    : "/System/Library/Fonts/Supplemental/Arial Unicode.ttf");
const font = readFileSync(fontPath);
const native = JSON.parse(readFileSync(join(root, "target/spike/parity-native.json"), "utf8"));
const userDict = JSON.stringify(["วันที่", "เลขที่"]);
const MAX_W = 595.0 - 48.0 * 2.0;

let fail = 0;
for (let i = 0; i < native.length; i++) {
  const input = sentences[i];
  const wasmWrapped = JSON.parse(wrap_thai(font, input, 16.0, MAX_W, userDict));
  const same =
    wasmWrapped.length === native[i].wrapped.length &&
    wasmWrapped.every((w, j) => w === native[i].wrapped[j]);
  if (!same) {
    fail++;
    console.log(`MISMATCH line ${i + 1}:\n  native=${JSON.stringify(native[i].wrapped)}\n  wasm  =${JSON.stringify(wasmWrapped)}`);
  }
  for (const v of wasmWrapped) {
    const w = measure_thai_width(font, v, 16.0);
    const ref = native[i].widths[native[i].wrapped.indexOf(v)] ?? -1;
    if (Math.abs(w - ref) > 0.01) {
      fail++;
      console.log(`WIDTH DIFF line ${i + 1}: wasm=${w} native=${ref} (${v.slice(0, 20)}…)`);
    }
  }
  // sanity: segment ต้องได้คำเหมือน native (นับจำนวนจาก dump ไม่ได้ เลยตรวจไม่ว่าง)
  if (JSON.parse(segment_thai(input)).length === 0 && input.trim() !== "") {
    fail++;
    console.log(`EMPTY SEGMENT line ${i + 1}`);
  }
}
console.log(fail === 0 ? `PARITY OK: ${native.length} lines, wasm == native` : `PARITY FAIL: ${fail} diffs`);
process.exit(fail === 0 ? 0 : 1);
