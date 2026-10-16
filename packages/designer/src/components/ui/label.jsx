import * as React from "react";
import { cn } from "../../lib/utils.js";

/** ป้ายชื่อช่องแบบ shadcn/ui */
export function Label({ className, ...props }) {
  return <label data-slot="label" className={cn("select-none text-xs font-medium leading-none text-muted-foreground", className)} {...props} />;
}
