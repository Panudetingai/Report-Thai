/** template JSON ของ ThaiReport (ดูคู่มือ crates/tr-mcp/src/guide.md) */
export type ReportTemplate = Record<string, unknown>;
/** ข้อมูลที่ผูกกับ {{ }} ใน template */
export type ReportData = Record<string, unknown>;

export interface InitOptions {
  /** ไบต์หรือ URL ของ tr_wasm_bg.wasm — ใช้เมื่อวางไฟล์ไว้ที่ CDN เอง */
  binary?: BufferSource | URL | string;
  /** URL ของ tr_wasm.js (ใช้ในเทสต์) */
  moduleUrl?: string;
}

export interface PreviewResult {
  ok: boolean;
  /** PDF เป็น base64 (เมื่อ ok) */
  pdf_base64?: string;
  bytes?: number;
  page_count?: number;
  /** ข้อความผิดพลาดที่อ่านรู้เรื่อง (เมื่อไม่ ok) */
  error?: string;
}

export interface ValidateResult {
  ok: boolean;
  error?: string;
}

/** โหลด WASM ครั้งเดียว (ฟังก์ชันอื่นเรียกให้เอง) */
export function initThaireport(opts?: InitOptions): Promise<unknown>;
/** WASM โหลดเสร็จแล้วหรือยัง */
export function isReady(): boolean;
/** ตรวจโครงสร้าง template */
export function validateTemplate(template: ReportTemplate | string): Promise<ValidateResult>;
/** template + data → ไบต์ PDF (throw เมื่อ template ผิด) */
export function renderPdf(template: ReportTemplate | string, data: ReportData | string): Promise<Uint8Array>;
/** เหมือน renderPdf แต่ไม่ throw และบอกจำนวนหน้า */
export function previewTemplate(template: ReportTemplate | string, data: ReportData | string): Promise<PreviewResult>;
