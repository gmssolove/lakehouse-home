/**
 * ChosunNm.ttf → 브라우저-safe woff2
 * (원본/hb-subset 산출물은 Chromium에서 Invalid font data → opentype 재패킹)
 */
import fs from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';
import wawoff2 from 'wawoff2';

const root = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(root, 'app/fonts/ChosunNm.ttf');
const outApp = path.join(root, 'app/fonts/ChosunNm.woff2');
const outPublic = path.join(root, 'public/fonts/ChosunNm.woff2');

const srcBuf = fs.readFileSync(srcPath);
const src = opentype.parse(
  srcBuf.buffer.slice(srcBuf.byteOffset, srcBuf.byteOffset + srcBuf.byteLength),
);

const glyphs = [src.glyphs.get(0)];
const seen = new Set([0]);

function addChar(ch) {
  const g = src.charToGlyph(ch);
  if (!g || seen.has(g.index)) return;
  seen.add(g.index);
  glyphs.push(g);
}

const latin =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' +
  " .,!?'\"-–—()/[]{}:;@#$%&*+=<>~`^_\\|₩…·•“”‘’「」『』【】☆★♥♡※↑↓←→℃°±×÷";
for (const ch of latin) addChar(ch);

for (let i = 0x3130; i <= 0x318f; i += 1) addChar(String.fromCodePoint(i));
for (let i = 0xac00; i <= 0xd7a3; i += 1) addChar(String.fromCodePoint(i));

console.log('glyphs', glyphs.length, '/', src.glyphs.length);

const rebuilt = new opentype.Font({
  familyName: 'ChosunNm',
  styleName: 'Regular',
  unitsPerEm: src.unitsPerEm,
  ascender: src.ascender,
  descender: src.descender,
  glyphs,
});

console.log('encoding ttf…');
const ttfOut = Buffer.from(rebuilt.toArrayBuffer());
console.log('ttf bytes', ttfOut.length);

console.log('compressing woff2…');
const woff2 = Buffer.from(await wawoff2.compress(ttfOut));
fs.writeFileSync(outApp, woff2);
fs.writeFileSync(outPublic, woff2);
console.log('woff2 bytes', woff2.length, '→', outApp);
