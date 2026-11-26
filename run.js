'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
let makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, prepareWAMessageMedia, generateWAMessageFromContent, proto;
const sentMessageIds = new Set();
async function loadBaileys() {
  // Standard Baileys + a schema-level protobuf patch for embedded sound stickers.
  const baileys = await import('@whiskeysockets/baileys');
  makeWASocket = baileys.makeWASocket || baileys.default;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason;
  downloadMediaMessage = baileys.downloadMediaMessage;
  prepareWAMessageMedia = baileys.prepareWAMessageMedia;
  generateWAMessageFromContent = baileys.generateWAMessageFromContent;
  proto = baileys.proto;
  installStickerAudioPatch(proto);
}


// WhatsApp StickerMessage embeds its AudioMessage in protobuf field 26.
// Baileys' generated schema does not expose this field, so append the encoded
// AudioMessage to the StickerMessage encoder only for the registered sticker.
const STICKER_AUDIO_FIELD = 26;
const STICKER_AUDIO_TAG = (STICKER_AUDIO_FIELD << 3) | 2;
const PATCHED = Symbol.for('makesoundsticker.encode-patched');
const pendingAudio = new Map();
const audioKey = hash => Buffer.from(hash).toString('base64');
function attachStickerAudio(hash, bytes) { pendingAudio.set(audioKey(hash), bytes); }
function detachStickerAudio(hash) { pendingAudio.delete(audioKey(hash)); }

function readProtoVarint(buffer, offset) {
  let value = 0n, shift = 0n, pos = offset;
  while (pos < buffer.length) {
    const byte = buffer[pos++];
    value |= BigInt(byte & 0x7f) << shift;
    if (!(byte & 0x80)) return { value: Number(value), next: pos };
    shift += 7n;
    if (shift > 63n) break;
  }
  throw new Error('Malformed protobuf varint');
}
function protoBytesField(buffer, wantedField) {
  let pos = 0;
  while (pos < buffer.length) {
    const tag = readProtoVarint(buffer, pos); pos = tag.next;
    const field = Math.floor(tag.value / 8), wire = tag.value & 7;
    if (wire === 2) {
      const length = readProtoVarint(buffer, pos); pos = length.next;
      const end = pos + length.value;
      if (end > buffer.length) throw new Error('Malformed protobuf length');
      const value = buffer.subarray(pos, end); pos = end;
      if (field === wantedField) return value;
    } else if (wire === 0) pos = readProtoVarint(buffer, pos).next;
    else if (wire === 1) pos += 8;
    else if (wire === 5) pos += 4;
    else throw new Error(`Unsupported protobuf wire type ${wire}`);
  }
  return null;
}
function hasEmbeddedAudio(encodedMessage) {
  const stickerBytes = protoBytesField(encodedMessage, 26); // Message.stickerMessage
  return !!(stickerBytes && protoBytesField(stickerBytes, STICKER_AUDIO_FIELD));
}

function installStickerAudioPatch(protoNamespace) {
  const StickerMessage = protoNamespace?.Message?.StickerMessage;
  if (!StickerMessage?.encode) throw new Error('Baileys StickerMessage encoder tidak ditemukan.');
  if (StickerMessage.encode[PATCHED]) return;
  const originalEncode = StickerMessage.encode;
  const patchedEncode = function(message, writer) {
    const result = originalEncode.call(this, message, writer);
    try {
      if (message?.fileSha256) {
        const audioBytes = pendingAudio.get(audioKey(message.fileSha256));
        if (audioBytes) result.uint32(STICKER_AUDIO_TAG).bytes(audioBytes);
      }
    } catch (error) { log('Embedded audio patch:', error.message); }
    return result;
  };
  patchedEncode[PATCHED] = true;
  StickerMessage.encode = patchedEncode;
}

const ROOT = __dirname;
const AUTH = path.join(ROOT, 'auth');
const TEMP = path.join(ROOT, 'tmp');

const CFG = {
  cooldownMs: 4000,              // jeda minimum antar perintah .sticker dari orang yang sama
  noticeThrottleMs: 8000,        // balasan "sibuk"/"salah format" maksimal 1x per jeda ini
  sessionTtlMs: 5 * 60 * 1000,   // sesi menunggu pilihan otomatis dibatalkan setelah ini
  maxMessageAgeSec: 60,          // pesan lama (replay saat reconnect) diabaikan
  maxQueue: 50,                  // antrean ffmpeg maksimal (di luar yang sedang jalan)
  concurrency: 10,               // maksimal 10 proses ffmpeg barengan, sisanya antre
  maxAnimSec: 10,                // durasi maksimal animasi stiker (suara boleh lebih panjang)
  ffmpegTimeoutMs: 600000,
};

const rl = require.main === module ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
const ask = q => new Promise(resolve => rl.question(q, answer => resolve(answer.trim())));
const sessions = new Map();      // key = chat|pengirim -> sesi
const lastCommandAt = new Map(); // key -> timestamp perintah terakhir
const lastNoticeAt = new Map();  // key -> timestamp balasan peringatan terakhir
const seenIds = new Set();       // dedup message id (Baileys bisa mengirim ulang)
let socket;
let reconnectTimer;
let isStarting = false;
let malvin = null;

// Titik injeksi supaya alur bisa diuji tanpa WhatsApp.
const deps = {
  mediaBuffer: async (message) => {
    if (!message?.key || !message?.message) throw new Error('Pesan media tidak lengkap (key/message kosong). Reply langsung ke video/audio asli.');
    const content = unwrapMessageContent(message.message);
    return downloadMediaMessage({ key: message.key, message: content }, 'buffer', {}, { logger: console });
  },
  sendSoundSticker: (...a) => sendSoundSticker(...a),
};

function cleanNumber(raw) {
  let n = String(raw || '').replace(/[+\s()-]/g, '').replace(/[^0-9]/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1); // Indonesia local format
  return n;
}
function ensureDirs() { fs.mkdirSync(TEMP, { recursive: true }); }
function clearTemp() {
  try { for (const f of fs.readdirSync(TEMP)) fs.rmSync(path.join(TEMP, f), { force: true, recursive: true }); } catch {}
}
function log(...a) { console.log('[MakeSoundSticker]', ...a); }
function tmpFile(ext) { ensureDirs(); return path.join(TEMP, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`); }
function rmQuiet(...files) { for (const f of files) if (f) try { fs.unlinkSync(f); } catch {} }

function unwrapMessageContent(content) {
  let c = content || {};
  for (let i = 0; i < 5; i++) {
    c = c.ephemeralMessage?.message || c.viewOnceMessage?.message || c.viewOnceMessageV2?.message || c.viewOnceMessageV2Extension?.message || c.documentWithCaptionMessage?.message || c;
    if (!c) break;
  }
  return c || {};
}
function getText(m) {
  const msg = unwrapMessageContent(m.message);
  return msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption || '';
}
function getContextInfo(m) {
  const msg = unwrapMessageContent(m.message);
  return msg.extendedTextMessage?.contextInfo || msg.imageMessage?.contextInfo || msg.videoMessage?.contextInfo || msg.documentMessage?.contextInfo || msg.buttonsResponseMessage?.contextInfo || msg.interactiveResponseMessage?.contextInfo || null;
}
function getReply(m) { return getContextInfo(m)?.quotedMessage || null; }
function getReplyKey(m) { return getContextInfo(m)?.stanzaId || null; }
// Media yang bisa dipakai sebagai sumber suara: audio, voice note, video (hanya suaranya), dokumen audio/video.
function pickMedia(content) {
  const c = unwrapMessageContent(content);
  if (c.audioMessage || c.videoMessage) return c.audioMessage || c.videoMessage;
  if (c.documentMessage && /^(audio|video)\//.test(c.documentMessage.mimetype || '')) return c.documentMessage;
  return null;
}
// Range suara sendiri: kosong / bukan range -> seluruh durasi (boleh lebih panjang dari stiker).
function customRange(text) {
  const t = String(text || '').replace(/^\.sticker\b/i, '').trim();
  if (!t || !looksLikeRange(t)) return parseRange('all');
  return parseRange(t); // null kalau format range salah
}

function buttonId(m) {
  const msg = unwrapMessageContent(m.message);
  const raw = msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  let parsed = '';
  try { const p = JSON.parse(raw || '{}'); parsed = p.id || p.selectedId || p.buttonId || ''; } catch {}
  return msg.buttonsResponseMessage?.selectedButtonId || msg.templateButtonReplyMessage?.selectedId || msg.listResponseMessage?.singleSelectReply?.selectedRowId || parsed || '';
}

// ---------- kirim pesan ----------
function remember(id) {
  if (!id) return;
  sentMessageIds.add(id);
  if (sentMessageIds.size > 500) sentMessageIds.delete(sentMessageIds.values().next().value);
}
async function sendTracked(jid, content, options) {
  const result = await socket.sendMessage(jid, content, options);
  remember(result?.key?.id);
  return result;
}
// Reaksi emoji = konfirmasi instan tanpa menambah pesan teks (tidak ikut "spam").
async function react(jid, key, emoji) {
  try { await socket.sendMessage(jid, { react: { text: emoji, key } }); } catch {}
}
// Balasan peringatan dibatasi supaya bot tidak ikut membanjiri chat.
async function notice(key, jid, text, quoted) {
  const now = Date.now();
  if (now - (lastNoticeAt.get(key) || 0) < CFG.noticeThrottleMs) return;
  lastNoticeAt.set(key, now);
  await sendTracked(jid, { text }, quoted ? { quoted } : {});
}

// ---------- ffmpeg + antrean ----------
function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => { err += '\nffmpeg timeout'; p.kill('SIGKILL'); }, CFG.ffmpegTimeoutMs);
    p.stderr.on('data', d => { err = (err + d.toString()).slice(-2000); });
    p.on('error', e => { clearTimeout(timer); reject(e); });
    p.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(err.slice(-1200) || `ffmpeg exited ${code}`)); });
  });
}
let running = 0;
const waiting = [];
function queueFull() { return waiting.length >= CFG.maxQueue; }
function enqueue(task) {
  return new Promise((resolve, reject) => { waiting.push({ task, resolve, reject }); pump(); });
}
function pump() {
  while (running < CFG.concurrency && waiting.length) {
    const job = waiting.shift();
    running++;
    Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => { running--; pump(); });
  }
}

// ---------- setting.json ----------
// Dibaca ulang setiap bikin sticker, jadi ubah file lalu langsung berlaku (tanpa restart).
const SETTINGS_FILE = path.join(ROOT, 'setting.json');
const SIGN_FILE = path.join(ROOT, 'nexora-sign.png'); // overlay 512x512 transparan: tulisan "By Nexora" di bawah
const DEFAULT_SETTINGS = {
  hdGuard: true,      // true = turunkan kualitas otomatis kalau sticker kebesaran (video HD / durasi panjang)
  hdGuardMaxKB: 500,  // batas ukuran sticker animasi; di atas ini WhatsApp sering gagal memutar
  signature: false,   // true = tulisan "By Nexora" ikut digambar di bawah sticker (file nexora-sign.png)
  packName: 'Sound Sticker', // judul pack yang tampil di info sticker WhatsApp (baris atas)
  author: 'Nexora',          // pembuat sticker yang tampil di info sticker WhatsApp (baris bawah)
};
const truthy = v => v === true || /^(true|on|1|yes|ya)$/i.test(String(v ?? '').trim());
function loadSettings() {
  let user = {};
  try {
    if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2) + '\n');
    else user = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch (e) { log('setting.json tidak valid, pakai default:', e.message); }
  const kb = Number(user.hdGuardMaxKB);
  return {
    hdGuard: truthy(user.hdGuard ?? DEFAULT_SETTINGS.hdGuard),
    hdGuardMaxKB: Number.isFinite(kb) && kb >= 100 ? kb : DEFAULT_SETTINGS.hdGuardMaxKB,
    signature: truthy(user.signature ?? DEFAULT_SETTINGS.signature),
    packName: String(user.packName ?? DEFAULT_SETTINGS.packName).slice(0, 60) || DEFAULT_SETTINGS.packName,
    author: String(user.author ?? DEFAULT_SETTINGS.author).slice(0, 60) || DEFAULT_SETTINGS.author,
  };
}
// Tangga kualitas untuk HD guard. Langkah pertama = kualitas normal (sama seperti saat guard mati).
// Langkah berikutnya: isi gambar diturunkan ke ~360px (kayak 360p di YouTube) lalu diperbesar lagi ke kanvas 512,
// jadi ukuran file mengecil tapi sticker tetap 512x512.
const QUALITY_LADDER = [
  { side: 512, quality: 65, fps: 15 },
  { side: 448, quality: 55, fps: 15 },
  { side: 400, quality: 50, fps: 12 },
  { side: 360, quality: 45, fps: 12 },
  { side: 360, quality: 35, fps: 10 },
  { side: 360, quality: 25, fps: 8 },
];

// ---------- range ----------
function parseTimeToken(token) {
  token = String(token || '').trim();
  const minuteDot = token.match(/^(\d+)\.(\d{2})$/);
  if (minuteDot && Number(minuteDot[2]) < 60) return Number(minuteDot[1]) * 60 + Number(minuteDot[2]);
  if (/^\d+(?:\.\d+)?$/.test(token)) return Number(token);
  const parts = token.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d+(?:\.\d+)?$/.test(p))) return NaN;
  if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
  return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
}
function parseRange(s) {
  const raw = String(s || '').trim().toLowerCase();
  if (raw === '' || raw === 'all' || raw === 'semua' || raw === 'full') return { all: true, start: 0, end: null };
  const match = raw.match(/^(.+?)\s*-\s*(.+)$/);
  if (!match) return null;
  const start = parseTimeToken(match[1]), end = parseTimeToken(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return null;
  return { start, end };
}
const looksLikeRange = t => /^(all|semua|full)$/i.test(t) || /^[\d:.\s\-–]+$/.test(t);
function mediaDuration(inputPath) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', inputPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('error', reject);
    p.on('close', code => code === 0 && Number(out.trim()) > 0 ? resolve(Number(out.trim())) : reject(new Error(err || 'ffprobe gagal membaca durasi')));
  });
}
async function normalizeRange(range, inputPath) {
  const duration = await mediaDuration(inputPath);
  if (range.all) return { start: 0, end: duration };
  if (range.end > duration + 0.15) throw new Error(`Range melewati durasi media (${duration.toFixed(2)} detik).`);
  return { start: range.start, end: Math.min(range.end, duration) };
}
function stickerFilter({ side, fps }) {
  const up = side < 512 ? ',scale=512:512:flags=bicubic' : '';
  return `crop=min(iw\\,ih):min(iw\\,ih),scale=${side}:${side}:force_original_aspect_ratio=decrease,pad=${side}:${side}:(ow-iw)/2:(oh-ih)/2:color=0x00000000${up},fps=${fps}`;
}
// Tanam metadata sticker WhatsApp (nama pack + pembuat) ke chunk EXIF di webp.
function addStickerExif(webp, packName, author) {
  if (webp.length < 30 || webp.toString('ascii', 0, 4) !== 'RIFF' || webp.toString('ascii', 8, 12) !== 'WEBP') return webp;
  // buang chunk EXIF lama kalau ada, cari VP8X
  const chunks = [];
  let off = 12, hasVp8x = false;
  while (off + 8 <= webp.length) {
    const id = webp.toString('ascii', off, off + 4);
    const size = webp.readUInt32LE(off + 4);
    const end = off + 8 + size + (size & 1);
    if (id === 'VP8X') hasVp8x = true;
    if (id !== 'EXIF') chunks.push(Buffer.from(webp.subarray(off, Math.min(end, webp.length))));
    off = end;
  }
  if (!hasVp8x) return webp; // sticker animasi dari libwebp selalu punya VP8X
  const json = Buffer.from(JSON.stringify({
    'sticker-pack-id': 'com.nexora.makesoundsticker',
    'sticker-pack-name': packName,
    'sticker-pack-publisher': author,
    emojis: [''],
  }), 'utf8');
  const head = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  head.writeUInt32LE(json.length, 14);
  const exifData = Buffer.concat([head, json]);
  const exifHdr = Buffer.alloc(8);
  exifHdr.write('EXIF', 0, 'ascii'); exifHdr.writeUInt32LE(exifData.length, 4);
  const exifChunk = Buffer.concat([exifHdr, exifData, exifData.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  const vp8x = chunks.find(c => c.toString('ascii', 0, 4) === 'VP8X');
  vp8x[8] |= 0x08; // flag EXIF
  const body = Buffer.concat([Buffer.from('WEBP', 'ascii'), ...chunks, exifChunk]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 'ascii'); riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}
async function makeSilentSticker(videoPath, range, outWebp) {
  const n = await normalizeRange(range, videoPath);
  const st = loadSettings();
  const steps = st.hdGuard ? QUALITY_LADDER : QUALITY_LADDER.slice(0, 1);
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const sign = st.signature && fs.existsSync(SIGN_FILE);
    if (st.signature && !sign) log('nexora-sign.png tidak ditemukan, sticker dibuat tanpa tanda tangan.');
    const inputs = ['-ss', String(n.start), '-i', videoPath, '-t', String(Math.min(n.end - n.start, CFG.maxAnimSec))];
    const filter = sign
      ? ['-i', SIGN_FILE, '-filter_complex', `[0:v]${stickerFilter(step)}[base];[1:v]format=rgba[sig];[base][sig]overlay=0:0:format=auto,format=yuva420p`]
      : ['-vf', stickerFilter(step)];
    await runFFmpeg(['-y', ...inputs, ...filter, '-an', '-loop', '0', '-c:v', 'libwebp', '-quality', String(step.quality), '-preset', 'default', outWebp]);
    if (!st.hdGuard) break;
    const kb = fs.statSync(outWebp).size / 1024;
    if (kb <= st.hdGuardMaxKB) { if (i) log(`HD guard: ${Math.round(kb)}KB @ ${step.side}px (langkah ${i + 1})`); break; }
    log(`HD guard: ${Math.round(kb)}KB > ${st.hdGuardMaxKB}KB, turunkan kualitas (langkah ${i + 1}/${steps.length})`);
  }
  try { fs.writeFileSync(outWebp, addStickerExif(fs.readFileSync(outWebp), st.packName, st.author)); }
  catch (e) { log('Gagal menanam metadata sticker:', e.message); }
  return n;
}
// ---------- foto / PNG ----------
function chunks(buf, start = 12) {
  const list = [];
  for (let o = start; o + 8 <= buf.length;) {
    const size = buf.readUInt32LE(o + 4);
    list.push({ id: buf.toString('latin1', o, o + 4), data: buf.subarray(o + 8, o + 8 + size) });
    o += 8 + size + (size & 1);
  }
  return list;
}
function chunk(id, data) {
  const head = Buffer.alloc(8);
  head.write(id, 0, 'latin1'); head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, Buffer.alloc(data.length & 1)]);
}
const riff = (parts) => chunk('RIFF', Buffer.concat([Buffer.from('WEBP'), ...parts]));
function vp8x(flags, w, h) {
  const d = Buffer.alloc(10);
  d[0] = flags; d.writeUIntLE(w - 1, 4, 3); d.writeUIntLE(h - 1, 7, 3);
  return chunk('VP8X', d);
}
const isAnimated = (buf) => chunks(buf).some((c) => c.id === 'ANMF');

/** Stiker diam 512x512 -> animasi 2 frame identik. Metadata EXIF dipertahankan. */
function toAnimated(buf, size = 512) {
  if (isAnimated(buf)) return buf;
  const all = chunks(buf);
  const image = all.filter((c) => ['ALPH', 'VP8 ', 'VP8L'].includes(c.id));
  if (!image.length) throw new Error('Stiker WebP tidak valid.');
  const exif = all.find((c) => c.id === 'EXIF');
  const head = Buffer.alloc(16);
  head.writeUIntLE(size - 1, 6, 3); head.writeUIntLE(size - 1, 9, 3);
  head.writeUIntLE(500, 12, 3); // durasi frame (ms)
  head[15] = 0x02; // timpa, tanpa blending
  const frame = chunk('ANMF', Buffer.concat([head, ...image.map((c) => chunk(c.id, c.data))]));
  const flags = 0x02 | 0x10 | (exif ? 0x08 : 0);
  return riff([vp8x(flags, size, size), chunk('ANIM', Buffer.alloc(6)), frame, frame, ...(exif ? [chunk('EXIF', exif.data)] : [])]);
}

async function makeImageSticker(imagePath, outWebp) {
  const st = loadSettings();
  await runFFmpeg(['-y', '-i', imagePath, '-frames:v', '1', '-vf', stickerFilter({ side: 512, fps: 1 }).replace(',fps=1', ''), '-c:v', 'libwebp', '-quality', '80', outWebp]);
  try { fs.writeFileSync(outWebp, addStickerExif(toAnimated(fs.readFileSync(outWebp)), st.packName, st.author)); }
  catch (e) { throw new Error('Gagal menyiapkan stiker foto: ' + e.message); }
}
async function extractAudio(inputPath, range, outAudio) {
  const n = await normalizeRange(range, inputPath);
  await runFFmpeg(['-y', '-ss', String(n.start), '-i', inputPath, '-t', String(n.end - n.start),
    '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip', outAudio]);
  return n;
}

// ---------- kirim stiker ----------
async function sendSoundSticker(jid, webp, audio, quoted, seconds) {
  const uploadOptions = { upload: socket.waUploadToServer };
  const audioUpload = await prepareWAMessageMedia({
    audio: fs.readFileSync(audio),
    mimetype: 'audio/ogg; codecs=opus',
    seconds
  }, uploadOptions);
  const stickerUpload = await prepareWAMessageMedia({
    sticker: fs.readFileSync(webp),
    isAnimated: true
  }, uploadOptions);

  const uploadedAudio = audioUpload.audioMessage;
  const audioBytes = proto.Message.AudioMessage.encode(proto.Message.AudioMessage.create({
    url: uploadedAudio.url,
    mimetype: 'audio/ogg; codecs=opus',
    fileSha256: uploadedAudio.fileSha256,
    fileLength: uploadedAudio.fileLength,
    seconds,
    ptt: true,
    mediaKey: uploadedAudio.mediaKey,
    fileEncSha256: uploadedAudio.fileEncSha256,
    directPath: uploadedAudio.directPath,
    mediaKeyTimestamp: uploadedAudio.mediaKeyTimestamp || Math.floor(Date.now() / 1000)
  })).finish();

  const sticker = stickerUpload.stickerMessage;
  sticker.isAnimated = true;
  sticker.width = 512;
  sticker.height = 512;
  const st = loadSettings();
  sticker.packname = st.packName;
  sticker.author = st.author;
  attachStickerAudio(sticker.fileSha256, audioBytes);
  try {
    const own = socket.user || {};
    const ownJid = jid.endsWith('@lid') && own.lid ? own.lid : own.id;
    const outgoing = generateWAMessageFromContent(jid, { stickerMessage: sticker }, {
      quoted: quoted || undefined,
      userJid: ownJid
    });
    // Fail closed if the encoder did not preserve field 26.
    const encoded = Buffer.from(proto.Message.encode(outgoing.message).finish());
    if (!hasEmbeddedAudio(encoded)) {
      throw new Error('Validasi audio tertanam gagal (StickerMessage.audioMessage field 26 tidak ditemukan).');
    }
    await socket.relayMessage(jid, outgoing.message, { messageId: outgoing.key.id });
    remember(outgoing.key.id);
  } finally {
    detachStickerAudio(sticker.fileSha256);
  }
}
async function sendSilentSticker(jid, webp, quoted) {
  const st = loadSettings();
  await sendTracked(jid, { sticker: fs.readFileSync(webp), isAnimated: true, packname: st.packName, author: st.author }, quoted ? { quoted } : {});
}

// ---------- tombol (Malvin Buttons) ----------
function loadButtons() {
  // Malvin Buttons WAJIB: bot berhenti dengan pesan jelas kalau paketnya tidak ada.
  try { malvin = require('malvin-btns'); }
  catch (e) { console.error('[MakeSoundSticker] malvin-btns wajib terpasang. Jalankan: npm install\n' + e.message); process.exit(1); }
  if (typeof malvin.sendButtons !== 'function') { console.error('[MakeSoundSticker] malvin-btns tidak punya sendButtons (versi tidak cocok).'); process.exit(1); }
  log('Malvin Buttons dimuat.');
}
const IMAGE_TEXT = '\n\n1️⃣ Suara sendiri (kirim audio/video)\n2️⃣ Tidak\n\nTekan tombol, atau balas angka 1, 2.';
const CHOICE_TEXT = '\n\n1️⃣ Suara dari video\n2️⃣ Suara sendiri (kirim audio/video)\n3️⃣ Tidak\n\nTekan tombol, atau balas angka 1, 2, 3.';
async function sendChoiceButtons(jid, quoted, prompt, isImage = false) {
  {
    try {
      const res = await malvin.sendButtons(socket, jid, {
        title: 'NEXORA Sound Sticker',
        text: prompt,
        footer: 'NEXORA',
        buttons: [
          ...(isImage ? [] : [{ id: 'mss_video_sound', text: '🔊 Suara video' }]),
          { id: 'mss_custom_sound', text: '🎵 Suara sendiri' },
          { id: 'mss_no_sound', text: '🔇 Tanpa suara' },
        ],
      }, quoted ? { quoted } : {});
      remember(res?.key?.id);
      return;
    } catch (e) {
      log('Tombol gagal terkirim, kirim menu angka sebagai cadangan:', e.message);
    }
  }
  await sendTracked(jid, { text: prompt + (isImage ? IMAGE_TEXT : CHOICE_TEXT) }, quoted ? { quoted } : {});
}

// ---------- sesi ----------
const keyOf = (jid, sender) => `${jid}|${sender}`;
function endSession(s) {
  if (!s) return;
  clearTimeout(s.timer);
  rmQuiet(s.videoPath, s.webpPath, s.audioPath);
  if (sessions.get(s.key) === s) sessions.delete(s.key);
}
function armExpiry(s) {
  clearTimeout(s.timer);
  s.timer = setTimeout(() => {
    if (s.busy) return armExpiry(s);
    endSession(s);
    sendTracked(s.jid, { text: 'Sesi sound sticker kedaluwarsa. Kirim `.sticker` lagi kalau mau mulai ulang.' }).catch(() => {});
  }, CFG.sessionTtlMs);
  s.timer.unref?.();
}
async function runBusy(s, fn, failLabel) {
  s.busy = true;
  try { await fn(); }
  catch (e) {
    log(failLabel, e.message);
    await sendTracked(s.jid, { text: 'Gagal memproses: ' + e.message }, s.quoted ? { quoted: s.quoted } : {}).catch(() => {});
    endSession(s);
  } finally { s.busy = false; }
}

// ---------- alur utama ----------
async function startFromVideo(jid, sender, m, quotedVideo, videoKey, range, isImage = false) {
  const key = keyOf(jid, sender);
  const old = sessions.get(key);
  if (old?.busy) return notice(key, jid, '⏳ Permintaan sebelumnya masih diproses, tunggu sebentar ya.', m);
  const now = Date.now();
  if (now - (lastCommandAt.get(key) || 0) < CFG.cooldownMs) return; // spam: abaikan diam-diam
  if (queueFull()) return notice(key, jid, 'Antrean penuh, coba lagi sebentar lagi.', m);
  lastCommandAt.set(key, now);
  if (old) endSession(old);

  // Kunci sesi SEBELUM download/encode, supaya perintah berikutnya tidak lolos paralel.
  const s = { key, jid, sender, step: 'working', isImage, busy: true, quoted: m, videoRange: range, started: now };
  sessions.set(key, s);
  armExpiry(s);
  react(jid, m.key, '⏳');
  try {
    const videoMsg = {
      key: { remoteJid: jid, id: videoKey, participant: jid.endsWith('@g.us') ? sender : undefined, fromMe: false },
      message: quotedVideo ? getReply(m) : m.message,
    };
    await enqueue(async () => {
      s.videoPath = tmpFile(isImage ? '.img' : '.mp4');
      s.webpPath = tmpFile('.webp');
      fs.writeFileSync(s.videoPath, await deps.mediaBuffer(videoMsg)); // download sekali saja
      if (isImage) await makeImageSticker(s.videoPath, s.webpPath);
      else await makeSilentSticker(s.videoPath, s.videoRange, s.webpPath);
    });
    await sendSilentSticker(jid, s.webpPath, m);
    s.step = 'soundChoice';
    await sendChoiceButtons(jid, m, isImage ? 'Stiker foto sudah dibuat! Mau dikasih suara sendiri?' : 'Stiker animasi tanpa suara sudah dibuat! Mau dibuat bersuara?', isImage);
    react(jid, m.key, '✅');
  } catch (e) {
    log('Sticker error:', e.message);
    await sendTracked(jid, { text: 'Gagal membuat sticker: ' + e.message }, { quoted: m }).catch(() => {});
    react(jid, m.key, '❌');
    endSession(s);
    return;
  } finally { s.busy = false; }
  armExpiry(s);
}

async function finishOriginal(s) {
  await runBusy(s, async () => {
    s.audioPath = tmpFile('.ogg');
    const actual = await enqueue(() => extractAudio(s.videoPath, s.videoRange, s.audioPath)); // webp sudah ada -> tidak encode ulang
    await deps.sendSoundSticker(s.jid, s.webpPath, s.audioPath, s.quoted, Math.max(1, Math.ceil(actual.end - actual.start)));
    endSession(s);
  }, 'Video sound flow error:');
}
async function finishCustom(s) {
  await runBusy(s, async () => {
    const src = tmpFile('.bin');
    s.audioPath = tmpFile('.ogg');
    try {
      fs.writeFileSync(src, await deps.mediaBuffer(s.audioMessage));
      const actual = await enqueue(() => extractAudio(src, s.audioRange, s.audioPath));
      await deps.sendSoundSticker(s.jid, s.webpPath, s.audioPath, s.quoted, Math.max(1, Math.ceil(actual.end - actual.start)));
    } finally { rmQuiet(src); }
    endSession(s);
  }, 'Custom sound flow error:');
}

function pickChoice(action, isImage = false) {
  const a = String(action || '').trim().toLowerCase();
  if (isImage) {
    if (['mss_custom_sound', '1', 'custom'].includes(a)) return 'custom';
    if (['mss_no_sound', '2', 'no', 'tidak', 'cancel'].includes(a)) return 'none';
    return null;
  }
  if (['mss_video_sound', '1', 'video', 'original'].includes(a)) return 'video';
  if (['mss_custom_sound', '2', 'custom'].includes(a)) return 'custom';
  if (['mss_no_sound', '3', 'no', 'tidak', 'cancel'].includes(a)) return 'none';
  return null;
}

async function processFlow(s, m, action) {
  if (s.busy) {
    // Sedang memproses: abaikan input (tombol ditekan berkali-kali tidak jadi job ganda).
    if (pickChoice(action, s.isImage) || looksLikeRange(action)) await notice(s.key, s.jid, '⏳ Masih diproses, tunggu sebentar ya.', m);
    return;
  }
  const { jid } = s;
  if (s.step === 'soundChoice') {
    const choice = pickChoice(action, s.isImage);
    if (!choice) return; // obrolan biasa: jangan dibalas (anti-spam)
    if (choice === 'video') {
      react(jid, m.key, '⏳');
      return finishOriginal(s);
    }
    if (choice === 'custom') {
      s.step = 'customAudio';
      armExpiry(s);
      return void await sendTracked(jid, { text: 'Oke! Balas (reply) pesan ini dengan *audio / voice note / video* yang suaranya mau dipakai.\nKalau video, yang diambil cuma suaranya.\nDurasi suara boleh lebih panjang dari stiker.\n\n_Opsional: tulis range di caption/teks, contoh `0-10` atau `0-1:10`. Kosong = semua._' }, { quoted: m });
    }
    endSession(s);
    return void await sendTracked(jid, { text: 'Oke, stiker tanpa suara selesai. *NEXORA*' }, { quoted: m });
  }
  if (s.step === 'customAudio') {
    // Dua cara: (a) kirim media langsung, (b) reply ke media yang sudah ada.
    const direct = pickMedia(m.message);
    const quoted = getReply(m);
    if (!direct && !(quoted && pickMedia(quoted))) return; // bukan media -> abaikan (anti-spam)
    const range = customRange(getText(m));
    if (!range) return void await notice(s.key, jid, 'Range tidak valid. Contoh `0-10`, `0-1:10`, atau kosongkan untuk semua.', m);
    s.audioMessage = direct
      ? { key: m.key, message: m.message }
      : { key: { remoteJid: jid, id: getReplyKey(m), participant: s.sender }, message: quoted };
    s.audioRange = range;
    react(jid, m.key, '⏳');
    return finishCustom(s);
  }
}

// Perintah .sticker tanpa video: dipakai untuk memilih media suara + range sekaligus.
async function handleStickerWithoutVideo(jid, sender, m, quoted, range) {
  const key = keyOf(jid, sender);
  const s = sessions.get(key);
  const media = quoted && pickMedia(quoted);
  if (s && !s.busy && media && (s.step === 'customAudio' || s.step === 'soundChoice')) {
    s.audioMessage = { key: { remoteJid: jid, id: getReplyKey(m), participant: sender }, message: quoted };
    s.audioRange = range;
    react(jid, m.key, '⏳');
    return finishCustom(s);
  }
  if (s?.busy) return notice(key, jid, '⏳ Masih diproses, tunggu sebentar ya.', m);
  return notice(key, jid, 'Reply video dengan `.sticker` (semua) atau `.sticker 0-10` / `.sticker 0-1:10`. Untuk suara sendiri: pilih opsi 2 dulu, lalu kirim/reply audio atau video.', m);
}

async function dispatch(m) {
  if (!m?.message) return;
  const id = m.key?.id;
  if (id) {
    if (seenIds.has(id)) return;
    seenIds.add(id);
    if (seenIds.size > 1000) seenIds.delete(seenIds.values().next().value);
  }
  if (m.key.fromMe && sentMessageIds.has(id)) return;
  const ts = Number(m.messageTimestamp?.low ?? m.messageTimestamp);
  if (ts && Date.now() / 1000 - ts > CFG.maxMessageAgeSec) return; // pesan lama/riwayat

  const jid = m.key.remoteJid, sender = m.key.participant || jid;
  const text = getText(m).trim();
  const action = buttonId(m) || text;
  const key = keyOf(jid, sender);

  // Menunggu suara sendiri: media langsung (walau captionnya ".sticker") dianggap sumber suara, bukan sticker baru.
  const waiting0 = sessions.get(key);
  if (waiting0 && waiting0.step === 'customAudio' && !waiting0.busy && pickMedia(m.message)) return processFlow(waiting0, m, action);

  const cmd = text.match(/^\.sticker(?:\s+(.+))?$/i);
  if (cmd) {
    const range = parseRange(cmd[1] || 'all');
    if (!range) return notice(key, jid, 'Range tidak valid. Contoh: `.sticker 0-10`, `.sticker 0-1:10`, atau `.sticker` untuk semua.', m);
    const quoted = getReply(m);
    const content = unwrapMessageContent(m.message);
    const quotedVideo = quoted?.videoMessage ? quoted : null;
    if (quotedVideo || content.videoMessage) {
      return startFromVideo(jid, sender, m, !!quotedVideo, quotedVideo ? getReplyKey(m) : m.key.id, range);
    }
    const isImg = c => !!(c.imageMessage || /^image\//.test(c.documentMessage?.mimetype || ''));
    const quotedImage = !!quoted && isImg(unwrapMessageContent(quoted));
    if (quotedImage || (!(quoted && pickMedia(quoted)) && isImg(content))) {
      return startFromVideo(jid, sender, m, quotedImage, quotedImage ? getReplyKey(m) : m.key.id, range, true);
    }
    return handleStickerWithoutVideo(jid, sender, m, quoted, range);
  }
  if (/^\.soundsticker$/i.test(text)) return notice(key, jid, 'Untuk flow baru, reply video dengan `.sticker`.', m);
  if (/^\.msscancel$/i.test(text)) {
    const s = sessions.get(key);
    if (!s) return;
    endSession(s);
    return void await sendTracked(jid, { text: 'Flow dibatalkan.' }, { quoted: m });
  }
  const s = sessions.get(key);
  if (s) await processFlow(s, m, action);
}
function handleMessages(upsert) {
  if (upsert.type !== 'notify') return;
  // Jangan `await` di sini: satu proses lambat tidak boleh menahan pesan lain (penyebab bot telat bales).
  for (const m of upsert.messages || []) dispatch(m).catch(e => log('Handler error:', e.message));
}

// ---------- koneksi ----------
async function connect() {
  if (isStarting) return;
  isStarting = true;
  try {
    if (!makeWASocket) { await loadBaileys(); loadButtons(); }
    ensureDirs();
    const { state, saveCreds } = await useMultiFileAuthState(AUTH);
    socket = makeWASocket({ auth: state, printQRInTerminal: false, markOnlineOnConnect: false, syncFullHistory: false });
    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('messages.upsert', handleMessages);
    socket.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
      if (connection === 'open') { log('Connected. Bot online. Reply a video with .sticker.'); }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) { log('Session logged out. Remove auth/ then pair again.'); return; }
        if (!reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 3000);
      }
    });
    isStarting = false;
  } catch (e) { isStarting = false; log('Connect failed:', e.stack || e); setTimeout(connect, 5000); }
}
async function pairIfNeeded() {
  const credsPath = path.join(AUTH, 'creds.json');
  if (fs.existsSync(credsPath)) {
    try { const creds = JSON.parse(fs.readFileSync(credsPath)); if (creds.registered) return; } catch {}
  }
  const raw = await ask('Nomor WhatsApp (contoh +62 812-3456-7890): ');
  const number = cleanNumber(raw);
  if (number.length < 10 || number.length > 15) { log('Nomor tidak valid.'); process.exit(1); }
  log('Menyiapkan socket dan meminta kode pairing dari server WhatsApp…');
  await new Promise(r => setTimeout(r, 1800));
  try {
    const code = await socket.requestPairingCode(number);
    console.log('\n╭──────────────────────────────╮');
    console.log('│  PAIRING CODE (8 DIGIT)     │');
    console.log(`│       ${String(code).match(/.{1,4}/g)?.join('-') || code}          │`);
    console.log('╰──────────────────────────────╯');
    log('Masukkan kode di WhatsApp: Perangkat tertaut > Tautkan perangkat > Tautkan dengan nomor telepon.');
  } catch (e) { log('Request pairing gagal:', e.message); process.exit(1); }
  setTimeout(async () => {
    let registered = false;
    try {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      registered = !!creds.registered;
    } catch { registered = false; }
    if (!registered) {
      log('Pairing timeout (2 menit). Membersihkan session pairing yang belum terdaftar.');
      try { socket?.end?.(new Error('pair timeout')); } catch {}
      fs.rmSync(AUTH, { recursive: true, force: true });
      process.exit(0);
    }
  }, 120000).unref();
}

module.exports = { loadBaileys, sendSoundSticker, CFG, deps, loadSettings, makeSilentSticker, SETTINGS_FILE, sessions, dispatch, handleMessages, parseRange, looksLikeRange, setSocket: s => { socket = s; }, setMalvin: m => { malvin = m; }, _state: () => ({ running, waiting: waiting.length }) };

if (require.main === module) {
  (async () => {
    ensureDirs();
    clearTemp();
    loadSettings(); // buat setting.json default kalau belum ada
    console.log('MakeSoundSticker • NEXORA Sound Sticker • Termux');
    await connect();
    await new Promise(r => setTimeout(r, 2200));
    await pairIfNeeded();
  })().catch(e => { console.error(e); process.exit(1); });
}
