//! ผูก `Engine` เข้ากับ MCP (rmcp) — tool ละหนึ่งเมธอด งานหนัก (จัดหน้า/เรนเดอร์) รันใน blocking pool
//!
//! ข้อผิดพลาดจากข้อมูลของผู้ใช้ (template ผิด ชื่อไม่มี ฯลฯ) คืนเป็นผลลัพธ์ `isError` พร้อมข้อความ
//! ให้ AI อ่านแล้วแก้เองได้ — ไม่ใช่ protocol error

use crate::{Engine, Source};
use base64::Engine as _;
use rmcp::handler::server::{router::tool::ToolRouter, wrapper::Parameters};
use rmcp::model::{CallToolResult, ContentBlock, Implementation, ServerCapabilities, ServerConfig};
use rmcp::{tool, tool_handler, tool_router, ErrorData, ServerHandler};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

pub const GUIDE: &str = include_str!("guide.md");

const INSTRUCTIONS: &str = "ThaiReport: สร้างรายงาน/เอกสาร PDF ภาษาไทยจาก template JSON + data JSON. \
Call get_template_guide before writing a template. Workflow: list_templates/get_template → write template → \
validate_template (fix errors and warnings) → preview_template (check the PNG) → render_report (PDF file).";

#[derive(Clone)]
pub struct ThaiReportServer {
    engine: Arc<Engine>,
    tool_router: ToolRouter<Self>,
}

/// template จากชื่อ หรือ JSON ตรงๆ (ระบุอย่างใดอย่างหนึ่ง)
#[derive(Debug, Deserialize, JsonSchema)]
pub struct TemplateArgs {
    /// Name of a saved template from list_templates, e.g. "receipt.json"
    #[serde(default)]
    pub template_name: Option<String>,
    /// Full template JSON object (see get_template_guide). Use this OR template_name.
    #[serde(default)]
    pub template: Option<Value>,
    /// Report data (JSON object). Omit with template_name to use its saved sample data.
    #[serde(default)]
    pub data: Option<Value>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct RenderArgs {
    #[serde(flatten)]
    pub source: TemplateArgs,
    /// Output file name inside the server's output folder, e.g. "invoice-0001.pdf" (default: generated)
    #[serde(default)]
    pub output: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct PreviewArgs {
    #[serde(flatten)]
    pub source: TemplateArgs,
    /// Page number, starting at 1 (default 1)
    #[serde(default)]
    pub page: Option<usize>,
    /// Image scale: 1.0 = 72 dpi (A4 ≈ 595×842 px), default 1.5, range 0.25–4
    #[serde(default)]
    pub scale: Option<f32>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct NameArgs {
    /// Template name, e.g. "receipt.json" (".json" may be omitted)
    pub name: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SaveArgs {
    /// File name to save as, e.g. "monthly-sales.json" (letters, digits, . _ - only)
    pub name: String,
    /// Full template JSON object
    pub template: Value,
    /// Sample data saved next to it (used when rendering by name without data)
    #[serde(default)]
    pub sample_data: Option<Value>,
    /// Replace an existing template with the same name (default false)
    #[serde(default)]
    pub overwrite: bool,
}

fn source_of(a: TemplateArgs) -> Result<(Source, Option<Value>), String> {
    let src = match (a.template_name, a.template) {
        (Some(n), None) => Source::Named(n),
        (None, Some(Value::String(s))) => {
            // บาง client ส่ง object มาเป็นข้อความ JSON
            Source::Inline(serde_json::from_str(&s).map_err(|e| format!("template ไม่ใช่ JSON ที่ถูกต้อง: {e}"))?)
        }
        (None, Some(t)) => Source::Inline(t),
        (Some(_), Some(_)) => return Err("ระบุ template_name หรือ template อย่างใดอย่างหนึ่ง".into()),
        (None, None) => return Err("ต้องระบุ template_name หรือ template".into()),
    };
    let data = match a.data {
        Some(Value::String(s)) => Some(serde_json::from_str(&s).map_err(|e| format!("data ไม่ใช่ JSON ที่ถูกต้อง: {e}"))?),
        other => other,
    };
    Ok((src, data))
}

fn fail(msg: impl Into<String>) -> Result<CallToolResult, ErrorData> {
    Ok(CallToolResult::error(vec![ContentBlock::text(msg.into())]))
}

fn ok_json(v: Value) -> Result<CallToolResult, ErrorData> {
    Ok(CallToolResult::success(vec![ContentBlock::text(serde_json::to_string_pretty(&v).unwrap_or_default())]))
}

impl ThaiReportServer {
    pub fn new(engine: Engine) -> Self {
        Self { engine: Arc::new(engine), tool_router: Self::tool_router() }
    }

    /// รันงานของ engine ใน blocking pool (จัดหน้า/เรนเดอร์ใช้ CPU)
    async fn blocking<T: Send + 'static>(&self, f: impl FnOnce(&Engine) -> T + Send + 'static) -> Result<T, ErrorData> {
        let engine = self.engine.clone();
        tokio::task::spawn_blocking(move || f(&engine))
            .await
            .map_err(|e| ErrorData::internal_error(format!("งานภายในล้มเหลว: {e}"), None))
    }
}

#[tool_router(router = tool_router)]
impl ThaiReportServer {
    #[tool(description = "Read the ThaiReport template format guide: page/units, band types, elements, {{ }} expressions, \
        Thai formatting functions (number, bahttext, thaidate, thaidigits), aggregates and groups, with a full example. \
        Call this before writing or editing a template.")]
    async fn get_template_guide(&self) -> Result<CallToolResult, ErrorData> {
        Ok(CallToolResult::success(vec![ContentBlock::text(GUIDE)]))
    }

    #[tool(description = "List saved report templates (name, title, page size, bands, whether sample data exists).")]
    async fn list_templates(&self) -> Result<CallToolResult, ErrorData> {
        match self.blocking(|e| e.list_templates()).await? {
            Ok(list) => ok_json(json!({ "templates": list })),
            Err(e) => fail(e),
        }
    }

    #[tool(description = "Get a saved template's JSON and its sample data (if any) — use as a starting point.")]
    async fn get_template(&self, Parameters(a): Parameters<NameArgs>) -> Result<CallToolResult, ErrorData> {
        match self.blocking(move |e| e.get_template(&a.name)).await? {
            Ok((template, data)) => ok_json(json!({ "template": template, "sample_data": data })),
            Err(e) => fail(e),
        }
    }

    #[tool(description = "Validate a template against data: structural errors, layout errors (e.g. text that does not fit \
        with overflow=error) and warnings for {{ }} fields missing from the data. Returns page count when it lays out.")]
    async fn validate_template(&self, Parameters(a): Parameters<TemplateArgs>) -> Result<CallToolResult, ErrorData> {
        let (src, data) = match source_of(a) {
            Ok(s) => s,
            Err(e) => return fail(e),
        };
        let v = self.blocking(move |e| e.validate(src, data)).await?;
        let text = serde_json::to_string_pretty(&v).unwrap_or_default();
        Ok(if v.ok { CallToolResult::success(vec![ContentBlock::text(text)]) } else { CallToolResult::error(vec![ContentBlock::text(text)]) })
    }

    #[tool(description = "Render a page of the report to a PNG image so you can check the layout visually.")]
    async fn preview_template(&self, Parameters(a): Parameters<PreviewArgs>) -> Result<CallToolResult, ErrorData> {
        let (src, data) = match source_of(a.source) {
            Ok(s) => s,
            Err(e) => return fail(e),
        };
        let page = a.page.unwrap_or(1);
        let scale = a.scale.unwrap_or(1.5);
        match self.blocking(move |e| e.preview(src, data, page, scale)).await? {
            Ok((png, pages)) => Ok(CallToolResult::success(vec![
                ContentBlock::image(base64::engine::general_purpose::STANDARD.encode(png), "image/png"),
                ContentBlock::text(format!("หน้า {page}/{pages}")),
            ])),
            Err(e) => fail(e),
        }
    }

    #[tool(description = "Render the report to a PDF file in the server's output folder. Returns the file path, \
        page count, size, and binding warnings.")]
    async fn render_report(&self, Parameters(a): Parameters<RenderArgs>) -> Result<CallToolResult, ErrorData> {
        let (src, data) = match source_of(a.source) {
            Ok(s) => s,
            Err(e) => return fail(e),
        };
        let output = a.output;
        match self.blocking(move |e| e.render(src, data, output.as_deref())).await? {
            Ok((r, _pdf)) => ok_json(serde_json::to_value(r).unwrap_or_default()),
            Err(e) => fail(e),
        }
    }

    #[tool(description = "Save a template (and optional sample data) to the templates folder so it can be rendered by name later. \
        The template is validated first; existing files are not replaced unless overwrite=true.")]
    async fn save_template(&self, Parameters(a): Parameters<SaveArgs>) -> Result<CallToolResult, ErrorData> {
        let template = match a.template {
            Value::String(s) => match serde_json::from_str(&s) {
                Ok(v) => v,
                Err(e) => return fail(format!("template ไม่ใช่ JSON ที่ถูกต้อง: {e}")),
            },
            v => v,
        };
        let (name, sample, overwrite) = (a.name, a.sample_data, a.overwrite);
        match self.blocking(move |e| e.save_template(&name, &template, sample.as_ref(), overwrite)).await? {
            Ok(saved) => ok_json(json!({ "saved": saved })),
            Err(e) => fail(e),
        }
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for ThaiReportServer {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("thaireport", env!("CARGO_PKG_VERSION")))
            .with_instructions(INSTRUCTIONS)
    }
}
