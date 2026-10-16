//! tr-server: เริ่มเซิร์ฟเวอร์ HTTP ของ ThaiReport
//!
//! ตัวแปรสภาพแวดล้อม:
//! - `TR_BIND`            ที่อยู่ที่ฟัง (ค่าเริ่มต้น 127.0.0.1:8080)
//! - `TR_FONTS_DIR`       โฟลเดอร์ฟอนต์ (ค่าเริ่มต้น ./fonts)
//! - `TR_TEMPLATES_DIR`   โฟลเดอร์ template (ไม่ตั้ง = ปิด templateName)
//! - `TR_MAX_BODY_MB`     ขนาด body สูงสุดหน่วย MB (ค่าเริ่มต้น 5)

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
    let state = Arc::new(AppState { templates_dir, fonts });
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
