//! Spike Phase 0 ข้อ 5: เซ็น PAdES ด้วย underskrift (BSD-2-Clause) + ตรวจด้วย verifier
//! รัน: cargo run -p tr-etax --example spike_item5
//! ต้องมีกุญแจทดสอบก่อน (สร้างโดยเจ้าของเครื่องเท่านั้น — ห้ามส่ง private key ผ่านแชต):
//!   openssl req -x509 -newkey rsa:2048 -keyout test-key.pem -out test-cert.pem -days 365 -nodes -subj "/CN=ThaiReport Spike TEST ONLY"
//!   openssl pkcs12 -export -legacy -out test-identity.p12 -inkey test-key.pem -in test-cert.pem -passout pass:spike-test
//! วางไฟล์ test-identity.p12 + test-cert.pem ใน target/spike/ แล้วรัน
//!
//! ไฟล์กุญแจทั้งหมดเป็นของทดสอบทิ้งได้ (TEST ONLY) ห้ามใช้กับเอกสารจริง

use underskrift::trust::{TrustStore, TrustStoreSet};
use underskrift::verify::SignatureVerifier;
use underskrift::{CryptoSigner, PdfSigner, SigningOptions, SoftwareSigner, SubFilter};

fn main() {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/spike/");
    let input = format!("{dir}spike-item4-pdfa3b.pdf");
    let p12 = format!("{dir}test-identity.p12");
    let ca = format!("{dir}test-cert.pem");
    let out = format!("{dir}spike-item5-signed.pdf");

    let pdf_data = std::fs::read(&input).expect("อ่าน PDF ข้อ 4 (รัน spike_item4 ก่อน)");
    let signer =
        SoftwareSigner::from_pkcs12_file(&p12, "spike-test").expect("โหลด .p12 ทดสอบ");
    println!("key algorithm: {:?}", signer.signature_algorithm());

    let options = SigningOptions {
        sub_filter: SubFilter::Pades,
        field_name: "SpikeSig1".to_string(),
        reason: Some("ThaiReport Phase 0 spike TEST ONLY".to_string()),
        location: Some("Bangkok".to_string()),
        ..Default::default()
    };
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio runtime");
    let signed = rt
        .block_on(async {
            PdfSigner::new()
                .options(options)
                .sign(&pdf_data, &signer)
                .await
        })
        .expect("เซ็น PAdES");
    std::fs::write(&out, &signed).expect("เขียนไฟล์ที่เซ็นแล้ว");
    println!(
        "signed: {out} ({} bytes, +{} vs unsigned)",
        signed.len(),
        signed.len() - pdf_data.len()
    );

    // ตรวจด้วย verifier ของ underskrift (trust anchor = cert ทดสอบของเราเอง)
    let store = TrustStore::from_pem_file(&ca).expect("โหลด CA ทดสอบ");
    let trust_stores = TrustStoreSet::new().with_sig_store(store);
    let verifier = SignatureVerifier::new(&trust_stores);
    match verifier.verify_pdf(&signed) {
        Ok(report) => {
            println!("UNDERSKRIFT VERIFY OK: {report:?}");
        }
        Err(e) => {
            println!("UNDERSKRIFT VERIFY FAIL: {e:?}");
            std::process::exit(3);
        }
    }

    // พิมพ์ /ByteRange + messageDigest ไว้ cross-check ด้วย openssl ภายนอก
    let insp = underskrift::inspect_signatures(&signed).expect("inspect");
    println!(
        "signatures: has={} n={}",
        insp.has_signatures, insp.num_signatures
    );
    for s in &insp.signatures {
        println!("  field={:?} byte_range={:?}", s.field_name, s.byte_range);
    }
}
