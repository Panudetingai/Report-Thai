/**
 * วาดหน้าแรกของ PDF ลง canvas ด้วย pdf.js
 * - โหลด pdf.js แบบ lazy (ไม่ดึงไลบรารีนี้จนกว่าจะมีพรีวิวครั้งแรก)
 * - แคชเอกสารล่าสุดไว้ การซูมจึงวาดใหม่จาก PDF เดิมโดยไม่ parse ซ้ำ
 */
// pdf.js วางไว้ที่ public/pdfjs (คัดลอกจาก node_modules โดย scripts/copy-pdfjs.mjs)
// โหลดด้วย URL ตรงๆ ไม่ผ่าน bundler — Vite pre-bundle แล้ว worker ค้างจริง (ตรวจแล้ว)
// คำนวณ URL จาก document.baseURI ตอน runtime — Vite จะไม่วิเคราะห์ import ของไฟล์ใน public/
const PDFJS_URL = new URL("pdfjs/pdf.min.mjs", document.baseURI).href;
const PDFJS_WORKER_URL = new URL("pdfjs/pdf.worker.min.mjs", document.baseURI).href;

let pdfjsPromise = null;
let cache = { bytes: null, doc: null, promise: null };

function loadPdfjs() {
  pdfjsPromise ??= import(/* @vite-ignore */ PDFJS_URL).then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    return pdfjs;
  });
  return pdfjsPromise;
}

/** คืนเอกสาร pdf.js สำหรับ bytes นี้ (ใช้ซ้ำถ้า bytes เดิม) */
export async function loadDoc(pdfBytes) {
  if (cache.bytes === pdfBytes && cache.promise) return cache.promise;
  const pdfjs = await loadPdfjs();
  const old = cache.doc;
  const promise = pdfjs.getDocument({ data: pdfBytes.slice() }).promise;
  cache = { bytes: pdfBytes, doc: null, promise };
  const doc = await promise;
  if (cache.promise === promise) cache.doc = doc;
  if (old && old !== doc) old.destroy();
  return doc;
}

/**
 * วาดหน้าที่ 1 ลง canvas ให้กว้าง cssWidth (CSS px) สูงตามสัดส่วนหน้า
 * @param {{cancelled: boolean, cancel: (() => void) | null}} token
 */
export async function renderFirstPage(doc, canvas, cssWidth, token, pageNo = 1) {
  const page = await doc.getPage(pageNo);
  if (token.cancelled) return;
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: (cssWidth * dpr) / base.width });
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${viewport.height / dpr}px`;
  const task = page.render({ canvasContext: canvas.getContext("2d"), viewport });
  token.cancel = () => task.cancel();
  await task.promise;
}
