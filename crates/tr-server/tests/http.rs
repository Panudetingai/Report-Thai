//! ทดสอบ HTTP API ในโปรเซส (ไม่เปิดพอร์ต): ทางสำเร็จ, ข้อผิดพลาด, กันการอ่านไฟล์นอกโฟลเดอร์, ขนาด body

use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use tower::ServiceExt;
use tr_server::{app, load_fonts, AppState};

fn fonts_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fonts")
}

fn router(templates_dir: Option<PathBuf>, max_body: usize) -> axum::Router {
    let fonts = load_fonts(&fonts_dir()).expect("ฟอนต์");
    app(Arc::new(AppState { templates_dir, fonts }), max_body)
}

fn small_template() -> Value {
    json!({
        "schemaVersion": "1.0",
        "page": { "size": "A4", "margin": [15, 15, 15, 15] },
        "fonts": [{ "family": "Sarabun", "embed": true }],
        "bands": [
            { "type": "title", "height": 12, "elements": [
                { "type": "text", "x": 0, "y": 2, "w": 180, "h": 8, "font": "Sarabun", "size": 14, "text": "ใบเสร็จ", "overflow": "wrap" } ] },
            { "type": "detail", "dataSource": "items", "height": 6, "elements": [
                { "type": "text", "x": 0, "y": 0, "w": 120, "h": 5, "font": "Sarabun", "size": 9, "text": "{{ item.name }}", "overflow": "wrap" } ] }
        ]
    })
}

async fn send(r: axum::Router, req: Request<Body>) -> (StatusCode, header::HeaderMap, Vec<u8>) {
    let res = r.oneshot(req).await.expect("oneshot");
    let status = res.status();
    let headers = res.headers().clone();
    let bytes = res.into_body().collect().await.expect("body").to_bytes().to_vec();
    (status, headers, bytes)
}

fn post_json(path: &str, body: &Value) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(path)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn get(path: &str) -> Request<Body> {
    Request::builder().uri(path).body(Body::empty()).unwrap()
}

#[tokio::test]
async fn health_reports_version() {
    let (status, _, body) = send(router(None, 1 << 20), get("/health")).await;
    assert_eq!(status, StatusCode::OK);
    let v: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(v["ok"], true);
    assert_eq!(v["version"], env!("CARGO_PKG_VERSION"));
}

#[tokio::test]
async fn render_inline_template_returns_pdf() {
    let body = json!({ "template": small_template(), "data": { "items": [{ "name": "ปากกา" }, { "name": "สมุด" }] } });
    let (status, headers, bytes) = send(router(None, 1 << 20), post_json("/render", &body)).await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&bytes));
    assert_eq!(headers[header::CONTENT_TYPE], "application/pdf");
    assert!(bytes.starts_with(b"%PDF-"));
}

#[tokio::test]
async fn render_errors_are_json_with_reason() {
    let r = router(None, 1 << 20);
    // JSON เสีย
    let (s, _, b) = send(r.clone(), Request::builder().method("POST").uri("/render").body(Body::from("{ไม่ใช่")).unwrap()).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    assert_eq!(serde_json::from_slice::<Value>(&b).unwrap()["ok"], false);
    // template ผิด
    let (s, _, b) = send(r.clone(), post_json("/render", &json!({ "template": { "page": { "size": "ไม่มีจริง" } } }))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    assert!(serde_json::from_slice::<Value>(&b).unwrap()["error"].as_str().is_some());
    // ไม่ระบุ template / ระบุทั้งสองแบบ
    let (s, _, _) = send(r.clone(), post_json("/render", &json!({ "data": {} }))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    let (s, _, _) = send(r, post_json("/render", &json!({ "template": small_template(), "templateName": "a.json" }))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn named_templates_listed_loaded_and_guarded() {
    let dir = std::env::temp_dir().join(format!("tr-server-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("invoice.json"), small_template().to_string()).unwrap();
    std::fs::write(dir.join("notes.txt"), "ไม่ใช่ template").unwrap();
    std::fs::write(dir.join("ok-1.json"), small_template().to_string()).unwrap();
    std::fs::write(dir.join("invoice.data.json"), "{}").unwrap(); // ไฟล์ข้อมูล ไม่ใช่ template
    let r = router(Some(dir.clone()), 1 << 20);

    let (s, _, b) = send(r.clone(), get("/templates")).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(serde_json::from_slice::<Value>(&b).unwrap()["templates"], json!(["invoice.json", "ok-1.json"]));

    let (s, h, _) = send(r.clone(), post_json("/render", &json!({ "templateName": "invoice.json", "data": { "items": [] } }))).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(h[header::CONTENT_TYPE], "application/pdf");

    // กันการอ่านไฟล์นอกโฟลเดอร์
    for bad in ["../../etc/passwd", "sub/x.json", "..json", "a b.json", "notes.txt", "invoice.data.json"] {
        let (s, _, _) = send(r.clone(), post_json("/render", &json!({ "templateName": bad }))).await;
        assert_eq!(s, StatusCode::BAD_REQUEST, "{bad} ต้องถูกปฏิเสธ");
    }
    let (s, _, _) = send(r.clone(), post_json("/render", &json!({ "templateName": "missing.json" }))).await;
    assert_eq!(s, StatusCode::NOT_FOUND);

    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn templates_disabled_without_folder() {
    let (s, _, b) = send(router(None, 1 << 20), get("/templates")).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(serde_json::from_slice::<Value>(&b).unwrap()["templates"], json!([]));
    let (s, _, _) = send(router(None, 1 << 20), post_json("/render", &json!({ "templateName": "a.json" }))).await;
    assert_eq!(s, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn oversized_body_is_rejected() {
    let big = "x".repeat(4096);
    let body = json!({ "template": small_template(), "data": { "pad": big } });
    let (s, _, _) = send(router(None, 1024), post_json("/render", &body)).await;
    assert_eq!(s, StatusCode::PAYLOAD_TOO_LARGE);
}

#[tokio::test]
async fn grouped_template_renders_over_http() {
    let t = json!({
        "schemaVersion": "1.0",
        "page": { "size": "A4", "margin": [15, 15, 15, 15] },
        "fonts": [{ "family": "Sarabun", "embed": true }],
        "bands": [
            { "type": "groupHeader", "groupBy": "item.cat", "height": 6, "elements": [
                { "type": "text", "x": 0, "y": 0, "w": 120, "h": 5, "font": "Sarabun", "size": 9, "text": "หมวด {{ group.value }}", "overflow": "wrap" } ] },
            { "type": "detail", "dataSource": "items", "height": 5, "elements": [
                { "type": "text", "x": 0, "y": 0, "w": 120, "h": 4, "font": "Sarabun", "size": 9, "text": "{{ item.name }}", "overflow": "wrap" } ] },
            { "type": "groupFooter", "height": 6, "elements": [
                { "type": "text", "x": 0, "y": 0, "w": 120, "h": 5, "font": "Sarabun", "size": 9, "text": "รวม {{ sum(item.qty) }}", "overflow": "wrap" } ] }
        ]
    });
    let data = json!({ "items": [{ "cat": "A", "name": "ก", "qty": 2 }, { "cat": "A", "name": "ข", "qty": 3 }, { "cat": "B", "name": "ค", "qty": 1 }] });
    let (s, _, b) = send(router(None, 1 << 20), post_json("/render", &json!({ "template": t, "data": data }))).await;
    assert_eq!(s, StatusCode::OK, "{}", String::from_utf8_lossy(&b));
    assert!(b.starts_with(b"%PDF-"));
}
