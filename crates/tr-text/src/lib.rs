//! tr-text: shaping, ตัดคำไทย, ฟอนต์
//! Phase 0 spike: cosmic-text + thaibreak/uniworld

/// ตัดคำไทยด้วย thaibreak (crate `thaibreak`, repo thai-break, Apache-2.0)
/// คืนเป็น owned Strings เพื่อให้ caller เก็บข้าม scope ได้
pub fn segment_thai(text: &str) -> Vec<String> {
    thaibreak::words(text)
}

/// ตัดคำ/หาขอบเขตคำด้วย uniworld (UAX #29, MIT)
/// ใช้ `uniworld::segment::word_boundaries` แล้ว slice ตาม byte offsets
pub fn segment_thai_uniworld(text: &str) -> Vec<String> {
    if text.is_empty() {
        return vec![];
    }
    let mut offsets = uniworld::segment::word_boundaries(text, None);
    offsets.push(text.len());
    offsets
        .windows(2)
        .filter_map(|w| text.get(w[0]..w[1]).map(|s| s.to_string()))
        .filter(|s| !s.is_empty())
        .collect()
}

/// ใส่ ZWSP (U+200B) ตามจุดตัดบรรทัดของ thaibreak เพื่อให้ cosmic-text/universal
/// line breaker ตัดบรรทัดภาษาไทยได้โดยไม่ตัดกลางคำ
pub fn insert_break_opportunities(text: &str) -> String {
    thaibreak::lines(text, "​", false)
}

/// สร้าง FontSystem พร้อมฟอนต์ทดสอบ และคืนชื่อ family ของฟอนต์นั้น
/// สำคัญ: วัดความกว้างต้องระบุ family ตัวเดียวกับที่ krilla ใช้วาด
/// ห้ามใช้ SansSerif ลอยๆ — fontdb อาจจับคู่ฟอนต์ระบบตัวอื่นที่กว้างไม่เท่ากัน
fn thai_font_system(font_data: &[u8]) -> (cosmic_text::FontSystem, String) {
    let mut font_system = cosmic_text::FontSystem::new();
    let ids = font_system.db_mut().load_font_source(fontdb::Source::Binary(
        std::sync::Arc::new(font_data.to_vec()),
    ));
    let family = ids
        .first()
        .and_then(|id| font_system.db().face(*id))
        .and_then(|info| info.families.first().map(|(name, _)| name.clone()))
        .unwrap_or_default();
    (font_system, family)
}

/// pool ของ FontSystem แยกตามฟอนต์ — FontSystem::new() แพง (โหลดฟอนต์ระบบ)
/// engine วัดกว้างเป็นพันครั้งต่อรายงาน ถ้าสร้างใหม่ทุกครั้งจะช้าเป็นหลักนาที
/// pool นี้ทำให้ครั้งแรกช้าครั้งเดียว ครั้งถัดไปใช้ของเดิม (mutex ตรงๆ พอสำหรับ Phase 1)
fn pooled_measure(text: &str, font_data: &[u8], font_size: f32) -> f32 {
    use cosmic_text::{Attrs, Buffer, Family, Metrics, Shaping, Wrap};
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    static POOL: std::sync::OnceLock<
        std::sync::Mutex<std::collections::HashMap<u64, (cosmic_text::FontSystem, String)>>,
    > = std::sync::OnceLock::new();
    let pool = POOL.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));

    let mut h = DefaultHasher::new();
    font_data.hash(&mut h);
    let key = h.finish();

    let mut guard = pool.lock().unwrap();
    let entry = guard.entry(key).or_insert_with(|| thai_font_system(font_data));
    let (font_system, family) = entry;
    let attrs;
    let attrs_ref: &Attrs = if family.is_empty() {
        attrs = Attrs::new();
        &attrs
    } else {
        attrs = Attrs::new().family(Family::Name(family));
        &attrs
    };
    let metrics = Metrics::new(font_size, font_size * 1.2);
    let mut buffer = Buffer::new(font_system, metrics);
    buffer.set_size(Some(5000.0), Some(font_size * 2.0));
    buffer.set_wrap(Wrap::None);
    buffer.set_text(text, attrs_ref, Shaping::Advanced, None);
    buffer.shape_until_scroll(font_system, false);
    buffer
        .layout_runs()
        .map(|r| r.line_w)
        .fold(0.0f32, f32::max)
}

/// วัดความกว้างข้อความไทย (px) ด้วย cosmic-text ที่ font size กำหนด
/// ใช้ greedy wrap ประกอบกับ thaibreak — 1px ≈ 1pt ที่ 72dpi (spike)
/// หมายเหตุ: ใช้ FontSystem pool ร่วม (ครั้งแรกช้า ครั้งถัดไปเร็ว)
pub fn measure_thai_width(text: &str, font_data: &[u8], font_size: f32) -> f32 {
    pooled_measure(text, font_data, font_size)
}

/// ตัวอักษรที่ห้ามขึ้นต้นบรรทัดใหม่ (ไม้ยมก/ป้าย/สระบนล่างลอยๆ)
fn is_no_start_char(c: char) -> bool {
    matches!(
        c,
        '\u{e2f}' // ฯ ไปยาลน้อย
        | '\u{e46}' // ๆ ไม้ยมก
        | '\u{e31}' // ั ไม้หันอากาศ
        | '\u{e34}'..='\u{e3a}' // ิ-ุ + ึ
        | '\u{e47}'..='\u{e4e}' // เ-๎ + ็-๋ + ์
    )
}

/// บังคับตัดก้อนที่ยาวเกินความกว้างทีละตัวอักษร (ทางสุดท้ายกันล้น)
/// ไม่ทิ้งอักษรห้ามขึ้นต้นไว้หัวบรรทัด — ยอมให้ล้นนิดหน่อยดีกว่าตัดผิด
fn force_break_unit(unit: &str, font_data: &[u8], font_size: f32, max_width: f32) -> Vec<String> {
    let mut chunks: Vec<String> = Vec::new();
    let mut cur = String::new();
    for c in unit.chars() {
        if c == '\u{200b}' {
            continue;
        }
        // อักษรห้ามขึ้นต้น: เกาะก้อนเดิมเสมอ (แม้จะล้นนิดหน่อย)
        if is_no_start_char(c) && !cur.is_empty() {
            cur.push(c);
            continue;
        }
        let candidate = format!("{cur}{c}");
        if measure_thai_width(&candidate, font_data, font_size) <= max_width || cur.is_empty() {
            cur = candidate;
        } else {
            chunks.push(cur);
            cur = c.to_string();
        }
    }
    if !cur.is_empty() {
        chunks.push(cur);
    }
    if chunks.is_empty() {
        vec![unit.replace('\u{200b}', "")]
    } else {
        chunks
    }
}
/// ตัดคำด้วยพจนานุกรมผู้ใช้เพิ่มเติม (สเปก 4.2: เพิ่มคำเองได้)
/// เช่น เติม "วันที่" แล้ว "วันที่" จะไม่ถูกตัดเป็น "วัน|ที่" อีก
pub fn segment_thai_with_dict(text: &str, extra_words: &[&str]) -> Vec<String> {
    if extra_words.is_empty() {
        return segment_thai(text);
    }
    let mut trie = thaibreak::ThaiTrie::embedded().expect("โหลดพจนานุกรมหลัก");
    for w in extra_words {
        trie.add(w, 10.0);
    }
    thaibreak::Tokenizer::new(trie, None).tokenize(text, false)
}

/// จุดตัดบรรทัดพร้อมพจนานุกรมผู้ใช้ (คืนข้อความที่ฝัง ZWSP)
fn break_opportunities_with_dict(text: &str, extra_words: &[&str]) -> String {
    if extra_words.is_empty() {
        return insert_break_opportunities(text);
    }
    let mut trie = thaibreak::ThaiTrie::embedded().expect("โหลดพจนานุกรมหลัก");
    for w in extra_words {
        trie.add(w, 10.0);
    }
    let tok = thaibreak::Tokenizer::new(trie, None);
    thaibreak::LineBreaker::new(tok).insert_line_breaks(text, "\u{200b}", false)
}

/// ตัดบรรทัดภาษาไทยให้พอดีความกว้างที่กำหนด (หน่วย px ≈ pt)
/// ใช้จุดตัดของ thaibreak (ไม่ตัดกลางคำ, ไม่ทิ้ง ไม้ยมก/ฯลฯ ไว้หัวบรรทัด)
/// `extra_words`: พจนานุกรมผู้ใช้ (เช่น ["วันที่"]) — กันพจนานุกรมหลักตัดพลาด
/// - ข้อความมี `\n` จะแยกย่อหน้าก่อนตัด (กัน glyph หาย/\u{200b} หลุดไปถึง PDF)
/// - ก้อนที่ยาวเกินความกว้างจะถูกบังคับตัดทีละตัวอักษร (ไม่มี "ยอมล้น" แล้ว)
/// คืนบรรทัดย่อยที่ไม่มี `\n` / `\u{200b}` / control chars ปน
pub fn wrap_thai(
    text: &str,
    font_data: &[u8],
    font_size: f32,
    max_width: f32,
    extra_words: &[&str],
) -> Vec<String> {
    if text.trim().is_empty() {
        return vec![text.to_string()];
    }
    let mut out: Vec<String> = Vec::new();
    // แยกย่อหน้าก่อน — ห้ามส่ง \n ลงไปวัด/วาด (ฟอนต์ไม่มี glyph → ขึ้น .notdef)
    for para in text.replace("\r\n", "\n").replace('\r', "\n").split('\n') {
        // แท็บ → ช่องว่าง, ตัด ZWSP ที่อาจติดมากับ input
        let para: String = para
            .replace('\t', " ")
            .chars()
            .filter(|&c| c != '\u{200b}')
            .collect();
        if para.trim().is_empty() {
            out.push(String::new());
            continue;
        }
        // ถ้าทั้งย่อหน้าพอดีอยู่แล้ว ไม่ต้องตัด
        if measure_thai_width(&para, font_data, font_size) <= max_width {
            out.push(para);
            continue;
        }
        // แตกเป็นชิ้นพอดีคำก่อน (ก้อนยาวเกิน → บังคับตัดตัวอักษร)
        let zwsp = break_opportunities_with_dict(&para, extra_words);
        let mut pieces: Vec<String> = Vec::new();
        for unit in zwsp.split('\u{200b}') {
            if unit.is_empty() {
                continue;
            }
            if measure_thai_width(unit, font_data, font_size) <= max_width {
                pieces.push(unit.to_string());
            } else {
                pieces.extend(force_break_unit(unit, font_data, font_size, max_width));
            }
        }
        // greedy รวมชิ้นให้เต็มบรรทัด
        let mut current = String::new();
        for piece in pieces {
            let candidate = if current.is_empty() {
                piece.clone()
            } else {
                format!("{current}{piece}")
            };
            if measure_thai_width(&candidate, font_data, font_size) <= max_width
                || current.is_empty()
            {
                current = candidate;
            } else {
                out.push(current);
                current = piece;
            }
        }
        if !current.is_empty() {
            out.push(current);
        }
    }
    if out.is_empty() {
        vec![text.replace('\u{200b}', "").to_string()]
    } else {
        out
    }
}
/// ผล shaping ภาษาไทยด้วย cosmic-text (rustybuzz/harfrust ภายใน)
/// คืน (จำนวน layout runs, จำนวน glyphs ทั้งหมด, ความกว้างสูงสุด px)
/// `font_data`: ไบต์ฟอนต์ไทย (เช่น Tahoma ทดสอบเฉพาะเครื่อง, ห้าม commit);
/// ถ้า `None` จะใช้ฟอนต์ระบบที่ fontdb เจอ
pub fn shape_thai(text: &str, font_data: Option<Vec<u8>>) -> (usize, usize, f32) {
    use cosmic_text::{Attrs, Buffer, Family, FontSystem, Metrics, Shaping, Wrap};
    let mut font_system = FontSystem::new();
    let mut family_name = String::new();
    if let Some(data) = font_data {
        let ids = font_system.db_mut().load_font_source(fontdb::Source::Binary(
            std::sync::Arc::new(data),
        ));
        family_name = ids
            .first()
            .and_then(|id| font_system.db().face(*id))
            .and_then(|info| info.families.first().map(|(name, _)| name.clone()))
            .unwrap_or_default();
    }
    let attrs;
    let attrs_ref: &Attrs = if family_name.is_empty() {
        attrs = Attrs::new();
        &attrs
    } else {
        attrs = Attrs::new().family(Family::Name(&family_name));
        &attrs
    };
    let metrics = Metrics::new(32.0, 38.0);
    let mut buffer = Buffer::new(&mut font_system, metrics);
    // ความกว้างมากพอให้ 1 ประโยคอยู่บรรทัดเดียว เพื่อนับ shaping ล้วนๆ
    buffer.set_size(Some(1200.0), Some(400.0));
    buffer.set_wrap(Wrap::None);
    buffer.set_text(text, attrs_ref, Shaping::Advanced, None);
    buffer.shape_until_scroll(&mut font_system, false);
    let mut runs = 0usize;
    let mut glyphs = 0usize;
    let mut max_w = 0.0f32;
    for run in buffer.layout_runs() {
        runs += 1;
        glyphs += run.glyphs.len();
        if run.line_w > max_w {
            max_w = run.line_w;
        }
    }
    (runs, glyphs, max_w)
}

/// คืนรายการตัวอักษรที่ฟอนต์ไม่มี glyph (.notdef จะขึ้น) — ว่าง = ครบ
/// ใช้ ttf-parser ตรวจ cmap ตรงๆ ไม่พึ่ง fallback ของ cosmic-text
pub fn missing_glyphs(font_data: &[u8], text: &str) -> Vec<char> {
    let face = match ttf_parser::Face::parse(font_data, 0) {
        Ok(f) => f,
        Err(_) => return text.chars().collect(),
    };
    let mut missing = Vec::new();
    for c in text.chars() {
        if c.is_control() || c == '\u{200b}' {
            continue;
        }
        if face.glyph_index(c).is_none() && !missing.contains(&c) {
            missing.push(c);
        }
    }
    missing
}

/// โหลดฟอนต์ OFL จากโฟลเดอร์ fonts/ (Sarabun ปกติ/หนา, Noto Sans Thai)
/// คืน map family -> bytes; ถ้าไม่เจอไฟล์จะข้าม (caller ตัดสินใจต่อ)
pub fn load_bundled_fonts(fonts_dir: &std::path::Path) -> std::collections::HashMap<String, Vec<u8>> {
    let mut map = std::collections::HashMap::new();
    let candidates = [
        ("Sarabun", "Sarabun-Regular.ttf"),
        ("Sarabun-Bold", "Sarabun-Bold.ttf"),
        ("NotoSansThai", "NotoSansThai-Variable.ttf"),
    ];
    for (family, file) in candidates {
        let p = fonts_dir.join(file);
        if let Ok(bytes) = std::fs::read(&p) {
            map.insert(family.to_string(), bytes);
        }
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn segment_thaibreak_splits_long_sentence() {
        let v = segment_thai("บริษัทนี้ให้บริการรับทำบัญชีและยื่นภาษีครบวงจร");
        assert!(v.len() > 1, "thaibreak ควรตัดได้หลายคำ, ได้ {v:?}");
        assert!(v.concat().replace('\u{200b}', "") == "บริษัทนี้ให้บริการรับทำบัญชีและยื่นภาษีครบวงจร");
    }

    #[test]
    fn segment_uniworld_returns_nonempty() {
        let v = segment_thai_uniworld("ใบกำกับภาษี");
        assert!(!v.is_empty());
        assert_eq!(v.concat(), "ใบกำกับภาษี");
    }

    #[test]
    fn shape_thai_produces_glyphs() {
        let (runs, glyphs, _) = shape_thai("น้ำ ข้าว ด้าย ย้ำ ขึ้น ตั้ง ปั้น", None);
        assert!(runs >= 1);
        assert!(glyphs > 0);
    }

    #[test]
    fn wrap_splits_newlines_and_strips_controls() {
        let font = std::fs::read(r"C:\Windows\Fonts\tahoma.ttf")
            .expect("ต้องมี Tahoma บนเครื่องทดสอบ");
        // ข้อความ template มี \n ระหว่างบรรทัด — ต้องแยกย่อหน้า ห้ามส่ง \n ลง PDF
        let wrapped = wrap_thai("บริษัท ตัวอย่าง จำกัด\n123 ถนนสุขุมวิท", &font, 11.0, 510.0, &[]);
        assert_eq!(wrapped.len(), 2, "ต้องแยกเป็น 2 บรรทัด ได้ {wrapped:?}");
        for w in &wrapped {
            assert!(!w.contains('\n'), "ห้ามมี \\n หลุดไปวาด: {w:?}");
            assert!(!w.contains('\u{200b}'), "ห้ามมี ZWSP หลุดไปวาด: {w:?}");
            assert!(
                !w.chars().any(|c| c.is_control()),
                "ห้ามมี control char หลุดไปวาด: {w:?}"
            );
        }
    }

    #[test]
    fn wrap_force_breaks_long_unbreakable_chunk() {
        let font = std::fs::read(r"C:\Windows\Fonts\tahoma.ttf")
            .expect("ต้องมี Tahoma บนเครื่องทดสอบ");
        // เลขเอกสารติดคำไทยโดยไม่มีจุดตัด (เคสจริง: เลยขอบกระดาษ)
        let chunk = "เลขที่ RC-2569-00078วันที่14ตุลาคม2569";
        let wrapped = wrap_thai(chunk, &font, 11.0, 170.0, &[]);
        assert!(wrapped.len() >= 2, "ก้อนยาวต้องถูกบังคับตัด ได้ {wrapped:?}");
        for w in &wrapped {
            assert!(
                measure_thai_width(w, &font, 11.0) <= 171.0,
                "บรรทัดย่อยต้องไม่ล้น: {w}"
            );
            assert!(
                !w.starts_with('ๆ') && !w.starts_with('ฯ'),
                "ห้ามขึ้นต้นด้วย ๆ/ฯ: {w}"
            );
        }
        // ตัวอักษรต้องครบ (ไม่หาย ไม่เพิ่ม)
        assert_eq!(wrapped.concat(), chunk);
    }

    #[test]
    fn wrap_thai_keeps_long_sentence_inside_width() {
        let font = std::fs::read(r"C:\Windows\Fonts\tahoma.ttf")
            .expect("ต้องมี Tahoma บนเครื่องทดสอบ");
        let long = "ประโยคยาวไม่มีวรรค: บริษัทนี้ให้บริการรับทำบัญชีและยื่นภาษีครบวงจรทั่วประเทศโดยไม่หยุดพัก";
        let wrapped = wrap_thai(long, &font, 16.0, 499.0, &[]);
        assert!(wrapped.len() >= 2, "บรรทัดยาวต้องถูกตัด, ได้ {wrapped:?}");
        for w in &wrapped {
            assert!(
                measure_thai_width(w, &font, 16.0) <= 500.0,
                "บรรทัดย่อยต้องไม่ล้น: {w}"
            );
        }
        // ตัวอักษรต้องไม่หาย (ไม่นับ ZWSP ที่ใส่เพิ่ม)
        assert_eq!(
            wrapped.concat().replace('\u{200b}', "").replace(' ', ""),
            long.replace(' ', "")
        );
    }

    #[test]
    fn user_dict_keeps_wanthi_together() {
        // พจนานุกรมหลักตัด "วันที่" เป็น "วัน|ที่" (ตรวจ 2026-10-14)
        assert_eq!(segment_thai("วันที่"), vec!["วัน", "ที่"]);
        // เติมพจนานุกรมผู้ใช้แล้วต้องติดกัน
        assert_eq!(
            segment_thai_with_dict("วันที่", &["วันที่"]),
            vec!["วันที่"]
        );
        let font = std::fs::read(r"C:\Windows\Fonts\tahoma.ttf")
            .expect("ต้องมี Tahoma บนเครื่องทดสอบ");
        let line = "ตัวเลขผสม: ใบกำกับภาษีเลขที่ INV-2569-00123 ยอด 12345.67 บาท วันที่ 14/10/2569";
        // "เลขที่" ก็โดนตัดเป็น "เลข|ที่" เหมือนกัน — เติมทั้งคู่
        let wrapped = wrap_thai(line, &font, 16.0, 499.0, &["วันที่", "เลขที่"]);
        // ห้ามมีบรรทัดย่อยขึ้นต้นด้วย "ที่" (หลุดมาจาก "วันที่"/"เลขที่")
        for w in &wrapped {
            assert!(
                !w.starts_with("ที่"),
                "พจนานุกรมผู้ใช้ต้องกันไม่ให้ตัด 'วันที่'/'เลขที่': {w}"
            );
        }
        // "วันที่" กับ "เลขที่" ต้องอยู่ครบในผลลัพธ์ (ไม่หาย ไม่แยก)
        let joined = wrapped.concat();
        assert!(joined.contains("วันที่"), "ต้องมี 'วันที่' เต็มคำ: {joined}");
        assert!(joined.contains("เลขที่"), "ต้องมี 'เลขที่' เต็มคำ: {joined}");
    }
}
