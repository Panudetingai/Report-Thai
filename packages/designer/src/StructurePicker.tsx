import React, { useRef, useState } from "react";
import { Icon } from "./icons";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { NativeSelect } from "./components/ui/native-select";

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
    <div className="flex min-w-0 shrink-0 items-center gap-0.5">
      <NativeSelect className="w-44 [&_select]:font-semibold" value={activeId} onChange={(e) => onApply(e.target.value)} aria-label="แม่แบบรายงาน" title="แม่แบบรายงาน">
        {!standard.some((s) => s.id === activeId) && !user.some((s) => s.id === activeId) && <option value={activeId}>{currentName}</option>}
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
      </NativeSelect>

      {!saving ? (
        <Button variant="ghost" size="icon-sm" onClick={() => setSaving(true)} title="บันทึกเป็นแม่แบบของฉัน" aria-label="บันทึกเป็นแม่แบบของฉัน">
          <Icon name="save" />
        </Button>
      ) : (
        <form className="flex items-center gap-1" onSubmit={commitSave}>
          <Input autoFocus className="w-36" value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อแม่แบบ" aria-label="ชื่อแม่แบบ" onKeyDown={(e) => e.key === "Escape" && setSaving(false)} />
          <Button type="submit" size="sm" disabled={!name.trim()}>
            บันทึก
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setSaving(false)} title="ยกเลิก" aria-label="ยกเลิก">
            <Icon name="x" />
          </Button>
        </form>
      )}
      {activeIsUser && (
        <Button variant="ghost" size="icon-sm" className="hover:bg-destructive/10 hover:text-destructive" onClick={() => onDelete(activeId)} title="ลบแม่แบบนี้" aria-label="ลบแม่แบบนี้">
          <Icon name="trash" />
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" onClick={onExport} title="ส่งออกไฟล์แม่แบบ" aria-label="ส่งออกไฟล์แม่แบบ">
        <Icon name="download" />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => importRef.current?.click()} title="นำเข้าไฟล์แม่แบบ" aria-label="นำเข้าไฟล์แม่แบบ">
        <Icon name="upload" />
      </Button>
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
  );
}
