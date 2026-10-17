import * as React from "react";
import { cn } from "../../lib/utils";
import { inputClass } from "./input";

/** select ของเบราว์เซอร์ หน้าตาแบบ shadcn/ui (เข้าถึงง่ายบนทุกอุปกรณ์) */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select"> & { className?: string }>(
  ({ className, children, ...props }, ref) => (
    <div className={cn("relative w-full min-w-0", className)} data-slot="native-select-wrap">
      <select ref={ref} data-slot="native-select" className={cn(inputClass, "appearance-none truncate pr-7")} {...props}>
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  ),
);
NativeSelect.displayName = "NativeSelect";
