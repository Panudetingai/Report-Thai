// คัดลอก tr-wasm (engine ตัวเดียวกับ CLI) ไปไว้ใต้ public/ เพื่อให้โหลดด้วย URL ตรงๆ ได้
// เหตุผลเดียวกับ pdf.js: bundler ไม่ต้องจัดการ wasm และไฟล์ใหญ่ (~5 MB) จะได้ถูก cache แยก
// ตาม URL ไม่ถูกรีบิลด์ทุกครั้งที่แก้โค้ดฝั่ง UI
//
// ต้อง build ก่อน:  wasm-pack build crates/tr-wasm --target web --out-dir pkg-web --release
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const designer = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(designer, "../../crates/tr-wasm/pkg-web");
const dst = join(designer, "public/tr-wasm");

const files = ["tr_wasm.js", "tr_wasm_bg.wasm"];
const missing = files.filter((f) => !existsSync(join(src, f)));
if (missing.length) {
  console.error(`ไม่พบ ${missing.join(", ")} ใน ${src}`);
  console.error("build ก่อน:  wasm-pack build crates/tr-wasm --target web --out-dir pkg-web --release");
  process.exit(1);
}

mkdirSync(dst, { recursive: true });
for (const f of files) copyFileSync(join(src, f), join(dst, f));
console.log("copied tr-wasm →", dst);
