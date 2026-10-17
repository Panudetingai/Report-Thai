import * as React from "react";
import { cn } from "../../lib/utils";

/** เส้นคั่นแบบ shadcn/ui */
export function Separator({ orientation = "horizontal", className }: { orientation?: "horizontal" | "vertical"; className?: string }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      data-slot="separator"
      className={cn("shrink-0 bg-border", orientation === "vertical" ? "mx-1 h-5 w-px" : "h-px w-full", className)}
    />
  );
}
