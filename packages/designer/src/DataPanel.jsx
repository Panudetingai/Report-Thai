import React, { useEffect, useMemo, useRef, useState } from "react";
import { analyzeTemplate, buildCatalog, exprFor, isSafeAuto, remapTemplate, suggestFields } from "./fields.js";
import { parseCsv } from "./csv.js";
import { bandTitle } from "./state.js";

const TABS = [
  ["json", "JSON"],
  ["csv", "CSV"],
  ["url", "จาก URL"],
];

const REASON_TEXT = {
  missing: "ไม่พบในข้อมูล",
  unsupported: "ยังไม่รองรับฟังก์ชัน/ตัวกรอง",
  norows: "ยังตรวจไม่ได้ (ไม่มีแถวข้อมูล)",
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
    <div className="data-panel">
      <section className="dp-section">
        <h3>แหล่งข้อมูล</h3>
        <nav className="seg-tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>

        {tab === "json" && (
          <>
            <textarea
              className="code tall"
              rows={14}
              spellCheck={false}
              value={text}
              aria-label="ข้อมูล JSON"
              onFocus={() => (editingRef.current = true)}
              onBlur={() => (editingRef.current = false)}
              onChange={(e) => onTextChange(e.target.value)}
            />
            {error ? <p className="error-text small">JSON ไม่ถูกต้อง: {error}</p> : <p className="muted small">แก้ไขแล้วพรีวิวอัปเดต</p>}
          </>
        )}

        {tab === "csv" && <CsvImport data={data} onSetData={onSetData} onNotice={onNotice} />}
        {tab === "url" && <UrlImport onSetData={onSetData} onNotice={onNotice} />}

        <div className="dp-actions">
          <button type="button" className="btn" onClick={() => downloadJson(data, "data.json", onNotice)}>
            ส่งออกข้อมูลตัวอย่าง
          </button>
        </div>
      </section>

      <section className="dp-section">
        <h3>ตรวจการผูกข้อมูล</h3>
        <BindingCheck analysis={analysis} catalog={catalog} template={template} data={data} onReplaceTemplate={onReplaceTemplate} onNotice={onNotice} />
      </section>

      <section className="dp-section">
        <h3>ฟิลด์ในข้อมูล</h3>
        <FieldCatalog catalog={catalog} onNotice={onNotice} />
      </section>
    </div>
  );
}

/* ---------- ตรวจการผูก ---------- */

function BindingCheck({ analysis, catalog, template, data, onReplaceTemplate, onNotice }) {
  const problems = analysis.problems;
  const [picked, setPicked] = useState({});

  if (!problems.length) {
    return <p className="ok-text small">ทุกตัวแปรผูกกับข้อมูลได้แล้ว ✓ ({analysis.uses.length} จุด)</p>;
  }

  const suggestionsFor = (p) => suggestFields(p, catalog);
  const autoable = problems.filter((p) => p.reason === "missing" && isSafeAuto(p, suggestionsFor(p)[0]));

  function applyMap(pairs) {
    if (!pairs.length) return;
    const map = new Map(pairs.map(([p, path]) => [p.expr, exprFor(p, path)]));
    onReplaceTemplate(remapTemplate(template, map));
    onNotice(`จับคู่ ${pairs.length} ฟิลด์แล้ว (Ctrl/⌘+Z เพื่อย้อนกลับ)`);
  }

  return (
    <>
      <p className="small muted">พบ {problems.length} รายการที่ผูกไม่ได้ — ส่วนนี้คือสิ่งที่ PDF จะพิมพ์เป็นช่องว่าง</p>
      {autoable.length > 0 && (
        <button type="button" className="btn btn-block btn-primary" onClick={() => applyMap(autoable.map((p) => [p, suggestionsFor(p)[0].path]))}>
          ใช้คำแนะนำที่ตรงชื่อ ({autoable.length})
        </button>
      )}
      <ul className="problem-list">
        {problems.map((p) => {
          const key = `${p.source ?? ""}|${p.expr}`;
          const sugg = p.reason === "missing" ? suggestionsFor(p) : [];
          const choice = picked[key] ?? sugg[0]?.path ?? "";
          return (
            <li key={key} className={`problem problem-${p.reason}`}>
              <div className="problem-head">
                <span className="mono problem-expr">{`{{ ${p.expr} }}`}</span>
                <span className="badge">{REASON_TEXT[p.reason] ?? p.reason}</span>
              </div>
              <div className="small muted">
                {p.places.slice(0, 2).map((u, i) => (
                  <span key={i} className="place">
                    {placeLabel(u, template)}
                    {i < Math.min(p.places.length, 2) - 1 ? " · " : ""}
                  </span>
                ))}
                {p.count > 2 && <span> · และอีก {p.count - 2} จุด</span>}
              </div>
              {p.reason === "missing" && (
                sugg.length ? (
                  <div className="problem-fix">
                    <select className="select pg-select" value={choice} onChange={(e) => setPicked({ ...picked, [key]: e.target.value })} aria-label="ฟิลด์ที่จะจับคู่">
                      {sugg.map((s) => (
                        <option key={s.path} value={s.path}>
                          {s.path}
                          {s.sample ? ` · ${s.sample.slice(0, 18)}` : ""}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn" onClick={() => applyMap([[p, choice]])}>
                      จับคู่
                    </button>
                  </div>
                ) : (
                  <p className="small muted">ไม่พบฟิลด์ที่ใกล้เคียง — ตรวจชื่อในข้อมูล หรือแก้ฟิลด์ในเทมเพลต</p>
                )
              )}
              {p.reason === "norows" && <p className="small muted">เพิ่มแถวใน “{p.source ?? "items"}” เพื่อตรวจฟิลด์นี้</p>}
              {p.reason === "unsupported" && <p className="small muted">เอาฟังก์ชัน/ตัวกรองออก แล้วจัดรูปแบบค่าในข้อมูลต้นทางแทน</p>}
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
    return <p className="small muted">ยังไม่มีข้อมูล — วาง JSON หรือนำเข้า CSV ก่อน</p>;
  }
  return (
    <>
      <input className="search" type="search" value={q} placeholder="ค้นหาฟิลด์…" aria-label="ค้นหาฟิลด์" onChange={(e) => setQ(e.target.value)} />
      <p className="small muted">คลิกเพื่อคัดลอก <span className="mono">{"{{ ... }}"}</span> แล้ววางในข้อความได้ทันที</p>

      {scalars.length > 0 && (
        <details className="cat-group" open>
          <summary>ค่าเดี่ยว ({scalars.length})</summary>
          <ul className="field-list">
            {scalars.map((f) => (
              <FieldRow key={f.path} path={f.path} type={f.type} sample={f.sample} expr={f.path} onNotice={onNotice} />
            ))}
          </ul>
        </details>
      )}

      {catalog.sources.map((s) => {
        const fields = s.fields.filter((f) => !needle || f.path.toLowerCase().includes(needle) || (f.sample ?? "").toLowerCase().includes(needle));
        if (needle && !fields.length) return null;
        return (
          <details className="cat-group" key={s.name} open>
            <summary>
              รายการ “{s.name}” <span className="muted">· {s.count} แถว</span>
            </summary>
            <ul className="field-list">
              {fields.map((f) => (
                <FieldRow key={f.path} path={f.path} type={f.type} sample={f.sample} expr={`item.${f.path}`} onNotice={onNotice} />
              ))}
            </ul>
          </details>
        );
      })}
    </>
  );
}

function FieldRow({ path, type, sample, expr, onNotice }) {
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
    <li>
      <button type="button" className="field-row" onClick={copy} title={`คัดลอก {{ ${expr} }}`}>
        <span className="mono field-path">{path}</span>
        <span className={`type-badge type-${TYPE_CLASS[type] ?? "text"}`}>{type}</span>
        <span className="field-sample">{sample}</span>
      </button>
    </li>
  );
}

const TYPE_CLASS = { ตัวเลข: "num", วันที่: "date", "จริง/เท็จ": "bool", ว่าง: "empty", รายการ: "list", ข้อความ: "text" };

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
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="items" aria-label="ชื่อรายการ (data source)" />
      </Row>
      <label className="btn btn-block">
        เลือกไฟล์ CSV
        <input type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files[0] && readFile(e.target.files[0])} />
      </label>
      <textarea className="code" rows={5} value={raw} spellCheck={false} placeholder={"หรือวางข้อความ CSV ที่นี่\nno,name,amount\n1,ปากกา,10"} onChange={(e) => setRaw(e.target.value)} aria-label="ข้อความ CSV" />
      {bad && <p className="error-text small">{rows.message}</p>}
      {!bad && list.length > 0 && <CsvPreview rows={list} />}
      {err && <p className="error-text small">{err}</p>}
      <button type="button" className="btn btn-block btn-primary" disabled={bad || !list.length} onClick={apply}>
        นำเข้า {list.length ? `${list.length} แถว` : ""}
      </button>
      <p className="hint small muted">ค่าทุกช่องเก็บเป็นข้อความ (เช่น “007” ไม่หายเลข 0) · การนำเข้าแทนที่ “{name || "…"}” เดิม</p>
    </>
  );
}

function CsvPreview({ rows }) {
  const cols = Object.keys(rows[0]);
  return (
    <div className="csv-preview">
      <table>
        <thead>
          <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, 3).map((r, i) => (
            <tr key={i}>{cols.map((c) => <td key={c}>{r[c]}</td>)}</tr>
          ))}
        </tbody>
      </table>
      <span className="small muted">แสดง 3 แถวแรกจาก {rows.length} แถว</span>
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
      setErr(`ดึงข้อมูลไม่สำเร็จ: ${e.message} (ตรวจ CORS และว่า endpoint ส่ง JSON)`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Row label="URL ของ JSON" stack>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-api/reports/invoice/123" aria-label="URL ของข้อมูล JSON" />
      </Row>
      <button type="button" className="btn btn-block btn-primary" disabled={!url.trim() || busy} onClick={load}>
        {busy ? "กำลังดึง…" : "ดึงข้อมูล"}
      </button>
      {err && <p className="error-text small">{err}</p>}
      <p className="hint small muted">
        ส่งข้อมูลจากฐานข้อมูลผ่าน API ของคุณเอง (รับ JSON แบบ <span className="mono">{`{ "items": [...] }`}</span>) — designer ไม่รับ/ไม่เก็บ
        รหัสผ่านฐานข้อมูล และไม่ส่ง cookie ไปด้วย
      </p>
    </>
  );
}

function Row({ label, children }) {
  return (
    <div className="pg-row stack">
      <span className="pg-label">{label}</span>
      <div className="pg-ctl">{children}</div>
    </div>
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
