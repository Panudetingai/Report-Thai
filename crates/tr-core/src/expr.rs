//! นิพจน์ใน `{{ … }}` ที่เป็นการเรียกฟังก์ชัน เช่น `{{ number(item.amount) }}`, `{{ bahttext(total) }}`
//!
//! ไวยากรณ์: `expr := call | literal | path` · `call := ชื่อ "(" [expr ("," expr)*] ")"`
//! literal = ตัวเลข (`12.5`, `-3`) หรือข้อความในเครื่องหมายคำพูด (`"short"` / `'short'`) ·
//! path = ฟิลด์ในข้อมูลแบบเดียวกับ `{{ customer.name }}` (รวม `item.`, `page`, `pages`)
//!
//! ฟังก์ชันจัดรูปแบบ (ค่าที่ไม่ใช่ตัวเลข/วันที่ คืนข้อความเดิม — ช่องว่างจึงยังว่าง):
//! - `number(x)` / `number(x, 0)` — คั่นหลักพัน ทศนิยม 2 ตำแหน่ง (หรือตามที่กำหนด 0–6) ปัดครึ่งขึ้น
//! - `bahttext(x)` — จำนวนเงินเป็นตัวอักษรไทย "หนึ่งพันสองร้อยบาทถ้วน"
//! - `thaidigits(x)` — เลขไทย ๐–๙
//! - `thaidate(x)` / `thaidate(x, "short")` — "2026-10-17" → "17 ตุลาคม 2569" / "17 ต.ค. 2569"
//!
//! การรวมค่า (`sum(…)` ฯลฯ) ไม่ได้คำนวณที่นี่: ตัวจัดหน้าแทนค่ารวมเป็นตัวเลขก่อน (ดู `aggregate`)
//! จึงซ้อนได้ เช่น `{{ bahttext(sum(item.amount)) }}`

use crate::aggregate::{decimal_of, format_decimal};
use rust_decimal::prelude::ToPrimitive;
use rust_decimal::{Decimal, RoundingStrategy};
use serde_json::Value;

/// ชื่อฟังก์ชันจัดรูปแบบที่ engine รู้จัก
pub const FORMAT_FUNCTIONS: [&str; 4] = ["number", "bahttext", "thaidigits", "thaidate"];

#[derive(Debug, Clone, PartialEq)]
pub enum Expr {
    Call(String, Vec<Expr>),
    /// ตัวเลขตามที่เขียน (เก็บเป็นข้อความเพื่อไม่เสียความแม่นยำ)
    Num(String),
    Str(String),
    Path(String),
}

impl Expr {
    /// แยกนิพจน์ — คืน None เมื่อรูปแบบผิด (วงเล็บไม่ครบ, เครื่องหมายคำพูดไม่ปิด ฯลฯ)
    pub fn parse(src: &str) -> Option<Expr> {
        let chars: Vec<char> = src.chars().collect();
        let mut p = Parser { s: &chars, i: 0 };
        let e = p.expr()?;
        p.ws();
        (p.i == chars.len()).then_some(e)
    }

    /// เขียนกลับเป็นข้อความนิพจน์ (ใช้หลังแทนค่ารวมด้วยตัวเลขแล้ว)
    pub fn to_source(&self) -> String {
        match self {
            Expr::Call(name, args) => {
                let a: Vec<String> = args.iter().map(Expr::to_source).collect();
                format!("{name}({})", a.join(", "))
            }
            Expr::Num(n) => n.clone(),
            Expr::Str(s) if s.contains('"') => format!("'{s}'"),
            Expr::Str(s) => format!("\"{s}\""),
            Expr::Path(p) => p.clone(),
        }
    }

    /// ทุก path ในนิพจน์ (ใช้ตรวจว่าฟิลด์ที่อ้างถึงมีอยู่จริง)
    pub fn paths(&self) -> Vec<&str> {
        match self {
            Expr::Path(p) => vec![p.as_str()],
            Expr::Call(_, args) => args.iter().flat_map(Expr::paths).collect(),
            _ => vec![],
        }
    }
}

struct Parser<'a> {
    s: &'a [char],
    i: usize,
}

impl Parser<'_> {
    fn ws(&mut self) {
        while self.s.get(self.i).is_some_and(|c| c.is_whitespace()) {
            self.i += 1;
        }
    }

    fn expr(&mut self) -> Option<Expr> {
        self.ws();
        match *self.s.get(self.i)? {
            q @ ('"' | '\'') => {
                self.i += 1;
                let start = self.i;
                while *self.s.get(self.i)? != q {
                    self.i += 1;
                }
                let text: String = self.s[start..self.i].iter().collect();
                self.i += 1;
                Some(Expr::Str(text))
            }
            _ => {
                let start = self.i;
                while self.s.get(self.i).is_some_and(|c| !matches!(c, '(' | ')' | ',' | '"' | '\'')) {
                    self.i += 1;
                }
                let word: String = self.s[start..self.i].iter().collect::<String>().trim().to_string();
                if word.is_empty() {
                    return None;
                }
                if self.s.get(self.i) == Some(&'(') {
                    if !word.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
                        return None;
                    }
                    self.i += 1;
                    let mut args = Vec::new();
                    self.ws();
                    if self.s.get(self.i) == Some(&')') {
                        self.i += 1;
                        return Some(Expr::Call(word, args));
                    }
                    loop {
                        args.push(self.expr()?);
                        self.ws();
                        match *self.s.get(self.i)? {
                            ',' => self.i += 1,
                            ')' => {
                                self.i += 1;
                                return Some(Expr::Call(word, args));
                            }
                            _ => return None,
                        }
                    }
                }
                if word.parse::<f64>().is_ok() && !word.contains(char::is_whitespace) {
                    Some(Expr::Num(word))
                } else {
                    Some(Expr::Path(word))
                }
            }
        }
    }
}

/// ประเมินนิพจน์ที่เป็นการเรียกฟังก์ชันจัดรูปแบบ — `resolve` แปลง path เป็นค่า
/// ฟังก์ชันที่ไม่รู้จัก (หรือการรวมค่านอก band ที่รวมได้) คืนข้อความว่าง เหมือนฟิลด์ที่หาไม่พบ
pub fn eval(e: &Expr, resolve: &dyn Fn(&str) -> Option<Value>) -> Value {
    match e {
        Expr::Num(n) => Value::String(n.clone()),
        Expr::Str(s) => Value::String(s.clone()),
        Expr::Path(p) => resolve(p).unwrap_or(Value::Null),
        Expr::Call(name, args) => {
            let arg = |i: usize| args.get(i).map(|a| eval(a, resolve)).unwrap_or(Value::Null);
            let text = |v: &Value| match v {
                Value::String(s) => s.clone(),
                Value::Null => String::new(),
                other => other.to_string(),
            };
            let x = arg(0);
            let out = match name.as_str() {
                "number" => {
                    let decimals = match args.get(1) {
                        None => Some(2),
                        Some(_) => decimal_of(&arg(1)).and_then(|d| d.to_u32()).filter(|d| *d <= 6),
                    };
                    match (decimal_of(&x), decimals) {
                        (Some(d), Some(n)) => format_decimal(d, n, true),
                        _ => text(&x),
                    }
                }
                "bahttext" => match decimal_of(&x) {
                    Some(d) => {
                        let satang = (d.round_dp_with_strategy(2, RoundingStrategy::MidpointAwayFromZero) * Decimal::ONE_HUNDRED).to_i64();
                        satang.map(tr_thai::baht_text_satang).unwrap_or_default()
                    }
                    None => text(&x),
                },
                "thaidigits" => tr_thai::to_thai_numerals(&text(&x)),
                "thaidate" => {
                    let short = text(&arg(1)) == "short";
                    let raw = text(&x);
                    match parse_iso_date(&raw) {
                        Some((y, m, d)) if short => tr_thai::thai_date_short(d, m, y),
                        Some((y, m, d)) => tr_thai::thai_date_long(d, m, y),
                        None => raw,
                    }
                }
                _ => String::new(),
            };
            Value::String(out)
        }
    }
}

/// "YYYY-MM-DD" (ตามด้วยเวลาได้ เช่น "2026-10-17T09:30:00") → (ปี ค.ศ., เดือน, วัน)
fn parse_iso_date(s: &str) -> Option<(i32, u32, u32)> {
    let date = s.trim().get(..10)?;
    let mut it = date.split('-');
    let (y, m, d) = (it.next()?, it.next()?, it.next()?);
    if y.len() != 4 || m.len() != 2 || d.len() != 2 {
        return None;
    }
    let (y, m, d) = (y.parse().ok()?, m.parse().ok()?, d.parse().ok()?);
    ((1..=12).contains(&m) && (1..=31).contains(&d)).then_some((y, m, d))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn run(src: &str, data: &Value) -> String {
        let e = Expr::parse(src).expect("parse");
        match eval(&e, &|p| crate::lookup(data, p)) {
            Value::String(s) => s,
            other => other.to_string(),
        }
    }

    #[test]
    fn parses_calls_literals_and_paths() {
        assert_eq!(Expr::parse("item.name"), Some(Expr::Path("item.name".into())));
        assert_eq!(
            Expr::parse(" number( item.amount , 0 ) "),
            Some(Expr::Call("number".into(), vec![Expr::Path("item.amount".into()), Expr::Num("0".into())]))
        );
        assert_eq!(
            Expr::parse("thaidate(doc.date, 'short')").unwrap().to_source(),
            "thaidate(doc.date, \"short\")"
        );
        assert_eq!(Expr::parse("bahttext(sum(item.amount))").unwrap().to_source(), "bahttext(sum(item.amount))");
        assert_eq!(Expr::parse("items[0].price"), Some(Expr::Path("items[0].price".into())));
        for bad in ["number(", "number(a b", "x)", "number(a,)", "\"open", "a.b(c)"] {
            assert_eq!(Expr::parse(bad), None, "{bad}");
        }
    }

    #[test]
    fn number_formats_like_totals() {
        let d = json!({ "a": "2606.5", "b": 1234567, "c": "1,200.005", "blank": "", "neg": -0.004 });
        assert_eq!(run("number(a)", &d), "2,606.50");
        assert_eq!(run("number(b, 0)", &d), "1,234,567");
        assert_eq!(run("number(c)", &d), "1,200.01", "ปัดครึ่งขึ้น");
        assert_eq!(run("number(blank)", &d), "", "ค่าว่างคงว่าง");
        assert_eq!(run("number(neg)", &d), "0.00", "ไม่ติดลบศูนย์");
        assert_eq!(run("number(missing)", &d), "");
        assert_eq!(run("number(a, 9)", &d), "2606.5", "ทศนิยมเกิน 6 → คืนค่าเดิม");
    }

    #[test]
    fn thai_functions() {
        let d = json!({ "total": "1,200.50", "n": 2569, "date": "2026-10-17", "t": "2026-01-05T08:00:00", "bad": "17/10/2569" });
        assert_eq!(run("bahttext(total)", &d), "หนึ่งพันสองร้อยบาทห้าสิบสตางค์");
        assert_eq!(run("bahttext(1.005)", &d), "หนึ่งบาทหนึ่งสตางค์", "ทศนิยมตายตัว ไม่เพี้ยนแบบ f64");
        assert_eq!(run("thaidigits(n)", &d), "๒๕๖๙");
        assert_eq!(run("thaidigits(number(total))", &d), "๑,๒๐๐.๕๐");
        assert_eq!(run("thaidate(date)", &d), "17 ตุลาคม 2569");
        assert_eq!(run("thaidate(t, \"short\")", &d), "5 ม.ค. 2569");
        assert_eq!(run("thaidate(bad)", &d), "17/10/2569", "รูปแบบอื่นคืนค่าเดิม");
        assert_eq!(run("unknownfn(total)", &d), "");
    }
}
