import fs from 'node:fs';

const css = fs.readFileSync('tmp-kb-style.css', 'utf8');
const needles = [
  '.block h1',
  '.block .text',
  '.block .information',
  'contents-kagurabachi-entrance',
  'font-family:birch',
  'dnp-shuei',
  '.comic.site',
  '.anime.site',
  '.site-inner',
  '#mainVisual .section-wrap .section-inner .block',
];

for (const n of needles) {
  let i = 0;
  while ((i = css.indexOf(n, i)) !== -1) {
    console.log('\n===', n, '@@@', i, '===');
    console.log(css.slice(Math.max(0, i - 80), i + 420));
    i += n.length;
    if (i > 500000) break;
  }
}
