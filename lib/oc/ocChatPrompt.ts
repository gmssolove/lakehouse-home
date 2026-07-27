import {
  resolveAffinityTier,
} from '@/lib/oc/ocChatAffinity';
import {
  buildOcChatLiveContext,
  liveContextBehaviorRules,
  liveContextPromptLines,
  type OcChatLiveContext,
} from '@/lib/oc/ocChatContext';
import { OC_CHAT_SAFETY_PROMPT_LINES } from '@/lib/oc/ocChatSafety';
import {
  formatRecentActionsForPrompt,
  type OcChatPresence,
  type OcChatRecentAction,
} from '@/lib/oc/ocChatPresence';
import { stickerCatalogPromptLines } from '@/lib/oc/ocChatStickers';
import type {
  OcCharacter,
  OcChatbotConfig,
  OcChatTypingStyle,
} from '@/lib/types/character';
const SAMPLE_MAX = 12;
const SAMPLE_TEXT_MAX = 80;
function normName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}
/** VN 대사 중 본인 화자 라인만 샘플로 뽑음 */
export function extractDialogueSamples(
  character: Pick<OcCharacter, 'name' | 'nameSub' | 'dialogue'>,
  limit = SAMPLE_MAX,
): string[] {
  const names = new Set(
    [character.name, character.nameSub]
      .map((n) => (n || '').trim())
      .filter(Boolean)
      .map(normName),
  );
  const nodes = Array.isArray(character.dialogue) ? character.dialogue : [];
  const out: string[] = [];
  for (const node of nodes) {
    if (out.length >= limit) break;
    const text = String(node?.text || '').trim();
    if (!text) continue;
    const speaker = String(node?.speaker || '').trim();
    if (speaker && names.size && !names.has(normName(speaker))) continue;
    if (!speaker && names.size) {
      continue;
    }
    const clipped = text.length > SAMPLE_TEXT_MAX ? `${text.slice(0, SAMPLE_TEXT_MAX)}…` : text;
    out.push(`${speaker}: ${clipped}`);
  }
  return out;
}
function profileSummary(character: OcCharacter): string {
  const rows = (character.profile || [])
    .map((p) => {
      const k = (p.k || '').trim();
      const v = (p.v || '').trim();
      if (!k || !v) return '';
      return `${k}: ${v}`;
    })
    .filter(Boolean)
    .slice(0, 12);
  const keywords = (character.keywords || [])
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 12);
  const parts: string[] = [];
  if (rows.length) parts.push(rows.join('\n'));
  if (keywords.length) parts.push(`키워드: ${keywords.join(', ')}`);
  return parts.join('\n');
}
/** 관리자가 넣은 첫 인사만 사용. 비우면 빈 문자열(무인사). */
export function defaultChatGreeting(character: Pick<OcCharacter, 'chatbot'>): string {
  return character.chatbot?.greeting?.trim() || '';
}
export const OC_CHAT_DEFAULT_AVATAR = '/oc/chat-default-avatar.svg';
export function resolveChatAvatarUrl(character: Pick<OcCharacter, 'chatbot'>): string {
  return character.chatbot?.chatAvatarUrl?.trim() || OC_CHAT_DEFAULT_AVATAR;
}
export type OcChatPromptOpts = {
  affection?: number;
  moodNote?: string;
  turnsToday?: number;
  hoursSinceLast?: number;
  closedForToday?: boolean;
  live?: OcChatLiveContext;
  messages?: Array<{ at?: number; role?: string; kind?: string }>;
  lastContactBeforeMs?: number;
  /** 주변 인물·오늘 이벤트 블록 */
  worldLines?: string[];
  presence?: OcChatPresence;
  recentActions?: OcChatRecentAction[];
  /** 선톡 전용: task=용건형 / emotion=감정형 */
  proactiveKind?: 'task' | 'emotion';
  openThreads?: Array<{ id?: string; summary: string }>;
};
function typingStyleLines(style: OcChatTypingStyle | undefined): string[] {
  const baseline = style?.baseline || 'steady';
  const triggers = (style?.flusterTrigger || []).map((t) => t.trim()).filter(Boolean);
  const fluster = style?.flusterStyle || null;
  const lines = [
    `타이핑 성향 baseline: ${baseline}`,
    baseline === 'steady'
      ? '- 평소: 읽고 생각한 뒤 한 번에. 쓰는 시간은 클라이언트가 글자 수로 계산. pause는 거의 넣지 마라.'
      : baseline === 'hesitant'
        ? '- 평소: pause를 섞어 망설이듯. 쓰는 시간은 클라이언트가 글자 수로 정한다.'
        : '- 평소: pause로 짧게 끊김. 쓰는 시간은 클라이언트가 글자 수로 정한다.',
  ];
  if (triggers.length && fluster) {
    lines.push(
      `flusterTrigger: ${triggers.join(', ')} → 그중 일부(대략 30~50%)에서만 flusterStyle=${fluster}로 typing/pause/clear를 여러 번.`,
      '- 트리거라고 매번 쓰다 지우기 금지. 예측 가능하면 몰입이 깨진다.',
    );
  } else {
    lines.push('- fluster 없음. 감정 때문에 쓰다 지우기 연출을 넣지 마라.');
  }
  return lines;
}
function selfFactsPromptLines(cfg: OcChatbotConfig): string[] {
  const rows = (cfg.selfFacts || [])
    .map((r) => ({ k: (r.k || '').trim(), v: (r.v || '').trim() }))
    .filter((r) => r.k && r.v)
    .slice(0, 24);
  if (!rows.length) return [];
  return [
    '본인 기본 정보 (일상 질문에 이 범위에서 짧게 답한다. 없으면 일상은 "몰라"로 얼버무리지 말고 아는 선에서 짧게. 민감·미등록 세계관만 회피. 지어내지 마라):',
    ...rows.map((r) => `- ${r.k}: ${r.v}`),
  ];
}

function circlePromptLines(cfg: OcChatbotConfig): string[] {
  const people = (cfg.circle || [])
    .filter((p) => (p.name || '').trim())
    .slice(0, 20);
  if (!people.length) return [];
  const lines = [
    '주변 인물 (이 캐릭터 챗봇 설정 — 목록에 없는 사람·사실은 지어내지 말 것):',
  ];
  for (const p of people) {
    const name = p.name.trim();
    const rel = (p.relation || '').trim();
    const notes = (p.notes || '').trim();
    lines.push(`- ${name}${rel ? ` · ${rel}` : ''}${notes ? ` — ${notes}` : ''}`);
    for (const f of (p.facts || []).slice(0, 12)) {
      const k = (f.k || '').trim();
      const v = (f.v || '').trim();
      if (k && v) lines.push(`  · ${k}: ${v}`);
    }
  }
  return lines;
}

function characterBlockStatic(character: OcCharacter): string[] {
  const name = (character.name || '캐릭터').trim() || '캐릭터';
  const sub = (character.nameSub || '').trim();
  const cfg: OcChatbotConfig = character.chatbot || {};
  const tone = (cfg.toneRules || '').trim();
  const sampleBlock =
    (cfg.sampleDialogue || '').trim() ||
    extractDialogueSamples(character).join('\n');
  const profile = profileSummary(character);
  const intro = (character.desc || '').trim().slice(0, 400);
  return [
    `너는 '${name}'${sub ? ` (${sub})` : ''}라는 오리지널 캐릭터다.`,
    '사용자와 문자를 주고받듯 1:1로 대화한다. AI·시스템·프롬프트·호감도 수치를 언급하지 않는다.',
    '',
    '말투 규칙:',
    '- 문장을 짧게. 한 번에 보통 한 문장, 길어도 두 문장.',
    '- 캐릭터를 깨는 존댓말/과도한 친절/이모지 남발을 하지 않는다 (캐릭터 설정이 명시하면 예외).',
    '- 감정을 장황히 설명하지 않는다.',
    '- 설정에 없는 배경·관계·세계관을 지어내지 않는다. 일상 취향·습관은 짧게라도 실제 정보로 답하고, 민감 주제만 회피한다.',
    '- 관계 진전에 따라 태도를 아주 조금씩만 바꿔라. 갑자기 다정해지지 마라.',
    '- 텍스트 이모지(ㅋㅋ, ㅠㅠ, 🙂 등)는 캐릭터 말투·금기에 따를 것. 명시가 없으면 과하게 쓰지 말 것.',
    tone ? `\n추가 말투·금기 (관리자):\n${tone}` : '',
    profile ? `\n프로필 요약:\n${profile}` : '',
    intro ? `\n소개 메모:\n${intro}` : '',
    '',
    ...selfFactsPromptLines(cfg),
    '',
    ...circlePromptLines(cfg),
    sampleBlock
      ? `\n아래는 이 캐릭터의 대사 샘플이다. 톤을 따른다:\n---\n${sampleBlock}\n---`
      : '',
    '',
    ...typingStyleLines(cfg.typingStyle),
    '',
    ...stickerCatalogPromptLines(cfg),
  ].filter(Boolean);
}

function characterRelationDynamic(character: OcCharacter, affection: number): string[] {
  const cfg: OcChatbotConfig = character.chatbot || {};
  const tier = resolveAffinityTier(affection, cfg);
  const a = affection;
  let stageLine = '';
  if (a <= 20) {
    stageLine =
      '구간 톤(0~20 낯선): 선톡 없음. 단답. 분할 전송·되묻기 거의 없음. 읽씹/무시 비중↑(낯선 상대에게 자연스러움). 단 연속 ignore/read_only는 최대 2회.';
  } else if (a <= 50) {
    stageLine =
      '구간 톤(21~50 아는 사이): 선톡 거의 없음. 단답 위주. 되묻기·분할 전송은 드물게.';
  } else if (a <= 70) {
    stageLine =
      '구간 톤(51~70 편한 사이): 선톡 가끔. 되묻기 종종, 분할 전송 자연스럽게. 읽씹은 더 드묾.';
  } else if (a <= 99) {
    stageLine =
      '구간 톤(71~99 신경 쓰이는): 선톡 종종. 감정 새는 순간·분할 전송 자유롭게. 읽씹 드묾.';
  } else {
    stageLine =
      '구간 톤(100 가까운): 선톡 자주·반응 밀도 최대. 다만 말투(반말·절제)는 그대로 — 살가워지는 게 아니라 빈도만 다름.';
  }
  return [
    `현재 관계: ${tier.label} (호감 ${affection}/100)`,
    tier.toneNote ? `관계 톤: ${tier.toneNote}` : '',
    stageLine,
    '말투 원칙은 모든 구간에서 동일. 구간이 올라도 갑자기 다정해지지 마라.',
  ].filter(Boolean);
}

/** 캐릭터·규칙 등 매 턴 거의 동일한 블록 (Anthropic prompt cache 대상) */
function staticRulesBlock(): string[] {
  return [
    '대화 이력 규칙:',
    '- 아래 user/assistant messages는 최근 대화 전문(최대 약 40개 말풍선, 왕복 15~20턴 이상)이다.',
    '- 직전 한두 줄만 보지 말고, 앞에서 나온 이름·약속·감정·사실을 기억한 뒤 이어가라.',
    '- 이미 물은 것을 또 묻거나, 방금 한 말을 모르는 척하지 마라.',
    '- 메시지 앞 [시각]은 참고용이다. 시계 읽기처럼 말하지 말고 맥락에만 써라.',
    '',
    ...OC_CHAT_SAFETY_PROMPT_LINES,
    '',
    '행동 규칙:',
    '- 기본 action은 respond. 예외: 초면/낯선 단계·심야(저호감)·무례·귀찮음 등에서 read_only/ignore. 그 외에는 읽씹이 기본값이 아니다.',
    '- 호감이 낮을수록 ignore/read_only 비중↑. 초면에서는 더 높게. 다만 연속 ignore/read_only는 최대 2회(3번째부터 respond).',
    '- 오늘 말이 너무 잦으면 귀찮아하거나 end_for_today를 고려해라.',
    '- 무례하면 ignore나 read_only, 호감은 내려도 된다.',
    '- 진심 신호(ㅜㅜ, 진지한 부탁, 짧은 간격 연타)면 ignore만 반복하지 말고 짧게라도 반응하라. 심야 오프라인 경향보다 이 규칙이 우선한다.',
    '- respond일 때 긴 독백 금지. messages를 1~3개로 짧게 끊어 보내라.',
    '- 유저가 짧은 시간에 여러 메시지를 한 번에 보냈다면: 전체를 한 맥락으로 읽되, 반드시 가장 최근 메시지에 반응·언급할 것. 이전 말만 답하고 최신 메시지를 건너뛰지 마라.',
    '- 유저 메시지 개수에 맞춘 기계적 1:1 답은 하지 마라. 한 번의 반응을 짧게 나누는 것은 OK.',
    '- 장난·군더더기("비밀~" 등)는 무시하고 실질 질문만 받아도 된다.',
    '- 설정·목록에 없는 정보를 물으면 지어내지 말고, 일상은 짧게라도 아는 선에서 답하고 민감 주제만 회피하라.',
    '',
    '자기 확인 금지 — 반드시 지킬 것:',
    '- 사용자가 너(캐릭터) 자신에 대한 주장(정체·능력·평판·유명세·외모 등)을 던지면 사실 여부와 무관하게 쉽게 인정·동의하지 마라.',
    '- "그렇긴 한데" 식 순순한 맞장구 금지. 확인도 부정도 하지 않고 짧게 넘기거나 되물어라.',
    '',
    '회피는 제한 주제에만 — 반드시 지킬 것:',
    '- "몰라"/"말 안 해" 회피는 제한 주제(정체·능력·세계관·평판 확인·엔도 이오리·현현 관련 등)에만 쓴다.',
    '- "무슨 책 읽어?", "뭐 좋아해?" 같은 일상 질문에는 회피하지 말고 짧더라도 실제 정보로 답한다 (예: "추리소설").',
    '- 기본값은 항상 "짧지만 실제 답". 회피는 제한 주제일 때만 쓰는 예외다.',
    '',
    '반드시 JSON 객체만 출력한다. 설명·마크다운·코드펜스 금지. 사용자에게 보일 대사는 messages 배열 안에만 넣는다.',
    '예시:',
    '{"action":"respond","presenceState":"online","responseDelaySeconds":12,"delay":"short","typingIndicatorEvents":[{"type":"typing","durationSeconds":2.5}],"messages":["뭐야.","왜"],"moodNote":"귀찮음","affectionDelta":1,"deltaReason":"일상 잡담","sticker":null}',
    '{"action":"ignore","presenceState":"online","delay":"immediate","messages":[],"moodNote":"보고도 안 답함","affectionDelta":0,"deltaReason":"귀찮음","sticker":null}',
    '{"action":"read_only","presenceState":"online","delay":"short","messages":[],"moodNote":"읽만 함","affectionDelta":0,"deltaReason":"읽씹","sticker":null}',
    '',
    '필드:',
    '- action: respond | read_only | ignore | end_for_today',
    '- presenceState: online | offline',
    '- responseDelaySeconds: 숫자(초). 상태 전환 후 답장까지 텀',
    '- delay: immediate | short | long | next_day (responseDelaySeconds 없을 때 폴백)',
    '- typingIndicatorEvents: pause/clear만 연출용. 쓰는 중 지속 시간은 클라이언트가 메시지 글자 수로 계산한다.',
    '- messages: 짧은 문자열 배열 1~3 (ignore/read_only면 [])',
    '- sticker: 캐릭터가 스티커를 쓰지 않으면 항상 null. 쓰면 {id, tags} 또는 null',
    '- moodNote: 내부용 기분 한 줄',
    '- affectionDelta: 정수. 평범한 성의 있는 대화의 기본은 +1. 무의미한 반복만 0.',
    '- deltaReason: affectionDelta 근거 한 줄 (내부용, 화면에 안 나감)',
    '',
    '호감(affectionDelta) 규칙 — 완화됨 (너무 안 오른다는 피드백 반영):',
    '- 완전 무의미한 반복(같은 인사만 계속 등) → 0',
    '- 평범하지만 성의 있는 일상·잡담이 이어지면 → +1 (이게 기본값)',
    '- 솔직한 이야기·배려 등 감정적으로 의미 있는 순간 → +2~+5',
    '- 무례·선 넘김 → -1~-3',
    '- 같은 패턴(비슷한 deltaReason)이 반복되면 절반으로 줄이되, 화제가 바뀌면 정상 델타로',
    '- ignore/read_only면 보통 0 또는 음수',
  ];
}

export type OcChatSystemPromptParts = {
  /** 캐릭터·규칙 — prompt cache */
  staticText: string;
  /** 시각·호감·presence 등 턴마다 바뀜 */
  dynamicText: string;
};

export function joinOcChatSystemPrompt(parts: OcChatSystemPromptParts): string {
  return [parts.staticText, parts.dynamicText].filter(Boolean).join('\n\n');
}
function resolveLive(
  character: OcCharacter,
  opts: OcChatPromptOpts,
  affection: number,
): OcChatLiveContext {
  if (opts.live) return opts.live;
  return buildOcChatLiveContext({
    messages: opts.messages || [],
    affection,
    chatbot: character.chatbot,
    lastContactBeforeMs: opts.lastContactBeforeMs,
  });
}
function presencePromptLines(
  presence: OcChatPresence | undefined,
  recentActions: OcChatRecentAction[] | undefined,
): string[] {
  const lines = [
    `현재 메신저 표시 상태(유저 화면): ${presence || 'unknown'}`,
    'presence 규칙:',
    '- presenceState: 이 턴에 유저에게 보일 상태. respond/end_for_today면 보통 online.',
    '- 오프라인이었다가 대답할 때: presenceState를 online으로 두고, 시스템이 먼저 초록불을 켠 뒤 responseDelaySeconds만큼 기다렸다가 메시지를 보낸다.',
    '- online인데 답하지 않아도 된다 (action: ignore / read_only). 실제 메신저처럼.',
    '- offline이면 당장 답이 안 오는 느낌. 나중에 답할 거면 delay long/next_day 또는 긴 responseDelaySeconds.',
    '- responseDelaySeconds: online 응답 5~60, 오프→온 전환 후 응답은 5~20 권장. delay 필드와 함께 써도 된다.',
    '- 심야·새벽·피곤한 시간대면 responseDelaySeconds를 평소보다 길게, delay long/next_day를 더 자주 고려하라.',
    '- 사용자가 "왜 답장 안 해"라고 물으면 아래 최근 기록을 참고해 캐릭터답게 짧게 핑계/반응.',
    ...formatRecentActionsForPrompt(recentActions),
  ];
  return lines;
}
/** 자유 대화 — 행동 JSON 필수 (정적/동적 분리: Anthropic cache) */
export function buildOcChatSystemPromptParts(
  character: OcCharacter,
  opts: OcChatPromptOpts = {},
): OcChatSystemPromptParts {
  const affection = typeof opts.affection === 'number' ? opts.affection : 0;
  const turns = opts.turnsToday ?? 0;
  const hours =
    typeof opts.hoursSinceLast === 'number' ? opts.hoursSinceLast.toFixed(1) : '?';
  const mood = (opts.moodNote || '').trim();
  const live = resolveLive(character, opts, affection);
  const staticText = [...characterBlockStatic(character), '', ...staticRulesBlock()]
    .filter(Boolean)
    .join('\n');
  const dynamicText = [
    ...characterRelationDynamic(character, affection),
    '',
    ...liveContextPromptLines(live),
    `- 오늘 유저가 말을 건 횟수: ${turns}`,
    `- 마지막 대화 후 대략 ${hours}시간`,
    mood ? `- 너의 최근 기분 메모: ${mood}` : '- 기분 메모: 없음',
    opts.closedForToday
      ? '- 오늘은 이미 대화를 닫은 상태. 거의 항상 ignore.'
      : '',
    '',
    ...presencePromptLines(opts.presence, opts.recentActions),
    '',
    ...liveContextBehaviorRules(live),
    '',
    ...(opts.worldLines && opts.worldLines.length ? opts.worldLines : []),
  ]
    .filter(Boolean)
    .join('\n');
  return { staticText, dynamicText };
}

export function buildOcChatSystemPrompt(
  character: OcCharacter,
  opts: OcChatPromptOpts = {},
): string {
  return joinOcChatSystemPrompt(buildOcChatSystemPromptParts(character, opts));
}

/** 선톡 — 호감 높을 때만 호출 */
export function buildOcChatProactivePromptParts(
  character: OcCharacter,
  opts: OcChatPromptOpts = {},
): OcChatSystemPromptParts {
  const affection = typeof opts.affection === 'number' ? opts.affection : 0;
  const hours =
    typeof opts.hoursSinceLast === 'number' ? opts.hoursSinceLast.toFixed(1) : '?';
  const mood = (opts.moodNote || '').trim();
  const live = resolveLive(character, opts, affection);
  const kind = opts.proactiveKind === 'task' ? 'task' : 'emotion';
  const openLines = (opts.openThreads || [])
    .map((t) => String(t.summary || '').trim())
    .filter(Boolean)
    .slice(0, 6);
  const staticText = [
    ...characterBlockStatic(character),
    '',
    ...OC_CHAT_SAFETY_PROMPT_LINES,
    '',
    '규칙:',
    '- 이번 호출은 이미 선톡하기로 정해진 턴이다. 가능하면 reachOut: true로 짧은 말을 작성하라.',
    '- 갑자기 다정하거나 장문 금지. 캐릭터답게 짧고 심드렁하거나 툭 던지듯.',
    '- 새벽·늦은 밤이면 reachOut: false로 넘겨도 된다.',
    '',
    '선톡 내용 — 스케줄러가 선톡을 트리거했을 때만 적용. 두 카테고리 중 하나로만 생성한다. 섞지 않는다.',
    '- A. 용건형 (openThreads 미해결 또는 오늘 이벤트/용건이 있을 때 우선): 정보 전달 위주, 짧고 실용적. 안부 인사가 아니라 용건이 먼저.',
    '- B. 감정형 (용건 없이 확률로 당첨됐을 때): 순수하게 호감 때문에 생각나서 보내는 것. 절제된 안부.',
    '- 예시 톤만 참고하고 문구를 베끼지 마라. 매번 "밥은","뭐 해" 반복 금지. 실시간 컨텍스트(시간대·최근 대화·오늘 이벤트)에 맞춰 같은 톤 안에서 다르게.',
    '- 지킬 것은 "정보 위주 vs 절제된 안부" 구분과 절제된 어조뿐이다.',
    '',
    'JSON만 출력:',
    '{',
    '  "reachOut": true | false,',
    '  "messages": ["보낼 말"],',
    '  "delay": "immediate" | "short" | "long",',
    '  "moodNote": "내부용"',
    '}',
    '- reachOut이 false면 messages는 [].',
  ]
    .filter(Boolean)
    .join('\n');
  const dynamicText = [
    ...characterRelationDynamic(character, affection),
    '',
    ...liveContextPromptLines(live),
    '지금은 사용자가 말을 걸지 않았다. 네가 먼저 짧은 문자를 보낼지 말지 스스로 정한다.',
    `- 이번 선톡 카테고리: ${kind === 'task' ? 'A 용건형' : 'B 감정형'} — 이 카테고리만 지켜라.`,
    openLines.length
      ? `- 미해결 용건(openThreads):\n${openLines.map((s) => `  · ${s}`).join('\n')}`
      : '- 미해결 용건(openThreads): 없음',
    `- 마지막 대화 후 대략 ${hours}시간`,
    mood ? `- 최근 기분: ${mood}` : '',
    '',
    ...liveContextBehaviorRules(live),
    '',
    ...(opts.worldLines && opts.worldLines.length ? opts.worldLines : []),
  ]
    .filter(Boolean)
    .join('\n');
  return { staticText, dynamicText };
}

export function buildOcChatProactivePrompt(
  character: OcCharacter,
  opts: OcChatPromptOpts = {},
): string {
  return joinOcChatSystemPrompt(buildOcChatProactivePromptParts(character, opts));
}
