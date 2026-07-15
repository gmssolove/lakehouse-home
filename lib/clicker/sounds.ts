/** WebAudio clicker sound presets (no external assets). */

export const CLICKER_SOUND_PRESETS = [
  { id: 'bell', label: '방울' },
  { id: 'harp', label: '하프' },
  { id: 'pluck', label: '플럭' },
  { id: 'wood', label: '나무' },
  { id: 'glass', label: '유리' },
  { id: 'pop', label: '팝' },
  { id: 'type', label: '타자' },
  { id: 'keycap', label: '키캡' },
  { id: 'linear', label: '리니어 스위치' },
  { id: 'tactile', label: '탁탁 스위치' },
  { id: 'chime', label: '차임' },
  { id: 'soft', label: '소프트 톤' },
  { id: 'mute', label: '무음' },
] as const;

export type ClickerSoundPresetId = (typeof CLICKER_SOUND_PRESETS)[number]['id'];

const BASE_FREQ = [392, 440, 494, 523, 587, 659, 698, 784];

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function getCtx(ref: { current: AudioContext | null }): AudioContext | null {
  try {
    const W = window as AudioWindow;
    const Ctor = window.AudioContext || W.webkitAudioContext;
    if (!Ctor) return null;
    if (!ref.current) ref.current = new Ctor();
    if (ref.current.state === 'suspended') void ref.current.resume();
    return ref.current;
  } catch {
    return null;
  }
}

function envGain(ctx: AudioContext, peak: number, attack: number, release: number) {
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  return g;
}

function tone(
  ctx: AudioContext,
  freq: number,
  type: OscillatorType,
  peak: number,
  attack: number,
  release: number,
  detune = 0,
) {
  const o = ctx.createOscillator();
  const g = envGain(ctx, peak, attack, release);
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + attack + release + 0.02);
}

function noiseBurst(ctx: AudioContext, peak: number, duration: number, filterFreq: number, q = 0.8) {
  const len = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;
  filter.Q.value = q;
  const g = envGain(ctx, peak, 0.002, duration * 0.9);
  src.connect(filter);
  filter.connect(g);
  g.connect(ctx.destination);
  src.start();
}

function freqForIndex(index: number) {
  return BASE_FREQ[Math.abs(index) % BASE_FREQ.length];
}

/** 기계식/키캡계 클릭 — 짧은 노이즈 + 저역 퍽 */
function keycapClick(ctx: AudioContext, index: number, v: number, bright: number) {
  const hitch = 1600 + (index % 5) * 220 + bright;
  noiseBurst(ctx, v * 0.62, 0.022, hitch, 1.1);
  noiseBurst(ctx, v * 0.28, 0.04, 420 + (index % 4) * 40, 0.6);
  tone(ctx, 90 + (index % 3) * 12, 'sine', v * 0.08, 0.001, 0.045);
}

export function playClickerPreset(
  ctxRef: { current: AudioContext | null },
  preset: ClickerSoundPresetId,
  index: number,
  volume: number,
) {
  if (preset === 'mute') return;
  const ctx = getCtx(ctxRef);
  if (!ctx) return;
  const v = Math.min(1, Math.max(0, volume)) * 0.32;
  const f = freqForIndex(index);
  const i = Math.abs(index);

  switch (preset) {
    case 'bell':
      tone(ctx, f, 'sine', v * 0.7, 0.01, 0.55);
      tone(ctx, f * 2.01, 'sine', v * 0.22, 0.01, 0.4);
      tone(ctx, f * 3.01, 'sine', v * 0.1, 0.01, 0.28);
      break;
    case 'harp':
      tone(ctx, f, 'triangle', v * 0.55, 0.008, 0.48);
      tone(ctx, f * 2, 'sine', v * 0.18, 0.01, 0.35, 6);
      break;
    case 'pluck':
      tone(ctx, f, 'sawtooth', v * 0.28, 0.004, 0.22);
      noiseBurst(ctx, v * 0.08, 0.04, f * 1.2);
      break;
    case 'wood':
      noiseBurst(ctx, v * 0.55, 0.035, 900 + i * 40);
      tone(ctx, f * 0.5, 'sine', v * 0.12, 0.002, 0.08);
      break;
    case 'glass':
      tone(ctx, f * 1.5, 'sine', v * 0.45, 0.006, 0.5);
      tone(ctx, f * 2.7, 'sine', v * 0.15, 0.008, 0.35);
      break;
    case 'pop':
      tone(ctx, f * 0.7, 'sine', v * 0.5, 0.002, 0.09);
      noiseBurst(ctx, v * 0.22, 0.03, 1400);
      break;
    case 'type':
      noiseBurst(ctx, v * 0.4, 0.028, 2200 + i * 180);
      tone(ctx, 180 + i * 40, 'square', v * 0.06, 0.001, 0.04);
      break;
    case 'keycap':
      keycapClick(ctx, i, v, 380);
      break;
    case 'linear':
      noiseBurst(ctx, v * 0.35, 0.018, 2800 + i * 90, 0.9);
      tone(ctx, 140 + i * 18, 'sine', v * 0.1, 0.001, 0.05);
      break;
    case 'tactile':
      keycapClick(ctx, i, v * 1.05, 620);
      tone(ctx, 210 + i * 22, 'triangle', v * 0.07, 0.001, 0.03);
      break;
    case 'chime':
      tone(ctx, f, 'sine', v * 0.4, 0.01, 0.7);
      tone(ctx, f * 1.498, 'sine', v * 0.22, 0.012, 0.6);
      tone(ctx, f * 2.0, 'sine', v * 0.12, 0.014, 0.45);
      break;
    case 'soft':
    default:
      tone(ctx, f, 'sine', v * 0.55, 0.015, 0.28);
      break;
  }
}

/** 프리로드용 템플릿 — 재생은 매번 clone 해서 겹쳐 들리게 */
const audioTemplates = new Map<string, HTMLAudioElement>();

export function playClickerUrl(url: string, volume: number) {
  const src = url.trim();
  if (!src) return;
  try {
    let template = audioTemplates.get(src);
    if (!template) {
      template = new Audio(src);
      template.preload = 'auto';
      audioTemplates.set(src, template);
    }
    const a = template.cloneNode(true) as HTMLAudioElement;
    a.volume = Math.min(1, Math.max(0, volume));
    a.addEventListener(
      'ended',
      () => {
        a.removeAttribute('src');
        a.load();
      },
      { once: true },
    );
    void a.play();
  } catch {
    /* ignore */
  }
}

export function normalizeClickerBindKey(raw: string) {
  const t = raw.trim().toLowerCase();
  if (!t) return '';
  if (t === 'space' || t === ' ') return ' ';
  if (t.length === 1) return t;
  return t.slice(0, 1);
}
