import * as React from "react";
import { cn } from "../../lib/utils.js";

/** แท็บแบบ segmented ของ shadcn/ui (TabsList + TabsTrigger) — ควบคุมค่าจากภายนอก */
export function Tabs({ value, onValueChange, label, className, items }) {
  return (
    <div role="tablist" aria-label={label} data-slot="tabs" className={cn("inline-flex h-8 items-center rounded-lg bg-muted p-[3px] text-muted-foreground", className)}>
      {items.map(({ value: v, label: text, icon }) => (
        <button
          key={v}
          type="button"
          role="tab"
          data-slot="tabs-trigger"
          aria-selected={value === v}
          onClick={() => onValueChange(v)}
          className={cn(
            "inline-flex h-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-semibold transition-all [&_svg]:size-4",
            "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === v && "bg-background text-foreground shadow-sm",
          )}
        >
          {icon}
          <span className="hidden sm:inline">{text}</span>
        </button>
      ))}
    </div>
  );
}
