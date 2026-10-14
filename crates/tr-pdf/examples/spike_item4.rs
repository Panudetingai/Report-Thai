//! Spike Phase 0 ข้อ 4: PDF/A-3b + ฝังไฟล์ XML ด้วย krilla
//! รัน: cargo run -p tr-pdf --example spike_item4
//! ออก: target/spike/spike-item4-pdfa3b.pdf (+ spike-item4-invoice.xml)
//!
//! หมายเหตุ: XML นี้เป็นตัวอย่างสมมติเพื่อทดสอบการฝังไฟล์เท่านั้น
//! ไม่ใช่ XML ตาม ETDA 3-2560 (ของจริงทำ Phase 4 + ติดป้าย experimental)

use krilla::configure::{Archival, ConfigurationBuilder};
use krilla::embed::{AssociationKind, EmbeddedFile, MimeType};
use krilla::geom::Point;
use krilla::metadata::DateTime;
use krilla::page::PageSettings;
use krilla::text::{Font, TextDirection};
use krilla::{Data, Document, SerializeSettings};

const XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<!-- SPIKE SAMPLE ONLY: โครงสมมติเพื่อทดสอบฝังไฟล์ ไม่ใช่ ETDA 3-2560 -->
<Invoice>
  <SellerTaxID>0123456789012</SellerTaxID>
  <BuyerTaxID>0987654321098</BuyerTaxID>
  <Total>12345.67</Total>
  <Currency>THB</Currency>
  <Note>ใบกำกับภาษี ทดสอบภาษาไทย น้ำ ข้าว ด้าย ย้ำ</Note>
</Invoice>
"#;

fn main() {
    let font_data =
        std::fs::read(r"C:\Windows\Fonts\tahoma.ttf").expect("ต้องมี Tahoma");
    let user_dict = ["วันที่", "เลขที่"];

    // 1) เปิดโหมดตรวจ PDF/A-3b — ถ้าเอกสารไม่ผ่านเกณฑ์ finish() จะ Err ทันที
    let configuration = ConfigurationBuilder::new()
        .with_archival_validator(Archival::A3_B)
        .finish()
        .expect("สร้าง PDF/A-3b configuration");
    let settings = SerializeSettings {
        configuration,
        ..Default::default()
    };
    let mut document = Document::new_with(settings);
    let font = Font::new(font_data.clone().into(), 0).expect("โหลดฟอนต์");

    // 2) ฝัง XML แบบ associated file (kind=Data: ข้อมูลต้นทางของหน้ากระดาษ)
    let xml_bytes = XML.as_bytes().to_vec();
    let embedded = EmbeddedFile {
        path: "invoice.xml".to_string(),
        mime_type: MimeType::new("text/xml"),
        description: Some("Spike sample invoice XML (NOT ETDA 3-2560)".to_string()),
        association_kind: AssociationKind::Data,
        data: Data::from(xml_bytes.clone()),
        modification_date: Some(DateTime::new(2026).month(10).day(14)),
        compress: None,
        location: None,
    };
    document.embed_file(embedded).expect("ฝัง XML");

    // 3) เนื้อหาภาษาไทย (ใช้ wrap ชุดเดียวกับข้อ 1)
    let lines = [
        "ใบกำกับภาษี (ตัวอย่าง spike PDF/A-3b)".to_string(),
        "ผู้ขาย เลขผู้เสียภาษี 0123456789012 สาขา 00000".to_string(),
        "ยอดรวม 12345.67 บาท วันที่ 14/10/2569".to_string(),
        "น้ำ ข้าว ด้าย ย้ำ ขึ้น ตั้ง ปั้น กระเป๋า ตะโกน สะพาน".to_string(),
    ];
    let mut page = document.start_page_with(PageSettings::from_wh(595.0, 842.0).unwrap());
    let mut surface = page.surface();
    let mut y = 60.0;
    for line in &lines {
        for v in tr_text::wrap_thai(line, &font_data, 16.0, 595.0 - 96.0, &user_dict) {
            surface.draw_text(
                Point::from_xy(48.0, y),
                font.clone(),
                16.0,
                &v,
                false,
                TextDirection::Auto,
            );
            y += 27.0;
        }
    }
    surface.finish();
    page.finish();

    match document.finish() {
        Ok(pdf) => {
            let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/spike/");
            std::fs::write(format!("{dir}spike-item4-pdfa3b.pdf"), &pdf).unwrap();
            std::fs::write(format!("{dir}spike-item4-invoice.xml"), &xml_bytes).unwrap();
            println!("OK: PDF/A-3b krilla-validator ผ่านในตัว ({} bytes)", pdf.len());
            println!("ขั้นตอนต่อไป: ตรวจด้วย veraPDF ภายนอก");
        }
        Err(e) => {
            println!("KRILLA VALIDATION FAIL: {e:?}");
            std::process::exit(2);
        }
    }
}
