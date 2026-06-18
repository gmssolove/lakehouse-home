/**
 * Split monolithic HTML into src/{page}/ modules.
 * Usage: node scripts/split-html.mjs oc.html oc
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const htmlFile = process.argv[2];
const pageName = process.argv[3];

if (!htmlFile || !pageName) {
  console.error('Usage: node scripts/split-html.mjs <file.html> <page-name>');
  process.exit(1);
}

const htmlPath = path.resolve(root, htmlFile);
const html = fs.readFileSync(htmlPath, 'utf8');
const outBase = path.join(root, 'src', pageName);
const stylesDir = path.join(outBase, 'styles');
const jsDir = path.join(outBase, 'js');

fs.mkdirSync(stylesDir, { recursive: true });
fs.mkdirSync(jsDir, { recursive: true });

const styleImports = [];
const jsImports = [];
let remaining = html;

function slug(id) {
  return id.replace(/^lakehouse-/, '').replace(/-(css|js)$/, '');
}

// Named style blocks
remaining = remaining.replace(/<style id="([^"]+)">([\s\S]*?)<\/style>/g, (_, id, content) => {
  const name = slug(id);
  const file = `${name}.css`;
  fs.writeFileSync(path.join(stylesDir, file), content.trim() + '\n');
  styleImports.push(file);
  console.log('  style:', file);
  return `<!-- extracted: ${id} -->`;
});

// First unnamed style in head (before link rel stylesheet)
const unnamedStyle = remaining.match(/<head>[\s\S]*?<style>([\s\S]*?)<\/style>/);
if (unnamedStyle) {
  fs.writeFileSync(path.join(stylesDir, 'base.css'), unnamedStyle[1].trim() + '\n');
  styleImports.unshift('base.css');
  remaining = remaining.replace(/<style>[\s\S]*?<\/style>/, '<!-- extracted: base.css -->');
  console.log('  style: base.css');
}

// Module script
remaining = remaining.replace(/<script type="module">([\s\S]*?)<\/script>/g, (_, content) => {
  fs.writeFileSync(path.join(jsDir, 'firebase.js'), content.trim() + '\n');
  jsImports.push('firebase.js');
  console.log('  js: firebase.js');
  return '<!-- extracted: firebase module -->';
});

// Named script blocks (with id, no src)
remaining = remaining.replace(/<script id="([^"]+)"(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g, (_, id, content) => {
  if (!content.trim()) return _;
  const name = slug(id);
  const file = `${name}.js`;
  fs.writeFileSync(path.join(jsDir, file), content.trim() + '\n');
  jsImports.push(file);
  console.log('  js:', file);
  return `<!-- extracted: ${id} -->`;
});

// Trailing inline script before lakehouse-r2 (app hooks)
const r2Hook = remaining.match(/<script>\s*\(\s*function\s*\(\)\s*\{[\s\S]*?LakeR2Upload[\s\S]*?\}\)\(\);\s*<\/script>/);
if (r2Hook) {
  fs.writeFileSync(path.join(jsDir, 'r2-hooks.js'), r2Hook[0].replace(/^<script>/, '').replace(/<\/script>$/, '').trim() + '\n');
  jsImports.push('r2-hooks.js');
  remaining = remaining.replace(r2Hook[0], '<!-- extracted: r2-hooks.js -->');
  console.log('  js: r2-hooks.js');
}

// Main app script (large block before lakehouse-bgm-js)
const appMatch = remaining.match(/<script>\s*(\/\/ =====|var activeCat|function getChars)[\s\S]*?<\/script>/);
if (appMatch && !appMatch[0].includes('LakeR2Upload')) {
  const body = appMatch[0].replace(/^<script>/, '').replace(/<\/script>$/, '').trim();
  fs.writeFileSync(path.join(jsDir, 'app.js'), body + '\n');
  jsImports.unshift('app.js');
  remaining = remaining.replace(appMatch[0], '<!-- extracted: app.js -->');
  console.log('  js: app.js');
}

// styles index.css
const indexCss = styleImports.map((f) => `@import './${f}';`).join('\n') + '\n';
fs.writeFileSync(path.join(stylesDir, 'index.css'), indexCss);

// main.js — preserve load order
const mainJs = [
  "/** Auto-generated entry — imports preserve original script order */",
  ...jsImports.map((f) => `import './js/${f}';`),
  '',
].join('\n');
fs.writeFileSync(path.join(outBase, 'main.js'), mainJs);

// Write slim HTML shell marker file for reference
fs.writeFileSync(
  path.join(outBase, '_extracted.json'),
  JSON.stringify({ htmlFile, styleImports, jsImports, extractedAt: new Date().toISOString() }, null, 2)
);

console.log(`\nDone: src/${pageName}/ (${styleImports.length} styles, ${jsImports.length} scripts)`);
console.log('Next: update HTML to use /src/{page}/styles/index.css and /src/{page}/main.js');
