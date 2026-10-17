# tr-mcp — MCP server ของ ThaiReport

ให้ AI client (Claude Code, Claude Desktop หรือ client MCP อื่น) สร้าง template ตรวจ ดูภาพตัวอย่าง และออก PDF ภาษาไทยได้เอง

## เริ่มใช้งาน

**จากไฟล์ release (ไม่ต้องมี Rust):** ดาวน์โหลด `thaireport-<เวอร์ชัน>-<แพลตฟอร์ม>` จากหน้า Releases แล้วแตกไฟล์
ในโฟลเดอร์มี `tr-mcp`, `thaireport` (CLI), `tr-server` (HTTP API), `fonts/`, `templates/` — `tr-mcp` หา `fonts/` และ
`templates/` ข้างตัวเองได้ จึงตั้งแค่ `TR_OUTPUT_DIR` (ที่เก็บ PDF) ก็พอ ใช้ path ของโฟลเดอร์ที่แตกไว้แทน path ของ repo ด้านล่าง

macOS: ไฟล์ยังไม่ได้ลงนาม (sign) ถ้าเปิดไม่ได้เพราะ "ไม่ทราบผู้พัฒนา" ให้รันครั้งเดียว
`xattr -dr com.apple.quarantine <โฟลเดอร์ที่แตกไว้>`

**จาก source:**

```bash
cargo build --release -p tr-mcp      # ได้ target/release/tr-mcp
```

### Claude Code

รันจากราก repo (ใช้ `fonts/` และ `templates/` ของ repo, PDF ออกที่ `out/`):

```bash
claude mcp add --transport stdio \
  --env TR_FONTS_DIR="$PWD/fonts" --env TR_TEMPLATES_DIR="$PWD/templates" --env TR_OUTPUT_DIR="$PWD/out" \
  thaireport -- "$PWD/target/release/tr-mcp"
```

### Claude Desktop / client อื่น (ไฟล์ตั้งค่า JSON)

```json
{
  "mcpServers": {
    "thaireport": {
      "command": "/path/to/Report-Thai/target/release/tr-mcp",
      "env": {
        "TR_FONTS_DIR": "/path/to/Report-Thai/fonts",
        "TR_TEMPLATES_DIR": "/path/to/Report-Thai/templates",
        "TR_OUTPUT_DIR": "/path/to/output"
      }
    }
  }
}
```

ใช้ path เต็มเสมอ เพราะ client ส่วนใหญ่ไม่ได้รันจากโฟลเดอร์ repo

ลองถาม AI เช่น: *"ทำใบเสนอราคาให้บริษัท ก. 3 รายการ ใส่ยอดรวมเป็นตัวอักษร แล้วออก PDF"*

## Tools

| tool | ทำอะไร |
|---|---|
| `get_template_guide` | คู่มือรูปแบบ template (band, element, `{{ }}`, ฟังก์ชันไทย, กลุ่ม) พร้อมตัวอย่างที่ใช้ได้จริง |
| `list_templates` | template ที่บันทึกไว้ (ชื่อ หัวเรื่อง ขนาดกระดาษ band มีข้อมูลตัวอย่างไหม) |
| `get_template` | JSON ของ template + ข้อมูลตัวอย่าง ไว้ใช้เป็นจุดเริ่ม |
| `validate_template` | ตรวจโครงสร้าง การจัดหน้า (เช่นข้อความล้นกรอบ) และฟิลด์ใน `{{ }}` ที่ไม่มีในข้อมูล |
| `preview_template` | ภาพ PNG ของหน้าที่ต้องการ ให้ AI ดูผลก่อนออกไฟล์ |
| `render_report` | เขียน PDF ลง `TR_OUTPUT_DIR` คืน path จำนวนหน้า และคำเตือน |
| `save_template` | บันทึก template (+ข้อมูลตัวอย่าง) ลง `TR_TEMPLATES_DIR` ไม่เขียนทับถ้าไม่สั่ง |

ทุก tool ที่รับ template รับได้ทั้ง `template_name` (ชื่อที่บันทึกไว้) หรือ `template` (JSON ทั้งก้อน)
ถ้าใช้ชื่อแล้วไม่ส่ง `data` จะใช้ไฟล์ `<ชื่อ>.data.json` คู่กัน

## ตัวแปรสภาพแวดล้อม

| ตัวแปร | ค่าเริ่มต้น | |
|---|---|---|
| `TR_FONTS_DIR` | `./fonts` ถ้ามี ไม่งั้น `fonts/` ข้างไฟล์โปรแกรม | ต้องมี `Sarabun-Regular.ttf` |
| `TR_TEMPLATES_DIR` | `./templates` ถ้ามี ไม่งั้น `templates/` ข้างไฟล์โปรแกรม | อ่าน/บันทึก template |
| `TR_OUTPUT_DIR` | `./out` | ที่เขียน PDF (สร้างให้ถ้ายังไม่มี) |

## ความปลอดภัย

- เขียนไฟล์ได้เฉพาะใน `TR_TEMPLATES_DIR` และ `TR_OUTPUT_DIR`; ชื่อไฟล์ต้องเป็น `[A-Za-z0-9._-]` ไม่มี `/` หรือ `..`
- template ที่ส่งมาเป็น JSON อ่านรูปจากดิสก์ไม่ได้ (ต้องฝังเป็น data URI); template ที่บันทึกไว้อ่านรูปสัมพัทธ์กับโฟลเดอร์ template
- คุยผ่าน stdio เท่านั้น (ไม่เปิดพอร์ตเครือข่าย)

## ทดสอบ

```bash
cargo test -p tr-mcp   # รันไบนารีจริงแล้วคุย JSON-RPC: คู่มือ → ตรวจ → PNG → PDF → บันทึก → เรียกด้วยชื่อ
```
