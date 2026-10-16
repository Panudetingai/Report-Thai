# Phase 3 report — Band, data binding, API

**สรุป: ยังไม่ผ่านเกณฑ์เต็ม** — ส่วนรายงานข้ามหลายหน้าและการจัดกลุ่มผ่านแล้ว แต่ยังไม่มีการเทียบ benchmark กับ Jasper
(เกณฑ์ตามสเปกต้องบันทึกตัวเลขจริงเทียบกับ Jasper) และยังมีรายการที่เลื่อนไว้ด้านล่าง

## 1. ผลเทียบ Acceptance Criteria (สเปก §7 Phase 3)

| เกณฑ์ | ผล |
|---|---|
| รายงานหลายร้อยแถวข้ามหลายหน้าตรงตามที่ออกแบบ | ✅ 300 แถวได้ 8 หน้า: 39 / 41×6 / 15 แถว ตรงกับเรขาคณิต A4 (`crates/tr-pdf/tests/phase3_paging.rs`) — ตรวจจากข้อความที่จัดลงแต่ละหน้า ไม่ใช่แค่จำนวนหน้า |
| benchmark เวลา/หน่วยความจำเทียบ Jasper บน use case เดียวกัน | ❌ **ยังไม่ทำ** — เครื่องนี้ไม่มี Java runtime (`java -version` ไม่ได้) จึงรัน Jasper ไม่ได้ ดูหัวข้อ 4 |
| Band ครบ | ⚠️ บางส่วน — band ทุกชนิดวางได้ จัดกลุ่มได้ชั้นเดียว; **ยังไม่รองรับ** กลุ่มซ้อนหลายชั้น และตารางใน band ที่จัดกลุ่ม |
| Page break | ✅ ตัดหน้าอัตโนมัติ หัวคอลัมน์ซ้ำทุกหน้า หัวกลุ่มไม่ตกท้ายหน้า (ตรวจด้วย mutation: ปิดกติกาแล้ว test ล้ม) |
| Group / subtotal | ✅ `groupBy` บน band หัวกลุ่ม; `sum/count/avg/min/max` และ `group.value/count` ใช้ได้ใน band หัวกลุ่ม ท้ายกลุ่ม และสรุป |
| SQL data source | ✅ SQLite ผ่าน sqlx (prepared statement, ไคลเอนต์ส่ง SQL เองไม่ได้) — **ยังไม่มี Postgres/MySQL** |
| HTTP API | ✅ `GET /health`, `GET /templates`, `POST /render` (JSON/PDF) — ทดสอบในโปรเซส 7 เคส และรันไบนารีจริงด้วย curl |
| Docker | ⚠️ เขียน `Dockerfile` + `.dockerignore` แล้ว **ยังไม่ได้ build** เพราะ Docker daemon ไม่ได้รันบนเครื่องนี้ |
| npm package | ✅ `@thaireport/node` (napi addon, `renderPdf` เป็น Promise ไม่บล็อก event loop) — ทดสอบ 5 เคสกับ addon จริง; **ยังไม่ publish** |

## 2. สิ่งที่ทำ (ตาม commit)

- `feat(engine): Phase 3 slice 1` — `groupBy`, `crates/tr-core/src/aggregate.rs` (รวมค่า + ปัดครึ่งขึ้น), แยก `paginate()`
  ออกจากการวาด, หัวกลุ่ม→แถว→ท้ายกลุ่ม, ตัวตรวจการออกแบบของ designer รู้จักการรวมค่า
- `feat(server): Phase 3 slice 2` — HTTP API และ Dockerfile
- `feat(server): Phase 3 slice 3` — SQL data source (SQLite)
- `feat(node): Phase 3 slice 4` — @thaireport/node
- ก่อนหน้านั้น (Phase 2 ที่ค้าง): แก้ parity ให้ WASM กับ native ได้ PDF ตรงกันทุกไบต์ (ดู phase-2-report หัวข้อ 4)

### การแก้ที่พบระหว่างทาง
- **การวัดความกว้างข้อความเพี้ยน (native เท่านั้น)** — cosmic-text บน native fallback ไปฟอนต์ Thonburi ของระบบ
  สำหรับอักขระที่ Sarabun ไม่มี ทำให้ข้อความจัดกึ่งกลางเพี้ยนราว 2pt เทียบ WASM แก้โดย `BundledOnlyFallback`
- **ตัวนับหน้าในพรีวิวเป็น 1 เสมอ** — นับ `/Type /Page` จากไบต์ PDF ที่ถูกบีบอัด แก้โดยให้ engine คืนจำนวนหน้าจาก layout
- **ตัวเลขรวมปัดผิด** — `format!` ของ Rust ปัดครึ่งเป็นเลขคู่ ใบเสร็จต้องปัดครึ่งขึ้น แก้ใน `format_number`
- **เทสต์ `preview-client` ค้าง** — `initThaireport` เป็น async จึงคืน promise คนละตัวทุกครั้ง แก้ให้คืน promise เดิม

## 3. การวัดผลที่มี (ไม่ใช่การเทียบ Jasper)

วัดด้วย `thaireport render` (release, macOS arm64, รันครั้งเดียว ไม่ได้ทำซ้ำหลายรอบ) ใช้ template รายงานกลุ่มเดียวกันทั้งสองขนาด
จำนวนหน้านับจาก `/Count` ของ PDF ที่ได้:

| ข้อมูล | เวลา (real) | หน่วยความจำสูงสุด (max RSS) | ขนาด PDF |
|---|---|---|---|
| 300 แถว, 12 กลุ่ม, 9 หน้า | 0.08 s | 13.3 MB | 27.7 KB |
| 3,000 แถว, 120 กลุ่ม, 81 หน้า | 0.74 s | 23.1 MB | 205 KB |

ตัวเลขนี้ใช้เฉพาะเปรียบเทียบเวอร์ชันของเราเอง ห้ามอ้างเทียบ Jasper

## 4. ทำไม benchmark กับ Jasper ยังไม่ได้ทำ

- เครื่องนี้มี `/usr/bin/java` แต่เป็นตัวเรียกที่ไม่มี runtime จริง (`Unable to locate a Java Runtime`)
- Jasper ต้องใช้ JRE/JDK และ jar ของ JasperReports (จาก Maven) ซึ่งยังไม่ได้ติดตั้ง
- ต้องมีการตัดสินใจก่อน: ให้ติดตั้ง OpenJDK ผ่าน Homebrew และดาวน์โหลด JasperReports หรือไม่ (เป็นการเปลี่ยนแปลงระบบ จึงไม่ได้ทำเอง)

## 5. ข้อจำกัดที่รู้แล้ว (ค้างไว้)

- **กลุ่มต้องเรียงข้อมูลมาก่อน** — แถวที่ค่าเหมือนกันติดกันคือกลุ่มเดียวกัน ไม่เรียงให้เอง (เหมือน Jasper)
- **กลุ่มชั้นเดียว** — ยังไม่รองรับกลุ่มซ้อนและหลาย group header
- **ตารางใน band ที่จัดกลุ่ม** — engine คืน error ชัดเจน (ยังไม่รองรับ)
- **การรวมค่าใช้ f64** — เหมาะกับยอดทั่วไป แต่สำหรับบัญชีที่ต้องถูกทุกสตางค์ในหลักล้านควรเปลี่ยนเป็นทศนิยมแบบ fixed-point (เช่น crate `rust_decimal`, MIT)
- **sources** — มีแค่ SQLite; Postgres/MySQL ต้องเพิ่ม feature ของ sqlx และทดสอบกับฐานจริง
- **HTTP API** — ยังไม่มี auth, rate limit, timeout ต่อคำขอ ต้องวางหลัง reverse proxy
- **Docker** — ยังไม่ได้ build และยังไม่ได้ทดสอบ container
- **designer** — ช่อง "จัดกลุ่มตาม" มีแล้ว แต่ยังไม่แสดงกลุ่มในพรีวิวบนกระดาษออกแบบ (ดูผลจริงที่แท็บพรีวิว PDF)

## 6. `[VERIFY]` และ license

- dependency ใหม่ทั้งหมดเป็น MIT หรือ MIT/Apache-2.0 (บันทึกใน `docs/licenses.md` แล้ว) ไม่มี GPL เข้า core
- SQLite ที่ bundle ใน `libsqlite3-sys` เป็น public domain
- ไม่มีรายการ `[VERIFY]` ใหม่ในเฟสนี้

## 7. คำถามที่ต้องให้เจ้าของโปรเจกต์ตัดสินใจ

1. **Jasper benchmark:** อนุญาตให้ติดตั้ง OpenJDK ผ่าน Homebrew และดาวน์โหลด JasperReports หรือไม่ (ถ้าไม่ เกณฑ์ข้อนี้จะค้างจนกว่าจะมีเครื่องที่มี Java)
2. **ฐานข้อมูลถัดไป:** ควรเพิ่ม Postgres หรือ MySQL ก่อน (ขึ้นกับลูกค้าที่ใช้อยู่)
3. **กลุ่มซ้อนและตารางในกลุ่ม:** จำเป็นต้องมีใน Phase 3 หรือเลื่อนไป Phase ถัดไป
4. **ความแม่นยำของเงิน:** เปลี่ยนการรวมค่าเป็นทศนิยมแบบ fixed-point ตั้งแต่ตอนนี้หรือไม่ (แนะนำ: ใช่ ก่อนมีใครใช้กับเอกสารภาษีจริง)
5. **Docker:** เปิด Docker Desktop บนเครื่องนี้เพื่อให้ผมทดสอบ build ได้ หรือจะตรวจบนเครื่องอื่น
