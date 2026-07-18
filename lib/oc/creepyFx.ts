import type { CSSProperties } from 'react';
import type { CreepyFxConfig, CreepyFxKind } from '@/lib/types/character';

export const CREEPY_FX_KINDS: { id: CreepyFxKind; label: string; desc: string }[] = [
  { id: 'textGlitch', label: '텍스트 글리치', desc: '텍스트가 불규칙하게 찢기고 어긋남' },
  { id: 'screenStatic', label: '화면 노이즈', desc: '스캔라인·지직 노이즈가 흐름' },
  { id: 'flicker', label: '조명 깜빡임', desc: '형광등처럼 지직 꺼졌다 켜짐' },
  { id: 'jitter', label: '화면 떨림', desc: '화면이 미세하게 진동' },
  { id: 'chromatic', label: '색 어긋남', desc: 'RGB(적/청)가 분리돼 어긋남' },
  { id: 'creepVignette', label: '어둠 잠식', desc: '가장자리에서 붉은 어둠이 맥동' },
  { id: 'breathe', label: '암전 호흡', desc: '숨쉬듯 화면이 훅 어두워짐' },
  { id: 'smear', label: '텍스트 잔상', desc: '글자에 붉은 잔상이 번짐' },
  { id: 'warp', label: '일렁임', desc: '화면이 물결처럼 왜곡' },
  { id: 'glyphScramble', label: '기호 잠식', desc: '글자가 이상한 기호(人☍的◇事)로 잠깐 바뀜' },
];

export function creepyFxActive(fx?: CreepyFxConfig | null): boolean {
  return Boolean(fx?.enabled && (fx.kinds?.length ?? 0) > 0);
}

/** 상세 루트에 붙일 className 조각 (앞에 공백 포함) */
export function creepyFxClass(fx?: CreepyFxConfig | null): string {
  if (!creepyFxActive(fx)) return '';
  const kinds = fx!.kinds ?? [];
  return ` lh-creepy${kinds.map((k) => ` fx-${k}`).join('')}`;
}

/** 어둠 잠식 기본 색상 (짙은 적색) */
export const DEFAULT_VIGNETTE_COLOR = '#1a0005';

function hexToRgbTriple(hex?: string): [number, number, number] | null {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** --creepy-i (0~1) · 어둠 잠식 색상(--cv-r/g/b) 을 담은 style */
export function creepyFxStyle(fx?: CreepyFxConfig | null): CSSProperties | undefined {
  if (!creepyFxActive(fx)) return undefined;
  const raw = fx!.intensity;
  const pct = typeof raw === 'number' && Number.isFinite(raw) ? raw : 40;
  const clamped = Math.max(1, Math.min(100, pct));
  const style: Record<string, string> = {
    ['--creepy-i']: (clamped / 100).toFixed(3),
  };
  const rgb = hexToRgbTriple(fx!.vignetteColor) ?? hexToRgbTriple(DEFAULT_VIGNETTE_COLOR);
  if (rgb) {
    style['--cv-r'] = String(rgb[0]);
    style['--cv-g'] = String(rgb[1]);
    style['--cv-b'] = String(rgb[2]);
  }
  return style as CSSProperties;
}
