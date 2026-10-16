/**
 * @thaireport/client — browser WASM engine (Phase 2)
 * เนื้อหาไทยบน PDF มาจาก engine Rust ใน WASM ไม่ใช่ DOM text
 */

const WASM_PKG = new URL("../../../crates/tr-wasm/pkg-web/tr_wasm.js", import.meta.url);
// URL ของไบนารีอ้างแบบตรง ให้ bundler (Vite/webpack) คัดลอกไฟล์ .wasm ไปที่ build ด้วย
const WASM_BIN = new URL("../../../crates/tr-wasm/pkg-web/tr_wasm_bg.wasm", import.meta.url);

let initPromise = null;
let api = null;

/**
 * โหลด WASM ครั้งเดียว (เรียกซ้ำได้ คืน promise เดิม)
 * @param {{ moduleUrl?: string, binary?: BufferSource | URL }} [opts]  ใช้ในเทสต์/ไม่มี fetch: ส่ง binary เป็นไบต์ตรง ๆ
 */
export function initThaireport(opts = {}) {
  if (api) return Promise.resolve(api);
  initPromise ??= (async () => {
    const mod = await import(opts.moduleUrl ?? WASM_PKG.href);
    await mod.default(opts.binary ?? WASM_BIN);
    api = mod;
    return mod;
  })();
  return initPromise;
}

/** โหลด WASM เสร็จแล้วหรือยัง (ไม่เริ่มโหลดเอง) */
export function isReady() {
  return api !== null;
}

/** ตรวจ template JSON */
export async function validateTemplate(template) {
  const { validate_template } = await initThaireport();
  const json = typeof template === "string" ? template : JSON.stringify(template);
  return JSON.parse(validate_template(json));
}

/**
 * เรนเดอร์ template + data → Uint8Array PDF
 * @param {object|string} template
 * @param {object|string} data
 */
export async function renderPdf(template, data) {
  const { render_template_pdf } = await initThaireport();
  const t = typeof template === "string" ? template : JSON.stringify(template);
  const d = typeof data === "string" ? data : JSON.stringify(data);
  return render_template_pdf(t, d);
}

/**
 * พรีวิว designer — คืน `{ ok, pdf_base64?, bytes?, page_count?, error? }`
 * ไม่ throw: template เสียได้ error ที่อ่านรู้เรื่องกลับมาให้หน้าจอแสดง
 */
export async function previewTemplate(template, data) {
  const { preview_template } = await initThaireport();
  const t = typeof template === "string" ? template : JSON.stringify(template);
  const d = typeof data === "string" ? data : JSON.stringify(data);
  return JSON.parse(preview_template(t, d));
}
