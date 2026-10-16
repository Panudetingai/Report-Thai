import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { Button } from "./components/ui/button.jsx";
import { Badge } from "./components/ui/badge.jsx";
import { DropdownMenu, MenuContent, MenuItem, MenuLabel, MenuSeparator } from "./components/ui/menu.jsx";
import { Separator } from "./components/ui/separator.jsx";
import { Tabs } from "./components/ui/tabs.jsx";
import { ToggleGroup } from "./components/ui/toggle-group.jsx";
import { NativeSelect } from "./components/ui/native-select.jsx";
import { DND_KIND } from "./canvas/bandHit.js";
import { usePreviewEngine } from "./hooks/usePreviewEngine.js";
import { BandStage, RULER_H, RULER_W, TAG_W } from "./BandStage.jsx";
import { PreviewTab } from "./PreviewTab.jsx";
import { BandProps, ElementProps, PageProps, PanelHeader, ZOrderButtons } from "./Inspector.jsx";
import { DataPanel } from "./DataPanel.jsx";
import { analyzeTemplate, buildCatalog } from "./fields.js";
import { detailSourceOf, fieldBracketLabel, tableSourceOf } from "./bind.js";
import { ALIGN_ACTIONS, alignChanges, groupMembers, newGroupId } from "./layout-tools.js";
import { SAMPLES } from "./samples.js";
import { placeInFrame, textBoxInFrame, withFrameChildren } from "./frames.js";
import { buildLayerTree, nodeIndexes } from "./layers.js";
import { cleanName, frameLabel, groupLabel, nextGroupName } from "./names.js";
import { Input } from "./components/ui/input.jsx";
import { StructurePicker } from "./StructurePicker.jsx";
import { STANDARD_STRUCTURES, loadUserStructures, makeUserStructure, parseStructureFile, saveUserStructures, structureFileText } from "./structures.js";
import { ADD_KINDS, BAND_LABELS, BAND_ORDER, BAND_STD, KIND_LABELS, bandRank, bandTitle, countStrays, historyReducer, initialHistory, newElement, planMove, planPlacement, zOrderPlan } from "./state.js";
import { BASE_PX_PER_MM, contentWidth, margins, pageSize } from "./layout.js";

const MIN_ZOOM = 0.55;
const ZOOM_STEPS = [0.55, 0.75, 1, 1.25, 1.5, 2, 3];
const PREVIEW_ZOOMS = [0.5, 0.75, 1, 1.25, 1.5];
const KIND_OF_TYPE = { text: "text", line: "line", rectangle: "rect", ellipse: "ellipse", image: "image", table: "table", checkbox: "checkbox" };
const initial = SAMPLES[0];

/** ฉบับร่างอัตโนมัติ — บันทึกในเบราว์เซอร์นี้ เพื่อกลับมาทำงานต่อได้หลังปิด/รีเฟรชหน้า */
const DRAFT_KEY = "thaireport.designer.draft.v1";
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    return d?.template?.bands ? d : null;
  } catch {
    return null;
  }
}
/** ป้ายคีย์ลัดในเมนู — ⌘ บน Mac, Ctrl+ บนระบบอื่น */
const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
const timeLabel = (ts) => new Date(ts).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

const SHORTCUTS = [
  ["ดับเบิลคลิก / Enter", "แก้ข้อความบนกระดาษ (Esc ยกเลิก)"],
  ["คลิกขวา", "เมนูคำสั่งของ element / band"],
  ["ดับเบิลคลิกกรอบ", "พิมพ์ข้อความในกรอบ"],
  ["⌘/Ctrl + Z", "ย้อนกลับ"],
  ["⌘/Ctrl + Shift + Z", "ทำซ้ำ"],
  ["Shift / ⌘ + คลิก", "เลือกหลายรายการใน band เดียวกัน"],
  ["⌘/Ctrl + A", "เลือกทั้ง band"],
  ["⌘/Ctrl + X · C · V · D", "ตัด · คัดลอก · วาง · ทำซ้ำ (D)"],
  ["⌘/Ctrl + G", "จัดกลุ่ม (Shift = แยกกลุ่ม)"],
  ["⌘/Ctrl + ] · [", "ขึ้น / ลงหนึ่งชั้น (ลำดับซ้อน)"],
  ["⌘/Ctrl + Shift + ] · [", "ไปบนสุด / ไปล่างสุด"],
  ["Tab / Shift + Tab", "เลือก element ถัดไป / ก่อนหน้า"],
  ["ลูกศร", "ขยับรายการที่เลือก 0.5 mm (Shift = 5 mm)"],
  ["Delete / Backspace", "ลบรายการที่เลือก"],
  ["⌘/Ctrl + +  /  −", "ซูมเข้า / ออก"],
  ["Esc", "ยกเลิกการเลือก"],
];

const Z_NOTICE = {
  front: "ย้ายไปบนสุดแล้ว",
  forward: "ขึ้นหนึ่งชั้นแล้ว",
  backward: "ลงหนึ่งชั้นแล้ว",
  back: "ย้ายไปล่างสุดแล้ว",
};

function DisplayRow({ label, children }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Segment({ value, onChange, options }) {
  return <ToggleGroup value={value} onValueChange={onChange} options={options} />;
}

const PANEL_TABS = [
  ["props", "คุณสมบัติ", "sliders"],
  ["page", "หน้า", "page"],
  ["data", "ข้อมูล", "table"],
  ["explorer", "โครงสร้าง", "layers"],
];

/** ข้อความสั้นสำหรับต้นไม้: {{ customer.name }} → [name] เหมือนบนกระดาษ */
const designText = (t) => String(t ?? "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, e) => `[${fieldBracketLabel(e)}]`);

/** ช่องเปลี่ยนชื่อในแถวเลเยอร์ — Enter/คลิกออก = บันทึก · Esc = ยกเลิก · ว่าง = กลับเป็นชื่อเริ่มต้น */
function RenameInput({ initial, placeholder, onDone }) {
  const ref = useRef(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (value) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  return (
    <Input
      ref={ref}
      defaultValue={initial}
      placeholder={placeholder}
      aria-label="ชื่อ"
      className="h-6 rounded px-1.5 text-[12.5px] font-semibold"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(e.currentTarget.value);
        if (e.key === "Escape") finish(null);
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  );
}

/** ต้นไม้เลเยอร์แบบ Figma — band เป็นชั้นบนสุด, กรอบและกลุ่มเป็นพ่อที่พับ/กางได้ */
function ReportExplorerTree({ sortedIdx, template, bandIdx, selIdxs, onSelectBand, onSelectEls, onRemoveBand, canRemoveBand, addable, onAddBand, renaming, onRenaming, onRenameFrame, onRenameGroup }) {
  const [closed, setClosed] = useState(() => new Set()); // key ของ band/กรอบ/กลุ่มที่พับไว้
  const activeRef = useRef(null);
  const band = template.bands[bandIdx];
  const tree = useMemo(() => (band ? buildLayerTree(band.elements) : []), [band]);

  // เลือกจากกระดาษ → กาง band และพ่อของรายการนั้นให้เห็น แล้วเลื่อนไปหา
  useEffect(() => {
    const open = new Set([`b${bandIdx}`]);
    const walk = (nodes, path) => {
      for (const n of nodes) {
        const here = [...path, `${bandIdx}:${n.key}`];
        if (n.ei != null && selIdxs.includes(n.ei)) path.forEach((k) => open.add(k));
        walk(n.children, here);
      }
    };
    walk(tree, []);
    setClosed((cur) => {
      const next = new Set([...cur].filter((k) => !open.has(k)));
      return next.size === cur.size ? cur : next;
    });
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [bandIdx, selIdxs, tree]);

  const toggle = (k) =>
    setClosed((cur) => {
      const next = new Set(cur);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  const renderNode = (bi, node, depth, parentSel) => {
    const els = template.bands[bi].elements;
    const idxs = nodeIndexes(node);
    const own = node.kind === "group" ? idxs : [node.ei];
    const selected = !parentSel && bi === bandIdx && own.every((i) => selIdxs.includes(i));
    const key = `${bi}:${node.key}`;
    const hasKids = node.children.length > 0;
    const open = !closed.has(key);
    const el = node.ei != null ? els[node.ei] : null;
    const icon = node.kind === "frame" ? "frame" : node.kind === "group" ? "groupBox" : KIND_OF_TYPE[el.type] ?? "rect";
    const label =
      node.kind === "frame"
        ? frameLabel(el)
        : node.kind === "group"
          ? groupLabel(els, node.group)
          : el.type === "text"
            ? designText(el.text) || KIND_LABELS.text
            : KIND_LABELS[el.type] ?? el.type;
    const nameable = node.kind !== "el";
    const isRenaming = nameable && renaming === key;
    const commitName = (value) => {
      onRenaming(null);
      if (value == null) return;
      if (node.kind === "frame") onRenameFrame(bi, node.ei, value);
      else onRenameGroup(bi, node.group, value);
    };
    return (
      <li key={node.key}>
        <div
          ref={selected ? activeRef : undefined}
          className={`group/row flex h-7 items-center rounded-md pr-1.5 text-[12.5px] ${
            selected ? "bg-accent-soft font-medium" : parentSel ? "bg-accent-soft/45" : "hover:bg-muted"
          }`}
          style={{ paddingLeft: 4 + depth * 14 }}
        >
          <button
            type="button"
            className={`grid size-4 shrink-0 place-items-center text-muted-foreground ${hasKids ? "" : "invisible"}`}
            onClick={() => toggle(key)}
            aria-label={open ? "พับ" : "กาง"}
            aria-expanded={open}
            tabIndex={hasKids ? 0 : -1}
          >
            <Icon name="chevron" size={12} className={open ? "" : "-rotate-90"} />
          </button>
          {isRenaming ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 pl-1">
              <Icon name={icon} size={14} className="shrink-0 text-primary" />
              <RenameInput initial={node.kind === "frame" ? el.name ?? "" : label === "กลุ่ม" ? "" : label} placeholder={node.kind === "frame" ? "กรอบ" : "กลุ่ม"} onDone={commitName} />
            </div>
          ) : (
            <button
              type="button"
              className="flex h-full min-w-0 flex-1 items-center gap-2 pl-1 text-left"
              onClick={(e) => onSelectEls(bi, own, e.shiftKey || e.metaKey || e.ctrlKey)}
              onDoubleClick={nameable ? () => onRenaming(key) : undefined}
              title={nameable ? "ดับเบิลคลิกเพื่อเปลี่ยนชื่อ" : "Shift/⌘-คลิก เลือกหลายรายการ"}
            >
              <Icon name={icon} size={14} className={`shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`min-w-0 flex-1 truncate ${nameable ? "font-semibold" : ""}`}>{label}</span>
            </button>
          )}
        </div>
        {hasKids && open && <ul>{node.children.map((c) => renderNode(bi, c, depth + 1, parentSel || selected))}</ul>}
      </li>
    );
  };

  return (
    <>
      <PanelHeader icon="layers" title="เลเยอร์" subtitle={`${sortedIdx.length} band`} />
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-px p-2">
        {sortedIdx.map(({ b, i: bi }) => {
          const active = bi === bandIdx;
          const k = `b${bi}`;
          const open = active && !closed.has(k);
          return (
            <li key={bi} className="min-w-0">
              <div className={`group flex h-8 items-center gap-1 rounded-md pl-1 pr-1 ${active ? "bg-muted" : "hover:bg-muted"}`}>
                <button
                  type="button"
                  className={`grid size-4 shrink-0 place-items-center text-muted-foreground ${b.elements.length ? "" : "invisible"}`}
                  onClick={() => (active ? toggle(k) : onSelectBand(bi, null))}
                  aria-label={open ? "พับ" : "กาง"}
                  aria-expanded={open}
                >
                  <Icon name="chevron" size={12} className={open ? "" : "-rotate-90"} />
                </button>
                <button type="button" className="flex h-full min-w-0 flex-1 items-center gap-2 pl-1 text-left" onClick={() => onSelectBand(bi, null)}>
                  <Icon name="band" size={14} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{bandTitle(b)}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground group-hover:hidden">{BAND_STD[b.type] ?? b.type}</span>
                </button>
                {canRemoveBand && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="hidden size-6 hover:bg-destructive/10 hover:text-destructive group-hover:inline-flex"
                    title="ลบ band"
                    aria-label={`ลบ ${bandTitle(b)}`}
                    onClick={() => onRemoveBand(bi)}
                  >
                    <Icon name="trash" />
                  </Button>
                )}
              </div>
              {open && tree.length > 0 && <ul className="grid grid-cols-[minmax(0,1fr)] py-0.5">{tree.map((n) => renderNode(bi, n, 1, false))}</ul>}
            </li>
          );
        })}
      </ul>
      {addable?.length > 0 && (
        <div className="border-t border-border p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">เพิ่ม band</div>
          <div className="flex flex-wrap gap-1.5">
            {addable.map((t) => (
              <Button key={t} variant="outline" size="sm" onClick={() => onAddBand(t)}>
                <Icon name="plus" /> {BAND_LABELS[t]}
              </Button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** แถบจัดวางลอยเหนือกระดาษเมื่อเลือกตั้งแต่ 2 รายการขึ้นไป */
const ALIGN_ICON = {
  left: "alignLeft",
  hcenter: "alignHCenter",
  right: "alignRight",
  top: "alignTop",
  vcenter: "alignVCenter",
  bottom: "alignBottom",
  distH: "distH",
  distV: "distV",
  sameW: "sameW",
  sameH: "sameH",
};

function SelectionBar({ count, grouped, onAlign, onGroup, onUngroup, onDelete, onReorder }) {
  const [group, align] = [ALIGN_ACTIONS.slice(0, 6), ALIGN_ACTIONS.slice(6)];
  return (
    <div
      className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-background p-1 shadow-lg"
      role="toolbar"
      aria-label="จัดวางรายการที่เลือก"
    >
      <span className="px-2 text-xs font-semibold text-primary">{count} รายการ</span>
      <Separator orientation="vertical" />
      {group.map((a) => (
        <Button key={a.id} variant="ghost" size="icon-sm" onClick={() => onAlign(a.id)} title={a.title} aria-label={a.label}>
          <Icon name={ALIGN_ICON[a.id]} />
        </Button>
      ))}
      <Separator orientation="vertical" />
      {align.map((a) => (
        <Button key={a.id} variant="ghost" size="icon-sm" onClick={() => onAlign(a.id)} title={a.title} aria-label={a.label}>
          <Icon name={ALIGN_ICON[a.id]} />
        </Button>
      ))}
      <Separator orientation="vertical" />
      <Button variant="ghost" size="sm" onClick={grouped ? onUngroup : onGroup} title={grouped ? "แยกกลุ่ม (⌘/Ctrl+Shift+G)" : "จัดกลุ่ม (⌘/Ctrl+G)"}>
        <Icon name={grouped ? "ungroup" : "group"} /> {grouped ? "แยกกลุ่ม" : "จัดกลุ่ม"}
      </Button>
      <Separator orientation="vertical" />
      <ZOrderButtons onReorder={onReorder} compact />
      <Button variant="ghost" size="icon-sm" className="hover:bg-destructive/10 hover:text-destructive" onClick={onDelete} title="ลบทั้งหมดที่เลือก (Delete)" aria-label="ลบรายการที่เลือก">
        <Icon name="trash" />
      </Button>
    </div>
  );
}

/** index ของรายการที่เลือกทั้งหมดใน band (เรียง, ไม่ซ้ำ, ไม่เกินจำนวนจริง) */
function selIndexes(ei, extra, n) {
  if (ei == null) return [];
  return [...new Set([ei, ...extra])].filter((i) => i < n).sort((a, b) => a - b);
}

const PROBLEM_MSG = {
  missing: "ตัวแปรไม่พบในข้อมูล",
  unsupported: "นิพจน์หรือตัวกรองยังไม่รองรับใน engine",
  aggregate: "ใช้รวมค่าได้เฉพาะ band หัวกลุ่ม ท้ายกลุ่ม หรือสรุป",
  norows: "ยังไม่มีแถวข้อมูลในชุดนี้ — ตรวจไม่ครบ",
  embed: "รูปยังไม่ฝังในเทมเพลต — อัปโหลด PNG/JPEG (ลิงก Figma ใช้โดยตรงไม่ได้)",
};
const PROBLEM_SEV = { missing: "error", unsupported: "warning", aggregate: "warning", norows: "info", embed: "warning" };

function problemRows(problems) {
  return problems.map((p, i) => ({
    id: `${p.expr}-${p.source ?? ""}-${i}`,
    code: `TR${String(100 + i).slice(-3)}`,
    message: PROBLEM_MSG[p.reason] ?? p.reason,
    severity: PROBLEM_SEV[p.reason] ?? "warning",
    expr: p.expr,
    count: p.count,
    place: p.places[0],
  }));
}

const SEV_STYLE = { error: "text-red-600", warning: "text-amber-600", info: "text-sky-600" };

function DesignAnalyzer({ problems, filter, onFilter, onJump, placeLabel, onClose }) {
  const rows = useMemo(() => problemRows(problems), [problems]);
  const counts = useMemo(() => {
    const c = { all: rows.length, error: 0, warning: 0, info: 0 };
    for (const r of rows) c[r.severity] += 1;
    return c;
  }, [rows]);
  const shown = filter === "all" ? rows : rows.filter((r) => r.severity === filter);

  return (
    <div className="flex max-h-56 shrink-0 flex-col border-t border-border bg-background">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <strong className="text-[13px]">ตรวจการออกแบบ</strong>
        <Tabs
          className="h-7 [&>button]:px-2 [&>button]:text-xs"
          label="กรองตามระดับ"
          value={filter}
          onValueChange={onFilter}
          items={[
            ["all", "ทั้งหมด"],
            ["error", "ข้อผิดพลาด"],
            ["warning", "คำเตือน"],
            ["info", "ข้อมูล"],
          ].map(([value, label]) => ({ value, label: `${label} ${counts[value]}` }))}
        />
        <div className="flex-1" />
        <Button variant="ghost" size="icon-sm" onClick={onClose} title="ย่อแผง" aria-label="ย่อแผงตรวจการออกแบบ">
          <Icon name="x" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {shown.length === 0 ? (
          <p className="flex items-center gap-1.5 px-4 py-3 text-xs text-muted-foreground">
            <Icon name="check" size={14} className="text-emerald-600" /> ไม่มีรายการ
          </p>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 font-semibold">รหัส</th>
                <th className="px-3 py-1.5 font-semibold">ข้อความ</th>
                <th className="px-3 py-1.5 font-semibold">ตัวแปร</th>
                <th className="px-3 py-1.5 font-semibold">แหล่ง</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/50">
                  <td className={`px-3 py-1.5 font-mono font-semibold ${SEV_STYLE[r.severity]}`}>{r.code}</td>
                  <td className="px-3 py-1.5">{r.message}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{r.expr}{r.count > 1 ? ` ×${r.count}` : ""}</td>
                  <td className="px-3 py-1.5">
                    {r.place ? (
                      <button type="button" className="font-medium text-primary hover:underline" onClick={() => onJump(r.place.band, r.place.el)}>
                        {placeLabel(r.place)}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ShortcutHelp({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="absolute right-0 top-10 z-30 w-80 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg" role="dialog" aria-label="คีย์ลัด">
      <div className="mb-2 text-[13px] font-semibold">คีย์ลัด</div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        {SHORTCUTS.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{k}</kbd>
            </dt>
            <dd className="m-0 self-center text-muted-foreground">{v}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}

export function ReportDesigner({ initialTemplate, initialData }) {
  // เมื่อฝังด้วย initialTemplate ไม่ใช้/ไม่เขียนฉบับร่าง เพื่อไม่ทับงานของแอปที่เรียกใช้
  const [draft] = useState(() => (initialTemplate ? null : loadDraft()));
  const [doc, dispatch] = useReducer(
    historyReducer,
    null,
    () => initialHistory(initialTemplate ?? draft?.template ?? initial.template, initialData ?? draft?.data ?? initial.data),
  );
  const { template, data } = doc;

  const [sampleId, setSampleId] = useState(`std:${initial.id}`); // id ของโครงสร้างที่ใช้อยู่
  const [activeName, setActiveName] = useState(draft?.name ?? initial.label);
  const [savedAt, setSavedAt] = useState(draft?.savedAt ?? null);
  const [userStructs, setUserStructs] = useState(() => loadUserStructures());
  const [bandIdx, setBandIdx] = useState(0);
  const [selEl, setSelEl] = useState(null); // รายการหลัก (รายการที่คลิกล่าสุด)
  const [extraSel, setExtraSel] = useState([]); // รายการที่เลือกเพิ่มในband เดียวกัน (Shift/⌘-คลิก)
  const clipRef = useRef(null); // element ที่คัดลอกไว้ (Ctrl/⌘+C)
  const [hasClip, setHasClip] = useState(false);
  const [view, setView] = useState("design"); // "design" | "preview"
  const [rightTab, setRightTab] = useState("props"); // "props" | "page" | "data"
  const [textScale, setTextScale] = useState(1);
  const [zoomMode, setZoomMode] = useState("fit");
  const [previewZoom, setPreviewZoom] = useState(1);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [previewW, setPreviewW] = useState(0);
  const { ready, initError, rendering, renderError, pdf, stats, dirty, retry: retryPreview } =
    usePreviewEngine(doc, view);
  const [notice, setNotice] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [sampleRows, setSampleRows] = useState(1); // แถว placeholder ในตารางบนกระดาษ (ไม่ใช่ข้อมูลจริง)
  const [tableMode, setTableMode] = useState("compact"); // "compact" = ย่อความสูงตาราง · "actual" = ตามจำนวนแถวจริง
  const [showDisplay, setShowDisplay] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showAnalyzer, setShowAnalyzer] = useState(false);
  const [editing, setEditing] = useState(null); // { bi, ei } ข้อความที่กำลังแก้บนกระดาษ
  const [ctxMenu, setCtxMenu] = useState(null);
  const [renaming, setRenaming] = useState(null); // "<band>:<node key>" ที่กำลังเปลี่ยนชื่อในแผงเลเยอร์ // { x, y, bi, ei, mmX, mmY } เมนูคลิกขวา
  const closeCtx = useCallback(() => setCtxMenu(null), []);
  const [analyzerFilter, setAnalyzerFilter] = useState("all");

  const latestRef = useRef(doc);
  latestRef.current = doc;
  const importRef = useRef(null);
  const stageRef = useRef(null);
  const previewRef = useRef(null);

  const page = useMemo(() => pageSize(template), [template]);
  const m = useMemo(() => margins(template), [template]);
  const band = template.bands[bandIdx];
  const selected = selEl != null ? band?.elements[selEl] : null;
  const selIdxs = useMemo(() => selIndexes(selEl, extraSel, band?.elements.length ?? 0), [selEl, extraSel, band]);
  // ชุดที่คำสั่ง คัดลอก/ตัด/ลบ/ลำดับซ้อน ทำงานด้วย = ที่เลือก + ของในกรอบที่เลือก
  const opIdxs = useMemo(() => (band ? withFrameChildren(band.elements, selIdxs) : []), [band, selIdxs]);
  const selGroupId = (() => {
    const gid = selIdxs.length > 1 ? band?.elements[selIdxs[0]]?.group : null;
    return gid && band.elements.every((e, i) => (e.group === gid) === selIdxs.includes(i)) ? gid : null;
  })();
  const selGroup = selIdxs.length > 1 && selIdxs.every((i) => band.elements[i].group && band.elements[i].group === band.elements[selIdxs[0]].group);
  const cw = contentWidth(template);

  // ---- ขนาดการแสดงผล --------------------------------------------------------
  const fitS = useMemo(() => {
    if (!stageSize.w) return BASE_PX_PER_MM;
    return Math.max(MIN_ZOOM, (stageSize.w - RULER_W - TAG_W - 96) / page.w);
  }, [stageSize, page]);
  const S = (zoomMode === "fit" ? fitS : BASE_PX_PER_MM * zoomMode);
  const zoomNow = zoomMode === "fit" ? fitS / BASE_PX_PER_MM : zoomMode;

  const stepZoom = useCallback(
    (dir) => {
      setZoomMode((cur) => {
        const now = cur === "fit" ? fitS / BASE_PX_PER_MM : cur;
        return dir > 0
          ? ZOOM_STEPS.find((z) => z > now + 0.001) ?? ZOOM_STEPS.at(-1)
          : [...ZOOM_STEPS].reverse().find((z) => z < now - 0.001) ?? ZOOM_STEPS[0];
      });
    },
    [fitS],
  );

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0) setStageSize({ w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setPreviewW(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  // ฟิลด์ข้อมูลและการผูกกับเทมเพลต — คำนวณใหม่เมื่อ template หรือข้อมูลเปลี่ยน
  const catalog = useMemo(() => buildCatalog(data), [data]);
  const analysis = useMemo(() => analyzeTemplate(template, data), [template, data]);
  const problemCount = analysis.problems.filter((p) => ["missing", "unsupported", "aggregate", "embed"].includes(p.reason)).length;

  useEffect(() => {
    if (analysis.problems.length > 0) setShowAnalyzer(true);
  }, [analysis.problems.length]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(""), 2400);
    return () => clearTimeout(t);
  }, [notice]);

  // บันทึกฉบับร่างหลังหยุดแก้ไขครู่หนึ่ง — พื้นที่เต็มหรือโหมดส่วนตัวของเบราว์เซอร์ให้ข้ามไปเฉยๆ
  useEffect(() => {
    if (initialTemplate) return undefined;
    const t = setTimeout(() => {
      const at = Date.now();
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ template, data, name: activeName, savedAt: at }));
        setSavedAt(at);
      } catch {
        /* ไม่ขัดจังหวะการทำงาน */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [template, data, activeName, initialTemplate]);

  // ---- actions -------------------------------------------------------------
  /**
   * เลือก element — additive (Shift/⌘-คลิก) สลับการเลือกรายการนั้นใน band เดียวกัน
   * คลิกปกติจะเลือกทั้งกลุ่มที่ element นั้นอยู่ด้วย
   */
  function selectBand(bi, ei, additive = false) {
    if (ei == null) {
      setBandIdx(bi);
      setSelEl(null);
      setExtraSel([]);
      return;
    }
    if (additive && bi === bandIdx && selEl != null) {
      if (selIdxs.includes(ei)) {
        const rest = selIdxs.filter((i) => i !== ei);
        setSelEl(rest.length ? rest[rest.length - 1] : null);
        setExtraSel(rest.slice(0, -1));
      } else {
        setSelEl(ei);
        setExtraSel(selIdxs);
      }
      return;
    }
    const els = template.bands[bi]?.elements ?? [];
    setBandIdx(bi);
    setSelEl(ei);
    setExtraSel(groupMembers(els, ei).filter((i) => i !== ei));
    // เปิดแผงเลเยอร์อยู่ = คงไว้ ให้เห็นว่ารายการที่เลือกอยู่ตรงไหนในต้นไม้
    setRightTab((t) => (t === "explorer" ? t : "props"));
  }

  /**
   * เลือกตรงตามรายการ (จากแผงเลเยอร์) — ไม่ขยายเป็นทั้งกลุ่มเหมือนคลิกบนกระดาษ
   * additive = Shift/⌘-คลิก: เพิ่ม/เอาออกจากชุดที่เลือก (ใน band เดียวกัน)
   */
  function selectExact(bi, idxs, additive = false) {
    let next = idxs;
    if (additive && bi === bandIdx) {
      const cur = new Set(selIdxs);
      const allIn = idxs.every((i) => cur.has(i));
      idxs.forEach((i) => (allIn ? cur.delete(i) : cur.add(i)));
      next = [...cur];
    }
    setBandIdx(bi);
    setSelEl(next.length ? next[next.length - 1] : null);
    setExtraSel(next.slice(0, -1));
    if (next.length) setRightTab((t) => (t === "explorer" ? t : "props"));
  }

  /** จัดวางรายการที่เลือกตามคำสั่ง (ชิดซ้าย/กึ่งกลาง/เว้นระยะ ฯลฯ) */
  function alignSelection(mode) {
    const changes = alignChanges(band.elements, selIdxs, mode, selEl, cw);
    if (!changes.length) {
      setNotice(mode.startsWith("dist") ? "เว้นระยะต้องเลือกอย่างน้อย 3 รายการ" : "ไม่มีการเปลี่ยนแปลง");
      return;
    }
    dispatch({ type: "patchEls", band: bandIdx, changes, record: true });
  }

  /** จัดกลุ่มรายการที่เลือก (ยกเลิกกลุ่มเมื่อ ungroup = true) — กลุ่มจะถูกเลือกพร้อมกันทุกครั้งที่คลิก */
  function groupSelection(ungroup = false) {
    if (selIdxs.length < 2 && !ungroup) return;
    const gid = ungroup ? undefined : newGroupId();
    const name = ungroup ? undefined : nextGroupName(template); // ชื่อเริ่มต้นแบบ Figma "กลุ่ม N"
    dispatch({ type: "patchEls", band: bandIdx, changes: selIdxs.map((ei) => ({ ei, patch: { group: gid, group_name: name } })), record: true });
    setNotice(ungroup ? "แยกกลุ่มแล้ว" : `สร้าง “${name}” (${selIdxs.length} รายการ)`);
  }

  // ---- ชื่อกรอบ / กลุ่ม ----------------------------------------------------------------
  function renameFrame(bi, ei, name) {
    const el = template.bands[bi]?.elements[ei];
    if (!el || (el.name ?? undefined) === cleanName(name)) return;
    dispatch({ type: "patchEl", band: bi, el: ei, patch: { name: cleanName(name) }, record: true });
  }

  function renameGroup(bi, gid, name) {
    const els = template.bands[bi]?.elements ?? [];
    const changes = els.flatMap((e, ei) => (e.group === gid ? [{ ei, patch: { group_name: cleanName(name) } }] : []));
    if (!changes.length || groupLabel(els, gid) === (cleanName(name) ?? "กลุ่ม")) return;
    dispatch({ type: "patchEls", band: bi, changes, record: true });
  }

  /** แยกกลุ่มทั้งกลุ่ม (ทุกสมาชิกใน band) ไม่ใช่เฉพาะที่เลือก */
  function ungroupAll(bi, gid) {
    const els = template.bands[bi]?.elements ?? [];
    const changes = els.flatMap((e, ei) => (e.group === gid ? [{ ei, patch: { group: undefined, group_name: undefined } }] : []));
    if (!changes.length) return;
    dispatch({ type: "patchEls", band: bi, changes, record: true });
    setNotice(`แยก “${groupLabel(els, gid)}” แล้ว`);
  }

  /** เปิดช่องเปลี่ยนชื่อในแผงเลเยอร์ (จากเมนูคลิกขวา) */
  function startRename(bi, nodeKey) {
    setRightTab("explorer");
    setRenaming(`${bi}:${nodeKey}`);
  }

  /** คัดลอก element สำหรับวาง/ทำซ้ำ — กลุ่มเดิมได้ id ใหม่เพื่อไม่ปนกับกลุ่มบนกระดาษ */
  function cloneForPaste(elements) {
    const gidMap = new Map();
    return elements.map((e) => {
      const next = { ...e };
      if (next.group) {
        if (!gidMap.has(next.group)) gidMap.set(next.group, newGroupId());
        next.group = gidMap.get(next.group);
      }
      return next;
    });
  }

  /** วางสำเนา element ที่คัดลอกไว้ — ไปที่ band ที่ถูกกติกา (ตาราง/ใต้ตาราง) อัตโนมัติ */
  function pasteElements(elements) {
    if (!elements?.length) return;
    const plan = planPlacement(template, bandIdx, elements[0].type);
    if (plan.error) return setNotice(plan.error);
    const clones = cloneForPaste(elements);
    const start = template.bands[plan.band].elements.length;
    dispatch({ type: "addEls", band: plan.band, elements: clones, offset: 3, keepGroup: true });
    setBandIdx(plan.band);
    setSelEl(start + clones.length - 1);
    setExtraSel(Array.from({ length: clones.length - 1 }, (_, k) => start + k));
    setRightTab("props");
    setNotice(clones.length > 1 ? `วาง ${clones.length} รายการแล้ว` : "วางสำเนาแล้ว");
  }

  function duplicateSelection() {
    if (!selIdxs.length) return;
    pasteElements(opIdxs.map((i) => ({ ...band.elements[i] })));
  }

  /** ใช้โครงสร้าง (undo ได้); ข้อมูลตัวอย่างเปลี่ยนตามโครงสร้างมาตรฐานเท่านั้น */
  /** ข้อความแจ้งเพิ่มเติมเมื่อโหลดเทมเพลตที่มี element ค้างใน band ตาราง (ย้ายให้อัตโนมัติ) */
  function strayNote(raw) {
    const n = countStrays(raw);
    return n ? ` · ย้าย ${n} element ออกจาก band ตารางไปไว้ band สรุปแล้ว` : "";
  }

  function applyStructure(st) {
    dispatch({ type: "load", template: st.template, data: st.data ?? data });
    setSampleId(st.id);
    setActiveName(st.name);
    setBandIdx(0);
    setSelEl(null);
    setNotice(`ใช้โครงสร้าง “${st.name}”${strayNote(st.template)}`);
  }

  function applyById(id) {
    const st = [...STANDARD_STRUCTURES, ...userStructs].find((x) => x.id === id);
    if (st) applyStructure(st);
  }

  function saveStructure(name) {
    const st = makeUserStructure(name, template);
    const list = [...userStructs, st];
    setUserStructs(list);
    saveUserStructures(list);
    setSampleId(st.id);
    setActiveName(st.name);
    setNotice(`บันทึกโครงสร้าง “${st.name}” แล้ว`);
  }

  function deleteStructure(id) {
    const st = userStructs.find((x) => x.id === id);
    if (!st) return;
    const list = userStructs.filter((x) => x.id !== id);
    setUserStructs(list);
    saveUserStructures(list);
    setNotice(`ลบโครงสร้าง “${st.name}” แล้ว (เอกสารปัจจุบันยังอยู่)`);
    setSampleId("custom");
    setActiveName("เอกสารปัจจุบัน");
  }

  function exportStructure() {
    const st = { name: activeName, template };
    const blob = new Blob([structureFileText(st)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${activeName}.structure.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setNotice("ส่งออกโครงสร้างแล้ว");
  }

  function importStructure(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseStructureFile(reader.result, file.name.replace(/\.json$/i, ""));
        const st = makeUserStructure(parsed.name, parsed.template);
        const list = [...userStructs, st];
        setUserStructs(list);
        saveUserStructures(list);
        dispatch({ type: "load", template: st.template, data });
        setSampleId(st.id);
        setActiveName(st.name);
        setBandIdx(0);
        setSelEl(null);
        setNotice(`นำเข้าโครงสร้าง “${st.name}”${strayNote(parsed.template)}`);
      } catch (err) {
        setNotice(`ไฟล์โครงสร้างไม่ถูกต้อง: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  /** แก้ element ที่เลือก — live = การพิมพ์/ลากต่อเนื่อง (รวมเป็น undo ขั้นเดียวต่อช่อง) */
  function setEl(patch, live = false) {
    const key = live ? `el:${bandIdx}:${selEl}:${Object.keys(patch).sort().join(",")}` : undefined;
    dispatch({ type: "patchEl", band: bandIdx, el: selEl, patch, record: true, key });
  }

  function setBandPatch(patch, live = false) {
    const key = live ? `band:${bandIdx}:${Object.keys(patch).sort().join(",")}` : undefined;
    dispatch({ type: "patchBand", band: bandIdx, patch, record: true, key });
  }

  /** แก้ข้อมูลตัวอย่าง — live = พิมพ์ JSON (รวมเป็น undo ขั้นเดียว) · false = นำเข้า/ดึงข้อมูล (ขั้นใหม่) */
  function setData(next, live = false, key = "data:json") {
    dispatch({ type: "setData", data: next, record: true, key: live ? key : undefined });
  }

  /** จับคู่ฟิลด์ทั้ง template เป็นขั้น undo เดียว */
  function replaceTemplate(next) {
    dispatch({ type: "replaceTemplate", template: next });
  }

  function addElement(kind) {
    const element = newElement(kind);
    if (!element || !band) return;
    const plan = planPlacement(template, bandIdx, element.type);
    if (plan.error) {
      setNotice(plan.error);
      return;
    }
    dispatch({ type: "addEl", band: bandIdx, element });
    if (element.type === "table" && band.type === "detail") {
      setNotice("เพิ่มตารางแล้ว · band สรุป (Report Footer) อยู่ใต้ Detail — ใส่ยอดรวม / ข้อความท้ายที่นั้น");
    }
    if (plan.band !== bandIdx) setNotice("วางไว้ใน band สรุปใต้ตาราง (ตารางต้องอยู่ band ของตัวเองลำพัง)");
    setBandIdx(plan.band);
    setSelEl(plan.elIndex);
    setRightTab("props");
  }

  /** ย้าย element ที่เลือกไป band อื่น (ใช้ได้ทั้งย้ายไป band ใต้ตาราง และ band อื่นทั่วไป) */
  function moveSelectedTo(toBand) {
    if (selEl == null || toBand === bandIdx) return;
    const plan = planMove(template, bandIdx, selEl, toBand);
    if (plan.error) {
      setNotice(plan.error);
      return;
    }
    dispatch({ type: "transferEl", fromBand: bandIdx, fromEl: selEl, toBand, x: selected.x, y: selected.y, record: true });
    setBandIdx(plan.band);
    setSelEl(plan.elIndex);
    if (plan.band !== toBand) setNotice("ย้ายไปไว้ band สรุปใต้ตาราง (ตารางต้องอยู่ band ของตัวเองลำพัง)");
  }
  function addBand(type) {
    dispatch({ type: "addBand", bandType: type });
    const bands = [...template.bands, { type }].sort((a, b) => bandRank(a.type) - bandRank(b.type));
    const idx = bands.findIndex((b) => b.type === type);
    setBandIdx(idx);
    setSelEl(null);
    setNotice(`เพิ่ม ${BAND_LABELS[type]} แล้ว`);
  }

  function removeBand(idx = bandIdx) {
    const i = idx ?? bandIdx;
    if (!template.bands[i]) return;
    if (template.bands.length <= 1) {
      setNotice("ต้องเหลือ band อย่างน้อย 1");
      return;
    }
    dispatch({ type: "removeBand", band: i });
    const nextIdx = Math.max(0, Math.min(i, template.bands.length - 2));
    setBandIdx(nextIdx);
    setSelEl(null);
    setExtraSel([]);
    setNotice("ลบ band แล้ว");
  }

  /** ย้ายลำดับซ้อนของรายการที่เลือก (ไปบนสุด/ขึ้น/ลง/ไปล่างสุด) — เลือกรายการเดิมต่อไปหลังย้าย */
  function reorderSelected(mode) {
    const els = template.bands[bandIdx]?.elements ?? [];
    if (!selIdxs.length) return;
    // กรอบย้ายชั้นพร้อมของข้างใน ของข้างในจึงยังอยู่เหนือกรอบ
    const idxs = withFrameChildren(els, selIdxs);
    const { order } = zOrderPlan(els.length, idxs, mode);
    if (order.every((v, i) => v === i)) {
      setNotice(mode === "front" || mode === "forward" ? "อยู่บนสุดแล้ว" : "อยู่ล่างสุดแล้ว");
      return;
    }
    dispatch({ type: "reorderEls", band: bandIdx, indexes: idxs, mode });
    const primary = order.indexOf(selEl);
    setSelEl(primary);
    setExtraSel(selIdxs.map((i) => order.indexOf(i)).filter((i) => i !== primary));
    setNotice(Z_NOTICE[mode]);
  }

  function removeSelected() {
    if (!selIdxs.length) return;
    dispatch({ type: "removeEls", band: bandIdx, indexes: opIdxs });
    setSelEl(null);
    setExtraSel([]);
  }

  function copySelection() {
    if (!selIdxs.length) return;
    clipRef.current = opIdxs.map((i) => ({ ...band.elements[i] }));
    setHasClip(true);
    setNotice(`คัดลอก ${opIdxs.length} รายการ`);
  }

  function cutSelection() {
    if (!selIdxs.length) return;
    clipRef.current = opIdxs.map((i) => ({ ...band.elements[i] }));
    setHasClip(true);
    removeSelected();
    setNotice(`ตัด ${clipRef.current.length} รายการ`);
  }

  function selectAllIn(bi) {
    const n = template.bands[bi]?.elements.length ?? 0;
    setBandIdx(bi);
    setSelEl(n ? n - 1 : null);
    setExtraSel(Array.from({ length: Math.max(0, n - 1) }, (_, k) => k));
  }

  /** เพิ่ม element ที่ตำแหน่งที่คลิกขวา — ข้อความใหม่เข้าโหมดแก้ไขทันที */
  function addElementAt(kind, bi, x, y) {
    const element = newElement(kind);
    if (!element) return;
    const plan = planPlacement(template, bi, element.type);
    if (plan.error) return setNotice(plan.error);
    // คลิกขวาในกรอบ → ของใหม่พอดีด้านในกรอบ
    const fit = placeInFrame(template.bands[bi]?.elements ?? [], element, x, y);
    if (fit) Object.assign(element, { w: fit.w, h: fit.h });
    dispatch({ type: "addElAt", band: bi, element, x: fit?.x ?? x, y: fit?.y ?? y });
    if (plan.band !== bi) setNotice("วางไว้ใน band สรุปใต้ตาราง (ตารางต้องอยู่ band ของตัวเองลำพัง)");
    setBandIdx(plan.band);
    setSelEl(plan.elIndex);
    setExtraSel([]);
    setRightTab("props");
    if (element.type === "text") setEditing({ bi: plan.band, ei: plan.elIndex });
  }

  /** ดับเบิลคลิกกรอบ = พิมพ์ข้อความในกรอบทันที (ข้อความเต็มด้านในกรอบ) */
  function addTextInFrame(bi, fi) {
    const frame = template.bands[bi]?.elements[fi];
    if (!frame) return;
    const box = textBoxInFrame(frame);
    const element = { ...newElement("text"), ...box, text: "" };
    const plan = planPlacement(template, bi, "text");
    if (plan.error) return setNotice(plan.error);
    dispatch({ type: "addElAt", band: bi, element, x: box.x, y: box.y });
    setBandIdx(plan.band);
    setSelEl(plan.elIndex);
    setExtraSel([]);
    setRightTab("props");
    setEditing({ bi: plan.band, ei: plan.elIndex });
  }

  // ---- แก้ข้อความบนกระดาษ ----------------------------------------------------------
  function startEdit(bi, ei) {
    if (template.bands[bi]?.elements[ei]?.type !== "text") return;
    if (!(bi === bandIdx && selEl === ei)) selectBand(bi, ei);
    setEditing({ bi, ei });
  }

  function commitText(bi, ei, text) {
    setEditing(null);
    const el = latestRef.current.template.bands[bi]?.elements[ei];
    if (el && (el.text ?? "") !== text) dispatch({ type: "patchEl", band: bi, el: ei, patch: { text }, record: true });
  }

  // เลือกรายการอื่น = จบการแก้ข้อความ (ข้อความถูกบันทึกแล้วตอนคลิกออก)
  useEffect(() => {
    setEditing((cur) => (cur && (cur.bi !== bandIdx || cur.ei !== selEl) ? null : cur));
  }, [bandIdx, selEl]);

  /** คลิกขวา: เลือกรายการใต้เมาส์ (ถ้ายังไม่อยู่ในชุดที่เลือก) แล้วเปิดเมนู */
  function openContextMenu(e, t) {
    if (t.ei == null) selectBand(t.bi, null);
    else if (!(t.bi === bandIdx && selIdxs.includes(t.ei))) selectBand(t.bi, t.ei);
    setCtxMenu({ x: e.clientX, y: e.clientY, bi: t.bi, ei: t.ei, mmX: t.x ?? 0, mmY: t.y ?? 0 });
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${activeName}.template.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setNotice("ส่งออก template แล้ว");
  }

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const t = JSON.parse(reader.result);
        dispatch({ type: "load", template: t, data });
        setSampleId("custom");
        setActiveName(file.name.replace(/\.json$/i, ""));
        setBandIdx(0);
        setSelEl(null);
        setNotice(`นำเข้า ${file.name}${strayNote(t)}`);
      } catch (err) {
        setNotice(`ไฟล์ JSON ไม่ถูกต้อง: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  // ---- คีย์บอร์ด --------------------------------------------------------------
  useEffect(() => {
    function onKey(e) {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && (key === "=" || key === "+")) return void (e.preventDefault(), stepZoom(1));
      if (mod && key === "-") return void (e.preventDefault(), stepZoom(-1));
      if (mod && key === "z") return void (e.preventDefault(), dispatch({ type: e.shiftKey ? "redo" : "undo" }));
      if (mod && key === "y") return void (e.preventDefault(), dispatch({ type: "redo" }));
      const cur = latestRef.current.template.bands[bandIdx];
      const els = cur?.elements ?? [];
      const picked = selIndexes(selEl, extraSel, els.length);
      const idxs = withFrameChildren(els, picked);
      if (e.key === "Escape") {
        setSelEl(null);
        setExtraSel([]);
        return;
      }
      if (mod && (e.code === "BracketRight" || e.code === "BracketLeft") && idxs.length) {
        e.preventDefault();
        const up = e.code === "BracketRight";
        return void reorderSelected(e.shiftKey ? (up ? "front" : "back") : up ? "forward" : "backward");
      }
      if (mod && key === "a") {
        e.preventDefault();
        if (els.length) {
          setSelEl(els.length - 1);
          setExtraSel(Array.from({ length: els.length - 1 }, (_, k) => k));
        }
        return;
      }
      if (mod && key === "c" && idxs.length) {
        e.preventDefault();
        clipRef.current = idxs.map((i) => ({ ...els[i] }));
        setHasClip(true);
        setNotice(`คัดลอก ${idxs.length} รายการ`);
        return;
      }
      if (mod && key === "v") {
        e.preventDefault();
        pasteElements(clipRef.current?.map((el) => ({ ...el })));
        return;
      }
      if (mod && key === "x" && idxs.length) {
        e.preventDefault();
        clipRef.current = idxs.map((i) => ({ ...els[i] }));
        setHasClip(true);
        dispatch({ type: "removeEls", band: bandIdx, indexes: idxs });
        setSelEl(null);
        setExtraSel([]);
        setNotice(`ตัด ${idxs.length} รายการ`);
        return;
      }
      if (e.key === "Enter" && tag !== "BUTTON" && picked.length === 1 && els[picked[0]]?.type === "text") {
        e.preventDefault();
        setEditing({ bi: bandIdx, ei: picked[0] });
        return;
      }
      if (mod && key === "d" && idxs.length) {
        e.preventDefault();
        pasteElements(idxs.map((i) => ({ ...els[i] })));
        return;
      }
      if (mod && key === "g") {
        e.preventDefault();
        groupSelection(e.shiftKey);
        return;
      }
      if (e.key === "Tab" && els.length) {
        // Tab / Shift+Tab เลื่อนไปยัง element ถัดไป/ก่อนหน้าใน band
        e.preventDefault();
        const n = els.length;
        const next = selEl == null ? (e.shiftKey ? n - 1 : 0) : (selEl + (e.shiftKey ? -1 : 1) + n) % n;
        selectBand(bandIdx, next);
        return;
      }
      if (!idxs.length) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        dispatch({ type: "removeEls", band: bandIdx, indexes: idxs });
        setSelEl(null);
        setExtraSel([]);
        return;
      }
      const step = e.shiftKey ? 5 : 0.5;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const mv = moves[e.key];
      if (mv) {
        e.preventDefault();
        // กดลูกศรต่อเนื่องรวมเป็น undo ขั้นเดียว
        const changes = idxs.map((i) => ({ ei: i, patch: { x: els[i].x + mv[0], y: els[i].y + mv[1] } }));
        dispatch({ type: "patchEls", band: bandIdx, changes, record: true, key: `pos:${bandIdx}:${idxs.join(",")}` });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [template, bandIdx, selEl, extraSel, stepZoom]);

  // ---- สถานะ ---------------------------------------------------------------------
  const status = initError
    ? { tone: "error", text: "โหลดเอนจินไม่สำเร็จ" }
    : !ready
      ? { tone: "pending", text: "กำลังโหลดเอนจิน" }
      : renderError && view === "preview"
        ? { tone: "error", text: "มีข้อผิดพลาด" }
        : rendering
          ? { tone: "pending", text: "กำลังเรนเดอร์" }
          : view === "preview" && dirty
            ? { tone: "warn", text: "กำลังอัปเดต…" }
            : { tone: "ok", text: stats ? `พร้อม · ${stats.ms} ms` : "พร้อม" };

  const sizeName = activeName;
  const existingTypes = template.bands.map((b) => b.type);
  const addable = BAND_ORDER.filter((t) => !existingTypes.includes(t));
  const sortedIdx = useMemo(
    () => template.bands.map((b, i) => ({ b, i })).sort((a, c) => bandRank(a.b.type) - bandRank(c.b.type) || a.i - c.i),
    [template],
  );
  const previewWidthPx = Math.max(240, (previewW - 64) * previewZoom);
  const selectedFields = useMemo(() => {
    if (!selected) return null;
    const src = selected.type === "table" ? tableSourceOf(selected, band) : band?.type === "detail" ? detailSourceOf(band) : null;
    const items = src ? catalog.sources.find((x) => x.name === src)?.fields ?? [] : [];
    return { row: src ? { source: src, items } : null, scalars: catalog.scalars };
  }, [selected, band, catalog]);

  const placeLabel = useCallback(
    (place) => {
      const b = template.bands[place.band];
      return `${bandTitle(b)} · ${KIND_LABELS[place.elType] ?? place.elType} #${place.el + 1}`;
    },
    [template],
  );

  return (
    <div className="app theme-light layout-report-pro">
      <header className="[grid-area:top] flex min-w-0 items-center gap-1.5 border-b border-border bg-background px-3">
        <div className="flex shrink-0 items-center gap-2 pr-1">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-[11px] font-bold text-primary-foreground shadow-sm" aria-hidden="true">
            TR
          </span>
          <div className="hidden leading-tight 2xl:block">
            <div className="text-sm font-bold">ThaiReport</div>
            <div className="text-[11px] text-muted-foreground">Report Designer</div>
          </div>
        </div>

        <Separator orientation="vertical" />
        <StructurePicker
          standard={STANDARD_STRUCTURES}
          user={userStructs}
          activeId={sampleId}
          currentName={activeName}
          onApply={applyById}
          onSave={saveStructure}
          onDelete={deleteStructure}
          onExport={exportStructure}
          onImport={importStructure}
        />
        <Separator orientation="vertical" />

        <div className="flex shrink-0 items-center gap-0.5" role="toolbar" aria-label="แก้ไข">
          <Button variant="ghost" size="icon-sm" onClick={() => dispatch({ type: "undo" })} disabled={!doc.past.length} title={`ย้อนกลับ (${MOD}Z)`} aria-label="ย้อนกลับ">
            <Icon name="undo" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => dispatch({ type: "redo" })} disabled={!doc.future.length} title={`ทำซ้ำ (${MOD}⇧Z)`} aria-label="ทำซ้ำ">
            <Icon name="redo" />
          </Button>
          <Separator orientation="vertical" />
          <Button variant="ghost" size="icon-sm" disabled={!selIdxs.length} onClick={cutSelection} title={`ตัด (${MOD}X)`} aria-label="ตัด">
            <Icon name="cut" />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={!selIdxs.length} onClick={copySelection} title={`คัดลอก (${MOD}C)`} aria-label="คัดลอก">
            <Icon name="copy" />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={!hasClip} onClick={() => pasteElements(clipRef.current?.map((el) => ({ ...el })))} title={`วาง (${MOD}V)`} aria-label="วาง">
            <Icon name="paste" />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={!selIdxs.length} onClick={duplicateSelection} title={`ทำซ้ำรายการ (${MOD}D)`} aria-label="ทำซ้ำรายการ">
            <Icon name="duplicate" />
          </Button>
          {selIdxs.length >= 2 && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => groupSelection(selGroup)}
              title={selGroup ? `แยกกลุ่ม (${MOD}⇧G)` : `จัดกลุ่ม (${MOD}G)`}
              aria-label={selGroup ? "แยกกลุ่ม" : "จัดกลุ่ม"}
            >
              <Icon name={selGroup ? "ungroup" : "group"} />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" className="hover:bg-destructive/10 hover:text-destructive" disabled={!selIdxs.length} onClick={removeSelected} title="ลบ (Delete)" aria-label="ลบ">
            <Icon name="trash" />
          </Button>
        </div>

        <div className="min-w-2 flex-1" />
        <Tabs
          label="มุมมองรายงาน"
          value={view}
          onValueChange={setView}
          items={[
            { value: "design", label: "ออกแบบ", icon: <Icon name="pencil" /> },
            { value: "preview", label: "พรีวิว PDF", icon: <Icon name="eye" /> },
          ]}
        />
        <div className="min-w-2 flex-1" />

        <Badge variant={status.tone} role="status" title={status.text}>
          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
          <span className="hidden max-w-[9rem] truncate xl:inline">{status.text}</span>
        </Badge>
        <Badge
          variant={problemCount ? "error" : "ok"}
          onClick={() => setRightTab("data")}
          title={problemCount ? `${problemCount} ตัวแปรไม่พบในข้อมูล — คลิกเพื่อดู` : "ผูกข้อมูลครบ"}
        >
          <Icon name={problemCount ? "alert" : "check"} />
          <span className="hidden 2xl:inline">{problemCount ? "ตัวแปรไม่พบ" : "ผูกข้อมูลครบ"}</span>
          {problemCount > 0 && <span>{problemCount}</span>}
        </Badge>
        <div className="relative">
          <Button variant="ghost" size="icon-sm" onClick={() => setShowHelp((v) => !v)} title="คีย์ลัด" aria-expanded={showHelp} aria-label="คีย์ลัด">
            <Icon name="help" />
          </Button>
          {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}
        </div>
        <Separator orientation="vertical" />
        <DropdownMenu
          align="end"
          label="ไฟล์"
          trigger={(p) => (
            <Button variant="outline" size="sm" title="นำเข้า / ส่งออก Template" {...p}>
              <Icon name="file" />
              <span className="hidden lg:inline">ไฟล์</span>
              <Icon name="chevron" />
            </Button>
          )}
        >
          <MenuLabel>Template (JSON)</MenuLabel>
          <MenuItem icon={<Icon name="upload" />} onSelect={() => importRef.current?.click()}>
            นำเข้า Template…
          </MenuItem>
          <MenuItem icon={<Icon name="download" />} onSelect={exportJson}>
            ส่งออก Template
          </MenuItem>
        </DropdownMenu>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            if (e.target.files[0]) importFile(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <Button size="sm" onClick={exportJson} title="ส่งออก Template (JSON)">
          <Icon name="download" />
          <span className="hidden md:inline">ส่งออก</span>
        </Button>
      </header>

      <aside className="[grid-area:rail] flex min-h-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-background p-2" aria-label="กล่องเครื่องมือ">
        <div className="px-2 pb-1.5 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">เพิ่มองค์ประกอบ</div>
        {ADD_KINDS.map((k) => (
          <Button
            key={k.id}
            variant="ghost"
            className="h-9 w-full justify-start gap-2.5 px-2 font-medium hover:bg-accent-soft hover:text-primary [&_svg]:size-[18px] [&_svg]:text-primary"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DND_KIND, k.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => addElement(k.id)}
            disabled={!band}
            title={`${k.label} — คลิกหรือลากลงบน band ที่เลือก`}
            aria-label={k.label}
          >
            <Icon name={k.id} />
            <span className="truncate">{k.label}</span>
          </Button>
        ))}
      </aside>

      <main className="workspace">
        <nav className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border bg-background px-3" aria-label="เครื่องมือกระดาษ">
          <span className="shrink-0 whitespace-nowrap pr-1 text-[13px] font-bold">{view === "design" ? "พื้นที่ออกแบบ" : "พรีวิว PDF"}</span>
          {view === "design" && (
            <>
              <Separator orientation="vertical" />
              <Button variant="toggle" size="sm" aria-pressed={showGrid} onClick={() => setShowGrid((v) => !v)} title="แสดง/ซ่อนเส้น grid บนกระดาษ">
                <Icon name="grid" /> Grid
              </Button>
              <div className="relative">
                <Button variant="toggle" size="sm" aria-pressed={showDisplay} aria-expanded={showDisplay} onClick={() => setShowDisplay((v) => !v)}>
                  <Icon name="sliders" /> การแสดงผล <Icon name="chevron" />
                </Button>
                {showDisplay && (
                  <div className="absolute left-0 top-9 z-30 grid w-64 gap-3 rounded-lg border border-border bg-popover p-3 shadow-lg" role="dialog" aria-label="การแสดงผลหน้าออกแบบ">
                    <DisplayRow label="แถว placeholder ในตาราง">
                      <Segment value={sampleRows} onChange={setSampleRows} options={[[1, "1 แถว"], [2, "2"], [3, "3"]]} />
                    </DisplayRow>
                    <DisplayRow label="ความสูง band ตาราง">
                      <Segment value={tableMode} onChange={setTableMode} options={[["compact", "ย่อ"], ["actual", "ตามจริง"]]} />
                    </DisplayRow>
                    <DisplayRow label="ขนาดตัวอักษรบนกระดาษ">
                      <Segment value={textScale} onChange={setTextScale} options={[[1, "100%"], [0.75, "75%"], [0.5, "50%"]]} />
                    </DisplayRow>
                  </div>
                )}
              </div>
            </>
          )}
          <div className="min-w-2 flex-1" />
          {view === "design" && (
            <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-background p-0.5">
              <Button variant="ghost" size="icon-sm" onClick={() => stepZoom(-1)} title={`ซูมออก (${MOD}−)`} aria-label="ซูมออก">
                <Icon name="minus" />
              </Button>
              <NativeSelect
                className="w-[124px] [&_select]:h-7 [&_select]:border-transparent [&_select]:font-semibold [&_select]:shadow-none"
                value={zoomMode}
                onChange={(e) => setZoomMode(e.target.value === "fit" ? "fit" : Number(e.target.value))}
                aria-label="ซูม"
              >
                <option value="fit">พอดีความกว้าง</option>
                {ZOOM_STEPS.map((z) => (
                  <option key={z} value={z}>{Math.round(z * 100)}%</option>
                ))}
                {zoomMode !== "fit" && !ZOOM_STEPS.includes(zoomMode) && <option value={zoomMode}>{Math.round(zoomMode * 100)}%</option>}
              </NativeSelect>
              <Button variant="ghost" size="icon-sm" onClick={() => stepZoom(1)} title={`ซูมเข้า (${MOD}+)`} aria-label="ซูมเข้า">
                <Icon name="plus" />
              </Button>
            </div>
          )}
          <span className="hidden truncate text-xs text-muted-foreground 2xl:inline">
            {sizeName} · {page.w} × {page.h} mm · ขอบ {m.t}/{m.r}/{m.b}/{m.l}
          </span>
        </nav>

        <div className="view-stack">
          <div className="view-stack-inner">
            <div className={`stage view-pane${view === "design" ? " is-active" : ""}`} ref={stageRef} aria-hidden={view !== "design"}>
              {view === "design" && selIdxs.length > 1 && (
                <SelectionBar
                  count={selIdxs.length}
                  grouped={selGroup}
                  onAlign={alignSelection}
                  onGroup={() => groupSelection(false)}
                  onUngroup={() => groupSelection(true)}
                  onDelete={removeSelected}
                  onReorder={reorderSelected}
                />
              )}
              <BandStage
                template={template}
                data={data}
                textScale={textScale}
                sampleRows={sampleRows}
                tableMode={tableMode}
                onNotice={setNotice}
                bandIdx={bandIdx}
                selEl={selEl}
                selIdxs={selIdxs}
                onSelect={selectBand}
                dispatch={dispatch}
                onAddBand={addBand}
                onRemoveBand={removeBand}
                showGrid={showGrid}
                editing={editing}
                onStartEdit={startEdit}
                onCommitText={commitText}
                onCancelEdit={() => setEditing(null)}
                onContextMenu={openContextMenu}
                onFrameText={addTextInFrame}
                S={S}
                onWheelZoom={stepZoom}
                onPlaced={(bi, ei) => {
                  setBandIdx(bi);
                  setSelEl(ei);
                  setRightTab("props");
                }}
              />
            </div>
            <div className={`preview-wrap view-pane${view === "preview" ? " is-active" : ""}`} ref={previewRef} aria-hidden={view !== "preview"}>
              <PreviewTab
                pdf={pdf}
                error={renderError}
                rendering={rendering}
                pageWidthPx={previewWidthPx}
                stats={stats}
                onRetry={retryPreview}
              />
            </div>
          </div>
        </div>

        {view === "design" && showAnalyzer && (
          <DesignAnalyzer
            problems={analysis.problems}
            filter={analyzerFilter}
            onFilter={setAnalyzerFilter}
            onJump={(bi, ei) => selectBand(bi, ei)}
            placeLabel={placeLabel}
            onClose={() => setShowAnalyzer(false)}
          />
        )}

        <footer className="flex h-9 shrink-0 items-center gap-3 border-t border-border bg-background px-3 text-xs text-muted-foreground">
          {view === "design" ? (
            <>
              <span className="whitespace-nowrap font-mono">เนื้อหา {cw} mm · ซูม {Math.round(zoomNow * 100)}%</span>
              <Separator orientation="vertical" className="h-4" />
              <span className="truncate font-mono">{band ? `${bandTitle(band)} · ${band.elements.length} รายการ` : ""}</span>
              <div className="flex-1" />
              {savedAt && !initialTemplate && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-emerald-700" role="status" title="ฉบับร่างถูกบันทึกในเบราว์เซอร์นี้อัตโนมัติ">
                  <Icon name="check" size={13} /> บันทึกร่างเมื่อ {timeLabel(savedAt)}
                </span>
              )}
              <Button variant="toggle" size="sm" aria-pressed={showAnalyzer} onClick={() => setShowAnalyzer((v) => !v)} title="รายการที่ต้องตรวจในเทมเพลต">
                <Icon name="alert" /> ตรวจการออกแบบ
                <span className={`rounded-full px-1.5 text-[11px] ${analysis.problems.length ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}>{analysis.problems.length}</span>
              </Button>
            </>
          ) : (
            <>
              <span className="font-mono">{stats ? `${stats.pages} หน้า` : "—"}</span>
              <div className="flex items-center gap-0.5">
                {PREVIEW_ZOOMS.map((z) => (
                  <Button key={z} variant="toggle" size="sm" aria-pressed={previewZoom === z} onClick={() => setPreviewZoom(z)}>
                    {Math.round(z * 100)}%
                  </Button>
                ))}
              </div>
              <div className="flex-1" />
              <span>แก้ไขแล้วกลับมาที่พรีวิวเพื่ออัปเดต</span>
            </>
          )}
        </footer>
        {notice && <div className="toast" key={notice}>{notice}</div>}
      </main>

      <aside className="[grid-area:panel] flex min-h-0 flex-col border-l border-border bg-background" aria-label="แผงคุณสมบัติ">
        <div className="shrink-0 border-b border-border p-2">
          <div role="tablist" aria-label="แผงคุณสมบัติ" className="grid grid-cols-4 gap-0.5 rounded-lg bg-muted p-[3px]">
            {PANEL_TABS.map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={rightTab === id}
                onClick={() => setRightTab(id)}
                className={`relative inline-flex h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11.5px] font-semibold transition-colors [&_svg]:size-4 ${
                  rightTab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon name={icon} />
                <span className="max-w-full truncate leading-tight">{label}</span>
                {id === "data" && problemCount > 0 && (
                  <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-4 text-white">{problemCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rightTab === "explorer" && (
            <ReportExplorerTree
              sortedIdx={sortedIdx}
              template={template}
              bandIdx={bandIdx}
              selIdxs={selIdxs}
              onSelectBand={selectBand}
              onSelectEls={selectExact}
              renaming={renaming}
              onRenaming={setRenaming}
              onRenameFrame={renameFrame}
              onRenameGroup={renameGroup}
              onRemoveBand={removeBand}
              canRemoveBand={template.bands.length > 1}
              addable={addable}
              onAddBand={addBand}
            />
          )}

          {rightTab === "props" &&
            (selected ? (
              <ElementProps
                el={selected}
                count={selIdxs.length}
                onChange={(patch, live) => setEl(patch, live)}
                onDelete={removeSelected}
                onDuplicate={duplicateSelection}
                fields={selectedFields}
                bandOptions={template.bands.map((b, i) => ({ value: i, label: bandTitle(b) }))}
                bandIndex={bandIdx}
                onMoveBand={moveSelectedTo}
                onReorder={reorderSelected}
                onNotice={setNotice}
                frameInfo={
                  selected.type === "rectangle" && selIdxs.length === 1
                    ? { count: opIdxs.length - selIdxs.length, onAddText: () => addTextInFrame(bandIdx, selEl), onRename: (v) => renameFrame(bandIdx, selEl, v) }
                    : undefined
                }
                groupInfo={
                  selected.group && band.elements.filter((e) => e.group === selected.group).length > 1
                    ? {
                        name: groupLabel(band.elements, selected.group),
                        whole: selGroupId === selected.group,
                        onRename: (v) => renameGroup(bandIdx, selected.group, v),
                        onSelect: () => selectExact(bandIdx, band.elements.flatMap((e, i) => (e.group === selected.group ? [i] : []))),
                        onUngroup: () => ungroupAll(bandIdx, selected.group),
                      }
                    : undefined
                }
              />
            ) : band ? (
              <BandProps
                band={band}
                bandIndex={bandIdx}
                existingTypes={existingTypes}
                onPatch={(patch, live) => setBandPatch(patch, live)}
                onDelete={removeBand}
                onAddBand={addBand}
                canDelete={template.bands.length > 1}
              />
            ) : null)}

          {rightTab === "page" && (
            <PageProps
              template={template}
              onChange={(patch, live) => {
                if (patch.page) dispatch({ type: "setPage", patch: patch.page, record: true, key: live ? "page:" + Object.keys(patch.page).join(",") : undefined });
                else if (patch.user_dict) dispatch({ type: "patchTemplate", patch, record: true, key: live ? "template:user_dict" : undefined });
              }}
            />
          )}

          {rightTab === "data" && (
            <DataPanel template={template} data={data} onSetData={setData} onReplaceTemplate={replaceTemplate} onNotice={setNotice} />
          )}
        </div>
      </aside>

      {ctxMenu && (
        <MenuContent x={ctxMenu.x} y={ctxMenu.y} onClose={closeCtx} label="เมนูคำสั่ง">
          {ctxMenu.ei != null ? (
            <ElementMenu
              el={template.bands[ctxMenu.bi]?.elements[ctxMenu.ei]}
              count={selIdxs.length}
              grouped={selGroup}
              hasClip={hasClip}
              onEdit={() => startEdit(ctxMenu.bi, ctxMenu.ei)}
              onFrameText={() => addTextInFrame(ctxMenu.bi, ctxMenu.ei)}
              onRename={() => startRename(ctxMenu.bi, `e${ctxMenu.ei}`)}
              groupId={selGroupId}
              onRenameGroup={() => startRename(ctxMenu.bi, `g${selGroupId}`)}
              onProps={() => setRightTab("props")}
              onCut={cutSelection}
              onCopy={copySelection}
              onPaste={() => pasteElements(clipRef.current?.map((el) => ({ ...el })))}
              onDuplicate={duplicateSelection}
              onReorder={reorderSelected}
              onGroup={groupSelection}
              onDelete={removeSelected}
            />
          ) : (
            <BandMenu
              band={template.bands[ctxMenu.bi]}
              hasClip={hasClip}
              canDelete={template.bands.length > 1}
              onPaste={() => pasteElements(clipRef.current?.map((el) => ({ ...el })))}
              onSelectAll={() => selectAllIn(ctxMenu.bi)}
              onAdd={(kind) => addElementAt(kind, ctxMenu.bi, ctxMenu.mmX, ctxMenu.mmY)}
              onProps={() => setRightTab("props")}
              onDelete={() => removeBand(ctxMenu.bi)}
            />
          )}
        </MenuContent>
      )}
    </div>
  );
}

/** เมนูคลิกขวาบน element — คำสั่งใช้กับทุกรายการที่เลือกอยู่ */
function ElementMenu({ el, count, grouped, hasClip, onEdit, onFrameText, onRename, groupId, onRenameGroup, onProps, onCut, onCopy, onPaste, onDuplicate, onReorder, onGroup, onDelete }) {
  if (!el) return null;
  return (
    <>
      <MenuLabel>{count > 1 ? `เลือก ${count} รายการ` : el.type === "rectangle" ? frameLabel(el) : KIND_LABELS[el.type] ?? el.type}</MenuLabel>
      {el.type === "text" && count === 1 && (
        <MenuItem icon={<Icon name="pencil" />} shortcut="Enter" onSelect={onEdit}>
          แก้ไขข้อความ
        </MenuItem>
      )}
      {el.type === "rectangle" && count === 1 && (
        <>
          <MenuItem icon={<Icon name="text" />} onSelect={onFrameText}>
            ใส่ข้อความในกรอบ
          </MenuItem>
          <MenuItem icon={<Icon name="pencil" />} onSelect={onRename}>
            เปลี่ยนชื่อกรอบ
          </MenuItem>
        </>
      )}
      {groupId && (
        <MenuItem icon={<Icon name="pencil" />} onSelect={onRenameGroup}>
          เปลี่ยนชื่อกลุ่ม
        </MenuItem>
      )}
      <MenuItem icon={<Icon name="sliders" />} onSelect={onProps}>
        คุณสมบัติ
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<Icon name="cut" />} shortcut={`${MOD}X`} onSelect={onCut}>ตัด</MenuItem>
      <MenuItem icon={<Icon name="copy" />} shortcut={`${MOD}C`} onSelect={onCopy}>คัดลอก</MenuItem>
      <MenuItem icon={<Icon name="paste" />} shortcut={`${MOD}V`} disabled={!hasClip} onSelect={onPaste}>วาง</MenuItem>
      <MenuItem icon={<Icon name="duplicate" />} shortcut={`${MOD}D`} onSelect={onDuplicate}>ทำซ้ำ</MenuItem>
      <MenuSeparator />
      <MenuLabel>ลำดับซ้อน</MenuLabel>
      <MenuItem icon={<Icon name="zFront" />} shortcut={`⇧${MOD}]`} onSelect={() => onReorder("front")}>ไปบนสุด</MenuItem>
      <MenuItem icon={<Icon name="zUp" />} shortcut={`${MOD}]`} onSelect={() => onReorder("forward")}>ขึ้นหนึ่งชั้น</MenuItem>
      <MenuItem icon={<Icon name="zDown" />} shortcut={`${MOD}[`} onSelect={() => onReorder("backward")}>ลงหนึ่งชั้น</MenuItem>
      <MenuItem icon={<Icon name="zBack" />} shortcut={`⇧${MOD}[`} onSelect={() => onReorder("back")}>ไปล่างสุด</MenuItem>
      {count >= 2 && (
        <>
          <MenuSeparator />
          <MenuItem icon={<Icon name={grouped ? "ungroup" : "group"} />} shortcut={grouped ? `⇧${MOD}G` : `${MOD}G`} onSelect={() => onGroup(grouped)}>
            {grouped ? "แยกกลุ่ม" : "จัดกลุ่ม"}
          </MenuItem>
        </>
      )}
      <MenuSeparator />
      <MenuItem icon={<Icon name="trash" />} shortcut="Del" destructive onSelect={onDelete}>
        ลบ{count > 1 ? ` ${count} รายการ` : ""}
      </MenuItem>
    </>
  );
}

/** เมนูคลิกขวาบนพื้นที่ว่างของ band — เพิ่ม element ตรงจุดที่คลิก */
function BandMenu({ band, hasClip, canDelete, onPaste, onSelectAll, onAdd, onProps, onDelete }) {
  if (!band) return null;
  return (
    <>
      <MenuLabel>{bandTitle(band)}</MenuLabel>
      <MenuItem icon={<Icon name="paste" />} shortcut={`${MOD}V`} disabled={!hasClip} onSelect={onPaste}>วาง</MenuItem>
      <MenuItem icon={<Icon name="selectAll" />} shortcut={`${MOD}A`} disabled={!band.elements.length} onSelect={onSelectAll}>
        เลือกทั้งหมดใน band
      </MenuItem>
      <MenuSeparator />
      <MenuLabel>เพิ่มตรงนี้</MenuLabel>
      {ADD_KINDS.map((k) => (
        <MenuItem key={k.id} icon={<Icon name={k.id} />} onSelect={() => onAdd(k.id)}>
          {k.label}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem icon={<Icon name="sliders" />} onSelect={onProps}>คุณสมบัติ band</MenuItem>
      <MenuItem icon={<Icon name="trash" />} destructive disabled={!canDelete} onSelect={onDelete}>ลบ band</MenuItem>
    </>
  );
}

export default ReportDesigner;
export { RULER_H };
