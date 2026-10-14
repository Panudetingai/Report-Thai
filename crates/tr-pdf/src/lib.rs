//! tr-pdf: layout → PDF (krilla), PDF/A (Phase 1: Template → PDF เต็ม)
//! หน่วย: Template เป็น mm → แปลงเป็น pt ตอน render

use krilla::color::rgb;
use krilla::geom::{PathBuilder, Point, Rect, Size, Transform};
use krilla::metadata::{DateTime, Metadata};
use krilla::num::NormalizedF32;
use krilla::page::PageSettings;
use krilla::paint::{Fill, Stroke};
use krilla::text::{Font, TextDirection};
use krilla::Document;
use std::collections::HashMap;
use tr_core::{mm_to_pt, Align, BandType, Element, Overflow, Template};

/// Placeholder เดิม (เก็บไว้กันโค้ดอื่นพังระหว่าง spike)
pub fn render_placeholder() -> Vec<u8> {
    b"%PDF-1.7 placeholder\n".to_vec()
}

/// เรนเดอร์ข้อความไทยลง A4 ด้วย krilla `draw_text` + ตัดบรรทัดด้วย thaibreak
/// (spike item 1 — เก็บไว้ให้ example เดิมทำงาน)
pub fn render_thai_lines(
    font_data: Vec<u8>,
    lines: &[String],
    font_size: f32,
    extra_words: &[&str],
) -> Vec<u8> {
    const PAGE_W: f32 = 595.0;
    const PAGE_H: f32 = 842.0;
    const MARGIN_X: f32 = 48.0;
    const MARGIN_TOP: f32 = 60.0;
    const MARGIN_BOTTOM: f32 = 800.0;
    let max_width = PAGE_W - MARGIN_X * 2.0;
    let line_step = font_size * 1.7;

    let mut document = Document::new();
    let font = Font::new(font_data.clone().into(), 0).expect("โหลดฟอนต์ไทยไม่สำเร็จ");

    let mut visual: Vec<String> = Vec::new();
    for line in lines {
        visual.extend(tr_text::wrap_thai(
            line,
            &font_data,
            font_size,
            max_width,
            extra_words,
        ));
    }

    let mut page = document
        .start_page_with(PageSettings::from_wh(PAGE_W, PAGE_H).expect("page size"));
    let mut surface = page.surface();
    let mut y = MARGIN_TOP;
    for vline in &visual {
        if y > MARGIN_BOTTOM {
            surface.finish();
            page.finish();
            page = document
                .start_page_with(PageSettings::from_wh(PAGE_W, PAGE_H).expect("page size"));
            surface = page.surface();
            y = MARGIN_TOP;
        }
        surface.draw_text(
            Point::from_xy(MARGIN_X, y),
            font.clone(),
            font_size,
            vline,
            false,
            TextDirection::Auto,
        );
        y += line_step;
    }
    surface.finish();
    page.finish();
    document.finish().expect("finish pdf")
}

// ================= Phase 1 engine =================

fn pick_font_bytes<'a>(
    family: &str,
    bold: bool,
    fonts: &'a HashMap<String, Vec<u8>>,
) -> Result<&'a Vec<u8>, String> {
    let want_bold = bold || family.to_lowercase().contains("bold");
    // ถ้าขอตัวหนา ให้ลองไฟล์ -Bold ก่อน (เช่น Sarabun → Sarabun-Bold)
    // มิฉะนั้นหัวเรื่อง bold จะได้ฟอนต์ปกติ (บั๊กเดิม: เจอชื่อตรงก่อนแล้ว return ทันที)
    if want_bold {
        let bold_name = format!("{family}-Bold");
        if let Some(b) = fonts.get(&bold_name) {
            return Ok(b);
        }
        if let Some(b) = fonts.get("Sarabun-Bold") {
            return Ok(b);
        }
    }
    // ลำดับค้นหา: ชื่อตรง → Sarabun(-Bold) → NotoSansThai → ตัวแรกที่มี
    if let Some(b) = fonts.get(family) {
        return Ok(b);
    }
    if want_bold {
        if let Some(b) = fonts.get("Sarabun-Bold") {
            return Ok(b);
        }
    } else if let Some(b) = fonts.get("Sarabun") {
        return Ok(b);
    }
    if let Some(b) = fonts.get("NotoSansThai") {
        return Ok(b);
    }
    fonts
        .values()
        .next()
        .ok_or_else(|| "ไม่พบฟอนต์สำหรับ render (ต้องมี Sarabun หรือ NotoSansThai ใน fonts/)".to_string())
}

/// op วาดบนหน้าหนึ่ง (พิกัด pt สัมบูรณ์บนหน้า)
enum Op {
    Text {
        x: f32,
        y: f32,
        size: f32,
        content: String,
        bold: bool,
        family: String,
    },
    Rule {
        x1: f32,
        y1: f32,
        x2: f32,
        y2: f32,
        width: f32,
        dash: Option<Vec<f32>>,
    },
    Box {
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        fill: Option<(f32, f32, f32)>,
        stroke: Option<(f32, f32, f32)>,
        width: f32,
        ellipse: bool,
    },
    Picture {
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        bytes: Vec<u8>,
    },
}

fn paint_fill(c: (f32, f32, f32)) -> Fill {
    Fill {
        paint: rgb::Color::new(
            (c.0 * 255.0).round() as u8,
            (c.1 * 255.0).round() as u8,
            (c.2 * 255.0).round() as u8,
        )
        .into(),
        opacity: NormalizedF32::ONE,
        rule: Default::default(),
    }
}

fn paint_stroke(c: (f32, f32, f32), width: f32) -> Stroke {
    Stroke {
        paint: rgb::Color::new(
            (c.0 * 255.0).round() as u8,
            (c.1 * 255.0).round() as u8,
            (c.2 * 255.0).round() as u8,
        )
        .into(),
        width,
        miter_limit: 4.0,
        line_cap: Default::default(),
        line_join: Default::default(),
        opacity: NormalizedF32::ONE,
        dash: None,
    }
}

/// แบ่งข้อความเป็นบรรทัดตาม overflow policy
/// คืน (บรรทัด, font_size ที่ใช้จริง)
fn layout_text(
    raw: &str,
    family: &str,
    bold: bool,
    size: f32,
    max_w_pt: f32,
    max_h_pt: f32,
    overflow: Overflow,
    align: Align,
    leader: Option<&str>,
    fonts: &HashMap<String, Vec<u8>>,
    extra_words: &[&str],
) -> Result<(Vec<String>, f32), String> {
    let font_bytes = pick_font_bytes(family, bold, fonts)?;
    // ตรวจ .notdef ก่อน — แจ้งตัวอักษรที่หาย
    let missing = tr_text::missing_glyphs(font_bytes, raw);
    if !missing.is_empty() {
        let sample: String = missing.iter().take(8).collect();
        return Err(format!("ฟอนต์ {family} ไม่มี glyph สำหรับ: {sample:?} (จะขึ้น .notdef)"));
    }
    if raw.is_empty() {
        return Ok((vec![], size));
    }
    // บรรทัดแรกใช้ความสูง size, บรรทัดถัดไปห่าง step (กันกล่อง title แน่นเกินจริง)
    let line_step = |s: f32| s * 1.6;
    let need_h = |n: usize, s: f32| {
        if n == 0 {
            0.0
        } else {
            s + (n - 1) as f32 * line_step(s)
        }
    };
    let fit_count = |s: f32| {
        if max_h_pt < s {
            1
        } else {
            1 + ((max_h_pt - s) / line_step(s)).floor() as usize
        }
    };
    let (mut lines, used) = match overflow {
        Overflow::Wrap | Overflow::Grow | Overflow::Error => {
            let lines = tr_text::wrap_thai(raw, font_bytes, size, max_w_pt, extra_words);
            let need = need_h(lines.len(), size);
            if need > max_h_pt + 0.01 {
                if overflow == Overflow::Error {
                    return Err(format!(
                        "ข้อความล้นกรอบ (ต้อง {need:.1}pt มี {max_h_pt:.1}pt): {raw:.40}"
                    ));
                }
                // Grow: ยอมคืนบรรทัดทั้งหมด (caller ขยาย band ต่อ)
                // Wrap: ตัดเฉพาะที่พอดี
                if overflow == Overflow::Wrap {
                    (lines.into_iter().take(fit_count(size).max(1)).collect(), size)
                } else {
                    (lines, size)
                }
            } else {
                (lines, size)
            }
        }
        Overflow::Clip => {
            let lines = tr_text::wrap_thai(raw, font_bytes, size, max_w_pt, extra_words);
            (lines.into_iter().take(fit_count(size).max(1)).collect(), size)
        }
        Overflow::Shrink => {
            let mut s = size;
            loop {
                let lines = tr_text::wrap_thai(raw, font_bytes, s, max_w_pt, extra_words);
                if need_h(lines.len(), s) <= max_h_pt + 0.01 || s <= 5.0 {
                    break (lines, s);
                }
                s -= 0.5;
            }
        }
    };
    // dot leader: เติมจุดต่อท้ายบรรทัดสุดท้ายจนเต็มความกว้างกล่อง
    // (เฉพาะ align left — แบบฟอร์มที่จุดต้องต่อกับข้อความบรรทัดเดียวกัน)
    // คำนวณแบบปัดลงจึงล้นกล่องไม่ได้ และไม่เพิ่มจำนวนบรรทัด
    if let Some(pat) = leader {
        if align == Align::Left && !pat.is_empty() && !lines.is_empty() {
            if tr_text::missing_glyphs(font_bytes, pat).is_empty() {
                let dot_w = tr_text::measure_thai_width(pat, font_bytes, used);
                if dot_w > 0.0 {
                    if let Some(last) = lines.last_mut() {
                        let lw = tr_text::measure_thai_width(last, font_bytes, used);
                        let sp_w = tr_text::measure_thai_width(" ", font_bytes, used);
                        if max_w_pt > lw + sp_w {
                            let n = ((max_w_pt - lw - sp_w) / dot_w).floor() as usize;
                            if n >= 3 {
                                last.push(' ');
                                last.push_str(&pat.repeat(n));
                            }
                        }
                    }
                }
            }
        }
    }
    Ok((lines, used))
}

/// วาด element ลง ops ที่ตำแหน่ง origin (ox, oy) — คืนความสูงที่ใช้จริง (pt)
#[allow(clippy::too_many_arguments)]
fn emit_element(
    el: &Element,
    data: &serde_json::Value,
    row: Option<&serde_json::Value>,
    page_no: usize,
    pages: usize,
    ox: f32,
    oy: f32,
    fonts: &HashMap<String, Vec<u8>>,
    extra_words: &[&str],
    base_dir: Option<&std::path::Path>,
) -> Result<(Vec<Op>, f32), String> {
    match el {
        Element::Text(t) => {
            let bound = tr_core::bind_text(&t.text, data, row, page_no, pages);
            let bx = ox + mm_to_pt(t.x);
            let by = oy + mm_to_pt(t.y);
            let bw = mm_to_pt(t.w);
            let bh = mm_to_pt(t.h);
            let (lines, used) =
                layout_text(&bound, &t.font, t.bold, t.size, bw, bh, t.overflow, t.align, t.leader.as_deref(), fonts, extra_words)?;
            let font_bytes = pick_font_bytes(&t.font, t.bold, fonts)?;
            let mut ops = Vec::new();
            let step = used * 1.6;
            for (i, line) in lines.iter().enumerate() {
                let lw = tr_text::measure_thai_width(line, font_bytes, used);
                let dx = match t.align {
                    Align::Left => 0.0,
                    Align::Center => ((bw - lw) / 2.0).max(0.0),
                    Align::Right => (bw - lw).max(0.0),
                };
                // +used: แปลง top → baseline โดยประมาณ (ตรงกับพฤติกรรม spike ที่ตรวจตาแล้ว)
                ops.push(Op::Text {
                    x: bx + dx,
                    y: by + used + i as f32 * step,
                    size: used,
                    content: line.clone(),
                    bold: t.bold,
                    family: t.font.clone(),
                });
            }
            let used_h = if t.overflow == Overflow::Grow {
                lines.len() as f32 * step
            } else {
                bh
            };
            Ok((ops, used_h))
        }
        Element::Line(l) => {
            let x1 = ox + mm_to_pt(l.x);
            let y1 = oy + mm_to_pt(l.y);
            let x2 = ox + mm_to_pt(l.x + l.w);
            let y2 = oy + mm_to_pt(l.y + l.h);
            Ok((
                vec![Op::Rule {
                    x1,
                    y1,
                    x2,
                    y2,
                    width: l.width,
                    dash: l.dash.clone(),
                }],
                0.0,
            ))
        }
        Element::Rectangle(r) => {
            let fill = r.fill.as_deref().and_then(tr_core::parse_hex_color);
            let stroke = r
                .stroke
                .as_deref()
                .and_then(tr_core::parse_hex_color)
                .or(if fill.is_none() { Some((0.0, 0.0, 0.0)) } else { None });
            Ok((
                vec![Op::Box {
                    x: ox + mm_to_pt(r.x),
                    y: oy + mm_to_pt(r.y),
                    w: mm_to_pt(r.w),
                    h: mm_to_pt(r.h),
                    fill,
                    stroke,
                    width: r.width,
                    ellipse: false,
                }],
                mm_to_pt(r.h),
            ))
        }
        Element::Ellipse(e) => {
            let fill = e.fill.as_deref().and_then(tr_core::parse_hex_color);
            let stroke = e
                .stroke
                .as_deref()
                .and_then(tr_core::parse_hex_color)
                .or(if fill.is_none() { Some((0.0, 0.0, 0.0)) } else { None });
            Ok((
                vec![Op::Box {
                    x: ox + mm_to_pt(e.x),
                    y: oy + mm_to_pt(e.y),
                    w: mm_to_pt(e.w),
                    h: mm_to_pt(e.h),
                    fill,
                    stroke,
                    width: e.width,
                    ellipse: true,
                }],
                mm_to_pt(e.h),
            ))
        }
        Element::Image(img) => {
            let bx = ox + mm_to_pt(img.x);
            let by = oy + mm_to_pt(img.y);
            let bw = mm_to_pt(img.w);
            let bh = mm_to_pt(img.h);
            let bound = tr_core::bind_text(&img.src, data, row, page_no, pages);
            let bytes = resolve_image_bytes(&bound, base_dir)?;
            Ok((
                vec![Op::Picture {
                    x: bx,
                    y: by,
                    w: bw,
                    h: bh,
                    bytes,
                }],
                bh,
            ))
        }
        Element::Table(t) => {
            let rows: Vec<serde_json::Value> = if let Some(ds) = t.data_source.as_deref().or_else(|| {
                // ถ้าไม่ระบุ dataSource ให้ลอง "items" (convention ใบกำกับ/ใบเสนอราคา)
                None::<&str>
            }) {
                match tr_core::lookup(data, ds) {
                    Some(serde_json::Value::Array(a)) => a,
                    _ => vec![],
                }
            } else {
                match data.get("items") {
                    Some(serde_json::Value::Array(a)) if t.data_source.is_none() => a.clone(),
                    _ => vec![],
                }
            };
            emit_table(t, &rows, data, page_no, pages, ox, oy, fonts, extra_words)
        }
    }
}

fn resolve_image_bytes(src: &str, base_dir: Option<&std::path::Path>) -> Result<Vec<u8>, String> {
    let s = src.trim();
    // data URL
    if let Some(b64) = s
        .strip_prefix("data:image/png;base64,")
        .or_else(|| s.strip_prefix("data:image/jpeg;base64,"))
    {
        return base64_decode(b64);
    }
    // raw base64 (ยาว + อักขระ base64 ล้วน)
    if s.len() > 100 && s.chars().all(|c| c.is_ascii_alphanumeric() || "+/=".contains(c)) {
        if let Ok(b) = base64_decode(s) {
            return Ok(b);
        }
    }
    // path ไฟล์
    let p = std::path::Path::new(s);
    let full = if p.is_absolute() {
        p.to_path_buf()
    } else if let Some(d) = base_dir {
        d.join(p)
    } else {
        p.to_path_buf()
    };
    std::fs::read(&full).map_err(|e| format!("โหลดภาพ {s} ไม่สำเร็จ: {e}"))
}

fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(s.trim())
        .map_err(|e| format!("ถอด base64 ภาพไม่สำเร็จ: {e}"))
}

/// วาดตาราง — คืน ops + ความสูงที่ใช้ (pt)
#[allow(clippy::too_many_arguments)]
fn emit_table(
    t: &tr_core::TableEl,
    rows: &[serde_json::Value],
    data: &serde_json::Value,
    page_no: usize,
    pages: usize,
    ox: f32,
    oy: f32,
    fonts: &HashMap<String, Vec<u8>>,
    extra_words: &[&str],
) -> Result<(Vec<Op>, f32), String> {
    let font_bytes = pick_font_bytes(&t.font, false, fonts)?;
    let bx = ox + mm_to_pt(t.x);
    let by = oy + mm_to_pt(t.y);
    let col_w: Vec<f32> = t.columns.iter().map(|c| mm_to_pt(c.width)).collect();
    let size = t.size;
    let step = size * 1.6;
    let pad = 4.5;
    let row_h = step + pad * 2.0;

    let mut ops = Vec::new();
    let mut y = by;
    // header
    let mut x = bx;
    for (i, col) in t.columns.iter().enumerate() {
        let missing = tr_text::missing_glyphs(font_bytes, &col.header);
        if !missing.is_empty() {
            let sample: String = missing.iter().take(8).collect();
            return Err(format!("ฟอนต์ {} ไม่มี glyph สำหรับ header: {sample:?}", t.font));
        }
        ops.push(Op::Box {
            x,
            y,
            w: col_w[i],
            h: row_h,
            fill: Some((0.94, 0.94, 0.94)),
            stroke: Some((0.0, 0.0, 0.0)),
            width: 0.5,
            ellipse: false,
        });
        let lw = tr_text::measure_thai_width(&col.header, font_bytes, size);
        let dx = match col.align {
            Align::Left => pad,
            Align::Center => ((col_w[i] - lw) / 2.0).max(pad),
            Align::Right => (col_w[i] - lw - pad).max(pad),
        };
        ops.push(Op::Text {
            x: x + dx,
            y: y + pad + size,
            size,
            content: col.header.clone(),
            bold: true,
            family: t.font.clone(),
        });
        x += col_w[i];
    }
    y += row_h;
    // rows
    for (ri, row) in rows.iter().enumerate() {
        // วัดความสูงแถว (wrap หลายบรรทัด)
        let mut lines_per_col: Vec<Vec<String>> = Vec::new();
        let mut max_lines = 1;
        for col in &t.columns {
            let raw = tr_core::bind_text(&col.field, data, Some(row), page_no, pages);
            let missing = tr_text::missing_glyphs(font_bytes, &raw);
            if !missing.is_empty() {
                let sample: String = missing.iter().take(8).collect();
                return Err(format!("ฟอนต์ {} ไม่มี glyph สำหรับ: {sample:?}", t.font));
            }
            // หัก padding 2 ข้าง
            let cw = col_w[lines_per_col.len()] - pad * 2.0;
            let wrapped = tr_text::wrap_thai(&raw, font_bytes, size, cw.max(10.0), extra_words);
            max_lines = max_lines.max(wrapped.len().max(1));
            lines_per_col.push(if wrapped.is_empty() { vec![String::new()] } else { wrapped });
        }
        let h = max_lines as f32 * step + pad * 2.0;
        let mut x = bx;
        for (i, col) in t.columns.iter().enumerate() {
            let fill = if ri % 2 == 1 { Some((0.97, 0.97, 0.97)) } else { None };
            ops.push(Op::Box {
                x,
                y,
                w: col_w[i],
                h,
                fill,
                stroke: Some((0.0, 0.0, 0.0)),
                width: 0.5,
                ellipse: false,
            });
            for (li, line) in lines_per_col[i].iter().enumerate() {
                let lw = tr_text::measure_thai_width(line, font_bytes, size);
                let dx = match col.align {
                    Align::Left => pad,
                    Align::Center => ((col_w[i] - lw) / 2.0).max(pad),
                    Align::Right => (col_w[i] - lw - pad).max(pad),
                };
                ops.push(Op::Text {
                    x: x + dx,
                    y: y + pad + size + li as f32 * step,
                    size,
                    content: line.clone(),
                    bold: false,
                    family: t.font.clone(),
                });
            }
            x += col_w[i];
        }
        y += h;
    }
    Ok((ops, y - by))
}

/// render Template + data → PDF bytes
/// `fonts`: map family → ttf bytes (โหลดจาก fonts/ ด้วย tr_text::load_bundled_fonts)
/// `base_dir`: โฟลเดอร์ของ template (สำหรับ image path สัมพัทธ์)
pub fn render_template(
    template: &Template,
    data: &serde_json::Value,
    fonts: &HashMap<String, Vec<u8>>,
    base_dir: Option<&std::path::Path>,
) -> Result<Vec<u8>, String> {
    template.validate()?;
    let extra: Vec<&str> = template.user_dict.iter().map(|s| s.as_str()).collect();

    let (pw, ph) = template.page.size_pt();
    let (cx, cy, cw, ch) = template.page.content_box_pt();

    let find = |bt: BandType| template.bands.iter().find(|b| b.band_type == bt);
    let title = find(BandType::Title);
    let pheader = find(BandType::PageHeader);
    let cheader = find(BandType::ColumnHeader);
    let detail = find(BandType::Detail);
    let summary = find(BandType::Summary);
    let pfooter = find(BandType::PageFooter);
    let gheader = find(BandType::GroupHeader);
    let gfooter = find(BandType::GroupFooter);

    let header_h = pheader.map(|b| mm_to_pt(b.height)).unwrap_or(0.0)
        + cheader.map(|b| mm_to_pt(b.height)).unwrap_or(0.0);
    let footer_h = pfooter.map(|b| mm_to_pt(b.height)).unwrap_or(0.0);

    // แถว detail
    let detail_rows: Vec<Option<serde_json::Value>> = if let Some(d) = detail {
        if let Some(ds) = d.data_source.as_deref() {
            match tr_core::lookup(data, ds) {
                Some(serde_json::Value::Array(a)) => a.into_iter().map(Some).collect(),
                _ => vec![],
            }
        } else if data.get("items").and_then(|v| v.as_array()).is_some() {
            data.get("items")
                .and_then(|v| v.as_array())
                .unwrap()
                .clone()
                .into_iter()
                .map(Some)
                .collect()
        } else {
            vec![None]
        }
    } else {
        vec![]
    };

    // --- pass 1: จัดหน้า (เก็บ ops ต่อหน้า) ใช้ pages ประมาณก่อน แล้วค่อย render จริง ---
    // วัดด้วย pages=1 ก่อนเพื่อนับหน้า แล้ว render ซ้ำด้วยเลขจริง (footer บรรทัดเดียว ไม่กระทบ break)
    let layout_pages = layout_all(
        template, data, fonts, &extra, base_dir, &detail_rows,
        title, pheader, cheader, detail, summary, pfooter, gheader, gfooter,
        pw, ph, cx, cy, cw, ch, header_h, footer_h, 1,
    )?;
    let total = layout_pages.len().max(1);
    let pages = layout_all(
        template, data, fonts, &extra, base_dir, &detail_rows,
        title, pheader, cheader, detail, summary, pfooter, gheader, gfooter,
        pw, ph, cx, cy, cw, ch, header_h, footer_h, total,
    )?;

    // --- pass 2: วาดลง krilla ---
    let mut document = Document::new();
    let mut meta = Metadata::new();
    meta = meta.creator("ThaiReport".to_string());
    meta = meta.producer("ThaiReport tr-pdf (krilla)".to_string());
    meta = meta.creation_date(DateTime::new(2026).month(1).day(1).hour(0).minute(0).second(0));
    document.set_metadata(meta);

    // เตรียม krilla fonts (regular + bold แยกก้อน)
    let reg_bytes = pick_font_bytes("Sarabun", false, fonts)?.clone();
    let bold_bytes = pick_font_bytes("Sarabun", true, fonts).ok().cloned().unwrap_or_else(|| reg_bytes.clone());
    let noto_bytes = fonts.get("NotoSansThai").cloned();
    let k_reg = Font::new(reg_bytes.into(), 0).ok_or("โหลดฟอนต์ Regular ไม่สำเร็จ")?;
    let k_bold = Font::new(bold_bytes.into(), 0).ok_or("โหลดฟอนต์ Bold ไม่สำเร็จ")?;
    let k_noto = noto_bytes.and_then(|b| Font::new(b.into(), 0));

    for (pi, ops) in pages.iter().enumerate() {
        let _ = pi;
        let mut page = document
            .start_page_with(PageSettings::from_wh(pw, ph).ok_or("ขนาดหน้าไม่ถูกต้อง")?);
        {
            let mut surface = page.surface();
            for op in ops {
                draw_op(&mut surface, op, &k_reg, &k_bold, k_noto.clone())?;
            }
            surface.finish();
        }
        page.finish();
    }
    document.finish().map_err(|e| format!("สร้าง PDF ไม่สำเร็จ: {e:?}"))
}

#[allow(clippy::too_many_arguments)]
fn layout_all(
    template: &Template,
    data: &serde_json::Value,
    fonts: &HashMap<String, Vec<u8>>,
    extra: &[&str],
    base_dir: Option<&std::path::Path>,
    detail_rows: &[Option<serde_json::Value>],
    title: Option<&tr_core::Band>,
    pheader: Option<&tr_core::Band>,
    cheader: Option<&tr_core::Band>,
    detail: Option<&tr_core::Band>,
    summary: Option<&tr_core::Band>,
    pfooter: Option<&tr_core::Band>,
    gheader: Option<&tr_core::Band>,
    gfooter: Option<&tr_core::Band>,
    pw: f32,
    ph: f32,
    cx: f32,
    cy: f32,
    _cw: f32,
    _ch: f32,
    header_h: f32,
    footer_h: f32,
    total_pages: usize,
) -> Result<Vec<Vec<Op>>, String> {
    let _ = (pw, ph);
    let top = cy + header_h;
    let bottom = cy + (cy + 0.0 - cy) + content_h(template, cy, footer_h);
    let _ = bottom;

    let mut pages: Vec<Vec<Op>> = vec![Vec::new()];
    let mut cur = 0usize;
    let mut y = top;

    // helper: ขึ้นหน้าใหม่
    let new_page = |pages: &mut Vec<Vec<Op>>, cur: &mut usize, y: &mut f32| {
        *cur += 1;
        pages.push(Vec::new());
        *y = top;
        let _ = (pages, cur, y);
    };

    // วาด header/footer ของหน้า cur (เรียกเมื่อเปิดหน้า + ก่อนปิด)
    // เพื่อความง่าย: วาด header ตอนเปิดหน้า, footer ตอนปิด/ขึ้นหน้าใหม่ (ทำย้อนหลังไม่ได้
    // เลยวาด footer ทุกครั้งที่ขึ้นหน้าใหม่ + หน้าสุดท้าย)
    let emit_band = |band: Option<&tr_core::Band>,
                     ops: &mut Vec<Op>,
                     oy: f32,
                     row: Option<&serde_json::Value>,
                     page_no: usize|
     -> Result<f32, String> {
        let Some(b) = band else { return Ok(0.0) };
        let mut max_h: f32 = 0.0;
        for el in &b.elements {
            // table ใน header/footer ไม่รองรับข้ามหน้า — วาดตรงๆ
            let (o, h) = emit_element(el, data, row, page_no, total_pages, cx, oy, fonts, extra, base_dir)?;
            ops.extend(o);
            max_h = max_h.max(h.max(mm_to_pt(b.height)));
        }
        Ok(max_h.max(mm_to_pt(b.height)))
    };

    // เปิดหน้าแรก: header
    {
        let pg = cur + 1;
        let ops = &mut pages[cur];
        if let Some(b) = pheader {
            emit_band(Some(b), ops, cy, None, pg)?;
        }
        if let Some(b) = cheader {
            let oy = cy + pheader.map(|b| mm_to_pt(b.height)).unwrap_or(0.0);
            emit_band(Some(b), ops, oy, None, pg)?;
        }
        // title เฉพาะหน้าแรก
        if let Some(b) = title {
            let h = emit_band(Some(b), ops, y, None, pg)?;
            y += h;
        }
        if let Some(b) = gheader {
            let h = emit_band(Some(b), ops, y, None, pg)?;
            y += h;
        }
    }

    // detail rows
    if let Some(d) = detail {
        let dh = mm_to_pt(d.height);
        // table ใน detail ที่ข้ามหน้าได้: จัดการพิเศษ — แยกเป็น header + แถว
        let has_table = d.elements.iter().any(|e| matches!(e, Element::Table(_)));
        if has_table && d.elements.len() == 1 {
            if let Element::Table(t) = &d.elements[0] {
                y = layout_table_paged(
                    t, data, detail_rows, &mut pages, &mut cur, y, top, cy, cx,
                    header_h, footer_h, template, fonts, extra, base_dir,
                    pheader, cheader, pfooter, total_pages,
                )?;
            }
        } else {
            for row in detail_rows {
                // ถ้าไม่พอ → ขึ้นหน้าใหม่ + header ซ้ำ
                if y + dh > page_bottom(template, cy, footer_h) + 0.01 {
                    // footer หน้าปัจจุบัน
                    let pg = cur + 1;
                    if let Some(b) = pfooter {
                        let oy = page_bottom(template, cy, footer_h);
                        let ops = &mut pages[cur];
                        emit_band(Some(b), ops, oy, None, pg)?;
                    }
                    new_page(&mut pages, &mut cur, &mut y);
                    let pg = cur + 1;
                    let ops = &mut pages[cur];
                    if let Some(b) = pheader {
                        emit_band(Some(b), ops, cy, None, pg)?;
                    }
                    if let Some(b) = cheader {
                        let oy = cy + pheader.map(|b| mm_to_pt(b.height)).unwrap_or(0.0);
                        emit_band(Some(b), ops, oy, None, pg)?;
                    }
                }
                let pg = cur + 1;
                let ops = &mut pages[cur];
                let mut row_h = dh;
                for el in &d.elements {
                    let (o, h) = emit_element(
                        el, data, row.as_ref(), pg, total_pages, cx, y, fonts, extra, base_dir,
                    )?;
                    ops.extend(o);
                    row_h = row_h.max(h.max(dh));
                }
                y += row_h;
            }
        }
        let _ = dh;
    }

    // group footer + summary (ถ้าไม่พอขึ้นหน้าใหม่)
    // หมายเหตุ: gap_before ของ band จะถูกข้ามเมื่ออยู่ต้นหน้าใหม่ (กันช่องว่างลอยหัวกระดาษ)
    for band in [gfooter, summary] {
        if let Some(b) = band {
            let bh = mm_to_pt(b.height);
            let gap = mm_to_pt(b.gap_before);
            // เว้นระยะก่อน band นี้ (เฉพาะเมื่อไม่ใช่ต้นหน้า)
            let bumped = if y > top + 0.01 { y + gap } else { y };
            if bumped + bh > page_bottom(template, cy, footer_h) + 0.01 {
                let pg = cur + 1;
                if let Some(f) = pfooter {
                    let oy = page_bottom(template, cy, footer_h);
                    emit_band(Some(f), &mut pages[cur], oy, None, pg)?;
                }
                new_page(&mut pages, &mut cur, &mut y);
                let pg = cur + 1;
                let ops = &mut pages[cur];
                if let Some(h) = pheader {
                    emit_band(Some(h), ops, cy, None, pg)?;
                }
                if let Some(c) = cheader {
                    let oy = cy + pheader.map(|b| mm_to_pt(b.height)).unwrap_or(0.0);
                    emit_band(Some(c), ops, oy, None, pg)?;
                }
            }
            let pg = cur + 1;
            // วาง band นี้ต่อจาก gap (ต้นหน้าใหม่ไม่เอา gap)
            let oy = if y > top + 0.01 { y + gap } else { y };
            let h = emit_band(Some(b), &mut pages[cur], oy, None, pg)?;
            y = oy + h;
        }
    }

    // footer หน้าสุดท้าย (+ ทุกหน้าที่ข้ามไปแล้วมี footer ครบ)
    let pg = cur + 1;
    if let Some(b) = pfooter {
        let oy = page_bottom(template, cy, footer_h);
        emit_band(Some(b), &mut pages[cur], oy, None, pg)?;
    }
    // footer หน้าแรกๆ ที่ยังไม่มี (กรณีหน้าเดียวมีแล้ว; หลายหน้าหน้าเก่ามีแล้วตอนขึ้นหน้าใหม่)
    // ตรวจหน้าที่ขาด footer: หน้าที่ไม่ใช่หน้าสุดท้ายแต่ยังไม่มี ops จาก footer — เราใส่ตอนขึ้นหน้าใหม่แล้ว
    let _ = template;
    Ok(pages)
}

fn content_h(template: &Template, cy: f32, footer_h: f32) -> f32 {
    let (_, _ph) = template.page.size_pt();
    let (_, _, _, ch) = template.page.content_box_pt();
    let _ = cy;
    ch - footer_h
}

fn page_bottom(template: &Template, cy: f32, footer_h: f32) -> f32 {
    let (_, _, _, ch) = template.page.content_box_pt();
    cy + ch - footer_h
}

/// ตารางข้ามหน้า: header ซ้ำทุกหน้า แถวไหนไม่พอขึ้นหน้าใหม่
#[allow(clippy::too_many_arguments)]
fn layout_table_paged(
    t: &tr_core::TableEl,
    data: &serde_json::Value,
    detail_rows: &[Option<serde_json::Value>],
    pages: &mut Vec<Vec<Op>>,
    cur: &mut usize,
    mut y: f32,
    top: f32,
    cy: f32,
    cx: f32,
    header_h: f32,
    footer_h: f32,
    template: &Template,
    fonts: &HashMap<String, Vec<u8>>,
    extra: &[&str],
    base_dir: Option<&std::path::Path>,
    pheader: Option<&tr_core::Band>,
    cheader: Option<&tr_core::Band>,
    pfooter: Option<&tr_core::Band>,
    total_pages: usize,
) -> Result<f32, String> {
    let font_bytes = pick_font_bytes(&t.font, false, fonts)?;
    let col_w: Vec<f32> = t.columns.iter().map(|c| mm_to_pt(c.width)).collect();
    let size = t.size;
    let step = size * 1.6;
    let pad = 4.5;
    let head_h = step + pad * 2.0;
    let bottom = page_bottom(template, cy, footer_h);

    // แถวข้อมูลจริง (ข้าม None)
    let rows: Vec<&serde_json::Value> = detail_rows.iter().filter_map(|r| r.as_ref()).collect();

    let draw_head = |ops: &mut Vec<Op>, yy: f32, pg: usize| -> Result<(), String> {
        let mut x = cx + mm_to_pt(t.x);
        for (i, col) in t.columns.iter().enumerate() {
            ops.push(Op::Box {
                x,
                y: yy,
                w: col_w[i],
                h: head_h,
                fill: Some((0.94, 0.94, 0.94)),
                stroke: Some((0.0, 0.0, 0.0)),
                width: 0.5,
                ellipse: false,
            });
            let missing = tr_text::missing_glyphs(font_bytes, &col.header);
            if !missing.is_empty() {
                let sample: String = missing.iter().take(8).collect();
                return Err(format!("ฟอนต์ {} ไม่มี glyph สำหรับ header: {sample:?}", t.font));
            }
            let lw = tr_text::measure_thai_width(&col.header, font_bytes, size);
            let dx = match col.align {
                Align::Left => pad,
                Align::Center => ((col_w[i] - lw) / 2.0).max(pad),
                Align::Right => (col_w[i] - lw - pad).max(pad),
            };
            ops.push(Op::Text {
                x: x + dx,
                y: yy + pad + size,
                size,
                content: col.header.clone(),
                bold: true,
                family: t.font.clone(),
            });
            x += col_w[i];
        }
        let _ = pg;
        Ok(())
    };

    let pg0 = *cur + 1;
    y += mm_to_pt(t.y);
    draw_head(&mut pages[*cur], y, pg0)?;
    y += head_h;

    for (ri, row) in rows.iter().enumerate() {
        // เตรียมบรรทัดแต่ละคอลัมน์
        let mut per_col: Vec<Vec<String>> = Vec::new();
        let mut max_lines = 1usize;
        for (i, col) in t.columns.iter().enumerate() {
            let raw = tr_core::bind_text(&col.field, data, Some(row), *cur + 1, total_pages);
            let missing = tr_text::missing_glyphs(font_bytes, &raw);
            if !missing.is_empty() {
                let sample: String = missing.iter().take(8).collect();
                return Err(format!("ฟอนต์ {} ไม่มี glyph สำหรับ: {sample:?}", t.font));
            }
            let w = (col_w[i] - pad * 2.0).max(10.0);
            let wrapped = tr_text::wrap_thai(&raw, font_bytes, size, w, extra);
            max_lines = max_lines.max(wrapped.len().max(1));
            per_col.push(if wrapped.is_empty() { vec![String::new()] } else { wrapped });
        }
        let rh = max_lines as f32 * step + pad * 2.0;
        if y + rh > bottom + 0.01 {
            // ปิดหน้าปัจจุบันด้วย footer
            let pg = *cur + 1;
            if let Some(f) = pfooter {
                let oy = bottom;
                for el in &f.elements {
                    let (o, _) = emit_element(el, data, None, pg, total_pages, cx, oy, fonts, extra, base_dir)?;
                    pages[*cur].extend(o);
                }
            }
            *cur += 1;
            pages.push(Vec::new());
            y = top;
            let pg = *cur + 1;
            if let Some(h) = pheader {
                for el in &h.elements {
                    let (o, _) = emit_element(el, data, None, pg, total_pages, cx, cy, fonts, extra, base_dir)?;
                    pages[*cur].extend(o);
                }
            }
            if let Some(c) = cheader {
                let oy = cy + pheader.map(|b| mm_to_pt(b.height)).unwrap_or(0.0);
                for el in &c.elements {
                    let (o, _) = emit_element(el, data, None, pg, total_pages, cx, oy, fonts, extra, base_dir)?;
                    pages[*cur].extend(o);
                }
            }
            if t.header_repeat {
                draw_head(&mut pages[*cur], y, pg)?;
                y += head_h;
            }
        }
        let mut x = cx + mm_to_pt(t.x);
        for (i, _col) in t.columns.iter().enumerate() {
            let fill = if ri % 2 == 1 { Some((0.97, 0.97, 0.97)) } else { None };
            pages[*cur].push(Op::Box {
                x,
                y,
                w: col_w[i],
                h: rh,
                fill,
                stroke: Some((0.0, 0.0, 0.0)),
                width: 0.5,
                ellipse: false,
            });
            for (li, line) in per_col[i].iter().enumerate() {
                let lw = tr_text::measure_thai_width(line, font_bytes, size);
                let dx = match t.columns[i].align {
                    Align::Left => pad,
                    Align::Center => ((col_w[i] - lw) / 2.0).max(pad),
                    Align::Right => (col_w[i] - lw - pad).max(pad),
                };
                pages[*cur].push(Op::Text {
                    x: x + dx,
                    y: y + pad + size + li as f32 * step,
                    size,
                    content: line.clone(),
                    bold: false,
                    family: t.font.clone(),
                });
            }
            x += col_w[i];
        }
        y += rh;
    }
    let _ = (header_h, top);
    Ok(y)
}

fn draw_op(
    surface: &mut krilla::surface::Surface,
    op: &Op,
    k_reg: &Font,
    k_bold: &Font,
    k_noto: Option<Font>,
) -> Result<(), String> {
    match op {
        Op::Text { x, y, size, content, bold, family, .. } => {
            let f = if family == "NotoSansThai" {
                k_noto.clone().unwrap_or_else(|| k_reg.clone())
            } else if *bold || family.to_lowercase().contains("bold") {
                k_bold.clone()
            } else {
                k_reg.clone()
            };
            surface.draw_text(
                Point::from_xy(*x, *y),
                f,
                *size,
                content,
                false,
                TextDirection::Auto,
            );
            Ok(())
        }
        Op::Rule { x1, y1, x2, y2, width, dash } => {
            let mut pb = PathBuilder::new();
            pb.move_to(*x1, *y1);
            pb.line_to(*x2, *y2);
            let path = pb.finish().ok_or("สร้าง path เส้นไม่สำเร็จ")?;
            let mut stroke = paint_stroke((0.0, 0.0, 0.0), *width);
            if let Some(d) = dash {
                stroke.dash = Some(krilla::paint::StrokeDash {
                    array: d.clone(),
                    offset: 0.0,
                });
            }
            surface.set_fill(None);
            surface.set_stroke(Some(stroke));
            surface.draw_path(&path);
            surface.set_stroke(None);
            Ok(())
        }
        Op::Box { x, y, w, h, fill, stroke, width, ellipse } => {
            let path = if *ellipse {
                ellipse_path(*x, *y, *w, *h).ok_or("สร้าง path วงรีไม่สำเร็จ")?
            } else {
                let r = Rect::from_xywh(*x, *y, *w, *h).ok_or("ขนาด rect ไม่ถูกต้อง")?;
                let mut pb = PathBuilder::new();
                pb.push_rect(r);
                pb.finish().ok_or("สร้าง path rect ไม่สำเร็จ")?
            };
            surface.set_fill(fill.map(paint_fill));
            surface.set_stroke(stroke.map(|c| paint_stroke(c, *width)));
            surface.draw_path(&path);
            surface.set_fill(None);
            surface.set_stroke(None);
            Ok(())
        }
        Op::Picture { x, y, w, h, bytes } => {
            let img = if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
                krilla::image::Image::from_png(bytes.clone().into(), true)
                    .map_err(|e| format!("decode PNG ไม่สำเร็จ: {e}"))?
            } else if bytes.starts_with(&[0xFF, 0xD8]) {
                krilla::image::Image::from_jpeg(bytes.clone().into(), true)
                    .map_err(|e| format!("decode JPEG ไม่สำเร็จ: {e}"))?
            } else {
                return Err("รองรับภาพเฉพาะ PNG/JPEG ใน Phase 1".to_string());
            };
            let size = Size::from_wh(*w, *h).ok_or("ขนาดภาพไม่ถูกต้อง")?;
            let tr = Transform::from_translate(*x, *y);
            surface.push_transform(&tr);
            surface.draw_image(img, size);
            surface.pop();
            Ok(())
        }
    }
}

/// path วงรีด้วย Bezier 4 ช่วง (ค่า kappa)
fn ellipse_path(x: f32, y: f32, w: f32, h: f32) -> Option<krilla::geom::Path> {
    const K: f32 = 0.5522848;
    let cx = x + w / 2.0;
    let cy = y + h / 2.0;
    let rx = w / 2.0;
    let ry = h / 2.0;
    let mut pb = PathBuilder::new();
    pb.move_to(cx + rx, cy);
    pb.cubic_to(cx + rx, cy + K * ry, cx + K * rx, cy + ry, cx, cy + ry);
    pb.cubic_to(cx - K * rx, cy + ry, cx - rx, cy + K * ry, cx - rx, cy);
    pb.cubic_to(cx - rx, cy - K * ry, cx - K * rx, cy - ry, cx, cy - ry);
    pb.cubic_to(cx + K * rx, cy - ry, cx + rx, cy - K * ry, cx + rx, cy);
    pb.close();
    pb.finish()
}
