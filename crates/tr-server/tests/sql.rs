//! ทดสอบ sources (SQL ฝั่งเซิร์ฟเวอร์) กับ SQLite ไฟล์จริงชั่วคราว

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::{json, Map, Value};
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;
use std::path::PathBuf;
use std::sync::Arc;
use tower::ServiceExt;
use tr_server::{app, load_fonts, sql, AppState};

struct Fixture {
    dir: PathBuf,
    pool: SqlitePool,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.dir).ok();
    }
}

async fn fixture(tag: &str) -> Fixture {
    let dir = std::env::temp_dir().join(format!("tr-sql-{tag}-{}", std::process::id()));
    std::fs::remove_dir_all(&dir).ok();
    std::fs::create_dir_all(dir.join("queries")).unwrap();
    let db_path = dir.join("app.db");
    let url = format!("sqlite://{}?mode=rwc", db_path.display());
    let pool = SqlitePoolOptions::new().max_connections(2).connect(&url).await.unwrap();
    for stmt in [
        "CREATE TABLE items (id INTEGER PRIMARY KEY, customer_id INTEGER, name TEXT, qty INTEGER, price REAL, note TEXT)",
        "INSERT INTO items (customer_id, name, qty, price, note) VALUES (1, 'ปากกา', 2, 10.5, NULL)",
        "INSERT INTO items (customer_id, name, qty, price, note) VALUES (1, 'สมุด', 3, 25.0, 'หมายเหตุ')",
        "INSERT INTO items (customer_id, name, qty, price, note) VALUES (2, 'ดินสอ', 1, 5.0, NULL)",
    ] {
        sqlx::query(stmt).execute(&pool).await.unwrap();
    }
    std::fs::write(
        dir.join("queries/items_by_customer.sql"),
        "SELECT name, qty, price, note FROM items WHERE customer_id = :cid ORDER BY id",
    )
    .unwrap();
    std::fs::write(dir.join("queries/all_items.sql"), "SELECT name FROM items ORDER BY id").unwrap();
    Fixture { dir, pool }
}

fn fonts() -> std::collections::HashMap<String, Vec<u8>> {
    load_fonts(&PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fonts")).unwrap()
}

fn router(f: &Fixture, max_rows: usize) -> axum::Router {
    app(
        Arc::new(AppState {
            templates_dir: None,
            fonts: fonts(),
            db: Some(f.pool.clone()),
            queries_dir: Some(f.dir.join("queries")),
            max_query_rows: max_rows,
            limits: Default::default(),
        }),
        1 << 20,
    )
}

fn template() -> Value {
    json!({
        "schemaVersion": "1.0",
        "page": { "size": "A4", "margin": [15, 15, 15, 15] },
        "fonts": [{ "family": "Sarabun", "embed": true }],
        "bands": [
            { "type": "groupHeader", "groupBy": "item.name", "height": 6, "elements": [] },
            { "type": "detail", "dataSource": "lines", "height": 5, "elements": [
                { "type": "text", "x": 0, "y": 0, "w": 120, "h": 4, "font": "Sarabun", "size": 9, "text": "{{ item.name }}", "overflow": "wrap" } ] },
            { "type": "summary", "height": 8, "elements": [
                { "type": "text", "x": 0, "y": 0, "w": 120, "h": 5, "font": "Sarabun", "size": 9, "text": "รวม {{ sum(item.qty) }}", "overflow": "wrap" } ] }
        ]
    })
}

async fn post(r: axum::Router, body: Value) -> (StatusCode, Vec<u8>) {
    let req = Request::builder()
        .method("POST")
        .uri("/render")
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();
    let res = r.oneshot(req).await.unwrap();
    let status = res.status();
    (status, res.into_body().collect().await.unwrap().to_bytes().to_vec())
}

#[tokio::test]
async fn render_with_sql_source_returns_pdf() {
    let f = fixture("render").await;
    let body = json!({
        "template": template(),
        "data": {},
        "sources": { "lines": { "query": "items_by_customer", "params": { "cid": 1 } } }
    });
    let (status, bytes) = post(router(&f, 100), body).await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&bytes));
    assert!(bytes.starts_with(b"%PDF-"));
}

#[tokio::test]
async fn rows_come_back_with_typed_values() {
    let f = fixture("typed").await;
    let mut params = Map::new();
    params.insert("cid".into(), json!(1));
    let text = sql::load_query(&f.dir.join("queries"), "items_by_customer").unwrap();
    let rows = sql::run(&f.pool, &text, &params, 100).await.unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0], json!({ "name": "ปากกา", "qty": 2, "price": 10.5, "note": null }));
    assert_eq!(rows[1]["note"], json!("หมายเหตุ"));
}

#[tokio::test]
async fn parameters_are_bound_not_spliced() {
    // ค่าที่พยายาม "ฉีด" SQL ต้องถูกมองเป็นข้อความธรรมดา → ไม่คืนแถวใดเลย
    let f = fixture("inject").await;
    let mut params = Map::new();
    params.insert("cid".into(), json!("1 OR 1=1"));
    let text = sql::load_query(&f.dir.join("queries"), "items_by_customer").unwrap();
    let rows = sql::run(&f.pool, &text, &params, 100).await.unwrap();
    assert!(rows.is_empty(), "ค่าที่ฉีดต้องไม่เปลี่ยนความหมายของคิวรี");
}

#[tokio::test]
async fn query_errors_map_to_clear_statuses() {
    let f = fixture("errors").await;
    let r = router(&f, 100);

    // ขาดพารามิเตอร์
    let (s, b) = post(r.clone(), json!({ "template": template(), "sources": { "lines": { "query": "items_by_customer" } } })).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    assert!(String::from_utf8_lossy(&b).contains("cid"));

    // ไม่มีคิวรี / ชื่อพาธอันตราย
    for q in ["nope", "../secret", "a.b"] {
        let (s, _) = post(r.clone(), json!({ "template": template(), "sources": { "lines": { "query": q, "params": {} } } })).await;
        assert_eq!(s, StatusCode::NOT_FOUND, "{q}");
    }

    // ค่าพารามิเตอร์เป็น object
    let (s, _) = post(r.clone(), json!({ "template": template(), "sources": { "lines": { "query": "items_by_customer", "params": { "cid": { "x": 1 } } } } })).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);

    // data ไม่ใช่ object
    let (s, _) = post(r.clone(), json!({ "template": template(), "data": [1, 2], "sources": { "lines": { "query": "all_items", "params": {} } } })).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);

    // ไม่ได้ตั้งค่าฐานข้อมูล
    let no_db = app(
        Arc::new(AppState { templates_dir: None, fonts: fonts(), db: None, queries_dir: None, max_query_rows: 10, limits: Default::default() }),
        1 << 20,
    );
    let (s, _) = post(no_db, json!({ "template": template(), "sources": { "lines": { "query": "all_items", "params": {} } } })).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn row_cap_is_enforced() {
    let f = fixture("cap").await;
    let mut params = Map::new();
    params.insert("cid".into(), json!(1));
    let text = sql::load_query(&f.dir.join("queries"), "items_by_customer").unwrap();
    let err = sql::run(&f.pool, &text, &params, 1).await.unwrap_err();
    assert_eq!(err, sql::QueryError::TooManyRows(1));
    let (s, _) = post(router(&f, 1), json!({ "template": template(), "sources": { "lines": { "query": "items_by_customer", "params": { "cid": 1 } } } })).await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
}
