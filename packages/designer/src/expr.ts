/**
 * นิพจน์ที่เป็นการเรียกฟังก์ชันใน {{ … }} — ไวยากรณ์เดียวกับ engine (tr-core/src/expr.rs)
 * expr := call | literal | path · call := ชื่อ "(" [expr ("," expr)*] ")"
 * literal = ตัวเลข หรือข้อความในเครื่องหมายคำพูด · path = ฟิลด์ เช่น item.amount
 */

/** ฟังก์ชันจัดรูปแบบที่ engine รู้จัก (ใช้ได้ทุก band) */
export const FORMAT_FNS = ["number", "bahttext", "thaidigits", "thaidate"];
/** ฟังก์ชันรวมค่า (ใช้ได้เฉพาะ band หัวกลุ่ม ท้ายกลุ่ม และสรุป) */
export const AGG_FNS = ["sum", "count", "avg", "min", "max"];

/**
 * @typedef {{ kind: "call", name: string, args: Expr[] } | { kind: "num", value: string } | { kind: "str", value: string } | { kind: "path", value: string }} Expr
 * @returns {Expr | null} null เมื่อรูปแบบผิด
 */
export function parseExpr(src) {
  let i = 0;
  const s = src;
  const ws = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };
  const expr = () => {
    ws();
    if (i >= s.length) return null;
    const q = s[i];
    if (q === '"' || q === "'") {
      const end = s.indexOf(q, i + 1);
      if (end < 0) return null;
      const value = s.slice(i + 1, end);
      i = end + 1;
      return { kind: "str", value };
    }
    const start = i;
    while (i < s.length && !"(),\"'".includes(s[i])) i++;
    const word = s.slice(start, i).trim();
    if (!word) return null;
    if (s[i] === "(") {
      if (!/^[A-Za-z0-9_]+$/.test(word)) return null;
      i++;
      const args = [];
      ws();
      if (s[i] === ")") {
        i++;
        return { kind: "call", name: word, args };
      }
      for (;;) {
        const a = expr();
        if (!a) return null;
        args.push(a);
        ws();
        if (s[i] === ",") i++;
        else if (s[i] === ")") {
          i++;
          return { kind: "call", name: word, args };
        } else return null;
      }
    }
    if (!/\s/.test(word) && word !== "" && !Number.isNaN(Number(word))) return { kind: "num", value: word };
    return { kind: "path", value: word };
  };
  const e = expr();
  ws();
  return e && i === s.length ? e : null;
}

/** เขียนกลับเป็นข้อความนิพจน์ (รูปแบบเดียวกับ engine) */
export function toSource(e) {
  if (e.kind === "call") return `${e.name}(${e.args.map(toSource).join(", ")})`;
  if (e.kind === "str") return e.value.includes('"') ? `'${e.value}'` : `"${e.value}"`;
  return e.value;
}

/** แทน path ตาม mapping (Map: path เดิม → path ใหม่) — คืน null ถ้าไม่มีอะไรเปลี่ยน */
export function mapPaths(e, mapping) {
  if (e.kind === "path") {
    const next = mapping.get(e.value);
    return next ? { kind: "path", value: next } : null;
  }
  if (e.kind !== "call") return null;
  let changed = false;
  const args = e.args.map((a) => {
    const n = mapPaths(a, mapping);
    if (n) changed = true;
    return n ?? a;
  });
  return changed ? { ...e, args } : null;
}

const isGroupPath = (p) => p === "group.value" || p === "group.count";

/** ทุก path ในนิพจน์ (ไม่นับอาร์กิวเมนต์ของฟังก์ชันรวมค่า และ group.* ซึ่ง engine แทนค่าให้เอง) */
export function exprPaths(e) {
  if (!e) return [];
  if (e.kind === "path") return isGroupPath(e.value) ? [] : [e.value];
  if (e.kind === "call" && !AGG_FNS.includes(e.name)) return e.args.flatMap(exprPaths);
  return [];
}

/** มีการรวมค่า หรือ group.value / group.count อยู่ในนิพจน์หรือไม่ */
export function usesAggregate(e) {
  if (!e) return false;
  if (e.kind === "path") return isGroupPath(e.value);
  if (e.kind === "call") return AGG_FNS.includes(e.name) || e.args.some(usesAggregate);
  return false;
}

/** ชื่อฟังก์ชันที่ engine ไม่รู้จักในนิพจน์ (ว่าง = ใช้ได้ทั้งหมด) */
export function unknownFns(e) {
  if (!e || e.kind !== "call") return [];
  const self = FORMAT_FNS.includes(e.name) || AGG_FNS.includes(e.name) ? [] : [e.name];
  return [...self, ...e.args.flatMap(unknownFns)];
}
