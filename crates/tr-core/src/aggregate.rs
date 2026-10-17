//! รวมค่าในกลุ่ม/ทั้งรายงาน (Phase 3): `sum`, `count`, `avg`, `min`, `max` และ `group.value` / `group.count`
//!
//! ทำงาน "ก่อนจัดหน้า": ตัวจัดหน้าแทนนิพจน์เหล่านี้ด้วยข้อความบนสำเนาของ band
//! ทำให้ตัวผูกค่า `bind_text` ไม่ต้องรู้เรื่องกลุ่ม — นิพจน์ที่ไม่ใช่รวมค่าจะคงไว้ตามเดิม
//!
//! รูปแบบ: `{{ sum(item.amount) }}` (ทศนิยม 2 ตำแหน่ง, คั่นหลักพัน),
//! `{{ sum(item.amount, 0) }}` (กำหนดทศนิยมเอง), `{{ count() }}`, `{{ count(item.no) }}` (นับที่ไม่ว่าง)
//! ซ้อนในฟังก์ชันจัดรูปแบบได้ เช่น `{{ bahttext(sum(item.amount)) }}` (ดู `expr`)
//!
//! รวมด้วยทศนิยมตายตัว (`rust_decimal`, 28 หลัก) ไม่ใช้ f64 — ยอดเงินถูกทุกสตางค์ ปัดครึ่งขึ้นตามธรรมเนียมใบเสร็จ

use crate::expr::Expr;
use crate::lookup;
use rust_decimal::{Decimal, RoundingStrategy};
use serde_json::Value;
use std::str::FromStr;

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

/// ค่าที่เป็นตัวเลขได้: number หรือ string ที่แปลงได้ (ตัด comma ออกก่อน) เป็นทศนิยมตายตัว
/// ตัวเลขใน JSON อ่านจากรูปข้อความ (เช่น 0.1 → 0.1 พอดี ไม่ใช่ 0.1000000000000000055…)
pub fn decimal_of(v: &Value) -> Option<Decimal> {
    let text = match v {
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.trim().replace(',', ""),
        _ => return None,
    };
    if text.is_empty() {
        return None;
    }
    Decimal::from_str(&text).or_else(|_| Decimal::from_scientific(&text)).ok()
}

/// เหมือน `decimal_of` แต่คืน f64 (สำหรับโค้ดที่ไม่ต้องการความแม่นยำระดับสตางค์)
pub fn number_of(v: &Value) -> Option<f64> {
    use rust_decimal::prelude::ToPrimitive;
    decimal_of(v).and_then(|d| d.to_f64())
}

/// ข้อความของค่าที่ใช้เป็นคีย์กลุ่ม (null/ไม่มี = ว่าง)
pub fn key_text(v: Option<&Value>) -> String {
    match v {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(s)) => s.clone(),
        Some(other) => other.to_string(),
    }
}

/// จัดรูปแบบตัวเลข: ทศนิยมตามที่กำหนด (ปัดครึ่งขึ้น), คั่นหลักพัน, ไม่ติดลบถ้าปัดเป็นศูนย์
pub fn format_decimal(v: Decimal, decimals: u32, grouping: bool) -> String {
    let mut r = v.round_dp_with_strategy(decimals, RoundingStrategy::MidpointAwayFromZero);
    r.rescale(decimals);
    let negative = r.is_sign_negative() && !r.is_zero();
    let plain = r.abs().to_string();
    let (int_part, frac_part) = match plain.split_once('.') {
        Some((i, f)) => (i, Some(f)),
        None => (plain.as_str(), None),
    };
    let mut out = String::with_capacity(plain.len() + 4);
    if negative {
        out.push('-');
    }
    let len = int_part.len();
    for (k, ch) in int_part.chars().enumerate() {
        if grouping && k > 0 && (len - k) % 3 == 0 {
            out.push(',');
        }
        out.push(ch);
    }
    if let Some(f) = frac_part {
        out.push('.');
        out.push_str(f);
    }
    out
}

/// เหมือน `format_decimal` สำหรับ f64 — แปลงผ่านรูปข้อความที่สั้นที่สุดของ f64 (0.125 → "0.125")
pub fn format_number(v: f64, decimals: usize, grouping: bool) -> String {
    let d = Decimal::from_str(&v.to_string())
        .or_else(|_| Decimal::from_scientific(&format!("{v:e}")))
        .unwrap_or_default();
    format_decimal(d, decimals as u32, grouping)
}

/// ค่าดิบของการรวม (ยังไม่จัดรูปแบบ) — None เมื่อไม่มีแถวที่เป็นตัวเลข (ยกเว้น sum = 0)
/// หรือผลรวมเกินช่วงของ Decimal (~7.9 × 10²⁸)
pub fn agg_value(call: &AggCall, rows: &[Option<Value>]) -> Option<Decimal> {
    let field = |row: &Option<Value>| -> Option<Value> {
        let r = row.as_ref()?;
        match &call.path {
            Some(p) => lookup(r, p),
            None => Some(r.clone()),
        }
    };
    if call.kind == AggKind::Count {
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
        return Some(Decimal::from(n));
    }
    let nums: Vec<Decimal> = rows.iter().filter_map(field).filter_map(|v| decimal_of(&v)).collect();
    let sum = || nums.iter().try_fold(Decimal::ZERO, |acc, x| acc.checked_add(*x));
    match call.kind {
        AggKind::Sum => sum(),
        AggKind::Avg if !nums.is_empty() => sum()?.checked_div(Decimal::from(nums.len())),
        AggKind::Min => nums.iter().copied().min(),
        AggKind::Max => nums.iter().copied().max(),
        _ => None,
    }
}

/// คำนวณค่าของนิพจน์รวมค่าบนแถวทั้งหมดที่ส่งเข้ามา (จัดรูปแบบแล้ว: คั่นหลักพัน ทศนิยมตาม `decimals`)
/// ไม่มีแถวที่เป็นตัวเลข: รวมได้ 0, ค่าเฉลี่ย/ต่ำสุด/สูงสุดเว้นว่าง
pub fn eval_agg(call: &AggCall, rows: &[Option<Value>]) -> String {
    agg_value(call, rows)
        .map(|v| format_decimal(v, call.decimals as u32, true))
        .unwrap_or_default()
}

/// แทน `{{ … }}` ที่เป็นการรวมค่า/กลุ่มด้วยค่าจริง; นิพจน์อื่นคงไว้ทั้งชิ้น
/// การรวมค่าที่ซ้อนในฟังก์ชัน (`{{ bahttext(sum(item.amount)) }}`) ถูกแทนด้วยตัวเลขดิบ
/// แล้วคงฟังก์ชันไว้ให้ตัวผูกค่า (`bind_text`) ทำต่อ → `{{ bahttext(1500.50) }}`
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
            _ => match parse_agg(expr) {
                Some(call) => Some(eval_agg(&call, rows)),
                None => Expr::parse(expr)
                    .filter(|e| matches!(e, Expr::Call(..)))
                    .and_then(|e| substitute_nested(&e, rows, group))
                    .map(|e| format!("{{{{ {} }}}}", e.to_source())),
            },
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

/// แทนการรวมค่า/group.* ที่ซ้อนอยู่ในนิพจน์ด้วยค่าคงที่ — None ถ้าไม่มีอะไรให้แทน (คงนิพจน์เดิม)
fn substitute_nested(e: &Expr, rows: &[Option<Value>], group: Option<(&str, usize)>) -> Option<Expr> {
    match e {
        Expr::Path(p) if p == "group.value" => group.map(|(v, _)| Expr::Str(v.to_string())),
        Expr::Path(p) if p == "group.count" => group.map(|(_, n)| Expr::Num(n.to_string())),
        Expr::Call(name, args) => {
            if let Some(call) = parse_agg(&e.to_source()) {
                let raw = agg_value(&call, rows).map(|v| format_decimal(v, call.decimals as u32, false));
                return Some(raw.map(Expr::Num).unwrap_or_else(|| Expr::Str(String::new())));
            }
            let mut changed = false;
            let new_args = args
                .iter()
                .map(|a| match substitute_nested(a, rows, group) {
                    Some(n) => {
                        changed = true;
                        n
                    }
                    None => a.clone(),
                })
                .collect();
            changed.then(|| Expr::Call(name.clone(), new_args))
        }
        _ => None,
    }
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
    fn decimal_sum_is_exact() {
        // f64: 0.1 + 0.2 = 0.30000000000000004 และผลรวมหลักล้านหลายพันแถวเพี้ยนสะสม
        let r = rows(json!([{"a": 0.1}, {"a": "0.2"}]));
        assert_eq!(eval_agg(&parse_agg("sum(item.a, 6)").unwrap(), &r), "0.300000");
        let many: Vec<Option<Value>> = (0..10_000).map(|_| Some(json!({"a": "1234567.89"}))).collect();
        assert_eq!(eval_agg(&parse_agg("sum(item.a)").unwrap(), &many), "12,345,678,900.00");
        // ปัดครึ่งขึ้นที่ค่าที่ f64 แทนไม่ได้พอดี
        assert_eq!(format_number(2.675, 2, false), "2.68");
        assert_eq!(format_number(1.005, 2, false), "1.01");
    }

    #[test]
    fn nested_aggregates_become_literals() {
        let r = rows(json!([{"amount": "1,000"}, {"amount": 200.5}]));
        assert_eq!(bind_aggregates("{{ bahttext(sum(item.amount)) }}", &r, None), "{{ bahttext(1200.50) }}");
        assert_eq!(bind_aggregates("{{ thaidigits(count()) }}", &r, None), "{{ thaidigits(2) }}");
        assert_eq!(bind_aggregates("{{ thaidigits(group.value) }}", &r, Some(("12", 2))), "{{ thaidigits(\"12\") }}");
        // ไม่มีการรวมค่าข้างใน → คงไว้ตามที่เขียน
        assert_eq!(bind_aggregates("{{ number( item.amount ) }}", &r, None), "{{ number( item.amount ) }}");
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
