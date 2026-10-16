/**
 * เครื่องมือจัดวาง/จัดกลุ่ม element หลายชิ้นใน band เดียว (ฟังก์ชันบริสุทธิ์ ไม่แตะ state)
 * ค่าทั้งหมดเป็น mm ภายใน band และ snap เป็น 0.5 mm เหมือนการลาก
 */
import { snapGrid } from "./snap";

export const ALIGN_ACTIONS = [
  { id: "left", label: "ชิดซ้าย", title: "จัดให้ชิดขอบซ้ายสุด" },
  { id: "hcenter", label: "กึ่งกลางแนวนอน", title: "จัดให้อยู่กึ่งกลางแนวนอน" },
  { id: "right", label: "ชิดขวา", title: "จัดให้ชิดขอบขวาสุด" },
  { id: "top", label: "ชิดบน", title: "จัดให้ชิดขอบบนสุด" },
  { id: "vcenter", label: "กึ่งกลางแนวตั้ง", title: "จัดให้อยู่กึ่งกลางแนวตั้ง" },
  { id: "bottom", label: "ชิดล่าง", title: "จัดให้ชิดขอบล่างสุด" },
  { id: "distH", label: "เว้นระยะแนวนอน", title: "กระจายระยะห่างเท่ากันแนวนอน (ต้องมี 3 รายการขึ้นไป)" },
  { id: "distV", label: "เว้นระยะแนวตั้ง", title: "กระจายระยะห่างเท่ากันแนวตั้ง (ต้องมี 3 รายการขึ้นไป)" },
  { id: "sameW", label: "ความกว้างเท่ากัน", title: "ตั้งความกว้างเท่ากับรายการหลัก" },
  { id: "sameH", label: "ความสูงเท่ากัน", title: "ตั้งความสูงเท่ากับรายการหลัก" },
];

const r = (v) => Math.round(v * 100) / 100;

/**
 * ค่า patch ของแต่ละ element ที่เลือกตามคำสั่งจัดวาง
 * @param {Array} els elements ทั้งหมดของ band
 * @param {number[]} idxs index ของ element ที่เลือก
 * @param {string} mode ดู ALIGN_ACTIONS
 * @param {number} primary index ของรายการหลัก (ใช้กับ sameW/sameH)
 * @returns {Array<{ei:number, patch:object}>}
 */
export function alignChanges(els, idxs, mode, primary, cw) {
  const sel = idxs.filter((i) => els[i]);
  if (!sel.length) return [];
  const box = (i) => els[i];
  const minX = Math.min(...sel.map((i) => box(i).x));
  const maxX = Math.max(...sel.map((i) => box(i).x + (box(i).w || 0)));
  const minY = Math.min(...sel.map((i) => box(i).y));
  const maxY = Math.max(...sel.map((i) => box(i).y + (box(i).h || 0)));
  const clampX = (x, w) => Math.max(0, Math.min(x, cw - w));
  const out = [];
  const push = (ei, patch) => out.push({ ei, patch });

  switch (mode) {
    case "left":
      sel.forEach((i) => push(i, { x: r(minX) }));
      break;
    case "right":
      sel.forEach((i) => push(i, { x: r(maxX - box(i).w) }));
      break;
    case "hcenter":
      sel.forEach((i) => push(i, { x: r(clampX((minX + maxX) / 2 - (box(i).w || 0) / 2, box(i).w || 0)) }));
      break;
    case "top":
      sel.forEach((i) => push(i, { y: r(minY) }));
      break;
    case "bottom":
      sel.forEach((i) => push(i, { y: r(maxY - (box(i).h || 0)) }));
      break;
    case "vcenter":
      sel.forEach((i) => push(i, { y: r((minY + maxY) / 2 - (box(i).h || 0) / 2) }));
      break;
    case "distH":
    case "distV": {
      if (sel.length < 3) return [];
      const horiz = mode === "distH";
      const pos = (i) => (horiz ? box(i).x : box(i).y);
      const size = (i) => (horiz ? box(i).w : box(i).h) || 0;
      const order = [...sel].sort((a, b) => pos(a) - pos(b));
      const first = pos(order[0]);
      const last = pos(order[order.length - 1]) + size(order[order.length - 1]);
      const total = order.reduce((a, i) => a + size(i), 0);
      const gap = (last - first - total) / (order.length - 1);
      let cursor = first;
      order.forEach((i, k) => {
        if (k > 0 && k < order.length - 1) push(i, horiz ? { x: r(snapGrid(cursor)) } : { y: r(snapGrid(cursor)) });
        cursor += size(i) + gap;
      });
      break;
    }
    case "sameW":
      sel.forEach((i) => i !== primary && push(i, { w: box(primary).w }));
      break;
    case "sameH":
      sel.forEach((i) => i !== primary && push(i, { h: box(primary).h }));
      break;
    default:
      return [];
  }
  return out.map((c) => ({ ei: c.ei, patch: snapPatch(c.patch) }));
}

function snapPatch(p) {
  const out = {};
  for (const [k, v] of Object.entries(p)) out[k] = typeof v === "number" ? snapGrid(v) : v;
  return out;
}

/** รหัสกลุ่มใหม่ (ไม่ซ้ำในทางปฏิบัติ) */
export function newGroupId() {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** element ทั้งหมดในกลุ่มเดียวกับ ei (ถ้าไม่มีกลุ่ม คืน [ei]) */
export function groupMembers(els, ei) {
  const g = els[ei]?.group;
  if (!g) return [ei];
  return els.map((e, i) => (e.group === g ? i : -1)).filter((i) => i >= 0);
}
