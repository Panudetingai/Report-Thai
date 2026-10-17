// ข้อมูลของใบเสนอราคา — ใช้ร่วมกันทั้งหน้าเว็บ (สร้าง PDF ใน browser) และ Route Handler (สร้างบนเซิร์ฟเวอร์)
// แอปคำนวณยอดเป็นตัวเลขเอง ส่วน template จัดรูปแบบให้: number() คั่นหลักพัน, bahttext() ยอดเป็นตัวอักษร, thaidate() วันที่ไทย
import template from "./quotation.json";

export const quotationTemplate = template as Record<string, unknown>;

export interface LineItem {
  name: string;
  qty: number;
  price: number;
}

export interface QuotationForm {
  customerName: string;
  customerAddress: string;
  docNo: string;
  /** YYYY-MM-DD */
  date: string;
  items: LineItem[];
}

export const sampleForm: QuotationForm = {
  customerName: "คุณสมชาย ใจดี",
  customerAddress: "789 ถนนพระรามสี่ กรุงเทพฯ 10500",
  docNo: "QT-2569-00456",
  date: "2026-10-17",
  items: [
    { name: "ออกแบบระบบรายงานภาษีไทยพร้อมติดตั้ง", qty: 1, price: 120000 },
    { name: "อบรมการใช้งาน (วัน)", qty: 2, price: 15000 },
    { name: "ดูแลรายปี (MA)", qty: 1, price: 24000 },
  ],
};

/** ปัดเป็นสตางค์ (ทศนิยม 2 ตำแหน่ง) */
const satang = (x: number) => Math.round(x * 100) / 100;

export function quotationData(f: QuotationForm) {
  const items = f.items
    .filter((it) => it.name.trim())
    .map((it, i) => ({ no: i + 1, name: it.name, qty: it.qty, price: it.price, amount: satang(it.qty * it.price) }));
  const subtotal = satang(items.reduce((s, it) => s + it.amount, 0));
  const vat = satang(subtotal * 0.07);
  return {
    company: { name: "บริษัท ตัวอย่าง จำกัด", address: "123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110", phone: "02-123-4567" },
    customer: { name: f.customerName, address: f.customerAddress },
    doc: { no: f.docNo, date: f.date },
    items,
    subtotal,
    vat,
    total: satang(subtotal + vat),
    valid_days: 30,
    payment: "เครดิต 30 วัน",
  };
}
