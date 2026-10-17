// คอมไพล์ tr-node (release) แล้วคัดลอกไบนารีกับฟอนต์มาไว้ในแพ็กเกจ
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const env = { ...process.env };

execFileSync("cargo", ["build", "-p", "tr-node", "--release"], { cwd: root, stdio: "inherit", env });

const lib = {
  darwin: "libtr_node.dylib",
  linux: "libtr_node.so",
  win32: "tr_node.dll",
}[process.platform];
if (!lib) throw new Error(`ไม่รองรับแพลตฟอร์ม ${process.platform}`);
copyFileSync(join(root, "target", "release", lib), join(here, "..", "thaireport.node"));

const fontsOut = join(here, "..", "fonts");
mkdirSync(fontsOut, { recursive: true });
const fontsIn = join(root, "fonts");
for (const f of readdirSync(fontsIn)) {
  if (f.endsWith(".ttf") || /^OFL.*\.txt$/.test(f)) copyFileSync(join(fontsIn, f), join(fontsOut, f));
}
if (!existsSync(join(fontsOut, "Sarabun-Regular.ttf"))) throw new Error("ไม่พบ Sarabun-Regular.ttf");
console.log("@thaireport/node พร้อมใช้งาน");
