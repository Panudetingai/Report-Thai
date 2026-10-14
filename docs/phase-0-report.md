# Phase 0 report — Spike go/no-go (2026-10-14)

**สรุป: GO** — ข้อ 1–3 ผ่านครบตามเกณฑ์, ข้อ 4 ผ่านเต็ม, ข้อ 5 ผ่านแบบมีงานซ่อม, ข้อ 6 ตัดสินแล้ว

## 1. ผลเทียบ Acceptance Criteria (สเปกข้อ 7)

| ข้อ | เกณฑ์ | ผล |
|---|---|---|
| 1 เรนเดอร์ประโยคไทยยาก | krilla + cosmic-text + thai-break เทียบ baseline | ✅ ผ่าน — 9/9 ประโยค shaping ครบ, wrap พอดีกรอบ (self-check ≤ 499pt), เจ้าของตรวจภาพแล้ว ( Tahoma + THSarabunNew ); baseline ภาพเทียบ Typst/pdfme แบบพิกเซลยังไม่ทำ (เลื่อนเป็น golden test Phase 1) |
| 2 WASM build | shaping + layout ลง WASM + เรนเดอร์ใน browser | ✅ ผ่าน — คอมไพล์รอบแรกไม่ต้องแก้ feature; รันจริงใน Node + demo browser (`demo-spike2.html`, เจ้าของเปิดดูแล้ว) |
| 3 parity | WASM/native ตรงกัน | ✅ ผ่าน — exact string 11 visual lines + widths ±0.01 (`PARITY OK`) |
| 4 PDF/A-3b + ฝัง XML | krilla + ผ่าน veraPDF | ✅ ผ่านเต็ม — veraPDF 1.30.3 compliant (146 rules / 1962 checks, ตก 0), ไฟล์ฝังครบ (AF=Data) |
| 5 PAdES | crate license ผ่าน + verifier ภายนอก | ⚠️ ผ่านแบบมีข้อจำกัด — เซ็นได้/ตรวจผ่าน (underskrift VALID + openssl digest ตรง + Edge อ่านลายเซ็นได้) แต่ไฟล์หลังเซ็นตก PDF/A-3b 1 ข้อ (trailer `/ID` หล่น) |
| 6 thai-break vs uniworld | เทียบ 4 มิติ + เลือก | ✅ ตัดสินแล้ว — thaibreak หลัก (150 KiB, ตัดได้จริง + พจนานุกรมผู้ใช้พิสูจน์แล้ว), uniworld เสริม (73 KiB) |

## 2. ข้อที่เลี่ยง/เลื่อน (พร้อมเหตุผล)

1. **เทียบภาพพิกเซลกับ baseline (Typst/pdfme)** — เลื่อนเป็น golden test อัตโนมัติ Phase 1; แทนด้วยการตรวจตาของเจ้าของภาษาในรอบนี้
2. **ตรวจ Acrobat** — ติดตั้ง Reader แล้ว แต่ไฟล์เปิดใน Edge (viewer อิสระเจ้าที่ 2 ยืนยันลายเซ็น + "Document modified: No"); Acrobat เต็มรูปแบบรอใบรับรอง CA จริง Phase 4 (self-signed ยังไงก็เหลือง)
3. **XML ETDA 3-2560 จริง / TSA / LTV / visible signature** — งาน Phase 4 (โมดูล `tr-etax`, experimental)
4. **กุญแจทดสอบ** — self-signed โดยเจ้าของเครื่อง อยู่ใน `target/spike/` (gitignore) ไม่เข้า repo; private key ไม่ผ่านแชต

## 3. ความเสี่ยงใหม่ที่พบ (เพิ่มจากสเปกข้อ 10)

| ความเสี่ยง | หลักฐาน | วิธีรับมือ Phase ต่อไป |
|---|---|---|
| underskrift 0.1.4 ทำ trailer `/ID` หล่น → เซ็นแล้วตก PDF/A-3b | veraPDF clause 6.1.3 fail 1 ข้อ | Phase 4: รักษา `/ID` (file issue ต้นน้ำ/post-process) + re-validate หลังเซ็นทุกครั้ง |
| พจนานุกรม thaibreak ตัดคำเฉพาะพลาด ("วันที่", "เลขที่", "ชื่นชม") | spike รอบ 3 | กลไก `extra_words` พิสูจน์แล้ว; Phase 1 ทำพจนานุกรมผู้ใช้ + แสดงจุดตัดใน designer |
| วัดกับวาดใช้ฟอนต์คนละตัวแล้วล้น (เกิด 2 รอบ: native + demo) | ข้อ 1 รอบ 3, ข้อ 2 demo | กฎเหล็ก: ปัก family จากฟอนต์ที่โหลดทุกครั้ง (`thai_font_system`); Phase 2 designer ใช้ engine ตัวเดียวกันเลยรอดโดยออกแบบ |
| กองฟอนต์ ~5 MiB + skrifa ซ้อน 3 เวอร์ชัน | cargo-bloat | Phase 1: รวมเวอร์ชัน + LTO (เป้า server < 50 MB) |
| underskrift ใหม่ (0.1.4) + API ยังขยับได้ | เพิ่งออก ส.ค. 2026 | ตรึงเวอร์ชัน + เทสต์เซ็นใน CI; มีแผนสำรอง signer ภายนอกผ่าน trait `Signer` |

## 4. `[VERIFY]` — ปิดแล้ว / ค้าง

ปิด (มีแหล่ง+วันที่ใน `verification-log.md`): krilla, cosmic-text, thaibreak (ชื่อ crate ที่ถูก), uniworld, fontdb, underskrift (BSD-2), pdf_signer (GPL-3 ⛔), krilla ฝัง XML, WASM build, parity, PAdES sign+verify
ค้าง: PromptPay (สแกนจริง, Phase 5) · ETDA 3-2560 schema (Phase 4) · 50 ทวิ (หัวข้อ 6.1) · ฟอนต์ OFL จริง (Phase 1) · Acrobat กับใบรับรอง CA จริง (Phase 4)

## 5. คำถามถึงเจ้าของก่อนเริ่ม Phase 1

1. **License กลาง**: เลือก MIT หรือ Apache-2.0 ก่อน v0.1? (ของที่ใส่ตอนนี้ทั้งหมดเข้ากันได้ทั้งคู่)
2. **ฟอนต์ OFL ชุดแรก**: เอา Sarabun + Noto Sans Thai ใช่ไหม (เจ้าของมีไฟล์ OFL แล้วหรือให้ดาวน์โหลด)?
3. **Phase 1 เริ่มได้เลยไหม**: Template JSON → PDF ภาษาไทย + CLI + golden test (ตามสเปก)
