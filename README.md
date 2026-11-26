<div align="center">

# 🎧 MakeSoundSticker WA

**Ubah video, audio, dan voice note jadi _sound sticker_ WhatsApp — stiker animasi yang bisa bunyi.**

Dibuat oleh **NEXORA** · Powered by **Baileys** + **FFmpeg**

[![Platform](https://img.shields.io/badge/Platform-WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://www.whatsapp.com)
[![Runtime](https://img.shields.io/badge/Runtime-Termux-000000?style=for-the-badge&logo=android&logoColor=white)](https://termux.dev)
[![Node.js](https://img.shields.io/badge/Node.js-22.12%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Version](https://img.shields.io/badge/Version-0.5.5-8A2BE2?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

🇮🇩 Bahasa Indonesia · [🇬🇧 English](README.en.md)

</div>

---

## 📑 Daftar Isi

- [✨ Tentang](#-tentang)
- [🚀 Fitur](#-fitur)
- [🧰 Kebutuhan](#-kebutuhan)
- [📲 Instalasi (Termux)](#-instalasi-termux)
- [🔗 Pairing ke WhatsApp](#-pairing-ke-whatsapp)
- [🎮 Cara Pakai](#-cara-pakai)
- [⚙️ Konfigurasi](#️-konfigurasi)
- [🟢 Jalan di Background](#-jalan-di-background)
- [⬆️ Upload ke GitHub](#️-upload-ke-github)
- [🔄 Update Bot](#-update-bot)
- [🛠️ Troubleshooting](#️-troubleshooting)
- [🧪 Development](#-development)
- [📁 Struktur Proyek](#-struktur-proyek)
- [⚠️ Catatan Penting](#️-catatan-penting)
- [💜 Dukung Nexora](#-dukung-nexora)

---

## ✨ Tentang

**MakeSoundSticker WA** adalah bot WhatsApp yang membuat **stiker animasi dengan suara tertanam**. Kamu bisa pakai suara asli dari video, atau pakai audio / voice note / video lain sebagai sumber suaranya.

Bot berjalan di akun WhatsApp kamu lewat fitur **Perangkat Tertaut** (_Linked Devices_), dan dirancang untuk jalan langsung di HP Android lewat **Termux** — tanpa server, tanpa PC.

## 🚀 Fitur

- 🎞️ Ubah video jadi stiker animasi
- 🔊 Tambahkan suara asli video ke stiker
- 🎵 Pakai audio, voice note, atau video sendiri sebagai sumber suara
- 🖼️ Foto / PNG juga bisa jadi sound sticker (reply dengan `.sticker`)
- ⏱️ Pilih potongan klip dengan range waktu (suara boleh lebih panjang dari animasi)
- 🧩 Tiga pilihan: suara video, suara sendiri, atau stiker tanpa suara
- 🛡️ **HD guard** (aktif secara default) — otomatis mengecilkan ukuran stiker agar bisa diputar
- 👥 Sampai 10 stiker diproses bersamaan, sisanya masuk antrean
- ⏳ Animasi stiker maksimal 10 detik (suara boleh lebih panjang)
- ✍️ Tanda tangan _Nexora_ opsional
- 📦 Nama pack & author stiker bisa diganti
- ⚙️ Setting bisa diubah **tanpa restart**
- 🔁 Tombol interaktif + menu angka sebagai cadangan kalau tombol gagal

## 🧰 Kebutuhan

| Kebutuhan | Keterangan |
|---|---|
| Android + [Termux](https://github.com/termux/termux-app/releases) | Pakai Termux dari **F-Droid** atau **GitHub Releases**, bukan versi Play Store (sudah usang) |
| Node.js `>= 22.12.0` | Diinstal lewat `pkg` |
| FFmpeg dengan encoder `libwebp` + `libopus` | Versi `pkg install ffmpeg` sudah lengkap |
| Git | Untuk clone repo & dependensi Baileys |
| Akun WhatsApp | Untuk pairing perangkat tertaut |
| Internet | Wajib |

> 💡 Bot ini juga bisa jalan di Linux / macOS / Windows (WSL) / VPS selama Node.js ≥ 22.12 dan FFmpeg terpasang. Panduan di bawah fokus ke Termux.

## 📲 Instalasi (Termux)

### Cara cepat (disarankan)

```bash
pkg update -y && pkg upgrade -y
pkg install git -y
git clone https://github.com/USERNAME/REPOSITORY.git
cd REPOSITORY
bash install.sh
```

`install.sh` akan otomatis: memasang Node.js, FFmpeg & build tools → mengecek versi Node → mengecek encoder `libwebp` & `libopus` → menjalankan `npm install` → mengecek sintaks dan paket tombol. Kalau semua `[OK]`, lanjut ke [Pairing](#-pairing-ke-whatsapp).

> Ganti `USERNAME/REPOSITORY` dengan alamat repo GitHub kamu.

### Cara manual

```bash
# 1. Pasang kebutuhan
pkg update -y && pkg upgrade -y
pkg install nodejs ffmpeg git -y

# 2. Ambil proyek
git clone https://github.com/USERNAME/REPOSITORY.git
cd REPOSITORY

# 3. Pasang paket Node
npm install

# 4. Jalankan
npm start
```

Kalau kamu download **ZIP** (bukan clone), ekstrak dulu lalu masuk ke foldernya:

```bash
pkg install unzip -y
unzip soundsticker.zip
cd soundsticker
npm install
```

### Cek instalasi

```bash
node -v          # harus v22.12.0 atau lebih baru
ffmpeg -version  # harus ada
ffmpeg -hide_banner -encoders | grep -E "libwebp|libopus"   # keduanya harus muncul
npm test         # semua harus "ok" dan diakhiri SEMUA LULUS
```

## 🔗 Pairing ke WhatsApp

1. Jalankan bot:
   ```bash
   npm start
   ```
2. Masukkan nomor WhatsApp kamu (kode negara, tanpa spasi pun boleh), contoh:
   ```
   Nomor WhatsApp (contoh +62 812-3456-7890): +62 812-3456-7890
   ```
   Format `0812…` otomatis diubah jadi `62812…`.
3. Bot menampilkan **kode pairing 8 digit**:
   ```
   ╭──────────────────────────────╮
   │  PAIRING CODE (8 DIGIT)      │
   │       ABCD-1234              │
   ╰──────────────────────────────╯
   ```
4. Di HP kamu buka **WhatsApp → Pengaturan → Perangkat tertaut → Tautkan perangkat → Tautkan dengan nomor telepon saja**, lalu masukkan kodenya.
5. Tunggu sampai muncul `Connected. Bot online.` ✅

> ⏱️ Kamu punya **2 menit** untuk memasukkan kode. Kalau kelewat, sesi pairing dibersihkan otomatis — tinggal jalankan `npm start` lagi.
>
> Pairing hanya sekali. Sesi tersimpan di folder `auth/`, jadi run berikutnya langsung online.

## 🎮 Cara Pakai

Perintah bisa dikirim dari chat mana saja (pribadi maupun grup) lewat akun yang tertaut.

### 1. Bikin sound sticker dari video

1. **Reply** sebuah video dengan:
   ```
   .sticker
   ```
   atau tentukan potongan klip:
   ```
   .sticker 0-10
   .sticker 0-1:10
   ```
   Kamu juga bisa kirim video langsung dengan caption `.sticker`.
2. Bot mengirim **preview stiker tanpa suara** beserta pilihan:
   - **🔊 Suara video** — pakai audio dari video aslinya
   - **🎵 Suara sendiri** — reply prompt bot dengan audio / voice note / video. Kalau video, hanya suaranya yang dipakai
   - **🔇 Tanpa suara** — stiker animasi biasa
3. Tekan tombol, **atau balas angka** `1`, `2`, `3` kalau tombol tidak muncul.

### 2. Pakai suara sendiri

Pilih **Suara sendiri**, lalu kirim/reply audio, voice note, atau video yang mau dipakai. Tambahkan range di caption/teks kalau perlu:

```text
0-10
0-1:10
```

Kosongkan range untuk memakai seluruh audio. **Suara boleh lebih panjang dari animasi stiker.**

### 3. Stiker dari foto

Reply foto / PNG dengan `.sticker`, pilih **Suara sendiri**, lalu kirim audionya. Hasilnya stiker foto yang berbunyi.

### Format range waktu

| Format | Artinya |
|---|---|
| `0-10` | Detik 0 sampai 10 |
| `0-1:10` | Detik 0 sampai menit 1 detik 10 |
| `1:05-1:30` | Menit 1 detik 5 sampai menit 1 detik 30 |
| `all`, `semua`, `full`, atau kosong | Seluruh durasi media |

### Daftar perintah

| Perintah | Fungsi |
|---|---|
| `.sticker` | Mulai bikin sticker (reply video / foto) |
| `.sticker 0-10` | Sama, dengan range waktu |
| `.msscancel` | Batalkan sesi yang sedang berjalan |

### Aturan & batas

| Hal | Batas |
|---|---|
| Durasi animasi stiker | Maksimal **10 detik** |
| Durasi suara | Bebas (boleh lebih panjang dari stiker) |
| Proses bersamaan | **10** sekaligus |
| Antrean | Maksimal **50** job |
| Jeda antar perintah (per orang) | 4 detik |
| Sesi menunggu pilihan | Kedaluwarsa otomatis setelah **5 menit** |
| Pesan lama (> 60 detik) | Diabaikan (anti-replay saat reconnect) |

## ⚙️ Konfigurasi

File `setting.json` dibuat otomatis saat pertama jalan. **Perubahan langsung berlaku tanpa restart.**

```json
{
  "hdGuard": true,
  "hdGuardMaxKB": 500,
  "signature": false,
  "packName": "Sound Sticker",
  "author": "Nexora"
}
```

| Setting | Default | Fungsi |
|---|---|---|
| `hdGuard` | `true` | Turunkan kualitas otomatis kalau ukuran stiker terlalu besar |
| `hdGuardMaxKB` | `500` | Target ukuran maksimal stiker (KB), minimal `100` |
| `signature` | `false` | Tampilkan tulisan "By Nexora" di bawah stiker (`nexora-sign.png`) |
| `packName` | `Sound Sticker` | Nama pack di info stiker WhatsApp (baris atas) |
| `author` | `Nexora` | Nama pembuat di info stiker WhatsApp (baris bawah) |

Edit di Termux:

```bash
nano setting.json
```

Kalau `hdGuard` aktif, bot bisa menurunkan resolusi isi, frame rate, dan kualitas encoding secara bertahap (maksimal 6 langkah) agar stiker besar tetap lancar diputar. Kanvas tetap 512×512.

Kalau `setting.json` rusak (JSON tidak valid), bot otomatis memakai nilai default.

## 🟢 Jalan di Background

Supaya bot tidak mati saat layar Termux ditutup:

```bash
pkg install tmux -y
termux-wake-lock          # cegah Android menidurkan Termux
tmux new -s sticker       # buat sesi
npm start                 # jalankan bot di dalamnya
```

- **Keluar tanpa mematikan bot:** tekan `Ctrl+B`, lepas, lalu tekan `D`
- **Kembali ke bot:** `tmux attach -t sticker`
- **Hentikan bot:** masuk ke sesi, lalu `Ctrl+C`

Di HP tertentu (Xiaomi, Oppo, Vivo, dll.) matikan **optimasi baterai** untuk Termux agar tidak dimatikan sistem.

## ⬆️ Upload ke GitHub

Pilih salah satu cara. Di semua cara, folder `auth/`, `node_modules/`, `tmp/`, dan file `.env` **tidak ikut terupload** (sudah ada di `.gitignore`).

### Cara A — Git biasa (paling umum)

1. Buat repo baru di <https://github.com/new> (kosong, tanpa README/license).
2. Di folder proyek:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/USERNAME/REPOSITORY.git
   git push -u origin main
   ```
3. Saat diminta password, pakai **Personal Access Token** (bukan password akun) — lihat [cara membuat token](#membuat-token-github).

> Pertama kali pakai git? Set identitas dulu:
> ```bash
> git config --global user.name "Nama Kamu"
> git config --global user.email "email@kamu.com"
> ```

### Cara B — Script `upload.js` (tanpa git)

Cocok kalau kamu tidak mau install git. Script ini memakai GitHub API.

1. Buat repo di GitHub dan **centang "Add a README file"** supaya branch `main` sudah ada.
2. Buat [token GitHub](#membuat-token-github).
3. Jalankan:
   ```bash
   GITHUB_TOKEN=ghp_tokenkamu node upload.js USERNAME/REPOSITORY main
   ```
4. Ketik `y` untuk konfirmasi. Script akan mengupload file satu per satu:
   ```
   [1/13] Uploaded .gitattributes
   [2/13] Uploaded .github/workflows/ci.yml
   ...
   Done! 13 file(s) uploaded to USERNAME/REPOSITORY (main).
   ```

Token hanya dibaca dari environment dan **tidak pernah ditulis ke disk**. File `upload.js` sendiri tidak ikut diupload.

### Cara C — Lewat website (tanpa terminal)

1. Buat repo baru di GitHub.
2. Klik **Add file → Upload files**.
3. Drag & drop semua isi folder proyek (**jangan** sertakan `auth/` dan `node_modules/`).
4. Klik **Commit changes**.

> ⚠️ Upload via website tidak mendukung folder tersembunyi di beberapa browser. Kalau `.github/` dan `.gitignore` tidak ikut, pakai Cara A atau B.

### Membuat token GitHub

1. Buka <https://github.com/settings/personal-access-tokens/new> (fine-grained token).
2. **Repository access:** pilih _Only select repositories_ → repo kamu.
3. **Permissions → Repository permissions:**
   - **Contents:** `Read and write`
   - **Workflows:** `Read and write` (karena repo ini punya `.github/workflows/ci.yml`)
4. Klik **Generate token**, lalu salin tokennya.

Pakai **classic token**? Centang scope `repo` dan `workflow`.

> 🔒 Perlakukan token seperti password. Jangan di-commit, jangan dibagikan. Hapus tokennya di GitHub setelah selesai kalau tidak dipakai lagi.

### Setelah repo jadi

- Ganti `USERNAME/REPOSITORY` di README ini dengan alamat repo kamu.
- Tab **Actions** di GitHub akan menjalankan tes otomatis (`npm test`) setiap kali kamu push.

## 🔄 Update Bot

Kalau kamu install lewat `git clone`:

```bash
cd REPOSITORY
git pull
npm install
```

Lalu jalankan ulang `npm start`. Sesi di `auth/` dan `setting.json` kamu tetap aman.

## 🛠️ Troubleshooting

| Masalah | Solusi |
|---|---|
| `Node.js 22.12+ required` | Update: `pkg upgrade -y`, lalu cek `node -v` |
| `FFmpeg Termux tidak memiliki encoder libwebp/libopus` | `pkg upgrade -y && pkg install ffmpeg -y`, lalu cek lagi dengan `ffmpeg -hide_banner -encoders \| grep -E "webp\|opus"` |
| `npm install` gagal / error `git` | Pastikan `git` terpasang: `pkg install git python make clang -y`, lalu ulangi |
| `Request pairing gagal` | Cek internet, pastikan nomor benar (dengan kode negara), jalankan ulang `npm start` |
| `Pairing timeout (2 menit)` | Masukkan kode lebih cepat; jalankan `npm start` lagi |
| `Session logged out` | Hapus sesi lama: `rm -rf auth`, lalu pairing ulang |
| Bot tidak membalas `.sticker` | Pastikan perintahnya **reply ke video/foto**, ketik persis `.sticker` (diawali titik), dan bot terlihat `Connected` di Termux |
| Tombol tidak muncul | Normal di beberapa versi WhatsApp — bot otomatis kirim menu angka, balas `1`, `2`, atau `3` |
| `Range melewati durasi media` | Range yang kamu tulis lebih panjang dari durasi video/audio |
| `Range tidak valid` | Pakai format `0-10` atau `0-1:10`; angka akhir harus lebih besar dari awal |
| Stiker ada tapi tidak bunyi | Fitur suara tertanam tidak dijamin di semua versi WhatsApp. Update WhatsApp ke versi terbaru; coba buka di HP lain |
| Stiker tidak mau terkirim / ukuran besar | Pastikan `hdGuard` aktif, turunkan `hdGuardMaxKB`, atau pakai range lebih pendek |
| `upload.js`: `401 Bad credentials` | Token salah / kedaluwarsa — buat token baru |
| `upload.js`: `404 Not Found` | Nama repo salah, atau branch belum ada (centang "Add a README file" saat buat repo) |
| `upload.js`: `403 / 404` saat upload `.github/workflows` | Token belum punya izin **Workflows** (lihat [token](#membuat-token-github)) |
| `Resource not accessible by personal access token` | Token tidak diberi akses ke repo itu / izin **Contents** kurang |

Masih mentok? Buka **Issues** di repo ini dan sertakan output error dari Termux (**hapus data sensitif dulu**).

## 🧪 Development

```bash
npm run check   # cek sintaks run.js
npm test        # tes alur lengkap (pakai FFmpeg asli + socket WhatsApp palsu)
```

Yang dites: anti-spam, alur video → pilihan suara, suara sendiri, video sebagai sumber suara, foto + suara, parsing range, HD guard, fallback tombol, pesan lama diabaikan, dan **validasi audio tertanam di StickerMessage (protobuf field 26)**. Tes tidak butuh koneksi WhatsApp, cukup Node.js dan FFmpeg.

## 📁 Struktur Proyek

```
.
├── run.js              # Bot utama (koneksi, pairing, flow, FFmpeg, kirim stiker)
├── test.js             # Tes otomatis
├── upload.js           # Uploader ke GitHub via API (tidak ikut terupload)
├── install.sh          # Installer sekali jalan untuk Termux
├── setting.json        # Konfigurasi (hot-reload)
├── nexora-sign.png     # Overlay tanda tangan opsional
├── package.json
├── package-lock.json
├── .github/workflows/  # CI: jalankan npm test di GitHub Actions
├── LICENSE
├── README.md           # Dokumentasi (Indonesia)
└── README.en.md        # Documentation (English)

# dibuat otomatis saat bot jalan (tidak di-commit)
├── auth/               # SESI WHATSAPP — RAHASIA
├── tmp/                # File sementara
└── node_modules/
```

## ⚠️ Catatan Penting

- Proyek ini memakai library WhatsApp **tidak resmi** (Baileys) dan patch khusus untuk menanam audio di pesan stiker. Kompatibilitas bisa berubah kapan saja; suara tertanam dan tombol interaktif **tidak dijamin** jalan di semua versi/klien WhatsApp.
- Kalau tombol gagal, bot otomatis memberi menu angka sebagai gantinya.
- `malvin-btns` adalah dependensi wajib. Periksa dependensi dan kodenya sebelum dijalankan.
- 🔐 **Jangan pernah membagikan atau mengupload folder `auth/`.** Isinya kredensial perangkat tertaut — siapa pun yang memilikinya bisa mengakses akun WhatsApp kamu.
- Siapa pun yang mengirim pesan ke akun tertaut bisa memakai bot. Gunakan dengan bijak, terutama di grup.
- Otomasi pada WhatsApp bisa melanggar Ketentuan Layanan mereka dan berisiko akun dibatasi. **Gunakan atas tanggung jawab sendiri**, sebaiknya jangan pakai nomor utama yang penting.

## 💜 Dukung Nexora

Proyek ini dibuat dengan waktu, eksperimen, dan banyak testing. Kalau MakeSoundSticker bermanfaat dan kamu mau mendukung pengembangan berikutnya, donasi bersifat **sepenuhnya opsional** — tapi sangat dihargai. 🙏

<div align="center">

[![Support Nexora](https://img.shields.io/badge/Support%20Nexora-Saweria-8A2BE2?style=for-the-badge)](https://saweria.co/nexora1734)

</div>

## 👤 Kredit & Kontak

<div align="center">

**Developer: NEXORA**

[nexorastudios15@gmail.com](mailto:nexorastudios15@gmail.com) · [WhatsApp Developer](https://wa.me/6285842018020) · [Donasi / Support](https://saweria.co/nexora1734)

</div>

---

<div align="center">
  <sub>Dibuat dengan usaha, kesabaran, dan passion oleh <b>NEXORA</b> 💜</sub><br>
  <sub>MakeSoundSticker WA · v0.5.5 · Lisensi MIT</sub>
</div>
