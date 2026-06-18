const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'oc.html');
let html = fs.readFileSync(file, 'utf8');

const removeScriptIds = [
  'lakehouse-oc-save-final-fix-js',
  'lakehouse-public-oc-sync-js',
  'lakehouse-oc-save-last-override-js',
  'lakehouse-oc-save-layout-vn-final-js',
  'lakehouse-oc-final-save-sync-js',
  'lakehouse-oc-context-save-modal-js',
  'lakehouse-oc-save-au-dialogue-final-js',
  'lakehouse-oc-dialogue-gallery-polish-js',
  'lakehouse-oc-hard-save-dialogue-profile-final2-js'
];

for (const id of removeScriptIds) {
  const re = new RegExp('<script id="' + id + '">[\\s\\S]*?</script>\\s*', 'g');
  const before = html.length;
  html = html.replace(re, '');
  console.log(id, before - html.length, 'bytes removed');
}

fs.writeFileSync(file, html);
console.log('done');
