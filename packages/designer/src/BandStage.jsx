import React, { useEffect, useMemo, useRef, useState } from "react";
import { BAND_LABELS, BAND_ORDER, BAND_STD, KIND_LABELS, bandRank, bandTitle, needsFollow, newElement, planMove, planPlacement } from "./state.js";
import { groupMembers } from "./layout-tools.js";
import { contentWidth, margins, pageSize } from "./layout.js";
import { measureSelection, snapGrid, snapPosition, fmtMm } from "./snap.js";
import { bindPreview, designBindSegments, designDisplay, detailSourceOf, rowsOf, scanExprs, tableSourceOf } from "./bind.js";
import { isDataImageSrc } from "./image-embed.js";
import { simulatePages, tableMm } from "./pagination.js";
import { DND_KIND, hitBandArea, pointerToBandMm } from "./canvas/bandHit.js";

export const RULER_H = 24;
export const RULER_W = 26;
export const TAG_W = 128;
/** 1 pt = 0.3528 mm — ใช้คำนวณขนาดตัวอักษรให้ตรงกับกระดาษจริง */
const PT_MM = 0.3528;
/**
 * จำนวนแถวที่ใช้คิดความสูงกรอบตาราง
 * - "ตามจริง": ทุกแถว (ความสูงเท่าที่ engine จะพิมพ์โดยประมาณ)
 * - "ย่อ": แถวตัวอย่าง + 1 แถวบอกจำนวนที่เหลือ — ทำให้ band ข้างล่างยังอยู่ในจอเมื่อข้อมูลเยอะ
 */
function heightRowsOf(n, sampleRows, mode) {
  if (mode === "actual" || n <= sampleRows) return n;
  return sampleRows + 1;
}
/** ความสูง band ที่แสดง = ค่าที่ตั้ง หรือความสูงของตารางที่ขยายตามข้อมูล (ไม่น้อยกว่า) */
function bandMm(b, data, sampleRows, mode) {
  let h = b.height;
  for (const el of b.elements) {
    if (el.type !== "table") continue;
    const n = rowsOf(data, tableSourceOf(el, b)).length;
    h = Math.max(h, (el.y ?? 0) + tableMm(el, heightRowsOf(n, sampleRows, mode)));
  }
  return h;
}
const BAND_AREA_MIN_PX = 6;
const KIND_OF_TYPE = { text: "text", line: "line", rectangle: "rect", ellipse: "ellipse", image: "image", table: "table", checkbox: "checkbox" };

function clearDragTransforms(areas) {
  for (const { el } of areas) {
    el?.querySelectorAll(".el.is-drag-live").forEach((node) => {
      node.style.transform = "";
      node.classList.remove("is-drag-live");
    });
  }
}

function paintDragTransform(area, idxs, ddxMm, ddyMm, scale) {
  if (!area) return;
  const tx = ddxMm * scale;
  const ty = ddyMm * scale;
  for (const i of idxs) {
    const node = area.querySelector(`.el[data-el-i="${i}"]`);
    if (!node) continue;
    node.classList.add("is-drag-live");
    node.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
  }
}

function clampDragMm(x, y, band, cw, w, h) {
  return {
    x: Math.min(Math.max(0, x), Math.max(0, cw - w)),
    y: Math.min(Math.max(0, y), Math.max(0, band.height - h)),
  };
}

const BAND_ACCENT = {
  pageHeader: "#0d9488",
  title: "#2563eb",
  columnHeader: "#65a30d",
  detail: "#4f46e5",
  groupHeader: "#9333ea",
  groupFooter: "#9333ea",
  summary: "#ea580c",
  pageFooter: "#64748b",
};

/**
 * พื้นที่ออกแบบ — แต่ละ band เป็น frame (เหมือน Figma)
 * ลาก element ข้าม frame ได้ · ลากจากแถบเครื่องมือมาวางใน frame ได้
 */
export function BandStage({ template, data, bandIdx, selEl, selIdxs = [], onSelect, dispatch, S, onWheelZoom, onPlaced, onNotice, textScale = 1, sampleRows = 3, tableMode = "compact", onAddBand, onRemoveBand, showGrid = true }) {
  const page = useMemo(() => pageSize(template), [template]);
  const m = useMemo(() => margins(template), [template]);
  const cw = contentWidth(template);
  const contentH = page.h - m.t - m.b;
  const cwPx = cw * S;

  const templateRef = useRef(template);
  templateRef.current = template;
  const sRef = useRef(S);
  sRef.current = S;
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const bandAreasRef = useRef([]);
  const moveRaf = useRef(0);
  const lastPtr = useRef(null);

  const [guides, setGuides] = useState(null);
  const [readout, setReadout] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [dragging, setDragging] = useState(false);

  const indexed = template.bands.map((b, i) => ({ b, i })).sort((a, c) => bandRank(a.b.type) - bandRank(c.b.type) || a.i - c.i);

  // จำลองการขึ้นหน้าใหม่แบบ engine: band รายการตัดทีละแถว (แถวไม่ถูกหั่น) band อื่นตัดทั้งบล็อก
  const pagination = simulatePages(indexed, data, contentH);
  const flowTotal = pagination.totalMm;
  const pagesEst = pagination.pages;
  /** เหตุการณ์ขึ้นหน้าใหม่ของ band นี้ (รวมเป็นป้ายเดียวเมื่อเกิดหลายครั้งในรายการเดียวกัน) */
  function breaksIn(bi) {
    const evs = pagination.events.filter((ev) => ev.bi === bi);
    if (!evs.length) return [];
    const before = evs.filter((ev) => ev.kind === "before");
    const between = evs.filter((ev) => ev.kind === "between");
    const out = before.map((ev) => ({ key: `b-${ev.page}`, label: `ขึ้นหน้าใหม่ · หน้า ${ev.page}` }));
    if (between.length === 1) out.push({ key: `w-${between[0].page}`, label: `ขึ้นหน้าใหม่ · หน้า ${between[0].page}` });
    if (between.length > 1) {
      const first = between[0].page;
      const last = between.at(-1).page;
      out.push({ key: `w-${first}`, label: `ขึ้นหน้าใหม่ ${between.length} ครั้งระหว่างแถว · หน้า ${first}–${last}` });
    }
    return out;
  }

  useEffect(() => {
    bandAreasRef.current = template.bands.map((_, bi) => ({
      bi,
      el: bandAreasRef.current[bi]?.el ?? null,
    }));
  }, [template.bands.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      onWheelZoom(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheelZoom]);

  function setBandAreaRef(bi, node) {
    if (!bandAreasRef.current[bi]) bandAreasRef.current[bi] = { bi, el: null };
    bandAreasRef.current[bi].el = node;
  }

  function beginDrag(e, mode, bi, ei) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (mode === "band") {
      onSelect(bi, null);
      dragRef.current = { mode, bi, sx: e.clientX, sy: e.clientY, h: templateRef.current.bands[bi].height, started: false };
      setDragging(true);
      return;
    }
    // Shift / ⌘ / Ctrl-คลิก = สลับการเลือกรายการนี้ (ยังไม่ลาก)
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      onSelect(bi, ei, true);
      return;
    }
    const inSel = bi === bandIdx && selIdxs.includes(ei);
    if (!inSel) onSelect(bi, ei);
    const els = templateRef.current.bands[bi].elements;
    // ลากรายการที่เลือกทั้งชุด (หรือทั้งกลุ่มของรายการนี้) พร้อมกัน — ใช้ได้ภายใน band เดียวกัน
    const dragIdxs = inSel ? selIdxs : groupMembers(els, ei);
    const el = templateRef.current.bands[bi].elements[ei];
    const area = bandAreasRef.current[bi]?.el;
    const r = area?.getBoundingClientRect();
    const k = sRef.current;
    const offX = r ? (e.clientX - r.left) / k - el.x : 0;
    const offY = r ? (e.clientY - r.top) / k - el.y : 0;
    dragRef.current = {
      mode,
      bi,
      ei,
      sx: e.clientX,
      sy: e.clientY,
      ox: el.x,
      oy: el.y,
      ow: el.w,
      oh: el.h,
      grabX: offX,
      grabY: offY,
      started: false,
      multi: mode === "move" && dragIdxs.length > 1 ? { idxs: dragIdxs, starts: Object.fromEntries(dragIdxs.map((i) => [i, { ...els[i] }])) } : null,
    };
    setDragging(true);
  }

  useEffect(() => {
    function applyMove(e) {
      const d = dragRef.current;
      if (!d) return;
      // บันทึก undo เมื่อขยับจริงเท่านั้น (คลิกเฉยๆ จะไม่สร้างขั้นว่าง)
      if (!d.started) {
        if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < 3) return;
        dispatch({ type: "snapshot" });
        d.started = true;
      }
      const k = sRef.current;
      const t = templateRef.current;

      if (d.mode === "band") {
        const h = Math.max(1, snapGrid(d.h + (e.clientY - d.sy) / k));
        dispatch({ type: "patchBand", band: d.bi, patch: { height: h }, record: false });
        setReadout({ text: `ความสูง ${fmtMm(h)} mm`, x: 8, y: 0, bi: d.bi });
        return;
      }

      if (d.mode === "move") {
        const band = t.bands[d.bi];
        const cwNow = contentWidth(t);
        const w = d.ow ?? 0;
        const h = d.oh ?? 0;
        let x = d.ox + (e.clientX - d.sx) / k;
        let y = d.oy + (e.clientY - d.sy) / k;
        ({ x, y } = clampDragMm(x, y, band, cwNow, w, h));

        const hit = hitBandArea(bandAreasRef.current, e.clientX, e.clientY);
        const targetBi = hit?.bi ?? d.bi;
        setDropTarget(hit?.bi ?? null);
        // element อื่นที่ลงบน band ที่มีตาราง: ยังไม่ย้ายระหว่างลาก — จะย้ายไป band ใต้ตารางตอนปล่อยเมาส์
        const movingEl = t.bands[d.bi]?.elements[d.ei];
        const blocked = targetBi !== d.bi && !!movingEl && needsFollow(t, targetBi, movingEl.type);
        d.pendingTo = blocked ? targetBi : null;
        d.dropBi = targetBi;

        const idxs = d.multi?.idxs ?? [d.ei];
        const ddx = x - d.ox;
        const ddy = y - d.oy;
        d.live = { x, y, ddx, ddy };

        clearDragTransforms(bandAreasRef.current);
        paintDragTransform(bandAreasRef.current[d.bi]?.el, idxs, ddx, ddy, k);

        const preview = snapPosition(band, cwNow, d.ei, x, y, w, h);
        setGuides({ bi: d.bi, x: preview.guideX, y: preview.guideY });
        if (blocked) {
          setReadout({ text: "ปล่อยเพื่อวางใต้ตาราง (band สรุป)", x: preview.x, y: preview.y, bi: targetBi });
        } else if (d.multi) {
          setReadout({
            text: `${d.multi.idxs.length} รายการ · X ${fmtMm(preview.x)} · Y ${fmtMm(preview.y)} mm`,
            x: preview.x,
            y: preview.y,
            bi: d.bi,
          });
        } else {
          setReadout({ text: `X ${fmtMm(preview.x)} · Y ${fmtMm(preview.y)} mm`, x: preview.x, y: preview.y, bi: d.bi });
        }
        return;
      }

      {
        const band = t.bands[d.bi];
        const cwNow = contentWidth(t);
        const rw = Math.min(Math.max(2, d.ow + (e.clientX - d.sx) / k), cwNow - d.ox);
        const rh = Math.min(Math.max(d.oh > 0 ? 2 : 0, d.oh + (e.clientY - d.sy) / k), band.height - d.oy);
        dispatch({ type: "patchEl", band: d.bi, el: d.ei, patch: { w: rw, h: rh }, record: false });
        setReadout({ text: `W ${fmtMm(rw)} · H ${fmtMm(rh)} mm`, x: d.ox + rw, y: d.oy + rh, bi: d.bi });
      }
    }
    function onMove(e) {
      lastPtr.current = e;
      const d = dragRef.current;
      if (d?.mode === "move") {
        applyMove(e);
        return;
      }
      if (moveRaf.current) return;
      moveRaf.current = requestAnimationFrame(() => {
        moveRaf.current = 0;
        if (lastPtr.current) applyMove(lastPtr.current);
      });
    }
    function onUp(e) {
      const d = dragRef.current;
      clearDragTransforms(bandAreasRef.current);
      if (d?.mode === "move" && d.started && d.live) {
        const t = templateRef.current;
        const k = sRef.current;
        const band = t.bands[d.bi];
        const cwNow = contentWidth(t);
        const w = d.ow ?? 0;
        const h = d.oh ?? 0;

        if (d.pendingTo != null) {
          dispatch({ type: "transferEl", fromBand: d.bi, fromEl: d.ei, toBand: d.pendingTo, x: 0, y: 0, record: false });
          const plan = planMove(t, d.bi, d.ei, d.pendingTo);
          if (!plan.error) onSelect(plan.band, plan.elIndex);
        } else {
          const hit = e ? hitBandArea(bandAreasRef.current, e.clientX, e.clientY) : null;
          const toBi = d.dropBi ?? hit?.bi ?? d.bi;
          if (toBi !== d.bi && hit) {
            const pos = pointerToBandMm(e.clientX, e.clientY, hit.rect, k, d.grabX, d.grabY);
            const bandTo = t.bands[toBi];
            const snapped = snapPosition(bandTo, contentWidth(t), -1, pos.x, pos.y, w, h);
            const newEi = bandTo.elements.length;
            dispatch({
              type: "transferEl",
              fromBand: d.bi,
              fromEl: d.ei,
              toBand: toBi,
              x: snapped.x,
              y: snapped.y,
              record: false,
            });
            onSelect(toBi, newEi);
          } else {
            const snapped = snapPosition(band, cwNow, d.ei, d.live.x, d.live.y, w, h);
            if (d.multi) {
              const ddx = snapped.x - d.ox;
              const ddy = snapped.y - d.oy;
              const changes = d.multi.idxs.map((i) => ({
                ei: i,
                patch: { x: d.multi.starts[i].x + ddx, y: d.multi.starts[i].y + ddy },
              }));
              dispatch({ type: "patchEls", band: d.bi, changes, record: false });
            } else {
              dispatch({ type: "setPos", band: d.bi, el: d.ei, x: snapped.x, y: snapped.y, record: false });
            }
          }
        }
      } else if (d?.mode === "resize" && d.started && e) {
        const band = templateRef.current.bands[d.bi];
        const cwNow = contentWidth(templateRef.current);
        const k = sRef.current;
        const w = snapGrid(Math.min(Math.max(2, d.ow + (e.clientX - d.sx) / k), cwNow - d.ox));
        const h = snapGrid(Math.min(Math.max(d.oh > 0 ? 2 : 0, d.oh + (e.clientY - d.sy) / k), band.height - d.oy));
        dispatch({ type: "patchEl", band: d.bi, el: d.ei, patch: { w, h }, record: false });
      }
      dragRef.current = null;
      if (moveRaf.current) cancelAnimationFrame(moveRaf.current);
      moveRaf.current = 0;
      lastPtr.current = null;
      setGuides(null);
      setReadout(null);
      setDropTarget(null);
      setDragging(false);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (moveRaf.current) cancelAnimationFrame(moveRaf.current);
    };
  }, [dispatch, onSelect]);

  function onBandDragOver(e, bi) {
    if (!e.dataTransfer.types.includes(DND_KIND)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropTarget(bi);
  }

  function onBandDrop(e, bi) {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const kind = e.dataTransfer.getData(DND_KIND);
    if (!kind) return;
    const el = newElement(kind);
    if (!el) return;
    const area = bandAreasRef.current[bi]?.el;
    if (!area) return;
    const r = area.getBoundingClientRect();
    const k = sRef.current;
    const x = snapGrid((e.clientX - r.left) / k - (el.w || 20) / 2);
    const y = snapGrid((e.clientY - r.top) / k - (el.h || 8) / 2);
    const plan = planPlacement(templateRef.current, bi, el.type);
    if (plan.error) {
      onNotice?.(plan.error);
      return;
    }
    dispatch({ type: "addElAt", band: bi, element: el, x, y });
    if (plan.band !== bi) onNotice?.("วางไว้ใน band สรุปใต้ตาราง (ตารางต้องอยู่ band ของตัวเองลำพัง)");
    onSelect(plan.band, plan.elIndex);
    onPlaced?.(plan.band, plan.elIndex);
  }

  const ticks = Array.from({ length: Math.floor(cw / 5) + 1 }, (_, i) => i * 5);
  const bandMetrics = useMemo(() => {
    let topMm = 0;
    return indexed.map(({ b, i: bi }) => {
      const hMm = bandMm(b, data, sampleRows, tableMode);
      const row = { bi, hMm, topMm };
      topMm += hMm;
      return row;
    });
  }, [template, data, sampleRows, tableMode]);
  const stackMm = bandMetrics.at(-1) ? bandMetrics.at(-1).topMm + bandMetrics.at(-1).hMm : 0;
  const stackPx = stackMm * S;
  const pagePx = contentH * S;
  const vTicks = Array.from({ length: Math.floor(Math.max(stackMm, contentH) / 5) + 1 }, (_, i) => i * 5);
  const sheetW = RULER_W + TAG_W + m.l * S + cwPx + m.r * S;

  const sel = selEl != null ? template.bands[bandIdx]?.elements[selEl] : null;
  const showDims = S >= 0.52 && !dragging;
  const annotations = sel && showDims ? measureSelection(template.bands[bandIdx], selEl) : [];
  const compactUi = S < 0.68;
  const gridClass = showGrid ? " show-grid" : " hide-grid";

  return (
    <div className={`design-scroll${dragging ? " is-dragging" : ""}`} ref={scrollRef} onPointerDown={() => onSelect(bandIdx, null)}>
      <div
        className={`design-frame design-sheet${dragging ? " is-dragging" : ""}`}
        style={{ width: sheetW + 24, "--zoom": S, "--cell-mm": `${5 * S}px` }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="sheet-columns">
          <div className="ruler-col" style={{ width: RULER_W }}>
            <div className="ruler-corner" style={{ height: RULER_H }} aria-hidden="true" />
            <div className="vruler" style={{ height: Math.max(stackPx, pagePx) }}>
              {vTicks.map((mm) => (
                <span key={mm} className={`vtick${mm % 10 === 0 ? " major" : ""}`} style={{ top: mm * S }}>
                  {mm % 10 === 0 && mm > 0 && <em>{mm}</em>}
                </span>
              ))}
            </div>
          </div>

          <div className="sheet-main">
            <div className="hruler-row" style={{ paddingLeft: TAG_W, height: RULER_H }}>
              <div className="margin-ruler" style={{ width: m.l * S }} />
              <div className="hruler" style={{ width: cwPx, height: RULER_H }}>
                {ticks.map((mm) => (
                  <span key={mm} className={`htick${mm % 10 === 0 ? " major" : ""}`} style={{ left: mm * S }}>
                    {mm % 10 === 0 && mm < cw && <em>{mm}</em>}
                  </span>
                ))}
              </div>
              <div className="margin-ruler" style={{ width: m.r * S }} />
            </div>

            <div className="page-surface" style={{ minHeight: pagePx }}>
              {pagePx > 0 && (
                <div className="page-boundary" style={{ height: pagePx }} title="ขอบเขตเนื้อหาหนึ่งหน้า (ไม่รวม margin กระดาษ)" />
              )}

        {indexed.map(({ b, i: bi }, idx) => {
          const hPx = Math.max(bandMetrics[idx].hMm * S, BAND_AREA_MIN_PX);
          const isSel = bi === bandIdx;
          const isDrop = dropTarget === bi;
          const accent = BAND_ACCENT[b.type] ?? "#64748b";
          const showFrameLabel = hPx >= 26 && !compactUi;
          const sampleRow = b.type === "detail" ? rowsOf(data, detailSourceOf(b))[0] : undefined;
          return (
            <div
              key={`${b.type}-${bi}`}
              className={`band-row${isSel ? " is-active" : ""}${isDrop ? " is-drop" : ""}${compactUi ? " is-compact" : ""}`}
              style={{ height: hPx }}
            >
              <div className="band-tag-slot" style={{ width: TAG_W }}>
                <div className={`band-tag-wrap${isSel ? " is-active" : ""}`}>
                  {isSel && onRemoveBand && (
                    <button
                      type="button"
                      className="band-del"
                      title="ลบ band นี้"
                      aria-label="ลบ band"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveBand(bi);
                      }}
                    >
                      ×
                    </button>
                  )}
                  <button
                    type="button"
                    className="band-tag"
                    style={{ "--band-accent": accent }}
                    onClick={() => onSelect(bi, null)}
                    title={`${BAND_STD[b.type] ?? b.type} · ${bandTitle(b)} · ${b.height} mm`}
                  >
                  <span className="band-tag-dot" aria-hidden="true" />
                  <span className="band-tag-text">
                    <span className="band-tag-std">{BAND_STD[b.type] ?? b.type}</span>
                    <span className="band-tag-name">{bandTitle(b)}</span>
                    {!compactUi && (
                      <span className="band-tag-meta mono">
                        {bandMetrics[idx].hMm.toFixed(1)} mm · {b.elements.length}
                      </span>
                    )}
                  </span>
                  </button>
                </div>
              </div>
              <div className="band-canvas-row">
                <div className="margin-strip" style={{ width: m.l * S, height: hPx }} />
                <div
                  className={`band-area band-frame${gridClass}`}
                  ref={(node) => setBandAreaRef(bi, node)}
                  style={{ width: cwPx, height: hPx, "--frame-accent": accent, "--cell": `${Math.max(6, 5 * S)}px` }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelect(bi, null);
                  }}
                  onDragOver={(e) => onBandDragOver(e, bi)}
                  onDragLeave={() => setDropTarget((cur) => (cur === bi ? null : cur))}
                  onDrop={(e) => onBandDrop(e, bi)}
                >
                  {showFrameLabel && <span className="frame-label">{bandTitle(b)}</span>}

                  {breaksIn(bi).map(({ key, label }) => (
                    <div key={key} className="page-cut" style={{ top: 0 }} title="ประมาณการจากความสูง band และจำนวนแถวข้อมูล — จำนวนหน้าจริงดูที่แท็บพรีวิว">
                      <span>{label}</span>
                    </div>
                  ))}

                  {b.elements.map((el, ei) => (
                    <ElementBox
                      key={`${bi}-${ei}-${el.type}`}
                      elIndex={ei}
                      el={el}
                      data={data}
                      textScale={textScale}
                      sampleRow={sampleRow}
                      sampleRows={sampleRows}
                      heightRows={el.type === "table" ? heightRowsOf(rowsOf(data, tableSourceOf(el, b)).length, sampleRows, tableMode) : undefined}
                      dataRows={el.type === "table" ? rowsOf(data, tableSourceOf(el, b)) : []}
                      selected={isSel && selEl === ei}
                      onPointerDown={(e) => beginDrag(e, "move", bi, ei)}
                      onHandle={(e) => beginDrag(e, "resize", bi, ei)}
                      S={S}
                    />
                  ))}

                  {isSel &&
                    showDims &&
                    annotations.map((a, k) =>
                    a.kind === "h" ? (
                      <React.Fragment key={k}>
                        <div className="dim dim-h" style={{ left: a.x1 * S, top: a.y * S, width: (a.x2 - a.x1) * S }} />
                        <span className="dim-label" style={{ left: ((a.x1 + a.x2) / 2) * S, top: a.y * S - 16 }}>{a.text}</span>
                      </React.Fragment>
                    ) : (
                      <React.Fragment key={k}>
                        <div className="dim dim-v" style={{ top: a.y1 * S, height: (a.y2 - a.y1) * S, left: a.x * S }} />
                        <span className="dim-label" style={{ left: a.x * S + 6, top: ((a.y1 + a.y2) / 2) * S - 8 }}>{a.text}</span>
                      </React.Fragment>
                    ),
                  )}

                {guides?.bi === bi && guides.x != null && <div className="guide guide-v" style={{ left: guides.x * S }} />}
                {guides?.bi === bi && guides.y != null && <div className="guide guide-h" style={{ top: guides.y * S }} />}
                {readout?.bi === bi && (
                  <div className="readout" style={{ left: Math.max(0, readout.x * S + 8), top: Math.max(0, readout.y * S - 24) }}>
                    {readout.text}
                  </div>
                )}

                  <div className="band-resize" onPointerDown={(e) => beginDrag(e, "band", bi, null)} title="ลากปรับความสูง frame" />
                </div>
                <div className="margin-strip" style={{ width: m.r * S, height: hPx }} />
              </div>
            </div>
          );
        })}
            </div>

        {onAddBand && (
          <AddBandSlot existingTypes={template.bands.map((b) => b.type)} onAdd={onAddBand} width={TAG_W + RULER_W} />
        )}

        <div className="design-foot mono small muted" style={{ paddingLeft: RULER_W + TAG_W }}>
          เนื้อหารวม {fmtMm(flowTotal)} / {fmtMm(contentH)} mm · ประมาณ {pagesEst} หน้า
          {flowTotal > contentH + 0.01 && <span className="warn"> · เกินพื้นที่หน้า ขึ้นหน้าใหม่ {pagesEst - 1} ครั้ง</span>}
        </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ElementBox({ elIndex, el, data, dataRows, sampleRow, sampleRows, heightRows, textScale, selected, onPointerDown, onHandle, S }) {
  const kind = KIND_OF_TYPE[el.type] ?? "rect";
  const isLine = el.type === "line" || (el.h ?? 0) === 0;
  const hMm = el.type === "table" ? Math.max(el.h ?? 0, tableMm(el, heightRows ?? dataRows.length)) : el.h ?? 0;
  const hPx = Math.max(hMm * S, 2);
  const wPx = Math.max((el.w ?? 0) * S, 3);
  const showText = el.type === "text" && hPx >= 11 && wPx >= 14;
  const tagInside = hPx < 22;
  const style = {
    left: (el.x ?? 0) * S,
    top: (el.y ?? 0) * S,
    width: wPx,
    height: hPx,
  };
  if (el.type === "rectangle" || el.type === "ellipse") {
    style.background = el.fill ?? "transparent";
    style.borderColor = el.stroke ?? "#888";
    style.borderWidth = Math.max(0.5, (el.width ?? 0.5) * 1.2);
    if (el.type === "ellipse") style.borderRadius = "50%";
  }
  const cls = ["el", `el-${kind}`, selected && "is-selected", isLine && "is-line", tagInside && "tag-inside"].filter(Boolean).join(" ");
  const textSize = Math.max(3, (el.size ?? 10) * PT_MM * S * textScale);
  return (
    <div className={cls} style={style} data-el-i={elIndex} onPointerDown={onPointerDown}>
      {el.type === "text" && showText && (
        <span
          className="el-content"
          style={{
            fontSize: textSize,
            color: el.color ?? "#222",
            textAlign: el.align ?? "left",
            fontWeight: el.bold ? 700 : 400,
            maxHeight: hPx,
          }}
        >
          <BoundText text={el.text} data={data} row={sampleRow} />
        </span>
      )}
      {el.type === "text" && !showText && <span className="el-kind-fallback">{KIND_LABELS.text}</span>}
      {el.type === "table" && <TableGhost el={el} scale={S * textScale} data={data} sampleRows={sampleRows} />}
      {el.type === "checkbox" && <CheckGlyph el={el} data={data} row={sampleRow} />}
      {el.type === "image" && isDataImageSrc(el.src) && (
        <img className="el-img" src={el.src} alt="" draggable={false} />
      )}
      {el.type === "image" && !isDataImageSrc(el.src) && hPx >= 14 && (
        <span className="el-img-hint">{el.src?.includes("{{") ? "[ฟิลด์รูป]" : "อัปโหลดรูป → คุณสมบัติ"}</span>
      )}
      {!isLine && (selected || S >= 0.6) && (
        <span className="el-tag">{KIND_LABELS[el.type] ?? el.type}</span>
      )}
      {selected && hPx >= 10 && <span className="el-handle" onPointerDown={onHandle} />}
    </div>
  );
}

/** ข้อความที่แทนค่าตัวอย่างแล้ว — ตัวแปรที่หาไม่พบแสดงเป็นป้ายเตือนสีแดง (engine จะพิมพ์เป็นว่าง) */
function BoundText({ text, data, row }) {
  return designBindSegments(text, data, { row }).map((seg, i) =>
    "raw" in seg ? (
      <mark key={i} className="tok-missing" title="ไม่พบฟิลด์นี้ในข้อมูล — PDF จะเป็นช่องว่าง">
        {seg.raw}
      </mark>
    ) : seg.ph ? (
      <mark key={i} className="tok-field" title={`ฟิลด์ข้อมูล — ค่าจริงดูที่พรีวิว PDF`}>
        {seg.text}
      </mark>
    ) : (
      <React.Fragment key={i}>{seg.text}</React.Fragment>
    ),
  );
}

/** สไตล์ที่ใช้จริงของเซลล์ (คอลัมน์ + กฎ cell_styles ที่ตรงแถว/คอลัมน์) — ตรงกับ engine */
function cellStyleFor(el, col, ci, ri) {
  const st = { color: col.color, bold: !!col.bold, fill: col.fill, font: col.font ?? el.font };
  for (const r of el.cell_styles ?? []) {
    if (r.col !== ci + 1 || (r.row != null && r.row !== ri + 1)) continue;
    if (r.color) st.color = r.color;
    if (r.fill) st.fill = r.fill;
    if (r.bold != null) st.bold = r.bold;
    if (r.font) st.font = r.font;
  }
  return st;
}

/** ตารางบนกระดาษออกแบบ: หัวคอลัมน์ + แถว placeholder [ฟิลด์] (ไม่แสดงข้อมูลตัวอย่าง) */
function TableGhost({ el, scale, data, sampleRows }) {
  const cols = el.columns ?? [];
  const total = cols.reduce((a, c) => a + (c.width || 0), 0) || 1;
  const headSize = Math.max(3, (el.size ?? 9) * PT_MM * scale);
  const placeholderCount = Math.min(3, Math.max(1, sampleRows ?? 1));
  const pct = (c) => `${((c.width || 0) / total) * 100}%`;
  return (
    <div className="table-ghost table-ghost--design" style={{ fontFamily: '"Sarabun", sans-serif' }}>
      <div className="tg-row">
        {cols.map((c, i) => (
          <div
            key={i}
            className="tg-head"
            style={{
              fontSize: headSize,
              width: pct(c),
              textAlign: c.align ?? "left",
              fontWeight: el.header_bold === false ? 400 : 700,
              color: el.header_color ?? "#111",
              background: el.header_fill ?? "#f0f0f0",
            }}
          >
            {c.header}
          </div>
        ))}
      </div>
      {Array.from({ length: placeholderCount }, (_, ri) => (
        <div key={ri} className="tg-row tg-row--placeholder">
          {cols.map((c, i) => {
            const st = cellStyleFor(el, c, i, ri);
            const val = designDisplay(c.field, data);
            return (
              <div
                key={i}
                className="tg-cell"
                style={{
                  fontSize: Math.max(3, (c.size ?? el.size ?? 9) * PT_MM * scale),
                  width: pct(c),
                  textAlign: c.align ?? "left",
                  fontWeight: st.bold ? 700 : 400,
                  color: st.color ?? "#222",
                  background: st.fill ?? (ri % 2 ? el.zebra_fill ?? "#f7f7f7" : "transparent"),
                  fontFamily: st.font ? `"${st.font}", sans-serif` : undefined,
                }}
              >
                {val}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** ปุ่ม "+ เพิ่ม band" ท้ายรายการ — แสดงเฉพาะชนิดที่ยังไม่มี (engine รับ band ชนิดละ 1 ชุด) */
function AddBandSlot({ existingTypes, onAdd, width }) {
  const [open, setOpen] = useState(false);
  const missing = BAND_ORDER.filter((t) => !existingTypes.includes(t));
  return (
    <div className="band-add-slot" style={{ width }}>
      <button type="button" className="band-add-btn" onClick={() => setOpen((v) => !v)} disabled={missing.length === 0}>
        + เพิ่ม band
      </button>
      {open && missing.length > 0 && (
        <div className="band-add-menu" role="menu">
          {missing.map((t) => (
            <button
              key={t}
              type="button"
              role="menuitem"
              onClick={() => {
                onAdd(t);
                setOpen(false);
              }}
            >
              {BAND_LABELS[t] ?? t}
            </button>
          ))}
        </div>
      )}
      {missing.length === 0 && <span className="small muted">มี band ครบทุกชนิดแล้ว</span>}
    </div>
  );
}

/** ช่องติ๊กบนกระดาษออกแบบ: ค่าตัวอย่างจากแถวแรกของข้อมูล (ตรงกับกติกาของ engine) */
function CheckGlyph({ el, data, row }) {
  const bound = scanExprs(el.checked ?? "").length > 0;
  let on = false;
  if (!bound) {
    const value = bindPreview(el.checked ?? "", data, { row });
    const t = value.trim().toLowerCase();
    on = !(t === "" || ["false", "0", "no", "n", "null", "none", "ไม่", "ไม่ใช่"].includes(t)) && !value.includes("{{");
  }
  return (
    <svg className="check-glyph" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect x="2" y="2" width="96" height="96" fill="none" stroke={el.stroke ?? "#1F2937"} strokeWidth="6" vectorEffect="non-scaling-stroke" />
      {on && <path d="M22 52 L42 74 L80 26" fill="none" stroke={el.stroke ?? "#1F2937"} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
