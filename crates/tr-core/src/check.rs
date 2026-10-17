//! ตรวจการผูกข้อมูลของ template กับข้อมูลตัวอย่าง — กติกาเดียวกับตัวผูกค่าตอนเรนเดอร์
//! (ใช้ใน MCP `validate_template` และ CLI) ข้อความที่ได้เป็นคำเตือน ไม่ใช่ error:
//! PDF ยังออกได้ แต่ฟิลด์ที่หาไม่พบจะเป็นช่องว่าง
//!
//! ตัวตรวจในหน้าออกแบบ (packages/designer/src/fields.js) ทำงานแบบเดียวกันฝั่ง browser

use crate::expr::{Expr, FORMAT_FUNCTIONS};
use crate::{lookup, BandType, Element, Template};
use serde_json::Value;

const AGG_FUNCTIONS: [&str; 5] = ["sum", "count", "avg", "min", "max"];

/// band ที่ engine แทนค่ารวม (sum/count/…) และ group.value/group.count
fn aggregates_allowed(t: BandType) -> bool {
    matches!(t, BandType::GroupHeader | BandType::GroupFooter | BandType::Summary)
}

fn exprs_in(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = text;
    while let Some(s) = rest.find("{{") {
        let after = &rest[s + 2..];
        let Some(e) = after.find("}}") else { break };
        out.push(after[..e].trim().to_string());
        rest = &after[e + 2..];
    }
    out
}

/// path ที่ต้องมีในข้อมูล (ไม่นับอาร์กิวเมนต์ของการรวมค่า — อ้างฟิลด์ของแถว ตรวจแยก — และ group.*/page/pages)
fn needed_paths<'a>(e: &'a Expr, out: &mut Vec<&'a str>) {
    match e {
        Expr::Path(p) if !matches!(p.as_str(), "page" | "pages" | "group.value" | "group.count") => out.push(p),
        Expr::Call(name, args) if !AGG_FUNCTIONS.contains(&name.as_str()) => {
            for a in args {
                needed_paths(a, out);
            }
        }
        _ => {}
    }
}

fn uses_aggregate(e: &Expr) -> bool {
    match e {
        Expr::Path(p) => p == "group.value" || p == "group.count",
        Expr::Call(name, args) => AGG_FUNCTIONS.contains(&name.as_str()) || args.iter().any(uses_aggregate),
        _ => false,
    }
}

fn unknown_function(e: &Expr) -> Option<&str> {
    match e {
        Expr::Call(name, args) => {
            if !FORMAT_FUNCTIONS.contains(&name.as_str()) && !AGG_FUNCTIONS.contains(&name.as_str()) {
                return Some(name);
            }
            args.iter().find_map(unknown_function)
        }
        _ => None,
    }
}

/// ค่าของ path หาเจอไหม: ในแถว (item.x หรือชื่อตรง) ก่อน แล้วข้อมูลทั้งก้อน — เหมือน `bind_text`
fn resolves(path: &str, data: &Value, row: Option<&Value>) -> bool {
    if let Some(r) = row {
        if path.strip_prefix("item.").is_some_and(|p| lookup(r, p).is_some()) || lookup(r, path).is_some() {
            return true;
        }
    }
    lookup(data, path).is_some()
}

/// คำเตือนการผูกข้อมูลทั้ง template (ไม่ซ้ำ เรียงตามลำดับที่พบ)
pub fn check_bindings(template: &Template, data: &Value) -> Vec<String> {
    let mut warnings: Vec<String> = Vec::new();
    let mut warn = |w: String| {
        if !warnings.contains(&w) {
            warnings.push(w);
        }
    };
    let rows_of = |source: &str| -> Vec<Value> {
        match lookup(data, source) {
            Some(Value::Array(a)) => a,
            _ => vec![],
        }
    };

    for (bi, band) in template.bands.iter().enumerate() {
        let where_ = |what: &str| format!("bands[{bi}] ({:?}) {what}", band.band_type);
        // แถวที่ band นี้วน — ตรงกับตัวจัดหน้า: ระบุ dataSource → array นั้น · detail ไม่ระบุ → "items" ถ้ามี
        // ไม่มีทั้งคู่ = วาดครั้งเดียวแบบฟอร์ม (ไม่มีแถว อ่านค่าจากข้อมูลทั้งก้อน)
        let band_source = match (&band.data_source, band.is_list()) {
            (Some(ds), true) => {
                if lookup(data, ds).is_none() {
                    warn(where_(&format!("dataSource '{ds}' ไม่มีในข้อมูล — band นี้จะไม่มีแถว")));
                }
                Some(ds.clone())
            }
            (None, true) if band.band_type == BandType::Detail && data.get("items").is_some_and(Value::is_array) => Some("items".to_string()),
            _ => None,
        };
        if let Some(key) = &band.group_by {
            let field = key.strip_prefix("item.").unwrap_or(key);
            let rows = rows_of(template.bands.iter().find(|b| b.band_type == BandType::Detail).and_then(|b| b.data_source.as_deref()).unwrap_or("items"));
            if !rows.is_empty() && !rows.iter().any(|r| lookup(r, field).is_some()) {
                warn(where_(&format!("groupBy '{key}' ไม่มีในแถวข้อมูล — ทุกแถวจะอยู่กลุ่มเดียว")));
            }
        }

        // (ข้อความ, แหล่งแถวของข้อความนั้น)
        let mut texts: Vec<(String, Option<String>)> = Vec::new();
        for el in &band.elements {
            match el {
                Element::Text(t) => texts.push((t.text.clone(), band_source.clone())),
                Element::Checkbox(c) => texts.push((c.checked.clone(), band_source.clone())),
                Element::Image(i) => texts.push((i.src.clone(), band_source.clone())),
                Element::Table(t) => {
                    let src = t.data_source.clone().or_else(|| band.data_source.clone()).unwrap_or_else(|| "items".to_string());
                    for c in &t.columns {
                        // คอลัมน์ระบุเป็นชื่อฟิลด์ตรงๆ ได้ (ไม่มี {{ }})
                        let f = if c.field.contains("{{") { c.field.clone() } else { format!("{{{{ item.{} }}}}", c.field) };
                        texts.push((f, Some(src.clone())));
                    }
                }
                _ => {}
            }
        }

        for (text, source) in texts {
            for raw in exprs_in(&text) {
                let Some(e) = Expr::parse(&raw) else {
                    warn(where_(&format!("{{{{ {raw} }}}} รูปแบบนิพจน์ไม่ถูกต้อง")));
                    continue;
                };
                if let Some(f) = unknown_function(&e) {
                    warn(where_(&format!(
                        "{{{{ {raw} }}}} ไม่รู้จักฟังก์ชัน '{f}' (ใช้ได้: {}, {})",
                        FORMAT_FUNCTIONS.join(", "),
                        AGG_FUNCTIONS.join(", ")
                    )));
                    continue;
                }
                if uses_aggregate(&e) && !aggregates_allowed(band.band_type) {
                    warn(where_(&format!("{{{{ {raw} }}}} การรวมค่า/group.* ใช้ได้เฉพาะ groupHeader, groupFooter, summary")));
                    continue;
                }
                let mut paths = Vec::new();
                needed_paths(&e, &mut paths);
                let rows = source.as_deref().map(rows_of).unwrap_or_default();
                for p in paths {
                    let ok = if source.is_some() {
                        // ในแถว: พอแถวใดแถวหนึ่งมีค่า (ค่าว่างบางแถวเป็นเรื่องปกติ)
                        rows.is_empty() || rows.iter().any(|r| resolves(p, data, Some(r)))
                    } else {
                        resolves(p, data, None)
                    };
                    if !ok {
                        warn(where_(&format!("{{{{ {raw} }}}} ไม่พบฟิลด์ '{p}' ในข้อมูล — จะพิมพ์เป็นช่องว่าง")));
                    }
                }
            }
        }
    }
    warnings
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn tpl(bands: Value) -> Template {
        Template::from_json(&json!({ "schemaVersion": "1.0", "bands": bands }).to_string()).unwrap()
    }
    fn text(t: &str) -> Value {
        json!({ "type": "text", "x": 0, "y": 0, "w": 50, "h": 5, "text": t })
    }

    #[test]
    fn clean_template_has_no_warnings() {
        let t = tpl(json!([
            { "type": "title", "height": 10, "elements": [text("{{ customer.name }} {{ thaidate(doc.date) }} {{ page }}/{{ pages }}")] },
            { "type": "groupHeader", "groupBy": "item.cat", "height": 8, "elements": [text("{{ group.value }}")] },
            { "type": "detail", "height": 6, "elements": [text("{{ item.name }} {{ number(item.amount) }}")] },
            { "type": "summary", "height": 8, "elements": [text("{{ bahttext(sum(item.amount)) }} {{ count() }}")] },
        ]));
        let d = json!({ "customer": { "name": "ก" }, "doc": { "date": "2026-01-01" }, "items": [{ "name": "x", "amount": 1, "cat": "A" }] });
        assert_eq!(check_bindings(&t, &d), Vec::<String>::new());
    }

    #[test]
    fn reports_missing_fields_unknown_functions_and_misplaced_aggregates() {
        let t = tpl(json!([
            { "type": "title", "height": 10, "elements": [text("{{ customer.nmae }} {{ format(total) }}")] },
            { "type": "detail", "height": 6, "elements": [text("{{ number(item.amout) }} {{ sum(item.amount) }}")] },
            { "type": "groupHeader", "groupBy": "item.region", "height": 6, "elements": [] },
        ]));
        let d = json!({ "customer": { "name": "ก" }, "total": 1, "items": [{ "amount": 1 }] });
        let w = check_bindings(&t, &d).join("\n");
        assert!(w.contains("'customer.nmae'"), "{w}");
        assert!(w.contains("'format'"), "{w}");
        assert!(w.contains("'item.amout'"), "{w}");
        assert!(w.contains("{{ sum(item.amount) }} การรวมค่า"), "{w}");
        assert!(w.contains("groupBy 'item.region'"), "{w}");
        assert_eq!(w.lines().count(), 5, "{w}");
    }
}
