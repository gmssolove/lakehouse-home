/** VN 캐릭터 몸 움직임 + 머리 위 기호 효과 */

export const DIALOGUE_MOTIONS = [
  'bounce',
  'shake',
  'nod',
  'tilt',
  'hop',
  'droop',
  'pulse',
  'stagger',
] as const;

export type DialogueMotion = (typeof DIALOGUE_MOTIONS)[number];

export const DIALOGUE_MOTION_OPTIONS: { value: DialogueMotion; label: string }[] = [
  { value: 'bounce', label: '통통' },
  { value: 'shake', label: '파르르' },
  { value: 'nod', label: '끄덕끄덕' },
  { value: 'tilt', label: '갸우뚱' },
  { value: 'hop', label: '폴짝' },
  { value: 'droop', label: '시무룩' },
  { value: 'pulse', label: '반짝(두근)' },
  { value: 'stagger', label: '휘청' },
];

/** CSS duration + 여유 (두근은 블룸이 김) */
export const DIALOGUE_MOTION_MS: Record<DialogueMotion, number> = {
  bounce: 280,
  shake: 360,
  nod: 480,
  tilt: 520,
  hop: 420,
  droop: 560,
  pulse: 960,
  stagger: 520,
};

export const DIALOGUE_FXS = [
  'question',
  'exclaim',
  'heart',
  'sweat',
  'anger',
  'sparkle',
  'music',
] as const;

export type DialogueFx = (typeof DIALOGUE_FXS)[number];

export const DIALOGUE_FX_OPTIONS: { value: DialogueFx; label: string }[] = [
  { value: 'question', label: '물음표 ?' },
  { value: 'exclaim', label: '깜짝 !' },
  { value: 'heart', label: '하트 ♥' },
  { value: 'sweat', label: '식은땀' },
  { value: 'anger', label: '뿌루퉁' },
  { value: 'sparkle', label: '반짝 ✦' },
  { value: 'music', label: '음표 ♪' },
];

export const DIALOGUE_FX_MS = 980;

export const DIALOGUE_FX_GLYPH: Record<DialogueFx, string> = {
  question: '?',
  exclaim: '!',
  heart: '♥',
  sweat: ';;',
  anger: '//',
  sparkle: '✦',
  music: '♪',
};

export function isDialogueMotion(v: unknown): v is DialogueMotion {
  return typeof v === 'string' && (DIALOGUE_MOTIONS as readonly string[]).includes(v);
}

/** 옛 shrink → droop */
export function normalizeMotion(v: unknown): DialogueMotion | null {
  if (v === 'shrink') return 'droop';
  return isDialogueMotion(v) ? v : null;
}

export function isDialogueFx(v: unknown): v is DialogueFx {
  return typeof v === 'string' && (DIALOGUE_FXS as readonly string[]).includes(v);
}

export function ocMotionClass(motion: DialogueMotion | null | undefined): string {
  if (!isDialogueMotion(motion)) return '';
  return ` oc-char-${motion}-once is-char-motion`;
}

export function pairMotionClass(motion: DialogueMotion | null | undefined): string {
  if (!isDialogueMotion(motion)) return '';
  return ` pair-char-${motion}-once is-char-motion`;
}
