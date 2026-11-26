#!/data/data/com.termux/files/usr/bin/bash
set -e
cd "$(dirname "$0")"

printf '\n=== MakeSoundSticker • Termux setup ===\n'
printf '[1/4] Updating package lists...\n'
pkg update -y
printf '[2/4] Installing Node.js, FFmpeg and build tools...\n'
pkg install -y nodejs ffmpeg git python make clang pkg-config

NODE_VERSION="$(node -p 'process.versions.node')"
node -e "const [a,b]=process.versions.node.split('.').map(Number); if(a<22 || (a===22 && b<12)){console.error('Node.js 22.12+ required; found '+process.versions.node); process.exit(1)}"
printf 'Node.js: %s\n' "$NODE_VERSION"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo '[ERROR] ffmpeg tidak ditemukan.'; exit 1
fi
ENCODERS="$(ffmpeg -hide_banner -encoders 2>/dev/null || true)"
if ! printf '%s' "$ENCODERS" | grep -q 'libwebp'; then
  echo '[ERROR] FFmpeg Termux tidak memiliki encoder libwebp.'
  echo 'Jangan lanjut dulu; kirim output: ffmpeg -hide_banner -encoders | grep -E "webp|opus"'
  exit 1
fi
if ! printf '%s' "$ENCODERS" | grep -q 'libopus'; then
  echo '[ERROR] FFmpeg Termux tidak memiliki encoder libopus.'
  echo 'Jangan lanjut dulu; kirim output: ffmpeg -hide_banner -encoders | grep -E "webp|opus"'
  exit 1
fi

printf '[3/4] Installing Node dependencies...\n'
npm install --no-audit --no-fund
printf '[4/4] Checking JavaScript syntax + Malvin Buttons...\n'
node --check run.js
node -e "require('malvin-btns').sendButtons||process.exit(1)" || { echo '[ERROR] malvin-btns (wajib) tidak terpasang benar.'; exit 1; }
chmod +x install.sh
printf '\n[OK] Setup selesai. Jalankan: npm start\n'
