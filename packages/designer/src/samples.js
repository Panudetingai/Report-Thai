import invoiceTemplate from "../../../templates/invoice-full.json";
import invoiceData from "../../../templates/invoice-full.data.json";
import quotationTemplate from "../../../templates/quotation.json";
import quotationData from "../../../templates/quotation.data.json";
import receiptTemplate from "../../../templates/receipt.json";
import receiptData from "../../../templates/receipt.data.json";
import guestTemplate from "../../../templates/guest-registration.json";
import guestData from "../../../templates/guest-registration.data.json";

export const SAMPLES = [
  { id: "invoice-full", label: "ใบกำกับภาษี", template: invoiceTemplate, data: invoiceData },
  { id: "quotation", label: "ใบเสนอราคา", template: quotationTemplate, data: quotationData },
  { id: "receipt", label: "ใบเสร็จรับเงิน", template: receiptTemplate, data: receiptData },
  { id: "guest-registration", label: "บัตรทะเบียนผู้พัก", template: guestTemplate, data: guestData },
];

export const BLANK = {
  template: {
    schemaVersion: "1.0",
    page: { size: "A4", margin: [15, 15, 15, 15], orientation: "portrait" },
    fonts: [{ family: "Sarabun", embed: true }, { family: "Sarabun-Light", embed: true }],
    user_dict: [],
    bands: [
      {
        type: "title",
        height: 30,
        elements: [
          { type: "text", x: 0, y: 4, w: 180, h: 10, font: "Sarabun", size: 14, bold: true, align: "center", text: "หัวเรื่อง", overflow: "wrap" },
        ],
      },
      { type: "detail", dataSource: "items", height: 8, elements: [] },
    ],
  },
  data: { items: [{ no: 1, name: "รายการตัวอย่าง", amount: "100.00" }] },
};
