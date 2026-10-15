import React from "react";

/** ไอคอนเส้นบาง 16px (stroke ตามข้อความ) — ไม่พึ่งไลบรารีภายนอก */
const PATHS = {
  undo: <path d="M9 14 4 9l5-5M4 9h9a7 7 0 0 1 0 14h-1" />,
  redo: <path d="m15 14 5-5-5-5M20 9h-9a7 7 0 0 0 0 14h1" />,
  upload: <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />,
  download: <path d="M12 4v12m0 0 4-4m-4 4-4-4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />,
  text: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  line: <path d="M4 12h16" />,
  rect: <rect x="4" y="6" width="16" height="12" rx="1.5" />,
  image: <g><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-9 9" /></g>,
  table: <g><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="M3 10h18M9 5v14" /></g>,
  save: <path d="M5 3h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 3v5h7V3M8 21v-7h8v7" />,
  checkbox: <g><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m8 12 3 3 5-6" /></g>,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  dot: <circle cx="12" cy="12" r="3" />,
  copy: <g><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></g>,
  paste: <g><rect x="5" y="5" width="14" height="16" rx="2" /><path d="M9 5V4h6v1M9 13h6M9 17h4" /></g>,
  alignLeft: <g><path d="M4 3v18" /><rect x="8" y="6" width="12" height="4" rx="1" /><rect x="8" y="14" width="7" height="4" rx="1" /></g>,
  alignHCenter: <g><path d="M12 3v18" /><rect x="5" y="6" width="14" height="4" rx="1" /><rect x="8" y="14" width="8" height="4" rx="1" /></g>,
  alignRight: <g><path d="M20 3v18" /><rect x="4" y="6" width="12" height="4" rx="1" /><rect x="9" y="14" width="7" height="4" rx="1" /></g>,
  alignTop: <g><path d="M3 4h18" /><rect x="6" y="8" width="4" height="12" rx="1" /><rect x="14" y="8" width="4" height="7" rx="1" /></g>,
  alignVCenter: <g><path d="M3 12h18" /><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="8" width="4" height="8" rx="1" /></g>,
  alignBottom: <g><path d="M3 20h18" /><rect x="6" y="4" width="4" height="12" rx="1" /><rect x="14" y="9" width="4" height="7" rx="1" /></g>,
  distH: <g><path d="M3 4v16M21 4v16" /><rect x="9" y="7" width="6" height="10" rx="1" /></g>,
  distV: <g><path d="M4 3h16M4 21h16" /><rect x="7" y="9" width="10" height="6" rx="1" /></g>,
  sameW: <g><rect x="3" y="6" width="18" height="4" rx="1" /><rect x="3" y="14" width="10" height="4" rx="1" /></g>,
  sameH: <g><rect x="4" y="3" width="4" height="18" rx="1" /><rect x="14" y="3" width="6" height="10" rx="1" /></g>,
  group: <g><rect x="3" y="3" width="8" height="8" rx="1.5" strokeDasharray="2 2" /><rect x="13" y="13" width="8" height="8" rx="1.5" strokeDasharray="2 2" /><path d="M11 7h2M7 11v2M11 17h2M17 11v2" /></g>,
  ungroup: <g><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></g>,
  search: <g><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></g>,
  plus: <path d="M12 5v14M5 12h14" />,
  keyboard: <g><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></g>,
  /* ลำดับซ้อน (z-order): ลูกศรชี้ทิศทางและเส้นฐานของการจัดชั้น */
  zFront: <g><path d="M4 4h16" /><path d="M12 20V9m0 0-4 4m4-4 4 4" /></g>,
  zUp: <path d="M12 19V6m0 0-5 5m5-5 5 5" />,
  zDown: <path d="M12 5v13m0 0-5-5m5 5 5-5" />,
  zBack: <g><path d="M4 20h16" /><path d="M12 4v11m0 0-4-4m4 4 4-4" /></g>,
};

export function Icon({ name, size = 16, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
