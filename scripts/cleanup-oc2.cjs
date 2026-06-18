const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'oc.html');
let html = fs.readFileSync(file, 'utf8');

html = html.replace(
  /  var oldSave=window\.saveChar;\s*window\.saveChar=function\(\)\{if\(!window\.currentChar\|\|!window\._isAdmin\)\{return oldSave\(\)\}oldSave\(\);[\s\S]*?renderGrid\(\);\s*\}/,
  ''
);

html = html.replace(
  /  var galleryPending=Promise\.resolve\(\),auPending=Promise\.resolve\(\);\s*window\.handleGalleryUpload=function[\s\S]*?input\.value=''\}\);\s*var baseRenderGallery/,
  '  var baseRenderGallery'
);

html = html.replace(
  /  window\.handleAUImgUpload=function\(input,i\)\{var files=Array\.from\(input\.files\|\|\[\]\);if\(!files\.length\)return;auPending=Promise\.all\(files\.map\(readFile\)\)\.then\(function\(list\)\{[\s\S]*?input\.value=''\}\);\s*/,
  ''
);

html = html.replace(
  /  function readFile\(file\)\{return new Promise\(function\(resolve\)\{var r=new FileReader\(\);r\.onload=function\(e\)\{resolve\(e\.target\.result\)\};r\.readAsDataURL\(file\)\}\)\}\s*/,
  ''
);

html = html.replace(
  /  window\.saveChar=function\(\)\{Promise\.all\(\[galleryPending,auPending\]\)\.then\(function\(\)\{/,
  '  window.saveChar=function(){'
);

html = html.replace(
  /function handleImgUpload\(input\)\{var file=input\.files\[0\];if\(!file\)return;var reader=new FileReader\(\);reader\.onload=function\(e\)\{document\.getElementById\('ep-img-data'\)\.value=e\.target\.result;updateImgPreview\(e\.target\.result\);\};reader\.readAsDataURL\(file\);\}\s*/,
  ''
);

html = html.replace(
  /function handleGalleryUpload\(input\)\{var files=Array\.from\(input\.files\);files\.forEach\(function\(file\)\{var reader=new FileReader\(\);reader\.onload=function\(e\)\{epGalleryData\.push\(e\.target\.result\);renderGalleryList\(\);\};reader\.readAsDataURL\(file\);\}\);\}\s*/,
  ''
);

html = html.replace(
  /function saveChar\(\)\{[\s\S]*?setTimeout\(function\(\)\{msg\.style\.display='none';\},2000\);\s*\}\s*/,
  ''
);

fs.writeFileSync(file, html);
console.log('oc.html pass 2 done');
