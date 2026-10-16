// การจำลองการขึ้นหน้าใหม่ของหน้าออกแบบ — ไม่ผูกกับ React เพื่อให้ทดสอบได้ตรงๆ
// กฎเดียวกับ engine (tr-pdf): ดูหมายเหตุในฟังก์ชัน simulatePages

import { detailSourceOf, rowsOf, tableSourceOf } from "./bind";

/** 1 pt = 0.3528 mm — ใช้คำนวณขนาดตัวอักษรให้ตรงกับกระดาษจริง */
const PT_MM = 0.3528;
/** ความสูงหนึ่งแถวตาราง (mm) โดยประมาณ: ตัวอักษร × 1.6 + padding บน-ล่าง 4.5pt */
const rowMm = (size) => (size * 1.6 + 9) * PT_MM;
/** ความสูงตาราง (หัว + ทุกแถวข้อมูล) mm */
const tableMm = (el, nRows) => (1 + Math.max(1, nRows)) * rowMm(el.size ?? 10);

/**
 * จำลองการเรียงหน้าตามกฎของ engine (tr-pdf): band รายการ (detail) วนทีละแถวข้อมูล แถวละ height
 * และตัดหน้าเมื่อแถวไม่พอ · band ที่มีตารางอย่างเดียวไหลตามจำนวนแถวจริง · band อื่นใช้ความสูงของตัวเอง
 * คืน events (ตำแหน่งการขึ้นหน้าใหม่ต่อ band) และจำนวนหน้าโดยประมาณ
 */
export function simulatePages(indexed, data, capMm) {
  const events = [];
  let page = 1;
  let y = 0;
  let totalMm = 0;
  const cap = capMm > 0 ? capMm : Infinity;
  for (const { b, i } of indexed) {
    const only = b.elements.length === 1 ? b.elements[0] : null;
    if (b.type === "detail" && !only?.type?.includes("table")) {
      const unit = b.height || 0;
      const rows = rowsOf(data, detailSourceOf(b)).length;
      for (let r = 0; r < rows; r++) {
        if (y + unit > cap + 0.01 && y > 0.01) {
          page++;
          y = 0;
          events.push({ bi: i, kind: "between", page });
        }
        y += unit;
        totalMm += unit;
      }
      continue;
    }
    const h = only?.type === "table" ? (only.y ?? 0) + tableMm(only, rowsOf(data, tableSourceOf(only, b)).length) : b.height || 0;
    if (y + h > cap + 0.01 && y > 0.01) {
      page++;
      y = 0;
      events.push({ bi: i, kind: "before", page });
    }
    y += h;
    totalMm += h;
    while (y > cap + 0.01) {
      page++;
      y -= cap;
    }
  }
  return { pages: page, events, totalMm };
}

export { tableMm };
