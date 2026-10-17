/** การ snap และป้ายระยะ (หน่วย mm ภายใน band) — ใช้ร่วมกันทุกมุมมองออกแบบ */

export const SNAP_MM = 0.5;
const SNAP_THRESHOLD_MM = 0.8;

export const snapGrid = (v) => Math.round(v / SNAP_MM) * SNAP_MM;

/**
 * ค่า x/y ที่ snap ได้ — ขอบ band, ขอบเนื้อหา และขอบ element พี่น้องในระยะ 0.8 mm
 * คืน guideX/guideY (ค่าที่ snap เข้า) เพื่อวาดเส้นนำสายตา
 */
export function snapPosition(band, cw, ei, x, y, w, h) {
  let sx = null;
  let sy = null;
  let bestX = SNAP_THRESHOLD_MM;
  let bestY = SNAP_THRESHOLD_MM;
  const xT = [0, cw - w];
  const yT = [0, band.height - h];
  band.elements.forEach((o, j) => {
    if (j === ei) return;
    xT.push(o.x, o.x + (o.w || 0), o.x - w, o.x + (o.w || 0) - w);
    yT.push(o.y, o.y + (o.h || 0), o.y - h, o.y + (o.h || 0) - h);
  });
  for (const t of xT) {
    const d = Math.abs(t - x);
    if (d < bestX) {
      bestX = d;
      sx = t;
    }
  }
  for (const t of yT) {
    const d = Math.abs(t - y);
    if (d < bestY) {
      bestY = d;
      sy = t;
    }
  }
  return { x: sx ?? snapGrid(x), y: sy ?? snapGrid(y), guideX: sx, guideY: sy };
}

export const fmtMm = (v) => (Math.round(v * 10) / 10).toFixed(1);

/**
 * ป้ายระยะของ element ที่เลือก: ระยะจากขอบซ้ายเนื้อหา, จากขอบบน band,
 * และช่องว่างถึงพี่น้องที่อยู่ซ้าย/บนใกล้ที่สุด (คืนเป็น mm ทั้งหมด)
 */
export function measureSelection(band, ei) {
  const el = band.elements[ei];
  if (!el) return [];
  const out = [];
  const w = el.w || 0;
  const h = el.h || 0;
  if (el.x > 0.05) out.push({ kind: "h", x1: 0, x2: el.x, y: el.y + h / 2, text: `${fmtMm(el.x)} mm` });
  if (el.y > 0.05) out.push({ kind: "v", y1: 0, y2: el.y, x: el.x + w / 2, text: `${fmtMm(el.y)} mm` });

  let left = null;
  let top = null;
  band.elements.forEach((o, j) => {
    if (j === ei) return;
    const oR = o.x + (o.w || 0);
    const oB = o.y + (o.h || 0);
    const vOverlap = o.y < el.y + h && oB > el.y;
    const hOverlap = o.x < el.x + w && oR > el.x;
    if (vOverlap && oR <= el.x + 0.01 && (!left || oR > left.right)) left = { right: oR };
    if (hOverlap && oB <= el.y + 0.01 && (!top || oB > top.bottom)) top = { bottom: oB };
  });
  if (left && el.x - left.right > 0.05) {
    out.push({ kind: "h", x1: left.right, x2: el.x, y: el.y + h / 2 + 3, text: `ห่าง ${fmtMm(el.x - left.right)} mm` });
  }
  if (top && el.y - top.bottom > 0.05) {
    out.push({ kind: "v", y1: top.bottom, y2: el.y, x: el.x + w / 2 + 3, text: `ห่าง ${fmtMm(el.y - top.bottom)} mm` });
  }
  return out;
}
