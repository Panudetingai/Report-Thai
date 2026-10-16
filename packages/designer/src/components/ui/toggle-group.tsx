import * as React from "react";
import { cn } from "../../lib/utils";

/** ปุ่มเลือกหนึ่งค่าแบบ shadcn/ui ToggleGroup (variant outline) — options: [value, label, title?] */
export function ToggleGroup({
  value,
  onValueChange,
  options,
  className,
  size = "default",
  label,
}: {
  value: string | number | boolean;
  onValueChange: (value: string | number | boolean) => void;
  options: ReadonlyArray<readonly [string | number | boolean, React.ReactNode, string?] | (string | number | boolean | React.ReactNode)[]>;
  className?: string;
  size?: "default" | "sm";
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} data-slot="toggle-group" className={cn("inline-flex w-full rounded-md border border-input bg-background p-0.5 shadow-xs", className)}>
      {options.map((opt) => {
        const [v, text, title] = opt as [string | number | boolean, React.ReactNode, string?];
        return (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value === v}
          title={title}
          data-slot="toggle-group-item"
          onClick={() => onValueChange(v)}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-[5px] px-2 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-4",
            size === "sm" ? "h-6" : "h-7",
            value === v && "bg-muted text-foreground shadow-xs",
          )}
        >
          {text}
        </button>
        );
      })}
    </div>
  );
}
