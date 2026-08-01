/**
 * ocChatMemory 순수 함수 스모크 테스트 (node + tsx)
 * 실행: pnpm exec tsx scripts/test-oc-chat-memory.ts
 */
import assert from 'node:assert/strict';
import {
  capOcChatMemorySummary,
  mergeOcChatMemorySummaries,
  ocChatColdMessages,
  ocChatUncoveredColdMessages,
  shouldRefreshOcChatMemory,
  OC_CHAT_MEMORY_LIVE_MAX,
  OC_CHAT_MEMORY_MAX_CHARS,
  OC_CHAT_MEMORY_TRIGGER_MSGS,
} from '../lib/oc/ocChatMemory';

function msg(role: 'user' | 'assistant', content: string, at: number) {
  return { role, content, at, kind: 'chat' as const };
}

const many = Array.from({ length: OC_CHAT_MEMORY_LIVE_MAX + OC_CHAT_MEMORY_TRIGGER_MSGS }, (_, i) =>
  msg(i % 2 === 0 ? 'user' : 'assistant', `line-${i}`, 1_000 + i),
);

assert.equal(ocChatColdMessages(many).length, OC_CHAT_MEMORY_TRIGGER_MSGS);
assert.equal(shouldRefreshOcChatMemory({ messages: many }), true);
assert.equal(
  shouldRefreshOcChatMemory({ messages: many, memorySummaryThroughAt: 9_999 }),
  false,
);

const uncovered = ocChatUncoveredColdMessages(many, 1_010);
assert.ok(uncovered.every((m) => (m.at || 0) > 1_010));

const long = '가'.repeat(OC_CHAT_MEMORY_MAX_CHARS + 80);
const capped = capOcChatMemorySummary(long);
assert.ok(capped.length <= OC_CHAT_MEMORY_MAX_CHARS + 1);
assert.ok(capped.startsWith('…'));

const merged = mergeOcChatMemorySummaries('유저는 랑코.', '밴드부 응원 중.');
assert.ok(merged.includes('랑코'));
assert.ok(merged.includes('밴드'));

console.log('ocChatMemory tests passed');
