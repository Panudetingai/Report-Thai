/**
 * โครงสร้างเอกสาร (structure) = template ที่ไม่มีเนื้อหาเฉพาะงาน: หน้ากระดาษ + band + ตำแหน่ง/สไตล์ element
 * - มาตรฐาน: ไฟล์ใน ./structures และเทมเพลตตัวอย่าง (มาพร้อมแอป แก้ไม่ได้)
 * - ของฉัน: บันทึกไว้ในเบราว์เซอร์นี้ (localStorage) ตั้งชื่อเองได้ ส่งออก/นำเข้าเป็นไฟล์ได้
 */
import { SAMPLES } from "./samples.js";

const STD_FILES = import.meta.glob("./structures/*.json", { eager: true, import: "default" });

const STD_NAMES = {
  "standard-a4": { name: "เอกสารว่าง A4", desc: "หัวกระดาษ · ชื่อเอกสาร · ตารางรายการ · สรุปยอด · ท้ายกระดาษ" },
  "standard-a5-landscape": { name: "ใบเล็ก A5 แนวนอน", desc: "ชื่อเอกสาร · ตารางรายการ · ยอดรวม" },
  "report-table": { name: "รายงานตาราง", desc: "ตารางรายการข้ามหลายหน้า พร้อมหัวซ้ำและเลขหน้า" },
};

const SAMPLE_DESC = {
  "invoice-full": "ใบกำกับภาษีเต็มรูป (ตัวอย่างครบ)",
  quotation: "ใบเสนอราคา (ตัวอย่างครบ)",
  receipt: "ใบเสร็จรับเงิน (ตัวอย่างครบ)",
  "guest-registration": "บัตรทะเบียนผู้พัก (ฟอร์มพิมพ์)",
  "sales-by-category": "รายงานจัดกลุ่ม: หัวกลุ่ม รายการ ยอดรวมย่อย และยอดรวมทั้งสิ้น",
};

const STORAGE_KEY = "thaireport.structures.v1";

/** โครงสร้างมาตรฐานทั้งหมด (id ขึ้นต้นด้วย std:) */
export const STANDARD_STRUCTURES = [
  ...Object.entries(STD_FILES).map(([path, template]) => {
    const key = path.split("/").pop().replace(".json", "");
    const meta = STD_NAMES[key] ?? { name: key, desc: "" };
    return { id: `std:${key}`, name: meta.name, desc: meta.desc, group: "standard", template, data: null };
  }),
  ...SAMPLES.map((s) => ({
    id: `std:${s.id}`,
    name: s.label,
    desc: SAMPLE_DESC[s.id] ?? "",
    group: "standard",
    template: s.template,
    data: s.data,
  })),
];

/** โครงสร้างที่ผู้ใช้บันทึกไว้ (อ่านอย่างปลอดภัย: ข้อมูลเสียจะถูกข้าม) */
export function loadUserStructures() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(list) ? list.filter(isValidShape) : [];
  } catch {
    return [];
  }
}

export function saveUserStructures(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // เบราว์เซอร์ปิดการเก็บข้อมูล — ยังใช้งานได้ แต่ไม่ถูกเก็บ
  }
}

function isValidShape(s) {
  return s && typeof s.id === "string" && typeof s.name === "string" && s.template && Array.isArray(s.template.bands);
}

/** สร้างโครงสร้างใหม่จาก template ปัจจุบัน (ตัดข้อมูลตัวอย่างออก) */
export function makeUserStructure(name, template) {
  return {
    id: `user:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim(),
    desc: "บันทึกจากเอกสารที่ออกแบบ",
    group: "user",
    template: JSON.parse(JSON.stringify(template)),
    data: null,
    createdAt: new Date().toISOString(),
  };
}

/** ไฟล์โครงสร้างที่ส่งออก */
export function structureFileText(s) {
  return JSON.stringify({ thaireport_structure: 1, name: s.name, template: s.template }, null, 2);
}

/** อ่านไฟล์โครงสร้าง (รับได้ทั้งไฟล์ thaireport_structure และ template ดิบ) */
export function parseStructureFile(text, fallbackName) {
  const j = JSON.parse(text);
  const template = j.thaireport_structure ? j.template : j;
  if (!template || !Array.isArray(template.bands)) throw new Error("ไม่ใช่ไฟล์โครงสร้างหรือ template");
  const name = (j.name || fallbackName || "โครงสร้างนำเข้า").toString();
  return { name, template };
}
