import fs from 'fs';
import path from 'path';

function fix(file) {
  let s = fs.readFileSync(file, 'utf8');
  const orig = s;
  s = s.replace(/url\(['"]?\.\/갠홈\/[^'")]+['"]?\)/g, 'none');
  s = s.replace(/url\(['"]?갠홈\/[^'")]+['"]?\)/g, 'none');
  if (s !== orig) {
    fs.writeFileSync(file, s);
    console.log('fixed', file);
  }
}

for (const f of ['styles/legacy/index-all.css', 'styles/legacy/pair.css', 'static/lakehouse-r2.css']) {
  if (fs.existsSync(f)) fix(f);
}

const ocDir = 'src/oc/styles';
if (fs.existsSync(ocDir)) {
  for (const f of fs.readdirSync(ocDir).filter((x) => x.endsWith('.css'))) {
    fix(path.join(ocDir, f));
  }
}

console.log('done');
