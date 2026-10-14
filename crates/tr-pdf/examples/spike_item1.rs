//! Spike Phase 0 ข้อ 1: เรนเดอร์ประโยคไทยยากเทียบ baseline
//! รัน: cargo run -p tr-pdf --example spike_item1
//! อ่าน tests/golden/th/sentences.txt + ใช้ฟอนต์ระบบเฉพาะเครื่อง (Tahoma)
//! ออก target/spike/spike-item1-thai.pdf + พิมพ์สถิติ shaping/ตัดคำ

fn main() {
    let sentences_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../tests/golden/th/sentences.txt"
    );
    let text = std::fs::read_to_string(sentences_path).expect("อ่าน sentences.txt");
    let lines: Vec<String> = text.lines().map(|s| s.to_string()).collect();

    // ฟอนต์ทดสอบเฉพาะเครื่อง (ไม่ commit เข้า repo เพราะไม่ใช่ OFL)
    let font_path = r"C:\Windows\Fonts\tahoma.ttf";
    let font_data =
        std::fs::read(font_path).expect("ต้องมี Tahoma บนเครื่องทดสอบ (เฉพาะ spike)");
    // พจนานุกรมผู้ใช้ spike: กันพจนานุกรมหลักตัด "วันที่"/"เลขที่" กลางคำ
    let user_dict = ["วันที่", "เลขที่"];

    println!("=== Phase 0 ข้อ 1: ประโยคทั้งหมด {} บรรทัด ===", lines.len());
    const MAX_W: f32 = 595.0 - 48.0 * 2.0; // ต้องตรงกับ render_thai_lines
    let mut total_visual = 0usize;
    for (i, line) in lines.iter().enumerate() {
        let tb = tr_text::segment_thai(line);
        let uw = tr_text::segment_thai_uniworld(line);
        let (runs, glyphs, w) = tr_text::shape_thai(line, Some(font_data.clone()));
        let wrapped = tr_text::wrap_thai(line, &font_data, 16.0, MAX_W, &user_dict);
        total_visual += wrapped.len();
        let preview: String = line.chars().take(60).collect();
        println!(
            "[{}] thaibreak={} คำ | uniworld={} ชิ้น | shape runs={} glyphs={} w={:.1}px | wrap={} บรรทัด\n    {}",
            i + 1,
            tb.len(),
            uw.len(),
            runs,
            glyphs,
            w,
            wrapped.len(),
            preview
        );
        // สัญญาณเตือน shaping เพี้ยนเบื้องต้น: ไม่มี glyph เลยทั้งที่ข้อความไม่ว่าง
        assert!(
            glyphs > 0 || line.trim().is_empty(),
            "บรรทัดที่ {} shaping ได้ 0 glyph: {}",
            i + 1,
            line
        );
        // ทุกบรรทัดย่อยต้องพอดีกรอบกระดาษ (self-check กันล้นแบบรอบก่อน)
        for (j, v) in wrapped.iter().enumerate() {
            let vw = tr_text::measure_thai_width(v, &font_data, 16.0);
            assert!(
                vw <= MAX_W + 1.0,
                "บรรทัดที่ {}.{} ยังกว้างเกินกรอบ ({:.1} > {:.1}): {}",
                i + 1,
                j + 1,
                vw,
                MAX_W,
                v
            );
        }
    }
    println!("visual lines รวม: {total_visual}");

    let pdf = tr_pdf::render_thai_lines(font_data, &lines, 16.0, &user_dict);
    assert!(pdf.starts_with(b"%PDF"), "ผลลัพธ์ต้องเป็น PDF จริง");
    let out = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/spike/spike-item1-thai.pdf"
    );
    std::fs::write(out, &pdf).expect("เขียน PDF");
    println!("เขียน PDF แล้ว: {} ({} bytes)", out, pdf.len());
    println!("ขั้นตอนต่อไป: เปิด PDF เทียบกับ baseline (Typst/pdfme) ด้วยตา แล้วบันทึกใน docs/spike-report.md");
}
