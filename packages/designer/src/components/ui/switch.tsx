import * as React from "react";
import { cn } from "../../lib/utils";

type SwitchProps = Omit<React.ComponentProps<"button">, "onChange"> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

/** สวิตช์เปิด/ปิดแบบ shadcn/ui */
export function Switch({ checked, onCheckedChange, className, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      data-slot="switch"
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
        checked ? "bg-primary" : "bg-input",
        className,
      )}
      {...props}
    >
      <span className={cn("pointer-events-none block size-3.5 rounded-full bg-background shadow-sm transition-transform", checked ? "translate-x-[15px]" : "translate-x-0.5")} />
    </button>
  );
}
