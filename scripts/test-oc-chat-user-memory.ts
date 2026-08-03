/**
 * ocChatUserMemory 순수 함수 스모크 테스트
 * 실행: pnpm exec tsx scripts/test-oc-chat-user-memory.ts
 */
import assert from 'node:assert/strict';
import {
  compactOcChatUserMemory,
  mergeOcChatUserMemory,
  ocChatUserMessagesSince,
  redactOcChatUserMemorySensitive,
  shouldScanOcChatUserMemory,
  OC_CHAT_USER_MEMORY_MAX_CHARS,
} from '../lib/oc/ocChatUserMemory';

const phoneRedacted = redactOcChatUserMemorySensitive('연락은 010-1234-5678로');
assert.ok(!/010/.test(phoneRedacted));
assert.ok(phoneRedacted.includes('연락'));
assert.ok(!redactOcChatUserMemorySensitive('메일 test@example.com').includes('@'));
const personal = [{ role: 'user', content: '내 이름은 민수야. 떡볶이 좋아해', at: 100 }];
assert.equal(shouldScanOcChatUserMemory(personal), true);
assert.equal(shouldScanOcChatUserMemory([{ role: 'user', content: 'ㅋㅋ', at: 1 }]), false);

const since = ocChatUserMessagesSince(
  [
    { role: 'user', content: '옛말', at: 10 },
    { role: 'assistant', content: '응', at: 11 },
    { role: 'user', content: '새말 생일이야', at: 20 },
  ],
  10,
);
assert.equal(since.length, 1);
assert.equal(since[0]?.content, '새말 생일이야');

const longParts = Array.from({ length: 12 }, (_, i) => `사실${i}${'가'.repeat(40)}`).join(' / ');
const compact = compactOcChatUserMemory(longParts);
assert.ok(compact.length <= OC_CHAT_USER_MEMORY_MAX_CHARS + 1);
assert.ok(compact.includes('사실11') || compact.includes('사실10'));

const merged = mergeOcChatUserMemory('유저 호칭은 랑코.', '떡볶이를 좋아함.');
assert.ok(merged.includes('랑코'));
assert.ok(merged.includes('떡볶이'));

console.log('ocChatUserMemory tests passed');
