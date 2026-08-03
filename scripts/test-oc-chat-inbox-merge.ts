/**
 * Inbox merge / reset preview regression.
 * Run: npx tsx scripts/test-oc-chat-inbox-merge.ts
 */
import {
  inboxItemFromThread,
  mergeOcChatInboxItems,
  type OcChatInboxItem,
  type OcChatThread,
} from '../lib/oc/ocChat';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function eq(a: unknown, b: unknown, msg: string) {
  if (a !== b) throw new Error(`${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
}

const baseMsg = (id: string, role: 'user' | 'assistant', at: number, content: string) => ({
  id,
  role,
  content,
  at,
  kind: 'chat' as const,
});

/* 1) 읽음 후 stale remote unread 가 같은 lastAt 에서 되살아나지 않음 */
{
  const local: OcChatInboxItem = {
    characterId: 'c1',
    lastAt: 1000,
    preview: '안녕',
    unread: 0,
    updatedAt: 2000,
  };
  const remote: OcChatInboxItem = {
    characterId: 'c1',
    lastAt: 1000,
    preview: '안녕',
    unread: 3,
    updatedAt: 2100, // remote 가 더 새로워도
  };
  const merged = mergeOcChatInboxItems([local], [remote], [local]);
  eq(merged[0]?.unread, 0, 'read wins over stale remote unread');
}

/* 2) 초기화 stub 이 옛 미리보기·뱃지를 덮음 */
{
  const old: OcChatInboxItem = {
    characterId: 'c1',
    lastAt: 5000,
    preview: '옛 대화 미리보기',
    unread: 2,
    updatedAt: 5000,
  };
  const stub: OcChatInboxItem = {
    characterId: 'c1',
    lastAt: 9000,
    preview: '',
    unread: 0,
    updatedAt: 9000,
  };
  const merged = mergeOcChatInboxItems([old], [stub]);
  eq(merged[0]?.preview, '', 'reset clears preview');
  eq(merged[0]?.unread, 0, 'reset clears unread');
}

/* 3) 초기화 후 자동 인사만 — inboxItem 은 빈 미리보기 */
{
  const wipedAt = 12_000;
  const thread: OcChatThread = {
    messages: [baseMsg('g1', 'assistant', wipedAt, '처음 뵙겠습니다')],
    updatedAt: wipedAt,
    affection: 0,
    clearedAt: wipedAt,
    lastSeenAt: 0,
  };
  const item = inboxItemFromThread('c1', thread);
  assert(item, 'bootstrap stub exists');
  eq(item.preview, '', 'greeting-only after clear → empty preview');
  eq(item.unread, 0, 'greeting-only after clear → unread 0');
}

/* 4) 유저가 말한 뒤에는 미리보기 표시 */
{
  const t0 = 12_000;
  const thread: OcChatThread = {
    messages: [
      baseMsg('g1', 'assistant', t0, '처음 뵙겠습니다'),
      baseMsg('u1', 'user', t0 + 100, '안녕'),
    ],
    updatedAt: t0 + 100,
    affection: 0,
    clearedAt: t0,
    lastSeenAt: t0 + 100,
  };
  const item = inboxItemFromThread('c1', thread);
  assert(item, 'real chat item');
  eq(item.preview, '안녕', 'user message shows in preview');
  eq(item.unread, 0, 'seen → unread 0');
}

/* 5) 같은 lastAt 에서 한쪽 unread=0 이면 0 */
{
  const a: OcChatInboxItem = {
    characterId: 'c1',
    lastAt: 100,
    preview: 'x',
    unread: 4,
    updatedAt: 100,
  };
  const b: OcChatInboxItem = {
    characterId: 'c1',
    lastAt: 100,
    preview: 'x',
    unread: 0,
    updatedAt: 90,
  };
  const merged = mergeOcChatInboxItems([a], [b]);
  eq(merged[0]?.unread, 0, 'min unread at same lastAt');
}

console.log('ok: oc-chat-inbox-merge');
