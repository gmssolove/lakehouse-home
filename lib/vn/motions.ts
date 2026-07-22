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

/** CSS 선택자 없이 스탠딩에 직접 재생 (VN 엔진용) */
export const DIALOGUE_MOTION_KEYFRAMES: Record<DialogueMotion, Keyframe[]> = {
  bounce: [
    { transform: 'translateY(0px)' },
    { transform: 'translateY(-4px)', offset: 0.42 },
    { transform: 'translateY(0px)' },
  ],
  shake: [
    { transform: 'translate3d(0,0,0)' },
    { transform: 'translate3d(-3px,1px,0)', offset: 0.1 },
    { transform: 'translate3d(3px,-1px,0)', offset: 0.2 },
    { transform: 'translate3d(-2.5px,1px,0)', offset: 0.3 },
    { transform: 'translate3d(2.5px,-1px,0)', offset: 0.4 },
    { transform: 'translate3d(-2px,0.5px,0)', offset: 0.5 },
    { transform: 'translate3d(2px,-0.5px,0)', offset: 0.6 },
    { transform: 'translate3d(-1px,0.3px,0)', offset: 0.75 },
    { transform: 'translate3d(0,0,0)' },
  ],
  nod: [
    { transform: 'translateY(0)' },
    { transform: 'translateY(6px)', offset: 0.25 },
    { transform: 'translateY(0)', offset: 0.5 },
    { transform: 'translateY(4px)', offset: 0.72 },
    { transform: 'translateY(0)' },
  ],
  tilt: [
    { transform: 'rotate(0deg)' },
    { transform: 'rotate(-2.2deg)', offset: 0.35 },
    { transform: 'rotate(1.1deg)', offset: 0.7 },
    { transform: 'rotate(0deg)' },
  ],
  hop: [
    { transform: 'translateY(0)' },
    { transform: 'translateY(-12px)', offset: 0.4 },
    { transform: 'translateY(-2px)', offset: 0.7 },
    { transform: 'translateY(0)' },
  ],
  droop: [
    { transform: 'translateY(0) scale(1)' },
    { transform: 'translateY(8px) scale(0.97)', offset: 0.45 },
    { transform: 'translateY(0) scale(1)' },
  ],
  pulse: [
    { transform: 'scale(1)', opacity: 1 },
    { transform: 'scale(1.04)', opacity: 1, offset: 0.35 },
    { transform: 'scale(1)', opacity: 1 },
  ],
  stagger: [
    { transform: 'translate3d(0,0,0)' },
    { transform: 'translate3d(-4px,2px,0)', offset: 0.22 },
    { transform: 'translate3d(4px,-2px,0)', offset: 0.48 },
    { transform: 'translate3d(-2px,1px,0)', offset: 0.72 },
    { transform: 'translate3d(0,0,0)' },
  ],
};

export const DIALOGUE_MOTION_EASING: Record<DialogueMotion, string> = {
  bounce: 'cubic-bezier(0.34, 1.2, 0.64, 1)',
  shake: 'linear',
  nod: 'ease-in-out',
  tilt: 'ease-in-out',
  hop: 'cubic-bezier(0.34, 1.15, 0.64, 1)',
  droop: 'ease-in-out',
  pulse: 'cubic-bezier(0.33, 0.12, 0.25, 1)',
  stagger: 'ease-in-out',
};

/** element.animate 로 재생. 반환값 cancel 용 */
export function playDialogueMotion(
  el: HTMLElement | null | undefined,
  motion: DialogueMotion | null | undefined,
): Animation | null {
  if (!el || !isDialogueMotion(motion)) return null;
  try {
    el.getAnimations?.().forEach((a) => a.cancel());
    return el.animate(DIALOGUE_MOTION_KEYFRAMES[motion], {
      duration: DIALOGUE_MOTION_MS[motion],
      easing: DIALOGUE_MOTION_EASING[motion],
      fill: 'both',
    });
  } catch {
    return null;
  }
}
