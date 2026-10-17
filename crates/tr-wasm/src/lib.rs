//! tr-wasm: WASM binding สำหรับ designer preview (engine ตัวเดียวกับ native)
//! Phase 2: render Template → PDF ใน browser + ฟังก์ชันตัดคำ/วัดความกว้าง (Phase 0)

use std::collections::HashMap;
use std::sync::OnceLock;
use wasm_bindgen::prelude::*;

/// ฟอนต์ฝังในตัว parse ครั้งเดียว (ไม่ copy ทุกครั้งที่ render)
fn embedded_fonts() -> &'static HashMap<String, Vec<u8>> {
    static FONTS: OnceLock<HashMap<String, Vec<u8>>> = OnceLock::new();
    FONTS.get_or_init(build_embedded_fonts)
}

fn build_embedded_fonts() -> HashMap<String, Vec<u8>> {
    let mut map = HashMap::new();
    map.insert(
        "Sarabun".to_string(),
        include_bytes!("../../../fonts/Sarabun-Regular.ttf").to_vec(),
    );
    map.insert(
        "Sarabun-Bold".to_string(),
        include_bytes!("../../../fonts/Sarabun-Bold.ttf").to_vec(),
    );
    map.insert(
        "Sarabun-Light".to_string(),
        include_bytes!("../../../fonts/Sarabun-Light.ttf").to_vec(),
    );
    map.insert(
        "NotoSansThai".to_string(),
        include_bytes!("../../../fonts/NotoSansThai-Variable.ttf").to_vec(),
    );
    map
}

fn render_inner(template_json: &str, data_json: &str) -> Result<Vec<u8>, String> {
    render_inner_counted(template_json, data_json).map(|(pdf, _)| pdf)
}

fn render_inner_counted(template_json: &str, data_json: &str) -> Result<(Vec<u8>, usize), String> {
    let template = tr_core::Template::from_json(template_json)?;
    template.validate()?;
    let data: serde_json::Value =
        serde_json::from_str(data_json).map_err(|e| format!("parse data ไม่สำเร็จ: {e}"))?;
    tr_pdf::render_template_counted(&template, &data, embedded_fonts(), None)
}

/// ตัดคำไทย (thaibreak) คืน JSON array ของคำ
#[wasm_bindgen]
pub fn segment_thai(text: &str) -> String {
    serde_json::to_string(&tr_text::segment_thai(text)).unwrap_or_else(|_| "[]".to_string())
}

/// ตัดคำพร้อมพจนานุกรมผู้ใช้ `extra_words_json` (JSON array ของ string)
#[wasm_bindgen]
pub fn segment_thai_with_dict(text: &str, extra_words_json: &str) -> String {
    let extra: Vec<String> = serde_json::from_str(extra_words_json).unwrap_or_default();
    let refs: Vec<&str> = extra.iter().map(|s| s.as_str()).collect();
    serde_json::to_string(&tr_text::segment_thai_with_dict(text, &refs))
        .unwrap_or_else(|_| "[]".to_string())
}

/// วัดความกว้างข้อความ (px ≈ pt) ด้วยฟอนต์ที่ส่งมาเป็น bytes (Uint8Array)
#[wasm_bindgen]
pub fn measure_thai_width(font_data: &[u8], text: &str, font_size: f32) -> f32 {
    tr_text::measure_thai_width(text, font_data, font_size)
}

/// ตัดบรรทัดให้พอดี `max_width` คืน JSON array ของบรรทัดย่อย
#[wasm_bindgen]
pub fn wrap_thai(
    font_data: &[u8],
    text: &str,
    font_size: f32,
    max_width: f32,
    extra_words_json: &str,
) -> String {
    let extra: Vec<String> = serde_json::from_str(extra_words_json).unwrap_or_default();
    let refs: Vec<&str> = extra.iter().map(|s| s.as_str()).collect();
    serde_json::to_string(&tr_text::wrap_thai(text, font_data, font_size, max_width, &refs))
        .unwrap_or_else(|_| "[]".to_string())
}

/// ตรวจ template JSON — คืน `{"ok":true}` หรือ `{"ok":false,"error":"..."}`
#[wasm_bindgen]
pub fn validate_template(template_json: &str) -> String {
    match tr_core::Template::from_json(template_json).and_then(|t| t.validate()) {
        Ok(()) => "{\"ok\":true}".to_string(),
        Err(e) => serde_json::json!({ "ok": false, "error": e }).to_string(),
    }
}

/// เรนเดอร์ template + data → PDF bytes (Uint8Array) — engine เดียวกับ CLI
#[wasm_bindgen]
pub fn render_template_pdf(template_json: &str, data_json: &str) -> Result<Vec<u8>, JsValue> {
    render_inner(template_json, data_json).map_err(|e| JsValue::from_str(&e))
}

/// พรีวิว designer: คืน JSON `{ ok, pdf_base64?, bytes?, page_count?, error? }`
#[wasm_bindgen]
pub fn preview_template(template_json: &str, data_json: &str) -> String {
    match render_inner_counted(template_json, data_json) {
        Ok((pdf, pages)) => {
            let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &pdf);
            serde_json::json!({
                "ok": true,
                "pdf_base64": b64,
                "bytes": pdf.len(),
                "page_count": pages.max(1),
            })
            .to_string()
        }
        Err(e) => serde_json::json!({ "ok": false, "error": e }).to_string(),
    }
}
