//! tr-thai: ฟังก์ชันไทย (สเปก 4.2 — Phase 1 ชุดพื้นฐาน)
//! พ.ศ., วันที่ไทย, เลขไทย, จำนวนเงินบาทตัวอักษร, สกุลเงิน, ตรวจเลขผู้เสียภาษี

/// ตรวจเลขผู้เสียภาษี 13 หลักด้วย checksum (สเปก 4.2)
pub fn validate_tax_id(id: &str) -> bool {
    if id.len() != 13 || !id.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }
    let d: Vec<u32> = id.chars().map(|c| c.to_digit(10).unwrap()).collect();
    let mut sum = 0u32;
    for (i, v) in d.iter().take(12).enumerate() {
        sum += v * (13 - (i as u32 + 1));
    }
    let check = (11 - (sum % 11)) % 10;
    check == d[12]
}

/// ตรวจรหัสสาขา 5 หลัก (สำนักงานใหญ่ = 00000)
pub fn validate_branch_code(code: &str) -> bool {
    code.len() == 5 && code.chars().all(|c| c.is_ascii_digit())
}

pub fn is_head_office(code: &str) -> bool {
    code == "00000"
}

/// ปี ค.ศ. → พ.ศ.
pub fn to_buddhist_year(ce: i32) -> i32 {
    ce + 543
}

const THAI_MONTHS: [&str; 12] = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
];

const THAI_MONTHS_SHORT: [&str; 12] = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/// วันที่ไทยแบบยาว: 14 ตุลาคม 2569 (รับ ค.ศ. + เดือน 1-12 + วัน)
pub fn thai_date_long(day: u32, month: u32, ce_year: i32) -> String {
    if !(1..=12).contains(&month) {
        return String::new();
    }
    format!("{} {} {}", day, THAI_MONTHS[(month - 1) as usize], to_buddhist_year(ce_year))
}

/// วันที่ไทยแบบย่อ: 14 ต.ค. 2569
pub fn thai_date_short(day: u32, month: u32, ce_year: i32) -> String {
    if !(1..=12).contains(&month) {
        return String::new();
    }
    format!(
        "{} {} {}",
        day,
        THAI_MONTHS_SHORT[(month - 1) as usize],
        to_buddhist_year(ce_year)
    )
}

/// เลขอารบิก → เลขไทย ๐-๙ (คงเครื่องหมายอื่นไว้)
pub fn to_thai_numerals(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '0' => '๐',
            '1' => '๑',
            '2' => '๒',
            '3' => '๓',
            '4' => '๔',
            '5' => '๕',
            '6' => '๖',
            '7' => '๗',
            '8' => '๘',
            '9' => '๙',
            _ => c,
        })
        .collect()
}

/// เลขไทย → เลขอารบิก
pub fn from_thai_numerals(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '๐' => '0',
            '๑' => '1',
            '๒' => '2',
            '๓' => '3',
            '๔' => '4',
            '๕' => '5',
            '๖' => '6',
            '๗' => '7',
            '๘' => '8',
            '๙' => '9',
            _ => c,
        })
        .collect()
}

// ---------- จำนวนเงินบาทตัวอักษร ----------

const DIGITS: [&str; 10] = [
    "ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า",
];

/// อ่านจำนวนเต็ม < 1,000,000 (0..999_999) แบบไทย
fn read_under_million(n: u64) -> String {
    debug_assert!(n < 1_000_000);
    if n == 0 {
        return "ศูนย์".to_string();
    }
    let mut out = String::new();
    let hundred_thousands = (n / 100_000) % 10;
    let ten_thousands = (n / 10_000) % 10;
    let thousands = (n / 1_000) % 10;
    let hundreds = (n / 100) % 10;
    let tens = (n / 10) % 10;
    let units = n % 10;

    // แสน หมื่น พัน ร้อย — ข้ามหลักที่เป็น 0
    if hundred_thousands > 0 {
        out.push_str(DIGITS[hundred_thousands as usize]);
        out.push_str("แสน");
    }
    if ten_thousands > 0 {
        if ten_thousands == 1 {
            // หนึ่งหมื่น (ไม่ใช้ "เอ็ด")
        } else if ten_thousands == 2 && hundred_thousands == 0 && thousands == 0 && hundreds == 0 && tens == 0 && units == 0 {
            // 20000 อ่าน "สองหมื่น" ปกติ (ไม่มีกรณียี่ที่นี่)
        }
        out.push_str(DIGITS[ten_thousands as usize]);
        out.push_str("หมื่น");
    }
    if thousands > 0 {
        out.push_str(DIGITS[thousands as usize]);
        out.push_str("พัน");
    }
    if hundreds > 0 {
        out.push_str(DIGITS[hundreds as usize]);
        out.push_str("ร้อย");
    }
    if tens > 0 {
        match tens {
            1 => out.push_str("สิบ"),
            2 => out.push_str("ยี่สิบ"),
            _ => {
                out.push_str(DIGITS[tens as usize]);
                out.push_str("สิบ");
            }
        }
    }
    if units > 0 {
        if units == 1 && tens > 0 {
            out.push_str("เอ็ด");
        } else {
            out.push_str(DIGITS[units as usize]);
        }
    }
    out
}

/// อ่านจำนวนเต็มใดๆ (รองรับถึงล้านล้านด้วย recursion ผ่าน "ล้าน")
fn read_integer(n: u64) -> String {
    if n < 1_000_000 {
        return read_under_million(n);
    }
    let high = n / 1_000_000;
    let low = n % 1_000_000;
    let mut out = read_integer(high);
    out.push_str("ล้าน");
    if low > 0 {
        // หลักแสนของ low ที่เป็น 0 ต้องไม่ออกเสียง — read_under_million จัดการแล้ว
        // แต่กรณี low < 100 เช่น 1,000,001 → "หนึ่งล้านหนึ่ง" (ห้าม "เอ็ด")
        out.push_str(&read_under_million(low));
    }
    out
}

/// จำนวนเงิน → ตัวอักษรไทย เช่น 1200.00 → "หนึ่งพันสองร้อยบาทถ้วน"
/// ปัดทศนิยม 2 ตำแหน่ง (สตางค์)
pub fn baht_text(amount: f64) -> String {
    if !amount.is_finite() {
        return String::new();
    }
    let negative = amount < 0.0;
    let total_satang = (amount.abs() * 100.0).round() as u64;
    let baht = total_satang / 100;
    let satang = total_satang % 100;

    let mut out = String::new();
    if negative {
        out.push_str("ลบ");
    }
    if baht == 0 && satang == 0 {
        return "ศูนย์บาทถ้วน".to_string();
    }
    if baht > 0 {
        out.push_str(&read_integer(baht));
        out.push_str("บาท");
    }
    if satang == 0 {
        out.push_str("ถ้วน");
    } else {
        // สตางค์อ่านเหมือนจำนวนเต็ม (< 100) แต่ 1 สตางค์ท้าย → "เอ็ดสตางค์" เมื่อสิบ>0
        out.push_str(&read_under_million(satang));
        out.push_str("สตางค์");
    }
    out
}

/// จัดรูปแบบสกุลเงินบาท: 1234567.5 → "1,234,567.50"
pub fn format_baht(amount: f64) -> String {
    let negative = amount < 0.0;
    let total_cents = (amount.abs() * 100.0).round() as i64;
    let int_part = total_cents / 100;
    let frac = (total_cents % 100).abs();
    let s = int_part.to_string();
    let mut grouped = String::new();
    for (i, c) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            grouped.push(',');
        }
        grouped.push(c);
    }
    let int_grouped: String = grouped.chars().rev().collect();
    format!("{}{}.{:02}", if negative { "-" } else { "" }, int_grouped, frac)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tax_id_checksum() {
        assert!(validate_tax_id("0105557027105"));
        assert!(!validate_tax_id("0000000000000"));
        assert!(!validate_tax_id("123"));
        assert!(!validate_tax_id("abcdefghijklm"));
    }

    #[test]
    fn branch() {
        assert!(validate_branch_code("00000"));
        assert!(is_head_office("00000"));
        assert!(validate_branch_code("00001"));
        assert!(!validate_branch_code("1234"));
    }

    #[test]
    fn dates() {
        assert_eq!(thai_date_long(14, 10, 2026), "14 ตุลาคม 2569");
        assert_eq!(thai_date_short(1, 1, 2026), "1 ม.ค. 2569");
        assert_eq!(to_buddhist_year(2026), 2569);
    }

    #[test]
    fn numerals() {
        assert_eq!(to_thai_numerals("123-456"), "๑๒๓-๔๕๖");
        assert_eq!(from_thai_numerals("๑๒๓"), "123");
    }

    #[test]
    fn baht_basic() {
        assert_eq!(baht_text(0.0), "ศูนย์บาทถ้วน");
        assert_eq!(baht_text(1.0), "หนึ่งบาทถ้วน");
        assert_eq!(baht_text(11.0), "สิบเอ็ดบาทถ้วน");
        assert_eq!(baht_text(21.0), "ยี่สิบเอ็ดบาทถ้วน");
        assert_eq!(baht_text(101.0), "หนึ่งร้อยหนึ่งบาทถ้วน");
        assert_eq!(baht_text(1200.0), "หนึ่งพันสองร้อยบาทถ้วน");
        assert_eq!(baht_text(1000000.0), "หนึ่งล้านบาทถ้วน");
    }

    #[test]
    fn baht_satang() {
        assert_eq!(baht_text(1.50), "หนึ่งบาทห้าสิบสตางค์");
        assert_eq!(baht_text(0.50), "ห้าสิบสตางค์");
        assert_eq!(baht_text(10.01), "สิบบาทหนึ่งสตางค์");
        assert_eq!(baht_text(10.11), "สิบบาทสิบเอ็ดสตางค์");
    }

    #[test]
    fn baht_format() {
        assert_eq!(format_baht(1234567.5), "1,234,567.50");
        assert_eq!(format_baht(0.0), "0.00");
    }
}
