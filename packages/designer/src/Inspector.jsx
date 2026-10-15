import React, { useEffect, useState } from "react";
import { Icon } from "./icons.jsx";
import { KIND_LABELS, BAND_LABELS, BAND_ORDER, fixColumnSum } from "./state.js";
import { PAGE_SIZES, margins, pageSize } from "./layout.js";

export const FONT_CHOICES = ["Sarabun-Light", "Sarabun", "Sarabun-Bold", "NotoSansThai"];
const OVERFLOW_CHOICES = [
  ["wrap", "ตัดบรรทัด"],
  ["shrink", "ย่อตัวอักษร"],
  ["clip", "ตัดทิ้ง"],
  ["grow", "ขยายกรอบ"],
  ["error", "แจ้งข้อผิดพลาด"],
];
const ALIGN_CHOICES = [
  ["left", "ซ้าย"],
  ["center", "กลาง"],
  ["right", "ขวา"],
];

/*
 * ทุก control เรียก onChange(patch, live)
 * - live = false: การเปลี่ยนแบบกดครั้งเดียว (เปิด/ปิด, เลือก) → เป็นขั้น undo ของตัวเอง
 * - live = true : การพิมพ์/ลากสี/ปรับตัวเลข → รวมเป็นขั้น undo เดียวจนกว่าจะเปลี่ยนช่องอื่น
 */

/* ---------- โครงหมวดแบบ property grid ---------- */

export function Section({ title, defaultOpen = true, children }) {
  return (
    <details className="pg-section" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="pg-body">{children}</div>
    </details>
  );
}

export function Row({ label, children, stack }) {
  return (
    <div className={`pg-row${stack ? " stack" : ""}`}>
      <span className="pg-label">{label}</span>
      <div className="pg-ctl">{children}</div>
    </div>
  );
}

/** กล่องตัวเลข — ระหว่างพิมพ์รับค่าว่างได้; ออกจากช่องแล้วค่าที่แสดงจะตรงกับค่าจริงเสมอ */
export function Num({ value, onChange, step = 0.5, min, max, live = true }) {
  const [text, setText] = useState(String(value ?? ""));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(value ?? ""));
  }, [value, editing]);
  return (
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      value={text}
      onFocus={(e) => {
        setEditing(true);
        e.target.select();
      }}
      onBlur={() => {
        setEditing(false);
        setText(String(value ?? ""));
      }}
      onKeyDown={(e) => {
        // Enter = ยืนยันค่าและออกจากช่อง (Esc = ยกเลิกการพิมพ์)
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(String(value ?? ""));
          e.currentTarget.blur();
        }
      }}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseFloat(e.target.value);
        if (!Number.isNaN(v)) onChange(clamp(v, min, max), live);
      }}
    />
  );
}

function clamp(v, min, max) {
  if (min != null && v < min) return min;
  if (max != null && v > max) return max;
  return v;
}

export function Text({ value, onChange, placeholder, disabled, title }) {
  return (
    <input
      type="text"
      value={value ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      title={title}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Select({ value, options, onChange, className = "select pg-select" }) {
  return (
    <select className={className} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return (
          <option key={String(v)} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}

export function Segmented({ value, options, onChange }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "is-on" : ""} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** ช่องเลือกสี — ใช้ onChange(value, live) ได้เหมือนกล่องอื่น (ลากเลือกสีจะรวมเป็น undo ขั้นเดียว) */
export function ColorField({ value, onChange, allowNone = false, live = true }) {
  return (
    <div className="color-field">
      <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value, live)} />
      <span className="mono small muted">{value || (allowNone ? "ค่าเริ่มต้น" : "")}</span>
      {allowNone && value && (
        <button type="button" className="link-btn" onClick={() => onChange(null, false)}>
          ล้าง
        </button>
      )}
    </div>
  );
}

/**
 * ช่องเลือกฟิลด์จากข้อมูลจริง — เลือกแล้วคืน expression เช่น "item.name" หรือ "company.name"
 * fields = { row: { source, items } | null, scalars: [...] } (items/scalars = {path,type,sample})
 */
export function FieldSelect({ fields, onPick, placeholder = "เลือกฟิลด์จากข้อมูล…", value }) {
  const groups = [];
  if (fields?.row?.items?.length) {
    groups.push({
      label: `ในแถว “${fields.row.source}” (item.)`,
      options: fields.row.items.map((f) => ({ value: `item.${f.path}`, label: optionLabel(f) })),
    });
  }
  if (fields?.scalars?.length) {
    groups.push({ label: "ทั้งเอกสาร", options: fields.scalars.map((f) => ({ value: f.path, label: optionLabel(f) })) });
  }
  if (!groups.length) return <p className="hint small muted">ยังไม่มีข้อมูล — ไปที่แท็บ “ข้อมูล”</p>;
  return (
    <select
      className="select pg-select field-select"
      value={value ?? ""}
      onChange={(e) => e.target.value && onPick(e.target.value)}
      aria-label="เลือกฟิลด์จากข้อมูล"
    >
      <option value="">{placeholder}</option>
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function optionLabel(f) {
  const s = (f.sample ?? "").toString();
  const shown = s.length > 22 ? `${s.slice(0, 22)}…` : s;
  return shown ? `${f.path}  ·  ${shown}` : f.path;
}

/* ---------- Element ---------- */

/**
 * @param {object} props.fields  ตัวเลือกฟิลด์ (ดู FieldSelect)
 */
/** ปุ่มลำดับซ้อน: รายการด้านบนทับรายการด้านล่างใน band เดียวกัน */
export const Z_ACTIONS = [
  { mode: "front", label: "ไปบนสุด", icon: "zFront", keys: "⌘⇧]" },
  { mode: "forward", label: "ขึ้นชั้น", icon: "zUp", keys: "⌘]" },
  { mode: "backward", label: "ลงชั้น", icon: "zDown", keys: "⌘[" },
  { mode: "back", label: "ไปล่างสุด", icon: "zBack", keys: "⌘⇧[" },
];

export function ZOrderButtons({ onReorder, compact = false }) {
  return (
    <div className={`z-order${compact ? " is-compact" : ""}`} role="group" aria-label="ลำดับซ้อน">
      {Z_ACTIONS.map((a) => (
        <button
          key={a.mode}
          type="button"
          className="z-btn"
          onClick={() => onReorder(a.mode)}
          title={`${a.label} (${a.keys})`}
          aria-label={a.label}
        >
          <Icon name={a.icon} size={15} />
          {!compact && <span>{a.label}</span>}
        </button>
      ))}
    </div>
  );
}

export function ElementProps({ el, onChange, onDelete, onDuplicate, fields, bandOptions, bandIndex, onMoveBand, onReorder }) {
  const set = (patch) => onChange(patch, false); // กดครั้งเดียว
  const live = (patch) => onChange(patch, true); // พิมพ์/ลาก/ปรับค่าต่อเนื่อง
  const appendExpr = (expr) => set({ text: `${el.text ?? ""}{{ ${expr} }}` });
  return (
    <>
      <div className="insp-head row-between">
        <div>
          <h3>{KIND_LABELS[el.type] ?? el.type}</h3>
          <p className="muted small">แก้ค่าได้ทันที · ผลจริงดูที่แท็บพรีวิว</p>
        </div>
        <div className="insp-actions">
          {onDuplicate && (
            <button type="button" className="icon-btn" onClick={onDuplicate} title="ทำซ้ำ (⌘/Ctrl+D)" aria-label="ทำซ้ำ element">
              <Icon name="copy" />
            </button>
          )}
          <button type="button" className="icon-btn danger" onClick={onDelete} title="ลบ (Delete)" aria-label="ลบ element">
            <Icon name="trash" />
          </button>
        </div>
      </div>

      {onReorder && (
        <Section title="ลำดับซ้อน">
          <ZOrderButtons onReorder={onReorder} />
          <p className="hint small muted">รายการที่อยู่บนจะทับรายการที่อยู่ล่าง · ทั้งพรีวิวและ PDF ใช้ลำดับเดียวกัน</p>
        </Section>
      )}

      <Section title="ตำแหน่งและขนาด (mm)">
        <div className="pg-grid2">
          <Row label="X"><Num value={el.x} min={0} onChange={(v, l) => onChange({ x: v }, l)} /></Row>
          <Row label="Y"><Num value={el.y} min={0} onChange={(v, l) => onChange({ y: v }, l)} /></Row>
          <Row label="กว้าง"><Num value={el.w} min={0} onChange={(v, l) => onChange({ w: v }, l)} /></Row>
          <Row label="สูง"><Num value={el.h} min={0} onChange={(v, l) => onChange({ h: v }, l)} /></Row>
        </div>
      </Section>

      {bandOptions?.length > 1 && onMoveBand && (
        <Section title="band">
          <Row label="อยู่ใน band">
            <Select value={bandIndex} options={bandOptions.map((o) => [o.value, o.label])} onChange={(v) => onMoveBand(Number(v))} />
          </Row>
          <p className="hint small muted">band รายการที่มีตาราง ใช้ได้เฉพาะตาราง — element อื่นจะถูกย้ายไป band สรุปใต้ตารางให้อัตโนมัติ</p>
        </Section>
      )}

      {el.type === "text" && (
        <Section title="ข้อความ">
          <Row label="ข้อความ" stack>
            <textarea rows={4} value={el.text ?? ""} onChange={(e) => live({ text: e.target.value })} />
          </Row>
          <Row label="แทรกฟิลด์" stack>
            <FieldSelect fields={fields} onPick={appendExpr} placeholder="+ แทรกฟิลด์ท้ายข้อความ…" />
          </Row>
          <p className="hint small muted">
            ตัวแปร <span className="mono">{"{{ company.name }}"}</span> · ในรายการ/ตารางใช้ <span className="mono">{"{{ item.name }}"}</span> ·{" "}
            <span className="mono">{"{{ page }}"}</span> / <span className="mono">{"{{ pages }}"}</span>
          </p>
          <p className="hint small muted">ยังไม่รองรับฟังก์ชันหรือตัวกรอง (เช่น <span className="mono">| format</span>) — จัดรูปแบบตัวเลขและวันที่ในข้อมูลต้นทางก่อนส่งเข้า</p>
          <Row label="ฟอนต์">
            <Select value={el.font ?? "Sarabun"} options={FONT_CHOICES} onChange={(v) => set({ font: v })} />
          </Row>
          <Row label="ขนาด (pt)">
            <Num value={el.size} min={5} max={72} step={0.5} onChange={(v, l) => onChange({ size: v }, l)} />
          </Row>
          <Row label="ตัวหนา">
            <input type="checkbox" checked={!!el.bold} onChange={(e) => set({ bold: e.target.checked })} />
          </Row>
          <Row label="สีตัวอักษร">
            <ColorField value={el.color} allowNone onChange={(v, l) => onChange({ color: v }, l)} />
          </Row>
          <Row label="จัดวาง">
            <Segmented value={el.align ?? "left"} options={ALIGN_CHOICES} onChange={(v) => set({ align: v })} />
          </Row>
          <Row label="ข้อความยาวเกินกรอบ">
            <Select value={el.overflow ?? "error"} options={OVERFLOW_CHOICES} onChange={(v) => set({ overflow: v })} />
          </Row>
          <Row label="จุดไข่ปลา">
            <Text value={el.leader ?? ""} placeholder="เช่น ." onChange={(v) => onChange({ leader: v || null }, true)} />
          </Row>
        </Section>
      )}

      {(el.type === "rectangle" || el.type === "ellipse") && (
        <Section title="พื้นและเส้นขอบ">
          <Row label="สีพื้น">
            <ColorField value={el.fill} allowNone onChange={(v, l) => onChange({ fill: v }, l)} />
          </Row>
          <Row label="สีเส้น">
            <ColorField value={el.stroke} allowNone onChange={(v, l) => onChange({ stroke: v }, l)} />
          </Row>
          <Row label="หนาเส้น (pt)">
            <Num value={el.width} min={0} max={20} step={0.1} onChange={(v, l) => onChange({ width: v }, l)} />
          </Row>
        </Section>
      )}

      {el.type === "checkbox" && (
        <Section title="ช่องติ๊ก">
          <Row label="ติ๊กเมื่อ" stack>
            <div className="field-line">
              <Text value={el.checked ?? ""} placeholder="{{ item.paid }} หรือ true" onChange={(v) => onChange({ checked: v }, true)} />
            </div>
          </Row>
          <Row label="เลือกฟิลด์" stack>
            <FieldSelect fields={fields} value={el.checked} onPick={(expr) => set({ checked: `{{ ${expr} }}` })} />
          </Row>
          <p className="hint small muted">ค่าที่เป็นจริง (ไม่ว่าง/ไม่ใช่ false, 0, no) = ติ๊ก</p>
          <Row label="สีเส้น">
            <ColorField value={el.stroke} allowNone onChange={(v, l) => onChange({ stroke: v }, l)} />
          </Row>
          <Row label="หนาเส้น (pt)">
            <Num value={el.width} min={0} max={20} step={0.1} onChange={(v, l) => onChange({ width: v }, l)} />
          </Row>
        </Section>
      )}

      {el.type === "line" && (
        <Section title="เส้น">
          <Row label="หนาเส้น (pt)">
            <Num value={el.width} min={0} max={20} step={0.1} onChange={(v, l) => onChange({ width: v }, l)} />
          </Row>
          <p className="hint small muted">เส้นแนวนอนถ้าสูง = 0 · แนวตั้งถ้ากว้าง = 0</p>
        </Section>
      )}

      {el.type === "image" && (
        <Section title="รูปภาพ">
          <ImageSource src={el.src} onChange={(src, l) => onChange({ src }, l)} />
        </Section>
      )}

      {el.type === "table" && (
        <>
          <Section title="ตาราง">
            <Row label="แหล่งข้อมูล">
              <Text value={el.data_source ?? ""} placeholder="items" onChange={(v) => onChange({ data_source: v || null }, true)} />
            </Row>
            <p className="hint small muted">ชื่อ array ในข้อมูล (เช่น items) · ว่างไว้เพื่อใช้ของ band หรือ items</p>
            <Row label="ฟอนต์">
              <Select value={el.font ?? "Sarabun"} options={FONT_CHOICES} onChange={(v) => set({ font: v })} />
            </Row>
            <Row label="ขนาด (pt)">
              <Num value={el.size} min={5} max={72} step={0.5} onChange={(v, l) => onChange({ size: v }, l)} />
            </Row>
            <Row label="ทวนหัวทุกหน้า">
              <input type="checkbox" checked={!!el.header_repeat} onChange={(e) => set({ header_repeat: e.target.checked })} />
            </Row>
          </Section>
          <Section title="คอลัมน์">
            <ColumnsEditor
              columns={el.columns ?? []}
              tableWidth={el.w}
              fields={fields}
              onChange={(columns, l) => onChange({ columns }, l)}
              onFit={() => set({ columns: fixColumnSum(el.columns ?? [], el.w) })}
            />
          </Section>
          <Section title="สไตล์หัวและสีตาราง" defaultOpen={false}>
            <Row label="หัวตัวหนา">
              <input type="checkbox" checked={el.header_bold !== false} onChange={(e) => set({ header_bold: e.target.checked })} />
            </Row>
            <Row label="สีตัวอักษรหัว">
              <ColorField value={el.header_color} allowNone onChange={(v, l) => onChange({ header_color: v }, l)} />
            </Row>
            <Row label="สีพื้นหัว">
              <ColorField value={el.header_fill} allowNone onChange={(v, l) => onChange({ header_fill: v }, l)} />
            </Row>
            <Row label="สีแถวคู่">
              <ColorField value={el.zebra_fill} allowNone onChange={(v, l) => onChange({ zebra_fill: v }, l)} />
            </Row>
            <Row label="สีเส้นกรอบ">
              <ColorField value={el.border_color} allowNone onChange={(v, l) => onChange({ border_color: v }, l)} />
            </Row>
          </Section>
          <Section title={`กฎสีเซลล์ (${(el.cell_styles ?? []).length})`} defaultOpen={false}>
            <CellRules rules={el.cell_styles ?? []} columns={el.columns ?? []} onChange={(cell_styles, l) => onChange({ cell_styles }, l)} />
          </Section>
        </>
      )}
    </>
  );
}

function ImageSource({ src, onChange }) {
  const isData = src?.startsWith("data:");
  return (
    <>
      {isData && <img className="img-thumb" src={src} alt="" />}
      <Row label="แหล่งภาพ" stack>
        {isData ? (
          <p className="small muted">ฝังอยู่ในเทมเพลตแล้ว — อัปโหลดใหม่เพื่อเปลี่ยน หรือวาง path/URL ด้านล่าง</p>
        ) : null}
        <Text value={isData ? "" : src} placeholder={isData ? "หรือวาง URL/path ของรูป" : "URL หรือ path"} onChange={(v) => onChange(v || null, true)} />
      </Row>
      <label className="btn btn-block">
        <Icon name="upload" /> อัปโหลดภาพ (PNG/JPEG)
        <span className="small muted">ไม่เกิน 2 MB ต่อภาพ</span>
        <input
          type="file"
          accept="image/png,image/jpeg"
          hidden
          onChange={(e) => {
            const f = e.target.files[0];
            e.target.value = "";
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => onChange(reader.result, false);
            reader.readAsDataURL(f);
          }}
        />
      </label>
    </>
  );
}

/** แก้คอลัมน์ตาราง: หัว · ฟิลด์ (เลือกจากข้อมูลหรือพิมพ์เอง) · ความกว้าง · จัดวาง · สไตล์ · เลื่อน/ลบ */
function ColumnsEditor({ columns, tableWidth, fields, onChange, onFit }) {
  const update = (i, patch, live = true) => onChange(columns.map((c, j) => (j === i ? { ...c, ...patch } : c)), live);
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= columns.length) return;
    const next = [...columns];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next, false);
  };
  const remove = (i) => onChange(columns.filter((_, j) => j !== i), false);
  const add = () => onChange([...columns, { width: 30, header: "หัวคอลัมน์", field: "{{ item.field }}", align: "left" }], false);
  const total = columns.reduce((a, c) => a + (c.width || 0), 0);
  const off = Math.abs(total - (tableWidth ?? 0)) > 0.05;
  return (
    <div className="cols">
      {columns.map((c, i) => (
        <div className="col-card" key={i}>
          <div className="col-top">
            <span className="col-no mono">{i + 1}</span>
            <input className="col-header" value={c.header ?? ""} placeholder="หัวคอลัมน์" aria-label={`หัวคอลัมน์ ${i + 1}`} onChange={(e) => update(i, { header: e.target.value })} />
            <input
              className="col-width"
              type="number"
              step="1"
              min="1"
              value={c.width ?? 0}
              aria-label={`ความกว้างคอลัมน์ ${i + 1} มม.`}
              title="ความกว้าง (มม.)"
              onChange={(e) => update(i, { width: parseFloat(e.target.value) || 0 })}
            />
            <div className="cols-ops">
              <button type="button" className="icon-btn small-btn" onClick={() => move(i, -1)} title="เลื่อนไปซ้าย" aria-label="เลื่อนคอลัมน์ไปซ้าย">↑</button>
              <button type="button" className="icon-btn small-btn" onClick={() => move(i, 1)} title="เลื่อนไปขวา" aria-label="เลื่อนคอลัมน์ไปขวา">↓</button>
              <button type="button" className="icon-btn small-btn danger" onClick={() => remove(i)} title="ลบคอลัมน์" aria-label="ลบคอลัมน์">×</button>
            </div>
          </div>
          <div className="col-mid">
            <FieldSelect fields={fields} value={c.field} onPick={(expr) => update(i, { field: `{{ ${expr} }}` }, false)} placeholder="เลือกฟิลด์…" />
            <input className="col-field mono" value={c.field ?? ""} aria-label={`ฟิลด์คอลัมน์ ${i + 1}`} onChange={(e) => update(i, { field: e.target.value })} />
          </div>
          <div className="col-bot">
            <Segmented value={c.align ?? "left"} options={ALIGN_CHOICES} onChange={(v) => update(i, { align: v }, false)} />
          </div>
          <details className="col-style">
            <summary>สไตล์คอลัมน์ {i + 1}</summary>
            <div className="col-style-body">
              <Row label="ฟอนต์">
                <Select value={c.font ?? ""} options={[["", "ตามตาราง"], ...FONT_CHOICES.map((f) => [f, f])]} onChange={(v) => update(i, { font: v || null }, false)} />
              </Row>
              <Row label="ขนาด (pt)">
                <Num value={c.size ?? 0} min={0} max={72} step={0.5} onChange={(v) => update(i, { size: v || null })} />
              </Row>
              <Row label="ตัวหนา">
                <input type="checkbox" checked={!!c.bold} onChange={(e) => update(i, { bold: e.target.checked }, false)} />
              </Row>
              <Row label="สีตัวอักษร">
                <ColorField value={c.color} allowNone onChange={(v, l) => update(i, { color: v }, l)} />
              </Row>
              <Row label="สีพื้นเซลล์">
                <ColorField value={c.fill} allowNone onChange={(v, l) => update(i, { fill: v }, l)} />
              </Row>
            </div>
          </details>
        </div>
      ))}
      <button type="button" className="btn btn-block" onClick={add}>+ เพิ่มคอลัมน์</button>
      <div className={`cols-total small${off ? " is-off" : ""}`}>
        <span className="mono">รวม {Math.round(total * 10) / 10} / {tableWidth ?? 0} mm</span>
        {off && (
          <button type="button" className="link-btn" onClick={onFit}>
            ปรับให้พอดี
          </button>
        )}
      </div>
    </div>
  );
}

/** กฎสีเซลล์: เลือกแถวข้อมูลที่ (หรือทุกแถว) + คอลัมน์ แล้วกำหนดสี/ตัวหนา/พื้น */
function CellRules({ rules, columns, onChange }) {
  const update = (i, patch, live = false) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)), live);
  const add = () => onChange([...rules, { row: 1, col: 1, color: "#D42B1F", bold: true }], false);
  const colOptions = columns.map((c, i) => [i + 1, `${i + 1}. ${c.header || "คอลัมน์"}`]);
  return (
    <div className="cell-rules">
      <p className="hint small muted">ตัวอย่าง: แถวที่ 3 + คอลัมน์ 4 → สีแดง · เลือก “ทุกแถว” เพื่อทับทั้งคอลัมน์</p>
      {rules.map((r, i) => (
        <div className="rule" key={i}>
          <div className="rule-line">
            <Select
              value={r.row ?? "all"}
              options={[["all", "ทุกแถว"], ...Array.from({ length: 50 }, (_, k) => [k + 1, `แถวที่ ${k + 1}`])]}
              onChange={(v) => update(i, { row: v === "all" ? null : Number(v) })}
            />
            <Select value={r.col} options={colOptions} onChange={(v) => update(i, { col: Number(v) })} />
            <button type="button" className="icon-btn small-btn danger" onClick={() => onChange(rules.filter((_, j) => j !== i), false)} title="ลบกฎ" aria-label="ลบกฎสี">×</button>
          </div>
          <div className="rule-line">
            <ColorField value={r.color} allowNone onChange={(v, l) => update(i, { color: v }, l)} />
            <label className="check"><input type="checkbox" checked={!!r.bold} onChange={(e) => update(i, { bold: e.target.checked })} /> ตัวหนา</label>
            <ColorField value={r.fill} allowNone onChange={(v, l) => update(i, { fill: v }, l)} />
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-block" onClick={add} disabled={columns.length === 0}>+ เพิ่มกฎสี</button>
    </div>
  );
}

/* ---------- Band ---------- */

export function BandProps({ band, bandIndex, onPatch, onDelete, onAddBand, existingTypes }) {
  const missing = BAND_ORDER.filter((t) => !existingTypes.includes(t));
  return (
    <>
      <div className="insp-head row-between">
        <div>
          <h3>{BAND_LABELS[band.type] ?? band.type}</h3>
          <p className="muted small">ลาก element เข้ามาในกรอบบนกระดาษได้ · ลากขอบล่างของกรอบเพื่อปรับความสูง</p>
        </div>
        <button type="button" className="icon-btn danger" onClick={onDelete} title="ลบ band นี้" aria-label="ลบ band">
          <Icon name="trash" />
        </button>
      </div>
      <Section title="ชื่อและการวาง">
        <Row label="ชื่อ band">
          <Text value={band.name ?? ""} placeholder={BAND_LABELS[band.type] ?? band.type} onChange={(v) => onPatch({ name: v.trim() ? v : null }, true)} />
        </Row>
        <Row label="ความสูง (mm)">
          <Num value={band.height} min={1} onChange={(v, l) => onPatch({ height: v }, l)} />
        </Row>
        <Row label="ระยะก่อน band (mm)">
          <Num value={band.gap_before ?? 0} min={0} onChange={(v, l) => onPatch({ gap_before: v }, l)} />
        </Row>
        {band.type === "detail" || band.dataSource ? (
          <Row label="แหล่งข้อมูล">
            <Text value={band.dataSource ?? ""} placeholder="items" onChange={(v) => onPatch({ dataSource: v || null }, true)} />
          </Row>
        ) : null}
      </Section>
      <Section title="เพิ่ม band" defaultOpen={false}>
        {missing.length === 0 ? (
          <p className="muted small">มี band ครบทุกชนิดแล้ว</p>
        ) : (
          <div className="band-add">
            {missing.map((t) => (
              <button key={t} type="button" className="btn" onClick={() => onAddBand(t)}>
                + {BAND_LABELS[t]}
              </button>
            ))}
          </div>
        )}
      </Section>
      <p className="hint small muted">band #{bandIndex + 1}</p>
    </>
  );
}

/* ---------- Page ---------- */

export function PageProps({ template, onChange }) {
  const page = template.page ?? {};
  const size = pageSize(template);
  const m = margins(template);
  const setMargin = (k, v, live) => {
    const next = { ...m, [k]: v };
    onChange({ page: { ...page, margin: [next.t, next.r, next.b, next.l] } }, live);
  };
  const custom = page.custom_mm ?? [210, 297];
  const setPage = (patch, live = false) => onChange({ page: { ...page, ...patch } }, live);
  return (
    <>
      <h3>หน้ากระดาษ</h3>
      <Section title="ขนาด">
        <Row label="ขนาดมาตรฐาน">
          <Select
            value={page.size ?? "A4"}
            options={PAGE_SIZES.map((s) => [s, s === "Custom" ? "กำหนดเอง" : s])}
            onChange={(v) => setPage({ size: v, custom_mm: v === "Custom" ? custom : page.custom_mm })}
          />
        </Row>
        {page.size === "Custom" && (
          <div className="pg-grid2">
            <Row label="กว้าง mm">
              <Num value={custom[0]} min={20} max={2000} step={1} onChange={(v, l) => setPage({ custom_mm: [v, custom[1]] }, l)} />
            </Row>
            <Row label="สูง mm">
              <Num value={custom[1]} min={20} max={2000} step={1} onChange={(v, l) => setPage({ custom_mm: [custom[0], v] }, l)} />
            </Row>
          </div>
        )}
        <Row label="แนวกระดาษ">
          <Segmented
            value={page.orientation ?? "portrait"}
            options={[
              ["portrait", "ตั้ง"],
              ["landscape", "นอน"],
            ]}
            onChange={(v) => setPage({ orientation: v })}
          />
        </Row>
        <p className="muted small mono">
          ผลลัพธ์ {size.w} × {size.h} mm
        </p>
      </Section>
      <Section title="ขอบกระดาษ (mm)">
        <div className="pg-grid2">
          <Row label="บน"><Num value={m.t} min={0} onChange={(v, l) => setMargin("t", v, l)} /></Row>
          <Row label="ล่าง"><Num value={m.b} min={0} onChange={(v, l) => setMargin("b", v, l)} /></Row>
          <Row label="ซ้าย"><Num value={m.l} min={0} onChange={(v, l) => setMargin("l", v, l)} /></Row>
          <Row label="ขวา"><Num value={m.r} min={0} onChange={(v, l) => setMargin("r", v, l)} /></Row>
        </div>
      </Section>
      <Section title="ฟอนต์และพจนานุกรมไทย" defaultOpen={false}>
        <Row label="ฟอนต์ที่ใช้" stack>
          <p className="small muted mono">{(template.fonts ?? []).map((f) => f.family).join(", ") || "—"}</p>
        </Row>
        <Row label="คำที่ไม่ให้ตัด (1 คำต่อบรรทัด)" stack>
          <textarea
            rows={4}
            value={(template.user_dict ?? []).join("\n")}
            onChange={(e) => onChange({ user_dict: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) }, true)}
          />
        </Row>
      </Section>
    </>
  );
}
