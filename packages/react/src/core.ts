// งานที่ไม่ผูกกับ React — แยกไว้ให้ทดสอบใน Node ได้ตรงๆ
import { previewTemplate, type ReportData, type ReportTemplate } from "@thaireport/client";

export type { ReportData, ReportTemplate };

export interface RenderedReport {
  /** ไบต์ของไฟล์ PDF */
  pdf: Uint8Array;
  /** จำนวนหน้า */
  pages: number;
}

/** template + data → PDF (throw Error ที่อ่านรู้เรื่องเมื่อ template ผิด) */
export async function renderReport(template: ReportTemplate | string, data: ReportData | string = {}): Promise<RenderedReport> {
  const res = await previewTemplate(template, data);
  if (!res.ok || !res.pdf_base64) throw new Error(res.error || "สร้าง PDF ไม่สำเร็จ");
  return { pdf: base64ToBytes(res.pdf_base64), pages: res.page_count ?? 1 };
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * คีย์ที่เปลี่ยนเมื่อเนื้อหาเปลี่ยนเท่านั้น — ผู้ใช้มักส่ง object ใหม่ทุกครั้งที่ render
 * (เช่น `data={{ ...order }}`) ถ้าเทียบด้วยตัวอ้างอิงจะสร้าง PDF ใหม่ไม่หยุด
 */
export function contentKey(template: unknown, data: unknown): string {
  const s = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v ?? null));
  return `${s(template)}\u0000${s(data)}`;
}

/** ให้ browser ดาวน์โหลดไบต์เป็นไฟล์ */
export function saveBytes(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // บาง browser เริ่มดาวน์โหลดหลัง click คืนค่า — รอสักครู่ก่อนคืนหน่วยความจำ
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
