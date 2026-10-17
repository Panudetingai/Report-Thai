//! tr-mcp: MCP server ของ ThaiReport — ให้ AI client (Claude ฯลฯ) สร้าง template ตรวจ พรีวิว และออก PDF ได้เอง
//!
//! ส่วนนี้คืองานจริงของแต่ละ tool (ไม่ขึ้นกับ MCP) ทดสอบตรงได้ · การผูกกับโปรโตคอลอยู่ที่ `server.rs`
//!
//! ขอบเขตไฟล์: อ่าน/เขียน template เฉพาะใน `templates_dir` และเขียน PDF เฉพาะใน `output_dir`
//! ชื่อไฟล์ต้องเป็น [A-Za-z0-9._-] ไม่มี path separator หรือ `..` (กติกาเดียวกับ HTTP API)
//! รูปที่อ้างเป็น path อ่านได้เฉพาะ template ที่มีชื่อ (สัมพัทธ์กับ `templates_dir`) — template ที่ส่งมาเองต้องฝังรูปเป็น data URI

pub mod server;

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub struct Engine {
    pub fonts: HashMap<String, Vec<u8>>,
    pub templates_dir: PathBuf,
    pub output_dir: PathBuf,
}

/// template จากชื่อไฟล์ใน `templates_dir` หรือ JSON ที่ส่งมาตรงๆ
pub enum Source {
    Named(String),
    Inline(Value),
}

#[derive(Debug, Serialize, PartialEq)]
pub struct TemplateInfo {
    pub name: String,
    /// ข้อความแรกของ band หัวเรื่อง (ไว้ให้ AI รู้ว่าเป็นเอกสารอะไร)
    pub title: Option<String>,
    pub page: String,
    pub bands: Vec<String>,
    /// มีไฟล์ข้อมูลตัวอย่าง `<ชื่อ>.data.json` คู่กัน
    pub has_sample_data: bool,
}

#[derive(Debug, Serialize)]
pub struct Validation {
    pub ok: bool,
    /// ใช้ไม่ได้ (โครงสร้างผิด / จัดหน้าไม่ได้ เช่นข้อความล้นกรอบที่ตั้ง overflow = error)
    pub errors: Vec<String>,
    /// ใช้ได้แต่น่าจะผิด (ฟิลด์ไม่มีในข้อมูล ฯลฯ)
    pub warnings: Vec<String>,
    /// จำนวนหน้าเมื่อจัดกับข้อมูลที่ให้มา (None ถ้าจัดหน้าไม่ได้)
    pub pages: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct Rendered {
    pub path: String,
    pub pages: usize,
    pub bytes: usize,
    pub warnings: Vec<String>,
}

/// ชื่อ template ที่ยอมรับ (เหมือน tr-server): ลงท้าย .json แต่ไม่ใช่ .data.json, อักขระปลอดภัยเท่านั้น
pub fn is_template_name(name: &str) -> bool {
    name.ends_with(".json")
        && !name.ends_with(".data.json")
        && is_safe_file_name(name)
}

fn is_safe_file_name(name: &str) -> bool {
    !name.is_empty()
        && !name.contains("..")
        && !name.starts_with('.')
        && name.len() <= 128
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// เติม .json ให้ชื่อที่ไม่มีนามสกุล ("receipt" → "receipt.json") แล้วตรวจความปลอดภัย
pub fn normalize_template_name(name: &str) -> Result<String, String> {
    let n = name.trim();
    let n = if n.ends_with(".json") { n.to_string() } else { format!("{n}.json") };
    if is_template_name(&n) {
        Ok(n)
    } else {
        Err(format!("ชื่อ template '{name}' ใช้ไม่ได้ — ใช้ตัวอักษรอังกฤษ ตัวเลข . _ - เท่านั้น (เช่น invoice.json)"))
    }
}

fn data_file_for(template_name: &str) -> String {
    format!("{}.data.json", template_name.trim_end_matches(".json"))
}

fn read_json(path: &Path) -> Result<Value, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("อ่าน {} ไม่ได้: {e}", path.display()))?;
    let v: Value = serde_json::from_str(&text).map_err(|e| format!("{} ไม่ใช่ JSON ที่ถูกต้อง: {e}", path.display()))?;
    Ok(unwrap_json_string(v))
}

/// AI client บางตัวส่ง object มาเป็น "ข้อความ JSON" — ถ้าเป็นข้อความที่แปลงเป็น object/array ได้ ใช้ค่าที่แปลงแล้ว
/// (รวมไฟล์ที่เคยถูกบันทึกเป็นข้อความไว้ก่อนหน้า)
pub fn unwrap_json_string(v: Value) -> Value {
    if let Value::String(s) = &v {
        if let Ok(inner @ (Value::Object(_) | Value::Array(_))) = serde_json::from_str::<Value>(s) {
            return inner;
        }
    }
    v
}

impl Engine {
    pub fn list_templates(&self) -> Result<Vec<TemplateInfo>, String> {
        let rd = std::fs::read_dir(&self.templates_dir)
            .map_err(|e| format!("เปิดโฟลเดอร์ template {} ไม่ได้: {e}", self.templates_dir.display()))?;
        let mut names: Vec<String> = rd
            .filter_map(|e| e.ok()?.file_name().into_string().ok())
            .filter(|n| is_template_name(n))
            .collect();
        names.sort();
        Ok(names
            .into_iter()
            .map(|name| {
                let t = read_json(&self.templates_dir.join(&name)).ok();
                let bands = t
                    .as_ref()
                    .and_then(|t| t["bands"].as_array().cloned())
                    .unwrap_or_default();
                let title = bands
                    .iter()
                    .find(|b| b["type"] == "title")
                    .and_then(|b| b["elements"].as_array()?.iter().find_map(|e| e["text"].as_str().map(str::to_string)));
                let page = t
                    .as_ref()
                    .map(|t| {
                        let p = &t["page"];
                        format!("{} {}", p["size"].as_str().unwrap_or("A4"), p["orientation"].as_str().unwrap_or("portrait"))
                    })
                    .unwrap_or_default();
                TemplateInfo {
                    has_sample_data: self.templates_dir.join(data_file_for(&name)).exists(),
                    title,
                    page,
                    bands: bands.iter().filter_map(|b| b["type"].as_str().map(str::to_string)).collect(),
                    name,
                }
            })
            .collect())
    }

    /// template + ข้อมูลตัวอย่าง (ถ้ามี)
    pub fn get_template(&self, name: &str) -> Result<(Value, Option<Value>), String> {
        let name = normalize_template_name(name)?;
        let path = self.templates_dir.join(&name);
        if !path.exists() {
            return Err(format!("ไม่พบ template '{name}' — เรียก list_templates เพื่อดูชื่อที่มี"));
        }
        let data_path = self.templates_dir.join(data_file_for(&name));
        let data = if data_path.exists() { Some(read_json(&data_path)?) } else { None };
        Ok((read_json(&path)?, data))
    }

    /// บันทึก template (และข้อมูลตัวอย่าง) ลง `templates_dir` — ตรวจก่อนบันทึก ไม่เขียนทับถ้าไม่ได้สั่ง
    pub fn save_template(&self, name: &str, template: &Value, sample_data: Option<&Value>, overwrite: bool) -> Result<String, String> {
        let name = normalize_template_name(name)?;
        let template = &unwrap_json_string(template.clone());
        let sample_data = sample_data.cloned().map(unwrap_json_string);
        if sample_data.as_ref().is_some_and(|d| !d.is_object()) {
            return Err("sample_data ต้องเป็น JSON object เช่น { \"items\": [...] }".into());
        }
        let sample_data = sample_data.as_ref();
        let parsed = tr_core::Template::from_json(&template.to_string())?;
        parsed.validate()?;
        let path = self.templates_dir.join(&name);
        if path.exists() && !overwrite {
            return Err(format!("มี template '{name}' อยู่แล้ว — ส่ง overwrite: true ถ้าต้องการแทนที่"));
        }
        std::fs::create_dir_all(&self.templates_dir).map_err(|e| e.to_string())?;
        let pretty = |v: &Value| serde_json::to_string_pretty(v).unwrap_or_default() + "\n";
        std::fs::write(&path, pretty(template)).map_err(|e| format!("บันทึก {} ไม่ได้: {e}", path.display()))?;
        if let Some(d) = sample_data {
            let dp = self.templates_dir.join(data_file_for(&name));
            std::fs::write(&dp, pretty(d)).map_err(|e| format!("บันทึก {} ไม่ได้: {e}", dp.display()))?;
        }
        Ok(name)
    }

    /// template + data ที่จะใช้จริง: ชื่อ → อ่านไฟล์ (ไม่ส่ง data มาใช้ข้อมูลตัวอย่างคู่กัน)
    fn resolve(&self, source: Source, data: Option<Value>) -> Result<(tr_core::Template, Value, Option<PathBuf>, String), String> {
        match source {
            Source::Named(name) => {
                let (t, sample) = self.get_template(&name)?;
                let stem = normalize_template_name(&name)?.trim_end_matches(".json").to_string();
                let data = data.or(sample).unwrap_or(Value::Object(Default::default()));
                Ok((tr_core::Template::from_json(&t.to_string())?, data, Some(self.templates_dir.clone()), stem))
            }
            Source::Inline(t) => {
                let data = data.unwrap_or(Value::Object(Default::default()));
                Ok((tr_core::Template::from_json(&t.to_string())?, data, None, "report".to_string()))
            }
        }
    }

    pub fn validate(&self, source: Source, data: Option<Value>) -> Validation {
        let (template, data, base, _) = match self.resolve(source, data) {
            Ok(r) => r,
            Err(e) => return Validation { ok: false, errors: vec![e], warnings: vec![], pages: None },
        };
        if let Err(e) = template.validate() {
            return Validation { ok: false, errors: vec![e], warnings: vec![], pages: None };
        }
        let warnings = tr_core::check::check_bindings(&template, &data);
        match tr_pdf::page_texts(&template, &data, &self.fonts, base.as_deref()) {
            Ok(pages) => Validation { ok: true, errors: vec![], warnings, pages: Some(pages.len()) },
            Err(e) => Validation { ok: false, errors: vec![e], warnings, pages: None },
        }
    }

    /// เรนเดอร์ PDF ลง `output_dir` — `output` = ชื่อไฟล์ (ไม่ระบุ = ตั้งจากชื่อ template + เวลา)
    pub fn render(&self, source: Source, data: Option<Value>, output: Option<&str>) -> Result<(Rendered, Vec<u8>), String> {
        let (template, data, base, stem) = self.resolve(source, data)?;
        let warnings = tr_core::check::check_bindings(&template, &data);
        let (pdf, pages) = tr_pdf::render_template_counted(&template, &data, &self.fonts, base.as_deref())?;
        let file = match output {
            Some(o) => {
                let o = o.trim();
                let o = if o.to_ascii_lowercase().ends_with(".pdf") { o.to_string() } else { format!("{o}.pdf") };
                if !is_safe_file_name(&o) {
                    return Err(format!("ชื่อไฟล์ '{o}' ใช้ไม่ได้ — ใช้ตัวอักษรอังกฤษ ตัวเลข . _ - เท่านั้น"));
                }
                o
            }
            None => {
                let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
                format!("{stem}-{secs}.pdf")
            }
        };
        std::fs::create_dir_all(&self.output_dir).map_err(|e| format!("สร้างโฟลเดอร์ {} ไม่ได้: {e}", self.output_dir.display()))?;
        let path = self.output_dir.join(&file);
        std::fs::write(&path, &pdf).map_err(|e| format!("เขียน {} ไม่ได้: {e}", path.display()))?;
        let abs = std::fs::canonicalize(&path).unwrap_or(path);
        Ok((Rendered { path: abs.display().to_string(), pages, bytes: pdf.len(), warnings }, pdf))
    }

    /// ภาพ PNG ของหน้าที่ `page` (เริ่ม 1) — คืน (png, จำนวนหน้าทั้งหมด)
    /// `scale` 1.0 = 72 dpi (A4 ≈ 595×842 px)
    pub fn preview(&self, source: Source, data: Option<Value>, page: usize, scale: f32) -> Result<(Vec<u8>, usize), String> {
        let (template, data, base, _) = self.resolve(source, data)?;
        let (pdf, pages) = tr_pdf::render_template_counted(&template, &data, &self.fonts, base.as_deref())?;
        if page == 0 || page > pages {
            return Err(format!("หน้า {page} ไม่มี — รายงานนี้มี {pages} หน้า"));
        }
        Ok((pdf_page_png(pdf, page - 1, scale)?, pages))
    }
}

/// แปลงหน้าหนึ่งของ PDF เป็น PNG (hayro — ใช้ฟอนต์ที่ฝังใน PDF จึงได้ภาพเหมือนไฟล์จริง)
pub fn pdf_page_png(pdf: Vec<u8>, index: usize, scale: f32) -> Result<Vec<u8>, String> {
    use hayro::hayro_interpret::InterpreterSettings;
    let doc = hayro::hayro_syntax::Pdf::new(pdf).map_err(|e| format!("อ่าน PDF เพื่อทำภาพไม่ได้: {e:?}"))?;
    let scale = scale.clamp(0.25, 4.0);
    let pixmaps = hayro::render_pdf(&doc, scale, InterpreterSettings::default(), Some(index..=index)).ok_or("ทำภาพจาก PDF ไม่ได้")?;
    let px = pixmaps.into_iter().next().ok_or("ไม่พบหน้าที่ต้องการใน PDF")?;
    px.into_png().map_err(|e| format!("เข้ารหัส PNG ไม่ได้: {e}"))
}
