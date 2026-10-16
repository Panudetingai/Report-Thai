# licenses

License กลางของโปรเจกต์: **MIT** (`LICENSE-MIT`, ตัดสิน 2026-10-14 ตามคำตอบเจ้าของ —
สเปก 6.4 ให้เลือก MIT หรือ Apache-2.0 อย่างใดอย่างหนึ่งก่อน v0.1)

บันทึก license ของ dependency และฟอนต์ (MIT/OFL เท่านั้นใน core)

| ตัว | license | สถานะ |
|---|---|---|
| serde / serde_json | MIT/Apache-2.0 | OK |
| clap | MIT/Apache-2.0 | OK |
| axum / tokio | MIT | OK |
| wasm-bindgen | MIT/Apache-2.0 | OK |
| napi-rs | MIT | OK |
| krilla 0.8.2 | MIT OR Apache-2.0 | OK (2026-10-14, cargo info + docs.rs) |
| cosmic-text 0.19.0 (+ harfrust/swash/fontdb) | MIT OR Apache-2.0 | OK (2026-10-14) |
| thaibreak 1.4.0 (repo thai-break) | Apache-2.0 | OK (2026-10-14) |
| uniworld 0.2.0 | MIT | OK (2026-10-14) |
| fontdb 0.23.0 (direct, ปัก family ตอนวัดกว้าง) | MIT | OK (2026-10-14, cargo info) |
| wasm-bindgen 0.2 | MIT/Apache-2.0 | OK |
| underskrift 0.1.4 (spike ข้อ 5, dev-dep ของ tr-etax) | BSD-2-Clause | OK (2026-10-14, cargo info) — permissive เข้า core ได้ |
| pdf_signer 0.3.2 | GPL-3.0-or-later | ⛔ ห้ามเข้า core (MIT/Apache) — ใช้ได้แค่โปรเซสแยกภายนอกเท่านั้น |
| base64 0.22 (tr-pdf, ถอดภาพ data URL) | MIT/Apache-2.0 | OK (2026-10-14) — เข้ากันได้กับ MIT |
| ttf-parser 0.25 (tr-text, ตรวจ glyph coverage/.notdef) | MIT/Apache-2.0 | OK (2026-10-14) — เข้ากันได้กับ MIT |
| Sarabun Regular/Bold (fonts/, google/fonts ofl/sarabun) | OFL 1.1 | OK (2026-10-14, หัว OFL.txt: Sarabun Project 2018) — แจกต่อได้ |
| Sarabun Light (fonts/Sarabun-Light.ttf, google/fonts ofl/sarabun) | OFL 1.1 | OK (2026-10-14, หัว OFL.txt: Sarabun Project 2018) — แจกต่อได้ |
| Noto Sans Thai Variable (fonts/, google/fonts ofl/notosansthai) | OFL 1.1 | OK (2026-10-14, หัว OFL.txt: Noto Project 2022) — แจกต่อได้ |
| tailwindcss 4.3.3 + @tailwindcss/vite 4.3.3 (packages/designer, devDep) | MIT | OK (2026-10-15, node_modules/*/package.json) |
| class-variance-authority 0.7.1 (designer UI) | Apache-2.0 | OK (2026-10-15) — เข้ากันได้กับ MIT |
| clsx 2.1.1, tailwind-merge 3.7.0 (designer UI) | MIT | OK (2026-10-15) |
| shadcn/ui pattern (`packages/designer/src/components/ui/button.jsx` เขียนเองตามรูปแบบ shadcn ไม่ได้ติดตั้ง package) | MIT (แนวทาง shadcn/ui) | OK (2026-10-15) — ถ้าคัดลอก source จริงของ shadcn มาเพิ่ม ให้ใส่ attribution MIT ด้วย |
| underskrift / pdf_signer | ห้ามรวมถ้าเป็น GPL | ต้องตรวจ Phase 0 ข้อ 5 |

> ถ้าพบ GPL/AGPL ให้หยุดและรายงาน ห้ามใส่ใน core (spec ข้อ 0.5)
> ฟอนต์ใน `fonts/`: อนุญาตเฉพาะ OFL ตรวจทุกตัวก่อนแจก
