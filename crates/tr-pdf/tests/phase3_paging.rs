//! Phase 3: band ครบ, ตัดหน้าอัตโนมัติ, จัดกลุ่มและยอดรวมย่อย
//! ตรวจจากข้อความที่จัดลงแต่ละหน้า (ไม่ใช่แค่จำนวนหน้า) — รันเร็ว ไม่ต้องใช้ WASM

use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;

fn fonts() -> HashMap<String, Vec<u8>> {
    tr_text::load_bundled_fonts(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fonts"))
}

fn text(x: impl Into<f64>, y: impl Into<f64>, w: impl Into<f64>, h: impl Into<f64>, t: &str) -> Value {
    json!({ "type": "text", "x": x.into(), "y": y.into(), "w": w.into(), "h": h.into(), "font": "Sarabun", "size": 9, "text": t, "overflow": "wrap" })
}

/// รายงานรายการ: หัวเรื่อง → หัวคอลัมน์ → (หัวกลุ่ม → รายการ → ท้ายกลุ่ม)* → สรุป · ท้ายกระดาษ
/// `grouped = false` ใช้เฉพาะรายการ + สรุป
fn template(grouped: bool) -> Value {
    let mut bands = vec![
        json!({ "type": "title", "height": 15, "elements": [text(0, 2, 180, 8, "รายงานทดสอบ")] }),
        json!({ "type": "columnHeader", "height": 8, "elements": [text(0, 1, 20, 6, "ลำดับ"), text(20, 1, 100, 6, "รายการ"), text(120, 1, 60, 6, "จำนวนเงิน")] }),
    ];
    if grouped {
        bands.push(json!({
            "type": "groupHeader", "groupBy": "item.category", "height": 8,
            "elements": [text(0, 1, 180, 6, "หมวด {{ group.value }} ({{ group.count }} รายการ)")]
        }));
    }
    bands.push(json!({
        "type": "detail", "dataSource": "items", "height": 6,
        "elements": [text(0, 0, 20, 5, "{{ item.no }}"), text(20, 0, 100, 5, "{{ item.name }}"), text(120, 0, 60, 5, "{{ item.amount }}")]
    }));
    if grouped {
        bands.push(json!({
            "type": "groupFooter", "height": 7,
            "elements": [text(0, 1, 180, 6, "รวมหมวด {{ sum(item.amount) }}")]
        }));
    }
    bands.push(json!({
        "type": "summary", "height": 10, "gap_before": 2,
        "elements": [text(0, 1, 180, 6, "รวมทั้งสิ้น {{ sum(item.amount) }} บาท {{ count() }} รายการ")]
    }));
    bands.push(json!({
        "type": "pageFooter", "height": 8,
        "elements": [text(120, 1, 60, 6, "หน้า {{ page }}/{{ pages }}")]
    }));
    json!({
        "schemaVersion": "1.0",
        "page": { "size": "A4", "margin": [15, 15, 15, 15], "orientation": "portrait" },
        "fonts": [{ "family": "Sarabun", "embed": true }],
        "user_dict": [],
        "bands": bands,
    })
}

fn items(n: usize, per_group: usize) -> Value {
    let rows: Vec<Value> = (0..n)
        .map(|i| json!({ "no": i + 1, "name": format!("รายการ {}", i + 1), "amount": format!("{}.50", (i % 7) + 1), "category": format!("หมวด{:02}", i / per_group) }))
        .collect();
    json!({ "items": rows })
}

fn layout(t: &Value, d: &Value) -> Vec<Vec<String>> {
    let tpl = tr_core::Template::from_json(&t.to_string()).expect("template");
    tr_pdf::page_texts(&tpl, d, &fonts(), None).expect("จัดหน้าได้")
}

/// ข้อความขึ้นต้นด้วย "รายการ " และเป็นชื่อแถวข้อมูล → คืนหมายเลขแถว
fn row_numbers(pages: &[Vec<String>]) -> Vec<usize> {
    pages
        .iter()
        .flatten()
        .filter_map(|s| s.strip_prefix("รายการ ").and_then(|n| n.parse::<usize>().ok()))
        .collect()
}

#[test]
fn long_list_across_pages_keeps_every_row_once_in_order() {
    let pages = layout(&template(false), &items(300, 1));
    assert_eq!(row_numbers(&pages), (1..=300).collect::<Vec<_>>(), "ทุกแถวต้องอยู่ครบ เรียงลำดับ ไม่ซ้ำ");
    // หัวคอลัมน์ซ้ำทุกหน้า และหน้าสุดท้ายรวมยอดจริง
    for (i, page) in pages.iter().enumerate() {
        assert!(page.iter().any(|s| s == "จำนวนเงิน"), "หน้า {} ต้องมีหัวคอลัมน์", i + 1);
        assert!(page.iter().any(|s| s == &format!("หน้า {}/{}", i + 1, pages.len())), "หน้า {} ต้องมีเลขหน้า", i + 1);
    }
    let last = pages.last().unwrap();
    assert!(last.iter().any(|s| s.starts_with("รวมทั้งสิ้น") && s.contains("รายการ")), "สรุปอยู่หน้าสุดท้าย");
    // เลขคำนวณจากเรขาคณิต A4: เนื้อที่ 267mm − หัวคอลัมน์ 8mm − ท้ายกระดาษ 8mm
    // หน้าแรกเสียหัวเรื่อง 15mm → (267−8−8−15)/6 = 39 แถว, หน้าถัดไป (267−8−8)/6 = 41 แถว
    let per_page: Vec<usize> = pages.iter().map(|p| row_numbers(&[p.clone()]).len()).collect();
    assert_eq!(per_page, vec![39, 41, 41, 41, 41, 41, 41, 15], "จำนวนแถวต่อหน้าต้องตรงกับเรขาคณิต");
}

#[test]
fn groups_get_header_rows_and_subtotals() {
    let data = items(12, 4); // หมวด00 (1-4), หมวด01 (5-8), หมวด02 (9-12)
    let pages = layout(&template(true), &data);
    let all: Vec<&String> = pages.iter().flatten().collect();
    for (g, first) in [(0usize, 1usize), (1, 5), (2, 9)] {
        assert!(all.iter().any(|s| *s == &format!("หมวด หมวด{g:02} (4 รายการ)")), "หัวกลุ่ม {g}");
        // ยอดย่อย = รวม amount ของแถว first..first+3 (ค่า amount = (i%7+1).50)
        let sub: f64 = (first..first + 4).map(|n| ((n - 1) % 7 + 1) as f64 + 0.5).sum();
        let want = format!("รวมหมวด {}", fmt(sub));
        assert!(all.iter().any(|s| *s == &want), "ยอดย่อยกลุ่ม {g} ต้องเป็น {want}");
    }
    let total: f64 = (1..=12usize).map(|n| ((n - 1) % 7 + 1) as f64 + 0.5).sum();
    assert!(all.iter().any(|s| s.starts_with(&format!("รวมทั้งสิ้น {} บาท 12 รายการ", fmt(total)))), "ยอดรวมทั้งสิ้น");
    assert_eq!(row_numbers(&pages), (1..=12).collect::<Vec<_>>());
}

#[test]
fn group_header_never_stranded_at_page_bottom() {
    // กลุ่มละ 1 แถว: หัวกลุ่มจะตกขอบล่างได้บ่อย — ต้องไม่มีหัวกลุ่มเป็นบรรทัดสุดท้ายของหน้า
    let pages = layout(&template(true), &items(70, 1));
    assert_eq!(row_numbers(&pages), (1..=70).collect::<Vec<_>>());
    for (i, page) in pages.iter().enumerate() {
        let body: Vec<&String> = page.iter().filter(|s| !s.starts_with("หน้า ") && !s.starts_with("รวมหมวด") && *s != "จำนวนเงิน").collect();
        if let Some(last) = body.last() {
            assert!(!last.starts_with("หมวด "), "หน้า {} จบด้วยหัวกลุ่มที่ไม่มีแถวตาม: {last}", i + 1);
        }
    }
}

#[test]
fn group_footer_totals_only_its_own_rows_across_pages() {
    // กลุ่มยาวข้ามหน้า: ยอดท้ายกลุ่มต้องรวมทุกแถวของกลุ่ม ไม่ใช่เฉพาะแถวในหน้านั้น
    let data = items(90, 45); // หมวด00 = 45 แถว (ข้ามหน้าแน่นอน)
    let pages = layout(&template(true), &data);
    let want: f64 = (1..=45usize).map(|n| ((n - 1) % 7 + 1) as f64 + 0.5).sum();
    let all: Vec<&String> = pages.iter().flatten().collect();
    assert!(all.iter().any(|s| *s == &format!("รวมหมวด {}", fmt(want))), "ยอดกลุ่มข้ามหน้าต้องรวม 45 แถว");
    assert!(pages.len() > 2, "ต้องข้ามหน้า");
}

/// รูปแบบเงินเดียวกับ engine: คั่นหลักพัน ทศนิยม 2 ตำแหน่ง
fn fmt(v: f64) -> String {
    let s = format!("{:.2}", v);
    let (int, frac) = s.split_once('.').unwrap();
    let mut out = String::new();
    let len = int.len();
    for (k, ch) in int.chars().enumerate() {
        if k > 0 && (len - k) % 3 == 0 {
            out.push(',');
        }
        out.push(ch);
    }
    format!("{out}.{frac}")
}


/// ตัวอย่างที่ผู้ใช้จะคัดลอกไปใช้ (templates/sales-by-category.*) ต้องให้ยอดตามที่เขียนไว้
#[test]
fn shipped_grouped_sample_has_expected_subtotals() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let t: Value = serde_json::from_str(&std::fs::read_to_string(root.join("templates/sales-by-category.json")).unwrap()).unwrap();
    let d: Value = serde_json::from_str(&std::fs::read_to_string(root.join("templates/sales-by-category.data.json")).unwrap()).unwrap();
    let pages = layout(&t, &d);
    let all: Vec<&String> = pages.iter().flatten().collect();
    for want in ["หมวด เครื่องเขียน · 4 รายการ", "หมวด อุปกรณ์สำนักงาน · 5 รายการ", "หมวด กระดาษ · 3 รายการ", "หมวด อิเล็กทรอนิกส์ · 3 รายการ"] {
        assert!(all.iter().any(|s| *s == want), "หัวกลุ่ม {want}");
    }
    for want in ["51", "66", "27", "44"] {
        assert!(all.iter().any(|s| *s == want), "จำนวนรวมย่อย {want}");
    }
    for want in ["5,526.50", "8,084.00", "2,045.50", "6,421.00"] {
        assert!(all.iter().any(|s| *s == want), "ยอดรวมย่อย {want}");
    }
    assert!(all.iter().any(|s| *s == "22,077.00"), "ยอดรวมทั้งสิ้น 22,077.00");
    assert!(all.iter().any(|s| s.starts_with("รวมทั้งสิ้น 15 รายการ")), "จำนวนรายการรวม 15");
}
