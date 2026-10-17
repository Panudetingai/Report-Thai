#!/usr/bin/env node
/**
 * Phase 2: WASM/native parity — template ตัวอย่าง 3 ฉบับ
 * เกณฑ์: PDF bytes ตรงกัน หรือภาพ raster (pdf.js) ต่าง ≤ VISUAL_MAX_DIFF พิกเซล
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const VISUAL_MAX_DIFF = 0.002; // 0.2% พิกเซล (tolerance Phase 2)
const SCALE = 1.5;

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const pdfjs = await import(
  join(root, "packages/designer/node_modules/pdfjs-dist/legacy/build/pdf.mjs")
);
// ใช้ @napi-rs/canvas (ตัว backend ของ canvas v3) ตรง ๆ — ไม่พึ่ง binding ของ canvas ที่ build ตามเครื่อง
const { createCanvas } = await import(
  join(root, "packages/designer/node_modules/@napi-rs/canvas/index.js"),
);
const pkg = join(here, "pkg-node", "tr_wasm.js");

if (!existsSync(pkg)) {
  console.error("ไม่พบ pkg-node — รัน scripts/build-wasm.sh ก่อน");
  process.exit(2);
}

const { render_template_pdf } = await import(pkg);

async function rasterPdf(pdfBytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: SCALE });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return ctx.getImageData(0, 0, viewport.width, viewport.height);
}

function visualDiffRatio(a, b) {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let diff = 0;
  const n = a.data.length;
  for (let i = 0; i < n; i += 4) {
    const dr = Math.abs(a.data[i] - b.data[i]);
    const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
    const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (dr + dg + db > 24) diff++;
  }
  return diff / (n / 4);
}

const templates = [
  ["invoice-full", "templates/invoice-full.json", "templates/invoice-full.data.json"],
  ["quotation", "templates/quotation.json", "templates/quotation.data.json"],
  ["receipt", "templates/receipt.json", "templates/receipt.data.json"],
];

let fail = 0;
for (const [name, tpl, data] of templates) {
  const tplPath = join(root, tpl);
  const dataPath = join(root, data);
  const templateJson = readFileSync(tplPath, "utf8");
  const dataJson = readFileSync(dataPath, "utf8");

  const nativeOut = join(root, "target", "phase2-parity", `${name}-native.pdf`);
  const cargo = process.env.CARGO || "cargo";
  const render = spawnSync(
    cargo,
    [
      "run",
      "-p",
      "tr-cli",
      "--",
      "render",
      tplPath,
      dataPath,
      "-o",
      nativeOut,
      "--fonts",
      join(root, "fonts"),
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: process.env,
    },
  );
  if (render.status !== 0) {
    console.error(`native render ${name} ล้มเหลว:\n${render.stderr}`);
    fail++;
    continue;
  }
  const nativePdf = readFileSync(nativeOut);
  const nativeHash = createHash("sha256").update(nativePdf).digest("hex");

  let wasmPdf;
  try {
    wasmPdf = render_template_pdf(templateJson, dataJson);
  } catch (e) {
    console.error(`WASM render ${name} ล้มเหลว: ${e}`);
    fail++;
    continue;
  }
  const wasmHash = createHash("sha256").update(wasmPdf).digest("hex");

  if (nativeHash === wasmHash) {
    console.log(`OK ${name}: PDF bytes ตรงกัน (${nativePdf.length} bytes)`);
    continue;
  }

  const [imgN, imgW] = await Promise.all([rasterPdf(nativePdf), rasterPdf(wasmPdf)]);
  const ratio = visualDiffRatio(imgN, imgW);
  if (ratio <= VISUAL_MAX_DIFF) {
    console.log(
      `OK ${name}: bytes ต่างเล็กน้อย (native ${nativePdf.length}B wasm ${wasmPdf.length}B) แต่ภาพ raster ตรงใน tolerance (${(ratio * 100).toFixed(3)}%)`,
    );
  } else {
    fail++;
    console.log(
      `FAIL ${name}: bytes+ภาพไม่ตรง — diff ${(ratio * 100).toFixed(2)}% (native ${nativeHash.slice(0, 12)} wasm ${wasmHash.slice(0, 12)})`,
    );
  }
}

console.log(
  fail === 0
    ? `PARITY OK: ${templates.length} templates (WASM ≈ native)`
    : `PARITY FAIL: ${fail} template(s)`,
);
process.exit(fail === 0 ? 0 : 1);
