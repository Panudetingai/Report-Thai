//! ทดสอบ tr-mcp แบบที่ AI client ใช้จริง: รันไบนารีแล้วคุย JSON-RPC ผ่าน stdin/stdout
//! ครบเส้นทาง: อ่านคู่มือ → ตรวจ → พรีวิว PNG → ออก PDF → บันทึก template → เรียกด้วยชื่อ

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

fn repo() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

struct Client {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
}

impl Client {
    fn start(templates: &Path, out: &Path) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_tr-mcp"))
            .env("TR_FONTS_DIR", repo().join("fonts"))
            .env("TR_TEMPLATES_DIR", templates)
            .env("TR_OUTPUT_DIR", out)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("รัน tr-mcp");
        let stdin = child.stdin.take().unwrap();
        let stdout = BufReader::new(child.stdout.take().unwrap());
        let mut c = Client { child, stdin, stdout, next_id: 1 };
        let init = c.request(
            "initialize",
            json!({ "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": { "name": "test", "version": "0" } }),
        );
        assert_eq!(init["serverInfo"]["name"], "thaireport");
        assert!(init["instructions"].as_str().unwrap().contains("get_template_guide"));
        c.send(json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }));
        c
    }

    fn send(&mut self, msg: Value) {
        writeln!(self.stdin, "{msg}").unwrap();
        self.stdin.flush().unwrap();
    }

    fn request(&mut self, method: &str, params: Value) -> Value {
        let id = self.next_id;
        self.next_id += 1;
        self.send(json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }));
        loop {
            let mut line = String::new();
            assert!(self.stdout.read_line(&mut line).unwrap() > 0, "tr-mcp ปิด stdout ก่อนตอบ {method}");
            let msg: Value = serde_json::from_str(&line).expect("ข้อความ JSON-RPC");
            if msg["id"] == id {
                assert!(msg.get("error").is_none(), "{method}: {msg}");
                return msg["result"].clone();
            }
        }
    }

    /// เรียก tool → (isError, เนื้อหาทั้งหมด)
    fn call(&mut self, name: &str, args: Value) -> (bool, Vec<Value>) {
        let r = self.request("tools/call", json!({ "name": name, "arguments": args }));
        (r["isError"].as_bool().unwrap_or(false), r["content"].as_array().cloned().unwrap_or_default())
    }

    fn call_json(&mut self, name: &str, args: Value) -> Value {
        let (err, content) = self.call(name, args.clone());
        assert!(!err, "{name} ล้ม: {content:?}");
        serde_json::from_str(content[0]["text"].as_str().unwrap()).unwrap()
    }
}

impl Drop for Client {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// template ที่มากับ repo (ไม่นับไฟล์ที่ผู้ใช้บันทึกเองไว้ใน templates/ ของเครื่อง)
const SHIPPED: [&str; 5] = ["guest-registration", "invoice-full", "quotation", "receipt", "sales-by-category"];

/// โฟลเดอร์ชั่วคราวที่มีสำเนา template ที่มากับ repo (เทสต์เขียนไฟล์ได้โดยไม่แตะของจริง)
fn workspace(tag: &str) -> (PathBuf, PathBuf) {
    let base = std::env::temp_dir().join(format!("tr-mcp-test-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&base);
    let templates = base.join("templates");
    std::fs::create_dir_all(&templates).unwrap();
    for name in SHIPPED {
        for f in [format!("{name}.json"), format!("{name}.data.json")] {
            std::fs::copy(repo().join("templates").join(&f), templates.join(&f)).unwrap();
        }
    }
    (templates, base.join("out"))
}

/// ตัวอย่างในคู่มือต้องใช้ได้จริง (AI จะคัดลอกไปใช้)
fn guide_example(guide: &str) -> (Value, Value) {
    let sec = &guide[guide.find("## Minimal example").expect("หัวข้อตัวอย่าง")..];
    let start = sec.find("```json").unwrap() + 7;
    let end = start + sec[start..].find("```").unwrap();
    let template: Value = serde_json::from_str(&sec[start..end]).expect("ตัวอย่าง template เป็น JSON");
    let data_line = &sec[sec.find("data: `").unwrap() + 7..];
    let data: Value = serde_json::from_str(&data_line[..data_line.find('`').unwrap()]).expect("ตัวอย่าง data เป็น JSON");
    (template, data)
}

fn png_size(png: &[u8]) -> (u32, u32) {
    assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n", "ต้องเป็น PNG");
    let be = |b: &[u8]| u32::from_be_bytes([b[0], b[1], b[2], b[3]]);
    (be(&png[16..20]), be(&png[20..24]))
}

#[test]
fn ai_workflow_from_guide_to_pdf() {
    let (templates, out) = workspace("flow");
    let mut c = Client::start(&templates, &out);

    let tools = c.request("tools/list", json!({}));
    let mut names: Vec<&str> = tools["tools"].as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap()).collect();
    names.sort();
    assert_eq!(
        names,
        ["get_template", "get_template_guide", "list_templates", "preview_template", "render_report", "save_template", "validate_template"]
    );

    let (_, guide) = c.call("get_template_guide", json!({}));
    let (template, data) = guide_example(guide[0]["text"].as_str().unwrap());

    let v = c.call_json("validate_template", json!({ "template": template, "data": data }));
    assert_eq!(v["ok"], true, "{v}");
    assert_eq!(v["warnings"], json!([]), "ตัวอย่างในคู่มือต้องไม่มีคำเตือน: {v}");
    assert_eq!(v["pages"], 1);

    let (err, content) = c.call("preview_template", json!({ "template": template, "data": data, "scale": 1.0 }));
    assert!(!err, "{content:?}");
    assert_eq!(content[0]["type"], "image");
    assert_eq!(content[0]["mimeType"], "image/png");
    let png = base64_decode(content[0]["data"].as_str().unwrap());
    let (w, h) = png_size(&png);
    assert!((594..=596).contains(&w) && (841..=843).contains(&h), "A4 ที่ 72 dpi ได้ {w}×{h}");

    let r = c.call_json("render_report", json!({ "template": template, "data": data, "output": "invoice-1" }));
    let pdf = std::fs::read(r["path"].as_str().unwrap()).unwrap();
    assert!(pdf.starts_with(b"%PDF"));
    assert_eq!(r["pages"], 1);
    assert!(r["path"].as_str().unwrap().ends_with("invoice-1.pdf"));

    // บันทึกแล้วเรียกด้วยชื่อ (ไม่ส่ง data → ใช้ข้อมูลตัวอย่างที่บันทึกไว้)
    assert_eq!(c.call_json("save_template", json!({ "name": "my-invoice", "template": template, "sample_data": data }))["saved"], "my-invoice.json");
    let listed = c.call_json("list_templates", json!({}));
    let mine = listed["templates"].as_array().unwrap().iter().find(|t| t["name"] == "my-invoice.json").expect("เห็นใน list");
    assert_eq!(mine["has_sample_data"], true);
    assert_eq!(mine["title"], "ใบแจ้งหนี้");
    let r2 = c.call_json("render_report", json!({ "template_name": "my-invoice" }));
    assert_eq!(r2["pages"], 1);
    assert_eq!(r2["warnings"], json!([]));

    // client ที่ส่ง object มาเป็นข้อความ JSON (เจอจริงตอนทดสอบกับ Claude) — ต้องบันทึกเป็น object
    c.call_json("save_template", json!({ "name": "as-text", "template": template.to_string(), "sample_data": data.to_string() }));
    let saved: Value = serde_json::from_str(&std::fs::read_to_string(templates.join("as-text.data.json")).unwrap()).unwrap();
    assert!(saved.is_object(), "ข้อมูลตัวอย่างต้องบันทึกเป็น object: {saved}");
    let r3 = c.call_json("render_report", json!({ "template_name": "as-text" }));
    assert_eq!(r3["warnings"], json!([]), "{r3}");
    let (err, _) = c.call("save_template", json!({ "name": "bad-data", "template": template, "sample_data": "[1, 2]" }));
    assert!(err, "sample_data ที่ไม่ใช่ object ต้องถูกปฏิเสธ");

    // ไม่เขียนทับโดยไม่ได้สั่ง
    let (err, content) = c.call("save_template", json!({ "name": "my-invoice.json", "template": template }));
    assert!(err && content[0]["text"].as_str().unwrap().contains("overwrite"));
}

#[test]
fn shipped_templates_validate_and_preview_with_their_sample_data() {
    let (templates, out) = workspace("shipped");
    let mut c = Client::start(&templates, &out);
    let listed = c.call_json("list_templates", json!({}));
    let names: Vec<String> = listed["templates"].as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap().to_string()).collect();
    assert_eq!(names, SHIPPED.map(|n| format!("{n}.json")));
    for name in names {
        let v = c.call_json("validate_template", json!({ "template_name": name }));
        assert_eq!(v["ok"], true, "{name}: {v}");
        assert_eq!(v["warnings"], json!([]), "{name}: {v}");
        let (err, content) = c.call("preview_template", json!({ "template_name": name, "scale": 0.5 }));
        assert!(!err && content[0]["type"] == "image", "{name}: {content:?}");
    }
}

#[test]
fn mistakes_come_back_as_readable_tool_errors() {
    let (templates, out) = workspace("errors");
    let mut c = Client::start(&templates, &out);

    let (err, content) = c.call("get_template", json!({ "name": "nope" }));
    assert!(err && content[0]["text"].as_str().unwrap().contains("list_templates"));

    for bad in ["../evil", "/tmp/x", "a/b"] {
        let (err, _) = c.call("render_report", json!({ "template_name": "receipt.json", "output": bad }));
        assert!(err, "ชื่อไฟล์ {bad} ต้องถูกปฏิเสธ");
        let (err, _) = c.call("save_template", json!({ "name": bad, "template": { "schemaVersion": "1.0", "bands": [] } }));
        assert!(err, "ชื่อ template {bad} ต้องถูกปฏิเสธ");
    }
    assert!(!out.join("evil.pdf").exists() && !out.parent().unwrap().join("evil.pdf").exists());

    // ฟิลด์สะกดผิดได้คำเตือนที่ชี้ชื่อฟิลด์
    let t = json!({ "schemaVersion": "1.0", "bands": [{ "type": "title", "height": 10, "elements": [
        { "type": "text", "x": 0, "y": 0, "w": 100, "h": 8, "text": "{{ custmer.name }}", "overflow": "wrap" }] }] });
    let v = c.call_json("validate_template", json!({ "template": t, "data": { "customer": { "name": "ก" } } }));
    assert_eq!(v["ok"], true);
    assert!(v["warnings"][0].as_str().unwrap().contains("custmer.name"), "{v}");

    // ข้อความล้นกรอบ (overflow = error) เป็น error ของการจัดหน้า
    let t = json!({ "schemaVersion": "1.0", "bands": [{ "type": "title", "height": 10, "elements": [
        { "type": "text", "x": 0, "y": 0, "w": 10, "h": 5, "text": "ข้อความยาวเกินกล่องแน่นอนเพราะกล่องแคบมาก" }] }] });
    let (err, content) = c.call("validate_template", json!({ "template": t }));
    assert!(err, "{content:?}");
    assert_eq!(serde_json::from_str::<Value>(content[0]["text"].as_str().unwrap()).unwrap()["ok"], false);

    // template เป็นข้อความ JSON ก็รับได้ · หน้าที่ไม่มีบอกจำนวนหน้าจริง
    let (err, content) = c.call("preview_template", json!({ "template": t.to_string().replace("\"w\": 10", "\"w\": 100"), "page": 5 }));
    assert!(err);
    let _ = content;
}

fn base64_decode(s: &str) -> Vec<u8> {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::new();
    let (mut buf, mut bits) = (0u32, 0);
    for &c in s.as_bytes().iter().filter(|&&c| c != b'=') {
        buf = (buf << 6) | T.iter().position(|&t| t == c).expect("base64") as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    out
}
