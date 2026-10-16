# @thaireport/node

สร้าง PDF ภาษาไทยจาก template JSON ด้วย engine Rust (ไม่ต้องมี server แยก)

## ติดตั้งและ build

```bash
cd packages/node
npm install
npm run build   # คอมไพล์ Rust แล้วคัดลอกไบนารีกับฟอนต์เข้าแพ็กเกจ
npm test
```

ต้องมี Rust (stable) ในเครื่อง การ build ครั้งแรกใช้เวลาหลายนาที

## ใช้งาน

```js
const { renderPdf, validateTemplate } = require("@thaireport/node");
const template = require("./templates/receipt.json");
const data = require("./templates/receipt.data.json");

// ตรวจก่อนเรนเดอร์ (ไม่ throw — คืน { ok, error })
const check = validateTemplate(template);
if (!check.ok) throw new Error(check.error);

const pdf = await renderPdf(template, data); // Buffer
require("node:fs").writeFileSync("receipt.pdf", pdf);
```

### ใน Next.js Route Handler

```js
// app/api/receipt/route.js
import { renderPdf } from "@thaireport/node";
import template from "@/templates/receipt.json";

export async function POST(request) {
  const data = await request.json();
  const pdf = await renderPdf(template, data);
  return new Response(pdf, { headers: { "Content-Type": "application/pdf" } });
}
```

> แพ็กเกจนี้เป็น native addon: ใช้ใน Server Component / Route Handler (Node.js runtime) ได้ ไม่ใช้ใน Edge runtime
> สำหรับเบราว์เซอร์ใช้ `@thaireport/client` (WASM) แทน

## ตัวเลือก

- `renderPdf(template, data, { fontsDir })` — `fontsDir` ค่าเริ่มต้นคือฟอนต์ที่มากับแพ็กเกจ (ต้องมี `Sarabun-Regular.ttf`)
- รูปในเทมเพลตต้องฝังเป็น data URI หรือฝังในเทมเพลต — แพ็กเกจไม่อ่านไฟล์รูปจากดิสก์
- เรนเดอร์หลายงานพร้อมกันได้ (รันบน thread pool ของ Node ไม่บล็อก event loop)

## รายงานจัดกลุ่มและยอดรวม

ใน template ตั้ง `groupBy` ที่ band หัวกลุ่ม แล้วใช้ `{{ sum(item.amount) }}` ใน band ท้ายกลุ่มหรือสรุป
ตัวอย่างพร้อมใช้: `templates/sales-by-category.json` (ข้อมูลต้องเรียงตามฟิลด์ที่จัดกลุ่มก่อน)
