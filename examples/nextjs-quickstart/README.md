# ThaiReport + Next.js quickstart

ใบเสนอราคาที่แก้ข้อมูลได้ แล้ว PDF ภาษาไทยสร้างใหม่ทันทีในหน้าเว็บ (WASM ใน browser) พร้อมปุ่มดาวน์โหลด
และ Route Handler ที่สร้าง PDF ฉบับเดียวกันบนเซิร์ฟเวอร์

## เริ่มใช้งาน

ระหว่างที่ `@thaireport/*` ยังไม่ขึ้น npm ต้องแพ็กจาก repo นี้ก่อน (ต้องมี Rust + [wasm-pack](https://rustwasm.github.io/wasm-pack/) ครั้งแรกครั้งเดียว):

```bash
./scripts/build-wasm.sh                 # ที่ราก repo — สร้าง WASM
cd examples/nextjs-quickstart
npm run pack:local                      # แพ็ก @thaireport/client, react, node ไว้ใน vendor/
npm install
npm run dev                             # http://localhost:3000
```

เมื่อแพ็กเกจขึ้น npm แล้ว แค่ `npm install @thaireport/react` ไม่ต้องมี Rust

### สร้าง PDF บนเซิร์ฟเวอร์ (ไม่บังคับ)

`app/api/quotation/route.ts` ใช้ `@thaireport/node` (engine native) — build addon ก่อน แล้วรัน `npm run pack:local && npm install` ใหม่:

```bash
cd packages/node && npm run build       # ที่ราก repo
```

```bash
curl http://localhost:3000/api/quotation -o quotation.pdf          # ฉบับตัวอย่าง
curl -X POST http://localhost:3000/api/quotation -H 'content-type: application/json' \
  -d '{"customerName":"บริษัท ก","customerAddress":"-","docNo":"QT-1","date":"2026-10-17","items":[{"name":"ค่าบริการ","qty":1,"price":1500}]}' \
  -o quotation.pdf
```

ถ้ายังไม่ได้ build addon หน้าเว็บใช้ได้ปกติ ส่วน `/api/quotation` ตอบ 501 พร้อมวิธีแก้

## โครง

| ไฟล์ | |
|---|---|
| `reports/quotation.json` | template (ออกแบบใน designer หรือให้ AI สร้างผ่าน MCP) — ใช้ `number()`, `bahttext()`, `thaidate()` จัดรูปแบบ |
| `reports/quotation.ts` | แปลงฟอร์มเป็นข้อมูลรายงาน: แอปคำนวณยอด/VAT เป็นตัวเลข template จัดรูปแบบ |
| `app/QuotationDemo.tsx` | ฟอร์ม + `<ReportViewer>` + `<DownloadPdfButton>` + `useThaiReport` |
| `app/api/quotation/route.ts` | Route Handler สร้าง PDF ด้วย `@thaireport/node` |
