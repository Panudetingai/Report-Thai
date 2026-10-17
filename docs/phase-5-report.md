# Phase 5 report — MCP (บางส่วน)

**สรุป: ส่วน MCP ผ่าน** — เจ้าของทดสอบกับ Claude จริงแล้ว (2026-10-17) AI ออกแบบรายงานเองจนได้ PDF
QR/Barcode และ PromptPay ยังไม่เริ่ม

> **ลำดับเฟส:** เจ้าของสั่งให้ทำ MCP ต่อจาก Phase 3 จึงข้าม Phase 4 (e-Tax, experimental) ไปก่อน
> Phase 4 ยังไม่ได้เริ่ม

## 1. ผลเทียบ Acceptance Criteria (สเปก §7 Phase 5)

| เกณฑ์ | ผล |
|---|---|
| MCP ใช้กับ AI client ได้จริงตั้งแต่สร้าง template ถึงได้ PDF | ✅ เจ้าของทดสอบผ่าน AI client บนเครื่อง (connector แบบ command, stdio): AI ออกแบบ "รายงานโครงการ" จากรูปตัวอย่าง → render_report → save_template ได้ PDF ถูกต้อง · เทสต์อัตโนมัติคุย JSON-RPC กับไบนารีจริงครบเส้นทาง |
| tools ตามสเปก 4.4: `render_report`, `list_templates`, `validate_template`, `preview_template` (PNG) | ✅ ครบ + เพิ่ม `get_template_guide`, `get_template`, `save_template` ให้ AI สร้าง/แก้/บันทึกเองได้ |
| ฟังก์ชันไทยครบ | ⚠️ ใน template ใช้ได้แล้ว: `bahttext`, `thaidate`, `thaidigits`, `number` · ยังไม่มี: ตรวจเลขผู้เสียภาษีในเทมเพลต (มีใน `tr-thai` แล้วแต่ยังไม่เปิดเป็นฟังก์ชัน) |
| QR / Barcode | ❌ ยังไม่เริ่ม |
| PromptPay QR สแกนผ่านแอปธนาคารจริง | ❌ ยังไม่เริ่ม (`[VERIFY]` สเปก EMVCo + ทดลองสแกนจริง) |

## 2. สิ่งที่ทำ

- `crates/tr-mcp` — MCP server (stdio) ด้วย `rmcp` 3.5 (SDK ทางการ)
  - `lib.rs` งานจริงของแต่ละ tool ไม่ขึ้นกับ MCP · `server.rs` ผูกกับโปรโตคอล งานจัดหน้า/เรนเดอร์รันใน blocking pool
  - ข้อผิดพลาดจากข้อมูลของผู้ใช้คืนเป็นผล `isError` พร้อมข้อความที่บอกวิธีแก้ (AI อ่านแล้วแก้เองได้)
  - `preview_template` แปลง PDF เป็น PNG ด้วย `hayro` (pure Rust ใช้ฟอนต์ที่ฝังใน PDF — ภาพตรงกับไฟล์จริง สระ/วรรณยุกต์ไทยถูก)
  - คู่มือ template (`src/guide.md`) ส่งให้ AI ผ่าน `get_template_guide` และ instructions ของ server
    ตัวอย่างในคู่มือถูกเทสต์ว่าตรวจผ่านไม่มีคำเตือนและออก PDF ได้จริง
- `tr_core::check::check_bindings` — ตรวจฟิลด์ใน `{{ }}` กับข้อมูล (ใช้ทั้ง MCP และ CLI)

## 3. การทดสอบ

`cargo test -p tr-mcp` (รันไบนารี `tr-mcp` จริง):
- เส้นทางเต็ม: tools/list (7 tools) → อ่านคู่มือ → validate (ok, ไม่มีคำเตือน, 1 หน้า) → preview (PNG 595×842 ที่ 72 dpi) →
  render (ไฟล์ %PDF) → save_template → list เห็น → render ด้วยชื่อโดยใช้ข้อมูลตัวอย่าง → ไม่เขียนทับถ้าไม่สั่ง
- template ทุกตัวใน `templates/` ตรวจผ่านโดยไม่มีคำเตือนและพรีวิวได้
- กันชื่อไฟล์อันตราย (`../evil`, `/tmp/x`, `a/b`) ทั้งตอนเขียน PDF และบันทึก template
- ฟิลด์สะกดผิดได้คำเตือนที่ชี้ชื่อฟิลด์ · ข้อความล้นกรอบ (`overflow: error`) เป็น error

ตรวจตาเองแล้ว: ภาพ PNG ของ `receipt.json` จาก `preview_template` ตรงกับ PDF

### สิ่งที่พบจากการทดสอบกับ AI จริง (แก้แล้ว)

- **client ส่ง `sample_data` เป็นข้อความ JSON** แทน object → `save_template` บันทึกเป็นข้อความ เรียกด้วยชื่อทีหลังได้หน้าว่าง
  แก้: แปลงข้อความ JSON เป็น object ทั้งตอนบันทึกและตอนอ่าน (ไฟล์ที่บันทึกผิดไว้แล้วก็อ่านได้) + เทสต์
- **AI ใช้ `detail` + ข้อมูลหลอก 1 แถว แทน "ส่วนเนื้อหา"** เพราะคู่มือไม่ได้บอกเรื่อง band `section` — เพิ่มหัวข้อ *Documents*
  ในคู่มือ (ทุกข้อที่อ้างถูกเทสต์: เรียงตามลำดับ, `grow` ดันส่วนถัดไปลง, ขึ้นหน้าใหม่, ช่องว่างเยื้องบรรทัดแรกคงไว้)
  และ designer เรียง `section` ร่วมกับ `detail` ไม่ย้ายไปท้ายเอกสาร
- AI ต้องคัดลอก PDF จาก `TR_OUTPUT_DIR` ไปโฟลเดอร์ของผู้ใช้เอง (ใช้ bash) — ยังไม่แก้ ดูข้อ 4

## 4. ขั้นต่อไปที่ต้องให้เจ้าของทำ/ตัดสินใจ

1. **ที่เก็บ PDF:** ให้ `render_report` เขียนนอก `TR_OUTPUT_DIR` ได้ไหม (สะดวกขึ้นแต่ AI เขียนไฟล์ได้กว้างขึ้น)
   ทางกลาง: ตั้ง `TR_OUTPUT_DIR` เป็นโฟลเดอร์ที่ใช้งานจริง เช่น `~/Documents/Reports`
2. **PromptPay / QR:** เริ่มต่อเลยไหม — ต้องมีโทรศัพท์ + แอปธนาคารสำหรับสแกนทดสอบ
3. **Phase 4 (e-Tax):** จะกลับไปทำก่อน QR หรือไม่
4. **MCP ผ่าน HTTP** (ให้หลายคนใช้ server เดียว): ตอนนี้ stdio อย่างเดียว ถ้าต้องการต้องคิดเรื่อง auth ก่อน

## 5. License

dependency ใหม่: rmcp (Apache-2.0), schemars (MIT), hayro/vello_cpu (Apache-2.0 OR MIT), rust_decimal (MIT)
audit ทั้ง tree ของ tr-mcp แล้ว ไม่มี GPL เข้ามา (มี self_cell ที่เป็น Apache-2.0 OR GPL-2.0 อยู่เดิม ใช้แบบ Apache) — บันทึกใน `docs/licenses.md`
