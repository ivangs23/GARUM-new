#!/usr/bin/env node
/**
 * Genera los ficheros de icono mínimos para la app si no existen ya.
 * Los iconos son bloques de color sólido — reemplázalos con arte real en
 * resources/ y este script no los sobreescribirá.
 *
 * Uso: node scripts/gen-icons.cjs
 */

'use strict';

const { deflateSync } = require('zlib');
const { writeFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');

const RESOURCES = join(__dirname, '..', 'resources');
mkdirSync(RESOURCES, { recursive: true });

// ── CRC32 (necesario para chunks PNG) ─────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return ((crc ^ 0xffffffff) >>> 0);
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBuf    = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
  const crcInput  = Buffer.concat([typeBytes, data]);
  const crcBuf    = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

// ── Generador de PNG ──────────────────────────────────────────────────────────

function makePNG(w, h, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0);
  ihdrData.writeUInt32BE(h, 4);
  ihdrData[8]  = 8; // bit depth
  ihdrData[9]  = 2; // colour type: RGB
  ihdrData[10] = 0; // compression: deflate
  ihdrData[11] = 0; // filter: adaptive
  ihdrData[12] = 0; // interlace: none

  // Una scanline: [filtro=0] + [R G B] * w
  const line = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) {
    line[1 + x * 3]     = r;
    line[2 + x * 3] = g;
    line[3 + x * 3] = b;
  }
  const raw        = Buffer.concat(Array.from({ length: h }, () => line));
  const compressed = deflateSync(raw);

  const ihdr = pngChunk('IHDR', ihdrData);
  const idat = pngChunk('IDAT', compressed);
  const iend = pngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

// ── Generador de ICO (embebe un PNG 256×256) ──────────────────────────────────

function makeICO(pngBuf) {
  // ICO header: reserved(2) + type=1(2) + count=1(2)
  const header = Buffer.from([0, 0, 1, 0, 1, 0]);

  // Image directory entry (16 bytes):
  //  width(1)  height(1)  colorCount(1)  reserved(1)
  //  planes(2)  bitCount(2)  imageSize(4)  offset(4)
  const offset = 6 + 16; // header + 1 dir entry
  const dirEntry = Buffer.alloc(16);
  dirEntry[0] = 0;   // width  0 → 256
  dirEntry[1] = 0;   // height 0 → 256
  dirEntry[2] = 0;   // color count
  dirEntry[3] = 0;   // reserved
  dirEntry.writeUInt16LE(1,           4); // planes
  dirEntry.writeUInt16LE(32,          6); // bit count
  dirEntry.writeUInt32LE(pngBuf.length, 8);  // image size
  dirEntry.writeUInt32LE(offset,     12); // image offset

  return Buffer.concat([header, dirEntry, pngBuf]);
}

// ── Generador de ICNS (Mac) ───────────────────────────────────────────────────

function makeICNS(...entries) {
  // entries: [{ type: '4-char', png: Buffer }]
  const blocks = entries.map(({ type, png }) => {
    const typeBuf = Buffer.from(type, 'ascii');
    const sizeBuf = Buffer.alloc(4);
    sizeBuf.writeUInt32BE(png.length + 8);
    return Buffer.concat([typeBuf, sizeBuf, png]);
  });
  const body     = Buffer.concat(blocks);
  const magic    = Buffer.from('icns', 'ascii');
  const totalBuf = Buffer.alloc(4);
  totalBuf.writeUInt32BE(8 + body.length);
  return Buffer.concat([magic, totalBuf, body]);
}

// ── Icono principal ───────────────────────────────────────────────────────────

const PURPLE = [123, 79, 150]; // --primary de la paleta Garum

const icon256 = makePNG(256, 256, ...PURPLE);
const icon512 = makePNG(512, 512, ...PURPLE);
const iconIco  = makeICO(icon256);
const iconIcns = makeICNS(
  { type: 'ic08', png: icon256 }, // 256×256
  { type: 'ic09', png: icon512 }, // 512×512
);

save('icon.png',  icon512); // ≥512 px recomendado para Mac
save('icon.ico',  iconIco);
save('icon.icns', iconIcns);

// ── Iconos de bandeja (16×16) ─────────────────────────────────────────────────

save('tray-icon.png',       makePNG(16, 16, 123,  79, 150)); // lila — conectado
save('tray-icon-idle.png',  makePNG(16, 16,  90,  90,  90)); // gris  — sin conexión
save('tray-icon-alert.png', makePNG(16, 16, 251, 146,  60)); // naranja — nuevo pedido

// ── Helpers ───────────────────────────────────────────────────────────────────

function save(filename, buf) {
  const dest = join(RESOURCES, filename);
  if (existsSync(dest)) {
    console.log(`  ⏭  ${filename} ya existe — se mantiene sin cambios`);
    return;
  }
  writeFileSync(dest, buf);
  console.log(`  ✓  ${filename} generado (${buf.length} bytes)`);
}
