// ระหว่างที่ @thaireport/* ยังไม่ขึ้น npm: แพ็กจาก repo นี้เป็นไฟล์ .tgz ไว้ใน vendor/ ให้ npm install ติดตั้งเหมือนจาก npm จริง
// (ไม่ใช้ file: ชี้ไปที่โฟลเดอร์ เพราะ symlink ทำให้ React ถูกโหลดสองชุดและ hook พัง)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const vendor = join(here, "../vendor");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

if (!existsSync(join(root, "packages/client/wasm/tr_wasm_bg.wasm"))) {
  console.error("ยังไม่มีไฟล์ WASM — รัน ./scripts/build-wasm.sh ที่ราก repo ก่อน (ต้องมี Rust + wasm-pack)");
  process.exit(1);
}
mkdirSync(vendor, { recursive: true });
execFileSync(npm, ["install"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
// @thaireport/node: ถ้ายังไม่ได้ build addon (ต้องมี Rust) แพ็กเกจก็ยังติดตั้งได้ — Route Handler จะตอบ 501 พร้อมวิธีแก้
if (!existsSync(join(root, "packages/node/thaireport.node"))) {
  console.warn("หมายเหตุ: ยังไม่ได้ build @thaireport/node — หน้าเว็บใช้ได้ปกติ ส่วน /api/quotation จะตอบ 501 (build: cd packages/node && npm run build)");
}
for (const pkg of ["client", "react", "node"]) {
  execFileSync(npm, ["pack", "--pack-destination", vendor], { cwd: join(root, "packages", pkg), stdio: "inherit", shell: process.platform === "win32" });
}
console.log("พร้อมแล้ว: npm install && npm run dev");
