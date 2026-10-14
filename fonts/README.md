# fonts — ฟอนต์ OFL เท่านั้น

| ไฟล์ | ครอบครัว | ที่มา | license |
|---|---|---|---|
| `Sarabun-Regular.ttf` (90,220 bytes) | Sarabun | google/fonts `ofl/sarabun` (ต้นน้ำ Sarabun Project, cadsondemak) | OFL 1.1 ✅ (`OFL.txt`) |
| `Sarabun-Bold.ttf` (89,804 bytes) | Sarabun Bold | เดียวกัน | OFL 1.1 ✅ |
| `NotoSansThai-Variable.ttf` (218,652 bytes, `wght+wdth`) | Noto Sans Thai | google/fonts `ofl/notosansthai` (Noto Project) | OFL 1.1 ✅ (`OFL-NotoSansThai.txt`) |

กติกา (spec ข้อ 0.5 + 4.2):
- อนุญาตเฉพาะ OFL ตรวจทุกตัวก่อนแจก บันทึกใน `docs/licenses.md`
- ฟอนต์ที่ไม่แจกต่อได้ให้ผู้ใช้ติดตั้งเอง ห้าม copy มาวาง
- Tahoma (ใช้เฉพาะ spike Phase 0) **ไม่มี**ในโฟลเดอร์นี้ — ทดสอบบนเครื่องเท่านั้น ห้าม commit

การใช้ใน engine: `tr_text::load_bundled_fonts(fonts/)` โหลด 3 ไฟล์นี้;
ข้อความ `bold` ใช้ Sarabun-Bold, ครอบ `NotoSansThai` เมื่อ template ระบุ
