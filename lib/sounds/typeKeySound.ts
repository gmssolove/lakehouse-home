import type { SiteUiSettings } from '@/lib/types/site-content';

let audioCtx: AudioContext | null = null;

function ac() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function resume(c: AudioContext) {
  if (c.state === 'suspended') void c.resume();
}

function playClicky() {
  const c = ac();
  if (!c) return;
  resume(c);
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(1850 + Math.random() * 120, now);
  osc.frequency.exponentialRampToValueAtTime(420, now + 0.018);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.07, now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.05);
}

function playLinear() {
  const c = ac();
  if (!c) return;
  resume(c);
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(210 + Math.random() * 40, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.06);
}

function playTypewriter() {
  const c = ac();
  if (!c) return;
  resume(c);
  const now = c.currentTime;
  const len = Math.floor(c.sampleRate * 0.04);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1400 + Math.random() * 400;
  filter.Q.value = 1.4;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.14, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  src.start(now);
  src.stop(now + 0.06);
}

function playThock() {
  const c = ac();
  if (!c) return;
  resume(c);
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(140 + Math.random() * 30, now);
  osc.frequency.exponentialRampToValueAtTime(70, now + 0.05);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.09);
}

function playSoft() {
  const c = ac();
  if (!c) return;
  resume(c);
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(320 + Math.random() * 40, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.05, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.045);
}

export const TYPE_KEY_SOUND_PRESETS = [
  { id: 'clicky' as const, label: 'Clicky — 찰칵' },
  { id: 'linear' as const, label: 'Linear — 부드러운 누름' },
  { id: 'typewriter' as const, label: 'Typewriter — 타자기' },
  { id: 'thock' as const, label: 'Thock — 둔탁한 키' },
  { id: 'soft' as const, label: 'Soft — 짧은 탭' },
  { id: 'custom' as const, label: 'Custom — 직접 업로드' },
];

export type TypeKeySoundSettings = Pick<
  SiteUiSettings,
  'typeKeySoundEnabled' | 'typeKeySoundPreset' | 'typeKeySoundCustom'
>;

const NAMED_CODES: Record<string, string> = {
  space: 'Space',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  backspace: 'Backspace',
  esc: 'Escape',
  escape: 'Escape',
  delete: 'Delete',
  home: 'Home',
  end: 'End',
};

export function typeKeyBindFromEvent(e: KeyboardEvent): { code: string; label: string } {
  const code = e.code || e.key;
  let label = e.key;
  if (e.code === 'Space' || e.key === ' ') label = 'Space';
  else if (e.code.startsWith('Key') && e.code.length === 4) label = e.code.slice(3);
  else if (e.code.startsWith('Digit')) label = e.code.slice(5);
  else if (e.key.length === 1) label = e.key.toUpperCase();
  return { code, label };
}

/** 칸에 A / Space / Enter / KeyA 처럼 적어도 인식 */
export function parseTypeKeyBindInput(raw: string): { code: string; label: string } | null {
  const t = raw.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (NAMED_CODES[lower]) {
    const code = NAMED_CODES[lower];
    return { code, label: code };
  }
  if (/^f([1-9]|1[0-2])$/i.test(t)) {
    const code = t.toUpperCase();
    return { code, label: code };
  }
  if (/^key[a-z]$/i.test(t)) {
    const letter = t.slice(-1).toUpperCase();
    return { code: `Key${letter}`, label: letter };
  }
  if (/^digit[0-9]$/i.test(t)) {
    const d = t.slice(-1);
    return { code: `Digit${d}`, label: d };
  }
  if (t.length === 1) {
    if (/[a-zA-Z]/.test(t)) return { code: `Key${t.toUpperCase()}`, label: t.toUpperCase() };
    if (/[0-9]/.test(t)) return { code: `Digit${t}`, label: t };
    if (t === ' ') return { code: 'Space', label: 'Space' };
    return { code: t, label: t };
  }
  return { code: t, label: t };
}

export function findTypeKeyBind(
  binds: SiteUiSettings['typeKeySoundBinds'] | undefined,
  e: KeyboardEvent,
) {
  if (!binds?.length) return undefined;
  const code = e.code;
  const key = e.key;
  return binds.find((b) => {
    if (!b.sound) return false;
    if (b.code && (b.code === code || b.code === key)) return true;
    if (b.label && b.label.toLowerCase() === key.toLowerCase()) return true;
    return false;
  });
}

let lastPlayAt = 0;

function markPlay(): boolean {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastPlayAt < 28) return false;
  lastPlayAt = now;
  return true;
}

export function playTypeKeyFile(url: string) {
  if (!url || !markPlay()) return;
  try {
    const a = new Audio(url);
    a.volume = 0.45;
    void a.play();
  } catch {
    /* ignore */
  }
}

export function playTypeKeySound(settings: TypeKeySoundSettings) {
  if (!settings.typeKeySoundEnabled) return;
  if (!markPlay()) return;

  if (settings.typeKeySoundPreset === 'custom' && settings.typeKeySoundCustom) {
    try {
      const a = new Audio(settings.typeKeySoundCustom);
      a.volume = 0.45;
      void a.play();
    } catch {
      /* ignore */
    }
    return;
  }

  const preset = settings.typeKeySoundPreset;
  if (preset === 'linear') playLinear();
  else if (preset === 'typewriter') playTypewriter();
  else if (preset === 'thock') playThock();
  else if (preset === 'soft') playSoft();
  else playClicky();
}

export function isTypeKeyEvent(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key === 'Escape' || e.key === 'CapsLock' || e.key === 'Dead') return false;
  if (e.key.startsWith('Arrow') || e.key.startsWith('F') && e.key.length <= 3) return false;
  if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return false;

  if (e.code.startsWith('Key') || e.code.startsWith('Digit') || e.code.startsWith('Numpad')) return true;
  if (e.code === 'Space' || e.code === 'Backspace' || e.code === 'Enter' || e.code === 'Tab') return true;
  if (e.key.length === 1) return true;
  if (e.key === 'Backspace' || e.key === 'Enter' || e.key === 'Tab' || e.key === ' ') return true;
  if (e.key === 'Process' || e.isComposing) {
    return e.code.startsWith('Key') || e.code.startsWith('Digit') || e.code === 'Space';
  }
  return false;
}
