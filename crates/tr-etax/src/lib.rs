//! tr-etax [experimental]: XML ETDA, PDF/A-3, signing
//!
//! คำเตือน: โมดูลนี้ออกแบบให้สอดคล้องกับแนวทางกรมสรรพากร/ETDA
//! ผู้ใช้ต้องตรวจสอบกับผู้เชี่ยวชาญด้านภาษีของตน ห้ามอ้างว่ารับรองความถูกต้อง

/// Placeholder trait สำหรับเสียบ signer backend (PKCS#12/HSM/API)
pub trait Signer {
    fn sign(&self, pdf: &[u8]) -> Result<Vec<u8>, String>;
}
