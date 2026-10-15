import React, { useRef, useState } from "react";
import { Icon } from "./icons.jsx";

/**
 * ตัวเลือกโครงสร้างบนแถบบน: เลือกจาก "มาตรฐาน" หรือ "ของฉัน"
 * บันทึกโครงสร้างปัจจุบันเป็นชื่อใหม่ ลบ/ส่งออก/นำเข้าไฟล์ได้
 */
export function StructurePicker({ standard, user, activeId, currentName, onApply, onSave, onDelete, onExport, onImport }) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const importRef = useRef(null);
  const activeIsUser = user.some((s) => s.id === activeId);

  function commitSave(e) {
    e?.preventDefault();
    const n = name.trim();
    if (!n) return;
    onSave(n);
    setName("");
    setSaving(false);
  }

  return (
    <div className="structure-picker">
      <label className="template-pick">
        <span className="small muted">โครงสร้าง</span>
        <select className="select structure-select" value={activeId} onChange={(e) => onApply(e.target.value)} aria-label="โครงสร้างเอกสาร">
          {!standard.some((s) => s.id === activeId) && !user.some((s) => s.id === activeId) && (
            <option value={activeId}>{currentName}</option>
          )}
          <optgroup label="มาตรฐาน">
            {standard.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </optgroup>
          {user.length > 0 && (
            <optgroup label="ของฉัน">
              {user.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      <div className="structure-tools">
        {!saving ? (
          <button type="button" className="icon-btn" onClick={() => setSaving(true)} title="บันทึกโครงสร้างปัจจุบันเป็นชื่อใหม่">
            <Icon name="save" />
          </button>
        ) : (
          <form className="save-form" onSubmit={commitSave}>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อโครงสร้าง" aria-label="ชื่อโครงสร้าง" onKeyDown={(e) => e.key === "Escape" && setSaving(false)} />
            <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
              บันทึก
            </button>
            <button type="button" className="icon-btn" onClick={() => setSaving(false)} title="ยกเลิก">
              ×
            </button>
          </form>
        )}
        {activeIsUser && (
          <button type="button" className="icon-btn danger" onClick={() => onDelete(activeId)} title="ลบโครงสร้างนี้">
            <Icon name="trash" />
          </button>
        )}
        <button type="button" className="icon-btn" onClick={onExport} title="ส่งออกเป็นไฟล์โครงสร้าง">
          <Icon name="download" />
        </button>
        <button type="button" className="icon-btn" onClick={() => importRef.current?.click()} title="นำเข้าไฟล์โครงสร้าง">
          <Icon name="upload" />
        </button>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            if (e.target.files[0]) onImport(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
