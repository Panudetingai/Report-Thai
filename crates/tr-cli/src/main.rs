//! thaireport CLI — `thaireport render template.json data.json -o out.pdf`
//! (สเปก 4.4: CLI)

use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "thaireport", about = "ThaiReport — report engine ไทย-first", version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// เรนเดอร์ template + data เป็น PDF
    Render {
        /// ไฟล์ template JSON
        template: PathBuf,
        /// ไฟล์ data JSON
        data: PathBuf,
        /// ไฟล์ PDF ผลลัพธ์
        #[arg(short, long)]
        output: PathBuf,
        /// โฟลเดอร์ฟอนต์ (ค่าเริ่มต้น: fonts/ ข้างๆ binary หรือ ./fonts)
        #[arg(long)]
        fonts: Option<PathBuf>,
    },
    /// ตรวจ template ว่าถูกต้องไหม (ใส่ data ด้วยเพื่อตรวจว่าทุกฟิลด์ใน {{ }} มีในข้อมูล)
    Validate {
        /// ไฟล์ template JSON
        template: PathBuf,
        /// ไฟล์ data JSON (ไม่บังคับ)
        data: Option<PathBuf>,
    },
}

fn resolve_fonts_dir(explicit: Option<PathBuf>) -> PathBuf {
    if let Some(p) = explicit {
        return p;
    }
    // 1) ./fonts (รันจาก root repo) 2) ข้างๆ executable
    let cwd = PathBuf::from("fonts");
    if cwd.is_dir() {
        return cwd;
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(d) = exe.parent() {
            let p = d.join("fonts");
            if p.is_dir() {
                return p;
            }
        }
    }
    cwd
}

fn main() {
    let cli = Cli::parse();
    match cli.command {
        Commands::Render { template, data, output, fonts } => {
            if let Err(e) = run_render(&template, &data, &output, fonts) {
                eprintln!("ผิดพลาด: {e}");
                std::process::exit(1);
            }
        }
        Commands::Validate { template, data } => match run_validate(&template, data.as_deref()) {
            Ok(warnings) if warnings.is_empty() => println!("template ถูกต้อง"),
            Ok(warnings) => {
                println!("template ถูกต้อง แต่มีคำเตือน {} ข้อ:", warnings.len());
                for w in warnings {
                    println!("  - {w}");
                }
            }
            Err(e) => {
                eprintln!("template ไม่ผ่าน: {e}");
                std::process::exit(1);
            }
        },
    }
}

/// คืนคำเตือนการผูกข้อมูล (ว่างถ้าไม่ได้ส่ง data)
fn run_validate(template_path: &std::path::Path, data_path: Option<&std::path::Path>) -> Result<Vec<String>, String> {
    let s = std::fs::read_to_string(template_path)
        .map_err(|e| format!("อ่าน {} ไม่สำเร็จ: {e}", template_path.display()))?;
    let t = tr_core::Template::from_json(&s)?;
    t.validate()?;
    let Some(dp) = data_path else { return Ok(vec![]) };
    let ds = std::fs::read_to_string(dp).map_err(|e| format!("อ่าน {} ไม่สำเร็จ: {e}", dp.display()))?;
    let data: serde_json::Value = serde_json::from_str(&ds).map_err(|e| format!("parse data ไม่สำเร็จ: {e}"))?;
    Ok(tr_core::check::check_bindings(&t, &data))
}

fn run_render(
    template_path: &std::path::Path,
    data_path: &std::path::Path,
    output: &std::path::Path,
    fonts_opt: Option<PathBuf>,
) -> Result<(), String> {
    let ts = std::fs::read_to_string(template_path)
        .map_err(|e| format!("อ่าน {} ไม่สำเร็จ: {e}", template_path.display()))?;
    let ds = std::fs::read_to_string(data_path)
        .map_err(|e| format!("อ่าน {} ไม่สำเร็จ: {e}", data_path.display()))?;
    let template = tr_core::Template::from_json(&ts)?;
    template.validate()?;
    let data: serde_json::Value =
        serde_json::from_str(&ds).map_err(|e| format!("parse data ไม่สำเร็จ: {e}"))?;

    let fonts_dir = resolve_fonts_dir(fonts_opt);
    let fonts = tr_text::load_bundled_fonts(&fonts_dir);
    if fonts.is_empty() {
        return Err(format!(
            "ไม่พบฟอนต์ใน {} (ต้องมี Sarabun-Regular.ttf อย่างน้อย)",
            fonts_dir.display()
        ));
    }

    for w in tr_core::check::check_bindings(&template, &data) {
        eprintln!("คำเตือน: {w}");
    }
    let base_dir = template_path.parent();
    let pdf = tr_pdf::render_template(&template, &data, &fonts, base_dir)?;
    if let Some(parent) = output.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("สร้างโฟลเดอร์ผลลัพธ์ไม่สำเร็จ: {e}"))?;
        }
    }
    std::fs::write(output, &pdf).map_err(|e| format!("เขียน {} ไม่สำเร็จ: {e}", output.display()))?;
    println!("สร้าง {} สำเร็จ ({} bytes)", output.display(), pdf.len());
    Ok(())
}
