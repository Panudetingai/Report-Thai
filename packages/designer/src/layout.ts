/**
 * ตำแหน่งกระดาษ/band บนหน้า (หน่วย mm) — ตามลำดับการวางของ engine (tr-pdf layout_all):
 * pageHeader → title (หน้าแรก) → columnHeader → detail → groupFooter/summary → pageFooter (ติดล่าง)
 * ใช้วาดกรอบ band และวางกล่อง element ให้ตรงกับ PDF ที่ engine render
 */

export const PAGE_MM = {
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
};

/** 100% = ขนาดจริงบนจอ (96 dpi) */
export const BASE_PX_PER_MM = 96 / 25.4;

export const PAGE_SIZES = [...Object.keys(PAGE_MM), "Custom"];

export function pageSize(template) {
  const p = template.page ?? {};
  const [w, h] = p.size === "Custom" && p.custom_mm ? p.custom_mm : PAGE_MM[p.size ?? "A4"] ?? PAGE_MM.A4;
  return p.orientation === "landscape" ? { w: h, h: w } : { w, h };
}

export function margins(template) {
  const [t, r, b, l] = template.page?.margin ?? [10, 10, 10, 10];
  return { t, r, b, l };
}

export function contentWidth(template) {
  const p = pageSize(template);
  const m = margins(template);
  return p.w - m.l - m.r;
}

/** คืน array ของ y (mm บนหน้า) ของแต่ละ band ตาม index ใน template.bands */
export function bandTops(template) {
  const page = pageSize(template);
  const m = margins(template);
  const bands = template.bands;
  const find = (type) => bands.findIndex((b) => b.type === type);
  const tops = new Array(bands.length).fill(null);
  const place = (i, y) => {
    if (i >= 0) tops[i] = y;
  };

  let y = m.t;
  const ph = find("pageHeader");
  const ti = find("title");
  const ch = find("columnHeader");
  place(ph, y);
  if (ph >= 0) y += bands[ph].height;
  place(ti, y);
  if (ti >= 0) y += bands[ti].height;
  place(ch, y);
  if (ch >= 0) y += bands[ch].height;

  // ต้นเนื้อหาของหน้า (ไม่นับหัวเรื่อง) — ตรงกับ `top` ของ engine
  const top = m.t + (ph >= 0 ? bands[ph].height : 0) + (ch >= 0 ? bands[ch].height : 0);

  const de = find("detail");
  place(de, y);
  if (de >= 0) y += bands[de].height;

  for (const i of [find("groupFooter"), find("summary")]) {
    if (i < 0) continue;
    const gap = y > top + 0.01 ? bands[i].gap_before ?? 0 : 0;
    y += gap;
    place(i, y);
    y += bands[i].height;
  }

  const pf = find("pageFooter");
  if (pf >= 0) place(pf, page.h - m.b - bands[pf].height);

  // band ชนิดอื่น (เช่น groupHeader) ไม่มีตำแหน่งชัดเจน — วางที่ตำแหน่งปัจจุบัน
  return tops.map((v) => (v == null ? y : v));
}

/** รายการ band ที่ต้องวาดกรอบบนหน้า (ข้าม pageFooter ที่ติดล่างให้วาดเหมือนกัน) */
export function bandRects(template) {
  const m = margins(template);
  const cw = contentWidth(template);
  const tops = bandTops(template);
  return template.bands.map((b, i) => ({
    index: i,
    type: b.type,
    x: m.l,
    y: tops[i],
    w: cw,
    h: b.height,
  }));
}
