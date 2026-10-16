# Phase 2 report — WASM + Designer ขั้นต้น (2026-10-14)

**สรุป: ผ่านเกณฑ์** — engine เดียวกันเรนเดอร์ใน browser ได้, designer วาง element + import/export JSON,
พรีวิว WASM เทียบ PDF native ตรงใน tolerance สำหรับ template ตัวอย่าง 3 ฉบับ

## 1. ผลเทียบ Acceptance Criteria (สเปก Phase 2)

| เกณฑ์ | ผล |
|---|---|
| วาง text / image / line / rect / table | ✅ `@thaireport/designer` — toolbar เพิ่ม element ใน band ที่เลือก, ลากตำแหน่ง, แก้ x/y/w/h และ text/overflow |
| พรีวิวสดด้วย WASM (ไม่ใช้ DOM text วาดเนื้อหา) | ✅ `@thaireport/client` → `tr-wasm` `render_template_pdf` / `preview_template`; canvas วาดจาก PDF ผ่าน pdf.js |
| import / export JSON | ✅ ปุ่ม Export + Import ไฟล์ template |
| ภาพพรีวิว ≈ PDF server ใน tolerance (template ตัวอย่างทุกฉบับ) | ✅ `node crates/tr-wasm/render-parity.mjs` — invoice-full, quotation, receipt: **PDF bytes ตรงกันทุกไบต์** (WASM = native) |

## 2. สิ่งที่ทำ

1. **`tr-wasm` (Phase 2 เต็ม)**
   - ฝังฟอนต์ OFL ใน WASM (`include_bytes!` จาก `fonts/`)
   - `render_template_pdf`, `preview_template`, `validate_template` — เรียก `tr_pdf::render_template` ชุดเดียวกับ CLI
   - build: `scripts/build-wasm.sh` → `pkg-web` (browser) + `pkg-node` (parity)
2. **`@thaireport/client`** — init WASM, `renderPdf`, `previewTemplate`, `validateTemplate`
3. **`@thaireport/designer`** — Vite + React, `<ReportDesigner />`, โหลด template ตัวอย่าง 3 ฉบับ, band editor + พรีวิว (UI ด้วย shadcn/ui + Tailwind)
4. **ทดสอบ**
   - `crates/tr-wasm/render-parity.mjs` — native CLI vs WASM + pdf.js raster
   - `crates/tr-pdf/tests/wasm_parity_phase2.rs` — deterministic native + `#[ignore]` สำหรับ node parity

## 3. วิธีรัน (เครื่องพ разработ)

```bash
# macOS: ถ้า rustup ค้าง channel Windows ให้ตั้งก่อน
export RUSTUP_TOOLCHAIN=stable-aarch64-apple-darwin   # ปรับตาม host

./scripts/build-wasm.sh
RUSTUP_TOOLCHAIN=stable-aarch64-apple-darwin node crates/tr-wasm/render-parity.mjs

cd packages/designer && npm install && npm run dev
# เปิด http://localhost:5173
```

## 4. ข้อที่เลี่ยง / ความเสี่ยง

| หัวข้อ | เหตุผล |
|---|---|
| การวัดความกว้างข้อความ (แก้แล้ว) | native เคยดึงฟอนต์สำรองของระบบ (Thonburi) มาวัดอักขระที่ Sarabun ไม่มี ทำให้ข้อความจัดกึ่งกลาง/ชิดขวาเพี้ยนราว 2pt เทียบ WASM — แก้โดยวัดด้วยฟอนต์ที่ฝังในเอกสารเท่านั้น (`tr-text` `BundledOnlyFallback`) |
| ตัวนับหน้าในพรีวิว (แก้แล้ว) | เดิมนับ `/Type /Page` จากไบต์ PDF แต่ object ถูกบีบอัด จึงได้ 1 เสมอ — ตอนนี้ engine คืนจำนวนหน้าจาก layout (`render_template_counted`) |
| Designer ยังไม่มี undo/redo, snap, band ลากแบ่ง, data panel | อยู่ใน spec 4.3 เต็มรูป — Phase 2 ขั้นต้นตามสเปก §7 |
| ขนาด WASM bundle | release ~12 KiB JS glue + wasm ~หลาย MB (wasm-opt); บันทึกใน CI ภายหลัง |
| `FontSystem` pool + wasm | parity ผ่าน; ถ้า multi-thread ในอนาคตต้องทบทวน |

## 5. `[VERIFY]` ค้างเดิม

PromptPay, ETDA, 50 ทวิ, e-Tax — ตาม Phase 4–6

## 6. คำถามถึงเจ้าของก่อน Phase 3

1. Designer โฮสต์แยก repo/npm หรือ embed ใน monorepo ต่อไป?
2. ยอมรับเกณฑ์ parity แบบ **raster 0.2%** แทน byte-identical PDF ระหว่าง WASM/native ไหม?
3. เริ่ม Phase 3 (Band เต็ม, API, Docker, npm native) ได้เลยไหม?
