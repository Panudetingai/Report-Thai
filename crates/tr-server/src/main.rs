//! tr-server: เริ่มเซิร์ฟเวอร์ HTTP ของ ThaiReport
//!
//! ตัวแปรสภาพแวดล้อม:
//! - `TR_BIND`            ที่อยู่ที่ฟัง (ค่าเริ่มต้น 127.0.0.1:8080)
//! - `TR_FONTS_DIR`       โฟลเดอร์ฟอนต์ (ค่าเริ่มต้น ./fonts)
//! - `TR_TEMPLATES_DIR`   โฟลเดอร์ template (ไม่ตั้ง = ปิด templateName)
//! - `TR_MAX_BODY_MB`     ขนาด body สูงสุดหน่วย MB (ค่าเริ่มต้น 5)
//! - `TR_DATABASE_URL`    เช่น sqlite://data/app.db (ไม่ตั้ง = ปิด sources)
//! - `TR_QUERIES_DIR`     โฟลเดอร์ไฟล์ *.sql ที่ผู้ดูแลเขียน (ไม่ตั้ง = ปิด sources)
//! - `TR_MAX_QUERY_ROWS`  เพดานแถวต่อคิวรี (ค่าเริ่มต้น 10000)

use std::path::PathBuf;
use std::sync::Arc;
use tr_server::{app, load_fonts, AppState};

#[tokio::main]
async fn main() {
    let bind = std::env::var("TR_BIND").unwrap_or_else(|_| "127.0.0.1:8080".to_string());
    let fonts_dir = PathBuf::from(std::env::var("TR_FONTS_DIR").unwrap_or_else(|_| "fonts".to_string()));
    let templates_dir = std::env::var("TR_TEMPLATES_DIR").ok().map(PathBuf::from);
    let max_mb: usize = std::env::var("TR_MAX_BODY_MB").ok().and_then(|v| v.parse().ok()).unwrap_or(5);

    let fonts = match load_fonts(&fonts_dir) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("tr-server เริ่มไม่ได้: {e} (ตั้ง TR_FONTS_DIR)");
            std::process::exit(1);
        }
    };
    let db = match std::env::var("TR_DATABASE_URL") {
        Ok(url) => match sqlx::sqlite::SqlitePoolOptions::new().max_connections(5).connect(&url).await {
            Ok(pool) => Some(pool),
            Err(e) => {
                eprintln!("เชื่อมฐานข้อมูลไม่สำเร็จ: {e}");
                std::process::exit(1);
            }
        },
        Err(_) => None,
    };
    let queries_dir = std::env::var("TR_QUERIES_DIR").ok().map(PathBuf::from);
    let max_query_rows: usize = std::env::var("TR_MAX_QUERY_ROWS").ok().and_then(|v| v.parse().ok()).unwrap_or(10_000);
    let state = Arc::new(AppState { templates_dir, fonts, db, queries_dir, max_query_rows });
    let listener = match tokio::net::TcpListener::bind(&bind).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("bind {bind} ไม่สำเร็จ: {e}");
            std::process::exit(1);
        }
    };
    println!("tr-server ฟังที่ http://{bind}");
    axum::serve(listener, app(state, max_mb * 1024 * 1024)).await.expect("serve");
}
