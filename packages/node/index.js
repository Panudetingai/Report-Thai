// @thaireport/node — เรียก engine Rust ผ่าน napi (ดู crates/tr-node)
"use strict";

const path = require("node:path");
const binding = require("./thaireport.node");

const DEFAULT_FONTS_DIR = path.join(__dirname, "fonts");

/**
 * เรนเดอร์ template + data เป็น PDF
 * @param {object|string} template  เทมเพลต (object หรือ JSON string)
 * @param {object|string} [data]    ข้อมูล
 * @param {{ fontsDir?: string }} [options]  โฟลเดอร์ฟอนต์ (ค่าเริ่มต้น: ฟอนต์ที่มากับแพ็กเกจ)
 * @returns {Promise<Buffer>}
 */
function renderPdf(template, data = {}, options = {}) {
  const t = typeof template === "string" ? template : JSON.stringify(template);
  const d = typeof data === "string" ? data : JSON.stringify(data);
  return binding.renderPdf(t, d, options.fontsDir ?? DEFAULT_FONTS_DIR);
}

/**
 * ตรวจ template โดยไม่เรนเดอร์ — คืน `{ ok: true }` หรือ `{ ok: false, error }` (ไม่ throw)
 * @param {object|string} template
 */
function validateTemplate(template) {
  const t = typeof template === "string" ? template : JSON.stringify(template);
  return JSON.parse(binding.validateTemplate(t));
}

module.exports = { renderPdf, validateTemplate, DEFAULT_FONTS_DIR };
