//! tr-node: napi-rs binding สำหรับ Next.js Route Handler
use napi_derive::napi;

#[napi]
pub fn render_template(_template_json: String) -> String {
    // TODO(phase-3): เรียก engine จริง
    "{\"ok\": false}".to_string()
}
