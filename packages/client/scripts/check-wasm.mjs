// กันการ publish แพ็กเกจที่ไม่มี WASM: ต้องรัน scripts/build-wasm.sh ที่ราก repo ก่อน
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../wasm");
const missing = ["tr_wasm.js", "tr_wasm_bg.wasm"].filter((f) => !existsSync(join(dir, f)));
if (missing.length) {
  console.error(`@thaireport/client: ไม่พบ ${missing.join(", ")} ใน wasm/ — รัน ./scripts/build-wasm.sh ที่ราก repo ก่อน`);
  process.exit(1);
}
