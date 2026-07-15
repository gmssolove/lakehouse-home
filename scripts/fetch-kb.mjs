import fs from 'node:fs';

const urls = [
  'https://kagurabachi.jp/',
  'https://kagurabachi.jp/en/',
  'https://comic.kagurabachi.jp/',
];

for (const url of urls) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const t = await r.text();
    const out = `tmp-kb-${url.replace(/https?:\/\//, '').replace(/\W+/g, '_')}.html`;
    fs.writeFileSync(out, t.slice(0, 80000), 'utf8');
    console.log(url, r.status, 'len', t.length, 'saved', out);
    console.log(
      'title',
      (t.match(/<title>[^<]+/) || [])[0],
      'has SELECT',
      t.includes('SELECT'),
      'scripts',
      (t.match(/<script/g) || []).length,
    );
  } catch (e) {
    console.log(url, e.message);
  }
}
