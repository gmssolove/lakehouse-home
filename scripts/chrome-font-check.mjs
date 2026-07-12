import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const dir = path.join(os.tmpdir(), 'lh-font-check2');
fs.mkdirSync(dir, { recursive: true });
const html = path.join(dir, 't.html');
const shot = path.join(dir, 't.png');
const result = path.join(dir, 'result.txt');

fs.writeFileSync(
  html,
  `<!doctype html><meta charset="utf-8">
<style>
@font-face{font-family:'ChosunNm';src:url('http://127.0.0.1:3004/fonts/ChosunNm.ttf') format('truetype');font-display:block}
body{background:#111;color:#eee;margin:20px}
.a{font:28px ChosunNm,serif}.b{font:28px sans-serif}
</style>
<p class="a" id="a">한글 조선일보명조 원본 TTF</p>
<p class="b">산세리프 비교</p>
<script>
(async () => {
  await document.fonts.ready;
  const r = await fetch('http://127.0.0.1:3004/fonts/ChosunNm.ttf');
  const buf = await r.arrayBuffer();
  const faces = [...document.fonts].filter(f => /chosun/i.test(f.family)).map(f => f.status);
  const out = {
    status: r.status,
    type: r.headers.get('content-type'),
    size: buf.byteLength,
    ok: document.fonts.check('28px ChosunNm', '한글'),
    faces,
    ff: getComputedStyle(a).fontFamily,
  };
  document.title = JSON.stringify(out);
  await fetch('http://127.0.0.1:3004/', { method: 'HEAD' }).catch(() => {});
})();
</script>`,
  'utf8',
);

spawnSync(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    `--user-data-dir=${path.join(dir, 'p')}`,
    '--window-size=900,300',
    `--screenshot=${shot}`,
    '--virtual-time-budget=20000',
    'file:///' + html.replace(/\\/g, '/'),
  ],
  { timeout: 60000 },
);

console.log('shot', fs.existsSync(shot), shot);
