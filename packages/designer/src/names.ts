/**
 * ชื่อกรอบและกลุ่มแบบ Figma ("กรอบ 1", "กลุ่ม 2")
 * - กรอบ: element.name
 * - กลุ่ม: element.group_name บนสมาชิกทุกตัว (คัดลอก/วาง/ย้าย band แล้วชื่อติดไปด้วย)
 * engine ไม่รู้จักสองฟิลด์นี้และข้ามไป (serde ไม่ได้ตั้ง deny_unknown_fields) — ใช้เฉพาะในหน้าออกแบบ
 */

export const FRAME_PREFIX = "กรอบ";
export const GROUP_PREFIX = "กลุ่ม";

function allElements(template) {
  return (template?.bands ?? []).flatMap((b) => b.elements ?? []);
}

/** เลขถัดไปที่ยังไม่มีใครใช้ในทั้งเทมเพลต เช่นมี "กรอบ 1", "กรอบ 3" → "กรอบ 4" */
function nextNumbered(names, prefix) {
  const re = new RegExp(`^${prefix}\\s+(\\d+)$`);
  let max = 0;
  for (const n of names) {
    const m = re.exec(String(n ?? "").trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix} ${max + 1}`;
}

export function nextFrameName(template, extra = []) {
  const names = allElements(template).filter((e) => e.type === "rectangle").map((e) => e.name);
  return nextNumbered([...names, ...extra], FRAME_PREFIX);
}

export function nextGroupName(template) {
  return nextNumbered(allElements(template).map((e) => e.group_name), GROUP_PREFIX);
}

/** ตั้งชื่อให้กรอบใหม่ที่ยังไม่มีชื่อ (ไม่แตะ element ชนิดอื่น) */
export function withFrameNames(template, elements) {
  const taken = [];
  return elements.map((el) => {
    if (el.type !== "rectangle" || el.name) return el;
    const name = nextFrameName(template, taken);
    taken.push(name);
    return { ...el, name };
  });
}

export function frameLabel(el) {
  return String(el?.name ?? "").trim() || FRAME_PREFIX;
}

/** ชื่อกลุ่มจากสมาชิกตัวแรกที่มีชื่อ */
export function groupLabel(els, gid) {
  const named = els.find((e) => e.group === gid && String(e.group_name ?? "").trim());
  return named ? named.group_name.trim() : GROUP_PREFIX;
}

/** ชื่อที่ผู้ใช้พิมพ์ → ค่าที่เก็บ (ว่าง = ลบชื่อ) */
export function cleanName(name) {
  const t = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return t || undefined;
}
