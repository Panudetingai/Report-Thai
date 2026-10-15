import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** รวม class name แบบ shadcn: ต่อ class แล้วตัด class ที่ขัดกันออก */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
