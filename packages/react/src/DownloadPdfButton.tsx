"use client";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { renderReport, saveBytes, type ReportData, type ReportTemplate } from "./core.js";

export interface DownloadPdfButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "onError"> {
  template: ReportTemplate | string;
  data?: ReportData | string;
  /** ชื่อไฟล์ (ค่าเริ่มต้น report.pdf) */
  fileName?: string;
  /** ข้อความปุ่มระหว่างสร้าง */
  busyLabel?: ReactNode;
  onError?: (error: Error) => void;
  onDone?: (info: { pages: number; bytes: number }) => void;
}

/**
 * ปุ่มดาวน์โหลด PDF — สร้างไฟล์ตอนกด (ไม่สร้างล่วงหน้า) ใช้ในตาราง/รายการได้หลายปุ่ม
 *
 * ```tsx
 * <DownloadPdfButton template={invoice} data={order} fileName={`INV-${order.no}.pdf`}>ดาวน์โหลด</DownloadPdfButton>
 * ```
 */
export function DownloadPdfButton({
  template,
  data = {},
  fileName = "report.pdf",
  busyLabel = "กำลังสร้าง PDF…",
  onError,
  onDone,
  children = "ดาวน์โหลด PDF",
  disabled,
  ...rest
}: DownloadPdfButtonProps) {
  const [busy, setBusy] = useState(false);
  const click = async () => {
    setBusy(true);
    try {
      const { pdf, pages } = await renderReport(template, data);
      saveBytes(pdf, fileName);
      onDone?.({ pages, bytes: pdf.length });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (onError) onError(err);
      else console.error("[thaireport]", err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" {...rest} disabled={disabled || busy} aria-busy={busy} onClick={click}>
      {busy ? busyLabel : children}
    </button>
  );
}
