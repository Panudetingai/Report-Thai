# tr-server — HTTP API ของ ThaiReport

เซิร์ฟเวอร์เดียว ส่ง template + ข้อมูลเข้ามา ได้ PDF กลับไป

## เริ่มใช้งาน (3 ขั้น)

```bash
cargo run --release -p tr-server     # ฟังที่ http://127.0.0.1:8080
curl http://127.0.0.1:8080/health    # {"ok":true,"version":"0.1.0"}
```

ค่าเริ่มต้นอ่านฟอนต์จาก `./fonts` ถ้ารันจากราก repo ไม่ต้องตั้งค่าอะไรเพิ่ม

## เรนเดอร์ PDF

ส่ง template ตรง ๆ:

```bash
curl -X POST http://127.0.0.1:8080/render \
  -H 'Content-Type: application/json' \
  -d "{\"template\": $(cat templates/receipt.json), \"data\": $(cat templates/receipt.data.json)}" \
  -o receipt.pdf
```

หรือเรียกชื่อ template ที่ตั้งโฟลเดอร์ไว้ (ดูรายชื่อได้จาก `GET /templates`):

```bash
TR_TEMPLATES_DIR=templates cargo run --release -p tr-server
curl http://127.0.0.1:8080/templates
curl -X POST http://127.0.0.1:8080/render -H 'Content-Type: application/json' \
  -d "{\"templateName\": \"receipt.json\", \"data\": $(cat templates/receipt.data.json)}" -o receipt.pdf
```

ถ้ามีข้อผิดพลาด ตอบเป็น JSON `{ "ok": false, "error": "…" }` พร้อมสถานะ 400/404/413/422

## ดึงข้อมูลจากฐานข้อมูล (SQLite)

ผู้ดูแลเขียนคิวรีเป็นไฟล์ `.sql` ไคลเอนต์เรียกได้แค่ชื่อกับค่าพารามิเตอร์ (ส่ง SQL เองไม่ได้)

```bash
mkdir -p queries
echo "SELECT name, qty, price FROM items WHERE customer_id = :cid ORDER BY id" > queries/items_by_customer.sql
TR_DATABASE_URL="sqlite://app.db?mode=rwc" TR_QUERIES_DIR=queries cargo run --release -p tr-server
```

แล้วส่ง `sources` ใน body — ผลคิวรีจะเข้าไปเป็น array ใน `data[ชื่อ]`:

```json
{
  "template": { "…": "template ที่ใช้ data.lines" },
  "data": {},
  "sources": { "lines": { "query": "items_by_customer", "params": { "cid": 1 } } }
}
```

- พารามิเตอร์ `:cid` ถูกผูกเป็น prepared statement เสมอ ค่าที่ส่งมาไม่ถูกต่อเข้ากับ SQL
- รับค่าพารามิเตอร์เป็นตัวเลข ข้อความ true/false หรือ null เท่านั้น
- จำนวนแถวสูงสุดคือ `TR_MAX_QUERY_ROWS` (ค่าเริ่มต้น 10000)

## ตัวแปรสภาพแวดล้อม

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `TR_BIND` | `127.0.0.1:8080` | ที่อยู่ที่ฟัง |
| `TR_FONTS_DIR` | `./fonts` | โฟลเดอร์ฟอนต์ (ต้องมี Sarabun-Regular.ttf) |
| `TR_TEMPLATES_DIR` | (ปิด) | โฟลเดอร์ template สำหรับ `templateName` |
| `TR_MAX_BODY_MB` | `5` | ขนาด body สูงสุด |
| `TR_DATABASE_URL` | (ปิด) | เช่น `sqlite://app.db?mode=rwc` |
| `TR_QUERIES_DIR` | (ปิด) | โฟลเดอร์ไฟล์ `.sql` |
| `TR_MAX_QUERY_ROWS` | `10000` | เพดานแถวต่อคิวรี |

## ก่อนขึ้นใช้งานจริง

- เซิร์ฟเวอร์ยังไม่มี auth, rate limit หรือ timeout ต่อคำขอ ให้วางหลัง reverse proxy ที่จัดการเรื่องเหล่านี้
- รูปในเทมเพลตต้องฝังเป็น data URI — เซิร์ฟเวอร์ไม่อ่านไฟล์รูปจากดิสก์ของตัวเอง
- Docker image มี Dockerfile แล้ว แต่ยังไม่ได้ build ทดสอบ (ดู `docs/phase-3-report.md`)
