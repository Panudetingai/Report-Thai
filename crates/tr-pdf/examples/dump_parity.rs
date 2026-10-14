//! Dump native wrap/measure results for WASM parity check (Phase 0 ข้อ 3).
//! รัน: cargo run -p tr-pdf --example dump_parity
//! ออก: target/spike/parity-native.json

fn main() {
    let sentences_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../tests/golden/th/sentences.txt"
    );
    let text = std::fs::read_to_string(sentences_path).expect("อ่าน sentences.txt");
    let lines: Vec<String> = text.lines().map(|s| s.to_string()).collect();
    let font_data =
        std::fs::read(r"C:\Windows\Fonts\tahoma.ttf").expect("ต้องมี Tahoma");
    let user_dict = ["วันที่", "เลขที่"];
    const MAX_W: f32 = 595.0 - 48.0 * 2.0;

    let mut rows = Vec::new();
    for line in &lines {
        let wrapped = tr_text::wrap_thai(line, &font_data, 16.0, MAX_W, &user_dict);
        let widths: Vec<f32> = wrapped
            .iter()
            .map(|v| tr_text::measure_thai_width(v, &font_data, 16.0))
            .collect();
        rows.push(serde_json::json!({
            "input": line,
            "wrapped": wrapped,
            "widths": widths,
        }));
    }
    let out = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/spike/parity-native.json"
    );
    std::fs::write(out, serde_json::to_string_pretty(&rows).unwrap()).unwrap();
    println!("wrote {out} ({} rows)", rows.len());
}
