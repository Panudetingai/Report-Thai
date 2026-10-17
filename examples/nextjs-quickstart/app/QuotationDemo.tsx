"use client";
import { useMemo, useState } from "react";
import { DownloadPdfButton, ReportViewer, useThaiReport } from "@thaireport/react";
import { quotationData, quotationTemplate, sampleForm, type QuotationForm } from "../reports/quotation";

export function QuotationDemo() {
  const [form, setForm] = useState<QuotationForm>(sampleForm);
  const data = useMemo(() => quotationData(form), [form]);
  // ใช้ hook ตรงๆ เพื่อแสดงจำนวนหน้า/สถานะ — ReportViewer ใช้ hook เดียวกันอยู่ข้างใน
  const { status, pages, error } = useThaiReport(quotationTemplate, data);

  const set = (patch: Partial<QuotationForm>) => setForm((f) => ({ ...f, ...patch }));
  const setItem = (i: number, patch: Partial<QuotationForm["items"][number]>) =>
    set({ items: form.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });

  return (
    <main>
      <section className="panel">
        <h1>ใบเสนอราคา</h1>
        <p className="lead">แก้ข้อมูลแล้ว PDF ด้านขวาสร้างใหม่ทันที — สร้างใน browser ด้วย WASM ไม่ผ่านเซิร์ฟเวอร์</p>

        <label>
          ลูกค้า
          <input value={form.customerName} onChange={(e) => set({ customerName: e.target.value })} />
        </label>
        <label>
          ที่อยู่
          <input value={form.customerAddress} onChange={(e) => set({ customerAddress: e.target.value })} />
        </label>
        <label>
          เลขที่เอกสาร
          <input value={form.docNo} onChange={(e) => set({ docNo: e.target.value })} />
        </label>
        <label>
          วันที่
          <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
        </label>

        <div style={{ fontSize: 13, marginBottom: 4 }}>รายการ (ชื่อ · จำนวน · ราคา)</div>
        {form.items.map((it, i) => (
          <div className="item" key={i}>
            <input aria-label={`รายการที่ ${i + 1}`} value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
            <input aria-label="จำนวน" type="number" min={0} value={it.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} />
            <input aria-label="ราคา" type="number" min={0} step="0.01" value={it.price} onChange={(e) => setItem(i, { price: Number(e.target.value) })} />
            <button aria-label="ลบรายการ" onClick={() => set({ items: form.items.filter((_, k) => k !== i) })}>×</button>
          </div>
        ))}
        <button onClick={() => set({ items: [...form.items, { name: "รายการใหม่", qty: 1, price: 1000 }] })}>+ เพิ่มรายการ</button>

        <p className="status" aria-live="polite">
          {status === "loading" ? "กำลังสร้าง PDF…" : status === "error" ? `ผิดพลาด: ${error}` : `พร้อม · ${pages} หน้า · ยอดสุทธิ ${data.total.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท`}
        </p>
        <div className="row">
          <DownloadPdfButton className="primary" template={quotationTemplate} data={data} fileName={`${form.docNo || "quotation"}.pdf`}>
            ดาวน์โหลด PDF
          </DownloadPdfButton>
          <form method="POST" action="/api/quotation" target="_blank">
            <input type="hidden" name="form" value={JSON.stringify(form)} />
            <button type="submit">สร้างบนเซิร์ฟเวอร์ (Route Handler)</button>
          </form>
        </div>
      </section>

      <ReportViewer className="viewer" template={quotationTemplate} data={data} height="calc(100vh - 40px)" />
    </main>
  );
}
