import React, { useEffect, useMemo, useRef, useState } from "react";
import { BAND_LABELS, BAND_ORDER, KIND_LABELS, bandRank, bandTitle, needsFollow, newElement, planMove, planPlacement } from "./state.js";
import { groupMembers } from "./layout-tools.js";
import { contentWidth, margins, pageSize } from "./layout.js";
import { measureSelection, snapGrid, snapPosition, fmtMm } from "./snap.js";
import { bindPreview, bindSegments, detailSourceOf, rowsOf, tableSourceOf } from "./bind.js";
import { DND_KIND, hitBandArea, pointerToBandMm } from "./canvas/bandHit.js";

export const RULER_H = 22;
const TAG_W = 140;
/** 1 pt = 0.3528 mm — ใช้คำนวณขนาดตัวอักษรให้ตรงกับกระดาษจริง */
const PT_MM = 0.3528;
/** ความสูงหนึ่งแถวตาราง (mm) โดยประมาณ: ตัวอักษร × 1.6 + padding บน-ล่าง 4.5pt */
const rowMm = (size) => (size * 1.6 + 9) * PT_MM;
/** ความสูงตาราง (หัว + ทุกแถวข้อมูล) mm */
const tableMm = (el, nRows) => (1 + Math.max(1, nRows)) * rowMm(el.size ?? 10);
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
/** ความสูงแถวขั้นต่ำ — กัน label band ทับกันเมื่อซูมเล็ก */
const TAG_ROW_MIN_PX = 46;
const BAND_AREA_MIN_PX = 6;
const KIND_OF_TYPE = { text: "text", line: "line", rectangle: "rect", ellipse: "ellipse", image: "image", table: "table", checkbox: "checkbox" };

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
export function BandStage({ template, data, bandIdx, selEl, selIdxs = [], onSelect, dispatch, S, onWheelZoom, onPlaced, onNotice, textScale = 1, sampleRows = 3, tableMode = "compact", onAddBand, onRemoveBand }) {
  const page = useMemo(() => pageSize(template), [template]);
  const m = useMemo(() => margins(template), [template]);
  const cw = contentWidth(template);
  const contentH = page.h - m.t - m.b;
  const totalH = template.bands.reduce((a, b) => a + (b.height || 0), 0);
  const cwPx = cw * S;

  const templateRef = useRef(template);
  templateRef.current = template;
  const sRef = useRef(S);
  sRef.current = S;
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const bandAreasRef = useRef([]);

  const [guides, setGuides] = useState(null);
  const [readout, setReadout] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [dragging, setDragging] = useState(false);

  const indexed = template.bands.map((b, i) => ({ b, i })).sort((a, c) => bandRank(a.b.type) - bandRank(c.b.type) || a.i - c.i);

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
    function onMove(e) {
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

      if (d.multi) {
        // ลากหลายรายการใน band เดียว: รายการหลักใช้เส้นนำสายตา แล้วทุกตัวขยับตามระยะเดียวกัน
        const primary = snapPosition(t.bands[d.bi], contentWidth(t), d.ei, d.ox + (e.clientX - d.sx) / k, d.oy + (e.clientY - d.sy) / k, d.ow, d.oh);
        const ddx = primary.x - d.ox;
        const ddy = primary.y - d.oy;
        const changes = d.multi.idxs.map((i) => ({ ei: i, patch: { x: d.multi.starts[i].x + ddx, y: d.multi.starts[i].y + ddy } }));
        dispatch({ type: "patchEls", band: d.bi, changes, record: false });
        setGuides({ bi: d.bi, x: primary.guideX, y: primary.guideY });
        setReadout({ text: `${d.multi.idxs.length} รายการ · X ${fmtMm(primary.x)} · Y ${fmtMm(primary.y)} mm`, x: primary.x, y: primary.y, bi: d.bi });
        return;
      }

      const hit = hitBandArea(bandAreasRef.current, e.clientX, e.clientY);
      const targetBi = hit?.bi ?? d.bi;
      setDropTarget(hit?.bi ?? null);

      const band = t.bands[targetBi];
      const cwNow = contentWidth(t);
      // element อื่นที่ลงบน band ที่มีตาราง: ยังไม่ย้ายระหว่างลาก — จะย้ายไป band ใต้ตารางตอนปล่อยเมาส์
      const movingEl = t.bands[d.bi]?.elements[d.ei];
      const blocked = d.mode === "move" && targetBi !== d.bi && !!movingEl && needsFollow(t, targetBi, movingEl.type);
      d.pendingTo = blocked ? targetBi : null;
      if (blocked) {
        setDropTarget(targetBi);
        setGuides(null);
        setReadout({ text: "ปล่อยเพื่อวางใต้ตาราง (band สรุป)", x: 0, y: 0, bi: targetBi });
        return;
      }
      let x;
      let y;
      if (hit) {
        const p = pointerToBandMm(e.clientX, e.clientY, hit.rect, k, d.grabX, d.grabY);
        x = p.x;
        y = p.y;
      } else {
        x = d.ox + (e.clientX - d.sx) / k;
        y = d.oy + (e.clientY - d.sy) / k;
      }

      if (d.mode === "move" && targetBi !== d.bi) {
        const snapped = snapPosition(band, cwNow, -1, x, y, d.ow, d.oh);
        const newEi = t.bands[targetBi].elements.length;
        dispatch({
          type: "transferEl",
          fromBand: d.bi,
          fromEl: d.ei,
          toBand: targetBi,
          x: snapped.x,
          y: snapped.y,
          record: false,
        });
        onSelect(targetBi, newEi);
        dragRef.current = {
          ...d,
          bi: targetBi,
          ei: newEi,
          ox: snapped.x,
          oy: snapped.y,
          sx: e.clientX,
          sy: e.clientY,
        };
        setGuides({ bi: targetBi, x: snapped.guideX, y: snapped.guideY });
        setReadout({
          text: `${bandTitle(band)} · X ${fmtMm(snapped.x)} · Y ${fmtMm(snapped.y)} mm`,
          x: snapped.x,
          y: snapped.y,
          bi: targetBi,
        });
        return;
      }

      if (d.mode === "move") {
        const p = snapPosition(band, cwNow, d.ei, x, y, d.ow, d.oh);
        dispatch({ type: "transferEl", fromBand: d.bi, fromEl: d.ei, toBand: d.bi, x: p.x, y: p.y, record: false });
        setGuides({ bi: d.bi, x: p.guideX, y: p.guideY });
        setReadout({ text: `X ${fmtMm(p.x)} · Y ${fmtMm(p.y)} mm`, x: p.x, y: p.y, bi: d.bi });
      } else {
        const w = Math.min(Math.max(2, snapGrid(d.ow + (e.clientX - d.sx) / k)), cwNow - d.ox);
        const h = Math.min(Math.max(d.oh > 0 ? 2 : 0, snapGrid(d.oh + (e.clientY - d.sy) / k)), band.height - d.oy);
        dispatch({ type: "patchEl", band: d.bi, el: d.ei, patch: { w, h }, record: false });
        setReadout({ text: `W ${fmtMm(w)} · H ${fmtMm(h)} mm`, x: d.ox + w, y: d.oy + h, bi: d.bi });
      }
    }
    function onUp() {
      const d = dragRef.current;
      if (d?.mode === "move" && d.pendingTo != null) {
        // ไม่บันทึกขั้นใหม่: ขั้น undo ของการลากถูกบันทึกไว้แล้วตอนเริ่มขยับ
        dispatch({ type: "transferEl", fromBand: d.bi, fromEl: d.ei, toBand: d.pendingTo, x: 0, y: 0, record: false });
        const plan = planMove(templateRef.current, d.bi, d.ei, d.pendingTo);
        if (!plan.error) onSelect(plan.band, plan.elIndex);
      }
      dragRef.current = null;
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
  const sel = selEl != null ? template.bands[bandIdx]?.elements[selEl] : null;
  const showDims = S >= 0.52 && !dragging;
  const annotations = sel && showDims ? measureSelection(template.bands[bandIdx], selEl) : [];
  const compactUi = S < 0.68;

  return (
    <div className="design-scroll" ref={scrollRef} onPointerDown={() => onSelect(bandIdx, null)}>
      <div
        className="design-frame design-sheet"
        style={{ width: TAG_W + m.l * S + cwPx + m.r * S + 32, "--zoom": S }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="hruler" style={{ marginLeft: TAG_W + m.l * S, width: cwPx, height: RULER_H }}>
          {ticks.map((mm) => (
            <span key={mm} className={`htick${mm % 10 === 0 ? " major" : ""}`} style={{ left: mm * S }}>
              {mm % 10 === 0 && mm < cw && <em>{mm}</em>}
            </span>
          ))}
        </div>

        {indexed.map(({ b, i: bi }) => {
          const hPx = Math.max(bandMm(b, data, sampleRows, tableMode) * S, BAND_AREA_MIN_PX);
          const rowPx = Math.max(hPx + 8, TAG_ROW_MIN_PX);
          const insetY = (rowPx - hPx) / 2;
          const isSel = bi === bandIdx;
          const isDrop = dropTarget === bi;
          const accent = BAND_ACCENT[b.type] ?? "#64748b";
          const showFrameLabel = hPx >= 26 && !compactUi;
          const sampleRow = b.type === "detail" ? rowsOf(data, detailSourceOf(b))[0] : undefined;
          return (
            <div
              key={`${b.type}-${bi}`}
              className={`band-row${isSel ? " is-active" : ""}${isDrop ? " is-drop" : ""}${compactUi ? " is-compact" : ""}`}
              style={{ minHeight: rowPx, height: rowPx }}
            >
              <div className="band-tag-slot" style={{ width: TAG_W }}>
                <button
                  type="button"
                  className="band-tag"
                  style={{ "--band-accent": accent }}
                  onClick={() => onSelect(bi, null)}
                  title={`${bandTitle(b)} · ${b.height} mm`}
                >
                  <span className="band-tag-dot" aria-hidden="true" />
                  {isSel && onRemoveBand && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="band-del"
                      title="ลบ band นี้ (Ctrl/⌘+Z เพื่อย้อนกลับ)"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveBand(bi);
                      }}
                    >
                      ×
                    </span>
                  )}
                  <span className="band-tag-text">
                    <span className="band-tag-name">{bandTitle(b)}</span>
                    {!compactUi && (
                      <span className="band-tag-meta mono">
                        {b.height} mm · {b.elements.length}
                      </span>
                    )}
                  </span>
                </button>
              </div>
              <div className="band-canvas-row">
                <div className="margin-strip" style={{ width: m.l * S, height: hPx, marginTop: insetY }} />
                <div
                  className="band-area band-frame"
                  ref={(node) => setBandAreaRef(bi, node)}
                  style={{ width: cwPx, height: hPx, marginTop: insetY, "--frame-accent": accent, "--cell": `${Math.max(8, 10 * S)}px` }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelect(bi, null);
                  }}
                  onDragOver={(e) => onBandDragOver(e, bi)}
                  onDragLeave={() => setDropTarget((cur) => (cur === bi ? null : cur))}
                  onDrop={(e) => onBandDrop(e, bi)}
                >
                  {showFrameLabel && <span className="frame-label">{bandTitle(b)}</span>}

                  {b.elements.map((el, ei) => (
                    <ElementBox
                      key={`${bi}-${ei}-${el.type}`}
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
                <div className="margin-strip" style={{ width: m.r * S, height: hPx, marginTop: insetY }} />
              </div>
            </div>
          );
        })}

        {onAddBand && (
          <AddBandSlot existingTypes={template.bands.map((b) => b.type)} onAdd={onAddBand} width={TAG_W} />
        )}

        <div className="design-foot mono small muted" style={{ marginLeft: TAG_W }}>
          เนื้อหารวม {fmtMm(totalH)} / {fmtMm(contentH)} mm
          {totalH > contentH + 0.01 && <span className="warn"> · เกินพื้นที่หน้า</span>}
        </div>
      </div>
    </div>
  );
}

function ElementBox({ el, data, dataRows, sampleRow, sampleRows, heightRows, textScale, selected, onPointerDown, onHandle, S }) {
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
    <div className={cls} style={style} onPointerDown={onPointerDown}>
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
      {el.type === "table" && <TableGhost el={el} scale={S * textScale} data={data} dataRows={dataRows} sampleRows={sampleRows} />}
      {el.type === "checkbox" && <CheckGlyph el={el} data={data} row={sampleRow} />}
      {el.type === "image" && hPx >= 14 && <span className="el-img-hint">{el.src?.startsWith("data:") ? "" : "รูป"}</span>}
      {!isLine && (selected || S >= 0.6) && (
        <span className="el-tag">{KIND_LABELS[el.type] ?? el.type}</span>
      )}
      {selected && hPx >= 10 && <span className="el-handle" onPointerDown={onHandle} />}
    </div>
  );
}

/** ข้อความที่แทนค่าตัวอย่างแล้ว — ตัวแปรที่หาไม่พบแสดงเป็นป้ายเตือนสีแดง (engine จะพิมพ์เป็นว่าง) */
function BoundText({ text, data, row }) {
  return bindSegments(text, data, { row }).map((seg, i) =>
    "raw" in seg ? (
      <mark key={i} className="tok-missing" title="ไม่พบฟิลด์นี้ในข้อมูล — PDF จะเป็นช่องว่าง">
        {seg.raw}
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

/** ตารางจริงตามข้อมูล: หัว + ทุกแถวข้อมูล (แสดงสูงสุด 60 แถว) พร้อมค่าตัวอย่างและสีตามกฎ */
function TableGhost({ el, scale, data, dataRows, sampleRows }) {
  const cols = el.columns ?? [];
  const total = cols.reduce((a, c) => a + (c.width || 0), 0) || 1;
  const headSize = Math.max(3, (el.size ?? 9) * PT_MM * scale);
  // แสดงเฉพาะแถวตัวอย่าง เพื่อให้หน้าออกแบบอ่านง่ายแม้ข้อมูลเป็นพันแถว — ความสูงกรอบยังคงตามจำนวนแถวจริง
  const rows = dataRows.slice(0, sampleRows);
  const shown = rows.length ? rows : [null];
  const pct = (c) => `${((c.width || 0) / total) * 100}%`;
  return (
    <div className="table-ghost" style={{ fontFamily: '"Sarabun", sans-serif' }}>
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
      {shown.map((row, ri) => (
        <div key={ri} className="tg-row">
          {cols.map((c, i) => {
            const st = cellStyleFor(el, c, i, ri);
            const val = row ? bindPreview(c.field, data, { row }) : c.field;
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
      {dataRows.length > rows.length && (
        <div className="tg-more" style={{ fontSize: Math.max(9, 11 * Math.min(scale, 1)) }}>
          ⋯ อีก {dataRows.length - rows.length} แถว · ความสูงจริงประมาณ {Math.round(tableMm(el, dataRows.length))} mm (ดูตำแหน่งจริงที่พรีวิว)
        </div>
      )}
      <div className="tg-foot" style={{ fontSize: Math.max(9, 11 * Math.min(scale, 1)) }}>
        {dataRows.length} แถวข้อมูล
      </div>
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
  const value = bindPreview(el.checked ?? "", data, { row });
  const t = value.trim().toLowerCase();
  const on = !(t === "" || ["false", "0", "no", "n", "null", "none", "ไม่", "ไม่ใช่"].includes(t)) && !value.includes("{{");
  return (
    <svg className="check-glyph" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect x="2" y="2" width="96" height="96" fill="none" stroke={el.stroke ?? "#1F2937"} strokeWidth="6" vectorEffect="non-scaling-stroke" />
      {on && <path d="M22 52 L42 74 L80 26" fill="none" stroke={el.stroke ?? "#1F2937"} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
