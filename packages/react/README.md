# @thaireport/react

แสดงและดาวน์โหลดรายงาน PDF ภาษาไทยใน React — PDF สร้างใน browser ด้วย WASM (engine เดียวกับเซิร์ฟเวอร์ ได้ไฟล์ตรงกันทุกไบต์)
ไม่ต้องมีเซิร์ฟเวอร์ ฟอนต์ไทย (Sarabun, Noto Sans Thai) ฝังมาแล้ว

```bash
npm install @thaireport/react
```

## ใช้งาน

```tsx
"use client";
import { ReportViewer, DownloadPdfButton } from "@thaireport/react";
import invoice from "./reports/invoice.json"; // template ที่ออกแบบใน designer หรือให้ AI สร้างผ่าน MCP

export function InvoicePage({ order }) {
  return (
    <>
      <ReportViewer template={invoice} data={order} height={800} />
      <DownloadPdfButton template={invoice} data={order} fileName={`INV-${order.no}.pdf`}>
        ดาวน์โหลด
      </DownloadPdfButton>
    </>
  );
}
```

`data` เปลี่ยนเมื่อไหร่ PDF สร้างใหม่ให้เอง (หน่วง 200 ms ระหว่างพิมพ์) — ส่ง object ใหม่ทุก render ได้ เทียบจากเนื้อหา ไม่ใช่ตัวอ้างอิง

### สร้าง UI เอง

```tsx
const { status, url, pdf, pages, error, refresh } = useThaiReport(invoice, order);
// status: "idle" | "loading" | "ready" | "error" · url = blob URL ของ PDF ล่าสุด (คืนหน่วยความจำให้เอง)
```

ไม่มี React: `renderReport(template, data)` คืน `{ pdf: Uint8Array, pages }`

## API

| | |
|---|---|
| `<ReportViewer template data height? width? loading? renderError? enabled? debounceMs? />` | แสดง PDF ด้วยตัวแสดง PDF ของ browser |
| `<DownloadPdfButton template data fileName? busyLabel? onDone? onError? ...buttonProps />` | สร้าง PDF ตอนกดแล้วดาวน์โหลด |
| `useThaiReport(template, data, { enabled?, debounceMs? })` | สถานะ + ไบต์ + blob URL |
| `renderReport(template, data)` | สร้าง PDF ครั้งเดียว (throw เมื่อ template ผิด) |
| `preloadThaiReport()` | โหลด WASM ล่วงหน้า ให้ PDF แรกออกเร็วขึ้น |

## หมายเหตุ

- **Next.js App Router:** component ทุกตัวเป็น `"use client"` อยู่แล้ว ใช้ใน Server Component ได้เลย (render ฝั่งเซิร์ฟเวอร์จะแสดงสถานะกำลังสร้าง แล้วสร้าง PDF เมื่อถึง browser)
- ไฟล์ WASM ~5 MB (gzip ~2 MB) โหลดครั้งแรกที่ใช้ แล้ว browser cache ไว้ — Vite, webpack และ Turbopack คัดลอกไฟล์ให้เองไม่ต้องตั้งค่า
- ต้องการสร้าง PDF บนเซิร์ฟเวอร์ (เก็บไฟล์ ส่งอีเมล) ใช้ `@thaireport/node` หรือ HTTP API (`tr-server`) ด้วย template เดียวกัน
- รูปแบบ template: คู่มือ `crates/tr-mcp/src/guide.md` ใน repo
- browser บนมือถือบางตัว (เช่น iOS Safari) แสดง PDF ใน `<iframe>` ได้ไม่ครบทุกหน้า — บนมือถือให้ใช้ `DownloadPdfButton` หรือเปิด `url` ในแท็บใหม่
