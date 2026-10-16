import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils.js";

/**
 * เมนูแบบ shadcn/ui (ContextMenu / DropdownMenu) — เขียนเองไม่พึ่ง Radix
 * - วางแบบ fixed ที่จุด (x, y) แล้วดันกลับเข้าจอถ้าล้นขอบ
 * - ปิดเมื่อคลิกนอกเมนู, Esc, เลื่อนจอ, ย่อ/ขยายหน้าต่าง
 * - ลูกศรขึ้น/ลง Home/End เลื่อนโฟกัส · Enter/Space เลือก
 * - ระหว่างเปิด กันคีย์ลัดของ designer ไม่ให้ทำงาน (เช่น Delete ลบ element)
 */
const MenuCtx = React.createContext({ close: () => {} });

const itemsOf = (root) => [...(root?.querySelectorAll('[role="menuitem"]:not([data-disabled])') ?? [])];

export function MenuContent({ x, y, align = "start", onClose, anchorRef, className, children, label }) {
  const ref = React.useRef(null);
  const [pos, setPos] = React.useState({ left: x, top: y, ready: false });

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width: w, height: h } = el.getBoundingClientRect();
    const pad = 8;
    let left = align === "end" ? x - w : x;
    let top = y;
    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
    if (top + h > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - h - pad);
    setPos({ left, top, ready: true });
  }, [x, y, align]);

  // โฟกัสหลังแสดงผลแล้ว (element ที่ยัง visibility: hidden รับโฟกัสไม่ได้)
  React.useEffect(() => {
    if (pos.ready) (itemsOf(ref.current)[0] ?? ref.current)?.focus({ preventScroll: true });
  }, [pos.ready]);

  React.useEffect(() => {
    const inside = (t) => ref.current?.contains(t) || anchorRef?.current?.contains(t);
    const onDown = (e) => !inside(e.target) && onClose();
    const onScroll = (e) => !ref.current?.contains(e.target) && onClose();
    const onKey = (e) => {
      const items = itemsOf(ref.current);
      const i = items.indexOf(document.activeElement);
      const go = (n) => items[(n + items.length) % items.length]?.focus();
      // จับทุกคีย์ไว้ที่เมนู ไม่ให้หลุดไปถึงคีย์ลัดของหน้าออกแบบ
      e.stopPropagation();
      if (e.key === "Escape" || e.key === "Tab") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        go(i + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        go(i < 0 ? -1 : i - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        go(0);
      } else if (e.key === "End") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (i >= 0) items[i].click();
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose, anchorRef]);

  return createPortal(
    <MenuCtx.Provider value={{ close: onClose }}>
      <div
        ref={ref}
        role="menu"
        aria-label={label}
        tabIndex={-1}
        data-slot="menu"
        onContextMenu={(e) => e.preventDefault()}
        style={{ left: pos.left, top: pos.top, visibility: pos.ready ? "visible" : "hidden" }}
        className={cn(
          "fixed z-50 min-w-[13rem] max-h-[calc(100vh-16px)] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none",
          "menu-pop",
          className,
        )}
      >
        {children}
      </div>
    </MenuCtx.Provider>,
    document.body,
  );
}

export function MenuItem({ icon, children, shortcut, disabled, destructive, onSelect, className }) {
  const { close } = React.useContext(MenuCtx);
  return (
    <button
      type="button"
      role="menuitem"
      data-slot="menu-item"
      data-disabled={disabled || undefined}
      disabled={disabled}
      tabIndex={-1}
      onClick={() => {
        if (disabled) return;
        close();
        onSelect?.();
      }}
      onPointerMove={(e) => !disabled && e.currentTarget.focus({ preventScroll: true })}
      className={cn(
        "relative flex w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] outline-none",
        "focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-45",
        "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        destructive && "text-destructive focus:bg-destructive/10 focus:text-destructive [&_svg]:text-destructive",
        className,
      )}
    >
      {icon ?? <span className="size-4 shrink-0" aria-hidden="true" />}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <MenuShortcut>{shortcut}</MenuShortcut>}
    </button>
  );
}

export function MenuShortcut({ className, ...props }) {
  return <span className={cn("ml-auto pl-4 font-mono text-[11px] tracking-wide text-muted-foreground", className)} {...props} />;
}

export function MenuLabel({ className, ...props }) {
  return <div className={cn("px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", className)} {...props} />;
}

export function MenuSeparator({ className }) {
  return <div role="separator" className={cn("-mx-1 my-1 h-px bg-border", className)} />;
}

/** เมนูที่เปิดจากปุ่ม (DropdownMenu) — trigger รับ props เปิด/ปิดผ่าน render prop */
export function DropdownMenu({ trigger, align = "start", label, children }) {
  const anchorRef = React.useRef(null);
  const [at, setAt] = React.useState(null);
  const close = React.useCallback(() => setAt(null), []);
  const toggle = () => {
    if (at) return close();
    const r = anchorRef.current.getBoundingClientRect();
    setAt({ x: align === "end" ? r.right : r.left, y: r.bottom + 4 });
  };
  return (
    <>
      <span ref={anchorRef} className="inline-flex">
        {trigger({ onClick: toggle, "aria-haspopup": "menu", "aria-expanded": !!at })}
      </span>
      {at && (
        <MenuContent x={at.x} y={at.y} align={align} onClose={close} anchorRef={anchorRef} label={label}>
          {children}
        </MenuContent>
      )}
    </>
  );
}
