/// <reference types="node" />

export interface RenderOptions {
  /** โฟลเดอร์ที่มี Sarabun-Regular.ttf (ค่าเริ่มต้น: ฟอนต์ที่มากับแพ็กเกจ) */
  fontsDir?: string;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/** เรนเดอร์ template + data เป็น PDF (รันบน thread pool ไม่บล็อก event loop) */
export function renderPdf(template: object | string, data?: object | string, options?: RenderOptions): Promise<Buffer>;

/** ตรวจ template โดยไม่เรนเดอร์ */
export function validateTemplate(template: object | string): ValidationResult;

export const DEFAULT_FONTS_DIR: string;
