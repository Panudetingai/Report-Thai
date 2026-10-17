/**
 * @thaireport/client — engine PDF ใน browser (WASM ตัวเดียวกับ CLI/เซิร์ฟเวอร์ ได้ PDF ตรงกันทุกไบต์)
 * เนื้อหาไทยบน PDF มาจาก engine Rust ใน WASM ไม่ใช่ DOM text · ฟอนต์ Sarabun/Noto Sans Thai ฝังมาใน WASM แล้ว
 *
 * ไฟล์ WASM อยู่ใน `wasm/` ของแพ็กเกจนี้ (คัดลอกจาก crates/tr-wasm/pkg-web ด้วย scripts/build-wasm.sh)
 * path เขียนเป็นค่าคงที่ให้ bundler (Vite, webpack/Next.js, Turbopack) เห็นและคัดลอกไฟล์ไปที่ build เอง
 * โหลดแบบ lazy: ไฟล์ ~5 MB ถูกดึงเมื่อเรียกใช้ครั้งแรกเท่านั้น
 */

let initPromise = null;
let api = null;

/**
 * โหลด WASM ครั้งเดียว (เรียกซ้ำได้ คืน promise เดิม) — ทุกฟังก์ชันด้านล่างเรียกให้เอง ไม่ต้องเรียกก่อนก็ได้
 * @param {{ moduleUrl?: string, binary?: BufferSource | URL | string }} [opts]
 *   `binary`: ไบต์หรือ URL ของ tr_wasm_bg.wasm (เช่นวางไฟล์ไว้ที่ CDN เอง) · `moduleUrl`: ใช้ในเทสต์
 */
export function initThaireport(opts = {}) {
  if (api) return Promise.resolve(api);
  initPromise ??= (async () => {
    const mod = opts.moduleUrl ? await import(/* @vite-ignore */ /* webpackIgnore: true */ opts.moduleUrl) : await import("../wasm/tr_wasm.js");
    await mod.default({ module_or_path: opts.binary ?? new URL("../wasm/tr_wasm_bg.wasm", import.meta.url) });
    api = mod;
    return mod;
  })();
  // โหลดไม่สำเร็จ → ให้ลองใหม่ได้ (เช่นเน็ตหลุด) แทนการคืน promise ที่ล้มไว้ตลอด
  initPromise.catch(() => {
    initPromise = null;
  });
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
