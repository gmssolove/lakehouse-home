import type { TrpgFontPreset } from '@/lib/types/site-content';

export const TRPG_FONT_OPTIONS: { id: TrpgFontPreset; label: string }[] = [
  { id: 'cormorant', label: 'Cormorant' },
  { id: 'marcellus', label: 'Marcellus' },
  { id: 'playfair', label: 'Playfair' },
  { id: 'im-fell', label: 'IM Fell' },
  { id: 'noto-serif', label: 'Noto Serif KR' },
  { id: 'default', label: '기본' },
];

export function trpgFontFamily(preset?: TrpgFontPreset): string | undefined {
  switch (preset) {
    case 'cormorant':
      return "var(--font-cormorant-upright, 'Cormorant Garamond'), serif";
    case 'marcellus':
      return "var(--font-marcellus, 'Marcellus'), serif";
    case 'playfair':
      return "var(--font-playfair, 'Playfair Display'), serif";
    case 'im-fell':
      return "var(--font-im-fell, 'IM Fell English'), serif";
    case 'noto-serif':
      return "var(--font-noto-serif-kr, 'Noto Serif KR'), serif";
    default:
      return undefined;
  }
}
