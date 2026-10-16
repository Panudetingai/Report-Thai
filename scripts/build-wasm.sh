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
echo "WASM build เสร็จ: crates/tr-wasm/pkg-web และ pkg-node"
