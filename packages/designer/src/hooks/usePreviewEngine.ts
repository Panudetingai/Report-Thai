import { useCallback, useEffect, useRef, useState } from "react";
import { initThaireport, previewTemplate } from "@thaireport/client";

const DEBOUNCE_MS = 250;

/** โหลด WASM + เรนเดอร์ PDF เมื่อเปิดแท็บพรีวิว */
export function usePreviewEngine(doc, view) {
  const { template, data } = doc;
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState("");
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState("");
  const [pdf, setPdf] = useState(null);
  const [renderedDoc, setRenderedDoc] = useState(null);
  const [stats, setStats] = useState(null);
  const [nonce, setNonce] = useState(0);

  const seqRef = useRef(0);
  const latestRef = useRef(doc);
  latestRef.current = doc;

  useEffect(() => {
    let alive = true;
    initThaireport()
      .then(() => alive && setReady(true))
      .catch((e) => alive && setInitError(e?.message || String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const renderNow = useCallback(async () => {
    const seq = ++seqRef.current;
    const { template: t, data: d } = latestRef.current;
    setRendering(true);
    try {
      const t0 = performance.now();
      const res = await previewTemplate(t, d);
      const ms = Math.round(performance.now() - t0);
      if (seq !== seqRef.current) return;
      if (!res.ok) {
        // ไม่ล้าง pdf/stats — เก็บฉบับล่าสุดที่เรนเดอร์สำเร็จไว้ให้ดูต่อ
        setRenderError(res.error || "เรนเดอร์ไม่สำเร็จ");
        return;
      }
      setRenderError("");
      setPdf(Uint8Array.from(atob(res.pdf_base64), (c) => c.charCodeAt(0)));
      setRenderedDoc({ template: t, data: d });
      setStats({ ms, bytes: res.bytes, pages: res.page_count });
    } catch (e) {
      if (seq === seqRef.current) setRenderError(String(e?.message || e));
    } finally {
      if (seq === seqRef.current) setRendering(false);
    }
  }, []);

  useEffect(() => {
    if (!ready || view !== "preview") return undefined;
    const timer = setTimeout(renderNow, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [template, data, ready, view, renderNow, nonce]);

  /** เรนเดอร์ใหม่ทันทีทั้งที่ข้อมูลไม่เปลี่ยน — ใช้ตอน error แล้วอยากลองอีกครั้ง */
  const retry = useCallback(() => {
    setRenderError("");
    setNonce((n) => n + 1);
  }, []);

  const dirty = renderedDoc != null && (renderedDoc.template !== template || renderedDoc.data !== data);

  return { ready, initError, rendering, renderError, pdf, stats, dirty, renderNow, retry };
}
