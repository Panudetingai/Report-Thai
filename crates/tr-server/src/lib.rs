//! tr-server: HTTP API ของ ThaiReport (Phase 3)
//!
//! - `GET  /health`    → `{ "ok": true, "version": "…" }`
//! - `GET  /templates` → รายชื่อไฟล์ template ในโฟลเดอร์ที่ตั้งค่า (ไม่คืน path เต็ม)
//! - `POST /render`    → body เป็น JSON `{ "template": {…} | "templateName": "x.json", "data": {…},
//!                         "sources": { "items": { "query": "invoice_lines", "params": { "id": 1 } } } }`
//!                       คืน `application/pdf`; ข้อผิดพลาดคืน JSON `{ "ok": false, "error": "…" }`
//!                       `sources` รันคิวรี SQL ที่ผู้ดูแลตั้งไว้ฝั่งเซิร์ฟเวอร์ แล้วใส่ผลเป็น array ใน data[ชื่อ]
//!
//! ความปลอดภัยเริ่มต้น:
//! - ไม่โหลดรูปจากดิสก์ของเซิร์ฟเวอร์ (base_dir = None) — รูปต้องฝังในเทมเพลตหรือเป็น data URI
//! - ชื่อ template ห้ามมี path separator หรือ `..`
//! - จำกัดขนาด body ตามค่า `max_body_bytes`
//! - SQL: ไคลเอนต์เลือกได้แค่ชื่อคิวรีและค่าพารามิเตอร์ ผูกเป็น prepared statement เสมอ (ดู sql.rs)
//! - การเรนเดอร์รันใน blocking pool ไม่บล็อก event loop
//!
//! หมายเหตุ: ยังไม่มี rate limit, auth, timeout ต่อคำขอ — ต้องวางหลัง reverse proxy ที่จัดการเรื่องเหล่านี้

use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
pub mod sql;

use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::Arc;

pub struct AppState {
    /// โฟลเดอร์ template สำหรับ `templateName` และ `GET /templates` (None = ปิดฟีเจอร์นี้)
    pub templates_dir: Option<PathBuf>,
    /// ฟอนต์ที่ใช้ได้ (family → ไบต์) โหลดครั้งเดียวตอนเริ่ม
    pub fonts: HashMap<String, Vec<u8>>,
    /// ฐานข้อมูลสำหรับ `sources` (None = ไม่ได้ตั้งค่า ใช้ sources ไม่ได้)
    pub db: Option<sqlx::SqlitePool>,
    /// โฟลเดอร์ไฟล์คิวรี `*.sql` (ไคลเอนต์เรียกได้เฉพาะชื่อ)
    pub queries_dir: Option<PathBuf>,
    /// จำนวนแถวสูงสุดต่อคิวรี
    pub max_query_rows: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenderRequest {
    template: Option<Value>,
    template_name: Option<String>,
    #[serde(default)]
    data: Value,
    #[serde(default)]
    sources: BTreeMap<String, SourceRef>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceRef {
    query: String,
    #[serde(default)]
    params: Map<String, Value>,
}

/// สร้าง router ทั้งหมด (ใช้ทั้งเซิร์ฟเวอร์จริงและเทสต์)
pub fn app(state: Arc<AppState>, max_body_bytes: usize) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/templates", get(list_templates))
        .route("/render", post(render))
        .layer(DefaultBodyLimit::max(max_body_bytes))
        .with_state(state)
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true, "version": env!("CARGO_PKG_VERSION") }))
}

async fn list_templates(State(state): State<Arc<AppState>>) -> Json<Value> {
    let mut names: Vec<String> = match &state.templates_dir {
        Some(dir) => std::fs::read_dir(dir)
            .map(|rd| {
                rd.filter_map(|e| e.ok())
                    .filter_map(|e| e.file_name().into_string().ok())
                    .filter(|n| is_template_name(n))
                    .collect()
            })
            .unwrap_or_default(),
        None => Vec::new(),
    };
    names.sort();
    Json(json!({ "templates": names }))
}

/// ชื่อไฟล์ที่ยอมรับ: ลงท้าย .json (แต่ไม่ใช่ไฟล์ข้อมูล *.data.json), อักขระ [A-Za-z0-9._-] เท่านั้น, ไม่มี `..`
pub fn is_template_name(name: &str) -> bool {
    name.ends_with(".json")
        && !name.ends_with(".data.json")
        && !name.contains("..")
        && name.len() <= 128
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

async fn render(State(state): State<Arc<AppState>>, body: Bytes) -> Response {
    let req: RenderRequest = match serde_json::from_slice(&body) {
        Ok(r) => r,
        Err(e) => return error(StatusCode::BAD_REQUEST, format!("body ไม่ใช่ JSON ที่ถูกต้อง: {e}")),
    };
    let template_json = match (req.template, req.template_name) {
        (Some(t), None) => t.to_string(),
        (None, Some(name)) => match load_named(&state, &name) {
            Ok(text) => text,
            Err((status, msg)) => return error(status, msg),
        },
        (Some(_), Some(_)) => return error(StatusCode::BAD_REQUEST, "ระบุ template หรือ templateName อย่างใดอย่างหนึ่ง".into()),
        (None, None) => return error(StatusCode::BAD_REQUEST, "ต้องระบุ template หรือ templateName".into()),
    };
    let data = match attach_sources(&state, req.data, &req.sources).await {
        Ok(d) => d,
        Err((status, msg)) => return error(status, msg),
    };
    let outcome = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, String> {
        let template = tr_core::Template::from_json(&template_json)?;
        tr_pdf::render_template(&template, &data, &state.fonts, None)
    })
    .await;
    match outcome {
        Ok(Ok(pdf)) => (
            [
                (header::CONTENT_TYPE, "application/pdf"),
                (header::CONTENT_DISPOSITION, "inline"),
            ],
            pdf,
        )
            .into_response(),
        Ok(Err(e)) => error(StatusCode::BAD_REQUEST, e),
        Err(_) => error(StatusCode::INTERNAL_SERVER_ERROR, "การเรนเดอร์ล้มเหลวภายใน".into()),
    }
}

/// รันคิวรีของ `sources` แล้วใส่ผลลง data[ชื่อ] (ข้อมูลที่ส่งมาเองถูกเขียนทับเฉพาะชื่อที่ระบุ)
async fn attach_sources(
    state: &AppState,
    data: Value,
    sources: &BTreeMap<String, SourceRef>,
) -> Result<Value, (StatusCode, String)> {
    if sources.is_empty() {
        return Ok(data);
    }
    let Some(pool) = &state.db else {
        return Err((StatusCode::BAD_REQUEST, "ไม่ได้ตั้งค่าฐานข้อมูล (TR_DATABASE_URL)".into()));
    };
    let Some(dir) = &state.queries_dir else {
        return Err((StatusCode::BAD_REQUEST, "ไม่ได้ตั้งค่าโฟลเดอร์คิวรี (TR_QUERIES_DIR)".into()));
    };
    let mut data = match data {
        Value::Object(m) => m,
        Value::Null => Map::new(),
        _ => return Err((StatusCode::BAD_REQUEST, "data ต้องเป็น object เมื่อใช้ sources".into())),
    };
    for (key, src) in sources {
        if key.is_empty() || key.len() > 64 {
            return Err((StatusCode::BAD_REQUEST, "ชื่อ source ต้องยาว 1–64 ตัวอักษร".into()));
        }
        let text = sql::load_query(dir, &src.query).map_err(query_status)?;
        let rows = sql::run(pool, &text, &src.params, state.max_query_rows).await.map_err(query_status)?;
        data.insert(key.clone(), Value::Array(rows));
    }
    Ok(Value::Object(data))
}

fn query_status(e: sql::QueryError) -> (StatusCode, String) {
    let status = match e {
        sql::QueryError::NotFound(_) => StatusCode::NOT_FOUND,
        sql::QueryError::Database => StatusCode::INTERNAL_SERVER_ERROR,
        sql::QueryError::TooManyRows(_) => StatusCode::UNPROCESSABLE_ENTITY,
        _ => StatusCode::BAD_REQUEST,
    };
    (status, e.to_string())
}

fn load_named(state: &AppState, name: &str) -> Result<String, (StatusCode, String)> {
    if !is_template_name(name) {
        return Err((StatusCode::BAD_REQUEST, "ชื่อ template ไม่ถูกต้อง".into()));
    }
    let Some(dir) = &state.templates_dir else {
        return Err((StatusCode::NOT_FOUND, "ไม่ได้ตั้งโฟลเดอร์ template".into()));
    };
    std::fs::read_to_string(dir.join(name)).map_err(|_| (StatusCode::NOT_FOUND, format!("ไม่พบ template {name}")))
}

fn error(status: StatusCode, message: String) -> Response {
    (status, Json(json!({ "ok": false, "error": message }))).into_response()
}

/// โหลดฟอนต์จากโฟลเดอร์ — ต้องมี Sarabun-Regular เพราะ engine ใช้เป็นค่าเริ่มต้น
pub fn load_fonts(dir: &std::path::Path) -> Result<HashMap<String, Vec<u8>>, String> {
    let fonts = tr_text::load_bundled_fonts(dir);
    if !fonts.contains_key("Sarabun") {
        return Err(format!("ไม่พบ Sarabun-Regular.ttf ในโฟลเดอร์ {}", dir.display()));
    }
    Ok(fonts)
}
