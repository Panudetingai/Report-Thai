/**
 * กรอบแบบ Figma frame — กรอบสี่เหลี่ยมเป็น "พ่อ" ของ element ที่อยู่ข้างในทั้งชิ้น
 * - ลาก / คัดลอก / ทำซ้ำ / ลบ / เปลี่ยนลำดับซ้อน กรอบ = ทำกับของข้างในด้วย
 * - ลากหรือย่อขยายแล้ว กรอบจะถอยไปอยู่ใต้ของข้างใน (ไม่งั้นสีพื้นกรอบจะทับข้อความใน PDF)
 * โมเดลข้อมูลยังเป็นรายการแบน ๆ ตาม engine — ความเป็นพ่อลูกคิดจากตำแหน่งทุกครั้ง
 */

const EPS = 0.01;
/** ระยะห่างจากขอบกรอบเมื่อวางของลงในกรอบ (mm) */
export const FRAME_PAD = 1.5;

export const isFrame = (el) => el?.type === "rectangle";

/** กล่องของ element (เส้นใช้ความหนา 0 ได้) */
function box(el) {
  return { x: el.x ?? 0, y: el.y ?? 0, w: el.w ?? 0, h: el.h ?? 0 };
}

/** a อยู่ใน b ทั้งชิ้น */
export function inside(a, b) {
  const p = box(a);
  const q = box(b);
  return p.x >= q.x - EPS && p.y >= q.y - EPS && p.x + p.w <= q.x + q.w + EPS && p.y + p.h <= q.y + q.h + EPS;
}

/**
 * f เป็นพ่อของ j ได้ไหม: j อยู่ข้างใน f ทั้งชิ้น (ไม่สนลำดับซ้อน เหมือน Figma)
 * กล่องเท่ากันพอดีให้ตัวที่อยู่ล่าง (index ต่ำ) เป็นพ่อ กันการเป็นพ่อลูกกันเอง
 */
function canParent(els, f, j) {
  if (f === j || !isFrame(els[f]) || els[j].type === "table") return false;
  if (!inside(els[j], els[f])) return false;
  return !(inside(els[f], els[j]) && f > j);
}

/** ลูกโดยตรงและลูกหลานของกรอบ fi = element ที่อยู่ข้างในกรอบทั้งชิ้น (ไม่นับตาราง) */
export function frameChildren(els, fi) {
  if (!isFrame(els[fi])) return [];
  const out = [];
  for (let j = 0; j < els.length; j++) if (canParent(els, fi, j)) out.push(j);
  return out;
}

/** กรอบที่ใกล้ที่สุด (เล็กที่สุด) ที่ครอบ element j — ไม่มีคืน -1 */
export function parentFrameOf(els, j) {
  let best = -1;
  for (let f = 0; f < els.length; f++) {
    if (!canParent(els, f, j)) continue;
    const a = (els[f].w ?? 0) * (els[f].h ?? 0);
    const b = best < 0 ? Infinity : (els[best].w ?? 0) * (els[best].h ?? 0);
    if (a < b || (a === b && best >= 0 && inside(els[f], els[best]))) best = f;
  }
  return best;
}

/** ขยายชุดที่เลือกให้รวมของในกรอบทุกชั้น — ใช้กับลาก/คัดลอก/ลบ/ลำดับซ้อน */
export function withFrameChildren(els, idxs: number[]): number[] {
  const set = new Set<number>(idxs.filter((i) => i >= 0 && i < els.length));
  const queue = [...set];
  while (queue.length) {
    const i = queue.pop();
    for (const c of frameChildren(els, i)) {
      if (!set.has(c)) {
        set.add(c);
        queue.push(c);
      }
    }
  }
  return [...set].sort((a, b) => (a as number) - (b as number));
}

/** กรอบบนสุดที่มีจุด (x, y) อยู่ข้างใน — ใช้ตอนวางของใหม่ลงในกรอบ */
export function frameAt(els, x, y) {
  for (let i = els.length - 1; i >= 0; i--) {
    const f = els[i];
    if (!isFrame(f)) continue;
    const q = box(f);
    if (x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h) return i;
  }
  return -1;
}

/** กรอบบนสุดที่จะรับ element กล่องนี้เป็นลูก (ยกเว้นตัวเองและลูกของตัวเอง) */
export function frameFor(els, rect, skip = []) {
  const no = new Set(skip);
  for (let i = els.length - 1; i >= 0; i--) {
    if (no.has(i) || !isFrame(els[i])) continue;
    if (inside(rect, els[i])) return i;
  }
  return -1;
}

/**
 * ตำแหน่ง/ขนาดของ element ใหม่เมื่อวางที่จุด (x, y) ในกรอบ — ข้อความกว้างเต็มกรอบ ของอื่นถูกดันให้อยู่ข้างใน
 * คืน null ถ้าจุดนั้นไม่อยู่ในกรอบ
 */
export function placeInFrame(els, el, x, y) {
  if (el.type === "table" || el.type === "line") return null;
  const fi = frameAt(els, x, y);
  if (fi < 0) return null;
  const f = box(els[fi]);
  const pad = Math.min(FRAME_PAD, f.w / 4, f.h / 4);
  const innerW = Math.max(1, f.w - pad * 2);
  const innerH = Math.max(1, f.h - pad * 2);
  const w = el.type === "text" ? innerW : Math.min(el.w ?? 0, innerW);
  const h = Math.min(el.h ?? 0, innerH);
  const cx = Math.min(Math.max(x, f.x + pad), f.x + pad + innerW - w);
  const cy = Math.min(Math.max(y, f.y + pad), f.y + pad + innerH - h);
  return { frame: fi, x: round(el.type === "text" ? f.x + pad : cx), y: round(cy), w: round(w), h: round(h) };
}

/** ข้อความใหม่ที่เต็มพื้นที่ด้านในกรอบ (ดับเบิลคลิกกรอบ) */
export function textBoxInFrame(frame) {
  const f = box(frame);
  const pad = Math.min(FRAME_PAD, f.w / 4, f.h / 4);
  return { x: round(f.x + pad), y: round(f.y + pad), w: round(Math.max(1, f.w - pad * 2)), h: round(Math.max(1, f.h - pad * 2)) };
}

/**
 * จัดลำดับซ้อนให้กรอบอยู่ใต้ของที่อยู่ข้างในเสมอ — เช่นวาดกรอบครอบข้อความเดิม
 * คืน order (ตำแหน่งใหม่ → index เดิม) หรือ null ถ้าไม่ต้องเปลี่ยน
 */
export function settleOrder(els) {
  let order = els.map((_, i) => i);
  let changed = false;
  // วนจนนิ่ง — จำนวนรอบไม่เกินจำนวนกรอบ (แต่ละรอบกรอบหนึ่งถอยลงไปใต้ของข้างใน)
  for (let pass = 0; pass <= els.length; pass++) {
    let moved = false;
    for (let p = 0; p < order.length; p++) {
      const f = els[order[p]];
      if (!isFrame(f)) continue;
      let first = -1;
      for (let q = 0; q < p; q++) {
        const c = els[order[q]];
        if (c.type !== "table" && inside(c, f) && !inside(f, c)) {
          first = q;
          break;
        }
      }
      if (first < 0) continue;
      const [fi] = order.splice(p, 1);
      order.splice(first, 0, fi);
      moved = changed = true;
    }
    if (!moved) break;
  }
  return changed ? order : null;
}

function round(v) {
  return Math.round(v * 10) / 10;
}
