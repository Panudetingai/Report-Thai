/** หา band (frame) ใต้พิกัด pointer — ใช้ตอนลาก element ข้าม band */

export function hitBandArea(bandAreas, clientX, clientY) {
  for (const { bi, el } of bandAreas) {
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
      return { bi, rect: r };
    }
  }
  return null;
}

/** พิกัด mm ภายใน band จาก pointer (ชดเชยจุดที่คลิกจับ element) */
export function pointerToBandMm(clientX, clientY, rect, scale, offsetX, offsetY) {
  const x = (clientX - rect.left) / scale - offsetX;
  const y = (clientY - rect.top) / scale - offsetY;
  return { x, y };
}

export const DND_KIND = "application/x-thaireport-kind";
