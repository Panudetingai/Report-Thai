"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { contentKey, renderReport, type ReportData, type ReportTemplate } from "./core.js";

/** idle = ยังไม่สร้าง (ไม่มี template หรือ enabled = false) */
export type ReportStatus = "idle" | "loading" | "ready" | "error";

export interface UseThaiReportOptions {
  /** false = ยังไม่สร้าง PDF (เช่นรอข้อมูลจาก API) — ค่าเริ่มต้น true */
  enabled?: boolean;
  /** รอให้หยุดแก้ไขก่อนสร้างใหม่ (ms) — ค่าเริ่มต้น 200 */
  debounceMs?: number;
}

export interface ThaiReportState {
  status: ReportStatus;
  /** ไบต์ PDF ล่าสุดที่สร้างสำเร็จ (คงไว้ระหว่างสร้างฉบับใหม่ จอจะได้ไม่กระพริบ) */
  pdf: Uint8Array | null;
  /** blob URL ของ PDF ล่าสุด ใช้กับ <iframe>/<a href> ได้ (คืนหน่วยความจำให้อัตโนมัติ) */
  url: string | null;
  pages: number;
  /** ข้อความผิดพลาดของการสร้างครั้งล่าสุด */
  error: string | null;
  /** สร้างใหม่ทันที */
  refresh: () => void;
}

/**
 * สร้าง PDF จาก template + data ใน browser และสร้างใหม่เมื่อเนื้อหาเปลี่ยน
 *
 * ```tsx
 * const { status, url, pages, error } = useThaiReport(invoice, order);
 * ```
 */
export function useThaiReport(
  template: ReportTemplate | string | null | undefined,
  data: ReportData | string | null | undefined,
  { enabled = true, debounceMs = 200 }: UseThaiReportOptions = {},
): ThaiReportState {
  const [state, setState] = useState<Omit<ThaiReportState, "refresh">>(() => ({
    status: enabled && template != null ? "loading" : "idle",
    pdf: null,
    url: null,
    pages: 0,
    error: null,
  }));
  const [nonce, setNonce] = useState(0);
  const latest = useRef({ template, data });
  latest.current = { template, data };
  const urlRef = useRef<string | null>(null);
  const key = template == null ? null : contentKey(template, data);

  useEffect(() => {
    if (!enabled || key == null) {
      setState((s) => (s.status === "loading" ? { ...s, status: s.pdf ? "ready" : "idle" } : s));
      return undefined;
    }
    let cancelled = false;
    setState((s) => (s.status === "loading" ? s : { ...s, status: "loading" }));
    const timer = setTimeout(async () => {
      const { template: t, data: d } = latest.current;
      try {
        const { pdf, pages } = await renderReport(t as ReportTemplate | string, (d ?? {}) as ReportData | string);
        if (cancelled) return;
        const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" }));
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setState({ status: "ready", pdf, url, pages, error: null });
      } catch (e) {
        if (cancelled) return;
        setState((s) => ({ ...s, status: "error", error: e instanceof Error ? e.message : String(e) }));
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, enabled, debounceMs, nonce]);

  // คืนหน่วยความจำของ PDF ฉบับสุดท้ายเมื่อ component หายไป
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    },
    [],
  );

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, refresh };
}
