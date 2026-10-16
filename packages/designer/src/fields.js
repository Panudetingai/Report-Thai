/**
 * การจับคู่ฟิลด์กับข้อมูลจริง (ไม่มี DB ในฝั่ง designer — รับข้อมูลเป็น JSON/CSV ที่ระบบของผู้ใช้ส่งมา)
 * - buildCatalog: อ่านโครงสร้างข้อมูลเป็นรายการฟิลด์ (ชนิด + ตัวอย่างค่า) ให้เลือกใช้ได้
 * - analyzeTemplate: ตรวจทุก {{ }} ใน template ว่าผูกกับข้อมูลได้หรือไม่
 * - suggestFields: เสนอฟิลด์ที่ชื่อใกล้เคียงสำหรับฟิลด์ที่หาไม่พบ
 * - remapTemplate: เปลี่ยน {{ เดิม }} → {{ ใหม่ }} ทั้ง template
 */
import { EXPR_SOURCE, bindSegments, detailSourceOf, resolveExpr, rowsOf, scanExprs, tableSourceOf, valueText } from "./bind.js";
import { isDataImageSrc, needsEmbedForPreview } from "./image-embed.js";

const SAMPLE_ROWS = 200;
const AUTO_MIN_SCORE = 60;

function leafType(v) {
  if (v === null || v === undefined) return "ว่าง";
  if (typeof v === "number") return "ตัวเลข";
  if (typeof v === "boolean") return "จริง/เท็จ";
  if (Array.isArray(v)) return "รายการ";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return "วันที่";
  return "ข้อความ";
}

const isPlainObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const isRecordList = (v) => Array.isArray(v) && v.some(isPlainObject);

/** รวมฟิลด์ปลายทางของแถวหนึ่งเข้า map (path → {path,type,sample}) — ตัวอย่างค่าเอาจากแถวแรกที่มีค่า */
function collectLeaves(obj, prefix, into) {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) collectLeaves(v, p, into);
    else if (isRecordList(v)) continue; // รายการแถวย่อยจัดการเป็น source แยก
    else {
      const cur = into.get(p);
      if (!cur || (cur.sample === "" && v != null)) into.set(p, { path: p, type: leafType(v), sample: valueText(v) });
    }
  }
}

/**
 * แคตตาล็อกฟิลด์จากข้อมูล
 * @returns {{ scalars: Array<{path,type,sample}>, sources: Array<{name,count,fields}> }}
 *   scalars: ค่าเดี่ยว (ใช้ {{ path }}) · sources: รายการแถว (วนใน band/ตาราง, ใช้ {{ item.field }})
 */
export function buildCatalog(data) {
  const scalars = new Map();
  const sources = [];
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (isRecordList(v)) {
        const rows = v.slice(0, SAMPLE_ROWS).filter(isPlainObject);
        const leaves = new Map();
        for (const r of rows) collectLeaves(r, "", leaves);
        sources.push({ name: p, count: v.length, fields: [...leaves.values()] });
      } else if (isPlainObject(v)) {
        walk(v, p);
      } else if (!scalars.has(p)) {
        scalars.set(p, { path: p, type: leafType(v), sample: valueText(v) });
      }
    }
  };
  walk(data, "");
  return { scalars: [...scalars.values()], sources };
}

/**
 * ตำแหน่งทั้งหมดที่ใช้ {{ }} ใน template พร้อมบอกว่าอยู่ในแถว (row) ของ data source ใด
 * prop: "text" (ข้อความ) · "field" (คอลัมน์ตาราง) · "checked" (ช่องติ๊ก) · "src" (รูปภาพ)
 */
export function collectUses(template) {
  const uses = [];
  template.bands.forEach((band, bi) => {
    const detailRow = band.type === "detail" ? detailSourceOf(band) : null;
    band.elements.forEach((el, ei) => {
      const base = { band: bi, bandType: band.type, el: ei, elType: el.type };
      if (el.type === "table") {
        const source = tableSourceOf(el, band);
        (el.columns ?? []).forEach((col, ci) => {
          for (const expr of scanExprs(col.field)) uses.push({ ...base, prop: "field", col: ci, expr, source });
        });
        return;
      }
      const source = detailRow;
      for (const expr of scanExprs(el.text)) uses.push({ ...base, prop: "text", expr, source });
      for (const expr of scanExprs(el.checked)) uses.push({ ...base, prop: "checked", expr, source });
      for (const expr of scanExprs(el.src)) uses.push({ ...base, prop: "src", expr, source });
    });
  });
  return uses;
}

/**
 * ตรวจการผูกข้อมูลทั้ง template
 * @returns {{ uses, problems: Array<{expr, source, reason, count, places}> }}
 *   reason: "missing" (ไม่พบในข้อมูล) · "unsupported" (engine ยังไม่รองรับฟังก์ชัน/ตัวกรอง) · "norows" (ยังตรวจไม่ได้เพราะไม่มีแถวข้อมูล)
 */
export function analyzeTemplate(template, data) {
  const uses = collectUses(template);
  const map = new Map();
  for (const u of uses) {
    const key = `${u.source ?? ""}|${u.expr}`;
    const p = map.get(key);
    if (p) {
      p.count += 1;
      p.places.push(u);
      continue;
    }
    const reason = checkUse(u, data);
    if (reason) map.set(key, { expr: u.expr, source: u.source, reason, count: 1, places: [u] });
    else map.set(key, null);
  }
  const problems = [...map.values()].filter(Boolean);
  template.bands.forEach((band, bi) => {
    band.elements.forEach((el, ei) => {
      if (el.type !== "image" || !el.src) return;
      if (scanExprs(el.src).length) return;
      if (isDataImageSrc(el.src) || !needsEmbedForPreview(el.src)) return;
      problems.push({
        expr: el.src.length > 48 ? `${el.src.slice(0, 45)}…` : el.src,
        source: null,
        reason: "embed",
        count: 1,
        places: [{ band: bi, bandType: band.type, el: ei, elType: "image", prop: "src", expr: el.src, source: null }],
      });
    });
  });
  return { uses, problems };
}

/** เหตุผลที่ผูกไม่ได้ของ use หนึ่งจุด หรือ null ถ้าผูกได้ */
function checkUse(u, data) {
  if (u.expr.includes("(") || u.expr.includes("|")) return "unsupported";
  if (u.source == null) {
    return resolveExpr(u.expr, data).ok ? null : "missing";
  }
  const rows = rowsOf(data, u.source);
  if (rows.length === 0) return "norows";
  // ตรงกับ engine: ลองอ่านในแถวก่อน แล้วค่อย data ทั้งก้อน (ตรวจด้วยแถวใดแถวหนึ่งที่มีค่า)
  const inRow = rows.some((r) => resolveExpr(u.expr, data, { row: r }).ok);
  return inRow ? null : "missing";
}

/**
 * ฟิลด์ที่เสนอแทนฟิลด์ที่หาไม่พบ — เรียงตามคะแนนความคล้ายของชื่อ
 * @returns {Array<{path, sample, type, score}>}
 */
export function suggestFields(problem, catalog) {
  const isRow = problem.source != null;
  const wanted = problem.expr.startsWith("item.") ? problem.expr.slice(5) : problem.expr;
  const pool = isRow
    ? (catalog.sources.find((s) => s.name === problem.source)?.fields ?? [])
    : catalog.scalars;
  const target = norm(lastSeg(wanted));
  const wantedParent = parentOf(wanted);
  return pool
    .map((f) => {
      // ฟิลด์ค่าเดี่ยวที่อยู่ใต้ object เดียวกัน (company.name ↔ company.tax_id) น่าเชื่อกว่าชื่อเดียวกันคนละกลุ่ม
      const sameParent = isRow || parentOf(f.path) === wantedParent;
      const base = similarity(target, norm(lastSeg(f.path)), norm(wanted), norm(f.path));
      return { ...f, sameParent, score: base > 0 && sameParent ? base + 10 : base };
    })
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 5);
}

/** คำแนะนำนี้ใช้จับคู่อัตโนมัติได้หรือไม่ — ค่าเดี่ยวต้องอยู่กลุ่มเดียวกัน ไม่งั้นอาจเดาผิด (company.name ≠ customer.name) */
export function isSafeAuto(problem, suggestion) {
  return suggestion != null && suggestion.score >= AUTO_MIN_SCORE && (problem.source != null || suggestion.sameParent);
}

/** expression ใหม่ที่ควรใช้ จากฟิลด์ที่เลือก (ใช้ item. นำหน้าเมื่อเป็นแถว) */
export function exprFor(problem, path) {
  return problem.source != null ? `item.${path}` : path;
}

const lastSeg = (p) => p.slice(p.lastIndexOf(".") + 1);
const parentOf = (p) => (p.includes(".") ? p.slice(0, p.lastIndexOf(".")) : "");
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9฀-๿]/g, "");

function similarity(target, leaf, wantedFull, full) {
  if (!target) return 0;
  if (leaf === target) return 100;
  if (full === wantedFull) return 95;
  if (target.length >= 3 && leaf.length >= 3 && (leaf.includes(target) || target.includes(leaf))) return 60;
  // ตัวย่อ เช่น amt → amount, qty → quantity
  if (target.length >= 3 && leaf.length > target.length && isSubsequence(target, leaf)) return 50;
  const d = levenshtein(target, leaf);
  if (d <= 2 && Math.min(target.length, leaf.length) >= 4) return 40 - d * 5;
  return 0;
}

function isSubsequence(short, long) {
  let j = 0;
  for (const ch of long) if (ch === short[j]) j++;
  return j === short.length;
}

function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/**
 * เปลี่ยน expression ทั้ง template ตาม mapping (Map: expr เดิม → expr ใหม่)
 * คืน template ใหม่ (ไม่แก้ของเดิม) — ใช้กับ undo ได้
 */
export function remapTemplate(template, mapping) {
  if (!mapping.size) return template;
  const swap = (text) =>
    text == null
      ? text
      : text.replace(EXPR_SOURCE, (whole, expr) => {
          const next = mapping.get(expr.trim());
          return next ? `{{ ${next} }}` : whole;
        });
  const bands = template.bands.map((band) => ({
    ...band,
    elements: band.elements.map((el) => {
      if (el.type === "table") {
        return { ...el, columns: (el.columns ?? []).map((c) => ({ ...c, field: swap(c.field) })) };
      }
      return { ...el, text: swap(el.text), checked: swap(el.checked), src: el.src?.startsWith("data:") ? el.src : swap(el.src) };
    }),
  }));
  return { ...template, bands };
}

/** ตัวอย่างผลพรีวิวของ expression หนึ่งจุด (ไว้แสดงให้ผู้ใช้เห็นว่าจะได้ค่าอะไร) */
export function sampleOf(problem, data) {
  if (problem.source == null) return bindSegments(`{{ ${problem.expr} }}`, data)[0]?.text ?? "";
  const row = rowsOf(data, problem.source)[0];
  return row ? (bindSegments(`{{ ${problem.expr} }}`, data, { row })[0]?.text ?? "") : "";
}
