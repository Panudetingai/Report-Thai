# ThaiReport (ชื่อชั่วคราว)

Report/document engine โอเพนซอร์สฟรี ทางเลือกแทน JasperReports — Thai-first

> สเปกหลัก: ดู `thai-report-spec.md`
> สถานะ: **Phase 1 เสร็จ** (Core engine + CLI; รายงาน `docs/phase-1-report.md`)
> License กลาง: MIT (`LICENSE-MIT`)

## โครงโปรเจกต์

```
crates/
  tr-core/    # template model, layout, data binding
  tr-text/    # shaping, ตัดคำไทย, ฟอนต์
  tr-pdf/     # layout → PDF (krilla), PDF/A
  tr-thai/    # ฟังก์ชันไทย (พ.ศ., บาทตัวอักษร, เลขไทย, tax id, PromptPay)
  tr-etax/    # [experimental] XML ETDA, PDF/A-3, signing
  tr-wasm/    # wasm-bindgen (designer preview)
  tr-server/  # axum HTTP API
  tr-cli/     # CLI: render template.json data.json -o out.pdf
  tr-mcp/     # MCP server
  tr-node/    # napi-rs
packages/
  designer/   # React designer (WASM preview)
  client/     # npm client สำหรับ Next.js
templates/    # template ตัวอย่างภาษาไทย
fonts/        # ฟอนต์ OFL เท่านั้น
tests/golden/ # golden test ภาษาไทย
examples/nextjs-quickstart/
docs/
```

## เริ่มใช้งาน (Phase 0)

```powershell
cargo build
cargo test -p tr-core -p tr-thai -p tr-text -p tr-pdf -p tr-cli -p tr-etax
# เรนเดอร์ตัวอย่าง (ต้องมีฟอนต์ใน fonts/ แล้ว)
cargo run -p tr-cli -- render templates/invoice-full.json templates/invoice-full.data.json -o out.pdf
```

ดูเกณฑ์ตรวจรับใน `thai-report-spec.md` หัวข้อ 7 (Phase 0) และบันทึกผลใน `docs/spike-report.md`

## กติกา (จาก spec ข้อ 0)

1. ทำตามลำดับเฟส Phase 0 → 6 ห้ามข้าม
2. `[VERIFY]` ต้องตรวจจากแหล่งทางการก่อนอ้างอิง บันทึกใน `docs/verification-log.md`
3. หมวด e-Tax ติดป้าย `experimental` ห้ามอ้างว่า "ถูกต้องตามกฎหมาย"
4. ใช้เฉพาะ dependency MIT/Apache-2.0/OFL บันทึกใน `docs/licenses.md`
5. เอกสารผู้ใช้ภาษาไทย โค้ด/API ภาษาอังกฤษ
