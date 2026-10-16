//! tr-core: template model, layout, data binding (Phase 1)
//! Template JSON เป็น source of truth เดียว (สเปกหัวข้อ 3)
//! หน่วยใน JSON เป็น mm แปลงเป็น pt ตอน render (1 mm = 72/25.4 pt)

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const MM_TO_PT: f32 = 72.0 / 25.4;

#[inline]
pub fn mm_to_pt(mm: f32) -> f32 {
    mm * MM_TO_PT
}

/// Template ทั้งฉบับ
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    #[serde(rename = "schemaVersion")]
    pub schema_version: String,
    #[serde(default = "default_page")]
    pub page: Page,
    #[serde(default)]
    pub fonts: Vec<FontRef>,
    #[serde(default)]
    pub bands: Vec<Band>,
    #[serde(default)]
    pub parameters: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub user_dict: Vec<String>,
}

fn default_page() -> Page {
    Page::default()
}

impl Template {
    pub fn from_json(s: &str) -> Result<Self, String> {
        serde_json::from_str(s).map_err(|e| format!("parse template ไม่สำเร็จ: {e}"))
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version.is_empty() {
            return Err("schemaVersion ห้ามว่าง".to_string());
        }
        if self.schema_version != "1.0" {
            return Err(format!(
                "schemaVersion ที่รองรับคือ 1.0 ได้ {}",
                self.schema_version
            ));
        }
        self.page.validate()?;
        for (i, b) in self.bands.iter().enumerate() {
            b.validate()
                .map_err(|e| format!("bands[{i}]: {e}"))?;
        }
        Ok(())
    }
}

/// หน้ากระดาษ
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Page {
    #[serde(default = "default_page_size")]
    pub size: PageSize,
    /// margin [top, right, bottom, left] หน่วย mm
    #[serde(default = "default_margin")]
    pub margin: [f32; 4],
    #[serde(default)]
    pub orientation: Orientation,
    /// ขนาดกำหนดเอง [กว้าง, สูง] mm ใช้เมื่อ size = "custom"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_mm: Option<[f32; 2]>,
}

fn default_page_size() -> PageSize {
    PageSize::A4
}
fn default_margin() -> [f32; 4] {
    [10.0, 10.0, 10.0, 10.0]
}

impl Default for Page {
    fn default() -> Self {
        Self {
            size: PageSize::A4,
            margin: [10.0, 10.0, 10.0, 10.0],
            orientation: Orientation::Portrait,
            custom_mm: None,
        }
    }
}

impl Page {
    pub fn validate(&self) -> Result<(), String> {
        for m in self.margin {
            if !(0.0..=100.0).contains(&m) {
                return Err(format!("margin {m} เกินช่วง 0..100 mm"));
            }
        }
        if self.size == PageSize::Custom {
            let [w, h] = self.custom_mm.ok_or("size=custom ต้องระบุ custom_mm")?;
            if !(20.0..=2000.0).contains(&w) || !(20.0..=2000.0).contains(&h) {
                return Err(format!("custom_mm {w}x{h} เกินช่วง 20..2000 mm"));
            }
        }
        Ok(())
    }

    /// ขนาดหน้ากระดาษหน่วย pt (กว้าง, สูง) คำนึง orientation แล้ว
    pub fn size_pt(&self) -> (f32, f32) {
        let (w_mm, h_mm) = match (self.size, self.custom_mm) {
            (PageSize::Custom, Some([w, h])) => (w, h),
            _ => self.size.mm(),
        };
        let (mut w, mut h) = (mm_to_pt(w_mm), mm_to_pt(h_mm));
        if self.orientation == Orientation::Landscape {
            std::mem::swap(&mut w, &mut h);
        }
        (w, h)
    }

    /// พื้นที่เนื้อหา (x0, y0, w, h) หน่วย pt
    pub fn content_box_pt(&self) -> (f32, f32, f32, f32) {
        let (pw, ph) = self.size_pt();
        let [mt, mr, mb, ml] = self.margin;
        let x0 = mm_to_pt(ml);
        let y0 = mm_to_pt(mt);
        let w = pw - mm_to_pt(ml + mr);
        let h = ph - mm_to_pt(mt + mb);
        (x0, y0, w, h)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum PageSize {
    #[default]
    A4,
    A5,
    Letter,
    /// ขนาดกำหนดเอง (ดู Page.custom_mm)
    Custom,
}

impl PageSize {
    /// ขนาดมาตรฐาน; Custom คืน A4 ถ้าไม่ได้ผ่าน Page.size_pt
    pub fn mm(&self) -> (f32, f32) {
        match self {
            PageSize::A4 | PageSize::Custom => (210.0, 297.0),
            PageSize::A5 => (148.0, 210.0),
            PageSize::Letter => (215.9, 279.4),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Orientation {
    #[default]
    Portrait,
    Landscape,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontRef {
    pub family: String,
    #[serde(default = "default_true")]
    pub embed: bool,
    #[serde(default)]
    pub bold: bool,
}

fn default_true() -> bool {
    true
}

/// Band แบบ Jasper (สเปก 4.1)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Band {
    #[serde(rename = "type")]
    pub band_type: BandType,
    /// ความสูง mm (detail ยืดได้ตามเนื้อหา)
    pub height: f32,
    #[serde(default)]
    pub elements: Vec<Element>,
    /// ชื่อ array ในข้อมูลที่ band นี้วน (JSON: "dataSource"; รับ "data_source" ได้ด้วย)
    #[serde(default, rename = "dataSource", alias = "data_source")]
    pub data_source: Option<String>,
    /// ระยะห่างด้านบนก่อนวาง band นี้ (mm) — เช่น summary เว้นห่างจากตาราง
    #[serde(default)]
    pub gap_before: f32,
    /// ชื่อที่แสดงในเครื่องมือออกแบบ (ไม่มีผลต่อ PDF) เช่น "ชื่อลูกค้า"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// โหมดของ band ส่วนเนื้อหา (type = section): list = วนตามข้อมูล, content = วาดครั้งเดียว
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<BandMode>,
}

/// โหมดของ band ส่วนเนื้อหา
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BandMode {
    /// วนซ้ำหนึ่งครั้งต่อหนึ่งแถวของ data_source
    List,
    /// วาดครั้งเดียว
    Content,
}

impl Band {
    /// band นี้วนตามข้อมูลหรือไม่ (detail วนเสมอ, section ตาม mode)
    pub fn is_list(&self) -> bool {
        match self.band_type {
            BandType::Detail => true,
            BandType::Section => self.mode == Some(BandMode::List),
            _ => false,
        }
    }

    /// band ที่ไหลอยู่ในเนื้อเอกสารตามลำดับ (detail และ section)
    pub fn is_flow(&self) -> bool {
        matches!(self.band_type, BandType::Detail | BandType::Section)
    }
}

impl Band {
    pub fn validate(&self) -> Result<(), String> {
        if let Some(n) = &self.name {
            if n.chars().count() > 60 {
                return Err("ชื่อ band ยาวเกิน 60 ตัวอักษร".to_string());
            }
        }
        if !(1.0..=500.0).contains(&self.height) {
            return Err(format!("height {} เกินช่วง", self.height));
        }
        if !(0.0..=100.0).contains(&self.gap_before) {
            return Err(format!("gap_before {} เกินช่วง 0..100 mm", self.gap_before));
        }
        // band เนื้อหา/รายการที่มีตาราง: ตารางสูงไม่แน่นอนและข้ามหน้าได้ → ต้องอยู่ band เดียวลำพัง
        let has_table = self.elements.iter().any(|e| matches!(e, Element::Table(_)));
        if self.is_flow() && has_table && self.elements.len() > 1 {
            return Err("band ที่มีตารางต้องมีเฉพาะตาราง — วาง element อื่นไว้ band ก่อนหรือหลัง".to_string());
        }
        if self.band_type == BandType::Section && self.mode == Some(BandMode::List) {
            let ds = self.data_source.as_deref().unwrap_or("").trim();
            if ds.is_empty() {
                return Err("band แบบรายการต้องระบุ dataSource (ชื่อ array ในข้อมูล)".to_string());
            }
        }
        for (i, e) in self.elements.iter().enumerate() {
            e.validate().map_err(|err| format!("elements[{i}]: {err}"))?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BandType {
    /// ส่วนเนื้อหาที่ผู้ใช้เพิ่มเอง (หลายชุดได้ วางตามลำดับในเอกสาร)
    Section,
    Title,
    PageHeader,
    ColumnHeader,
    Detail,
    GroupHeader,
    GroupFooter,
    Summary,
    PageFooter,
}

/// นโยบายข้อความล้นกรอบ (สเปกหัวข้อ 3 — ค่าเริ่มต้น error)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Overflow {
    Wrap,
    Shrink,
    Clip,
    Grow,
    #[default]
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Align {
    #[default]
    Left,
    Center,
    Right,
}

/// Element พื้นฐาน Phase 1
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Element {
    Text(TextEl),
    Image(ImageEl),
    Line(LineEl),
    Rectangle(RectEl),
    Ellipse(EllipseEl),
    Table(TableEl),
    Checkbox(CheckboxEl),
}

impl Element {
    pub fn validate(&self) -> Result<(), String> {
        match self {
            Element::Text(t) => t.validate(),
            Element::Image(i) => i.validate(),
            Element::Line(l) => l.validate(),
            Element::Rectangle(r) => r.validate(),
            Element::Ellipse(e) => e.validate(),
            Element::Table(t) => t.validate(),
            Element::Checkbox(c) => c.validate(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextEl {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    #[serde(default)]
    pub text: String,
    #[serde(default = "default_font")]
    pub font: String,
    #[serde(default = "default_size")]
    pub size: f32,
    #[serde(default)]
    pub bold: bool,
    #[serde(default)]
    pub align: Align,
    #[serde(default)]
    pub overflow: Overflow,
    /// ตัวนำจุดไข่ปลา (dot leader): ถ้ากำหนด เช่น "." engine จะเติมจุดต่อท้าย
    /// บรรทัดสุดท้ายจนเต็มความกว้างกล่อง — ใช้กับแบบฟอร์มที่ต้องการให้จุด
    /// อยู่บรรทัดเดียวกับข้อความ (แบบฟอร์มราชการ) แทนการขีดเส้นแยกบรรทัด
    /// ใช้ได้เฉพาะ align left เท่านั้น
    #[serde(default)]
    pub leader: Option<String>,
    /// สีตัวอักษร #RRGGBB (ค่าเริ่มต้นดำ)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

fn default_font() -> String {
    "Sarabun".to_string()
}
fn default_size() -> f32 {
    12.0
}

impl TextEl {
    fn validate(&self) -> Result<(), String> {
        if self.w <= 0.0 || self.h <= 0.0 {
            return Err("text w/h ต้อง > 0".to_string());
        }
        if !(5.0..=72.0).contains(&self.size) {
            return Err(format!("size {} เกินช่วง 5..72", self.size));
        }
        if let Some(c) = self.color.as_deref() {
            if parse_hex_color(c).is_none() {
                return Err(format!("color '{c}' ต้องเป็นรูปแบบ #RRGGBB"));
            }
        }
        if let Some(l) = self.leader.as_deref() {
            if l.is_empty() || l.chars().any(|c| c.is_control()) {
                return Err("leader ต้องเป็นอักษรที่มองเห็น อย่างน้อย 1 ตัว".to_string());
            }
            if self.align != Align::Left {
                return Err("leader ใช้ได้เฉพาะ align left".to_string());
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageEl {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    /// base64 PNG/JPEG หรือ path ไฟล์ (relative กับ template) หรือ {{dataKey}}
    #[serde(default)]
    pub src: String,
}

impl ImageEl {
    fn validate(&self) -> Result<(), String> {
        if self.w <= 0.0 || self.h <= 0.0 {
            return Err("image w/h ต้อง > 0".to_string());
        }
        if self.src.is_empty() {
            return Err("image src ห้ามว่าง".to_string());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LineEl {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    #[serde(default = "default_stroke")]
    pub width: f32,
    /// เส้นปะ: ระยะ [ขีด, ช่อง] หน่วย pt เช่น [1, 1.5] = เส้นประจุด, [6, 3] = เส้นประ
    /// ไม่ระบุ = เส้นทึบ
    #[serde(default)]
    pub dash: Option<Vec<f32>>,
}

fn default_stroke() -> f32 {
    0.5
}

impl LineEl {
    fn validate(&self) -> Result<(), String> {
        if self.width <= 0.0 {
            return Err("line width ต้อง > 0".to_string());
        }
        if let Some(d) = self.dash.as_deref() {
            if d.is_empty() || d.iter().any(|v| *v <= 0.0) {
                return Err("line dash ต้องเป็นตัวเลข > 0 อย่างน้อย 1 ค่า".to_string());
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RectEl {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    #[serde(default)]
    pub fill: Option<String>,
    #[serde(default)]
    pub stroke: Option<String>,
    #[serde(default = "default_stroke")]
    pub width: f32,
}

/// ช่องติ๊ก: วาดกรอบ และเครื่องหมายถูกเมื่อ `checked` เป็นจริง
/// checked = "true" / "false" (คงที่) หรือ "{{ item.paid }}" (ผูกข้อมูล — ค่าว่าง/false/0/ไม่ = ไม่ติ๊ก)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckboxEl {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    #[serde(default)]
    pub checked: String,
    #[serde(default)]
    pub stroke: Option<String>,
    #[serde(default = "default_stroke")]
    pub width: f32,
}

impl CheckboxEl {
    fn validate(&self) -> Result<(), String> {
        if self.w <= 0.0 || self.h <= 0.0 {
            return Err("checkbox w/h ต้อง > 0".to_string());
        }
        if let Some(c) = self.stroke.as_deref() {
            if parse_hex_color(c).is_none() {
                return Err(format!("stroke '{c}' ต้องเป็นรูปแบบ #RRGGBB"));
            }
        }
        Ok(())
    }
}

/// ค่าข้อความที่ถือว่า "ติ๊ก": ไม่ว่าง และไม่ใช่ false/0/no/null/ไม่
pub fn is_truthy(s: &str) -> bool {
    let t = s.trim().to_lowercase();
    !(t.is_empty() || matches!(t.as_str(), "false" | "0" | "no" | "n" | "null" | "none" | "ไม่" | "ไม่ใช่"))
}

impl RectEl {
    fn validate(&self) -> Result<(), String> {
        if self.w <= 0.0 || self.h <= 0.0 {
            return Err("rect w/h ต้อง > 0".to_string());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EllipseEl {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    #[serde(default)]
    pub fill: Option<String>,
    #[serde(default)]
    pub stroke: Option<String>,
    #[serde(default = "default_stroke")]
    pub width: f32,
}

impl EllipseEl {
    fn validate(&self) -> Result<(), String> {
        if self.w <= 0.0 || self.h <= 0.0 {
            return Err("ellipse w/h ต้อง > 0".to_string());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableEl {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub columns: Vec<TableColumn>,
    #[serde(default = "default_size")]
    pub size: f32,
    #[serde(default = "default_font")]
    pub font: String,
    /// ชื่อ array ใน data เช่น "items"
    #[serde(default)]
    pub data_source: Option<String>,
    #[serde(default = "default_true")]
    pub header_repeat: bool,
    /// หัวตารางตัวหนา (ค่าเริ่มต้น true)
    #[serde(default = "default_true")]
    pub header_bold: bool,
    /// สีตัวอักษรหัวตาราง #RRGGBB
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub header_color: Option<String>,
    /// สีพื้นหัวตาราง #RRGGBB (ค่าเริ่มต้น #F0F0F0)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub header_fill: Option<String>,
    /// สีพื้นแถวคู่ (สลับสี) #RRGGBB (ค่าเริ่มต้น #F7F7F7)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub zebra_fill: Option<String>,
    /// สีเส้นกรอบตาราง #RRGGBB (ค่าเริ่มต้นดำ)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_color: Option<String>,
    /// กฎสไตล์เฉพาะเซลล์ (ทับค่าของคอลัมน์) เช่น คอลัมน์ 4 ของแถวข้อมูลที่ 3 เป็นสีแดง
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cell_styles: Vec<CellStyle>,
}

/// สไตล์ของเซลล์เดียว: row = แถวข้อมูลที่ (เริ่มที่ 1), col = คอลัมน์ที่ (เริ่มที่ 1)
/// row ไม่ระบุ = ทุกแถวของคอลัมน์นั้น
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CellStyle {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub row: Option<u32>,
    pub col: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bold: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableColumn {
    /// กว้าง mm
    pub width: f32,
    pub header: String,
    /// key ใน row object หรือ "{{expr}}"
    pub field: String,
    #[serde(default)]
    pub align: Align,
    /// ฟอนต์ของคอลัมน์นี้ (ค่าเริ่มต้น = ฟอนต์ของตาราง)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font: Option<String>,
    /// ขนาดตัวอักษรของคอลัมน์ (pt) (ค่าเริ่มต้น = ขนาดของตาราง)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<f32>,
    /// ตัวหนาในเซลล์
    #[serde(default)]
    pub bold: bool,
    /// สีตัวอักษร #RRGGBB
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// สีพื้นเซลล์ #RRGGBB (ทับสีสลับแถว)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<String>,
}

impl TableEl {
    fn validate(&self) -> Result<(), String> {
        if self.columns.is_empty() {
            return Err("table ต้องมี columns อย่างน้อย 1".to_string());
        }
        for c in [&self.header_color, &self.header_fill, &self.zebra_fill, &self.border_color].into_iter().flatten() {
            if parse_hex_color(c).is_none() {
                return Err(format!("สี '{c}' ในตารางต้องเป็นรูปแบบ #RRGGBB"));
            }
        }
        for cs in &self.cell_styles {
            if cs.col == 0 || cs.col as usize > self.columns.len() {
                return Err(format!("cell_styles: col {} อยู่นอกช่วง 1..{}", cs.col, self.columns.len()));
            }
            if cs.row == Some(0) {
                return Err("cell_styles: row เริ่มที่ 1".to_string());
            }
            for c in [&cs.color, &cs.fill].into_iter().flatten() {
                if parse_hex_color(c).is_none() {
                    return Err(format!("cell_styles: สี '{c}' ต้องเป็นรูปแบบ #RRGGBB"));
                }
            }
        }
        for col in &self.columns {
            for c in [&col.color, &col.fill].into_iter().flatten() {
                if parse_hex_color(c).is_none() {
                    return Err(format!("สี '{c}' ในคอลัมน์ '{}' ต้องเป็นรูปแบบ #RRGGBB", col.header));
                }
            }
            if let Some(sz) = col.size {
                if !(5.0..=72.0).contains(&sz) {
                    return Err(format!("size คอลัมน์ '{}' {sz} เกินช่วง 5..72", col.header));
                }
            }
        }
        let sum: f32 = self.columns.iter().map(|c| c.width).sum();
        if (sum - self.w).abs() > 0.5 {
            return Err(format!(
                "ผลรวมความกว้างคอลัมน์ {sum} ไม่เท่ากับ w {}",
                self.w
            ));
        }
        Ok(())
    }
}

// ---------- data binding ----------

/// ดึงค่าจาก JSON data ด้วย path แบบ "customer.name" / "items[0].price"
pub fn lookup(data: &serde_json::Value, path: &str) -> Option<serde_json::Value> {
    let mut cur = data;
    for part in path.split('.') {
        // รองรับ items[0]
        if let Some(br) = part.find('[') {
            let key = &part[..br];
            if !key.is_empty() {
                cur = cur.get(key)?;
            }
            let rest = &part[br..];
            // [0][1]...
            let mut r = rest;
            while let Some(s) = r.strip_prefix('[') {
                let e = s.find(']')?;
                let idx: usize = s[..e].parse().ok()?;
                cur = cur.get(idx)?;
                r = &s[e + 1..];
            }
        } else {
            cur = cur.get(part)?;
        }
    }
    Some(cur.clone())
}

fn value_to_string(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Null => String::new(),
        _ => serde_json::to_string(v).unwrap_or_default(),
    }
}

/// แทน {{ expr }} ในข้อความด้วยค่าจาก data + ตัวแปรพิเศษ page/pages
/// รองรับ: {{ field.path }}, {{ item.field }} (row context), {{ page }}, {{ pages }}
pub fn bind_text(
    raw: &str,
    data: &serde_json::Value,
    row: Option<&serde_json::Value>,
    page: usize,
    pages: usize,
) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(s) = rest.find("{{") {
        out.push_str(&rest[..s]);
        let after = &rest[s + 2..];
        if let Some(e) = after.find("}}") {
            let expr = after[..e].trim();
            out.push_str(&resolve_expr(expr, data, row, page, pages));
            rest = &after[e + 2..];
        } else {
            out.push_str(&rest[s..]);
            break;
        }
    }
    out.push_str(rest);
    out
}

fn resolve_expr(
    expr: &str,
    data: &serde_json::Value,
    row: Option<&serde_json::Value>,
    page: usize,
    pages: usize,
) -> String {
    if expr == "page" {
        return page.to_string();
    }
    if expr == "pages" {
        return pages.to_string();
    }
    // item.xxx → row context ก่อน
    if let Some(row) = row {
        if let Some(stripped) = expr.strip_prefix("item.") {
            if let Some(v) = lookup(row, stripped) {
                return value_to_string(&v);
            }
        }
        if let Some(v) = lookup(row, expr) {
            return value_to_string(&v);
        }
    }
    if let Some(v) = lookup(data, expr) {
        return value_to_string(&v);
    }
    // หาไม่เจอ → คืนว่าง (ไม่ throw เพื่อให้ PDF ออกต่อได้)
    String::new()
}

/// แปลงสี hex "#RRGGBB" / "#RGB" เป็น (r,g,b) 0..1
pub fn parse_hex_color(s: &str) -> Option<(f32, f32, f32)> {
    let h = s.strip_prefix('#')?;
    let (r, g, b) = match h.len() {
        6 => (
            u8::from_str_radix(&h[0..2], 16).ok()?,
            u8::from_str_radix(&h[2..4], 16).ok()?,
            u8::from_str_radix(&h[4..6], 16).ok()?,
        ),
        3 => {
            let r = u8::from_str_radix(&h[0..1], 16).ok()?;
            let g = u8::from_str_radix(&h[1..2], 16).ok()?;
            let b = u8::from_str_radix(&h[2..3], 16).ok()?;
            (r * 17, g * 17, b * 17)
        }
        _ => return None,
    };
    Some((r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn validate_rejects_empty_version() {
        let t = Template {
            schema_version: "".to_string(),
            page: Page::default(),
            fonts: vec![],
            bands: vec![],
            parameters: HashMap::new(),
            user_dict: vec![],
        };
        assert!(t.validate().is_err());
    }

    #[test]
    fn mm_to_pt_a4() {
        let p = Page::default();
        let (w, h) = p.size_pt();
        assert!((w - 595.28).abs() < 0.5, "w={w}");
        assert!((h - 841.89).abs() < 0.5, "h={h}");
    }

    #[test]
    fn bind_text_basic() {
        let data = json!({"customer": {"name": "บริษัท ก"}, "total": 1500});
        assert_eq!(
            bind_text("ลูกค้า {{ customer.name }} ยอด {{ total }}", &data, None, 1, 3),
            "ลูกค้า บริษัท ก ยอด 1500"
        );
        assert_eq!(bind_text("หน้า {{ page }}/{{ pages }}", &data, None, 2, 5), "หน้า 2/5");
    }

    #[test]
    fn bind_text_row() {
        let data = json!({});
        let row = json!({"name": "ดินสอ", "price": 10});
        assert_eq!(bind_text("{{ item.name }} {{ item.price }}", &data, Some(&row), 1, 1), "ดินสอ 10");
    }

    #[test]
    fn parse_color() {
        assert!(parse_hex_color("#ff0000").is_some());
        assert!(parse_hex_color("red").is_none());
    }

    #[test]
    fn line_dash_validate() {
        let ok = Element::Line(LineEl { x: 0.0, y: 0.0, w: 10.0, h: 0.0, width: 0.5, dash: Some(vec![1.0, 1.5]) });
        assert!(ok.validate().is_ok());
        let bad = Element::Line(LineEl { x: 0.0, y: 0.0, w: 10.0, h: 0.0, width: 0.5, dash: Some(vec![0.0]) });
        assert!(bad.validate().is_err());
    }
}
