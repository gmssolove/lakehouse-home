import fs from 'node:fs';
import path from 'node:path';

const src = path.join(
  process.env.USERPROFILE || '',
  'Desktop',
  '⠀⠀⠀⠀⠀⠀⠀⠀',
  '갠홈',
  '비주얼노벨',
);
const root = path.resolve('C:/Users/user/Downloads/files');
const map = [
  ['parseCcfoliaLog.ts', 'lib/vn/parseCcfoliaLog.ts'],
  ['ScenarioVnEditor.tsx', 'components/shared/ScenarioVnEditor.tsx'],
  ['ScenarioVnPlayButton.tsx', 'components/shared/ScenarioVnPlayButton.tsx'],
  ['scenario-vn-editor.css', 'styles/shared/scenario-vn-editor.css'],
];

console.log('src exists', fs.existsSync(src), src);
for (const [a, b] of map) {
  const from = path.join(src, a);
  const to = path.join(root, b);
  if (!fs.existsSync(from)) {
    console.error('missing', from);
    continue;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log('ok', b, fs.statSync(to).size);
}
