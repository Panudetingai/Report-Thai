//! Golden tests Phase 1 — Template JSON → PDF ภาษาไทยถูกต้อง
//! เกณฑ์ผ่าน (สเปก Phase 1): golden ผ่านทุกกรณี, ไม่มี glyph หาย (.notdef),
//! เอกสารตัวอย่าง 3 ฉบับ render ตรง mockup (validate + ขนาด + determinism)

use std::collections::HashMap;
use std::path::PathBuf;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("..")
}

fn fonts_dir() -> PathBuf {
    repo_root().join("fonts")
}

fn load_fonts() -> HashMap<String, Vec<u8>> {
    let map = tr_text::load_bundled_fonts(&fonts_dir());
    assert!(
        map.contains_key("Sarabun"),
        "ต้องมี fonts/Sarabun-Regular.ttf (OFL)"
    );
    map
}

fn sarabun() -> Vec<u8> {
    std::fs::read(fonts_dir().join("Sarabun-Regular.ttf")).expect("อ่าน Sarabun ไม่สำเร็จ")
}

#[test]
fn sentences_no_missing_glyphs() {
    let font = sarabun();
    let path = repo_root().join("tests").join("golden").join("th").join("sentences.txt");
    let content = std::fs::read_to_string(&path).expect("อ่าน sentences.txt");
    let lines: Vec<&str> = content.lines().filter(|l| !l.trim().is_empty()).collect();
    assert!(lines.len() >= 9, "ต้องมีประโยคทดสอบอย่างน้อย 9 บรรทัด");
    for line in &lines {
        let missing = tr_text::missing_glyphs(&font, line);
        assert!(
            missing.is_empty(),
            "Sarabun ขาด glyph สำหรับ {missing:?} ใน: {line}"
        );
    }
}

#[test]
fn wrap_long_sentence_fits_content_width() {
    let font = sarabun();
    // ความกว้างเนื้อหา A4 ขอบ 15mm = 180mm ≈ 510pt
    let max_w = 180.0 * 72.0 / 25.4;
    let long = "ประโยคยาวไม่มีวรรค: บริษัทนี้ให้บริการรับทำบัญชีและยื่นภาษีครบวงจรทั่วประเทศโดยไม่หยุดพัก และยังให้บริการตรวจสอบภายใน วางระบบบัญชี อบรมพนักงาน และยื่นภาษีทุกประเภทอย่างครบถ้วน";
    let wrapped = tr_text::wrap_thai(long, &font, 11.0, max_w, &["วันที่", "เลขที่"]);
    assert!(wrapped.len() >= 2, "บรรทัดยาวต้องถูกตัด: {wrapped:?}");
    for w in &wrapped {
        let width = tr_text::measure_thai_width(w, &font, 11.0);
        assert!(width <= max_w + 0.5, "บรรทัดย่อยล้น ({width:.1} > {max_w:.1}): {w}");
    }
    // ห้ามทิ้ง ไม้ยมก/ฯลฯ ไว้หัวบรรทัด
    for w in &wrapped {
        assert!(
            !w.starts_with('ๆ') && !w.starts_with('ฯ'),
            "ห้ามขึ้นต้นบรรทัดด้วย ๆ/ฯ: {w}"
        );
    }
}

fn render_pair(template_name: &str, data_name: &str) -> Vec<u8> {
    let root = repo_root();
    let ts = std::fs::read_to_string(root.join("templates").join(template_name)).unwrap();
    let ds = std::fs::read_to_string(root.join("templates").join(data_name)).unwrap();
    let template = tr_core::Template::from_json(&ts).unwrap();
    template.validate().unwrap();
    let data: serde_json::Value = serde_json::from_str(&ds).unwrap();
    let fonts = load_fonts();
    tr_pdf::render_template(&template, &data, &fonts, None).expect("render ต้องสำเร็จ")
}

fn page_count(pdf: &[u8]) -> usize {
    let t = String::from_utf8_lossy(pdf);
    regex_count(&t)
}

fn regex_count(t: &str) -> usize {
    // นับ /Type /Page แต่ไม่นับ /Type /Pages
    let mut n = 0;
    let mut start = 0;
    while let Some(i) = t[start..].find("/Type") {
        let s = &t[start + i..];
        let rest = s.trim_start_matches("/Type").trim_start();
        if rest.starts_with("/Page") {
            let after = rest.trim_start_matches("/Page");
            if !after.starts_with('s') {
                n += 1;
            }
        }
        start += i + 5;
    }
    n
}

#[test]
fn render_three_templates() {
    for (t, d) in [
        ("invoice-full.json", "invoice-full.data.json"),
        ("quotation.json", "quotation.data.json"),
        ("receipt.json", "receipt.data.json"),
    ] {
        let pdf = render_pair(t, d);
        assert!(pdf.starts_with(b"%PDF"), "{t} ต้องขึ้นต้นด้วย %PDF");
        assert!(pdf.len() > 5_000, "{t} เล็กผิดปกติ ({} bytes)", pdf.len());
        assert_eq!(page_count(&pdf), 1, "{t} ตัวอย่างสั้นต้องลง 1 หน้า");
        // determinism: render ซ้ำต้องได้ bytes เดียวกัน
        let pdf2 = render_pair(t, d);
        assert_eq!(pdf, pdf2, "{t} render ซ้ำต้อง deterministic");
    }
}

#[test]
fn every_template_text_fits_its_box() {
    // กันเคสจริง: \n หลุดไปวาดเป็นกล่อง tofu + ข้อความเลยขอบกระดาษ
    // ตรวจทุก text element (รวมใน table) ว่าหลัง bind+wrap แล้วพอดีกล่องและไม่มี control/ZWSP
    let font = sarabun();
    for (t_name, d_name) in [
        ("invoice-full.json", "invoice-full.data.json"),
        ("quotation.json", "quotation.data.json"),
        ("receipt.json", "receipt.data.json"),
    ] {
        let root = repo_root();
        let template =
            tr_core::Template::from_json(&std::fs::read_to_string(root.join("templates").join(t_name)).unwrap())
                .unwrap();
        let data: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(root.join("templates").join(d_name)).unwrap(),
        )
        .unwrap();
        let extra: Vec<&str> = template.user_dict.iter().map(|s| s.as_str()).collect();
        let first_row = data.get("items").and_then(|v| v.as_array()).and_then(|a| a.first());
        let check = |raw: &str, size: f32, w_mm: f32, label: String| {
            let bound = tr_core::bind_text(raw, &data, first_row, 1, 1);
            // กล่องแคบสุดใน template คือ 30mm — wrap ต้องจบทุกกรณี
            let lines = tr_text::wrap_thai(&bound, &font, size, w_mm * 72.0 / 25.4, &extra);
            for line in &lines {
                assert!(
                    !line.chars().any(|c| c.is_control()),
                    "{t_name} {label}: control หลุด: {line:?}"
                );
                assert!(!line.contains('\u{200b}'), "{t_name} {label}: ZWSP หลุด: {line:?}");
                let w = tr_text::measure_thai_width(line, &font, size);
                assert!(
                    w <= w_mm * 72.0 / 25.4 + 0.5,
                    "{t_name} {label}: ล้นกล่อง ({w:.1} > {w_mm}mm): {line}"
                );
            }
        };
        for band in &template.bands {
            for el in &band.elements {
                match el {
                    tr_core::Element::Text(t) => {
                        check(&t.text, t.size, t.w, format!("text {:?}", &t.text[..t.text.len().min(30)]))
                    }
                    tr_core::Element::Table(t) => {
                        for col in &t.columns {
                            check(&col.header, t.size, col.width, format!("header {:?}", col.header));
                            check(&col.field, t.size, col.width, format!("field {:?}", col.field));
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}
#[test]
fn dot_leader_fills_line_without_overflow() {
    // ฟอร์มราชการ: จุดต้องต่อท้ายข้อความบรรทัดเดียวกัน (ไม่ขีดเส้นแยก)
    // leader คำนวณแบบปัดลงจึงล้นกล่องไม่ได้ และไม่เพิ่มจำนวนบรรทัด
    let template: tr_core::Template = serde_json::from_str(
        r#"{
        "schemaVersion": "1.0",
        "page": {"size": "A4", "margin": [15,15,15,15]},
        "fonts": [{"family": "Sarabun", "embed": true}],
        "bands": [{"type": "title", "height": 20, "elements": [
            {"type": "text", "x": 0, "y": 0, "w": 180, "h": 7,
             "font": "Sarabun", "size": 16, "overflow": "wrap", "leader": ".",
             "text": "ชื่อตัว {{ guest.first_name }}"}
        ]}]
    }"#,
    )
    .unwrap();
    template.validate().unwrap();
    let data = serde_json::json!({"guest": {"first_name": ""}});
    let fonts = load_fonts();
    let pdf = tr_pdf::render_template(&template, &data, &fonts, None).expect("leader ต้อง render ได้");
    assert_eq!(page_count(&pdf), 1, "ฟอร์มสั้นต้องลง 1 หน้า");
    // leader กับ align ที่ไม่ใช่ left ต้อง validate ไม่ผ่าน
    let bad: tr_core::Template = serde_json::from_str(
        r#"{
        "schemaVersion": "1.0",
        "page": {"size": "A4", "margin": [15,15,15,15]},
        "fonts": [{"family": "Sarabun", "embed": true}],
        "bands": [{"type": "title", "height": 20, "elements": [
            {"type": "text", "x": 0, "y": 0, "w": 30, "h": 6,
             "font": "Sarabun", "size": 16, "align": "center",
             "text": "กลาง", "leader": "."}
        ]}]
    }"#,
    )
    .unwrap();
    bad.validate().unwrap_err();
}

#[test]
fn guest_form_text_heights_fit() {
    // กันตัดบรรทัดเงียบ: overflow=wrap ตัดบรรทัดเกินโดยไม่ error
    // (เคยเกิด: กล่อง h=11mm ใส่ 12pt สองบรรทัดที่ต้องการ 11.007mm
    //  ขาด 0.02pt ทำให้ "ที่เข้าพัก/ที่ออกไป" หายจาก PDF)
    let root = repo_root();
    let (t_name, d_name) = ("guest-registration.json", "guest-registration.data.json");
    let font = sarabun();
    let template =
        tr_core::Template::from_json(&std::fs::read_to_string(root.join("templates").join(t_name)).unwrap())
            .unwrap();
    let data: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(root.join("templates").join(d_name)).unwrap(),
    )
    .unwrap();
    let extra: Vec<&str> = template.user_dict.iter().map(|s| s.as_str()).collect();
    for band in &template.bands {
        for el in &band.elements {
            if let tr_core::Element::Text(t) = el {
                if t.overflow == tr_core::Overflow::Clip {
                    continue;
                }
                let bound = tr_core::bind_text(&t.text, &data, None, 1, 1);
                let max_w = t.w * 72.0 / 25.4;
                let lines = tr_text::wrap_thai(&bound, &font, t.size, max_w, &extra);
                let need = if lines.is_empty() {
                    0.0
                } else {
                    t.size + (lines.len() - 1) as f32 * t.size * 1.6
                };
                let max_h = t.h * 72.0 / 25.4;
                let preview: String = t.text.chars().take(25).collect();
                assert!(
                    need <= max_h + 0.01,
                    "{t_name} กล่อง h={}mm ใส่ {} บรรทัดไม่พอ (ต้อง {need:.1}pt มี {max_h:.1}pt): {preview:?}",
                    t.h,
                    lines.len(),
                );
            }
        }
    }
    let pdf = render_pair(t_name, d_name);
    assert_eq!(page_count(&pdf), 1, "ฟอร์ม ร.ร.3 ต้องลง 1 หน้า");
}

#[test]
fn overflow_error_fires() {
    let template: tr_core::Template = serde_json::from_str(
        r#"{
        "schemaVersion": "1.0",
        "page": {"size": "A4", "margin": [15,15,15,15]},
        "fonts": [{"family": "Sarabun", "embed": true}],
        "bands": [{"type": "title", "height": 20, "elements": [
            {"type": "text", "x": 0, "y": 0, "w": 30, "h": 5,
             "font": "Sarabun", "size": 18, "overflow": "error",
             "text": "ประโยคยาวไม่มีวรรค: บริษัทนี้ให้บริการรับทำบัญชีและยื่นภาษีครบวงจรทั่วประเทศโดยไม่หยุดพัก"}
        ]}]
    }"#,
    )
    .unwrap();
    let data = serde_json::json!({});
    let fonts = load_fonts();
    let err = tr_pdf::render_template(&template, &data, &fonts, None).unwrap_err();
    assert!(err.contains("ล้นกรอบ"), "ต้องแจ้งข้อความล้นกรอบ ได้: {err}");
}

#[test]
fn multipage_table_breaks() {
    let root = repo_root();
    let ts = std::fs::read_to_string(root.join("templates").join("invoice-full.json")).unwrap();
    let template = tr_core::Template::from_json(&ts).unwrap();
    let mut data: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(root.join("templates").join("invoice-full.data.json")).unwrap(),
    )
    .unwrap();
    let items: Vec<serde_json::Value> = (1..=120)
        .map(|i| {
            serde_json::json!({
                "no": i.to_string(),
                "name": format!("สินค้าทดสอบรายการที่ {i} รายละเอียดเพิ่มเติม"),
                "qty": "1", "price": "100.00", "amount": "100.00"
            })
        })
        .collect();
    data["items"] = serde_json::Value::Array(items);
    let fonts = load_fonts();
    let pdf = tr_pdf::render_template(&template, &data, &fonts, None).expect("render 120 แถว");
    let n = page_count(&pdf);
    assert!(n >= 2, "120 แถวต้องได้หลายหน้า ได้ {n}");
}
