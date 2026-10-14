# ThaiReport — Project Specification (สำหรับ AI สร้างโปรเจกต์)

> ชื่อ "ThaiReport" เป็นชื่อชั่วคราว เปลี่ยนได้ก่อนปล่อยจริง
> เอกสารนี้เป็น spec สำหรับ AI coding agent ให้สร้างทีละเฟส **ห้ามข้ามเฟส ห้ามประกาศว่าฟีเจอร์ใด "รองรับ" ถ้ายังไม่ผ่านเกณฑ์ตรวจรับของเฟสนั้น**

---

## 0. กติกาการทำงานของ AI (อ่านก่อนเริ่ม)

1. ทำตามลำดับเฟส (Phase 0 → 6) แต่ละเฟสมี **Acceptance Criteria** ต้องผ่านครบก่อนเริ่มเฟสถัดไป
2. **Phase 0 เป็น go/no-go spike** ถ้าข้อใดไม่ผ่าน ให้หยุดและรายงานผลพร้อมทางเลือก ห้ามฝืนทำต่อ
3. ทุกข้อที่ระบุว่า `[VERIFY]` คือข้อมูลที่ยังไม่ได้ยืนยัน ต้องตรวจจากแหล่งทางการ/ทดลองจริงก่อนอ้างอิง และบันทึกผลใน `docs/verification-log.md`
4. ฟีเจอร์ด้านกฎหมาย/ภาษี (PDF/A-3, ลายเซ็นดิจิทัล, e-Tax Invoice) ให้ติดป้าย `experimental` ในเอกสารและ API จนกว่าจะผ่านการตรวจ validator และทดสอบกับช่องทางจริง ห้ามเขียนในเอกสารว่า "ถูกต้องตามกฎหมาย" เด็ดขาด ให้เขียนว่า "ออกแบบให้สอดคล้องกับ … ผู้ใช้ต้องตรวจสอบกับผู้เชี่ยวชาญด้านภาษีของตน"
5. ใช้เฉพาะ dependency และฟอนต์ที่ license อนุญาตให้แจกต่อได้ (MIT/Apache-2.0/OFL) บันทึกใน `docs/licenses.md` ถ้าพบ dependency แบบ GPL/AGPL ให้หยุดและรายงาน ห้ามใส่ใน core
6. เขียนเทสต์ควบคู่โค้ดเสมอ โดยเฉพาะ golden test ภาษาไทย (ดูหัวข้อ 9)
7. เอกสารผู้ใช้เขียนเป็นภาษาไทยเป็นหลัก โค้ดและชื่อ API เป็นภาษาอังกฤษ

---

## 1. วิสัยทัศน์และเป้าหมาย

สร้าง **report/document engine แบบโอเพนซอร์สฟรี** ที่เป็นทางเลือกแทน JasperReports โดยแก้ pain point ของนักพัฒนาไทย:

| Pain point ใน Jasper/เครื่องมืออื่น | เป้าหมายของ ThaiReport |
|---|---|
| ภาษาไทยคุมยาก (วรรณยุกต์เพี้ยน ตัดคำกลางคำ) | Thai-first: shaping + ตัดคำด้วยพจนานุกรมเป็นแกนของ engine |
| หน้าออกแบบไม่ตรงกับ PDF ที่ออกมา | **engine ตัวเดียวกัน** (Rust → WASM ใน designer, native บน server) |
| ต้องใช้ Spring Boot/JVM, config ยาก, ช้า, หนักเครื่อง | binary เดียว/WASM/npm ไม่ต้องมี JVM |
| ต่อกับระบบภายนอกยาก | JSON template + HTTP API + npm + CLI + MCP server |
| จัด layout ยาก | Designer ลากวางบนเว็บ แบ่ง band แบบ Jasper |
| ต้องเสียเงิน | ฟรี MIT หรือ Apache-2.0 |
| เอกสารภาษีไทย (e-Tax) ต้องใช้ซอฟต์แวร์แยก | โมดูล e-Tax (PDF/A-3 + XML + ลงลายมือชื่อ) แบบ opt-in |

**หลักการ "ตรงตามเอกสาร 100%":** หน้าพรีวิวใน designer กับ PDF จริงต้องให้ผลพิกเซลเท่ากัน (ภายใน tolerance ที่กำหนด) เพราะใช้ shaping, ฟอนต์ และอัลกอริทึมตัดบรรทัดชุดเดียวกัน

### Non-goals (ไม่ทำใน v1)
- ไม่รับประกันความเข้ากันได้กับไฟล์ `.jrxml` (อาจมี importer บางส่วนหลัง v1)
- ไม่ทำ BI/dashboard/OLAP
- ไม่ทำ subreport/crosstab ใน v1 (วางไว้ใน roadmap)
- ไม่เป็น Certificate Authority และไม่เก็บ private key ของผู้ใช้เอง

---

## 2. สถาปัตยกรรม

```
 Template (JSON, versioned)  +  Data (JSON / SQL / CSV)
                    │
          ┌─────────▼──────────┐
          │  Rust core engine  │  (โค้ดชุดเดียว)
          │  parse → bind →    │
          │  layout → shape →  │
          │  render            │
          └───┬────────────┬───┘
      compile │            │ compile
      WASM    ▼            ▼  native
   Designer (browser)   Server / CLI / npm (napi-rs) / MCP
   พรีวิวด้วย engine จริง   สร้าง PDF จริง
```

### เทคโนโลยีที่เลือก (ต้องยืนยันใน Phase 0)
| ส่วน | เลือก | หมายเหตุ |
|---|---|---|
| PDF writer | `krilla` | รองรับ PDF/A-1..4 และ PDF/UA-1 แบบ validated export (ตามเอกสารของ krilla) แต่ **ไม่รองรับ encryption/permissions/digital signature ในตัว** → ต้องใช้ crate แยกสำหรับลงลายมือชื่อ |
| Text shaping/layout | `cosmic-text` (ใช้ `rustybuzz` + `swash`) | ทดสอบวรรณยุกต์ซ้อน/สระลอยด้วยฟอนต์ไทยหลายตัว |
| ตัดคำไทย | `thai-break` (Rust core) หรือ `uniworld` | `[VERIFY]` เปรียบเทียบคุณภาพทั้งสองตัว เลือกตัวที่ license เข้ากันและผ่าน test; ต้องมีพจนานุกรมผู้ใช้เพิ่มคำเองได้ |
| Layout algorithm | เขียนเอง (band + absolute positioning) | หน่วย mm/pt ไม่ใช่ px |
| Expression | `rhai` หรือ `minijinja` | แทน Java expression ของ Jasper; ต้อง sandbox ห้ามเข้าถึง FS/network |
| DB | `sqlx` (Postgres/MySQL/SQLite) | ทางเลือก ไม่บังคับ ผู้ใช้ส่ง JSON ตรงๆ ได้ |
| HTTP | `axum` | |
| MCP | `rmcp` | |
| Node binding | `napi-rs` + WASM build | |
| Designer | React/TypeScript (Next.js-friendly) | ยืมแนวคิดและ JSON schema จาก **pdfme (MIT)** ได้ แต่ข้อความบนหน้ากระดาษต้องวาดด้วย WASM engine ไม่ใช่ DOM text |

### โครงสร้าง workspace
```
thaireport/
├─ crates/
│  ├─ tr-core/        # template model, layout, data binding
│  ├─ tr-text/        # shaping, ตัดคำไทย, ฟอนต์
│  ├─ tr-pdf/         # แปลง layout → PDF (krilla), PDF/A
│  ├─ tr-thai/        # ฟังก์ชันไทย (พ.ศ., จำนวนเงินตัวอักษร, เลขไทย, tax id, PromptPay)
│  ├─ tr-etax/        # [experimental] XML ETDA, embed PDF/A-3, signing, timestamp
│  ├─ tr-wasm/        # wasm-bindgen
│  ├─ tr-server/      # axum HTTP API
│  ├─ tr-cli/
│  ├─ tr-mcp/         # MCP server
│  └─ tr-node/        # napi-rs
├─ packages/
│  ├─ designer/       # React designer
│  └─ client/         # npm client สำหรับ Next.js
├─ templates/         # template ตัวอย่างภาษาไทย
├─ fonts/             # ฟอนต์ OFL เท่านั้น
├─ tests/golden/      # ภาพอ้างอิง + ประโยคทดสอบ
├─ examples/nextjs-quickstart/
└─ docs/
```

---

## 3. Template format (JSON)

- เป็น source of truth เดียว ทั้ง designer, API, AI อ่านเขียนได้
- มี `schemaVersion`, JSON Schema สำหรับ validate, และกฎ migration ระหว่างเวอร์ชัน
- หน่วยเป็น **mm** (ภายในแปลงเป็น pt)
- องค์ประกอบหลัก: `page` (ขนาด, margin, orientation), `fonts`, `bands`, `elements`, `dataSources`, `parameters`, `styles`

ตัวอย่างย่อ:
```json
{
  "schemaVersion": "1.0",
  "page": { "size": "A4", "margin": [10, 10, 10, 10] },
  "fonts": [{ "family": "Sarabun", "embed": true }],
  "bands": [
    { "type": "title", "height": 30, "elements": [
      { "type": "text", "x": 10, "y": 5, "w": 100, "h": 8,
        "font": "Sarabun", "size": 18, "text": "ใบกำกับภาษี" }
    ]},
    { "type": "detail", "dataSource": "items", "height": 8, "elements": [
      { "type": "text", "x": 10, "y": 0, "w": 90, "h": 8,
        "text": "{{ item.name }}", "overflow": "wrap" }
    ]}
  ]
}
```

ทุก element ที่เป็นข้อความต้องกำหนด `overflow`: `wrap | shrink | clip | grow | error` (ค่าเริ่มต้น `error` เพื่อไม่ให้ layout เพี้ยนเงียบๆ)

---

## 4. Features (แบ่งตามลำดับความสำคัญ)

### 4.1 Core engine (MVP)
- [ ] Element: text, image (PNG/JPEG/SVG), line, rectangle, ellipse
- [ ] Table (กำหนดคอลัมน์, ขอบ, สลับสีแถว, header ซ้ำทุกหน้า)
- [ ] Band: title, page header, column header, detail, group header/footer, summary, page footer
- [ ] Page break อัตโนมัติ + ตารางข้ามหน้า
- [ ] Data binding จาก JSON; expression ในข้อความ; ผลรวม/subtotal/group
- [ ] Page number / total pages (`หน้า 1/3`)
- [ ] ฝังฟอนต์เป็น subset ใน PDF เสมอ
- [ ] Barcode (Code128, EAN) และ QR Code

### 4.2 Thai-first
- [ ] Shaping ภาษาไทยถูกต้อง (วรรณยุกต์ซ้อน, สระบน/ล่าง, สระอำ)
- [ ] ตัดคำด้วยพจนานุกรม ไม่ตัดกลางคำ ไม่ทิ้งไม้ยมก/ฯลฯ ไว้หัวบรรทัด
- [ ] พจนานุกรมผู้ใช้ + จุดห้ามตัด/บังคับตัด (`<nobr>`, ZWSP)
- [ ] ฟอนต์ไทยฝังมากับชุดติดตั้ง (OFL เช่น Sarabun, Noto Sans Thai ฯลฯ ตรวจ license ทุกตัว)
- [ ] ฟังก์ชัน: ปี พ.ศ., รูปแบบวันที่ไทย, เลขไทย, **จำนวนเงินเป็นตัวอักษรไทย** ("หนึ่งพันสองร้อยบาทถ้วน"), จัดรูปแบบสกุลเงินบาท
- [ ] ตรวจเลขประจำตัวผู้เสียภาษี 13 หลัก (checksum) และรหัสสาขา 5 หลัก (สำนักงานใหญ่ = 00000)
- [ ] **PromptPay QR** (EMVCo payload + CRC16) `[VERIFY]` ตรวจกับสเปกทางการและทดลองสแกนด้วยแอปธนาคารจริง
- [ ] พิมพ์แบบฟอร์มแบบพิกัดคงที่ (กรอกลงฟอร์มราชการสำเร็จรูป)

### 4.3 Designer (ลากวาง)
- [ ] หน้ากระดาษ A4 + ไม้บรรทัด, snap, guide, zoom
- [ ] ลาก/ย่อขยาย/หมุน/จัดแนว/จัดลำดับ layer/กลุ่ม
- [ ] แบ่ง band แบบ Jasper, ลากเส้นแบ่ง band
- [ ] Data panel: โหลด JSON ตัวอย่าง/schema แล้วลาก field มาวาง
- [ ] พรีวิวสดด้วย WASM engine (ไม่ใช้ DOM text วาดเนื้อหา)
- [ ] เตือนทันทีเมื่อข้อความล้นกรอบ (ตาม `overflow` policy)
- [ ] Undo/redo, copy/paste, import/export JSON
- [ ] ปุ่ม "สร้าง PDF" ใน browser ได้โดยไม่ต้องมี server
- [ ] ฝังเป็น component ใน Next.js ได้ (`<ReportDesigner />`)

### 4.4 การเชื่อมต่อ
- [ ] CLI: `thaireport render template.json data.json -o out.pdf`
- [ ] HTTP API: `POST /render` (template + data → PDF), `GET /templates`, health check; binary เดียว + Docker image
- [ ] npm package: `@thaireport/client` (browser WASM) และ `@thaireport/node` (native) พร้อมตัวอย่าง Next.js App Router + Route Handler
- [ ] MCP server: tools `render_report`, `list_templates`, `validate_template`, `preview_template` (คืนภาพ PNG)
- [ ] Output อื่น: PNG, (ภายหลัง) XLSX/HTML
- [ ] Data source: JSON, CSV, SQL (sqlx); parameter query แบบ prepared statement เท่านั้น ห้ามต่อ string

---

## 5. ข้อกำหนดเฉพาะของไทย: PDF/A, ลายเซ็นดิจิทัล, e-Tax Invoice

> สถานะ: **experimental** ทุกข้อในหัวข้อนี้ต้องตรวจสอบกับแหล่งทางการ (กรมสรรพากร rd.go.th, ETDA) ก่อนลงมือ และกฎอาจเปลี่ยน ให้บันทึกวันที่ตรวจใน `docs/verification-log.md`

### 5.1 สิ่งที่ทราบจากการค้นคว้าเบื้องต้น (ต้อง `[VERIFY]`)
- e-Tax Invoice ในไทยมี 2 ระบบ: **e-Tax Invoice & e-Receipt** (ต้องมีลายมือชื่อดิจิทัลและใบรับรองอิเล็กทรอนิกส์ จัดทำเป็น XML ตามมาตรฐาน) และ **e-Tax Invoice by Email** (สำหรับผู้ประกอบการรายได้ไม่เกิน 30 ล้านบาท/ปี ใช้ PDF/A-3 และประทับเวลาจากอีเมล)
- มาตรฐานข้อความอิเล็กทรอนิกส์ที่อ้างถึงคือ ETDA ICT Standard Recommendation 3-2560 (XML)
- ใบกำกับภาษีอิเล็กทรอนิกส์ที่ลงลายมือชื่อดิจิทัลต้องใช้ใบรับรองจาก CA ที่ได้รับการยอมรับ และมีข้อกำหนดการเก็บรักษา (แหล่งหนึ่งระบุอย่างน้อย 5 ปี `[VERIFY]`)
- มี service provider ที่ได้รับรองจากกรมสรรพากร/ETDA เป็นช่องทางส่งข้อมูลทางเลือก
- ใบกำกับภาษีอิเล็กทรอนิกส์ต้องมีเลขผู้เสียภาษี 13 หลักและรหัสสาขาของผู้ขาย/ผู้ซื้อตามที่ลงทะเบียนไว้

### 5.2 ความสามารถของ dependency (ตรวจเบื้องต้นแล้ว)
- `krilla`: มี validated export สำหรับ PDF/A-1, A-2, A-3, A-4 และ PDF/UA-1 แต่ **ไม่มี digital signature** → ต้องใช้ crate ลงลายมือชื่อแยก
- Crate ลงลายมือชื่อ PDF ด้วย Rust ที่พบ: `underskrift` (PAdES B-B ถึง B-LTA) และ `pdf_signer` (ตัวหลังพบว่าเวอร์ชันห่อ R/Python ประกาศ GPL-3) → `[VERIFY]` license และคุณภาพ **ถ้าเป็น GPL ห้ามรวมใน core ที่แจกแบบ MIT/Apache** ให้แยกเป็น plugin/โปรเซสต่างหาก หรือเลือกทางอื่น
- ยังไม่ได้ตรวจ: krilla ฝังไฟล์แนบ (XML) ใน PDF/A-3 พร้อม association ที่ถูกต้องได้หรือไม่ → ทดสอบใน Phase 0
- ยังไม่ได้ตรวจ: การลงลายมือชื่อ XML (เช่น XAdES) ที่ ETDA 3-2560 ต้องการ และ crate Rust ที่ทำได้ → ค้นคว้าใน Phase 4

### 5.3 Features ที่ต้องทำ (โมดูล `tr-etax`, opt-in feature flag `etax`)
- [ ] **PDF/A-3b export**: ตั้งค่าใน template (`"pdfStandard": "pdfa-3b"`) ผ่านการตรวจด้วย **veraPDF** ใน CI
- [ ] **ฝังไฟล์ XML** ในรูป associated file (ตามที่ PDF/A-3 กำหนด) และ metadata ที่เกี่ยวข้อง
- [ ] **สร้าง XML ตามโครงสร้าง ETDA 3-2560** จาก data model เดียวกับที่ใช้ render ใบกำกับภาษี (ข้อมูลหน้ากระดาษกับ XML ต้องมาจากแหล่งเดียวกัน ป้องกันตัวเลขไม่ตรงกัน)
- [ ] **ตรวจความถูกต้องก่อนออกเอกสาร**: เลขผู้เสียภาษี/สาขา, ยอดรวม = ผลรวมรายการ, VAT คำนวณถูก, ฟิลด์บังคับครบ
- [ ] **ลงลายมือชื่อดิจิทัล PDF (PAdES)** ด้วย PKCS#12 / PKCS#11 / HSM / API ของผู้ให้บริการ (ผ่าน trait `Signer` ให้เสียบ backend ได้) ผู้ใช้เป็นผู้ถือกุญแจเอง ระบบไม่เก็บ private key ถาวร
- [ ] **Time stamp (RFC 3161)** รองรับการระบุ TSA URL ที่ผู้ใช้กำหนด
- [ ] **ลงลายมือชื่อ XML** (ตามข้อกำหนดที่ตรวจพบ)
- [ ] **ตรวจสอบลายมือชื่อ** (verify) ว่าไฟล์ที่ออกยังตรวจผ่านหลังบันทึก/ส่งต่อ
- [ ] ชนิดเอกสาร: ใบกำกับภาษี (เต็มรูป/อย่างย่อ), ใบเพิ่มหนี้, ใบลดหนี้, ใบเสร็จรับเงิน, ใบกำกับภาษี/ใบเสร็จรวม
- [ ] เอกสารอธิบายชัดว่า **การส่งข้อมูลไปกรมสรรพากรทำผ่านช่องทางทางการ/ผู้ให้บริการที่ได้รับรอง** ThaiReport สร้างไฟล์และเซ็นให้ แต่ไม่รับรองว่าองค์กรของผู้ใช้เข้าเงื่อนไขระบบใด
- [ ] (ภายหลัง) ตัวช่วยเตรียม LTV/long-term archive ให้ตรวจลายมือชื่อได้ในอนาคต

### 5.4 เกณฑ์ตรวจรับหมวดนี้
- veraPDF ผ่านสำหรับ PDF/A-3b ทุก template ตัวอย่างใบกำกับภาษี
- ไฟล์ที่เซ็นแล้วตรวจผ่านอย่างน้อย 2 verifier อิสระ (เช่น Adobe Acrobat และเครื่องมืออื่น/สคริปต์ verify)
- XML ผ่านการ validate กับ schema/ตัวอย่างอย่างเป็นทางการ `[VERIFY]`
- ทดสอบส่งจริงผ่านช่องทางทดสอบ/ผู้ให้บริการอย่างน้อยหนึ่งราย (ถ้าทำได้) และบันทึกผล
- ภาษาไทยในเอกสารที่เซ็นยังตรงกับ golden test (การแปลงเป็น PDF/A ต้องไม่ทำให้ shaping เปลี่ยน)

---

## 6. เงื่อนไขด้านการยอมรับของผู้ใช้ (Adoption) — บังคับก่อนปล่อย v1.0

ของดีไม่ได้แปลว่าคนจะย้ายมา ต้องทำสิ่งต่อไปนี้ให้เสร็จ ไม่ใช่ของแถม

### 6.1 Template สำเร็จรูปภาษาไทย (อย่างน้อย)
1. ใบกำกับภาษี (เต็มรูป) และใบกำกับภาษีอย่างย่อ
2. ใบเสนอราคา
3. ใบแจ้งหนี้ / ใบวางบิล
4. ใบเสร็จรับเงิน
5. ใบส่งของ / ใบลดหนี้ / ใบเพิ่มหนี้
6. หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) `[VERIFY]` รูปแบบปัจจุบัน
7. ใบสำคัญจ่าย / ใบสำคัญรับ
8. ใบลา / ใบรับรองเงินเดือน / สลิปเงินเดือน

ทุก template: มีข้อมูลตัวอย่าง, ภาพ PDF ตัวอย่าง, golden test, และหมายเหตุให้ตรวจเนื้อหาตามกฎหมายกับนักบัญชี (ห้ามอ้างว่าครบถ้วนตามกฎหมายเอง)

### 6.2 เอกสารภาษาไทย
- Getting Started (ติดตั้งถึงได้ PDF ภายใน 5 นาที)
- คู่มือ template format พร้อมตัวอย่าง
- คู่มือภาษาไทย: ฟอนต์, ตัดคำ, พจนานุกรมผู้ใช้, แก้ปัญหาที่พบบ่อย
- คู่มือย้ายจาก Jasper (เทียบแนวคิด band/field/parameter, ข้อจำกัด)
- คู่มือ e-Tax (พร้อมคำเตือนด้านกฎหมายและลิงก์แหล่งทางการ)
- เอกสาร API/MCP, FAQ, หน้า troubleshooting
- เว็บไซต์เอกสาร + playground ออนไลน์ (WASM ทำงานใน browser ไม่ต้องติดตั้ง)

### 6.3 Next.js Quickstart ที่ใช้งานได้ใน 5 นาที
`examples/nextjs-quickstart/` ต้องมี:
- `npx create-…` หรือ `git clone` + `npm i` + `npm run dev` แล้วเห็นผลทันที
- ตัวอย่าง 3 แบบ: (1) สร้าง PDF ใน browser ด้วย WASM, (2) Route Handler เรียก native, (3) ฝัง designer ในหน้าเว็บ
- ตัวอย่างต่อ Postgres/Prisma ดึงข้อมูลมาเติมใบกำกับภาษี
- **เกณฑ์วัดผล**: คนที่ไม่เคยใช้ ทำตาม README แล้วได้ PDF ใบกำกับภาษีภาษาไทยภายใน 5 นาที (ทดสอบกับคนจริงอย่างน้อย 3 คน และจับเวลา) ถ้าไม่ผ่านให้ปรับ README/ตัวอย่างจนผ่าน

### 6.4 การแจกจ่าย
- License: MIT หรือ Apache-2.0 (เลือกหนึ่งก่อน v0.1; ตรวจความเข้ากันได้ของ dependency ทั้งหมด)
- ปล่อยผ่าน: crates.io, npm, Docker image, binary สำเร็จรูป (Linux/macOS/Windows)
- มี CONTRIBUTING, Code of Conduct, issue/PR templates, roadmap สาธารณะ
- CI: build, test, golden test, veraPDF, license check (`cargo deny`)
- ระบบรับ feedback จากผู้ใช้ไทย (GitHub Discussions และ/หรือกลุ่มชุมชน) พร้อม template รายงานบั๊กภาษาไทยที่ให้แนบประโยคที่เพี้ยน + ฟอนต์ + ภาพ

---

## 7. Roadmap และเกณฑ์ตรวจรับรายเฟส

### Phase 0 — Spike (go/no-go) ประมาณ 1–3 วัน
ทดสอบและรายงานผลใน `docs/spike-report.md`:
1. เรนเดอร์ชุดประโยคไทยยาก (วรรณยุกต์ซ้อน, สระลอย, สระอำ, ประโยคยาวไม่มีวรรค, ชื่อเฉพาะ, ตัวเลขผสม) ด้วย krilla + cosmic-text + thai-break เทียบกับ baseline (เช่น pdfme และ Typst) แล้วดูภาพเทียบ
2. คอมไพล์ shaping + layout เป็น WASM แล้วเรนเดอร์ใน browser ได้
3. ผลจาก WASM และ native **ตรงกัน** (เทียบภาพ/ตำแหน่ง glyph ภายใน tolerance)
4. ส่งออก PDF/A-3b และ **ฝังไฟล์ XML** ด้วย krilla แล้วผ่าน veraPDF
5. ทดลองลงลายมือชื่อ PAdES ด้วย crate ที่ license เข้ากัน บนไฟล์ที่ได้จากข้อ 4 แล้วตรวจด้วย verifier ภายนอก
6. เปรียบเทียบ thai-break กับ uniworld (ความแม่นยำบนชุดคำทดสอบ, ขนาด, license, WASM)

**Go เมื่อ** ข้อ 1–3 ผ่าน (ภาษาไทยถูก + WASM/native ตรงกัน) ส่วนข้อ 4–6 ถ้าไม่ผ่านให้บันทึกเป็นความเสี่ยงและเสนอทางเลือก (เช่น ใช้ pdf-writer ระดับต่ำเสริม, แยกขั้นตอนลงลายมือชื่อเป็นโปรเซสภายนอก)

### Phase 1 — Core engine + CLI
Template JSON → PDF ภาษาไทยถูกต้อง, element พื้นฐาน, ฟอนต์ฝัง, CLI, golden test ชุดแรก
**ผ่านเมื่อ:** golden test ผ่านทุกกรณี, ไม่มี glyph หาย (`.notdef`), เอกสารตัวอย่าง 3 ฉบับตรงกับ mockup

### Phase 2 — WASM + Designer ขั้นต้น
วาง text/image/line/rect/table, พรีวิวสดด้วย WASM, import/export JSON
**ผ่านเมื่อ:** ภาพพรีวิวกับ PDF ที่ server สร้างตรงกันใน tolerance ที่กำหนดสำหรับ template ตัวอย่างทุกฉบับ

### Phase 3 — Band, data binding, API
Band ครบ, page break, group/subtotal, SQL, HTTP API, Docker, npm package
**ผ่านเมื่อ:** รายงานหลายร้อยแถวข้ามหลายหน้าตรงตามที่ออกแบบ, benchmark เวลา/หน่วยความจำเทียบ Jasper บน use case เดียวกัน (บันทึกตัวเลขจริง ห้ามอ้างลอย)

### Phase 4 — Thai compliance (`tr-etax`, experimental)
ตามหัวข้อ 5 ทั้งหมด
**ผ่านเมื่อ:** ผ่านเกณฑ์ตรวจรับ 5.4

### Phase 5 — MCP, QR/Barcode, PromptPay, ฟังก์ชันไทยครบ
**ผ่านเมื่อ:** MCP ใช้งานกับ AI client ได้จริงตั้งแต่สร้าง template ถึงได้ PDF; PromptPay QR สแกนผ่านแอปธนาคารจริง

### Phase 6 — Adoption & ปล่อย v1.0
ทำหัวข้อ 6 ให้ครบ
**ผ่านเมื่อ:** 6.3 ผ่านการทดสอบกับคนจริง, template 8 ชุดพร้อม, เอกสารครบ, CI เขียวทุกข้อ

### หลัง v1.0 (backlog)
Subreport, crosstab, chart, importer `.jrxml` บางส่วน, XLSX/HTML output, ไลบรารีลายเซ็นภาพ/ตราประทับ, ฟอร์มกรอกข้อมูลแบบ interactive

---

## 8. Non-functional requirements

- **Performance (เป้าหมาย ต้องวัดจริง):** ใบกำกับภาษี 1 หน้า render < 50 ms บน server ทั่วไป; ไม่มีการรั่วของหน่วยความจำเมื่อ render ต่อเนื่อง
- **ขนาด:** binary server < 50 MB; WASM bundle บีบอัดแล้วให้เล็กที่สุดเท่าที่ทำได้ (บันทึกขนาดจริงทุก release)
- **Determinism:** input เดียวกัน → PDF เดียวกันทุกครั้ง (ตั้ง creation timestamp ได้) เพื่อให้ golden test เสถียร
- **ความปลอดภัย:** sandbox expression, จำกัดขนาด input, ไม่โหลด resource จากภายนอกโดยไม่ได้อนุญาต, SQL แบบ prepared เท่านั้น, ไม่ log ข้อมูลส่วนบุคคล/เลขภาษี/กุญแจ
- **Accessibility:** รองรับ tagged PDF / PDF/UA ตามความสามารถของ krilla (ไม่บังคับใน v1)
- **PDPA:** เอกสารอธิบายว่า engine ไม่เก็บข้อมูลผู้ใช้; โหมด server ไม่เก็บไฟล์ที่สร้างหลังตอบกลับ (เว้นแต่ตั้งค่าเอง)

---

## 9. กลยุทธ์การทดสอบ

1. **Thai golden test suite** (`tests/golden/th/`): ประโยคที่เคยมีปัญหาในเครื่องมืออื่น เช่น วรรณยุกต์ซ้อนกับสระบน, สระอำ + วรรณยุกต์, ฟอนต์หลายตัว (Sarabun, TH Sarabun New ถ้า license อนุญาต, Noto Sans Thai), ข้อความปนอังกฤษ/ตัวเลข, ประโยคยาวที่ต้องตัดบรรทัด เปรียบเทียบภาพกับ baseline ที่ตรวจด้วยตาโดยเจ้าของภาษาไทยแล้ว
2. **WASM vs native parity test**: เรนเดอร์ template เดียวกันสองทาง เทียบผล
3. **Layout regression:** ภาพ PDF → PNG เทียบกับ baseline (tolerance กำหนดชัดเจน)
4. **veraPDF** ใน CI สำหรับ PDF/A
5. **Signature verification test** ในไฟล์ที่เซ็นแล้ว
6. **Property/fuzz test** ของ parser template และ expression
7. **Template validation test:** JSON Schema ทุก template ตัวอย่าง
8. **Usability test:** จับเวลา Quickstart 5 นาที (หัวข้อ 6.3)
9. **Benchmark** เทียบ Jasper (เวลา, RAM, ขนาด) บน use case ใบกำกับภาษีและรายงานหลายร้อยแถว

---

## 10. ความเสี่ยงและวิธีรับมือ

| ความเสี่ยง | วิธีรับมือ |
|---|---|
| krilla ไม่รองรับบางอย่างที่ e-Tax ต้องการ (ฝัง XML, ฯลฯ) | Phase 0 ทดสอบก่อน; สำรองด้วย `pdf-writer` ระดับต่ำหรือ post-process |
| Crate ลงลายมือชื่อเป็น GPL หรือยังไม่เสถียร | แยก plugin/process, หรือเขียน PAdES ส่วนจำเป็นเอง, หรือให้ผู้ใช้ใช้ signer ภายนอกผ่าน trait `Signer` |
| ตัดคำไทยผิดในชื่อเฉพาะ | พจนานุกรมผู้ใช้ + จุดห้ามตัด + แสดงตำแหน่งตัดใน designer |
| Designer ใช้แรงมาก | แบ่งเฟส ปล่อยขั้นต้นก่อน ยืม schema/แนวคิดจาก pdfme |
| กฎ e-Tax เปลี่ยน | แยกโมดูล, ติดป้าย experimental, ระบุวันที่ตรวจ, ลิงก์แหล่งทางการ |
| ความรับผิดทางกฎหมายของเอกสารภาษี | ข้อความปฏิเสธความรับผิดชัดเจน, ไม่อ้างว่ารับรองความถูกต้อง |
| คนไม่ย้ายมา | หัวข้อ 6 เป็นเงื่อนไขปล่อย v1.0; เก็บ feedback และ template ที่ชุมชนต้องการ |
| ลิขสิทธิ์ฟอนต์ | ใช้ OFL เท่านั้น; ตรวจก่อนแจก; ฟอนต์ที่ไม่แจกต้องให้ผู้ใช้ติดตั้งเอง |

---

## 11. ข้อมูลอ้างอิง (ต้องตรวจซ้ำก่อนใช้)

- krilla: https://github.com/LaurenzV/krilla
- cosmic-text: https://github.com/pop-os/cosmic-text
- thai-break: https://github.com/kamthorn/thai-break
- uniworld (crate): https://docs.rs/crate/uniworld/latest
- pdfme (MIT): https://github.com/pdfme/pdfme
- underskrift (crate): https://docs.rs/crate/underskrift/latest
- veraPDF (PDF/A validator): https://verapdf.org
- กรมสรรพากร e-Tax Invoice: https://www.rd.go.th และ https://etax.rd.go.th
- ETDA (มาตรฐาน 3-2560, TSA/CA): https://www.etda.or.th
- Typst Thai line breaking discussion: https://forum.typst.app/t/how-to-implement-dictionary-based-word-recognition-for-thai-for-line-breaking-hyphenation/7470

---

## 12. สิ่งที่ AI ต้องส่งมอบเมื่อจบแต่ละเฟส

1. โค้ดที่ build ผ่านและเทสต์เขียว
2. อัปเดต `docs/` ที่เกี่ยวข้อง
3. `docs/phase-N-report.md`: ทำอะไร ผลเทียบ Acceptance Criteria ข้อที่ไม่ผ่านหรือเลี่ยงไปพร้อมเหตุผล และความเสี่ยงใหม่ที่พบ
4. รายการ `[VERIFY]` ที่ปิดแล้ว (พร้อมแหล่งและวันที่) และที่ยังค้าง
5. คำถามที่ต้องให้เจ้าของโปรเจกต์ตัดสินใจก่อนเริ่มเฟสถัดไป
