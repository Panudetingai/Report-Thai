import React, { useEffect, useState } from "react";
import { Icon } from "./icons.jsx";
import { fieldBracketLabel } from "./bind.js";
import { fetchUrlAsDataUrl, isDataImageSrc, isHttpUrl, needsEmbedForPreview, readFileAsDataUrl } from "./image-embed.js";
import { isTableList, KIND_LABELS, BAND_LABELS, BAND_ORDER, fixColumnSum } from "./state.js";
import { PAGE_SIZES, margins, pageSize } from "./layout.js";
import { Button, buttonVariants } from "./components/ui/button.jsx";
import { Input, Textarea } from "./components/ui/input.jsx";
import { Label } from "./components/ui/label.jsx";
import { NativeSelect } from "./components/ui/native-select.jsx";
import { Switch } from "./components/ui/switch.jsx";
import { ToggleGroup } from "./components/ui/toggle-group.jsx";
import { cn } from "./lib/utils.js";
import { frameLabel } from "./names.js";

export const FONT_CHOICES = ["Sarabun-Light", "Sarabun", "Sarabun-Bold", "NotoSansThai"];
const OVERFLOW_CHOICES = [
  ["wrap", "ตัดบรรทัด"],
  ["shrink", "ย่อตัวอักษร"],
  ["clip", "ตัดทิ้ง"],
  ["grow", "ขยายกรอบ"],
  ["error", "แจ้งข้อผิดพลาด"],
];
const ALIGN_CHOICES = [
  ["left", <Icon key="l" name="textLeft" />, "ชิดซ้าย"],
  ["center", <Icon key="c" name="textCenter" />, "กึ่งกลาง"],
  ["right", <Icon key="r" name="textRight" />, "ชิดขวา"],
];

/*
 * ทุก control เรียก onChange(patch, live)
 * - live = false: การเปลี่ยนแบบกดครั้งเดียว (เปิด/ปิด, เลือก) → เป็นขั้น undo ของตัวเอง
 * - live = true : การพิมพ์/ลากสี/ปรับตัวเลข → รวมเป็นขั้น undo เดียวจนกว่าจะเปลี่ยนช่องอื่น
 */

/* ---------- โครงแผง ---------- */

/** หัวแผง: บอกเสมอว่ากำลังแก้อะไร อยู่ตรงไหน — ผู้ใช้ไม่หลง */
export function PanelHeader({ icon, title, subtitle, children }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent-soft text-primary [&_svg]:size-4">
        <Icon name={icon} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold leading-tight">{title}</div>
        {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">{children}</div>
    </div>
  );
}

// หมวดที่ผู้ใช้เปิด/ปิดไว้คงอยู่เมื่อเปลี่ยนรายการที่เลือก (ไม่เด้งกลับทุกครั้ง)
const openState = new Map();

export function Section({ title, defaultOpen = true, children, action }) {
  const [open, setOpen] = useState(() => openState.get(title) ?? defaultOpen);
  const toggle = () => {
    openState.set(title, !open);
    setOpen(!open);
  };
  return (
    <section className="border-b border-border" data-slot="section">
      <div className="flex items-center pr-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex h-10 flex-1 items-center gap-1.5 px-4 text-left text-[13px] font-semibold text-foreground outline-none focus-visible:bg-muted"
        >
          <Icon name="chevron" size={14} className={cn("text-muted-foreground transition-transform", !open && "-rotate-90")} />
          {title}
        </button>
        {action}
      </div>
      {open && <div className="grid gap-3 px-4 pb-4">{children}</div>}
    </section>
  );
}

/** แถวคุณสมบัติ: ป้ายซ้าย ช่องขวา — stack = ป้ายบน ช่องล่าง (ข้อความยาว) */
export function Row({ label, children, stack }) {
  return (
    <div className={cn("grid items-center gap-x-3 gap-y-1.5", stack ? "grid-cols-1" : "grid-cols-[84px_minmax(0,1fr)]")}>
      <Label className="truncate">{label}</Label>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

/** กล่องตัวเลข — ระหว่างพิมพ์รับค่าว่างได้; ออกจากช่องแล้วค่าที่แสดงจะตรงกับค่าจริงเสมอ · prefix = ป้ายในช่องแบบ Figma (X, Y, W, H) */
export function Num({ value, onChange, step = 0.5, min, max, live = true, prefix, suffix, label }) {
  const [text, setText] = useState(String(value ?? ""));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(value ?? ""));
  }, [value, editing]);
  return (
    <div className="relative w-full min-w-0">
      {prefix && <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted-foreground">{prefix}</span>}
      <Input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={text}
        aria-label={label ?? prefix}
        className={cn("font-mono tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none", suffix && "pr-8")}
        style={prefix ? { paddingLeft: 12 + [...prefix].length * 6 } : undefined}
        onFocus={(e) => {
          setEditing(true);
          e.target.select();
        }}
        onBlur={() => {
          setEditing(false);
          setText(String(value ?? ""));
        }}
        onKeyDown={(e) => {
          // Enter = ยืนยันค่าและออกจากช่อง · Esc = ยกเลิก · ↑↓ = ปรับทีละ step (Shift = ×10)
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setText(String(value ?? ""));
            e.currentTarget.blur();
          }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const cur = parseFloat(text);
            const d = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            const v = clamp(Math.round(((Number.isNaN(cur) ? 0 : cur) + d) * 100) / 100, min, max);
            setText(String(v));
            onChange(v, live);
          }
        }}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(clamp(v, min, max), live);
        }}
      />
      {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">{suffix}</span>}
    </div>
  );
}

function clamp(v, min, max) {
  if (min != null && v < min) return min;
  if (max != null && v > max) return max;
  return v;
}

export function Text({ value, onChange, placeholder, disabled, title, mono }) {
  return (
    <Input value={value ?? ""} placeholder={placeholder} disabled={disabled} title={title} className={mono ? "font-mono text-xs" : undefined} onChange={(e) => onChange(e.target.value)} />
  );
}

export function Select({ value, options, onChange, label }) {
  return (
    <NativeSelect value={value ?? ""} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return (
          <option key={String(v)} value={v}>
            {l}
          </option>
        );
      })}
    </NativeSelect>
  );
}

/** ช่องเลือกสี: จุดสี + รหัสสี + ล้าง — ลากเลือกสีจะรวมเป็น undo ขั้นเดียว */
export function ColorField({ value, onChange, allowNone = false, live = true }) {
  const [hex, setHex] = useState(value ?? "");
  useEffect(() => setHex(value ?? ""), [value]);
  return (
    <div className="flex w-full min-w-0 items-center gap-1.5">
      <label
        className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border border-input shadow-xs"
        style={{ background: value || "repeating-conic-gradient(#e4e4e7 0 25%, #fff 0 50%) 50% / 10px 10px" }}
        title="เลือกสี"
      >
        <input type="color" className="absolute inset-0 size-full cursor-pointer opacity-0" value={value || "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase(), live)} />
      </label>
      <Input
        value={hex}
        placeholder={allowNone ? "ไม่มี" : "#000000"}
        className="font-mono text-xs uppercase"
        aria-label="รหัสสี"
        onChange={(e) => {
          setHex(e.target.value);
          if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toUpperCase(), true);
        }}
        onBlur={() => setHex(value ?? "")}
      />
      {allowNone && value && (
        <Button variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground" onClick={() => onChange(null, false)} title="ล้างสี" aria-label="ล้างสี">
          <Icon name="x" />
        </Button>
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
      label: `ในแถว “${fields.row.source}”`,
      options: fields.row.items.map((f) => ({ value: `item.${f.path}`, label: optionLabel(`item.${f.path}`) })),
    });
  }
  if (fields?.scalars?.length) {
    groups.push({ label: "ทั้งเอกสาร", options: fields.scalars.map((f) => ({ value: f.path, label: optionLabel(f.path) })) });
  }
  if (!groups.length) return <p className="text-xs text-muted-foreground">ยังไม่มีข้อมูล</p>;
  return (
    <NativeSelect value={value ?? ""} onChange={(e) => e.target.value && onPick(e.target.value)} aria-label="เลือกฟิลด์จากข้อมูล">
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
    </NativeSelect>
  );
}

function optionLabel(expr) {
  return `[${fieldBracketLabel(expr)}] — ${expr}`;
}

/* ---------- Element ---------- */

/** ปุ่มลำดับซ้อน: รายการด้านบนทับรายการด้านล่างใน band เดียวกัน */
export const Z_ACTIONS = [
  { mode: "front", label: "ไปบนสุด", icon: "zFront", keys: "⌘⇧]" },
  { mode: "forward", label: "ขึ้นชั้น", icon: "zUp", keys: "⌘]" },
  { mode: "backward", label: "ลงชั้น", icon: "zDown", keys: "⌘[" },
  { mode: "back", label: "ไปล่างสุด", icon: "zBack", keys: "⌘⇧[" },
];

export function ZOrderButtons({ onReorder, compact = false }) {
  return (
    <div className={cn("flex items-center", compact ? "gap-0.5" : "w-full gap-1")} role="group" aria-label="ลำดับซ้อน">
      {Z_ACTIONS.map((a) => (
        <Button
          key={a.mode}
          variant={compact ? "ghost" : "outline"}
          size="icon-sm"
          className={compact ? undefined : "flex-1"}
          onClick={() => onReorder(a.mode)}
          title={`${a.label} (${a.keys})`}
          aria-label={a.label}
        >
          <Icon name={a.icon} />
        </Button>
      ))}
    </div>
  );
}

/** band ที่แทรกได้เฉพาะค่ารวม (engine แทนค่าเฉพาะการรวม/กลุ่ม ไม่มีแถวปัจจุบัน) */
export const AGGREGATE_BANDS = ["groupHeader", "groupFooter", "summary"];

/** ตัวเลือกการรวมค่า: นับ, รวม/เฉลี่ยของฟิลด์ตัวเลข, และค่ากลุ่ม (เฉพาะหัว/ท้ายกลุ่ม) */
export function AggregatePicker({ fields, bandType, onPick }) {
  const items = fields?.row?.items ?? [];
  // ตัวเลขจริง หรือข้อความที่แปลงเป็นตัวเลขได้ (เช่น "1,234.50" จาก CSV)
  const isNumeric = (f) => f.type === "ตัวเลข" || (f.sample != null && f.sample !== "" && !Number.isNaN(Number(String(f.sample).replace(/,/g, ""))));
  const numeric = items.filter(isNumeric);
  const sums = numeric.length ? numeric : items;
  const groupBand = bandType === "groupHeader" || bandType === "groupFooter";
  return (
    <NativeSelect value="" onChange={(e) => e.target.value && onPick(e.target.value)} aria-label="แทรกค่ารวม">
      <option value="">+ แทรกค่ารวม</option>
      <optgroup label="รวม">
        <option value="count()">นับรายการ</option>
        {sums.map((f) => (
          <option key={f.path} value={`sum(item.${f.path})`}>
            รวม [{fieldBracketLabel(`item.${f.path}`)}]
          </option>
        ))}
      </optgroup>
      {groupBand && (
        <optgroup label="กลุ่ม">
          <option value="group.value">ค่ากลุ่ม</option>
          <option value="group.count">จำนวนในกลุ่ม</option>
        </optgroup>
      )}
    </NativeSelect>
  );
}

const KIND_ICON = { text: "text", line: "line", rectangle: "rect", ellipse: "ellipse", image: "image", table: "table", checkbox: "checkbox" };

/** ช่องชื่อ: บันทึกเมื่อกด Enter หรือออกจากช่อง (เป็น undo ขั้นเดียว) · Esc = ยกเลิก */
function NameInput({ value, placeholder, onCommit, label = "ชื่อ" }) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);
  return (
    <Input
      value={text}
      placeholder={placeholder}
      aria-label={label}
      className="font-medium"
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(value ?? "");
          setTimeout(() => e.target.blur());
        }
      }}
      onBlur={() => text !== (value ?? "") && onCommit(text)}
    />
  );
}

export function ElementProps({ el, onChange, onDelete, onDuplicate, fields, aggFields, bandType, bandOptions, bandIndex, onMoveBand, onReorder, onNotice, count = 1, frameInfo, groupInfo }) {
  const set = (patch) => onChange(patch, false); // กดครั้งเดียว
  const live = (patch) => onChange(patch, true); // พิมพ์/ลาก/ปรับค่าต่อเนื่อง
  // แทรกท้ายข้อความ — เว้นวรรคให้เมื่อข้อความเดิมไม่ได้ลงท้ายด้วยช่องว่าง
  const appendExpr = (expr) => {
    const cur = el.text ?? "";
    set({ text: `${cur}${cur && !/\s$/.test(cur) ? " " : ""}{{ ${expr} }}` });
  };
  const bandName = bandOptions?.find((o) => o.value === bandIndex)?.label;
  const title = el.type === "rectangle" ? frameLabel(el) : KIND_LABELS[el.type] ?? el.type;
  return (
    <>
      <PanelHeader
        icon={groupInfo?.whole ? "groupBox" : el.type === "rectangle" ? "frame" : KIND_ICON[el.type] ?? "rect"}
        title={groupInfo?.whole ? groupInfo.name : count > 1 ? `${title} + อีก ${count - 1} รายการ` : title}
        subtitle={[groupInfo?.whole ? `กลุ่ม · ${count} รายการ` : null, bandName ? `band · ${bandName}` : null].filter(Boolean).join(" · ") || undefined}
      >
        {onDuplicate && (
          <Button variant="ghost" size="icon-sm" onClick={onDuplicate} title="ทำซ้ำ (⌘/Ctrl+D)" aria-label="ทำซ้ำ">
            <Icon name="duplicate" />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" className="hover:bg-destructive/10 hover:text-destructive" onClick={onDelete} title="ลบ (Delete)" aria-label="ลบ">
          <Icon name="trash" />
        </Button>
      </PanelHeader>

      {groupInfo && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2">
          <Icon name="groupBox" size={14} className="shrink-0 text-muted-foreground" />
          {groupInfo.whole ? (
            <NameInput value={groupInfo.name === "กลุ่ม" ? "" : groupInfo.name} placeholder="กลุ่ม" label="ชื่อกลุ่ม" onCommit={groupInfo.onRename} />
          ) : (
            <button type="button" className="min-w-0 flex-1 truncate text-left text-xs font-medium text-muted-foreground hover:text-foreground" onClick={groupInfo.onSelect} title="เลือกทั้งกลุ่ม">
              อยู่ใน “{groupInfo.name}”
            </button>
          )}
          <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={groupInfo.onUngroup} title="แยกกลุ่ม">
            <Icon name="ungroup" /> แยก
          </Button>
        </div>
      )}

      <Section title="การจัดวาง">
        <div className="grid grid-cols-2 gap-2">
          <Num prefix="X" value={el.x} min={0} onChange={(v, l) => onChange({ x: v }, l)} />
          <Num prefix="Y" value={el.y} min={0} onChange={(v, l) => onChange({ y: v }, l)} />
          <Num prefix="W" label="กว้าง" value={el.w} min={0} onChange={(v, l) => onChange({ w: v }, l)} />
          <Num prefix="H" label="สูง" value={el.h} min={0} onChange={(v, l) => onChange({ h: v }, l)} />
        </div>
        {onReorder && (
          <Row label="ลำดับซ้อน">
            <ZOrderButtons onReorder={onReorder} />
          </Row>
        )}
        {bandOptions?.length > 1 && onMoveBand && (
          <Row label="อยู่ใน band">
            <Select value={bandIndex} options={bandOptions.map((o) => [o.value, o.label])} onChange={(v) => onMoveBand(Number(v))} label="อยู่ใน band" />
          </Row>
        )}
      </Section>

      {el.type === "text" && (
        <>
          <Section title="ข้อความ">
            <Textarea rows={3} value={el.text ?? ""} onChange={(e) => live({ text: e.target.value })} aria-label="ข้อความ" />
            {AGGREGATE_BANDS.includes(bandType) ? (
              <AggregatePicker fields={aggFields} bandType={bandType} onPick={appendExpr} />
            ) : (
              <FieldSelect fields={fields} onPick={appendExpr} placeholder="+ แทรกฟิลด์" />
            )}
          </Section>
          <Section title="ตัวอักษร">
            <div className="grid grid-cols-[minmax(0,1fr)_76px] gap-2">
              <Select value={el.font ?? "Sarabun"} options={FONT_CHOICES} onChange={(v) => set({ font: v })} label="ฟอนต์" />
              <Num value={el.size} min={5} max={72} step={0.5} suffix="pt" label="ขนาด" onChange={(v, l) => onChange({ size: v }, l)} />
            </div>
            <div className="flex items-center gap-2">
              <ToggleGroup label="จัดวางข้อความ" value={el.align ?? "left"} options={ALIGN_CHOICES} onValueChange={(v) => set({ align: v })} />
              <Button
                variant="outline"
                size="icon"
                className={cn("shrink-0", el.bold && "border-primary bg-accent-soft text-primary hover:bg-accent-soft")}
                aria-pressed={!!el.bold}
                onClick={() => set({ bold: !el.bold })}
                title="ตัวหนา"
                aria-label="ตัวหนา"
              >
                <Icon name="bold" />
              </Button>
            </div>
            <Row label="สี">
              <ColorField value={el.color} allowNone onChange={(v, l) => onChange({ color: v }, l)} />
            </Row>
            <Row label="ยาวเกินกรอบ">
              <Select value={el.overflow ?? "error"} options={OVERFLOW_CHOICES} onChange={(v) => set({ overflow: v })} label="ข้อความยาวเกินกรอบ" />
            </Row>
            <Row label="จุดไข่ปลา">
              <Text value={el.leader ?? ""} placeholder="เช่น ." onChange={(v) => onChange({ leader: v || null }, true)} />
            </Row>
          </Section>
        </>
      )}

      {(el.type === "rectangle" || el.type === "ellipse") && (
        <Section title={el.type === "rectangle" ? "กรอบ" : "รูปทรง"}>
          {frameInfo?.onRename && (
            <Row label="ชื่อกรอบ">
              <NameInput value={el.name} placeholder="กรอบ" label="ชื่อกรอบ" onCommit={frameInfo.onRename} />
            </Row>
          )}
          <Row label="สีพื้น">
            <ColorField value={el.fill} allowNone onChange={(v, l) => onChange({ fill: v }, l)} />
          </Row>
          <Row label="สีเส้น">
            <ColorField value={el.stroke} allowNone onChange={(v, l) => onChange({ stroke: v }, l)} />
          </Row>
          <Row label="หนาเส้น">
            <Num value={el.width} min={0} max={20} step={0.1} suffix="pt" label="หนาเส้น" onChange={(v, l) => onChange({ width: v }, l)} />
          </Row>
          {frameInfo && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2">
              <span className="text-xs text-muted-foreground">{frameInfo.count ? `ในกรอบ ${frameInfo.count} รายการ` : "กรอบยังว่าง"}</span>
              <Button variant="outline" size="sm" onClick={frameInfo.onAddText}>
                <Icon name="text" /> ใส่ข้อความ
              </Button>
            </div>
          )}
        </Section>
      )}

      {el.type === "checkbox" && (
        <Section title="ช่องติ๊ก">
          <Row label="ติ๊กเมื่อ" stack>
            <Text value={el.checked ?? ""} mono placeholder="{{ item.paid }}" onChange={(v) => onChange({ checked: v }, true)} />
            <FieldSelect fields={fields} value="" onPick={(expr) => set({ checked: `{{ ${expr} }}` })} placeholder="เลือกฟิลด์" />
          </Row>
          <Row label="สีเส้น">
            <ColorField value={el.stroke} allowNone onChange={(v, l) => onChange({ stroke: v }, l)} />
          </Row>
          <Row label="หนาเส้น">
            <Num value={el.width} min={0} max={20} step={0.1} suffix="pt" label="หนาเส้น" onChange={(v, l) => onChange({ width: v }, l)} />
          </Row>
        </Section>
      )}

      {el.type === "line" && (
        <Section title="เส้น">
          <Row label="หนาเส้น">
            <Num value={el.width} min={0} max={20} step={0.1} suffix="pt" label="หนาเส้น" onChange={(v, l) => onChange({ width: v }, l)} />
          </Row>
        </Section>
      )}

      {el.type === "image" && (
        <Section title="รูปภาพ">
          <ImageSource src={el.src} onChange={(src, l) => onChange({ src }, l)} onNotice={onNotice} />
        </Section>
      )}

      {el.type === "table" && (
        <>
          <Section title="ตาราง">
            <Row label="แหล่งข้อมูล">
              <Text value={el.data_source ?? ""} mono placeholder="items" onChange={(v) => onChange({ data_source: v || null }, true)} />
            </Row>
            <div className="grid grid-cols-[minmax(0,1fr)_76px] gap-2">
              <Select value={el.font ?? "Sarabun"} options={FONT_CHOICES} onChange={(v) => set({ font: v })} label="ฟอนต์" />
              <Num value={el.size} min={5} max={72} step={0.5} suffix="pt" label="ขนาด" onChange={(v, l) => onChange({ size: v }, l)} />
            </div>
            <SwitchRow label="ทวนหัวตารางทุกหน้า" checked={!!el.header_repeat} onChange={(v) => set({ header_repeat: v })} />
          </Section>
          <Section title={`คอลัมน์ (${(el.columns ?? []).length})`}>
            <ColumnsEditor
              columns={el.columns ?? []}
              tableWidth={el.w}
              fields={fields}
              onChange={(columns, l) => onChange({ columns }, l)}
              onFit={() => set({ columns: fixColumnSum(el.columns ?? [], el.w) })}
            />
          </Section>
          <Section title="สีตาราง" defaultOpen={false}>
            <SwitchRow label="หัวตัวหนา" checked={el.header_bold !== false} onChange={(v) => set({ header_bold: v })} />
            <Row label="ตัวอักษรหัว">
              <ColorField value={el.header_color} allowNone onChange={(v, l) => onChange({ header_color: v }, l)} />
            </Row>
            <Row label="พื้นหัว">
              <ColorField value={el.header_fill} allowNone onChange={(v, l) => onChange({ header_fill: v }, l)} />
            </Row>
            <Row label="แถวคู่">
              <ColorField value={el.zebra_fill} allowNone onChange={(v, l) => onChange({ zebra_fill: v }, l)} />
            </Row>
            <Row label="เส้นกรอบ">
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

function SwitchRow({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

function ImageSource({ src, onChange, onNotice }) {
  const isData = isDataImageSrc(src);
  const [urlDraft, setUrlDraft] = useState(isData || !src ? "" : String(src));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (isData || !src) setUrlDraft("");
    else if (isHttpUrl(src) || needsEmbedForPreview(src)) setUrlDraft(String(src));
  }, [src, isData]);

  async function embedFromFile(file) {
    setErr("");
    try {
      const data = await readFileAsDataUrl(file);
      onChange(data, false);
      onNotice?.("ฝังรูปแล้ว");
    } catch (e) {
      const msg = e?.message ?? "อัปโหลดไม่สำเร็จ";
      setErr(msg);
      onNotice?.(msg);
    }
  }

  async function embedFromUrl() {
    setErr("");
    setLoading(true);
    try {
      const data = await fetchUrlAsDataUrl(urlDraft);
      onChange(data, false);
      setUrlDraft("");
      onNotice?.("ฝังรูปจาก URL แล้ว");
    } catch (e) {
      const msg = e?.message ?? "โหลด URL ไม่สำเร็จ";
      setErr(msg);
      onNotice?.(msg);
    } finally {
      setLoading(false);
    }
  }

  const warnEmbed = !isData && src && needsEmbedForPreview(src);

  return (
    <>
      {isData && (
        <div className="grid h-28 place-items-center overflow-hidden rounded-md border border-border bg-[repeating-conic-gradient(#f4f4f5_0_25%,#fff_0_50%)] bg-[length:12px_12px]">
          <img className="max-h-full max-w-full object-contain" src={src} alt="" />
        </div>
      )}
      {(warnEmbed || err) && <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">{err || "รูปยังไม่ฝัง — อัปโหลดหรือโหลดจาก URL"}</p>}
      <label className={cn(buttonVariants({ variant: "outline" }), "w-full cursor-pointer")}>
        <Icon name="upload" /> อัปโหลด PNG / JPEG
        <input
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          hidden
          onChange={(e) => {
            const f = e.target.files[0];
            e.target.value = "";
            if (f) embedFromFile(f);
          }}
        />
      </label>
      <div className="flex gap-1.5">
        <Input
          value={urlDraft}
          placeholder="https://…"
          aria-label="URL รูป"
          onChange={(e) => {
            setUrlDraft(e.target.value);
            setErr("");
          }}
        />
        <Button variant="secondary" className="shrink-0" disabled={loading || !isHttpUrl(urlDraft)} onClick={embedFromUrl}>
          {loading ? "กำลังโหลด…" : "โหลด"}
        </Button>
      </div>
      <Row label="ผูกฟิลด์">
        <Text value={isData ? "" : src ?? ""} mono placeholder="{{ logo_url }}" onChange={(v) => onChange(v || null, true)} />
      </Row>
    </>
  );
}

/** แก้คอลัมน์ตาราง: หัว · ฟิลด์ · ความกว้าง · จัดวาง · สไตล์ · เลื่อน/ลบ */
function ColumnsEditor({ columns, tableWidth, fields, onChange, onFit }) {
  const [openStyle, setOpenStyle] = useState(-1);
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
    <div className="grid gap-2">
      <div className={cn("flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs", off ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground")}>
        <span className="font-mono">
          กว้างรวม {Math.round(total * 10) / 10} / {tableWidth ?? 0} mm
        </span>
        {off && (
          <Button variant="ghost" size="sm" className="h-6 text-amber-800 hover:bg-amber-100" onClick={onFit}>
            ปรับให้พอดี
          </Button>
        )}
      </div>
      {columns.map((c, i) => (
        <div className="grid gap-2 rounded-lg border border-border bg-background p-2.5 shadow-xs" key={i}>
          <div className="flex items-center gap-1.5">
            <span className="grid size-6 shrink-0 place-items-center rounded bg-muted font-mono text-[11px] font-semibold text-muted-foreground">{i + 1}</span>
            <Input value={c.header ?? ""} placeholder="หัวคอลัมน์" aria-label={`หัวคอลัมน์ ${i + 1}`} className="font-medium" onChange={(e) => update(i, { header: e.target.value })} />
            <div className="w-[68px] shrink-0">
              <Num value={c.width ?? 0} min={1} step={1} suffix="mm" label={`ความกว้างคอลัมน์ ${i + 1}`} onChange={(v, l) => update(i, { width: v }, l)} />
            </div>
          </div>
          <FieldSelect fields={fields} value="" onPick={(expr) => update(i, { field: `{{ ${expr} }}` }, false)} placeholder={c.field ? `ฟิลด์: ${c.field}` : "เลือกฟิลด์…"} />
          <div className="flex items-center gap-1">
            <ToggleGroup size="sm" className="w-auto flex-1" label="จัดวาง" value={c.align ?? "left"} options={ALIGN_CHOICES} onValueChange={(v) => update(i, { align: v }, false)} />
            <Button variant={openStyle === i ? "secondary" : "ghost"} size="icon-sm" onClick={() => setOpenStyle(openStyle === i ? -1 : i)} title="สไตล์คอลัมน์" aria-label="สไตล์คอลัมน์" aria-expanded={openStyle === i}>
              <Icon name="sliders" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0} title="เลื่อนไปซ้าย" aria-label="เลื่อนคอลัมน์ไปซ้าย">
              <Icon name="arrowUp" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={i === columns.length - 1} title="เลื่อนไปขวา" aria-label="เลื่อนคอลัมน์ไปขวา">
              <Icon name="arrowDown" />
            </Button>
            <Button variant="ghost" size="icon-sm" className="hover:bg-destructive/10 hover:text-destructive" onClick={() => remove(i)} title="ลบคอลัมน์" aria-label="ลบคอลัมน์">
              <Icon name="trash" />
            </Button>
          </div>
          {openStyle === i && (
            <div className="grid gap-2 border-t border-border pt-2">
              <Row label="ฟิลด์">
                <Text value={c.field ?? ""} mono onChange={(v) => update(i, { field: v })} />
              </Row>
              <Row label="ฟอนต์">
                <Select value={c.font ?? ""} options={[["", "ตามตาราง"], ...FONT_CHOICES.map((f) => [f, f])]} onChange={(v) => update(i, { font: v || null }, false)} />
              </Row>
              <Row label="ขนาด">
                <Num value={c.size ?? 0} min={0} max={72} step={0.5} suffix="pt" onChange={(v) => update(i, { size: v || null })} />
              </Row>
              <SwitchRow label="ตัวหนา" checked={!!c.bold} onChange={(v) => update(i, { bold: v }, false)} />
              <Row label="สีตัวอักษร">
                <ColorField value={c.color} allowNone onChange={(v, l) => update(i, { color: v }, l)} />
              </Row>
              <Row label="สีพื้น">
                <ColorField value={c.fill} allowNone onChange={(v, l) => update(i, { fill: v }, l)} />
              </Row>
            </div>
          )}
        </div>
      ))}
      <Button variant="outline" className="w-full border-dashed" onClick={add}>
        <Icon name="plus" /> เพิ่มคอลัมน์
      </Button>
    </div>
  );
}

/** กฎสีเซลล์: เลือกแถวข้อมูลที่ (หรือทุกแถว) + คอลัมน์ แล้วกำหนดสี/ตัวหนา/พื้น */
function CellRules({ rules, columns, onChange }) {
  const update = (i, patch, live = false) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)), live);
  const add = () => onChange([...rules, { row: 1, col: 1, color: "#D42B1F", bold: true }], false);
  const colOptions = columns.map((c, i) => [i + 1, `${i + 1}. ${c.header || "คอลัมน์"}`]);
  return (
    <div className="grid gap-2">
      {rules.map((r, i) => (
        <div className="grid gap-2 rounded-lg border border-border p-2.5" key={i}>
          <div className="flex items-center gap-1.5">
            <Select
              value={r.row ?? "all"}
              label="แถว"
              options={[["all", "ทุกแถว"], ...Array.from({ length: 50 }, (_, k) => [k + 1, `แถวที่ ${k + 1}`])]}
              onChange={(v) => update(i, { row: v === "all" ? null : Number(v) })}
            />
            <Select value={r.col} label="คอลัมน์" options={colOptions} onChange={(v) => update(i, { col: Number(v) })} />
            <Button variant="ghost" size="icon-sm" className="shrink-0 hover:bg-destructive/10 hover:text-destructive" onClick={() => onChange(rules.filter((_, j) => j !== i), false)} title="ลบกฎ" aria-label="ลบกฎสี">
              <Icon name="trash" />
            </Button>
          </div>
          <Row label="สีตัวอักษร">
            <ColorField value={r.color} allowNone onChange={(v, l) => update(i, { color: v }, l)} />
          </Row>
          <Row label="สีพื้น">
            <ColorField value={r.fill} allowNone onChange={(v, l) => update(i, { fill: v }, l)} />
          </Row>
          <SwitchRow label="ตัวหนา" checked={!!r.bold} onChange={(v) => update(i, { bold: v })} />
        </div>
      ))}
      <Button variant="outline" className="w-full border-dashed" onClick={add} disabled={columns.length === 0}>
        <Icon name="plus" /> เพิ่มกฎสี
      </Button>
    </div>
  );
}

/* ---------- Band ---------- */

export function BandProps({ band, bandIndex, onPatch, onDelete, onAddBand, existingTypes, canDelete = true, fields }) {
  const missing = BAND_ORDER.filter((t) => !existingTypes.includes(t));
  return (
    <>
      <PanelHeader icon="band" title={band.name || BAND_LABELS[band.type] || band.type} subtitle={isTableList(band) ? "band ตาราง" : "band"}>
        <Button
          variant="ghost"
          size="icon-sm"
          className="hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onDelete(bandIndex)}
          disabled={!canDelete}
          title={canDelete ? "ลบ band นี้" : "ต้องเหลือ band อย่างน้อย 1"}
          aria-label="ลบ band"
        >
          <Icon name="trash" />
        </Button>
      </PanelHeader>
      <Section title="band">
        <Row label="ชื่อ">
          <Text value={band.name ?? ""} placeholder={BAND_LABELS[band.type] ?? band.type} onChange={(v) => onPatch({ name: v.trim() ? v : null }, true)} />
        </Row>
        <Row label="ความสูง">
          <Num value={band.height} min={1} suffix="mm" label="ความสูง" onChange={(v, l) => onPatch({ height: v }, l)} />
        </Row>
        <Row label="ระยะก่อน">
          <Num value={band.gap_before ?? 0} min={0} suffix="mm" label="ระยะก่อน band" onChange={(v, l) => onPatch({ gap_before: v }, l)} />
        </Row>
        {band.type === "groupHeader" && (
          <Row label="จัดกลุ่มตาม" stack>
            <div className="flex gap-1.5">
              <div className="min-w-0 flex-1">
                <FieldSelect fields={fields} value={band.groupBy ?? ""} onPick={(v) => onPatch({ groupBy: v }, false)} placeholder={band.groupBy ? band.groupBy : "เลือกฟิลด์…"} />
              </div>
              {band.groupBy && (
                <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={() => onPatch({ groupBy: null }, false)} title="ไม่จัดกลุ่ม" aria-label="ไม่จัดกลุ่ม">
                  <Icon name="x" />
                </Button>
              )}
            </div>
          </Row>
        )}
        {band.type === "detail" || band.dataSource ? (
          <Row label="แหล่งข้อมูล">
            <Text value={band.dataSource ?? ""} mono placeholder="items" onChange={(v) => onPatch({ dataSource: v || null }, true)} />
          </Row>
        ) : null}
      </Section>
      {missing.length > 0 && (
        <Section title="เพิ่ม band" defaultOpen={false}>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((t) => (
              <Button key={t} variant="outline" size="sm" onClick={() => onAddBand(t)}>
                <Icon name="plus" /> {BAND_LABELS[t]}
              </Button>
            ))}
          </div>
        </Section>
      )}
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
      <PanelHeader icon="page" title="หน้ากระดาษ" subtitle={`${size.w} × ${size.h} mm`} />
      <Section title="ขนาด">
        <Row label="ขนาด">
          <Select
            value={page.size ?? "A4"}
            label="ขนาดกระดาษ"
            options={PAGE_SIZES.map((s) => [s, s === "Custom" ? "กำหนดเอง" : s])}
            onChange={(v) => setPage({ size: v, custom_mm: v === "Custom" ? custom : page.custom_mm })}
          />
        </Row>
        {page.size === "Custom" && (
          <div className="grid grid-cols-2 gap-2">
            <Num prefix="W" label="กว้าง" value={custom[0]} min={20} max={2000} step={1} onChange={(v, l) => setPage({ custom_mm: [v, custom[1]] }, l)} />
            <Num prefix="H" label="สูง" value={custom[1]} min={20} max={2000} step={1} onChange={(v, l) => setPage({ custom_mm: [custom[0], v] }, l)} />
          </div>
        )}
        <Row label="แนว">
          <ToggleGroup
            label="แนวกระดาษ"
            value={page.orientation ?? "portrait"}
            options={[
              ["portrait", "ตั้ง"],
              ["landscape", "นอน"],
            ]}
            onValueChange={(v) => setPage({ orientation: v })}
          />
        </Row>
      </Section>
      <Section title="ขอบกระดาษ (mm)">
        <div className="grid grid-cols-2 gap-2">
          <Num prefix="บน" label="ขอบบน" value={m.t} min={0} onChange={(v, l) => setMargin("t", v, l)} />
          <Num prefix="ล่าง" label="ขอบล่าง" value={m.b} min={0} onChange={(v, l) => setMargin("b", v, l)} />
          <Num prefix="ซ้าย" label="ขอบซ้าย" value={m.l} min={0} onChange={(v, l) => setMargin("l", v, l)} />
          <Num prefix="ขวา" label="ขอบขวา" value={m.r} min={0} onChange={(v, l) => setMargin("r", v, l)} />
        </div>
      </Section>
      <Section title="ฟอนต์และคำไทย" defaultOpen={false}>
        <Row label="ฟอนต์">
          <span className="truncate font-mono text-xs text-muted-foreground">{(template.fonts ?? []).map((f) => f.family).join(", ") || "—"}</span>
        </Row>
        <Row label="คำที่ไม่ให้ตัด" stack>
          <Textarea
            rows={4}
            placeholder="1 คำต่อบรรทัด"
            value={(template.user_dict ?? []).join("\n")}
            onChange={(e) => onChange({ user_dict: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) }, true)}
          />
        </Row>
      </Section>
    </>
  );
}
