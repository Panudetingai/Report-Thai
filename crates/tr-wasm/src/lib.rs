//! tr-wasm: WASM binding สำหรับ designer preview (engine ตัวเดียวกัน)
//! Phase 0 spike ข้อ 2: expose shaping + layout (segment/wrap/measure) ให้ JS เรียกได้

use wasm_bindgen::prelude::*;

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

#[wasm_bindgen]
pub fn preview_template(_template_json: &str) -> String {
    // TODO(phase-2): เรนเดอร์ด้วย engine จริงใน browser ห้ามใช้ DOM text
    "{\"ok\": false, \"reason\": \"phase-0 scaffold\"}".to_string()
}
