import fs from 'node:fs';

const css = fs.readFileSync('tmp-kb-style.css', 'utf8');
// crude split on closing braces and filter interesting rules
const parts = css.split('}');
const keys = [
  'contents-kagurabachi',
  'select-language',
  '#share',
  'mainVisual',
  '.comic',
  '.anime',
  '.block',
  '.fish',
  '.back',
  'section-inner',
  'site-inner',
  'information',
  'js-ripples',
  'active',
];
for (const part of parts) {
  if (keys.some((k) => part.includes(k))) {
    console.log(part.trim().slice(0, 500) + '}\n---');
  }
}
