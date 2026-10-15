import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { Button } from "./components/ui/button.jsx";
import { DND_KIND } from "./canvas/bandHit.js";
import { usePreviewEngine } from "./hooks/usePreviewEngine.js";
import { BandStage, RULER_H } from "./BandStage.jsx";
import { PreviewTab } from "./PreviewTab.jsx";
import { BandProps, ElementProps, PageProps, ZOrderButtons } from "./Inspector.jsx";
import { DataPanel } from "./DataPanel.jsx";
import { analyzeTemplate, buildCatalog } from "./fields.js";
import { detailSourceOf, tableSourceOf } from "./bind.js";
import { ALIGN_ACTIONS, alignChanges, groupMembers, newGroupId } from "./layout-tools.js";
import { SAMPLES } from "./samples.js";
import { StructurePicker } from "./StructurePicker.jsx";
import { STANDARD_STRUCTURES, loadUserStructures, makeUserStructure, parseStructureFile, saveUserStructures, structureFileText } from "./structures.js";
import { ADD_KINDS, BAND_LABELS, BAND_ORDER, KIND_LABELS, bandRank, bandTitle, countStrays, historyReducer, initialHistory, newElement, planMove, planPlacement, zOrderPlan } from "./state.js";
import { BASE_PX_PER_MM, contentWidth, margins, pageSize } from "./layout.js";

const MIN_ZOOM = 0.55;
const ZOOM_STEPS = [0.55, 0.75, 1, 1.25, 1.5, 2, 3];
const PREVIEW_ZOOMS = [0.5, 0.75, 1, 1.25, 1.5];
const KIND_OF_TYPE = { text: "text", line: "line", rectangle: "rect", ellipse: "ellipse", image: "image", table: "table", checkbox: "checkbox" };
const initial = SAMPLES[0];
const TAG_W = 132;
const TIPS_KEY = "thaireport.tips.v1";

/** อ่าน/เขียนค่าจาก localStorage แบบปลอดภัย (ใช้เฉพาะการจำค่าการแสดงผลของผู้ใช้เครื่องนี้) */
function readFlag(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeFlag(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ไม่มีที่เก็บค่า — ยังใช้งานได้ */
  }
}

const SHORTCUTS = [
  ["⌘/Ctrl + Z", "ย้อนกลับ"],
  ["⌘/Ctrl + Shift + Z", "ทำซ้ำ"],
  ["Shift / ⌘ + คลิก", "เลือกหลายรายการใน band เดียวกัน"],
  ["⌘/Ctrl + A", "เลือกทั้ง band"],
  ["⌘/Ctrl + C · V · D", "คัดลอก · วาง · ทำซ้ำ (D)"],
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

function DisplayRow({ label, hint, children }) {
  return (
    <div className="display-row">
      <div className="display-label">
        <strong>{label}</strong>
        <span className="small muted">{hint}</span>
      </div>
      {children}
    </div>
  );
}

function Segment({ value, onChange, options }) {
  return (
    <div className="segmented segment-wide" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={value === v ? "is-on" : ""} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
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
    <div className="sel-bar" role="toolbar" aria-label="จัดวางรายการที่เลือก">
      <span className="sel-count">{count} รายการ</span>
      <div className="sel-group" role="group" aria-label="ชิดขอบ">
        {group.map((a) => (
          <button key={a.id} type="button" className="icon-btn" onClick={() => onAlign(a.id)} title={a.title} aria-label={a.label}>
            <Icon name={ALIGN_ICON[a.id]} size={16} />
          </button>
        ))}
      </div>
      <div className="sel-group" role="group" aria-label="เว้นระยะและขนาด">
        {align.map((a) => (
          <button key={a.id} type="button" className="icon-btn" onClick={() => onAlign(a.id)} title={a.title} aria-label={a.label}>
            <Icon name={ALIGN_ICON[a.id]} size={16} />
          </button>
        ))}
      </div>
      <div className="sel-group" role="group" aria-label="กลุ่ม">
        {grouped ? (
          <button type="button" className="sel-text" onClick={onUngroup} title="แยกกลุ่ม (⌘/Ctrl+Shift+G)">
            <Icon name="ungroup" size={15} /> แยกกลุ่ม
          </button>
        ) : (
          <button type="button" className="sel-text" onClick={onGroup} title="จัดกลุ่ม (⌘/Ctrl+G)">
            <Icon name="group" size={15} /> จัดกลุ่ม
          </button>
        )}
      </div>
      <div className="sel-group" role="group" aria-label="ลำดับซ้อน">
        <ZOrderButtons onReorder={onReorder} compact />
      </div>
      <button type="button" className="icon-btn danger" onClick={onDelete} title="ลบทั้งหมดที่เลือก (Delete)" aria-label="ลบรายการที่เลือก">
        <Icon name="trash" size={15} />
      </button>
    </div>
  );
}

/** index ของรายการที่เลือกทั้งหมดใน band (เรียง, ไม่ซ้ำ, ไม่เกินจำนวนจริง) */
function selIndexes(ei, extra, n) {
  if (ei == null) return [];
  return [...new Set([ei, ...extra])].filter((i) => i < n).sort((a, b) => a - b);
}

function ShortcutHelp({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="help-pop" role="dialog" aria-label="คีย์ลัด">
      <h3>คีย์ลัด</h3>
      <dl>
        {SHORTCUTS.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="mono">{k}</dt>
            <dd>{v}</dd>
          </React.Fragment>
        ))}
      </dl>
      <p className="small muted">ลาก element ข้าม band ได้ · ลากขอบล่างของ band เพื่อปรับความสูง</p>
    </div>
  );
}

export function ReportDesigner({ initialTemplate, initialData }) {
  const [doc, dispatch] = useReducer(
    historyReducer,
    null,
    () => initialHistory(initialTemplate ?? initial.template, initialData ?? initial.data),
  );
  const { template, data } = doc;

  const [sampleId, setSampleId] = useState(`std:${initial.id}`); // id ของโครงสร้างที่ใช้อยู่
  const [activeName, setActiveName] = useState(initial.label);
  const [userStructs, setUserStructs] = useState(() => loadUserStructures());
  const [bandIdx, setBandIdx] = useState(0);
  const [selEl, setSelEl] = useState(null); // รายการหลัก (รายการที่คลิกล่าสุด)
  const [extraSel, setExtraSel] = useState([]); // รายการที่เลือกเพิ่มในband เดียวกัน (Shift/⌘-คลิก)
  const clipRef = useRef(null); // element ที่คัดลอกไว้ (Ctrl/⌘+C)
  const [view, setView] = useState("design"); // "design" | "preview"
  const [rightTab, setRightTab] = useState("props"); // "props" | "page" | "data"
  const [textScale, setTextScale] = useState(1);
  const [zoomMode, setZoomMode] = useState("fit");
  const [previewZoom, setPreviewZoom] = useState(1);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [previewW, setPreviewW] = useState(0);
  const { ready, initError, rendering, renderError, pdf, stats, dirty } = usePreviewEngine(doc, view);
  const [notice, setNotice] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [sampleRows, setSampleRows] = useState(3); // จำนวนแถวตัวอย่างที่วาดในตารางบนหน้าออกแบบ
  const [tableMode, setTableMode] = useState("compact"); // "compact" = ย่อความสูงตาราง · "actual" = ตามจำนวนแถวจริง
  const [showDisplay, setShowDisplay] = useState(false);
  const [showTips, setShowTips] = useState(() => readFlag(TIPS_KEY) !== "hidden");

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
  const selGroup = selIdxs.length > 1 && selIdxs.every((i) => band.elements[i].group && band.elements[i].group === band.elements[selIdxs[0]].group);
  const cw = contentWidth(template);

  // ---- ขนาดการแสดงผล --------------------------------------------------------
  const fitS = useMemo(() => {
    if (!stageSize.w) return BASE_PX_PER_MM;
    return Math.max(MIN_ZOOM, (stageSize.w - TAG_W - 96) / page.w);
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
    const ro = new ResizeObserver(([e]) => setStageSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setPreviewW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  // ฟิลด์ข้อมูลและการผูกกับเทมเพลต — คำนวณใหม่เมื่อ template หรือข้อมูลเปลี่ยน
  const catalog = useMemo(() => buildCatalog(data), [data]);
  const analysis = useMemo(() => analyzeTemplate(template, data), [template, data]);
  const problemCount = analysis.problems.filter((p) => p.reason === "missing" || p.reason === "unsupported").length;

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(""), 2400);
    return () => clearTimeout(t);
  }, [notice]);

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
    setRightTab("props");
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
    dispatch({ type: "patchEls", band: bandIdx, changes: selIdxs.map((ei) => ({ ei, patch: { group: gid } })), record: true });
    setNotice(ungroup ? "แยกกลุ่มแล้ว" : `จัดกลุ่ม ${selIdxs.length} รายการแล้ว (คลิกรายการใดก็เลือกทั้งกลุ่ม)`);
  }

  /** วางสำเนา element ที่คัดลอกไว้ — ไปที่ band ที่ถูกกติกา (ตาราง/ใต้ตาราง) อัตโนมัติ */
  function pasteElements(elements) {
    if (!elements?.length) return;
    const plan = planPlacement(template, bandIdx, elements[0].type);
    if (plan.error) return setNotice(plan.error);
    const start = template.bands[plan.band].elements.length;
    dispatch({ type: "addEls", band: plan.band, elements, offset: 3 });
    setBandIdx(plan.band);
    setSelEl(start + elements.length - 1);
    setExtraSel(Array.from({ length: elements.length - 1 }, (_, k) => start + k));
    setRightTab("props");
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
    if (!template.bands[idx]) return;
    dispatch({ type: "removeBand", band: idx }); // ย้อนกลับได้ด้วย Ctrl/⌘+Z
    setBandIdx(0);
    setSelEl(null);
    setNotice(`ลบ band แล้ว (Ctrl/⌘+Z เพื่อย้อนกลับ)`);
  }

  /** ย้ายลำดับซ้อนของรายการที่เลือก (ไปบนสุด/ขึ้น/ลง/ไปล่างสุด) — เลือกรายการเดิมต่อไปหลังย้าย */
  function reorderSelected(mode) {
    const els = template.bands[bandIdx]?.elements ?? [];
    if (!selIdxs.length) return;
    const { order, indexes } = zOrderPlan(els.length, selIdxs, mode);
    if (order.every((v, i) => v === i)) {
      setNotice(mode === "front" || mode === "forward" ? "อยู่บนสุดแล้ว" : "อยู่ล่างสุดแล้ว");
      return;
    }
    dispatch({ type: "reorderEls", band: bandIdx, indexes: selIdxs, mode });
    const primary = order.indexOf(selEl);
    setSelEl(primary);
    setExtraSel(indexes.filter((i) => i !== primary));
    setNotice(Z_NOTICE[mode]);
  }

  function removeSelected() {
    if (!selIdxs.length) return;
    dispatch({ type: "removeEls", band: bandIdx, indexes: selIdxs });
    setSelEl(null);
    setExtraSel([]);
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
      const idxs = selIndexes(selEl, extraSel, els.length);
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
        setNotice(`คัดลอก ${idxs.length} รายการ`);
        return;
      }
      if (mod && key === "v") {
        e.preventDefault();
        pasteElements(clipRef.current?.map((el) => ({ ...el })));
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

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">TR</span>
          <div>
            <div className="brand-name">ThaiReport</div>
            <div className="brand-sub">Report Designer</div>
          </div>
        </div>

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

        <div className="btn-group">
          <Button variant="ghost" size="icon" onClick={() => dispatch({ type: "undo" })} disabled={!doc.past.length} title="ย้อนกลับ (Ctrl/⌘+Z)" aria-label="ย้อนกลับ">
            <Icon name="undo" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => dispatch({ type: "redo" })} disabled={!doc.future.length} title="ทำซ้ำ (Ctrl/⌘+Shift+Z)" aria-label="ทำซ้ำ">
            <Icon name="redo" />
          </Button>
        </div>

        <div className="topbar-spacer" />

        <div className={`status status-${status.tone}`} role="status">
          <span className="dot" />
          {status.text}
        </div>
        <button
          type="button"
          className={`chip map-chip${problemCount ? " is-warn" : ""}`}
          onClick={() => setRightTab("data")}
          title="ตรวจการผูกตัวแปรกับข้อมูล"
        >
          {problemCount ? `⚠ ${problemCount} ตัวแปรไม่พบในข้อมูล` : "✓ ผูกข้อมูลครบ"}
        </button>
        <div className="help-wrap">
          <Button variant="ghost" size="icon" onClick={() => setShowHelp((v) => !v)} title="คีย์ลัด" aria-expanded={showHelp} aria-label="คีย์ลัด">
            ?
          </Button>
          {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}
        </div>
        <Button variant="outline" onClick={() => importRef.current?.click()}>
          <Icon name="upload" /> นำเข้า
        </Button>
        <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files[0] && importFile(e.target.files[0])} />
        <Button onClick={exportJson}>
          <Icon name="download" /> ส่งออก JSON
        </Button>
      </header>

      <aside className="toolbox">
        <section className="section">
          <h3>เครื่องมือ</h3>
          <div className="add-grid">
            {ADD_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                className="add-tile"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DND_KIND, k.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => addElement(k.id)}
                disabled={!band}
                title={`คลิกใส่ใน frame ที่เลือก · หรือลากไปวางใน frame บนกระดาษ`}
              >
                <Icon name={k.id === "rect" ? "rect" : k.id} size={18} />
                <span>{k.label}</span>
              </button>
            ))}
          </div>
          <p className="hint small muted">ลากเครื่องมือลงในกรอบ band (frame) · ลาก element ข้าม frame ได้</p>
        </section>

        <section className="section">
          <h3>Band</h3>
          {addable.length > 0 ? (
            <div className="band-add-row">
              {addable.map((t) => (
                <button key={t} type="button" className="chip" onClick={() => addBand(t)} title={`เพิ่ม ${BAND_LABELS[t]}`}>
                  + {BAND_LABELS[t]}
                </button>
              ))}
            </div>
          ) : (
            <p className="muted small">มี band ครบทุกชนิดแล้ว</p>
          )}
        </section>

        <section className="section tree">
          <h3>โครงสร้าง</h3>
          <ul className="bands">
            {sortedIdx.map(({ b, i: bi }) => (
              <li key={bi}>
                <button type="button" className={`band-row-btn${bi === bandIdx ? " is-active" : ""}`} onClick={() => selectBand(bi, null)}>
                  <span>{bandTitle(b)}</span>
                  <span className="mono small muted">{b.height} mm</span>
                </button>
                {bi === bandIdx && b.elements.length > 0 && (
                  <ul className="layers" aria-label="ลำดับซ้อน จากบนลงล่าง">
                    {/* บนสุดแสดงก่อน — ตรงกับการทับกันบนกระดาษ */}
                    {b.elements.map((el, ei) => ({ el, ei })).reverse().map(({ el, ei }) => (
                      <li key={ei}>
                        <button
                          type="button"
                          className={`layer${bi === bandIdx && selIdxs.includes(ei) ? " is-active" : ""}`}
                          onClick={(e) => selectBand(bi, ei, e.shiftKey || e.metaKey || e.ctrlKey)}
                          title="คลิก เลือก · Shift/⌘-คลิก เลือกหลายรายการ"
                        >
                          <Icon name={KIND_OF_TYPE[el.type] ?? "rect"} size={14} />
                          <span className="layer-name">{KIND_LABELS[el.type] ?? el.type}</span>
                          {el.group && <span className="group-dot" title={`อยู่ในกลุ่ม ${el.group.slice(-4)}`} />}
                          <span className="mono small muted">
                            {el.x}, {el.y}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <main className="workspace">
        <nav className="view-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={view === "design"} className={view === "design" ? "is-on" : ""} onClick={() => setView("design")}>
            ออกแบบ
          </button>
          <button type="button" role="tab" aria-selected={view === "preview"} className={view === "preview" ? "is-on" : ""} onClick={() => setView("preview")}>
            พรีวิว (PDF จริง)
          </button>
          {view === "design" && (
            <div className="display-menu">
              <button type="button" className={`chip${showDisplay ? " is-on" : ""}`} onClick={() => setShowDisplay((v) => !v)} aria-expanded={showDisplay}>
                <Icon name="chevron" size={12} /> การแสดงผล
              </button>
              {showDisplay && (
                <div className="display-pop" role="dialog" aria-label="การแสดงผลหน้าออกแบบ">
                  <DisplayRow label="แถวตัวอย่างในตาราง" hint="จำนวนแถวที่วาดบนกระดาษออกแบบ">
                    <Segment value={sampleRows} onChange={setSampleRows} options={[[3, "3"], [6, "6"], [10, "10"]]} />
                  </DisplayRow>
                  <DisplayRow label="ความสูงตาราง" hint="ย่อ = เห็น band ด้านล่างครบ · ตามจริง = สูงเท่าจำนวนแถวจริง">
                    <Segment value={tableMode} onChange={setTableMode} options={[["compact", "ย่อ"], ["actual", "ตามจริง"]]} />
                  </DisplayRow>
                  <DisplayRow label="ขนาดตัวอักษรบนกระดาษ" hint="ลดขนาดเพื่อดูภาพรวมของหน้า">
                    <Segment value={textScale} onChange={setTextScale} options={[[1, "100%"], [0.75, "75%"], [0.5, "50%"]]} />
                  </DisplayRow>
                </div>
              )}
            </div>
          )}
          <span className="view-meta small muted">
            {sizeName} · {page.w} × {page.h} mm · ขอบ {m.t}/{m.r}/{m.b}/{m.l}
          </span>
        </nav>

        {view === "design" ? (
          <>
          {view === "design" && showTips && (
            <div className="tips" role="note">
              <span className="tips-text">
                <strong>เริ่มต้นง่ายๆ:</strong> เลือก band ทางซ้าย → ลากเครื่องมือลงในกรอบ · Shift-คลิกเลือกหลายรายการ แล้วจัดวางด้วยแถบด้านบน · ⌘/Ctrl+G จัดกลุ่ม · กด <kbd>?</kbd> ดูคีย์ลัดทั้งหมด
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label="ซ่อนคำแนะนำ"
                title="ซ่อนคำแนะนำนี้"
                onClick={() => {
                  writeFlag(TIPS_KEY, "hidden");
                  setShowTips(false);
                }}
              >
                ×
              </button>
            </div>
          )}
          <div className="stage" ref={stageRef}>
            {selIdxs.length > 1 && (
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
            {stageSize.w > 0 && (
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
                S={S}
                onWheelZoom={stepZoom}
                onPlaced={(bi, ei) => {
                  setBandIdx(bi);
                  setSelEl(ei);
                  setRightTab("props");
                }}
              />
            )}
          </div>
          </>
        ) : (
          <div className="preview-wrap" ref={previewRef}>
            <PreviewTab
              pdf={pdf}
              error={renderError}
              rendering={rendering}
              pageWidthPx={previewWidthPx}
              stats={stats}
            />
          </div>
        )}

        <footer className="statusbar">
          {view === "design" ? (
            <>
              <span className="mono small muted">
                เนื้อหา {cw} mm · ซูม {Math.round(zoomNow * 100)}%
              </span>
              <div className="zoom">
                <button type="button" className="icon-btn" onClick={() => stepZoom(-1)} title="ซูมออก (⌘/Ctrl −)">−</button>
                <select className="select zoom-select" value={zoomMode} onChange={(e) => setZoomMode(e.target.value === "fit" ? "fit" : Number(e.target.value))} aria-label="ซูม">
                  <option value="fit">พอดีความกว้าง</option>
                  {ZOOM_STEPS.map((z) => (
                    <option key={z} value={z}>{Math.round(z * 100)}%</option>
                  ))}
                  {zoomMode !== "fit" && !ZOOM_STEPS.includes(zoomMode) && <option value={zoomMode}>{Math.round(zoomMode * 100)}%</option>}
                </select>
                <button type="button" className="icon-btn" onClick={() => stepZoom(1)} title="ซูมเข้า (⌘/Ctrl +)">+</button>
              </div>
              <span className="mono small muted">{band ? `${bandTitle(band)} · ${band.elements.length} รายการ` : ""}</span>
            </>
          ) : (
            <>
              <span className="mono small muted">{stats ? `${stats.pages} หน้า` : "—"}</span>
              <div className="zoom">
                {PREVIEW_ZOOMS.map((z) => (
                  <button key={z} type="button" className={`chip${previewZoom === z ? " is-on" : ""}`} onClick={() => setPreviewZoom(z)}>
                    {Math.round(z * 100)}%
                  </button>
                ))}
              </div>
              <span className="small muted">แก้ไขแล้วกลับมาที่พรีวิวเพื่ออัปเดต</span>
            </>
          )}
        </footer>
        {notice && <div className="toast" key={notice}>{notice}</div>}
      </main>

      <aside className="panel">
        <nav className="tabs" role="tablist">
          {[
            ["props", "คุณสมบัติ"],
            ["page", "หน้ากระดาษ"],
            ["data", "ข้อมูล"],
          ].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={rightTab === id} className={rightTab === id ? "is-on" : ""} onClick={() => setRightTab(id)}>
              {label}
              {id === "data" && problemCount > 0 && <span className="tab-badge">{problemCount}</span>}
            </button>
          ))}
        </nav>

        <div className="panel-body">
          {rightTab === "props" &&
            (selected ? (
              <>
              {selIdxs.length > 1 && (
                <div className="multi-note small">
                  เลือก {selIdxs.length} รายการ · ค่าที่แก้ด้านล่างมีผลกับรายการหลัก (คลิกล่าสุด) · จัดวางด้วยแถบด้านบนกระดาษ
                </div>
              )}
              <ElementProps
                el={selected}
                onChange={(patch, live) => setEl(patch, live)}
                onDelete={removeSelected}
                onDuplicate={() => pasteElements(selIdxs.map((i) => ({ ...band.elements[i] })))}
                fields={selectedFields}
                bandOptions={template.bands.map((b, i) => ({ value: i, label: bandTitle(b) }))}
                bandIndex={bandIdx}
                onMoveBand={moveSelectedTo}
                onReorder={reorderSelected}
              />
              </>
            ) : band ? (
              <BandProps
                band={band}
                bandIndex={bandIdx}
                existingTypes={existingTypes}
                onPatch={(patch, live) => setBandPatch(patch, live)}
                onDelete={removeBand}
                onAddBand={addBand}
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
    </div>
  );
}

export default ReportDesigner;
export { RULER_H };
