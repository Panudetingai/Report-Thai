"use client";
/**
 * @thaireport/react — แสดงและดาวน์โหลดรายงาน PDF ภาษาไทยใน React (สร้างใน browser ด้วย WASM ไม่ต้องมีเซิร์ฟเวอร์)
 *
 * - <ReportViewer template data />      แสดง PDF ในหน้าเว็บ
 * - <DownloadPdfButton template data /> ปุ่มดาวน์โหลด
 * - useThaiReport(template, data)       สร้าง UI เอง
 */
export { ReportViewer, type ReportViewerProps } from "./ReportViewer.js";
export { DownloadPdfButton, type DownloadPdfButtonProps } from "./DownloadPdfButton.js";
export { useThaiReport, type ThaiReportState, type ReportStatus, type UseThaiReportOptions } from "./useThaiReport.js";
export { renderReport, saveBytes, type RenderedReport, type ReportData, type ReportTemplate } from "./core.js";
/** โหลด WASM ล่วงหน้า (เช่นตอนผู้ใช้เข้าหน้า) ให้ PDF แรกออกเร็วขึ้น */
export { initThaireport as preloadThaiReport, validateTemplate, renderPdf } from "@thaireport/client";
