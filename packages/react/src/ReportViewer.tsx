"use client";
import type { CSSProperties, ReactNode } from "react";
import type { ReportData, ReportTemplate } from "./core.js";
import { useThaiReport, type UseThaiReportOptions } from "./useThaiReport.js";

export interface ReportViewerProps extends UseThaiReportOptions {
  template: ReportTemplate | string | null | undefined;
  data?: ReportData | string | null;
  /** ความสูงของกรอบ (ค่าเริ่มต้น 720) */
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
  /** ชื่อกรอบสำหรับโปรแกรมอ่านหน้าจอ */
  title?: string;
  /** แสดงระหว่างสร้าง PDF ครั้งแรก */
  loading?: ReactNode;
  /** แสดงเมื่อสร้างไม่สำเร็จ (ค่าเริ่มต้น: ข้อความผิดพลาด) */
  renderError?: (message: string) => ReactNode;
}

/**
 * แสดงรายงานเป็น PDF ในหน้าเว็บ (ใช้ตัวแสดง PDF ของ browser) — สร้างใหม่อัตโนมัติเมื่อ template/data เปลี่ยน
 *
 * ```tsx
 * <ReportViewer template={invoice} data={order} height={800} />
 * ```
 */
export function ReportViewer({
  template,
  data,
  height = 720,
  width = "100%",
  className,
  style,
  title = "รายงาน PDF",
  loading = "กำลังสร้าง PDF…",
  renderError = (m) => <span role="alert">สร้าง PDF ไม่สำเร็จ: {m}</span>,
  ...options
}: ReportViewerProps) {
  const { status, url, error } = useThaiReport(template, data, options);
  const box: CSSProperties = { width, height, position: "relative", ...style };
  return (
    <div className={className} style={box} data-status={status} aria-busy={status === "loading"}>
      {url ? (
        <iframe src={url} title={title} style={{ width: "100%", height: "100%", border: 0 }} />
      ) : status === "loading" ? (
        <div style={{ display: "grid", placeItems: "center", height: "100%" }}>{loading}</div>
      ) : null}
      {status === "error" && error ? (
        <div style={url ? { position: "absolute", insetInline: 0, bottom: 0, padding: 8, background: "#fff4f4" } : { padding: 8 }}>
          {renderError(error)}
        </div>
      ) : null}
    </div>
  );
}
