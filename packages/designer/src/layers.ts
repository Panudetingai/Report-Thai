/**
 * ต้นไม้เลเยอร์แบบ Figma ของ band หนึ่ง:
 * - กรอบ (frame) เป็นพ่อของ element ที่อยู่ข้างในทั้งชิ้น (ดู frames.js)
 * - กลุ่ม (element ที่มี group เดียวกัน) เป็น node "กลุ่ม" ที่มีสมาชิกอยู่ข้างใต้
 * - เรียงจากบนสุด (z-order สูง) ลงล่าง เหมือนแผงเลเยอร์ของ Figma
 *
 * node = { kind: "frame" | "group" | "el", key, ei?, group?, children: node[], top }
 *   top = index สูงสุดในกิ่งนี้ (ใช้เรียงลำดับ)
 */
import { isFrame, parentFrameOf } from "./frames";

export { parentFrameOf };

export function buildLayerTree(els) {
  const n = els.length;
  // container ของแต่ละ element: "f:<index>" (ในกรอบ) · "g:<id>" (ในกลุ่ม) · "root"
  const frameOf = els.map((_, j) => parentFrameOf(els, j));
  const containerOf = frameOf.map((f) => (f >= 0 ? `f:${f}` : "root"));

  // กลุ่ม: วางไว้ใน container ที่สมาชิกทุกตัวอยู่ร่วมกัน (ไม่นับสมาชิกที่อยู่ในกรอบซึ่งเป็นสมาชิกกลุ่มเดียวกัน)
  const groups = new Map();
  els.forEach((el, j) => {
    if (!el.group) return;
    if (!groups.has(el.group)) groups.set(el.group, []);
    groups.get(el.group).push(j);
  });
  const groupHome = new Map();
  for (const [gid, members] of groups) {
    if (members.length < 2) continue;
    const memberSet = new Set(members);
    const heads = members.filter((j) => !(frameOf[j] >= 0 && memberSet.has(frameOf[j])));
    const homes = new Set(heads.map((j) => containerOf[j]));
    groupHome.set(gid, homes.size === 1 ? [...homes][0] : "root");
    for (const j of heads) containerOf[j] = `g:${gid}`;
  }

  const buckets = new Map();
  const push = (key, node) => {
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(node);
  };
  for (let j = 0; j < n; j++) push(containerOf[j], { kind: isFrame(els[j]) ? "frame" : "el", key: `e${j}`, ei: j });
  for (const [gid, home] of groupHome) push(home, { kind: "group", key: `g${gid}`, group: gid });

  const build = (key) => {
    const nodes = (buckets.get(key) ?? []).map((node) => {
      const childKey = node.kind === "frame" ? `f:${node.ei}` : node.kind === "group" ? `g:${node.group}` : null;
      const children = childKey ? build(childKey) : [];
      const top = Math.max(node.ei ?? -1, ...children.map((c) => c.top));
      return { ...node, children, top };
    });
    return nodes.sort((a, b) => b.top - a.top);
  };
  return build("root");
}

/** index ของ element ทั้งหมดในกิ่ง (รวมตัว node เอง) */
export function nodeIndexes(node) {
  const out = node.ei != null ? [node.ei] : [];
  for (const c of node.children) out.push(...nodeIndexes(c));
  return out.sort((a, b) => a - b);
}
