/**
 * การผูกค่า {{ ... }} ในหน้าออกแบบ — ต้องให้ผลตรงกับ engine (tr-core::resolve_expr)
 * - {{ item.x }} ในแถวที่วนซ้ำ (detail / ตาราง) → อ่านจากแถว; คำนำหน้า item. เป็นกติกาตายตัวของ engine
 *   (ไม่ขึ้นกับชื่อ data source) — ถ้าไม่พบใน item. จะลองอ่านเป็น path ปกติในแถวด้วย
 * - {{ a.b[0].c }} → อ่านจาก data ตาม path (รองรับ [n])
 * - {{ page }} / {{ pages }}
 * - ฟังก์ชัน/ตัวกรอง (มี "(" หรือ "|") engine ยังไม่รองรับ → ถือว่าไม่ผูกข้อมูล
 * ค่าที่หาไม่พบ: engine แสดงเป็นช่องว่าง — หน้าออกแบบแสดงเป็นป้ายเตือนแทน เพื่อให้เห็นจุดที่ต้องแก้
 */

const EXPR = /\{\{\s*([^}]+?)\s*\}\}/g;
/** regex ของ {{ }} (flag g) สำหรับผู้ที่ต้องแทนที่/สแกนเอง */
export const EXPR_SOURCE = EXPR;

/** ดึงค่าตาม path แบบเดียวกับ engine: "a.b", "items[0].price" — คืน undefined ถ้าไม่พบ (null = พบแต่ว่าง) */
export function lookup(obj, path) {
  if (obj == null || !path) return undefined;
  let cur = obj;
  for (const part of path.split(".")) {
    const br = part.indexOf("[");
    if (br < 0) {
      cur = getKey(cur, part);
    } else {
      const key = part.slice(0, br);
      if (key) cur = getKey(cur, key);
      let rest = part.slice(br);
      while (rest.startsWith("[")) {
        if (cur === undefined) return undefined;
        const e = rest.indexOf("]");
        if (e < 0) return undefined;
        const idx = Number(rest.slice(1, e));
        if (!Number.isInteger(idx) || !Array.isArray(cur)) return undefined;
        cur = cur[idx];
        rest = rest.slice(e + 1);
      }
    }
    if (cur === undefined) return undefined;
  }
  return cur;
}

function getKey(obj, key) {
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return undefined;
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

/** แปลงค่าเป็นข้อความแบบเดียวกับ engine (null → ว่าง, object/array → JSON) */
export function valueText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * ผลของ expression เดียว
 * @returns {{ ok: true, value: string } | { ok: false, reason: "missing" | "unsupported" }}
 */
export function resolveExpr(expr, data, ctx = {}) {
  if (expr.includes("(") || expr.includes("|")) return { ok: false, reason: "unsupported" };
  if (expr === "page") return { ok: true, value: String(ctx.page ?? 1) };
  if (expr === "pages") return { ok: true, value: String(ctx.pages ?? 1) };
  const row = ctx.row;
  if (row != null) {
    if (expr.startsWith("item.")) {
      const v = lookup(row, expr.slice(5));
      if (v !== undefined) return { ok: true, value: valueText(v) };
    }
    const v = lookup(row, expr);
    if (v !== undefined) return { ok: true, value: valueText(v) };
  }
  const v = lookup(data, expr);
  if (v !== undefined) return { ok: true, value: valueText(v) };
  return { ok: false, reason: "missing" };
}

/**
 * แยกข้อความเป็นส่วนธรรมดา กับส่วนที่ผูกไม่ได้ (ไว้วาดป้ายเตือนบนกระดาษ)
 * @returns {Array<{ text: string } | { raw: string, reason: string }>}
 */
export function bindSegments(text, data, ctx = {}) {
  if (!text) return [];
  const out = [];
  let last = 0;
  for (const m of text.matchAll(EXPR)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const r = resolveExpr(m[1], data, ctx);
    if (r.ok) out.push({ text: r.value });
    else out.push({ raw: m[0], reason: r.reason });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** ข้อความผลพรีวิว — ส่วนที่ผูกไม่ได้คงตัวแปรเดิมไว้ */
export function bindPreview(text, data, ctx = {}) {
  if (!text) return "";
  return bindSegments(text, data, ctx)
    .map((s) => ("raw" in s ? s.raw : s.text))
    .join("");
}

/** รายการ expression ทั้งหมดในข้อความ (ตัดช่องว่างรอบ ๆ ออกแล้ว) */
export function scanExprs(text) {
  if (!text) return [];
  return [...text.matchAll(EXPR)].map((m) => m[1].trim());
}

/** แถวข้อมูลของ data source (array) หรือ [] ถ้าไม่มี */
export function rowsOf(data, dataSource) {
  const v = dataSource ? lookup(data, dataSource) : undefined;
  return Array.isArray(v) ? v : [];
}

/** data source ของตาราง — ตรงกับ engine: ระบุที่ตาราง → ที่ band → "items" */
export function tableSourceOf(el, band) {
  return el.data_source || band?.dataSource || "items";
}

/** data source ของ band รายการ (detail) — ตรงกับ engine: ระบุที่ band → "items" */
export function detailSourceOf(band) {
  return band?.dataSource || "items";
}
