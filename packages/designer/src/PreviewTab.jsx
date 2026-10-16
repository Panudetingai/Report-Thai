import React, { useEffect, useRef, useState } from "react";
import { loadDoc, renderFirstPage } from "./preview.js";

/**
 * แท็บพรีวิว: แสดงผล PDF จริงจาก engine ทุกหน้า
 * - หน้าที่ยังไม่เห็นบนจอจะยังไม่ render (IntersectionObserver) เพื่อให้เร็วและเบา
 * - ไม่ต้องกดพรีวิวเอง: เมื่อเปิดแท็บ จะแสดงผลล่าสุดทันที
 * - เรนเดอร์พัง: ยังคงฉบับล่าสุดที่สำเร็จไว้ให้ดู พร้อมปุ่มลองใหม่ (ไม่ต้องหายไปเปล่า)
 */
export function PreviewTab({ pdf, error, rendering, pageWidthPx, stats, onRetry }) {
  const hostRef = useRef(null);
  const [doc, setDoc] = useState(null);
  const [docError, setDocError] = useState("");

  useEffect(() => {
    if (!pdf) return undefined;
    let alive = true;
    loadDoc(pdf)
      .then((d) => alive && setDoc(d))
      .catch((e) => alive && setDocError(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, [pdf]);

  const pages = doc?.numPages ?? stats?.pages ?? 0;
  const msg = error || docError;
  const stale = Boolean(pdf) && Boolean(error);

  return (
    <section className="preview-tab">
      <div className="preview-bar">
        <span className="small muted">
          {stats ? `${pages} หน้า · ${(stats.bytes / 1024).toFixed(1)} KB · เรนเดอร์ ${stats.ms} ms` : "—"}
        </span>
        {rendering && <span className="small muted">กำลังอัปเดต…</span>}
      </div>
      {msg && (
        <div className="banner banner-error">
          <span className="banner-msg">
            {msg}
            {stale && " — กำลังแสดงฉบับก่อนหน้าที่เรนเดอร์สำเร็จ"}
          </span>
          {onRetry && (
            <button type="button" className="chip" onClick={onRetry} disabled={rendering}>
              ลองใหม่
            </button>
          )}
        </div>
      )}
      <div className="preview-pages" ref={hostRef}>
        {doc &&
          Array.from({ length: doc.numPages }, (_, i) => (
            <PageView key={`${i}-${doc.numPages}`} doc={doc} pageNo={i + 1} widthPx={pageWidthPx} />
          ))}
        {!doc && !msg && <div className="empty">กำลังเตรียมพรีวิว…</div>}
        {!doc && msg && (
          <div className="empty">
            {rendering ? "กำลังเรนเดอร์…" : "ยังไม่มีฉบับที่เรนเดอร์สำเร็จ — แก้ข้อผิดพลาดข้างบนแล้วกด “ลองใหม่”"}
          </div>
        )}
      </div>
    </section>
  );
}

function PageView({ doc, pageNo, widthPx }) {
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const [visible, setVisible] = useState(pageNo === 1);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || visible) return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !canvasRef.current) return undefined;
    const token = { cancelled: false, cancel: null };
    renderFirstPage(doc, canvasRef.current, widthPx, token, pageNo).catch((e) => {
      if (!token.cancelled && e?.name !== "RenderingCancelledException") console.error(e);
    });
    return () => {
      token.cancelled = true;
      token.cancel?.();
    };
  }, [visible, doc, pageNo, widthPx]);

  return (
    <div className="page-box" ref={boxRef} style={{ width: widthPx }}>
      <canvas ref={canvasRef} />
      <span className="page-no mono small muted">หน้า {pageNo}</span>
    </div>
  );
}
