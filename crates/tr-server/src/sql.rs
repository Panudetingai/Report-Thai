//! คิวรี SQL ฝั่งเซิร์ฟเวอร์ (Phase 3): ไคลเอนต์ส่งได้แค่ "ชื่อคิวรี" กับ "ค่าพารามิเตอร์"
//!
//! - คิวรีเป็นไฟล์ `*.sql` ในโฟลเดอร์ที่ผู้ดูแลตั้งค่า (`TR_QUERIES_DIR`) ไคลเอนต์ส่ง SQL เองไม่ได้
//! - พารามิเตอร์เขียนเป็น `:name` ในคิวรี และถูกผูกเป็น prepared statement เสมอ ไม่มีการต่อสตริง
//! - ค่าพารามิเตอร์รับเฉพาะ null/boolean/number/string
//! - จำนวนแถวสูงสุดจำกัดตาม `TR_MAX_QUERY_ROWS` ป้องกันหน่วยความจำพุ่ง
//! - ข้อผิดพลาดของฐานข้อมูลคืนเป็นข้อความทั่วไป ไม่ส่งรายละเอียด SQL หรือค่าข้อมูลกลับไปให้ไคลเอนต์

use serde_json::{Map, Value};
use sqlx::{Column, Row, SqlitePool};

#[derive(Debug, PartialEq, Eq)]
pub enum QueryError {
    /// ชื่อคิวรีไม่ถูกต้องหรือไม่มีไฟล์
    NotFound(String),
    /// พารามิเตอร์ที่คิวรีต้องการแต่คำขอไม่ได้ส่งมา
    MissingParam(String),
    /// ค่าพารามิเตอร์ชนิดที่ไม่รองรับ (object/array)
    BadParam(String),
    /// แถวเกินเพดาน
    TooManyRows(usize),
    /// ข้อผิดพลาดจากฐานข้อมูล (รายละเอียดอยู่ในล็อกฝั่งเซิร์ฟเวอร์เท่านั้น)
    Database,
}

impl std::fmt::Display for QueryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            QueryError::NotFound(n) => write!(f, "ไม่พบคิวรี {n}"),
            QueryError::MissingParam(p) => write!(f, "ขาดพารามิเตอร์ {p}"),
            QueryError::BadParam(p) => write!(f, "พารามิเตอร์ {p} ต้องเป็นค่าเดี่ยว (ตัวเลข ข้อความ true/false หรือ null)"),
            QueryError::TooManyRows(max) => write!(f, "คิวรีคืนแถวเกิน {max} แถว"),
            QueryError::Database => write!(f, "คิวรีฐานข้อมูลไม่สำเร็จ"),
        }
    }
}

/// แปลง `:name` เป็น `?` ตามลำดับที่ปรากฏ คืน (SQL ที่ผูกได้, ชื่อพารามิเตอร์ตามลำดับ)
/// ข้ามสตริง '…', ตัวระบุ "…", คอมเมนต์ -- และ /* */ และข้าม `::` (การ cast ของ Postgres)
pub fn prepare(sql: &str) -> (String, Vec<String>) {
    let chars: Vec<char> = sql.chars().collect();
    let mut out = String::with_capacity(sql.len());
    let mut names = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        match c {
            '\'' | '"' => {
                // ข้ามทั้งสตริง/ตัวระบุ (รองรับการเขียน '' หรือ "" เพื่อใส่เครื่องหมายคำพูดซ้อน)
                let quote = c;
                out.push(c);
                i += 1;
                while i < chars.len() {
                    out.push(chars[i]);
                    if chars[i] == quote {
                        if i + 1 < chars.len() && chars[i + 1] == quote {
                            out.push(chars[i + 1]);
                            i += 2;
                            continue;
                        }
                        i += 1;
                        break;
                    }
                    i += 1;
                }
            }
            '-' if chars.get(i + 1) == Some(&'-') => {
                while i < chars.len() && chars[i] != '\n' {
                    out.push(chars[i]);
                    i += 1;
                }
            }
            '/' if chars.get(i + 1) == Some(&'*') => {
                out.push_str("/*");
                i += 2;
                while i < chars.len() && !(chars[i] == '*' && chars.get(i + 1) == Some(&'/')) {
                    out.push(chars[i]);
                    i += 1;
                }
                if i < chars.len() {
                    out.push_str("*/");
                    i += 2;
                }
            }
            ':' if chars.get(i + 1).is_some_and(|n| n.is_ascii_alphabetic() || *n == '_') && (i == 0 || chars[i - 1] != ':') => {
                let mut name = String::new();
                let mut j = i + 1;
                while j < chars.len() && (chars[j].is_ascii_alphanumeric() || chars[j] == '_') {
                    name.push(chars[j]);
                    j += 1;
                }
                out.push('?');
                names.push(name);
                i = j;
            }
            _ => {
                out.push(c);
                i += 1;
            }
        }
    }
    (out, names)
}

/// ชื่อคิวรี/ไฟล์ที่ยอมรับ: อักษร ตัวเลข `_` `-` เท่านั้น ยาวไม่เกิน 64
pub fn is_query_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= 64 && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// อ่านไฟล์คิวรี `<dir>/<name>.sql`
pub fn load_query(dir: &std::path::Path, name: &str) -> Result<String, QueryError> {
    if !is_query_name(name) {
        return Err(QueryError::NotFound(name.to_string()));
    }
    std::fs::read_to_string(dir.join(format!("{name}.sql"))).map_err(|_| QueryError::NotFound(name.to_string()))
}

/// รันคิวรีด้วยพารามิเตอร์ที่ผูกแล้ว คืนแถวเป็น JSON object ต่อแถว
pub async fn run(
    pool: &SqlitePool,
    sql_text: &str,
    params: &Map<String, Value>,
    max_rows: usize,
) -> Result<Vec<Value>, QueryError> {
    let (sql, names) = prepare(sql_text);
    let mut query = sqlx::query(&sql);
    for name in &names {
        let value = params.get(name).ok_or_else(|| QueryError::MissingParam(name.clone()))?;
        query = match value {
            Value::Null => query.bind(None::<String>),
            Value::Bool(b) => query.bind(*b),
            Value::Number(n) => match n.as_i64() {
                Some(i) => query.bind(i),
                None => query.bind(n.as_f64().unwrap_or(0.0)),
            },
            Value::String(s) => query.bind(s.clone()),
            _ => return Err(QueryError::BadParam(name.clone())),
        };
    }
    let rows = query.fetch_all(pool).await.map_err(|e| {
        eprintln!("tr-server: คิวรีล้มเหลว: {e}");
        QueryError::Database
    })?;
    if rows.len() > max_rows {
        return Err(QueryError::TooManyRows(max_rows));
    }
    rows.iter().map(|row| row_to_json(row)).collect()
}

fn row_to_json(row: &sqlx::sqlite::SqliteRow) -> Result<Value, QueryError> {
    let mut obj = Map::new();
    for (idx, col) in row.columns().iter().enumerate() {
        obj.insert(col.name().to_string(), cell(row, idx)?);
    }
    Ok(Value::Object(obj))
}

/// SQLite เป็น dynamic typing: ลองตามลำดับ INTEGER → REAL → TEXT, NULL คือ null
fn cell(row: &sqlx::sqlite::SqliteRow, idx: usize) -> Result<Value, QueryError> {
    if let Ok(v) = row.try_get::<Option<i64>, _>(idx) {
        return Ok(v.map(Value::from).unwrap_or(Value::Null));
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(idx) {
        return Ok(v.and_then(serde_json::Number::from_f64).map(Value::Number).unwrap_or(Value::Null));
    }
    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return Ok(v.map(Value::from).unwrap_or(Value::Null));
    }
    Err(QueryError::BadParam(format!("คอลัมน์ {} มีชนิดข้อมูลที่ไม่รองรับ (BLOB)", row.columns()[idx].name())))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn named_params_become_positional_in_order() {
        let (sql, names) = prepare("SELECT a FROM t WHERE x = :first AND y = :second OR z = :first");
        assert_eq!(sql, "SELECT a FROM t WHERE x = ? AND y = ? OR z = ?");
        assert_eq!(names, vec!["first", "second", "first"]);
    }

    #[test]
    fn skips_literals_comments_and_casts() {
        let (sql, names) = prepare("SELECT ':not', \":quoted\", 'it''s :x' -- :comment\nFROM t /* :block */ WHERE a = :real AND b::text = 'c'");
        assert_eq!(names, vec!["real"]);
        assert!(sql.contains("':not'") && sql.contains("\":quoted\"") && sql.contains("'it''s :x'"));
        assert!(sql.contains("-- :comment") && sql.contains("/* :block */"));
        assert!(sql.contains("b::text"));
    }

    #[test]
    fn query_names_are_restricted() {
        assert!(is_query_name("invoice_lines"));
        assert!(is_query_name("q-1"));
        assert!(!is_query_name("../etc"));
        assert!(!is_query_name("a.b"));
        assert!(!is_query_name(""));
    }
}
