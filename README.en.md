<div align="center">

# 🎧 MakeSoundSticker WA

**Turn videos, audio and voice notes into WhatsApp _sound stickers_ — animated stickers that play audio.**

Created by **NEXORA** · Powered by **Baileys** + **FFmpeg**

[![Platform](https://img.shields.io/badge/Platform-WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://www.whatsapp.com)
[![Runtime](https://img.shields.io/badge/Runtime-Termux-000000?style=for-the-badge&logo=android&logoColor=white)](https://termux.dev)
[![Node.js](https://img.shields.io/badge/Node.js-22.12%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

[🇮🇩 Bahasa Indonesia](README.md) · 🇬🇧 English

</div>

---

## Features

- Convert a video into an animated sticker, with the video's own sound, your own audio / voice note / video, or no sound
- Photos / PNG can become sound stickers too
- Clip ranges (`0-10`, `0-1:10`); audio may be longer than the 10-second animation
- HD guard shrinks oversized stickers automatically
- Up to 10 stickers processed at once, 50 queued
- Settings (pack name, author, signature, size limit) reload without restart

## Requirements

- Android + [Termux](https://github.com/termux/termux-app/releases) (F-Droid or GitHub build, **not** the Play Store one)
- Node.js `>= 22.12.0`, FFmpeg with `libwebp` + `libopus`, Git
- A WhatsApp account and an internet connection
- Also works on Linux / macOS / WSL / VPS with Node.js ≥ 22.12 and FFmpeg installed

## Installation (Termux)

Quick way:

```bash
pkg update -y && pkg upgrade -y
pkg install git -y
git clone https://github.com/USERNAME/REPOSITORY.git
cd REPOSITORY
bash install.sh
```

Manual way:

```bash
pkg install nodejs ffmpeg git -y
git clone https://github.com/USERNAME/REPOSITORY.git
cd REPOSITORY
npm install
npm start
```

Verify the setup:

```bash
node -v                                                   # v22.12.0 or newer
ffmpeg -hide_banner -encoders | grep -E "libwebp|libopus" # both must show up
npm test                                                  # ends with SEMUA LULUS (= all passed)
```

## Pairing

1. Run `npm start` and enter your WhatsApp number with country code (`+62 812-3456-7890`).
2. The bot prints an 8-digit pairing code.
3. On your phone: **WhatsApp → Settings → Linked devices → Link a device → Link with phone number instead**, then enter the code. You have 2 minutes.
4. Wait for `Connected. Bot online.` Pairing is one-time; the session is stored in `auth/`.

## Usage

1. Reply to a video with `.sticker` (or `.sticker 0-10`, `.sticker 0-1:10`). You can also send a video with `.sticker` as the caption.
2. The bot sends a silent preview and asks for the sound:
   - **🔊 Video sound** – audio from the source video
   - **🎵 Own sound** – reply with an audio / voice note / video (only its audio is used)
   - **🔇 No sound** – regular animated sticker
3. Tap a button, or reply `1`, `2`, `3` if buttons don't show.

| Command | Action |
|---|---|
| `.sticker` | Start (reply to a video or photo) |
| `.sticker 0-10` | Same, with a time range |
| `.msscancel` | Cancel the active session |

Range formats: `0-10`, `0-1:10`, `1:05-1:30`, `all` / blank = whole media. Sessions expire after 5 minutes.

## Configuration

`setting.json` is created automatically and reloads on every sticker (no restart needed):

```json
{ "hdGuard": true, "hdGuardMaxKB": 500, "signature": false, "packName": "Sound Sticker", "author": "Nexora" }
```

| Setting | Description |
|---|---|
| `hdGuard` | Automatically lower quality when the sticker is too large |
| `hdGuardMaxKB` | Target max size in KB (min 100) |
| `signature` | Overlay the Nexora signature |
| `packName` / `author` | Sticker pack metadata |

## Run in background

```bash
pkg install tmux -y
termux-wake-lock
tmux new -s sticker
npm start          # detach: Ctrl+B then D · reattach: tmux attach -t sticker
```

## Upload to GitHub

**Option A – git**

```bash
git init && git add . && git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

Use a Personal Access Token as the password.

**Option B – `upload.js`** (no git needed). Create the repo with *Add a README file* ticked, then:

```bash
GITHUB_TOKEN=your_token node upload.js USERNAME/REPOSITORY main
```

**Token:** <https://github.com/settings/personal-access-tokens/new> → select your repo → Repository permissions: **Contents: Read and write** and **Workflows: Read and write**. (Classic token: scopes `repo` + `workflow`.)

`auth/`, `node_modules/`, `tmp/` and `.env` are never uploaded.

## Update

```bash
git pull && npm install
```

## Troubleshooting

| Problem | Fix |
|---|---|
| Node.js 22.12+ required | `pkg upgrade -y`, check `node -v` |
| Missing libwebp / libopus | `pkg upgrade -y && pkg install ffmpeg -y` |
| `npm install` fails | `pkg install git python make clang -y`, retry |
| Pairing failed / timeout | Check number + internet, run `npm start` again |
| Session logged out | `rm -rf auth`, then pair again |
| Bot ignores `.sticker` | Reply to a video/photo, type exactly `.sticker`, check it says `Connected` |
| No buttons | Normal on some WhatsApp versions; use the number menu |
| Sticker has no sound | Embedded audio isn't guaranteed on every WhatsApp version; update WhatsApp |
| `upload.js` 401 / 404 | Bad token / wrong repo name / branch missing |

## Development

```bash
npm run check
npm test
```

Tests use real FFmpeg and a fake WhatsApp socket; no WhatsApp connection required.

## Notes

- Uses an unofficial WhatsApp library (Baileys) plus a custom patch to embed audio in sticker messages. Compatibility may change.
- **Never share or upload `auth/`** — it holds your linked-device credentials.
- Automation may violate WhatsApp's terms and risk account restrictions. Use at your own risk, preferably not on your main number.

## Support & Contact

[Support Nexora on Saweria](https://saweria.co/nexora1734) · [nexorastudios15@gmail.com](mailto:nexorastudios15@gmail.com) · [WhatsApp Developer](https://wa.me/6285842018020)

<div align="center"><sub>MakeSoundSticker WA · v0.5.5 · MIT License · Made by <b>NEXORA</b> 💜</sub></div>
