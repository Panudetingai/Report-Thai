/** สถานะ designer + undo/redo (ทุกการแก้ไขผ่าน reducer เดียว) */

import { contentWidth as contentWidthMm } from "./layout.js";
import { withFrameNames } from "./names.js";

const HISTORY_LIMIT = 100;

/** ลำดับ band ที่แสดงบนหน้าออกแบบ (หัวกระดาษบนสุด → ท้ายกระดาษล่างสุด) */
export const BAND_ORDER = ["pageHeader", "title", "columnHeader", "detail", "groupHeader", "groupFooter", "summary", "pageFooter"];
export const BAND_DEFAULT_HEIGHT = { pageHeader: 8, title: 20, columnHeader: 8, detail: 8, groupHeader: 8, groupFooter: 8, summary: 20, pageFooter: 8 };

export function bandRank(type) {
  const i = BAND_ORDER.indexOf(type);
  return i < 0 ? 99 : i;
}
const SNAP_MM = 0.5;

export const BAND_LABELS = {
  title: "หัวเรื่อง",
  pageHeader: "หัวกระดาษ",
  columnHeader: "หัวคอลัมน์",
  detail: "รายการ",
  groupHeader: "หัวกลุ่ม",
  groupFooter: "ท้ายกลุ่ม",
  summary: "สรุป / ท้ายเอกสาร",
  pageFooter: "ท้ายกระดาษ",
};

/** ชื่อ band แบบที่ใช้กันทั่วไปใน report designer (แสดงคู่กับ BAND_LABELS) */
export const BAND_STD = {
  pageHeader: "Page Header",
  title: "Report Header",
  columnHeader: "Column Header",
  detail: "Detail",
  groupHeader: "Group Header",
  groupFooter: "Group Footer",
  summary: "Report Footer",
  pageFooter: "Page Footer",
};

export const KIND_LABELS = {
  text: "ข้อความ",
  line: "เส้น",
  rectangle: "กรอบ",
  image: "รูปภาพ",
  table: "ตาราง",
  checkbox: "ช่องติ๊ก",
};

export const ADD_KINDS = [
  { id: "text", label: "ข้อความ" },
  { id: "line", label: "เส้น" },
  { id: "rect", label: "กรอบ" },
  { id: "ellipse", label: "วงรี" },
  { id: "image", label: "รูปภาพ" },
  { id: "table", label: "ตาราง" },
  { id: "checkbox", label: "ช่องติ๊ก" },
];

const PLACEHOLDER_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export function bandTitle(band) {
  return band.name?.trim() || BAND_LABELS[band.type] || band.type;
}

export function snap(v) {
  return Math.round(v / SNAP_MM) * SNAP_MM;
}

export function newElement(kind) {
  switch (kind) {
    case "text":
      return { type: "text", x: 5, y: 2, w: 80, h: 8, font: "Sarabun-Light", size: 9.5, text: "ข้อความใหม่", overflow: "wrap" };
    case "line":
      return { type: "line", x: 0, y: 0, w: 180, h: 0, width: 0.5 };
    case "rect":
      return { type: "rectangle", x: 10, y: 5, w: 40, h: 20, fill: "#F2F4F7", stroke: "#1F4E79", width: 0.5 };
    case "ellipse":
      return { type: "ellipse", x: 10, y: 5, w: 30, h: 20, fill: "#FFFFFF", stroke: "#1F4E79", width: 0.5 };
    case "checkbox":
      return { type: "checkbox", x: 5, y: 2, w: 4, h: 4, checked: "{{ item.paid }}", stroke: "#1F2937", width: 0.5 };
    case "image":
      return { type: "image", x: 10, y: 5, w: 30, h: 20, src: PLACEHOLDER_PNG };
    case "table":
      return {
        type: "table",
        x: 0,
        y: 0,
        w: 180,
        h: 16,
        font: "Sarabun-Light",
        size: 9,
        data_source: "items",
        header_repeat: true,
        columns: [
          { width: 20, header: "ลำดับ", field: "{{ item.no }}", align: "center" },
          { width: 100, header: "รายการ", field: "{{ item.name }}", align: "left" },
          { width: 60, header: "รวม", field: "{{ item.amount }}", align: "right" },
        ],
      };
    default:
      return null;
  }
}

/**
 * บันทึกการแก้ไขลง undo stack
 * key = กลุ่มการแก้ไขต่อเนื่อง (เช่น การพิมพ์ในช่องเดียวกัน) — การแก้ไขที่ key เดิมติดกันจะรวมเป็น undo ครั้งเดียว
 * ไม่ต้องใช้ snapshot ตอน focus (ซึ่งทำให้เกิดขั้น undo ว่างเปล่า)
 */
function commit(state, template, data, record, key) {
  if (template === state.template && data === state.data) return state;
  const groupKey = record && key ? key : null;
  const coalesce = groupKey != null && groupKey === state.lastKey;
  const past =
    record && !coalesce ? [...state.past, { template: state.template, data: state.data }].slice(-HISTORY_LIMIT) : state.past;
  return { ...state, template, data, past, future: [], lastKey: groupKey };
}

function mapBand(template, bi, fn) {
  return { ...template, bands: template.bands.map((b, i) => (i === bi ? fn(b) : b)) };
}

function mapEl(template, bi, ei, fn) {
  return mapBand(template, bi, (b) => ({
    ...b,
    elements: b.elements.map((e, i) => (i === ei ? fn(e) : e)),
  }));
}

/** ขอบเขตที่ element ขยับได้ภายใน band */
function clampEl(el, band, contentW) {
  const maxX = Math.max(0, contentW - (el.w || 0));
  const maxY = Math.max(0, (band.height || 0) - (el.h || 0));
  return {
    x: Math.min(Math.max(0, el.x), maxX),
    y: Math.min(Math.max(0, el.y), maxY),
  };
}

/** ปัดเศษคอลัมน์ให้รวมเท่ากับความกว้างตารางพอดี (ส่วนต่างเข้าคอลัมน์สุดท้าย) */
export function fixColumnSum(columns, w) {
  const total = columns.reduce((a, c) => a + c.width, 0);
  const diff = Math.round((w - total) * 10) / 10;
  if (!columns.length || diff === 0) return columns;
  const last = columns.length - 1;
  return columns.map((c, i) => (i === last ? { ...c, width: Math.round((c.width + diff) * 10) / 10 } : c));
}

/**
 * กติกาของ engine: band รายการ (detail) ที่มีตาราง ต้องมีตารางตัวเดียวลำพัง
 * (engine วาดทั้ง band ซ้ำทุกแถวข้อมูล ถ้ามี element อื่นอยู่ด้วยตารางจะพิมพ์ซ้ำ)
 * ดังนั้น element อื่นต้องไปอยู่ band ที่ต่อจากตาราง (สรุป/ท้ายกลุ่ม) เสมอ
 */
export function isTableList(band) {
  return !!band && band.type === "detail" && band.elements.some((e) => e.type === "table");
}

/** element ชนิดนี้ต้องถูกย้ายไป band ที่ต่อจากตารางหรือไม่ */
export function needsFollow(template, bi, elType) {
  return elType !== "table" && isTableList(template.bands[bi]);
}

/** จำนวน element ที่ค้างอยู่ใน band รายการที่มีตาราง (ต้องย้ายออก) */
export function countStrays(template) {
  return template.bands.reduce((n, b) => n + (isTableList(b) ? b.elements.filter((e) => e.type !== "table").length : 0), 0);
}

/** index ของ band ที่ต่อจากตาราง: "สรุป" ก่อน แล้ว "ท้ายกลุ่ม" (-1 ถ้าไม่มี) */
function followIndex(template, bi) {
  const base = bandRank(template.bands[bi].type);
  for (const type of ["summary", "groupFooter"]) {
    const i = template.bands.findIndex((b) => b.type === type && bandRank(b.type) > base);
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * band ที่ต่อจากตาราง — ถ้ายังไม่มีให้สร้าง "สรุป" ให้ วางไว้หลัง band ที่มีลำดับต่ำกว่าหรือเท่ากับสรุป
 * (ไม่เรียง band ใหม่ทั้งชุด เพื่อให้ index ของ band เดิมไม่เปลี่ยน)
 */
export function ensureFollowBand(template, bi) {
  const found = followIndex(template, bi);
  if (found >= 0) return { template, index: found };
  const summaryRank = bandRank("summary");
  const band = { type: "summary", height: BAND_DEFAULT_HEIGHT.summary, elements: [] };
  const bands = [...template.bands];
  let at = bands.length;
  while (at > 0 && bandRank(bands[at - 1].type) > summaryRank) at -= 1;
  bands.splice(at, 0, band);
  return { template: { ...template, bands }, index: at };
}

/** ย้าย element ที่ไม่ใช่ตารางออกจาก band รายการไปไว้ band ที่ต่อจากตาราง (จัดตำแหน่งไม่ให้ทับกัน) */
function evictStrays(template, bi) {
  const band = template.bands[bi];
  const strays = band.elements.filter((e) => e.type !== "table");
  if (!strays.length) return template;
  const r = ensureFollowBand(template, bi);
  const cw = contentWidthMm(r.template);
  const follow = r.template.bands[r.index];
  const placed = [];
  for (const el of strays) {
    const w = Math.min(el.w ?? 0, cw);
    const spot = findFreeSpot({ ...follow, elements: [...follow.elements, ...placed] }, w, el.h ?? 0, cw);
    placed.push({ ...el, w, x: spot.x, y: spot.y });
  }
  const height = Math.max(follow.height, ...placed.map((e) => e.y + (e.h || 0)));
  return {
    ...r.template,
    bands: r.template.bands.map((b, i) => {
      if (i === bi) return { ...b, elements: b.elements.filter((e) => e.type === "table") };
      if (i === r.index) return { ...b, height, elements: [...b.elements, ...placed] };
      return b;
    }),
  };
}

/**
 * วางตำแหน่ง element ชนิด elType ลงใน band bi ให้ถูกกติกา
 * - ตารางลง band รายการ → element อื่นใน band นั้นถูกย้ายออกก่อน
 * - element อื่นลง band รายการที่มีตาราง → ย้ายไป band ที่ต่อจากตาราง (สร้างให้ถ้ายังไม่มี)
 * คืน { template, band, elIndex } หรือ { error } ถ้าวางไม่ได้
 */
export function planPlacement(template, bi, elType) {
  const target = template.bands[bi];
  if (!target) return { error: "ไม่พบ band" };
  if (elType === "table" && isTableList(target)) return { error: "band รายการนี้มีตารางอยู่แล้ว — ตารางได้ 1 ตารางต่อ band" };
  if (elType === "table" && target.type === "detail") {
    let t = evictStrays(template, bi);
    // สร้าง band สรุปใต้ Detail ทันที (วางยอดรวม / ท้ายรายงาน — แยกจาก band ตาราง)
    t = ensureFollowBand(t, bi).template;
    return { template: t, band: bi, elIndex: t.bands[bi].elements.length };
  }
  if (needsFollow(template, bi, elType)) {
    const r = ensureFollowBand(template, bi);
    return { template: r.template, band: r.index, elIndex: r.template.bands[r.index].elements.length };
  }
  return { template, band: bi, elIndex: target.elements.length };
}

/** ผลลัพธ์ของการย้าย element ไป band อื่น (เหมือนที่ reducer ทำ) — ใช้ให้ UI เลือก element/band ใหม่ได้ทันที */
export function planMove(template, fromBand, fromEl, toBand) {
  const el = template.bands[fromBand]?.elements[fromEl];
  if (!el) return { error: "ไม่พบ element" };
  const removed = mapBand(template, fromBand, (b) => ({ ...b, elements: b.elements.filter((_, i) => i !== fromEl) }));
  return planPlacement(removed, toBand, el.type);
}

/** จัดเทมเพลตที่โหลดเข้ามาให้ถูกกติกา: เรียง band ตามลำดับมาตรฐาน และย้าย element ค้างออกจาก band รายการที่มีตาราง */
export function normalizeTemplate(template) {
  const sorted = { ...template, bands: [...template.bands].sort((a, b) => bandRank(a.type) - bandRank(b.type)) };
  let t = sorted;
  for (let bi = 0; bi < t.bands.length; bi++) {
    if (isTableList(t.bands[bi])) {
      t = evictStrays(t, bi);
      t = ensureFollowBand(t, bi).template;
    }
  }
  return t;
}

const overlaps = (a, b) =>
  a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;

/**
 * ตำแหน่งว่างใน band สำหรับ element ขนาด w×h: ลองที่ (0,0) และที่ขอบล่าง/ขวาของ element เดิม
 * ถ้าไม่มีที่ว่าง → วางต่อท้ายด้านล่างสุด (growTo = ความสูง band ที่ต้องขยาย)
 */
export function findFreeSpot(band, w, h, cw) {
  const els = band.elements.map((e) => ({ x: e.x ?? 0, y: e.y ?? 0, w: e.w ?? 0, h: e.h ?? 0 }));
  const box = (x, y) => ({ x, y, w, h });
  const ys = [0, ...els.map((e) => e.y + e.h)].sort((p, q) => p - q);
  const xs = [0, ...els.map((e) => e.x + e.w)].sort((p, q) => p - q);
  for (const y of ys) {
    for (const x of xs) {
      if (x + w > cw + 0.01) continue;
      const b = box(x, y);
      if (y + h > band.height + 0.01 && els.length) continue;
      if (!els.some((e) => overlaps(b, e))) return { x, y };
    }
  }
  const bottom = Math.max(0, ...els.map((e) => e.y + e.h));
  return { x: 0, y: bottom, growTo: bottom + h };
}

/**
 * แผนการเปลี่ยนลำดับซ้อน (z-order) — คืน order = index เดิมเรียงใหม่ และ indexes = ตำแหน่งใหม่ของรายการที่เลือก
 * mode: "front" (ไปบนสุด) · "back" (ไปล่างสุด) · "forward" (ขึ้นหนึ่งชั้น) · "backward" (ลงหนึ่งชั้น)
 * รายการที่เลือกหลายตัวคงลำดับสัมพัทธ์ของกันและกัน
 */
export function zOrderPlan(n, selected, mode) {
  const sel = new Set(selected.filter((i) => i >= 0 && i < n));
  const arr = Array.from({ length: n }, (_, i) => i);
  if (!sel.size) return { order: arr, indexes: [] };
  if (mode === "front") arr.sort((a, b) => Number(sel.has(a)) - Number(sel.has(b)) || a - b);
  else if (mode === "back") arr.sort((a, b) => Number(sel.has(b)) - Number(sel.has(a)) || a - b);
  else if (mode === "forward") {
    for (let i = n - 2; i >= 0; i--) if (sel.has(arr[i]) && !sel.has(arr[i + 1])) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
  } else if (mode === "backward") {
    for (let i = 1; i < n; i++) if (sel.has(arr[i]) && !sel.has(arr[i - 1])) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
  }
  const indexes = arr.map((v, p) => (sel.has(v) ? p : -1)).filter((p) => p >= 0);
  return { order: arr, indexes };
}

export function historyReducer(state, a) {
  switch (a.type) {
    case "load":
      return {
        template: normalizeTemplate(a.template),
        data: a.data,
        past: [...state.past, { template: state.template, data: state.data }].slice(-HISTORY_LIMIT),
        future: [],
        lastKey: null,
      };
    case "snapshot":
      // จุดเริ่มของการลาก — เรียกเฉพาะตอนขยับจริงครั้งแรก เพื่อไม่ให้คลิกเฉยๆ สร้างขั้น undo ว่าง
      return {
        ...state,
        past: [...state.past, { template: state.template, data: state.data }].slice(-HISTORY_LIMIT),
        future: [],
        lastKey: null,
      };
    case "undo": {
      if (!state.past.length) return state;
      const prev = state.past[state.past.length - 1];
      return {
        ...state,
        template: prev.template,
        data: prev.data,
        past: state.past.slice(0, -1),
        future: [{ template: state.template, data: state.data }, ...state.future],
        lastKey: null,
      };
    }
    case "redo": {
      if (!state.future.length) return state;
      const next = state.future[0];
      return {
        ...state,
        template: next.template,
        data: next.data,
        past: [...state.past, { template: state.template, data: state.data }],
        future: state.future.slice(1),
        lastKey: null,
      };
    }
    case "setData":
      return commit(state, state.template, a.data, a.record ?? false, a.key);
    case "patchEl": {
      const band = state.template.bands[a.band];
      if (!band?.elements[a.el]) return state;
      const t = mapEl(state.template, a.band, a.el, (e) => ({ ...e, ...a.patch }));
      return commit(state, t, state.data, a.record ?? true, a.key);
    }
    case "setPos": {
      // ตำแหน่ง band-local (mm) → clamp ให้อยู่ในพื้นที่ band; การ snap ทำที่ component
      const band = state.template.bands[a.band];
      const el = band?.elements[a.el];
      if (!el) return state;
      const pos = clampEl({ ...el, x: a.x, y: a.y }, band, contentWidthMm(state.template));
      const t = mapEl(state.template, a.band, a.el, (e) => ({ ...e, ...pos }));
      return commit(state, t, state.data, a.record ?? false);
    }
    case "setPage": {
      // เปลี่ยนหน้ากระดาษ แล้วดึง element ที่หลุดขอบใหม่ให้กลับเข้าพื้นที่เนื้อหา
      const page = { ...state.template.page, ...a.patch };
      const t0 = { ...state.template, page };
      const cw = contentWidthMm(t0);
      const bands = t0.bands.map((b) => ({
        ...b,
        elements: b.elements.map((e) => {
          const w = Math.min(e.w ?? 0, cw);
          const x = Math.min(Math.max(0, e.x ?? 0), Math.max(0, cw - w));
          if (e.type === "table" && e.columns?.length && w !== e.w) {
            // ตาราง: ย่อ/ขยายความกว้างคอลัมน์ตามสัดส่วน ให้รวมเท่ากับความกว้างตารางเสมอ
            const sum = e.columns.reduce((a, c) => a + (c.width || 0), 0) || 1;
            const k = w / sum;
            const columns = e.columns.map((c) => ({ ...c, width: Math.round(c.width * k * 10) / 10 }));
            return { ...e, w, x, columns: fixColumnSum(columns, w) };
          }
          return { ...e, w, x };
        }),
      }));
      return commit(state, { ...t0, bands }, state.data, true, a.key);
    }
    case "addEl": {
      // หาตำแหน่งว่างให้ element ใหม่ (ไม่ทับ element เดิม) — ถ้าไม่มีที่ว่างจะวางต่อท้ายและขยาย band
      const plan = planPlacement(state.template, a.band, a.element.type);
      if (plan.error) return state;
      const band = plan.template.bands[plan.band];
      const cw = contentWidthMm(plan.template);
      const w = Math.min(a.element.w ?? 0, cw);
      const spot = findFreeSpot(band, w, a.element.h ?? 0, cw);
      const [named] = withFrameNames(state.template, [a.element]); // กรอบใหม่ได้ชื่อ "กรอบ N"
      const el = { ...named, w, x: spot.x, y: spot.y };
      const t = mapBand(plan.template, plan.band, (b) => ({
        ...b,
        height: Math.max(b.height, spot.growTo ?? 0),
        elements: [...b.elements, el],
      }));
      return commit(state, t, state.data, true);
    }
    case "addElAt": {
      const plan = planPlacement(state.template, a.band, a.element.type);
      if (plan.error) return state;
      const cw = contentWidthMm(plan.template);
      const band = plan.template.bands[plan.band];
      // ถ้าถูกส่งไป band อื่น (ใต้ตาราง) ใช้ตำแหน่งว่างแทนตำแหน่งที่ลาก
      const pos =
        plan.band === a.band
          ? clampEl({ ...a.element, x: a.x ?? 0, y: a.y ?? 0 }, band, cw)
          : (() => {
              const w = Math.min(a.element.w ?? 0, cw);
              const spot = findFreeSpot(band, w, a.element.h ?? 0, cw);
              return { x: spot.x, y: spot.y, w, growTo: spot.growTo };
            })();
      const [named] = withFrameNames(state.template, [a.element]);
      const el = { ...named, x: pos.x, y: pos.y, ...(pos.w != null ? { w: pos.w } : {}) };
      const t = mapBand(plan.template, plan.band, (b) => ({
        ...b,
        height: Math.max(b.height, pos.growTo ?? 0),
        elements: [...b.elements, el],
      }));
      return commit(state, t, state.data, true);
    }
    case "transferEl": {
      const fromBand = state.template.bands[a.fromBand];
      const el = fromBand?.elements[a.fromEl];
      if (!el || !state.template.bands[a.toBand]) return state;
      const cw = contentWidthMm(state.template);
      if (a.fromBand === a.toBand && !needsFollow(state.template, a.toBand, el.type)) {
        // ขยับใน band เดิม
        const pos = clampEl({ ...el, x: a.x, y: a.y }, state.template.bands[a.toBand], cw);
        const t = mapEl(state.template, a.fromBand, a.fromEl, (e) => ({ ...e, ...pos }));
        return commit(state, t, state.data, a.record ?? false, a.key);
      }
      // ย้ายข้าม band หรือย้ายไป band ใต้ตาราง: เอาออกก่อน แล้ววางตามกติกา
      const removed = mapBand(state.template, a.fromBand, (b) => ({
        ...b,
        elements: b.elements.filter((_, i) => i !== a.fromEl),
      }));
      const plan = planPlacement(removed, a.toBand, el.type);
      if (plan.error) return state;
      const band = plan.template.bands[plan.band];
      const redirected = plan.band !== a.toBand;
      const pos = redirected
        ? (() => {
            const w = Math.min(el.w ?? 0, cw);
            const spot = findFreeSpot(band, w, el.h ?? 0, cw);
            return { x: spot.x, y: spot.y, w, growTo: spot.growTo };
          })()
        : clampEl({ ...el, x: a.x, y: a.y }, band, cw);
      const t = mapBand(plan.template, plan.band, (b) => ({
        ...b,
        height: Math.max(b.height, pos.growTo ?? 0),
        elements: [...b.elements, { ...el, x: pos.x, y: pos.y, ...(pos.w != null ? { w: pos.w } : {}) }],
      }));
      return commit(state, t, state.data, a.record ?? false, a.key);
    }
    case "patchEls": {
      // แก้หลาย element ใน band เดียวพร้อมกัน (จัดวาง/ย้ายกลุ่ม) — changes = [{ei, patch}]
      const band = state.template.bands[a.band];
      if (!band || !a.changes?.length) return state;
      const cw = contentWidthMm(state.template);
      const byIdx = new Map(a.changes.map((c) => [c.ei, c.patch]));
      const els = band.elements.map((e, i) => {
        const p = byIdx.get(i);
        if (!p) return e;
        const next = { ...e, ...p };
        // ตำแหน่ง/ขนาดต้องอยู่ในพื้นที่ band เสมอ
        const w = Math.min(next.w ?? 0, cw);
        const pos = clampEl({ ...next, w }, band, cw);
        return { ...next, w, x: pos.x, y: pos.y };
      });
      const t = mapBand(state.template, a.band, (b) => ({ ...b, elements: els }));
      return commit(state, t, state.data, a.record ?? true, a.key);
    }
    case "addEls": {
      // วาง element ที่คัดลอกไว้ (เลื่อนจากต้นฉบับเล็กน้อย) ต่อท้าย band
      const band = state.template.bands[a.band];
      if (!band || !a.elements?.length) return state;
      const cw = contentWidthMm(state.template);
      const added = withFrameNames(state.template, a.elements).map((e) => {
        const pos = clampEl({ ...e, x: (e.x ?? 0) + (a.offset ?? 0), y: (e.y ?? 0) + (a.offset ?? 0) }, band, cw);
        return { ...e, ...pos, ...(a.keepGroup ? {} : { group: undefined, group_name: undefined }) };
      });
      const t = mapBand(state.template, a.band, (b) => ({ ...b, elements: [...b.elements, ...added] }));
      return commit(state, t, state.data, true);
    }
    case "reorderEls": {
      // เปลี่ยนลำดับซ้อน (z-order) ของ element ใน band เดียว — index สูงอยู่บนสุด
      const band = state.template.bands[a.band];
      if (!band) return state;
      const { order } = zOrderPlan(band.elements.length, a.indexes ?? [], a.mode);
      if (order.every((v, i) => v === i)) return state;
      const t = mapBand(state.template, a.band, (b) => ({ ...b, elements: order.map((i) => b.elements[i]) }));
      return commit(state, t, state.data, true);
    }
    case "setOrder": {
      // จัดลำดับซ้อนตาม order (ตำแหน่งใหม่ → index เดิม) — ใช้หลังวางกรอบครอบของเดิม
      const band = state.template.bands[a.band];
      const n = band?.elements.length ?? 0;
      if (!band || a.order?.length !== n || new Set(a.order).size !== n) return state;
      const t = mapBand(state.template, a.band, (b) => ({ ...b, elements: a.order.map((i) => b.elements[i]) }));
      return commit(state, t, state.data, a.record ?? false);
    }
    case "removeEls": {
      const drop = new Set(a.indexes ?? []);
      if (!drop.size) return state;
      const t = mapBand(state.template, a.band, (b) => ({ ...b, elements: b.elements.filter((_, i) => !drop.has(i)) }));
      return commit(state, t, state.data, true);
    }
    case "removeEl": {
      const t = mapBand(state.template, a.band, (b) => ({
        ...b,
        elements: b.elements.filter((_, i) => i !== a.el),
      }));
      return commit(state, t, state.data, true);
    }
    case "addBand": {
      // แทรก band ตามลำดับมาตรฐาน; ชนิดที่มีอยู่แล้วไม่เพิ่มซ้ำ
      if (state.template.bands.some((b) => b.type === a.bandType)) return state;
      const band = {
        type: a.bandType,
        height: BAND_DEFAULT_HEIGHT[a.bandType] ?? 10,
        elements: [],
        ...(a.bandType === "detail" ? { dataSource: "items" } : {}),
      };
      const bands = [...state.template.bands, band].sort((x, y) => bandRank(x.type) - bandRank(y.type));
      return commit(state, { ...state.template, bands }, state.data, true);
    }
    case "removeBand": {
      const bands = state.template.bands.filter((_, i) => i !== a.band);
      return commit(state, { ...state.template, bands }, state.data, true);
    }
    case "patchTemplate": {
      return commit(state, { ...state.template, ...a.patch }, state.data, a.record ?? true, a.key);
    }
    case "patchBand": {
      const t = mapBand(state.template, a.band, (b) => ({ ...b, ...a.patch }));
      return commit(state, t, state.data, a.record ?? true, a.key);
    }
    case "replaceTemplate": {
      // แทนที่ทั้ง template (เช่น จับคู่ฟิลด์) — บันทึกเป็นขั้น undo เดียว
      return commit(state, a.template, state.data, true, a.key);
    }
    default:
      return state;
  }
}

export function initialHistory(template, data) {
  return { template: normalizeTemplate(template), data, past: [], future: [], lastKey: null };
}
