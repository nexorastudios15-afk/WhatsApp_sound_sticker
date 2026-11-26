'use strict';
// Uji alur tanpa WhatsApp: socket palsi + ffmpeg asli.  npm test
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const bot = require('./run.js');

const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mss-'));
const vid = path.join(dir, 'v.mp4');
const r = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=d=6:s=320x240:r=15', '-f', 'lavfi', '-i', 'sine=d=6', '-shortest', '-pix_fmt', 'yuv420p', vid]);
assert.strictEqual(r.status, 0, 'gagal membuat video uji');
const videoBuf = fs.readFileSync(vid);

const sent = [], sounds = [];
let downloads = 0, n = 0;
bot.setSocket({ sendMessage: async (jid, c) => { sent.push(c); return { key: { id: 'out' + (++n) } }; } });
bot.deps.mediaBuffer = async () => { downloads++; await new Promise(r => setTimeout(r, 150)); return videoBuf; };
bot.deps.sendSoundSticker = async (jid, webp, audio, q, sec) => {
  assert(fs.existsSync(webp) && fs.existsSync(audio));
  sounds.push(sec);
};
bot.CFG.cooldownMs = 50;
const btnCalls = [];
bot.setMalvin({ sendButtons: async (sock, jid, data) => { btnCalls.push(data); return { key: { id: 'btn' + btnCalls.length } }; } });

let id = 0;
const JID = '6281@s.whatsapp.net';
const msg = (text, extra = {}) => ({ key: { id: 'm' + (++id), remoteJid: JID, fromMe: false }, messageTimestamp: Math.floor(Date.now() / 1000),
  message: extra.video ? { videoMessage: { caption: text } } : extra.audio ? { audioMessage: { seconds: 6 } } : extra.vidAsSound ? { videoMessage: { caption: text } } : extra.quoted ? { extendedTextMessage: { text, contextInfo: { stanzaId: 'q' + id, quotedMessage: extra.quoted } } } : { conversation: text } });
const wait = ms => new Promise(r => setTimeout(r, ms));
const stickers = () => sent.filter(c => c.sticker).length;
const texts = () => sent.filter(c => c.text).map(c => c.text);

(async () => {
  // range parser
  assert.deepStrictEqual(bot.parseRange('0-10'), { start: 0, end: 10 });
  assert.deepStrictEqual(bot.parseRange('0-1:10'), { start: 0, end: 70 });
  assert(bot.parseRange('10-5') === null && bot.parseRange('abc') === null);

  // 1) spam .sticker 6x berturut-turut -> hanya 1 job
  const t0 = Date.now();
  bot.handleMessages({ type: 'notify', messages: Array.from({ length: 6 }, () => msg('.sticker 0-3', { video: true })) });
  assert(Date.now() - t0 < 50, 'handleMessages harus langsung kembali (tidak memblokir pesan lain)');
  await wait(2500);
  assert.strictEqual(downloads, 1, 'download harus 1x, dapat ' + downloads);
  assert.strictEqual(stickers(), 1, 'stiker senyap harus 1');
  assert.strictEqual(btnCalls.length, 1, 'tombol Malvin harus terkirim 1x');
  assert.deepStrictEqual(btnCalls[0].buttons.map(b => b.id), ['mss_video_sound', 'mss_custom_sound', 'mss_no_sound']);
  assert(texts().filter(t => t.includes('masih diproses')).length <= 1, 'peringatan sibuk dibatasi');
  console.log('ok  anti-spam .sticker');

  // 2) obrolan biasa tidak dibalas
  const before = sent.length;
  await bot.dispatch(msg('halo bot')); await bot.dispatch(msg('wkwk'));
  assert.strictEqual(sent.length, before, 'obrolan biasa tidak boleh dibalas');
  console.log('ok  obrolan diabaikan');

  // 3) tombol/angka 1 ditekan 3x -> 1 sound sticker, tanpa download ulang
  await Promise.all([bot.dispatch(msg('1')), bot.dispatch(msg('1')), bot.dispatch(msg('mss_video_sound'))]);
  await wait(1500);
  assert.strictEqual(sounds.length, 1, 'sound sticker harus 1, dapat ' + sounds.length);
  assert.strictEqual(downloads, 1, 'video tidak boleh diunduh ulang');
  assert.strictEqual(bot.sessions.size, 0, 'sesi harus tertutup');
  console.log('ok  pilihan video 1x, tanpa re-download/re-encode');

  // 4) alur custom: .sticker -> 2 -> reply media + range
  await wait(80);
  await bot.dispatch(msg('.sticker', { video: true })); await wait(2000);
  await bot.dispatch(msg('2'));
  assert(texts().some(t => t.includes('audio / voice note / video')));
  const audio = { audioMessage: {} };
  await bot.dispatch(msg('.sticker 1-4', { quoted: audio })); await wait(1500);
  assert.strictEqual(sounds.length, 2);
  assert.strictEqual(downloads, 3);
  console.log('ok  alur suara sendiri (reply ke media + range)');

  // 4a) suara sendiri: kirim audio langsung, lebih panjang (6s) dari stiker (0-3s)
  await wait(80);
  const secs = [];
  const origSend = bot.deps.sendSoundSticker;
  bot.deps.sendSoundSticker = async (jid, webp, audio, q, sec) => { secs.push(sec); return origSend(jid, webp, audio, q, sec); };
  await bot.dispatch(msg('.sticker 0-3', { video: true })); await wait(2000);
  await bot.dispatch(msg('2'));
  await bot.dispatch(msg('', { audio: true })); await wait(1500);
  assert.strictEqual(secs.length, 1, 'sound sticker harus terkirim dari audio langsung');
  assert.strictEqual(secs[0], 6, 'suara 6 detik harus utuh walau stiker 3 detik, dapat ' + secs[0]);
  assert.strictEqual(bot.sessions.size, 0);
  console.log('ok  suara sendiri boleh lebih panjang dari stiker');

  // 4c) suara sendiri: kirim VIDEO langsung (caption .sticker) -> hanya diambil suaranya, tidak bikin sticker baru
  await wait(80);
  await bot.dispatch(msg('.sticker 0-3', { video: true })); await wait(2000);
  const stickersBefore = stickers();
  await bot.dispatch(msg('2'));
  await bot.dispatch(msg('.sticker', { vidAsSound: true })); await wait(1500);
  assert.strictEqual(secs.length, 2, 'video sebagai sumber suara harus terkirim');
  assert.strictEqual(stickers(), stickersBefore, 'tidak boleh membuat sticker baru dari video suara');
  bot.deps.sendSoundSticker = origSend;
  console.log('ok  video sebagai sumber suara (ambil suaranya saja)');

  // 4b) tombol gagal -> menu angka cadangan
  bot.setMalvin({ sendButtons: async () => { throw new Error('boom'); } });
  await wait(80);
  await bot.dispatch(msg('.sticker', { video: true })); await wait(2000);
  assert(texts().some(t => t.includes('Tekan tombol, atau balas angka')), 'fallback menu angka');
  await bot.dispatch(msg('3'));
  assert.strictEqual(bot.sessions.size, 0);
  console.log('ok  fallback saat tombol gagal');

  // 5) range melebihi durasi -> error ramah, sesi bersih
  await wait(80);
  await bot.dispatch(msg('.sticker 0-99', { video: true })); await wait(1500);
  assert(texts().some(t => t.includes('melewati durasi')));
  assert.strictEqual(bot.sessions.size, 0);
  console.log('ok  range salah ditangani');

  // 5b) foto/PNG -> stiker -> suara sendiri
  await wait(80);
  const png = path.join(dir, 'p.png');
  assert.strictEqual(spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=s=300x200', '-frames:v', '1', png]).status, 0);
  const origBuf = bot.deps.mediaBuffer;
  let current = fs.readFileSync(png);
  bot.deps.mediaBuffer = async () => current;
  const nSound = sounds.length;
  await bot.dispatch(msg('.sticker', { quoted: { imageMessage: {} } })); await wait(1500);
  await bot.dispatch(msg('1'));
  assert.strictEqual(sounds.length, nSound, 'angka 1 pada foto = suara sendiri, belum kirim');
  current = videoBuf;
  await bot.dispatch(msg('', { audio: true })); await wait(1500);
  assert.strictEqual(sounds.length, nSound + 1);
  assert.strictEqual(bot.sessions.size, 0);
  bot.deps.mediaBuffer = origBuf;
  console.log('ok  foto + suara sendiri');

  // 6) pesan lama diabaikan
  const old = msg('.sticker', { video: true }); old.messageTimestamp -= 3600;
  const b2 = sent.length; await bot.dispatch(old); assert.strictEqual(sent.length, b2);
  console.log('ok  pesan lama diabaikan');

  // 7) HD guard: default ON, ON -> ukuran turun ke batas, kanvas tetap 512x512
  const settingsBackup = fs.existsSync(bot.SETTINGS_FILE) ? fs.readFileSync(bot.SETTINGS_FILE) : null;
  try {
    fs.rmSync(bot.SETTINGS_FILE, { force: true });
    assert.strictEqual(bot.loadSettings().hdGuard, true, 'default hdGuard harus on');
    fs.writeFileSync(bot.SETTINGS_FILE, JSON.stringify({ hdGuard: false }));
    assert(fs.existsSync(bot.SETTINGS_FILE), 'setting.json default harus dibuat otomatis');
    const hd = path.join(dir, 'hd.mp4');
    const rh = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc2=d=8:s=1280x720:r=30', '-vf', 'noise=alls=40:allf=t+u', '-pix_fmt', 'yuv420p', hd]);
    assert.strictEqual(rh.status, 0, 'gagal membuat video HD uji');
    const outOff = path.join(dir, 'off.webp'), outOn = path.join(dir, 'on.webp');
    await bot.makeSilentSticker(hd, { all: true }, outOff);
    const offKB = fs.statSync(outOff).size / 1024;
    fs.writeFileSync(bot.SETTINGS_FILE, JSON.stringify({ hdGuard: true, hdGuardMaxKB: Math.floor(offKB / 2) < 100 ? 100 : Math.floor(offKB / 2) }));
    assert.strictEqual(bot.loadSettings().hdGuard, true);
    await bot.makeSilentSticker(hd, { all: true }, outOn);
    const onKB = fs.statSync(outOn).size / 1024;
    assert(onKB < offKB, `guard ON harus lebih kecil (off ${offKB.toFixed(0)}KB, on ${onKB.toFixed(0)}KB)`);
    const hdr = fs.readFileSync(outOn).subarray(0, 40); // header VP8X: lebar/tinggi kanvas 24-bit LE (+1)
    assert.strictEqual(hdr.subarray(12, 16).toString(), 'VP8X', 'webp animasi harus VP8X');
    const dim = `${hdr.readUIntLE(24, 3) + 1},${hdr.readUIntLE(27, 3) + 1}`;
    assert.strictEqual(dim, '512,512', 'kanvas harus tetap 512x512, dapat ' + dim);
    fs.writeFileSync(bot.SETTINGS_FILE, '{rusak');
    assert.strictEqual(bot.loadSettings().hdGuard, true, 'setting rusak -> default on');
    console.log(`ok  HD guard (off ${offKB.toFixed(0)}KB -> on ${onKB.toFixed(0)}KB, 512x512)`);
  } finally {
    if (settingsBackup) fs.writeFileSync(bot.SETTINGS_FILE, settingsBackup); else fs.rmSync(bot.SETTINGS_FILE, { force: true });
  }

  // Audio tertanam di StickerMessage (protobuf field 26): encoder Baileys asli + socket palsi.
  {
    const webp = path.join(dir, 'embed.webp'), ogg = path.join(dir, 'embed.ogg');
    await bot.makeSilentSticker(vid, { start: 0, end: 3 }, webp);
    const ra = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=d=3', '-c:a', 'libopus', ogg]);
    assert.strictEqual(ra.status, 0, 'gagal membuat audio opus uji');
    const relayed = [];
    bot.setSocket({
      user: { id: '6281234567890:1@s.whatsapp.net' },
      waUploadToServer: async () => ({ mediaUrl: 'https://mmg.whatsapp.net/test', directPath: '/v/test' }),
      relayMessage: async (jid, message) => { relayed.push(message); },
    });
    await bot.loadBaileys();
    await bot.sendSoundSticker(JID, webp, ogg, null, 3);
    assert.strictEqual(relayed.length, 1, 'sound sticker harus terkirim sekali');
    assert(relayed[0].stickerMessage, 'pesan harus berupa stickerMessage');
    console.log('ok  audio tertanam di sticker (field 26 tervalidasi)');
  }

  const leftovers = fs.readdirSync(path.join(__dirname, 'tmp'));
  assert.strictEqual(leftovers.length, 0, 'file temp bocor: ' + leftovers);
  console.log('ok  tidak ada file temp tersisa\nSEMUA LULUS');
  process.exit(0);
})().catch(e => { console.error('GAGAL:', e.message); process.exit(1); });
