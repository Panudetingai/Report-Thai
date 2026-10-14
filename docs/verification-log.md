# verification-log

บันทึกผลตรวจ `[VERIFY]` จากแหล่งทางการ/ทดลองจริง

| วันที่ | หัวข้อ | แหล่ง | ผล | หมายเหตุ |
|---|---|---|---|---|
| 2026-10-14 | krilla เวอร์ชัน+license | docs.rs/crate/krilla 0.8.2 + GitHub LaurenzV/krilla + cargo info | MIT OR Apache-2.0, MSRV 1.92, validated PDF/A-1..4 + PDF/UA-1, ไม่มี digital signature ในตัว (out-of-scope) ✅ | ตรงกับสเปกข้อ 5.2; toolchain เรา 1.99 ผ่าน |
| 2026-10-14 | cosmic-text เวอร์ชัน+license | docs.rs/crate/cosmic-text 0.19.0 + cargo info | MIT OR Apache-2.0, shaping ผ่าน HarfRust + swash ✅ | API 0.19 เปลี่ยน (`set_text`/`set_size` ไม่รับ font_system แล้ว) — โค้ด spike แก้แล้ว |
| 2026-10-14 | thaibreak (ชื่อที่ถูก) เวอร์ชัน+license | cargo info thaibreak 1.4.0 + docs.rs/thaibreak + repo kamthorn/thai-break | Apache-2.0, มี embedded-dict + features wasm/c-ffi/python/typst-plugin ✅ | ชื่อ crate คือ `thaibreak` ไม่ใช่ `thai-break`; `words()` คืน Vec<String>, `lines(text, marker, is_html)` |
| 2026-10-14 | uniworld เวอร์ชัน+license | docs.rs/crate/uniworld 0.2.0 + cargo info | MIT, UCD 17.0 conformance, มี feature wasm ✅ | spike นี้ `word_boundaries` ตัดไทยไม่ได้ — ต้องทดสอบ `linebreak` + dictionary ต่อในข้อ 6 |
| 2026-10-14 | thai-break vs uniworld (เทียบ) | spike ข้อ 1 + ข้อ 3 (WASM รันได้ทั้งคู่) | thaibreak ตัดได้จริง / uniworld default ตัดไทยไม่ได้ → เลือก thaibreak หลัก (ดู spike-report ข้อ 6) | ขนาดเดี่ยวราย crate รอ twiggy/cargo-bloat Phase 1 |
| 2026-10-14 | WASM build shaping+layout (ข้อ 2) | `cargo build -p tr-wasm --target wasm32-unknown-unknown` + `wasm-pack build` (nodejs+web) + รันใน Node 18 ผ่าน | ผ่าน — wasm 2.12 MiB (gzip ~845 KiB); demo browser ที่ `crates/tr-wasm/demo-spike2.html` |
| 2026-10-14 | WASM/native parity (ข้อ 3) | `dump_parity` vs `node parity-wasm.mjs` (9 บรรทัด/11 visual lines) | ตรงกัน exact string + widths ±0.01 ✅ |
| 2026-10-14 | fontdb เวอร์ชัน+license | cargo info fontdb 0.23.0 | MIT ✅ |
| 2026-10-14 | ฟอนต์ OFL ชุดแรก (Phase 1) | หัวไฟล์ OFL.txt ทั้ง 2 ชุด (Sarabun Project 2018 / Noto Project 2022) + google/fonts สาขา main | OFL 1.1 ทั้งคู่ ✅ ไฟล์ใน `fonts/` (Sarabun R/B + NotoSansThai Variable) |
| 2026-10-14 | License กลาง (สเปก 6.4) | คำตอบเจ้าของโปรเจกต์ (MIT) | เลือก **MIT** — `LICENSE-MIT` + `Cargo.toml` workspace `license = "MIT"` |
| | PromptPay EMVCo + CRC16 | | ยังไม่ตรวจ | ต้องสแกนแอปธนาคารจริง |
| 2026-10-14 | krilla ฝัง XML ใน PDF/A-3 | spike_item4 + veraPDF 1.30.3 (`--flavour 3b` compliant, 146 rules/1962 checks) + feature report (`invoice.xml`, AF=Data) | ผ่าน ✅ — XML spike เป็นโครงสมมติ ไม่ใช่ ETDA 3-2560 (ของจริง Phase 4) |
| 2026-10-14 | PAdES crate license | cargo info underskrift 0.1.4 (BSD-2 ✅) / pdf_signer 0.3.2 (GPL-3 ⛔) | underskrift เข้า core ได้; pdf_signer ห้ามเข้า core (ได้แค่โปรเซสแยก) |
| 2026-10-14 | PAdES sign+verify (ข้อ 5) | spike_item5 (underskrift verify VALID B-B) + openssl cross-check (digest ตรง) + veraPDF (Sig parse ได้; PDF/A-3b ตก 1 ข้อ trailer /ID) | ผ่านแบบมีข้อจำกัด — Phase 4 ต้องรักษา /ID + ตรวจ Acrobat |
| | ETDA 3-2560 XML schema | | ยังไม่ตรวจ | Phase 4 |
| | 50 ทวิ รูปแบบปัจจุบัน | | ยังไม่ตรวจ | หัวข้อ 6.1 |
