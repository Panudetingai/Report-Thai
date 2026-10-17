//! Phase 2: WASM/native PDF parity (รันเมื่อ build WASM แล้ว)
//! `cargo test -p tr-pdf wasm_native_pdf_parity -- --ignored`

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
}

fn load_fonts() -> HashMap<String, Vec<u8>> {
    tr_text::load_bundled_fonts(&repo_root().join("fonts"))
}

fn native_pdf(template: &PathBuf, data: &PathBuf) -> Vec<u8> {
    let fonts = load_fonts();
    let ts = std::fs::read_to_string(template).expect("อ่าน template");
    let ds = std::fs::read_to_string(data).expect("อ่าน data");
    let t = tr_core::Template::from_json(&ts).expect("parse template");
    t.validate().expect("validate");
    let data: serde_json::Value = serde_json::from_str(&ds).expect("parse data");
    tr_pdf::render_template(&t, &data, &fonts, template.parent()).expect("render")
}

#[test]
#[ignore = "ต้อง wasm-pack build แล้วรัน node render-parity.mjs"]
fn wasm_native_pdf_parity_via_node() {
    let root = repo_root();
    let script = root.join("crates/tr-wasm/render-parity.mjs");
    assert!(
        root.join("crates/tr-wasm/pkg-node/tr_wasm.js").exists(),
        "ไม่พบ pkg-node — รัน scripts/build-wasm.sh"
    );
    let out = Command::new("node")
        .arg(&script)
        .current_dir(&root)
        .output()
        .expect("spawn node");
    assert!(
        out.status.success(),
        "parity script ล้มเหลว:\n{}\n{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
}

#[test]
fn native_render_deterministic_phase2_samples() {
    let samples = [
        ("invoice-full", "invoice-full.data.json"),
        ("quotation", "quotation.data.json"),
        ("receipt", "receipt.data.json"),
    ];
    for (tpl, data) in samples {
        let t = repo_root().join("templates").join(format!("{tpl}.json"));
        let d = repo_root().join("templates").join(data);
        let a = native_pdf(&t, &d);
        let b = native_pdf(&t, &d);
        assert_eq!(a, b, "{tpl} render ไม่ deterministic");
        assert!(a.starts_with(b"%PDF"), "{tpl} ต้องเป็น PDF");
    }
}
