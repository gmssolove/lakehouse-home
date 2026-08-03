/**
 * 긴 대화 후 초반 사실 회상 — userMemory + memorySummary 프롬프트 주입 검증
 *
 * 시나리오:
 * 1) 초반에 이름·취향·감정적으로 의미 있는 사건 언급
 * 2) 이후 잡담으로 20+ cold(라이브 36 밖) 말풍선 누적
 * 3) 요약·userMemory 갱신(시뮬) 후 최근 36만 API 히스토리로 두고
 *    "초반에 뭐라고 했지?"류 질문을 프롬프트에 실었을 때
 *    초반 사실이 히스토리에는 없어도 시스템 프롬프트에는 남아 있는지 확인
 *
 * 실행: pnpm exec tsx scripts/test-oc-chat-long-memory-recall.ts
 */
import assert from 'node:assert/strict';
import {
  compactOcChatMemorySummary,
  formatOcChatMemoryTranscript,
  mergeOcChatMemorySummaries,
  ocChatColdMessages,
  ocChatMemoryPromptLines,
  ocChatUncoveredColdMessages,
  parseOcChatMemorySummaryOutput,
  shouldRefreshOcChatMemory,
  OC_CHAT_MEMORY_LIVE_MAX,
  OC_CHAT_MEMORY_TRIGGER_MSGS,
} from '../lib/oc/ocChatMemory';
import {
  compactOcChatUserMemory,
  mergeOcChatUserMemory,
  ocChatUserMemoryPromptLines,
  ocChatUserMessagesSince,
  parseOcChatUserMemoryOutput,
  redactOcChatUserMemorySensitive,
  shouldScanOcChatUserMemory,
} from '../lib/oc/ocChatUserMemory';
import { buildOcChatSystemPrompt } from '../lib/oc/ocChatPrompt';
import { prepareOcChatModelMessages } from '../lib/oc/ocChatModelMessages';
import type { OcCharacter } from '../lib/types/character';

/** `OC_CHAT_API_HISTORY` 와 동일 — ocChat.ts(Firebase) 임포트 회피 */
const API_HISTORY = OC_CHAT_MEMORY_LIVE_MAX;

type Msg = { role: 'user' | 'assistant'; content: string; at: number; kind?: string };

function msg(role: 'user' | 'assistant', content: string, at: number): Msg {
  return { role, content, at, kind: 'chat' };
}

/** 초반 사실 — 나중에 창 밖으로 밀려남 */
const EARLY_NAME = '서연';
const EARLY_LIKE = '딸기케이크';
const EARLY_EVENT = '밴드부 오디션';

const earlyBeats: Msg[] = [
  msg('user', `안녕, 내 이름은 ${EARLY_NAME}이야. 앞으로 그렇게 불러줘.`, 1_000),
  msg('assistant', '그래. 서연.', 1_001),
  msg('user', `나 ${EARLY_LIKE} 진짜 좋아해.`, 1_002),
  msg('assistant', '알겠어.', 1_003),
  msg(
    'user',
    `어제 ${EARLY_EVENT} 망해서 좀 우울했어. 기억해줘.`,
    1_004,
  ),
  msg('assistant', '고생했네. 기억할게.', 1_005),
];

/** 잡담으로 cold 구간을 TRIGGER 이상 채움 */
const fillerCount = OC_CHAT_MEMORY_LIVE_MAX + OC_CHAT_MEMORY_TRIGGER_MSGS;
const filler: Msg[] = [];
for (let i = 0; i < fillerCount; i++) {
  const at = 2_000 + i;
  if (i % 2 === 0) filler.push(msg('user', `ㅋㅋ 오늘 날씨 ${i}`, at));
  else filler.push(msg('assistant', `그래 ${i}`, at));
}

const fullThread: Msg[] = [...earlyBeats, ...filler];

/* --- 1) cold 창·트리거 --- */
const cold = ocChatColdMessages(fullThread);
assert.ok(
  cold.length >= OC_CHAT_MEMORY_TRIGGER_MSGS,
  `cold should be >= ${OC_CHAT_MEMORY_TRIGGER_MSGS}, got ${cold.length}`,
);
assert.equal(
  shouldRefreshOcChatMemory({ messages: fullThread }),
  true,
  'should refresh memory after enough cold bubbles',
);

const uncovered = ocChatUncoveredColdMessages(fullThread, undefined);
assert.ok(
  uncovered.some((m) => String(m.content || '').includes(EARLY_NAME)),
  'early name must sit in uncovered cold region before summarization',
);

/* --- 2) userMemory: 초반 유저 발언에서 사실 추출(시뮬) --- */
const earlyUsers = ocChatUserMessagesSince(earlyBeats, undefined);
assert.equal(shouldScanOcChatUserMemory(earlyUsers), true);

const userMemRaw = parseOcChatUserMemoryOutput(
  `호칭 ${EARLY_NAME} / ${EARLY_LIKE} 좋아함 / 어제 ${EARLY_EVENT} 실패로 우울`,
);
const userMemory = mergeOcChatUserMemory(undefined, userMemRaw);
assert.ok(userMemory.includes(EARLY_NAME));
assert.ok(userMemory.includes(EARLY_LIKE));
assert.ok(!userMemory.includes('010')); // 민감정보 없음

/* 민감정보 필터 */
const leaked = mergeOcChatUserMemory(
  userMemory,
  redactOcChatUserMemorySensitive(`연락처 010-1111-2222 / 카톡 id: secret_user`),
);
assert.ok(!/010/.test(leaked));
assert.ok(!/secret_user/i.test(leaked));

/* --- 3) memorySummary: cold 전사 → 요약 병합(시뮬) --- */
const transcript = formatOcChatMemoryTranscript(uncovered);
assert.ok(transcript.includes(EARLY_NAME));
assert.ok(transcript.includes(EARLY_EVENT));

const summaryChunk = parseOcChatMemorySummaryOutput(
  `유저(${EARLY_NAME})가 ${EARLY_LIKE}를 좋아함. ${EARLY_EVENT} 실패로 우울해했고 OC가 기억하겠다고 함.`,
);
const memorySummary = mergeOcChatMemorySummaries(undefined, summaryChunk);
assert.ok(memorySummary.includes(EARLY_NAME));
assert.ok(memorySummary.includes(EARLY_EVENT));

/* 누적 재압축 */
const bloated = mergeOcChatMemorySummaries(
  memorySummary,
  Array.from({ length: 30 }, (_, i) => `잡사실${i}${'나'.repeat(20)}`).join(' / '),
);
assert.ok(bloated.length <= 501);
assert.ok(
  compactOcChatMemorySummary(bloated).length <= 501,
);

/* --- 4) API 히스토리는 최근 36만 — 초반 사실 부재 --- */
const historyForApi = fullThread.slice(-API_HISTORY);
assert.equal(historyForApi.length, API_HISTORY);
assert.ok(
  !historyForApi.some((m) => m.content.includes(EARLY_NAME)),
  'live window must NOT contain early name (forced forget without memory)',
);
assert.ok(
  !historyForApi.some((m) => m.content.includes(EARLY_EVENT)),
  'live window must NOT contain early event',
);

/* 회상 질문 추가 */
const recallQ = msg(
  'user',
  '내 이름이 뭐였지? 그리고 어제 뭐 때문에 우울하다고 했더라?',
  9_000,
);
const withRecall = [...historyForApi, recallQ];
const prepared = prepareOcChatModelMessages(
  withRecall.map((m) => ({
    role: m.role,
    content: m.content,
    at: m.at,
    kind: m.kind,
  })),
  { max: API_HISTORY, withClock: false, maxModelTurns: API_HISTORY },
);
assert.ok(
  !prepared.some((m) => String(m.content || '').includes(EARLY_EVENT)),
  'prepared model history still lacks early event',
);

/* --- 5) 시스템 프롬프트에 요약·userMemory 주입 --- */
const character = {
  id: 'oc-test',
  name: '랑코',
  chatbot: {
    enabled: true,
    systemPrompt: '짧고 솔직하게 말해.',
  },
} as OcCharacter;

const system = buildOcChatSystemPrompt(character, {
  affection: 40,
  turnsToday: 30,
  hoursSinceLast: 0.1,
  memorySummary,
  userMemory,
});

assert.ok(system.includes('이전 대화 요약'), 'prompt label for conversation summary');
assert.ok(system.includes('userMemory') || system.includes('기억 중인 사실'), 'prompt label for userMemory');
assert.ok(system.includes(EARLY_NAME), 'system prompt recalls user name');
assert.ok(
  system.includes(EARLY_LIKE) || system.includes(EARLY_EVENT),
  'system prompt recalls early like or event',
);

const memLines = ocChatMemoryPromptLines(memorySummary).join('\n');
const userLines = ocChatUserMemoryPromptLines(userMemory).join('\n');
assert.ok(memLines.includes(EARLY_NAME));
assert.ok(userLines.includes(EARLY_NAME));
assert.ok(compactOcChatUserMemory(userMemory).length <= 400);

console.log('oc-chat long memory recall scenario passed', {
  threadMsgs: fullThread.length,
  cold: cold.length,
  liveMax: OC_CHAT_MEMORY_LIVE_MAX,
  historyForApi: historyForApi.length,
  memorySummaryLen: memorySummary.length,
  userMemoryLen: userMemory.length,
  systemHasName: system.includes(EARLY_NAME),
});
