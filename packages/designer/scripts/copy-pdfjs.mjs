// คัดลอก pdf.js (ที่ใช้ใน designer) ไปไว้ใต้ public/ เพื่อให้โหลดด้วย URL ตรงๆ ได้
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/pdfjs-dist/build");
const dst = join(root, "public/pdfjs");
mkdirSync(dst, { recursive: true });
for (const f of ["pdf.min.mjs", "pdf.worker.min.mjs"]) copyFileSync(join(src, f), join(dst, f));
console.log("copied pdf.js →", dst);
