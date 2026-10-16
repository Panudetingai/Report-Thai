import * as React from "react";
import { cn } from "../../lib/utils";

/** ช่องกรอกแบบ shadcn/ui */
export const inputClass =
  "flex h-8 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-[13px] text-foreground shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type = "text", ...props }, ref) => (
  <input ref={ref} type={type} data-slot="input" className={cn(inputClass, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(({ className, ...props }, ref) => (
  <textarea ref={ref} data-slot="textarea" className={cn(inputClass, "h-auto min-h-16 resize-y py-1.5 leading-relaxed", className)} {...props} />
));
Textarea.displayName = "Textarea";
