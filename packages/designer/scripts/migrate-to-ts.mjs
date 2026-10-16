/**
 * One-time: rename src/*.js(x) → ts(x) and strip .js/.jsx from relative imports.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) out.push(...walk(p));
    else if (/\.(js|jsx)$/.test(name.name)) out.push(p);
  }
  return out;
}

function stripRelExt(content) {
  return content.replace(/from\s+(["'])(\.\.?\/[^"']+)\.(js|jsx)\1/g, "from $1$2$1");
}

const files = walk(src);
for (const file of files) {
  let text = fs.readFileSync(file, "utf8");
  text = stripRelExt(text);
  const next = file.replace(/\.jsx$/, ".tsx").replace(/\.js$/, ".ts");
  fs.writeFileSync(next, text, "utf8");
  if (next !== file) fs.unlinkSync(file);
}

console.log(`Migrated ${files.length} files under src/`);
