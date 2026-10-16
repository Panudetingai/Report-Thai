import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

/** ป้ายสถานะแบบ shadcn/ui — เพิ่ม variant ok/warn/error สำหรับสถานะ engine และการผูกข้อมูล */
const badgeVariants = cva(
  "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-xs font-semibold transition-colors [&_svg]:size-3.5",
  {
    variants: {
      variant: {
        outline: "border-border bg-background text-muted-foreground",
        ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
        warn: "border-amber-200 bg-amber-50 text-amber-700",
        error: "border-red-200 bg-red-50 text-red-700",
        pending: "border-border bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { variant: "outline" },
  },
);

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

type BadgeProps = React.HTMLAttributes<HTMLElement> & { variant?: BadgeVariant | string } & { onClick?: React.MouseEventHandler<HTMLElement> };

const BADGE_VARIANTS = new Set<BadgeVariant>(["outline", "ok", "warn", "error", "pending"]);

function badgeVariantOf(variant?: BadgeVariant | string): BadgeVariant | undefined {
  if (variant == null) return undefined;
  return BADGE_VARIANTS.has(variant as BadgeVariant) ? (variant as BadgeVariant) : "outline";
}

export function Badge({ className, variant, ...props }: BadgeProps) {
  const Comp = props.onClick ? "button" : "span";
  return (
    <Comp
      data-slot="badge"
      type={Comp === "button" ? "button" : undefined}
      className={cn(badgeVariants({ variant: badgeVariantOf(variant) }), props.onClick && "cursor-pointer hover:brightness-95", className)}
      {...props}
    />
  );
}

export { badgeVariants };
