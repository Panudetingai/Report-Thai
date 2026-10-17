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
| axum 0.7.9, tokio 1.53.3, tower 0.5.3, http-body-util 0.1.5 (Phase 3, tr-server) | MIT | OK (2026-10-16, cargo metadata) |
| sqlx 0.8.6 + sqlx-sqlite (Phase 3, tr-server, feature sqlite) | MIT OR Apache-2.0 | OK (2026-10-16, cargo metadata) |
| libsqlite3-sys 0.30.1 (ตัว SQLite ที่ bundle มา) | MIT (ตัว SQLite เป็น public domain) | OK (2026-10-16) |
| napi 2.16.17, napi-derive 2.16.13, napi-build 2.6.0 (Phase 3, tr-node) | MIT | OK (2026-10-16, cargo metadata) |
| rust_decimal 1.43.0 (tr-core, รวมยอดเงินทศนิยมตายตัว) | MIT | OK (2026-10-17, cargo metadata) |
| rmcp 3.5.1 + rmcp-macros 3.5.1 (tr-mcp, MCP SDK ทางการ) | Apache-2.0 | OK (2026-10-17, cargo metadata) — เข้ากันได้กับ MIT |
| schemars 1.2.3 (tr-mcp, schema ของ tool) | MIT | OK (2026-10-17) |
| hayro 0.8.0 + hayro-interpret/hayro-syntax 0.8.0, vello_cpu 0.3.0 (tr-mcp, PDF → PNG สำหรับ preview) | Apache-2.0 OR MIT | OK (2026-10-17, cargo metadata) |
| self_cell 1.3.0 (มีอยู่เดิม ผ่าน cosmic-text) | Apache-2.0 OR GPL-2.0-only | OK — ใช้ภายใต้ Apache-2.0 (ตรวจ 2026-10-17 ตอน audit ทั้ง tree ของ tr-mcp) |
| underskrift / pdf_signer | ห้ามรวมถ้าเป็น GPL | ต้องตรวจ Phase 0 ข้อ 5 |

> ถ้าพบ GPL/AGPL ให้หยุดและรายงาน ห้ามใส่ใน core (spec ข้อ 0.5)
> ฟอนต์ใน `fonts/`: อนุญาตเฉพาะ OFL ตรวจทุกตัวก่อนแจก
