import assert from 'node:assert/strict';
import {
  marksToEditorHtml,
  plainOffsetsToMarkOffsets,
  projectPlainOffsets,
  wrapRichSelection,
} from '../lib/oc/richTextMarks.ts';

function apply(
  marks: string,
  plainStart: number,
  plainEnd: number,
  kind: 'bold' | 'italic' | 'underline' | 'strike' | 'soft' | 'color' | 'font' | 'size',
  opts: string | { colorHex?: string; fontId?: string; sizePx?: number } = '#d7a982',
) {
  const { start, end } = plainOffsetsToMarkOffsets(marks, plainStart, plainEnd);
  return wrapRichSelection(marks, start, end, kind, opts).next;
}

// 1) color → bold
{
  let m = 'abcdefghij';
  m = apply(m, 3, 6, 'color', '#ff0000');
  assert.equal(m, 'abc{#ff0000}def{#}ghij');
  m = apply(m, 3, 6, 'bold');
  assert.equal(m, 'abc{#ff0000}**def**{#}ghij');
  console.log('ok color→bold');
}

// 2) bold → color (색은 굵게 바깥으로 올려 중첩 깨짐 방지)
{
  let m = 'abcdefghij';
  m = apply(m, 3, 6, 'bold');
  assert.equal(m, 'abc**def**ghij');
  m = apply(m, 3, 6, 'color', '#00ff00');
  assert.equal(m, 'abc{#00ff00}**def**{#}ghij');
  console.log('ok bold→color');
}

// 3) italic + underline + color
{
  let m = 'hello world';
  m = apply(m, 0, 5, 'italic');
  m = apply(m, 0, 5, 'underline');
  m = apply(m, 0, 5, 'color', '#d7a982');
  assert.match(m, /\{#d7a982\}/);
  assert.match(m, /\/\//);
  assert.match(m, /__/);
  assert.equal(projectPlainOffsets(m).plain, 'hello world');
  console.log('ok mix', m);
}

// 4) multiline: second line only
{
  let m = '첫번째줄\n두번째줄텍스트';
  const { plain } = projectPlainOffsets(m);
  assert.equal(plain, '첫번째줄\n두번째줄텍스트');
  const i = plain.indexOf('두번째');
  m = apply(m, i, i + 3, 'bold');
  assert.equal(m, '첫번째줄\n**두번째**줄텍스트');
  m = apply(m, i, i + 3, 'color', '#aabbcc');
  assert.equal(m, '첫번째줄\n{#aabbcc}**두번째**{#}줄텍스트');
  console.log('ok multiline');
}

// 5) toggle bold off
{
  let m = 'ab**cd**ef';
  m = apply(m, 2, 4, 'bold');
  assert.equal(m, 'abcdef');
  console.log('ok toggle');
}

// 6) html
{
  const m = '가{#ff0000}**나**{#}다\n라';
  const html = marksToEditorHtml(m);
  assert.match(html, /<strong/);
  assert.match(html, /oc-rich-color/);
  assert.equal(projectPlainOffsets(m).plain, '가나다\n라');
  console.log('ok html');
}

// 7) font + size + color + bold any order
{
  let m = 'abcdefghij';
  m = apply(m, 3, 6, 'font', { fontId: 'pretendard' });
  assert.equal(m, 'abc{@pretendard}def{/@}ghij');
  m = apply(m, 3, 6, 'size', { sizePx: 20 });
  assert.equal(m, 'abc{=20}{@pretendard}def{/@}{/=}ghij');
  m = apply(m, 3, 6, 'color', '#ff0000');
  m = apply(m, 3, 6, 'bold');
  assert.match(m, /\{\@pretendard\}/);
  assert.match(m, /\{=20\}/);
  assert.match(m, /\{\/=\}/);
  assert.match(m, /\{\/@\}/);
  assert.match(m, /\{\#ff0000\}/);
  assert.match(m, /\*\*/);
  assert.equal(projectPlainOffsets(m).plain, 'abcdefghij');
  const html = marksToEditorHtml(m);
  assert.equal(html.includes('{@'), false);
  assert.equal(html.includes('{='), false);
  console.log('ok font+size+color+bold', m);
}

// 7b) bold 위에 폰트/크기 (바깥 래핑)
{
  let m = 'abcdefghij';
  m = apply(m, 3, 6, 'bold');
  m = apply(m, 3, 6, 'font', { fontId: 'pretendard' });
  assert.equal(m, 'abc{@pretendard}**def**{/@}ghij');
  m = apply(m, 3, 6, 'size', { sizePx: 22 });
  assert.equal(m, 'abc{=22}{@pretendard}**def**{/@}{/=}ghij');
  assert.equal(projectPlainOffsets(m).plain, 'abcdefghij');
  assert.equal(marksToEditorHtml(m).includes('{@'), false);
  console.log('ok bold→font→size', m);
}

// 8) size then font reverse
{
  let m = 'hello';
  m = apply(m, 0, 5, 'size', { sizePx: 24 });
  m = apply(m, 0, 5, 'font', { fontId: 'marcellus' });
  assert.equal(m, '{@marcellus}{=24}hello{/=}{/@}');
  console.log('ok size→font');
}

// 9) legacy closers still parse, plain never exposes markers
{
  const legacy = '{@jost}안녕{=}하세요{@}';
  /* broken legacy size mid-string must not wipe plain */
  assert.equal(projectPlainOffsets('{@jost}안녕하세요{/@}').plain, '안녕하세요');
  assert.equal(projectPlainOffsets('{=20}안녕하세요{/=}').plain, '안녕하세요');
  assert.equal(projectPlainOffsets('{@jost}안녕하세요{@}').plain, '안녕하세요');
  assert.equal(projectPlainOffsets('{=20}안녕하세요{=}').plain, '안녕하세요');
  const html = marksToEditorHtml('{@jost}{=24}가나다{/=}{/@}');
  assert.match(html, /oc-rich-font/);
  assert.match(html, /oc-rich-size/);
  assert.ok(!html.includes('{@'));
  assert.ok(!html.includes('{='));
  console.log('ok legacy+html', legacy);
}

// 10) UI 경로(plain→mark 매핑)로 중첩해도 평문 유지 + HTML에 마커 문자 없음
{
  let m = '안녕하세요 테스트';
  const map = (plainStart: number, plainEnd: number) =>
    plainOffsetsToMarkOffsets(m, plainStart, plainEnd);
  let r = map(0, 5);
  m = wrapRichSelection(m, r.start, r.end, 'bold').next;
  r = map(0, 5);
  m = wrapRichSelection(m, r.start, r.end, 'font', { fontId: 'jost' }).next;
  r = map(0, 5);
  m = wrapRichSelection(m, r.start, r.end, 'size', { sizePx: 20 }).next;
  r = map(0, 5);
  m = wrapRichSelection(m, r.start, r.end, 'color', '#ff0000').next;
  assert.equal(projectPlainOffsets(m).plain, '안녕하세요 테스트');
  const html = marksToEditorHtml(m);
  assert.match(html, /oc-rich-strong|oc-rich-font|oc-rich-size|oc-rich-color/);
  assert.equal(html.includes('{@'), false);
  assert.equal(html.includes('{='), false);
  console.log('ok ui path nested', m);
}

// 11) multiline select must not leak marker codes into HTML
{
  const multi = '첫번째 문단입니다.\n두번째 문단을 선택합니다.';
  const all = plainOffsetsToMarkOffsets(multi, 0, projectPlainOffsets(multi).plain.length);
  const m = wrapRichSelection(multi, all.start, all.end, 'font', { fontId: 'pretendard' }).next;
  /* 줄마다 감싸짐 */
  assert.equal(
    m,
    '{@pretendard}첫번째 문단입니다.{/@}\n{@pretendard}두번째 문단을 선택합니다.{/@}',
  );
  const html = marksToEditorHtml(m);
  assert.match(html, /oc-rich-font/);
  assert.equal(html.includes('{@pretendard}'), false);
  assert.equal(html.includes('{/@}'), false);
  /* 레거시 한 덩어리 마커도 HTML에 코드로 안 남음 */
  const legacyCross =
    '{@pretendard}첫번째 문단입니다.\n두번째 문단을 선택합니다.{/@}';
  const html2 = marksToEditorHtml(legacyCross);
  assert.match(html2, /oc-rich-font/);
  assert.equal(html2.includes('{@pretendard}'), false);
  assert.equal(html2.includes('{/@}'), false);
  console.log('ok multiline font');
}

console.log('ALL PASSED');
