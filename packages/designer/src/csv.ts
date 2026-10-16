/**
 * อ่าน CSV (ส่งออกจากฐานข้อมูล/สเปรดชีต) เป็นแถวของ object
 * - บรรทัดแรกเป็นหัวคอลัมน์ (ชื่อฟิลด์) · รองรับ "" ในเครื่องหมายคำพูด, CRLF, BOM
 * - ค่าเก็บเป็นข้อความเสมอ (ไม่แปลงเลข) เพื่อไม่ให้รหัส เช่น "007" เปลี่ยนรูป
 */
export function parseCsv(text) {
  const src = String(text ?? "").replace(/^﻿/, "");
  const records = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      records.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (quoted) throw new Error("CSV: เครื่องหมายคำพูดไม่ปิด");
  if (field !== "" || row.length) {
    row.push(field);
    records.push(row);
  }
  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length < 1) throw new Error("CSV: ไม่มีข้อมูล");
  const [head, ...body] = nonEmpty;
  const names = head.map((h) => h.trim());
  if (names.some((n) => n === "")) throw new Error("CSV: หัวคอลัมน์บางช่องว่าง");
  if (new Set(names).size !== names.length) throw new Error("CSV: หัวคอลัมน์ซ้ำกัน");
  return body.map((cells) => Object.fromEntries(names.map((n, j) => [n, cells[j] ?? ""])));
}
