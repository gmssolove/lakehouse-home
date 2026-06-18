const fs = require('fs');
const h = fs.readFileSync(require('path').join(__dirname, '../oc.html'), 'utf8');
const start = h.indexOf('lakehouse-oc-restore-final-js');
const code = h.slice(h.indexOf('>', start) + 1, h.indexOf('</script>', start));
fs.writeFileSync(require('path').join(__dirname, '_restore-test.js'), code);
try {
  new Function(code);
  console.log('syntax OK');
} catch (e) {
  console.error(e.message);
  const m = e.message.match(/position (\d+)/);
  if (m) {
    const pos = Number(m[1]);
    console.error(code.slice(Math.max(0, pos - 80), pos + 80));
  }
}
