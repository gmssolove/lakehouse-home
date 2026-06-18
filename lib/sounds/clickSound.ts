import type { SiteUiSettings } from '@/lib/types/site-content';

let audioCtx: AudioContext | null = null;

function ac() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playThud() {
  const c = ac();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(110, now);
  osc.frequency.exponentialRampToValueAtTime(58, now + 0.07);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}

function playWood() {
  const c = ac();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  const o1 = c.createOscillator();
  const o2 = c.createOscillator();
  const gain = c.createGain();
  o1.type = 'triangle';
  o2.type = 'sine';
  o1.frequency.setValueAtTime(180, now);
  o1.frequency.exponentialRampToValueAtTime(95, now + 0.05);
  o2.frequency.setValueAtTime(320, now);
  o2.frequency.exponentialRampToValueAtTime(140, now + 0.04);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.14, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  o1.connect(gain);
  o2.connect(gain);
  gain.connect(c.destination);
  o1.start(now);
  o2.start(now);
  o1.stop(now + 0.1);
  o2.stop(now + 0.1);
}

function playFelt() {
  const c = ac();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  const len = Math.floor(c.sampleRate * 0.06);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.16, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  src.start(now);
  src.stop(now + 0.08);
}

function playDamp() {
  const c = ac();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(72, now);
  osc.frequency.linearRampToValueAtTime(48, now + 0.08);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}

function playMuted() {
  const c = ac();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(88, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.1, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.07);
}

const LEGACY: Record<string, SiteUiSettings['clickSoundPreset']> = {
  soft: 'thud',
  glass: 'felt',
  tap: 'damp',
};

export const CLICK_SOUND_PRESETS = [
  { id: 'thud' as const, label: 'Thud — 묵직한 저음' },
  { id: 'wood' as const, label: 'Wood — 나무 두드림' },
  { id: 'felt' as const, label: 'Felt — 펠트 눌림' },
  { id: 'damp' as const, label: 'Damp — 눅눅한 탭' },
  { id: 'muted' as const, label: 'Muted — 짧은 둔탁' },
  { id: 'custom' as const, label: 'Custom — 직접 업로드' },
];

export function playClickSound(
  settings: Pick<SiteUiSettings, 'clickSoundEnabled' | 'clickSoundPreset' | 'clickSoundCustom'>,
) {
  if (!settings.clickSoundEnabled) return;

  if (settings.clickSoundPreset === 'custom' && settings.clickSoundCustom) {
    try {
      const a = new Audio(settings.clickSoundCustom);
      a.volume = 0.5;
      void a.play();
    } catch {
      /* ignore */
    }
    return;
  }

  const raw = settings.clickSoundPreset;
  const preset = (LEGACY[raw as string] ?? raw) as SiteUiSettings['clickSoundPreset'];
  if (preset === 'custom') return;
  if (preset === 'wood') playWood();
  else if (preset === 'felt') playFelt();
  else if (preset === 'damp') playDamp();
  else if (preset === 'muted') playMuted();
  else playThud();
}
