//! รวมค่าในกลุ่ม/ทั้งรายงาน (Phase 3): `sum`, `count`, `avg`, `min`, `max` และ `group.value` / `group.count`
//!
//! ทำงาน "ก่อนจัดหน้า": ตัวจัดหน้าแทนนิพจน์เหล่านี้ด้วยข้อความบนสำเนาของ band
//! ทำให้ตัวผูกค่า `bind_text` ไม่ต้องรู้เรื่องกลุ่ม — นิพจน์ที่ไม่ใช่รวมค่าจะคงไว้ตามเดิม
//!
//! รูปแบบ: `{{ sum(item.amount) }}` (ทศนิยม 2 ตำแหน่ง, คั่นหลักพัน),
//! `{{ sum(item.amount, 0) }}` (กำหนดทศนิยมเอง), `{{ count() }}`, `{{ count(item.no) }}` (นับที่ไม่ว่าง)
//! หมายเหตุ: รวมด้วย f64 — เหมาะกับยอดเงินทั่วไป ไม่ใช่การบัญชีที่ต้องถูกทุกสตางค์ในหลักล้าน

use crate::lookup;
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AggKind {
    Sum,
    Count,
    Avg,
    Min,
    Max,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AggCall {
    pub kind: AggKind,
    /// ฟิลด์ที่รวม (สัมพัทธ์กับแถว เช่น "amount" จาก item.amount) — count() ไม่มีฟิลด์ได้
    pub path: Option<String>,
    pub decimals: usize,
}

/// แยกนิพจน์รวมค่า ถ้าไม่ใช่รูปแบบรวมค่าคืน None
pub fn parse_agg(expr: &str) -> Option<AggCall> {
    let e = expr.trim();
    if !e.ends_with(')') {
        return None;
    }
    let open = e.find('(')?;
    let kind = match e[..open].trim() {
        "sum" => AggKind::Sum,
        "count" => AggKind::Count,
        "avg" => AggKind::Avg,
        "min" => AggKind::Min,
        "max" => AggKind::Max,
        _ => return None,
    };
    let args: Vec<&str> = e[open + 1..e.len() - 1].split(',').map(str::trim).collect();
    let path = args
        .first()
        .filter(|a| !a.is_empty())
        .map(|a| a.strip_prefix("item.").unwrap_or(a).to_string());
    if kind != AggKind::Count && path.is_none() {
        return None;
    }
    let decimals = match args.get(1) {
        Some(d) if !d.is_empty() => d.parse::<usize>().ok().filter(|n| *n <= 6)?,
        _ if kind == AggKind::Count => 0,
        _ => 2,
    };
    Some(AggCall { kind, path, decimals })
}

/// ค่าที่เป็นตัวเลขได้: number หรือ string ที่แปลงได้ (ตัด comma ออกก่อน)
pub fn number_of(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().replace(',', "").parse::<f64>().ok().filter(|x| x.is_finite()),
        _ => None,
    }
}

/// ข้อความของค่าที่ใช้เป็นคีย์กลุ่ม (null/ไม่มี = ว่าง)
pub fn key_text(v: Option<&Value>) -> String {
    match v {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(s)) => s.clone(),
        Some(other) => other.to_string(),
    }
}

/// จัดรูปแบบตัวเลข: ทศนิยมตามที่กำหนด, คั่นหลักพัน, ไม่ติดลบถ้าปัดเป็นศูนย์
pub fn format_number(v: f64, decimals: usize, grouping: bool) -> String {
    // ปัดครึ่งขึ้น (ตามธรรมเนียมใบเสร็จ) — format! ของ Rust ปัดครึ่งเป็นเลขคู่
    let factor = 10f64.powi(decimals as i32);
    // บวก epsilon เล็กน้อยกันค่าเช่น 2.675 ที่แทนในไบนารีเป็น 2.67499… ให้ปัดลงผิด
    let half_up = (v.abs() * factor + 1e-7).round() / factor;
    let rounded = format!("{:.*}", decimals, half_up);
    let (int_part, frac_part) = match rounded.split_once('.') {
        Some((i, f)) => (i.to_string(), Some(f.to_string())),
        None => (rounded.clone(), None),
    };
    let mut out = String::new();
    let len = int_part.chars().count();
    for (k, ch) in int_part.chars().enumerate() {
        if grouping && k > 0 && (len - k) % 3 == 0 {
            out.push(',');
        }
        out.push(ch);
    }
    if let Some(f) = frac_part {
        out.push('.');
        out.push_str(&f);
    }
    let is_zero = out.chars().all(|c| c == '0' || c == '.' || c == ',');
    if v < 0.0 && !is_zero {
        format!("-{out}")
    } else {
        out
    }
}

/// คำนวณค่าของนิพจน์รวมค่าบนแถวทั้งหมดที่ส่งเข้ามา
pub fn eval_agg(call: &AggCall, rows: &[Option<Value>]) -> String {
    let field = |row: &Option<Value>| -> Option<Value> {
        let r = row.as_ref()?;
        match &call.path {
            Some(p) => lookup(r, p),
            None => Some(r.clone()),
        }
    };
    match call.kind {
        AggKind::Count => {
            let n = match &call.path {
                None => rows.len(),
                Some(_) => rows
                    .iter()
                    .filter(|r| match field(r) {
                        None | Some(Value::Null) => false,
                        Some(Value::String(s)) => !s.trim().is_empty(),
                        Some(_) => true,
                    })
                    .count(),
            };
            n.to_string()
        }
        AggKind::Sum | AggKind::Avg | AggKind::Min | AggKind::Max => {
            let nums: Vec<f64> = rows.iter().filter_map(|r| field(r)).filter_map(|v| number_of(&v)).collect();
            let value = match call.kind {
                AggKind::Sum => Some(nums.iter().sum::<f64>()),
                AggKind::Avg if !nums.is_empty() => Some(nums.iter().sum::<f64>() / nums.len() as f64),
                AggKind::Min => nums.iter().cloned().reduce(f64::min),
                AggKind::Max => nums.iter().cloned().reduce(f64::max),
                _ => None,
            };
            match value {
                Some(v) => format_number(v, call.decimals, true),
                // ไม่มีแถวที่เป็นตัวเลข: รวมได้ 0, ค่าเฉลี่ย/ต่ำสุด/สูงสุดเว้นว่าง
                None if call.kind == AggKind::Sum => format_number(0.0, call.decimals, true),
                None => String::new(),
            }
        }
    }
}

/// แทน `{{ … }}` ที่เป็นการรวมค่า/กลุ่มด้วยค่าจริง; นิพจน์อื่นคงไว้ทั้งชิ้น
/// group = (ค่าคีย์ของกลุ่ม, จำนวนแถวในกลุ่ม) หรือ None นอกการจัดกลุ่ม
pub fn bind_aggregates(raw: &str, rows: &[Option<Value>], group: Option<(&str, usize)>) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(s) = rest.find("{{") {
        out.push_str(&rest[..s]);
        let after = &rest[s + 2..];
        let Some(e) = after.find("}}") else {
            out.push_str(&rest[s..]);
            return out;
        };
        let inner = &after[..e];
        let expr = inner.trim();
        let replaced = match expr {
            "group.value" => group.map(|(v, _)| v.to_string()),
            "group.count" => group.map(|(_, n)| n.to_string()),
            _ => parse_agg(expr).map(|call| eval_agg(&call, rows)),
        };
        match replaced {
            Some(text) => out.push_str(&text),
            None => {
                out.push_str("{{");
                out.push_str(inner);
                out.push_str("}}");
            }
        }
        rest = &after[e + 2..];
    }
    out.push_str(rest);
    out
}

/// แบ่งแถวเป็นกลุ่มตามค่าของ `key` โดยดูเฉพาะแถวที่ติดกัน (ข้อมูลต้องเรียงมาก่อน)
pub fn split_groups(rows: &[Option<Value>], key: &str) -> Vec<(String, Vec<Option<Value>>)> {
    let key = key.trim().strip_prefix("item.").unwrap_or(key.trim());
    let mut groups: Vec<(String, Vec<Option<Value>>)> = Vec::new();
    for row in rows {
        let k = key_text(row.as_ref().and_then(|r| lookup(r, key)).as_ref());
        match groups.last_mut() {
            Some((last, members)) if *last == k => members.push(row.clone()),
            _ => groups.push((k, vec![row.clone()])),
        }
    }
    groups
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn rows(v: Value) -> Vec<Option<Value>> {
        v.as_array().unwrap().iter().cloned().map(Some).collect()
    }

    #[test]
    fn parse_accepts_forms_and_rejects_others() {
        assert_eq!(parse_agg("sum(item.amount)").unwrap(), AggCall { kind: AggKind::Sum, path: Some("amount".into()), decimals: 2 });
        assert_eq!(parse_agg("sum(qty, 0)").unwrap().decimals, 0);
        assert_eq!(parse_agg("count()").unwrap(), AggCall { kind: AggKind::Count, path: None, decimals: 0 });
        assert!(parse_agg("sum()").is_none());
        assert!(parse_agg("sum(item.a, 9)").is_none());
        assert!(parse_agg("format(item.a)").is_none());
        assert!(parse_agg("item.name").is_none());
    }

    #[test]
    fn sums_numbers_and_numeric_strings() {
        let r = rows(json!([{"amount": "1,200.50"}, {"amount": 300}, {"amount": "x"}, {}]));
        assert_eq!(eval_agg(&parse_agg("sum(item.amount)").unwrap(), &r), "1,500.50");
        // นับเฉพาะที่ไม่ว่าง — "x" ไม่ว่าง จึงนับ (ไม่ตรวจว่าเป็นตัวเลข)
        assert_eq!(eval_agg(&parse_agg("count(item.amount)").unwrap(), &r), "3");
        assert_eq!(eval_agg(&parse_agg("count()").unwrap(), &r), "4");
        assert_eq!(eval_agg(&parse_agg("max(item.amount)").unwrap(), &r), "1,200.50");
        assert_eq!(eval_agg(&parse_agg("min(item.amount, 0)").unwrap(), &r), "300");
        assert_eq!(eval_agg(&parse_agg("avg(item.amount)").unwrap(), &r), "750.25");
    }

    #[test]
    fn empty_input_is_zero_or_blank() {
        let none: Vec<Option<Value>> = vec![];
        assert_eq!(eval_agg(&parse_agg("sum(item.amount)").unwrap(), &none), "0.00");
        assert_eq!(eval_agg(&parse_agg("avg(item.amount)").unwrap(), &none), "");
        assert_eq!(eval_agg(&parse_agg("count()").unwrap(), &none), "0");
    }

    #[test]
    fn negative_and_rounding() {
        assert_eq!(format_number(-1234.5, 2, true), "-1,234.50");
        assert_eq!(format_number(-0.001, 2, true), "0.00");
        assert_eq!(format_number(0.125, 2, true), "0.13");
        assert_eq!(format_number(1234567.0, 0, true), "1,234,567");
    }

    #[test]
    fn bind_replaces_only_aggregates_and_group_fields() {
        let r = rows(json!([{"amount": 10}, {"amount": 5.5}]));
        let out = bind_aggregates("รวม {{ sum(item.amount) }} ({{ group.count }} รายการ) {{ page }} {{ customer.name }}", &r, Some(("A", 2)));
        assert_eq!(out, "รวม 15.50 (2 รายการ) {{ page }} {{ customer.name }}");
        assert_eq!(bind_aggregates("{{ group.value }}", &r, Some(("หมวด 1", 2))), "หมวด 1");
        assert_eq!(bind_aggregates("{{ group.value }}", &r, None), "{{ group.value }}");
        assert_eq!(bind_aggregates("ไม่ปิด {{ sum(item.a)", &r, None), "ไม่ปิด {{ sum(item.a)");
    }

    #[test]
    fn split_consecutive_groups_only() {
        let r = rows(json!([{"cat": "A", "n": 1}, {"cat": "A", "n": 2}, {"cat": "B", "n": 3}, {"cat": "A", "n": 4}]));
        let g = split_groups(&r, "item.cat");
        let keys: Vec<(&str, usize)> = g.iter().map(|(k, m)| (k.as_str(), m.len())).collect();
        assert_eq!(keys, vec![("A", 2), ("B", 1), ("A", 1)]);
        assert!(split_groups(&[], "cat").is_empty());
    }
}
