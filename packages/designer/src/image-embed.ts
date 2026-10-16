/** ขีดจำกัดและ helper สำหรับฝังรูปในเทมเพลต (engine ใน browser อ่านไฟล์/URL โดยตรงไม่ได้) */

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const DATA_IMAGE_RE = /^data:image\/(png|jpeg|jpg);base64,/i;

export function isDataImageSrc(src) {
  return typeof src === "string" && DATA_IMAGE_RE.test(src.trim());
}

export function isHttpUrl(src) {
  return typeof src === "string" && /^https?:\/\//i.test(src.trim());
}

/** ค่า src ที่ PDF preview ใน browser ใช้ไม่ได้จนกว่าจะฝังเป็น data URL */
export function needsEmbedForPreview(src) {
  if (!src || typeof src !== "string") return false;
  const s = src.trim();
  if (!s || isDataImageSrc(s)) return false;
  if (isHttpUrl(s)) return true;
  if (s.includes("{{")) return false; // ผูกฟิลด์ — ตรวจตอน bind
  return true; // path ไฟล์, ลิงก์อื่น
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("ไม่มีไฟล์"));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new Error(`ไฟล์ใหญ่เกิน ${MAX_IMAGE_BYTES / (1024 * 1024)} MB`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result ?? "");
      if (!DATA_IMAGE_RE.test(data)) {
        reject(new Error("รองรับเฉพาะ PNG และ JPEG ใน PDF"));
        return;
      }
      resolve(data);
    };
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

export async function fetchUrlAsDataUrl(url) {
  const u = url.trim();
  if (!isHttpUrl(u)) throw new Error("ใส่ URL ที่ขึ้นต้นด้วย http:// หรือ https://");

  let res;
  try {
    res = await fetch(u, { mode: "cors", credentials: "omit" });
  } catch {
    throw new Error(
      "โหลด URL ไม่ได้ (เครือข่ายหรือ CORS) — ลิงก Figma/CDN มักต้องดาวน์โหลดรูปลงเครื่องแล้วกดอัปโหลดไฟล์",
    );
  }
  if (!res.ok) {
    throw new Error(`โหลด URL ไม่สำเร็จ (HTTP ${res.status}) — ใช้อัปโหลดไฟล์จากเครื่องแทน`);
  }
  const blob = await res.blob();
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error(`รูปใหญ่เกิน ${MAX_IMAGE_BYTES / (1024 * 1024)} MB`);
  }
  return blobToDataUrl(blob);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result ?? "");
      if (!DATA_IMAGE_RE.test(data)) {
        reject(new Error("รองรับเฉพาะ PNG/JPEG ใน PDF — แปลงไฟล์แล้วอัปโหลดใหม่"));
        return;
      }
      resolve(data);
    };
    reader.onerror = () => reject(new Error("แปลงรูปไม่สำเร็จ"));
    reader.readAsDataURL(blob);
  });
}
