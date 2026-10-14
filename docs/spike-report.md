# spike-report (Phase 0) — เทมเพลตบันทึกผล

> เติมผลทดลองจริงทีละข้อ วันที่ตรวจ + ภาพเทียบ

## 1. เรนเดอร์ประโยคไทยยาก (krilla + cosmic-text + thai-break)
- [x] ชุดประโยคใน `tests/golden/th/sentences.txt` เรนเดอร์แล้ว (2026-10-14)
- [ ] เทียบกับ baseline (pdfme / Typst) — แนบภาพ (รอตรวจด้วยตาโดยเจ้าของภาษา)
- ผล (spike รันจริง `cargo run -p tr-pdf --example spike_item1`):
  - dependency จริง: `krilla 0.8.2` + `cosmic-text 0.19.0` + `thaibreak 1.4.0` (+ `uniworld 0.2.0` เทียบ) — `cargo build -p tr-text -p tr-pdf` ผ่าน, `cargo test -p tr-text` ผ่าน 3/3
  - หมายเหตุชื่อ crate: สเปกเขียน `thai-break` แต่ชื่อจริงบน crates.io คือ `thaibreak` (repo `kamthorn/thai-break`) — ใช้ `thaibreak = "1.4"`
  - ฟอนต์ spike: `C:\Windows\Fonts\tahoma.ttf` เฉพาะเครื่องทดสอบเท่านั้น (ไม่ใช่ OFL ห้าม commit) — ฟอนต์ OFL จริงรอ Phase 1
  - shaping (cosmic-text, font 32px, Tahoma): 9/9 บรรทัดได้ glyphs ครบ ไม่มี 0-glyph — [41, 44, 60, 45, 90, 43, 79, 69, 54] glyphs ตามลำดับบรรทัด
  - ตัดคำ `thaibreak::words`: [10, 10, 18, 13, 24, 7, 19, 15, 15] คำ — ประโยคยาวไม่มีวรรค (บรรทัด 5) ตัดได้ 24 คำ ถูกต้อง
  - เทียบ `uniworld::segment::word_boundaries`: [1, 16, 18, 12, 4, 8, 24, 20, 12] ชิ้น — บรรทัดไทยล้วน (ข้อ 1: 1 ชิ้น, ข้อ 5: 4 ชิ้น) ตัดไม่ได้ เพราะ UAX #29 default ไม่มีพจนานุกรมไทย → หลักฐานเบื้องต้นสำหรับข้อ 6 ว่า uniworld แทน thaibreak ไม่ได้
  - PDF: `target/spike/spike-item1-thai.pdf` (A4, Tahoma subset, krilla `draw_text` 16pt)
    - รอบ 2 (2026-10-14, แก้ layout ล้นขอบ): เพิ่ม `tr_text::wrap_thai` (greedy wrap บนจุดตัด thaibreak + วัดกว้างด้วย cosmic-text ที่ font size จริง, margin 48pt) + `render_thai_lines` ขึ้นหน้าใหม่เมื่อเต็ม — บรรทัดยาว (ข้อ 5, 7) ตัดเป็น 2 บรรทัดโดยไม่ตัดกลางคำแล้ว, `cargo test -p tr-text` ผ่าน 4/4
    - รอบ 3 (2026-10-14, แก้ล้นรอบสอง + จุดตัดผิด): สาเหตุล้นรอบ 2 คือวัดความกว้างด้วย `Family::SansSerif` ลอยๆ — fontdb จับคู่ฟอนต์ระบบตัวอื่นที่แคบกว่า Tahoma ที่ใช้วาดจริง → แก้โดยปัก family จากฟอนต์ที่โหลด (`thai_font_system`, ใช้ `fontdb::Source::Binary` + `face().families`) ทั้ง `measure_thai_width`/`shape_thai`; spike มี self-check ทุกบรรทัดย่อยต้อง ≤ 499pt (11 visual lines ผ่านหมด)
    - รอบ 3 พจนานุกรมผู้ใช้ (สเปก 4.2): พิสูจน์แล้วว่าพจนานุกรมหลักตัด "วันที่"→"วัน|ที่" และ "เลขที่"→"เลข|ที่" — เพิ่ม `segment_thai_with_dict`/`wrap_thai(..., extra_words)` (ต่อ `ThaiTrie::embedded` + `trie.add(word, 10.0)`) แล้ว "วันที่"/"เลขที่" ไม่แยกกลางคำ (เทสต์ `user_dict_keeps_wanthi_together` ผ่าน; รวม 5/5) — กลไกนี้คือคำตอบเรื่องคำเฉพาะโดเมนใน Phase 1
    - ข้อจำกัดที่ยังเหลือ: จุดตัดพจนานุกรมหลักบางคำ (เช่น "ชื่นชม"→"ชื่น|ชม") ต้องพึ่งพจนานุกรมผู้ใช้; 1px≈1pt เป็นค่าประมาณของ spike
  - ค้าง: (a) ตรวจภาพด้วยตา (วรรณยุกต์ซ้อน/สระลอย/สระอำ/ไม้ยมก) เทียบ baseline Typst/pdfme, (b) ฟอนต์ OFL (Sarabun/Noto Sans Thai) หลังตรวจ license, (c) ตรวจ `.notdef` แบบอัตโนมัติใน Phase 1 golden test

## 2. WASM build
- [x] shaping + layout compile เป็น WASM ได้ (2026-10-14)
- [x] เรนเดอร์ใน browser ได้ (demo หน้า `crates/tr-wasm/demo-spike2.html` — เปิดด้วย browser + เลือกไฟล์ฟอนต์เอง)
- ผล:
  - `cargo build -p tr-wasm --target wasm32-unknown-unknown` ผ่านรอบแรก — `cosmic-text 0.19` + `thaibreak 1.4` (default features มี `c-ffi`/`libc`) + `uniworld 0.2` + `fontdb 0.23` คอมไพล์ลง wasm ได้โดยไม่ต้องปิด feature ใดๆ
  - expose ผ่าน wasm-bindgen: `segment_thai`, `segment_thai_with_dict`, `measure_thai_width`, `wrap_thai` (รับฟอนต์เป็น `Uint8Array`, คืน JSON)
  - `wasm-pack build --target nodejs --out-dir pkg-node` และ `--target web --out-dir pkg-web` ผ่าน (มี warning เรื่อง LICENSE file กลาง — หาไฟล์ LICENSE กลางก่อนปล่อยจริง)
  - ขนาด `tr_wasm_bg.wasm` (release + wasm-opt): ดิบ 2,221,780 bytes (~2.12 MiB), gzip ~865,515 bytes (~845 KiB) — รวม cosmic-text+thaibreak (พร้อม embedded-dict)+uniworld ทั้งก้อน; แยกขนาดราย crate (twiggy/cargo-bloat) ทำใน Phase 1
  - รันใน Node (V8) ผ่าน `parity-wasm.mjs` — ฟังก์ชันไทยทำงานใน JS engine จริง ไม่ใช่แค่คอมไพล์ผ่าน
  - ยืนยันใน browser จริงโดยเจ้าของโปรเจกต์ (2026-10-14, `demo-spike2.html` + THSarabunNew): 3 ประโยคพอดีกรอบ 595pt ไม่ล้น, "วันที่" ไม่แยกกลางคำ — เจอและแก้บั๊ก demo ระหว่างทาง: วัดด้วยฟอนต์หนึ่งแต่วาดด้วยอีกฟอนต์ (Sarabun แคบกว่า Tahoma) แล้วล้น → แก้โดยโหลดฟอนต์ที่เลือกเป็น `FontFace` แล้ววาดด้วยตัวเดียวกัน (บทเรียนเดียวกับข้อ 1 รอบ 3: วัดกับวาดต้องใช้ฟอนต์ตัวเดียวกันเสมอ)

## 3. WASM/native parity
- [x] ภาพ/ตำแหน่ง glyph ตรงกันใน tolerance ±0.01px (ระดับตัวเลข; เทียบภาพพิกเซลเต็มทำ Phase 2)
- ผล (2026-10-14): native dump (`dump_parity` → `target/spike/parity-native.json`, 9 บรรทัด) เทียบกับ WASM (`node parity-wasm.mjs`) — **PARITY OK**: `wrap_thai` ตรงกันทั้ง 9 บรรทัดแบบ exact string (11 visual lines), `measure_thai_width` ตรงกันใน ±0.01 — ฟอนต์เดียวกัน (Tahoma) + โค้ดชุดเดียวกันเลยตรงกันตามทฤษฎี ผลจริงยืนยัน

## 4. PDF/A-3b + ฝัง XML (krilla) + veraPDF
- [x] ผ่าน veraPDF (2026-10-14, veraPDF 1.30.3 + Temurin JRE 21)
- ผล:
  - โค้ด `cargo run -p tr-pdf --example spike_item4` → `target/spike/spike-item4-pdfa3b.pdf` (29,122 bytes) + `spike-item4-invoice.xml`
  - ใช้ `ConfigurationBuilder::new().with_archival_validator(Archival::A3_B)` + `Document::new_with` — validator ในตัวของ krilla ผ่าน (ถ้าไม่ผ่าน `finish()` จะ Err)
  - ฝัง XML ผ่าน `Document::embed_file` (`path=invoice.xml`, `MimeType::new("text/xml")`, `description`, `AssociationKind::Data`, `modification_date`, compress auto) — path นำเข้าที่ถูกคือ `krilla::embed::{EmbeddedFile, AssociationKind, MimeType}` + `krilla::metadata::DateTime` (`mod interchange` เป็น private)
  - veraPDF ภายนอก (`--flavour 3b`): **compliant=true — 146 rules / 1962 checks ผ่าน, failed 0**
  - feature report (`-x embeddedFile`): `fileName=invoice.xml`, `afRelationship=Data`, `description` + `modDate` ครบ, `size=467`
  - XML spike เป็นโครงสมมติ (มีภาษาไทยใน `<Note>`) **ไม่ใช่ ETDA 3-2560** — ของจริงทำ Phase 4 + ติดป้าย experimental
  - สำหรับ CI: veraPDF ต้องใช้ Java (ทดสอบด้วย Temurin 21) — ใส่ใน CI image ภายหลัง; veraPDF ติดตั้งแบบ CLI-only อัตโนมัติด้วย `verapdf-install.bat auto-install.xml` ได้

## 5. PAdES signing + verifier ภายนอก
- [x] crate ที่ใช้ + license: `underskrift 0.1.4` (BSD-2-Clause ✅ เข้า core ได้) — `pdf_signer 0.3.2` เป็น GPL-3.0 ⛔ ห้ามเข้า core
- [x] ตรวจผ่าน verifier (2026-10-14; กุญแจทดสอบ self-signed สร้างโดยเจ้าของเครื่อง TEST ONLY — private key ไม่ผ่านแชต/ไม่เข้า repo)
- ผล (`cargo run -p tr-etax --example spike_item5`, โค้ดอยู่ `tr-etax` ฝั่ง experimental + `underskrift` เป็นแค่ dev-dep):
  - เซ็นไฟล์ข้อ 4 แบบ PAdES invisible (`SubFilter::Pades`, RSA-2048) → `target/spike/spike-item5-signed.pdf` (46,359 bytes, +17,237)
  - verifier ในตัว (`SignatureVerifier`, trust = cert ทดสอบ): **VALID — PAdES B-B, integrity_ok, digest_matches, chain_trusted, covers_whole_document, summary "all 1 signatures valid and trusted"**
  - cross-check อิสระด้วย openssl: SHA256(ByteRange) ที่คำนวณเองตรงกับ `messageDigest` ใน CMS เป๊ะ (`2edd8f68…f2a9ac4`); CMS parse ผ่าน (`sha256WithRSAEncryption`, CN=ThaiReport Spike TEST ONLY)
  - veraPDF อ่านลายเซ็นได้ (`Filter=Adobe.PPKLite`, `SubFilter=ETSI.CAdES.detached`, reason/location ครบ)
  - ⚠️ ข้อจำกัดที่พบ: ไฟล์ที่เซ็นแล้ว**ตก PDF/A-3b 1 ข้อ** (veraPDF clause 6.1.3 — trailer ไม่มี `/ID`; ไฟล์ก่อนเซ็นผ่าน 146/146) — เกิดจาก incremental save ของ underskrift 0.1.4 ทำ trailer หล่น → งาน Phase 4: รักษา `/ID` ตอนเซ็น (file issue ต้นน้ำ/เสริม post-process) แล้ว re-validate หลังเซ็นทุกครั้ง
  - ยังไม่ได้ตรวจ: Adobe Acrobat (ไม่มีในเครื่องนี้) — เปิด `spike-item5-signed.pdf` ใน Acrobat/Chrome ดูแถบลายเซ็นเพิ่มได้

## 6. thai-break vs uniworld
| ตัว | ความแม่น (spike 2026-10-14) | ขนาด | license | WASM |
|---|---|---|---|---|
| thaibreak 1.4.0 (repo thai-break) | ตัดประโยคไทยได้จริง (24 คำในประโยคยาว) | โค้ด 150 KiB ในไบนารี release (cargo-bloat, 2026-10-14) — เบา; wasm รวม 2.12 MiB (ดิบ) | Apache-2.0 (cargo info) ✅ | ✅ คอมไพล์ลง wasm32 ผ่านด้วย default features (ไม่ต้องเปิด feature `wasm`); รันจริงใน Node ผ่าน |
| uniworld 0.2.0 | UAX #29 default ตัดไทยไม่ได้ (ประโยคไทยล้วนได้ 1 ชิ้น) — มีพจนานุกรม ICU 179k คำตาม README แต่ spike นี้เรียกแค่ `word_boundaries` อาจต้องเรียก `linebreak` + dictionary แยก | โค้ด 73 KiB ในไบนารี release — เล็กมาก | MIT (cargo info) ✅ | ✅ คอมไพล์ลง wasm32 ผ่าน (feature `wasm` ไม่ได้เปิด — เปิดเฉพาะตอนต้องการ bindings) |
- เลือก: `thaibreak` เป็นตัวหลักตัดคำไทย (รวมพจนานุกรมผู้ใช้ `extra_words` ที่พิสูจน์แล้วในข้อ 1 รอบ 3); `uniworld` เก็บไว้เสริม (bidi/normalization/width) — ทั้งคู่ license ผ่าน + ลง wasm ได้
- ขนาดไบนารี (cargo-bloat release, `spike_item4` pipeline, 2026-10-14): กองฟอนต์ครอง (~5 MiB: skrifa 1.7 + read_fonts 1.7 + write_fonts 1.6 — มี skrifa 3 เวอร์ชันซ้อน ควรรวมเวอร์ชันใน Phase 1); krilla 837 KiB; cosmic_text 319 KiB (+swash 570, harfrust 472, rustybuzz 330, regex ~500); **thaibreak 150 KiB; uniworld 73 KiB** — งาน Phase 1: รวมเวอร์ชัน skrifa + เปิด LTO/split-debuginfo คุมขนาด server binary (< 50 MB ตามสเปกข้อ 8)

## สรุป go/no-go
- [x] Go (ข้อ 1–3 ผ่าน) — ภาษาไทยถูก + WASM/native ตรงกัน; ข้อ 4 ผ่านเต็ม, ข้อ 5 ผ่านแบบมีข้อจำกัด (เซ็นได้/ตรวจผ่าน แต่ต้องแก้ trailer /ID ใน Phase 4), ข้อ 6 ตัดสินแล้ว (thaibreak หลัก)
- ความเสี่ยงค้างไป Phase 1/4: (1) พจนานุกรมหลักตัดบางคำพลาด → พจนานุกรมผู้ใช้ (พิสูจน์แล้ว), (2) underskrift 0.1.4 ยังใหม่ + ทำ PDF/A หล่น 1 ข้อ → re-validate หลังเซ็น + ตาม issue ต้นน้ำ, (3) wasm bundle 2.12 MiB (gzip ~845 KiB) ต้องคุมขนาดใน Phase 2, (4) ฟอนต์ OFL จริง + baseline เทียบตา + Acrobat ยังค้างตรวจด้วยคน
