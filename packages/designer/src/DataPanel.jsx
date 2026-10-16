import React, { useEffect, useMemo, useRef, useState } from "react";
import { fieldBracketLabel } from "./bind.js";
import { analyzeTemplate, buildCatalog, exprFor, isSafeAuto, remapTemplate, suggestFields } from "./fields.js";
import { parseCsv } from "./csv.js";
import { bandTitle } from "./state.js";
import { Icon } from "./icons.jsx";
import { PanelHeader, Row, Section } from "./Inspector.jsx";
import { Badge } from "./components/ui/badge.jsx";
import { Button, buttonVariants } from "./components/ui/button.jsx";
import { Input, Textarea } from "./components/ui/input.jsx";
import { NativeSelect } from "./components/ui/native-select.jsx";
import { Tabs } from "./components/ui/tabs.jsx";
import { cn } from "./lib/utils.js";

const TABS = [
  ["json", "JSON"],
  ["csv", "CSV"],
  ["url", "จาก URL"],
];

const REASON_TEXT = {
  missing: "ไม่พบในข้อมูล",
  unsupported: "ไม่รองรับฟังก์ชัน",
  norows: "ไม่มีแถวข้อมูล",
};

/**
 * แท็บ “ข้อมูล”: แหล่งข้อมูล → ฟิลด์ที่มี → ตรวจการผูกกับเทมเพลต
 * ข้อมูลมาจาก JSON/CSV/URL ที่ระบบของผู้ใช้ส่งออกจากฐานข้อมูล — designer ไม่เก็บ credential ของ DB
 */
export function DataPanel({ template, data, onSetData, onReplaceTemplate, onNotice }) {
  // onSetData(data, live, key): live = รวมเป็น undo ขั้นเดียวตาม key (การพิมพ์) · false = ขั้นใหม่ (นำเข้า)
  const [tab, setTab] = useState("json");
  const [text, setText] = useState(() => JSON.stringify(data, null, 2));
  const [error, setError] = useState("");
  const editingRef = useRef(false);

  // ซิงก์ข้อความ JSON เมื่อข้อมูลเปลี่ยนจากที่อื่น (undo, นำเข้า, เลือกโครงสร้าง) — ไม่ทับตอนผู้ใช้กำลังพิมพ์
  useEffect(() => {
    if (!editingRef.current) {
      setText(JSON.stringify(data, null, 2));
      setError("");
    }
  }, [data]);

  const catalog = useMemo(() => buildCatalog(data), [data]);
  const analysis = useMemo(() => analyzeTemplate(template, data), [template, data]);
  const problems = analysis.problems.length;

  function onTextChange(next) {
    setText(next);
    try {
      const parsed = JSON.parse(next);
      setError("");
      onSetData(parsed, true, "data:json");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <PanelHeader icon="table" title="ข้อมูล" subtitle={problems ? `ผูกไม่ได้ ${problems} รายการ` : "ผูกข้อมูลครบ"}>
        <Button variant="ghost" size="icon-sm" onClick={() => downloadJson(data, "data.json", onNotice)} title="ส่งออกข้อมูลตัวอย่าง" aria-label="ส่งออกข้อมูลตัวอย่าง">
          <Icon name="download" />
        </Button>
      </PanelHeader>

      <Section title="ตรวจการผูก" action={problems ? <Badge variant="error">{problems}</Badge> : <Badge variant="ok"><Icon name="check" /></Badge>}>
        <BindingCheck analysis={analysis} catalog={catalog} template={template} onReplaceTemplate={onReplaceTemplate} onNotice={onNotice} />
      </Section>

      <Section title="แหล่งข้อมูล">
        <Tabs className="w-full [&>button]:flex-1" label="แหล่งข้อมูล" value={tab} onValueChange={setTab} items={TABS.map(([value, label]) => ({ value, label }))} />
        {tab === "json" && (
          <>
            <Textarea
              className="h-72 font-mono text-xs leading-snug"
              spellCheck={false}
              value={text}
              aria-label="ข้อมูล JSON"
              aria-invalid={!!error}
              onFocus={() => (editingRef.current = true)}
              onBlur={() => (editingRef.current = false)}
              onChange={(e) => onTextChange(e.target.value)}
            />
            {error && <p className="text-xs text-destructive">JSON ไม่ถูกต้อง: {error}</p>}
          </>
        )}
        {tab === "csv" && <CsvImport data={data} onSetData={onSetData} onNotice={onNotice} />}
        {tab === "url" && <UrlImport onSetData={onSetData} onNotice={onNotice} />}
      </Section>

      <Section title="ฟิลด์ (คลิกเพื่อคัดลอก)">
        <FieldCatalog catalog={catalog} onNotice={onNotice} />
      </Section>
    </>
  );
}

/* ---------- ตรวจการผูก ---------- */

function BindingCheck({ analysis, catalog, template, onReplaceTemplate, onNotice }) {
  const problems = analysis.problems;
  const [picked, setPicked] = useState({});

  if (!problems.length) {
    return <p className="text-xs text-emerald-700">ทุกตัวแปรผูกได้แล้ว ({analysis.uses.length} จุด)</p>;
  }

  const suggestionsFor = (p) => suggestFields(p, catalog);
  const autoable = problems.filter((p) => p.reason === "missing" && isSafeAuto(p, suggestionsFor(p)[0]));

  function applyMap(pairs) {
    if (!pairs.length) return;
    const map = new Map(pairs.map(([p, path]) => [p.expr, exprFor(p, path)]));
    onReplaceTemplate(remapTemplate(template, map));
    onNotice(`จับคู่ ${pairs.length} ฟิลด์แล้ว`);
  }

  return (
    <>
      {autoable.length > 0 && (
        <Button className="w-full" onClick={() => applyMap(autoable.map((p) => [p, suggestionsFor(p)[0].path]))}>
          <Icon name="check" /> จับคู่อัตโนมัติ ({autoable.length})
        </Button>
      )}
      <ul className="grid gap-2">
        {problems.map((p) => {
          const key = `${p.source ?? ""}|${p.expr}`;
          const sugg = p.reason === "missing" ? suggestionsFor(p) : [];
          const choice = picked[key] ?? sugg[0]?.path ?? "";
          return (
            <li key={key} className="grid gap-2 rounded-lg border border-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs font-semibold">{`{{ ${p.expr} }}`}</span>
                <Badge variant={p.reason === "missing" ? "error" : p.reason === "norows" ? "pending" : "warn"}>{REASON_TEXT[p.reason] ?? p.reason}</Badge>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {p.places.slice(0, 2).map((u) => placeLabel(u, template)).join(" · ")}
                {p.count > 2 && ` · +${p.count - 2}`}
              </div>
              {p.reason === "missing" && sugg.length > 0 && (
                <div className="flex gap-1.5">
                  <NativeSelect value={choice} onChange={(e) => setPicked({ ...picked, [key]: e.target.value })} aria-label="ฟิลด์ที่จะจับคู่">
                    {sugg.map((s) => (
                      <option key={s.path} value={s.path}>
                        {s.path}
                        {s.sample ? ` · ${s.sample.slice(0, 18)}` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button variant="secondary" className="shrink-0" onClick={() => applyMap([[p, choice]])}>
                    จับคู่
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function placeLabel(u, template) {
  const band = template.bands[u.band];
  const where = band ? bandTitle(band) : "band";
  const what = u.elType === "table" ? `ตาราง คอลัมน์ ${u.col + 1}` : u.elType === "checkbox" ? "ช่องติ๊ก" : "ข้อความ";
  return `${where} · ${what}`;
}

/* ---------- ฟิลด์ที่มี ---------- */

function FieldCatalog({ catalog, onNotice }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const match = (f) => !needle || f.path.toLowerCase().includes(needle) || (f.sample ?? "").toLowerCase().includes(needle);
  const scalars = catalog.scalars.filter(match);
  if (!catalog.scalars.length && !catalog.sources.length) {
    return <p className="text-xs text-muted-foreground">ยังไม่มีข้อมูล</p>;
  }
  return (
    <>
      <div className="relative">
        <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" className="pl-8" value={q} placeholder="ค้นหาฟิลด์…" aria-label="ค้นหาฟิลด์" onChange={(e) => setQ(e.target.value)} />
      </div>
      {scalars.length > 0 && <FieldGroup title={`ค่าเดี่ยว · ${scalars.length}`} fields={scalars} prefix="" onNotice={onNotice} />}
      {catalog.sources.map((s) => {
        const fields = s.fields.filter(match);
        if (needle && !fields.length) return null;
        return <FieldGroup key={s.name} title={`${s.name} · ${s.count} แถว`} fields={fields} prefix="item." onNotice={onNotice} />;
      })}
    </>
  );
}

function FieldGroup({ title, fields, prefix, onNotice }) {
  return (
    <div className="grid gap-1">
      <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <ul className="overflow-hidden rounded-lg border border-border">
        {fields.map((f) => (
          <FieldRow key={f.path} path={f.path} type={f.type} expr={`${prefix}${f.path}`} onNotice={onNotice} />
        ))}
      </ul>
    </div>
  );
}

function FieldRow({ path, type, expr, onNotice }) {
  const bracket = `[${fieldBracketLabel(expr)}]`;
  async function copy() {
    const text = `{{ ${expr} }}`;
    try {
      await navigator.clipboard.writeText(text);
      onNotice(`คัดลอก ${text} แล้ว`);
    } catch {
      onNotice(`คัดลอกไม่ได้ — ใช้ ${text}`);
    }
  }
  return (
    <li className="border-b border-border last:border-b-0">
      <button type="button" className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted" onClick={copy} title={`คัดลอก {{ ${expr} }}`}>
        <span className="truncate text-[13px] font-medium text-primary">{bracket}</span>
        <span className="ml-auto shrink-0 rounded bg-muted px-1.5 text-[10.5px] text-muted-foreground">{type}</span>
        <span className="max-w-[40%] shrink-0 truncate font-mono text-[11px] text-muted-foreground">{path}</span>
      </button>
    </li>
  );
}

/* ---------- นำเข้า ---------- */

function CsvImport({ data, onSetData, onNotice }) {
  const [name, setName] = useState("items");
  const [raw, setRaw] = useState("");
  const [err, setErr] = useState("");
  const rows = useMemo(() => {
    try {
      return raw.trim() ? parseCsv(raw) : [];
    } catch (e) {
      return e;
    }
  }, [raw]);
  const bad = rows instanceof Error;
  const list = bad ? [] : rows;

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => setRaw(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  function apply() {
    if (bad || !list.length) return;
    const key = name.trim();
    if (!key) return setErr("ตั้งชื่อรายการก่อน เช่น items");
    onSetData({ ...data, [key]: list }, false);
    setErr("");
    onNotice(`นำเข้า ${list.length} แถวเป็น “${key}”`);
  }

  return (
    <>
      <Row label="ชื่อรายการ">
        <Input value={name} className="font-mono text-xs" onChange={(e) => setName(e.target.value)} placeholder="items" aria-label="ชื่อรายการ (data source)" />
      </Row>
      <label className={cn(buttonVariants({ variant: "outline" }), "w-full cursor-pointer")}>
        <Icon name="upload" /> เลือกไฟล์ CSV
        <input type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files[0] && readFile(e.target.files[0])} />
      </label>
      <Textarea className="font-mono text-xs" rows={5} value={raw} spellCheck={false} placeholder={"no,name,amount\n1,ปากกา,10"} onChange={(e) => setRaw(e.target.value)} aria-label="ข้อความ CSV" />
      {bad && <p className="text-xs text-destructive">{rows.message}</p>}
      {!bad && list.length > 0 && <CsvPreview rows={list} />}
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button className="w-full" disabled={bad || !list.length} onClick={apply}>
        นำเข้า {list.length ? `${list.length} แถว` : ""}
      </Button>
    </>
  );
}

function CsvPreview({ rows }) {
  const cols = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted text-muted-foreground">
          <tr>{cols.map((c) => <th key={c} className="px-2 py-1 text-left font-semibold">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, 3).map((r, i) => (
            <tr key={i} className="border-t border-border">{cols.map((c) => <td key={c} className="px-2 py-1">{r[c]}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {rows.length > 3 && <div className="border-t border-border px-2 py-1 text-[11px] text-muted-foreground">+ อีก {rows.length - 3} แถว</div>}
    </div>
  );
}

function UrlImport({ onSetData, onNotice }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    let u;
    try {
      u = new URL(url.trim());
    } catch {
      return setErr("URL ไม่ถูกต้อง");
    }
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
      return setErr("ใช้ https:// เท่านั้น (ยกเว้น localhost)");
    }
    setBusy(true);
    try {
      const res = await fetch(u.href, { headers: { Accept: "application/json" }, credentials: "omit" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const next = Array.isArray(json) ? { items: json } : json;
      if (!next || typeof next !== "object") throw new Error("ข้อมูลต้องเป็น object หรือ array");
      onSetData(next, false);
      onNotice("ดึงข้อมูลจาก URL แล้ว");
    } catch (e) {
      setErr(`ดึงข้อมูลไม่สำเร็จ: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-api/reports/123" aria-label="URL ของข้อมูล JSON" />
      <Button className="w-full" disabled={!url.trim() || busy} onClick={load}>
        {busy ? "กำลังดึง…" : "ดึงข้อมูล"}
      </Button>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </>
  );
}

function downloadJson(obj, name, onNotice) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  onNotice?.("ส่งออกข้อมูลแล้ว");
}
