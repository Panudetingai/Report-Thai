//! tr-mcp: MCP server ของ ThaiReport (stdio)
//!
//! tools: get_template_guide, list_templates, get_template, validate_template, preview_template (PNG),
//! render_report (PDF), save_template — ดู `server.rs`
//!
//! ตัวแปรสภาพแวดล้อม (path สัมพัทธ์อิงโฟลเดอร์ที่รันคำสั่ง):
//! - `TR_FONTS_DIR`      โฟลเดอร์ฟอนต์ (ค่าเริ่มต้น ./fonts)
//! - `TR_TEMPLATES_DIR`  โฟลเดอร์ template (ค่าเริ่มต้น ./templates)
//! - `TR_OUTPUT_DIR`     โฟลเดอร์ที่เขียน PDF (ค่าเริ่มต้น ./out)
//!
//! stdout ใช้คุยโปรโตคอลเท่านั้น — ข้อความถึงผู้ใช้เขียนลง stderr

use rmcp::ServiceExt;
use std::path::PathBuf;
use tr_mcp::server::ThaiReportServer;
use tr_mcp::Engine;

fn dir(var: &str, default: &str) -> PathBuf {
    PathBuf::from(std::env::var(var).unwrap_or_else(|_| default.to_string()))
}

#[tokio::main]
async fn main() {
    let fonts_dir = dir("TR_FONTS_DIR", "fonts");
    let fonts = tr_text::load_bundled_fonts(&fonts_dir);
    if !fonts.contains_key("Sarabun") {
        eprintln!("tr-mcp เริ่มไม่ได้: ไม่พบ Sarabun-Regular.ttf ใน {} (ตั้ง TR_FONTS_DIR)", fonts_dir.display());
        std::process::exit(1);
    }
    let engine = Engine {
        fonts,
        templates_dir: dir("TR_TEMPLATES_DIR", "templates"),
        output_dir: dir("TR_OUTPUT_DIR", "out"),
    };
    eprintln!(
        "tr-mcp พร้อม (templates: {}, output: {})",
        engine.templates_dir.display(),
        engine.output_dir.display()
    );
    let service = match ThaiReportServer::new(engine).serve(rmcp::transport::stdio()).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("tr-mcp เริ่ม MCP ไม่สำเร็จ: {e}");
            std::process::exit(1);
        }
    };
    if let Err(e) = service.waiting().await {
        eprintln!("tr-mcp หยุดทำงาน: {e}");
        std::process::exit(1);
    }
}
