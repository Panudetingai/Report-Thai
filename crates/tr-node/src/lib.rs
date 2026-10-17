//! tr-node: napi-rs binding ของ ThaiReport สำหรับ Node.js / Next.js Route Handler (Phase 3)
//!
//! - `renderPdf(template, data, fontsDir)` → Promise<Buffer> (รันบน libuv thread pool ไม่บล็อก event loop)
//! - `validateTemplate(template)` → JSON string `{ "ok": true }` หรือ `{ "ok": false, "error": "…" }`
//!
//! ฟอนต์โหลดจาก `fontsDir` ครั้งแรกแล้วแคชไว้ (เปลี่ยน fontsDir เมื่อไรโหลดใหม่)
//! รูปในเทมเพลตต้องฝังหรือเป็น data URI — binding ไม่อ่านไฟล์รูปจากดิสก์

use napi::bindgen_prelude::*;
use napi::{Env, Task};
use napi_derive::napi;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

type FontCache = Mutex<Option<(PathBuf, Arc<HashMap<String, Vec<u8>>>)>>;
static FONTS: OnceLock<FontCache> = OnceLock::new();

fn fonts_for(dir: &str) -> Result<Arc<HashMap<String, Vec<u8>>>> {
    let path = PathBuf::from(dir);
    let cache = FONTS.get_or_init(|| Mutex::new(None));
    let mut guard = cache.lock().map_err(|_| Error::from_reason("font cache poisoned"))?;
    if let Some((cached, fonts)) = guard.as_ref() {
        if *cached == path {
            return Ok(fonts.clone());
        }
    }
    let fonts = tr_text::load_bundled_fonts(&path);
    if !fonts.contains_key("Sarabun") {
        return Err(Error::from_reason(format!("ไม่พบ Sarabun-Regular.ttf ในโฟลเดอร์ {dir}")));
    }
    let fonts = Arc::new(fonts);
    *guard = Some((path, fonts.clone()));
    Ok(fonts)
}

fn render_bytes(template_json: &str, data_json: &str, fonts_dir: &str) -> std::result::Result<Vec<u8>, String> {
    let template = tr_core::Template::from_json(template_json)?;
    let data: serde_json::Value = serde_json::from_str(data_json).map_err(|e| format!("parse data ไม่สำเร็จ: {e}"))?;
    let fonts = fonts_for(fonts_dir).map_err(|e| e.reason.clone())?;
    tr_pdf::render_template(&template, &data, &fonts, None)
}

pub struct RenderTask {
    template: String,
    data: String,
    fonts_dir: String,
}

impl Task for RenderTask {
    type Output = Vec<u8>;
    type JsValue = Buffer;

    fn compute(&mut self) -> Result<Self::Output> {
        render_bytes(&self.template, &self.data, &self.fonts_dir).map_err(Error::from_reason)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(Buffer::from(output))
    }
}

/// เรนเดอร์ template + data เป็น PDF (Promise<Buffer>)
#[napi]
pub fn render_pdf(template: String, data: String, fonts_dir: String) -> AsyncTask<RenderTask> {
    AsyncTask::new(RenderTask { template, data, fonts_dir })
}

/// ตรวจ template — คืน JSON string เสมอ ไม่ throw
#[napi]
pub fn validate_template(template: String) -> String {
    match tr_core::Template::from_json(&template).and_then(|t| t.validate()) {
        Ok(()) => "{\"ok\":true}".to_string(),
        Err(e) => serde_json::json!({ "ok": false, "error": e }).to_string(),
    }
}
