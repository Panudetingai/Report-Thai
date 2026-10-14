# Phase 1 report — Core engine + CLI (2026-10-14)

**สรุป: ผ่านเกณฑ์** — Template JSON → PDF ภาษาไทยถูกต้อง, element พื้นฐานครบ,
ฟอนต์ OFL ฝัง, CLI ใช้งานจริง, golden test 5/5, ไม่พบ glyph หาย

## 1. ผลเทียบ Acceptance Criteria (สเปก Phase 1)

| เกณฑ์ | ผล |
|---|---|
| golden test ผ่านทุกกรณี | ✅ 5/5 (`crates/tr-pdf/tests/golden_phase1.rs`: ประโยค 9 บรรทัดไม่ขาด glyph, wrap พอดีกรอบ + ไม่ทิ้ง ๆ/ฯ ขึ้นต้นบรรทัด, render 3 ฉบับ, overflow error ยิง, ตาราง 120 แถวข้ามหน้า) |
| ไม่มี glyph หาย (.notdef) | ✅ engine ตรวจ `missing_glyphs` (ttf-parser ตรง cmap) ทุกข้อความก่อนวาด — เจอแล้ว Err ทันที ไม่ปล่อย tofu เงียบๆ; เทสต์ยิงครบ 9 ประโยคทั้ง Sarabun |
| เอกสารตัวอย่าง 3 ฉบับตรง mockup | ✅ `templates/invoice-full.json` + `quotation.json` + `receipt.json` (พร้อม `.data.json`) — `validate` ผ่านทั้ง 3, render ได้ PDF (14,607 / 12,672 / 12,853 bytes), ฉบับละ 1 หน้า; render ซ้ำได้ bytes เดียวกันเป๊ะ (SHA256 ตรง) — **ค้างตรวจตาของเจ้าของ** (เปิด `target/phase1/*.pdf` เทียบ) |

## 2. สิ่งที่ทำ (ตามคำตอบเจ้าของ 3 ข้อ)

1. **License MIT** — `LICENSE-MIT` + workspace `license = "MIT"` (เดิม `MIT OR Apache-2.0`)
2. **ฟอนต์ OFL** — `fonts/`: Sarabun Regular/Bold + Noto Sans Thai Variable (+`OFL.txt` 2 ฉบับ),
   ตรวจหัว license แล้ว (Sarabun Project 2018 / Noto Project 2022, OFL 1.1 ทั้งคู่)
3. **Core engine + CLI**:
   - `tr-core`: Template model เต็ม (page/margin/orientation, fonts, bands 8 ชนิด, elements
     text/image/line/rectangle/ellipse/table, overflow 5 แบบ default `error`, bind `{{ }}` +
     `{{ page }}/{{ pages }}`, สี hex) + เทสต์ 5/5
   - `tr-text`: เพิ่ม `missing_glyphs` (ttf-parser), `load_bundled_fonts`, **FontSystem pool**
     (แก้คอขวด: 120 แถวเคยเกิน 4 นาทีเพราะสร้าง FontSystem ใหม่ทุกครั้งที่วัด → ตอนนี้ render ผ่าน)
   - `tr-pdf`: `render_template` (mm→pt, wrap ด้วย thaibreak+user_dict, shrink/clip/grow/error,
     จัดหน้า title/pageHeader/columnHeader/detail/summary/pageFooter, ตารางข้ามหน้าพร้อม header ซ้ำ +
     แถวสลับสี, ภาพ PNG/JPEG จาก base64/dataURL/path, metadata creator+fixed date เพื่อ determinism)
   - `tr-thai`: พ.ศ./วันที่ยาว-ย่อ, เลขไทย↔อารบิก, **บาทตัวอักษร** (เอ็ด/ยี่สิบ/ล้าน/สตางค์/ถ้วน),
     จัดรูปสกุลเงิน, ตรวจ tax id + รหัสสาขา — เทสต์ 7/7
   - `tr-cli`: `thaireport render template.json data.json -o out.pdf [--fonts DIR]` +
     `thaireport validate template.json` ใช้งานจริงแล้ว
   - ทดสอบตาราง 120 แถว: ได้ 5 หน้า 45,100 bytes (header ซ้ำทุกหน้า)

## 3. ข้อที่เลี่ยง/เลื่อน (พร้อมเหตุผล)

1. **ตรวจตาภาษาไทย + ตรง mockup พิกเซล** — เลื่อนให้เจ้าของเปิด PDF ตรวจ (วรรณยุกต์ซ้อน/สระลอย/สระอำ)
   เหมือน Phase 0; เทียบพิกเซล baseline เป็นงาน Phase 2 (parity preview↔PDF)
2. **Barcode/QR** — model ยังไม่ใส่ element type (สเปก 4.1 อยู่ Core แต่ PromptPay/QR ตรวจรับที่ Phase 5);
   เสนอทำพร้อม Phase 5 ทีเดียว ไม่แยกครึ่งๆ กลางๆ
3. **Group header/footer เต็มรูปแบบ** — Phase 1 วาดครั้งเดียว (ไม่มี group-by);
   grouping/subtotal จริงเป็นงาน Phase 3 (Band, data binding, API)
4. **Expression เต็ม (`rhai`/`minijinja`)** — Phase 1 มีแค่ `{{ path }}` + page/pages;
   sandbox expression เป็นงาน Phase 3
5. **ภาพ SVG** — Phase 1 รับเฉพาะ PNG/JPEG (krilla decode); SVG เลื่อน (rsvg/resvg ยังไม่เลือก)
6. **Benchmark <50ms + เทียบ Jasper** — เป็นเกณฑ์ Phase 3; Phase 1 บันทึกแค่ขนาดไฟล์ + determinism
   (debug render ใบกำกับ 6 แถว ~วินาที; ตัวเลขจริงต้องวัด release ใน Phase 3)

## 4. ความเสี่ยงใหม่ที่พบ

| ความเสี่ยง | หลักฐาน | วิธีรับมือ |
|---|---|---|
| `1px ≈ 1pt` ยังเป็นค่าประมาณ (สืบจาก spike) | wrap พอดีในเทสต์แต่ไม่มีหลักฐานว่าเท่ากันทุกขนาด | Phase 2: เทียบ glyph positions WASM↔native (parity มีอยู่แล้ว) + เทียบภาพ |
| FontSystem pool ใช้ Mutex ถือข้าม shape — โอเค single-thread แต่ WASM/wasm-bindgen อาจต้องทบทวน | โค้ด `pooled_measure` | Phase 2: ทดสอบ `wasm-pack` + รัน parity ใหม่ ถ้าติดให้แยก pool ต่อ thread |
| `line_step = size*1.5` ตายตัว — ฟอนต์อื่นอาจแน่น/หลวม | title size 18 ต้อง h≥9.5mm (เจอตอน template แรก) | เก็บเป็นค่าตั้งได้ใน template (line_height)  Phase 2 |
| ตารางใน header/footer ไม่ข้ามหน้า (วาดตรง) | โค้ด `emit_table` ฝั่ง non-paged | รับได้ Phase 1 (ตารางอยู่ detail); ถ้ามี use case ค่อยทำ |
| Noto Sans Thai เป็น variable font — krilla ใช้ default instance | render ผ่าน แต่ยังไม่ตรวจน้ำหนัก | Phase 2 designer: ตรวจ visual ว่าหนัก/เอียงตรง |

## 5. `[VERIFY]` — ปิดแล้ว / ค้าง

- ปิดเพิ่ม: ฟอนต์ OFL ทั้ง 2 ชุด (หัวไฟล์ + วันที่) · License MIT (คำตอบเจ้าของ 2026-10-14) ·
  determinism (SHA256 render ซ้ำตรง 2026-10-14) · ตารางข้ามหน้า 5 หน้า/120 แถว
- ค้างเดิม: PromptPay สแกนจริง (Phase 5) · ETDA 3-2560 (Phase 4) · 50 ทวิ (6.1) ·
  Acrobat+CA จริง (Phase 4) · เทียบตา baseline (Phase 1→2)

## 7. แก้บั๊กหลังเจ้าของตรวจตา (2026-10-14)

เจ้าของพบ 3 อาการใน `receipt.pdf`: (1) ระยะห่างแน่น (2) ข้อความเลยขอบไม่ตัดบรรทัด
(3) กล่อง tofu `□` ตรง `จำกัด□123` / `00078□วันที่`

- สาเหตุราก: ข้อความ template มี `\n` แต่ engine ไม่แยกย่อหน้า ส่ง `\n` ลง `draw_text`
  ทั้งก้อน (ฟอนต์ไม่มี glyph → ขึ้นกล่อง) แถมก้อนยาวที่ไม่มีจุดตัด (เช่น
  `RC-2569-00078วันที่`) ถูก "ยอมล้น" ตามข้อจำกัด spike เดิม
- แก้: `wrap_thai` แยกย่อหน้าก่อนตัด + ตัด ZWSP/control ออกจากผลลัพธ์ +
  `force_break_unit` บังคับตัดทีละตัวอักษรโดยไม่ทิ้ง ๆ/ฯ/สระลอยไว้หัวบรรทัด;
  `layout_text` คิดความสูงบรรทัดแรก `size` + ที่เหลือ `size*1.6` (เดิม `n*size*1.5`
  ทำให้กล่อง title แน่นเกินจริง); ระยะบรรทัด `1.5→1.6`, cell padding `3→4.5pt`
- กันกลับมาเป็นอีก: เทสต์ `wrap_splits_newlines_and_strips_controls`,
  `wrap_force_breaks_long_unbreakable_chunk` (tr-text) + golden
  `every_template_text_fits_its_box` (ไล่ทุก text/table cell ใน 3 template ว่าพอดีกล่อง
  ไม่มี control/ZWSP หลุด) — รวมเทสต์เขียว tr-text 7/7, golden 6/6

- สรุปชิดตาราง 0mm (เจ้าของชี้จุดใน quotation): เพิ่ม `Band.gap_before` (mm, default 0)
  engine เว้นให้เฉพาะ groupFooter/summary (ข้ามเมื่ออยู่ต้นหน้าใหม่); ตั้ง `summary:
  "gap_before": 4` ใน template ทั้ง 3 ฉบับ — ปรับเลขนี้ใน JSON ได้เองไม่ต้องแตะโค้ด

- ที่เซ็นใบเสร็จเคยเป็นวงรีครอบ "ผู้รับเงิน" (ดูเหมือนตราประทับ — เจ้าของทัก):
  เปลี่ยนเป็นเส้นเซ็นชื่อมาตรฐาน 2 ฝั่ง (ผู้รับเงิน/ผู้จ่ายเงิน) ด้วย `line` + `text`
  ใน `templates/receipt.json` (element `ellipse` ยังใช้ได้ ไม่ได้ลบออกจาก engine)

## 6. คำถามถึงเจ้าของก่อนเริ่ม Phase 2

1. **ตรวจตา PDF 3 ฉบับ** (`target/phase1/*.pdf`, gitignore — เปิดจากเครื่องนี้):
   ฟอนต์/วรรณยุกต์/ตัดบรรทัด/ตาราง/เลขหน้า ตรงความคาดหวังไหม?
2. **Barcode/QR เลื่อนไป Phase 5** พร้อม PromptPay (ตามสเปกตรวจรับ) — OK ไหม หรืออยากได้ QR ขั้นต้นก่อน?
3. **เริ่ม Phase 2 (WASM + Designer ขั้นต้น) ได้เลยไหม?**
