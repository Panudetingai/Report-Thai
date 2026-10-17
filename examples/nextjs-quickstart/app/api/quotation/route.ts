// สร้าง PDF บนเซิร์ฟเวอร์ด้วย engine native (@thaireport/node) — ใช้เมื่อต้องการเก็บไฟล์, ส่งอีเมล, หรือไม่อยากให้ browser โหลด WASM
// ต้อง build addon ก่อน: cd packages/node && npm run build (ต้องมี Rust) — ถ้ายังไม่ build ตอบ 501 พร้อมวิธีแก้
import { quotationData, quotationTemplate, sampleForm, type QuotationForm } from "../../../reports/quotation";

export const runtime = "nodejs";

async function loadEngine() {
  try {
    return await import("@thaireport/node");
  } catch {
    return null;
  }
}

async function render(form: QuotationForm) {
  const engine = await loadEngine();
  if (!engine) {
    return Response.json(
      { ok: false, error: "ยังไม่มี @thaireport/node — รัน `cd packages/node && npm run build` ที่ราก repo แล้วรีสตาร์ท dev server" },
      { status: 501 },
    );
  }
  try {
    const pdf = await engine.renderPdf(quotationTemplate, quotationData(form));
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${encodeURIComponent(form.docNo || "quotation")}.pdf"` },
    });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

/** GET /api/quotation → ใบเสนอราคาตัวอย่าง */
export async function GET() {
  return render(sampleForm);
}

/** POST /api/quotation — body เป็น JSON ของฟอร์ม หรือฟอร์ม HTML ที่มีช่อง form (JSON) */
export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  let form: QuotationForm;
  try {
    form = type.includes("application/json") ? await req.json() : JSON.parse(String((await req.formData()).get("form")));
  } catch {
    return Response.json({ ok: false, error: "ข้อมูลฟอร์มไม่ใช่ JSON ที่ถูกต้อง" }, { status: 400 });
  }
  return render(form);
}
