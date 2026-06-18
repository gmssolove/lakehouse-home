/**
 * Replace extracted inline blocks in HTML with module imports.
 * Usage: node scripts/apply-slim-html.mjs oc.html oc
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const htmlFile = process.argv[2];
const pageName = process.argv[3];

const htmlPath = path.resolve(root, htmlFile);
let html = fs.readFileSync(htmlPath, 'utf8');

const markers = [
  [/<!-- extracted: base\.css -->/, ''],
  [/<style id="[^"]+">[\s\S]*?<\/style>/g, ''],
  [/<script type="module">[\s\S]*?<\/script>/, ''],
  [/<script id="[^"]+"(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/g, ''],
  [/<script>\s*\(\s*function\s*\(\)\s*\{[\s\S]*?LakeR2Upload[\s\S]*?\}\)\(\);\s*<\/script>/, ''],
  [/<script>\s*window\._isAdmin[\s\S]*?<\/script>/, ''],
];

for (const [re, rep] of markers) {
  html = html.replace(re, rep);
}

// Remove first unnamed style if still present
html = html.replace(/<style>[\s\S]*?<\/style>/, '');

const importBlock = `
<link rel="stylesheet" href="/src/${pageName}/styles/index.css">
<link rel="stylesheet" href="/lakehouse-r2.css">
<script type="module" src="/src/${pageName}/main.js"></script>
<script src="/lakehouse-r2.js"></script>
`;

if (!html.includes(`/src/${pageName}/main.js`)) {
  html = html.replace('</head>', `${importBlock}\n</head>`);
}

// Clean duplicate lakehouse-r2 links
html = html.replace(/<link rel="stylesheet" href="lakehouse-r2\.css">\s*/g, '');
html = html.replace(/<script src="lakehouse-r2\.js"><\/script>\s*/g, '');

fs.writeFileSync(htmlPath, html);
console.log(`Updated ${htmlFile} — now imports from src/${pageName}/`);
