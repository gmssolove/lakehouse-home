/**
 * 이브 전용 말투 — 프롬프트 보강 + 기계적 후처리(비용 0).
 * 다른 OC에는 적용하지 않는다.
 */

import type { OcCharacter } from '@/lib/types/character';

export const EVE_CHARACTER_ID = '1781687965372';

export function isEveCharacter(
  character: Pick<OcCharacter, 'id' | 'name' | 'nameSub'> | null | undefined,
): boolean {
  if (!character) return false;
  if (String(character.id) === EVE_CHARACTER_ID) return true;
  const name = (character.name || '').trim();
  if (name === '이브') return true;
  const sub = (character.nameSub || '').trim();
  return /^yv[eéè]e$/i.test(sub);
}

/** 평서문 끝 마침표 제거. ? / ! / … / ... 는 유지 */
export function stripEveTrailingPeriod(text: string): string {
  const t = String(text || '');
  if (/\.\.\.\s*$/.test(t) || /…\s*$/.test(t)) return t.replace(/\s+$/u, '');
  if (/\?\s*$/.test(t) || /!\s*$/.test(t)) return t;
  return t.replace(/\.\s*$/u, '');
}

/**
 * 구두점·공백만으로 된 말풍선 (실버그: "....." 단독).
 * 할 말이 없으면 action을 read_only/ignore로 바꿔야 함.
 */
export function isEvePunctuationOnly(text: string): boolean {
  const stripped = String(text || '')
    .trim()
    .replace(/[.…?!~\s]/gu, '');
  return stripped.length === 0;
}

/** 허용되는 ~해 종결 (거절·평서) */
const EVE_OK_ENDINGS = [
  /안\s*해\s*$/u,
  /못\s*해\s*$/u,
  /됐어\s*$/u,
  /모르겠어\s*$/u,
  /몰라\s*$/u,
  /그래\s*$/u,
  /아니\s*$/u,
  /응\s*$/u,
  /왜\s*$/u,
  /뭐야\s*$/u,
  /뭐\s*$/u,
  /누구\s*$/u,
  /밥은\s*$/u,
  /얘기해\s*$/u,
];

/**
 * 명령형·지시형 어미 (이브 toneRules 방어선).
 * "지 마"는 동사어간 전체 매칭 — "하지 마"뿐 아니라 "물어보지 마"/"묻지 마"도 잡음.
 */
const EVE_COMMAND_PATTERNS = [
  /지\s?마요?[.!]?\s*$/u,
  /(?<![아어])자[.!]?\s*$/u,
  /해\s?봐요?\s*$/u,
  /그만해\s*$/u,
  /찾아봐\s*$/u,
  /가봐\s*$/u,
  /다른\s*(데|걸).*(가|찾아)\s*봐\s*$/u,
  /(^|\s)그럼\s*자\s*$/u,
  /(^|\s)가\s*$/u,
  /먹어\s*$/u,
  /자야\s*지\s*$/u,
  /해[.!]?\s*$/u,
];

export function hasEveCommandEnding(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || isEvePunctuationOnly(t)) return false;
  const bare = t.replace(/[.!?…]+$/u, '');
  if (EVE_OK_ENDINGS.some((p) => p.test(bare))) return false;
  return EVE_COMMAND_PATTERNS.some((p) => p.test(t) || p.test(bare));
}

export type EveMechanicalFailKind = 'command_ending' | 'punctuation_only';

export function applyEveMechanicalFilters(messages: string[]): {
  fixed: string[];
  needsRegeneration: boolean;
  failKind?: EveMechanicalFailKind;
} {
  const fixed = messages.map((m) => stripEveTrailingPeriod(String(m || '').trim()));
  let failKind: EveMechanicalFailKind | undefined;
  for (const m of messages) {
    if (isEvePunctuationOnly(m)) {
      failKind = 'punctuation_only';
      break;
    }
    if (hasEveCommandEnding(m)) {
      failKind = 'command_ending';
      break;
    }
  }
  /* strip 후 내용이 전부 사라짐도 재생성 */
  const nonEmpty = fixed.filter(Boolean);
  if (!failKind && messages.length > 0 && nonEmpty.length === 0) {
    failKind = 'punctuation_only';
  }
  return {
    fixed: failKind ? fixed : nonEmpty.length ? nonEmpty : fixed,
    needsRegeneration: Boolean(failKind),
    failKind,
  };
}

/** staticRules JSON 예시의 마침표보다 나중에 붙여 우선권을 줌 */
export function eveSpeechOverridePromptLines(): string[] {
  return [
    '',
    '【이브 말투 — 최우선, 위 JSON 예시·일반 규칙보다 우선】',
    '- 평서문 끝에 마침표(.)를 절대 붙이지 마라. 물음표(?)·말줄임표(…/...)만 허용.',
    '- 잘못된 예: "뭐야." / "응." → 올바른 예: "뭐야" / "응"',
    '- 명령형·지시형 금지: "~해", "~지 마"(묻지 마/물어보지 마 포함), "~자", "~가", "~해봐", "그럼 자", "먹어" 등.',
    '- 거절·의사는 평서형만: "그건 말 안 해", "모르겠어", "됐어".',
    '- 구두점만으로 된 메시지 금지 (예: ".....", "...", "???") — 할 말 없으면 action을 read_only/ignore.',
    '- 축약형 금지: "뭔"→"무슨", "뭐래", "그니까" 등 쓰지 마라.',
    '- 이모티콘·물결(~)·느낌표(!) 금지.',
    '- messages는 짧고 문법적으로 끝난 구/문장. 접속사·조사·명사로 뚝 끊지 마라.',
  ];
}
