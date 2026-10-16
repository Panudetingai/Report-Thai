import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** รวม class name แบบ shadcn: ต่อ class แล้วตัด class ที่ขัดกันออก */
import type { ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
