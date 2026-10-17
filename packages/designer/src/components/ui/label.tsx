import * as React from "react";
import { cn } from "../../lib/utils";

/** ป้ายชื่อช่องแบบ shadcn/ui */
export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label data-slot="label" className={cn("select-none text-xs font-medium leading-none text-muted-foreground", className)} {...props} />;
}
