#!/usr/bin/env bash
# Build tr-wasm สำหรับ browser (web) และ Node (parity tests)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/crates/tr-wasm"
# ตั้ง RUSTUP_TOOLCHAIN เองถ้า rustup default ชี้ channel ผิด (เช่น Windows-gnu บน macOS)
if [ -n "${RUSTUP_TOOLCHAIN:-}" ]; then
  export RUSTUP_TOOLCHAIN
fi
rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true
wasm-pack build --target web --out-dir pkg-web --release
wasm-pack build --target nodejs --out-dir pkg-node --release
# แพ็กเกจ @thaireport/client ถือไฟล์ WASM ของตัวเอง (publish ได้ ไม่อ้าง path ใน repo)
mkdir -p "$ROOT/packages/client/wasm"
cp pkg-web/tr_wasm.js pkg-web/tr_wasm.d.ts pkg-web/tr_wasm_bg.wasm "$ROOT/packages/client/wasm/"
echo "WASM build เสร็จ: crates/tr-wasm/pkg-web, pkg-node และ packages/client/wasm"
