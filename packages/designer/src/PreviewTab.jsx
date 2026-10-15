import React, { useEffect, useRef, useState } from "react";
import { loadDoc, renderFirstPage } from "./preview.js";

/**
 * แท็บพรีวิว: แสดงผล PDF จริงจาก engine ทุกหน้า
 * - หน้าที่ยังไม่เห็นบนจอจะยังไม่ render (IntersectionObserver) เพื่อให้เร็วและเบา
 * - ไม่ต้องกดพรีวิวเอง: เมื่อเปิดแท็บ จะแสดงผลล่าสุดทันที
 */
export function PreviewTab({ pdf, error, rendering, pageWidthPx, stats }) {
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

  return (
    <section className="preview-tab">
      <div className="preview-bar">
        <span className="small muted">
          {stats ? `${pages} หน้า · ${(stats.bytes / 1024).toFixed(1)} KB · เรนเดอร์ ${stats.ms} ms` : "—"}
        </span>
        {rendering && <span className="small muted">กำลังอัปเดต…</span>}
      </div>
      {(error || docError) && <div className="banner banner-error">{error || docError}</div>}
      <div className="preview-pages" ref={hostRef}>
        {doc &&
          Array.from({ length: doc.numPages }, (_, i) => (
            <PageView key={`${i}-${doc.numPages}`} doc={doc} pageNo={i + 1} widthPx={pageWidthPx} />
          ))}
        {!doc && !error && <div className="empty">กำลังเตรียมพรีวิว…</div>}
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
