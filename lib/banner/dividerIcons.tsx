export const BANNER_DIVIDER_PRESETS = [
  { id: 'diamond', label: 'Diamond' },
  { id: 'heart', label: 'Heart' },
  { id: 'star', label: 'Star' },
  { id: 'feather', label: 'Feather' },
  { id: 'moon', label: 'Moon' },
  { id: 'clover', label: 'Clover' },
] as const;

export type BannerDividerIconId = (typeof BANNER_DIVIDER_PRESETS)[number]['id'];

const stroke = 'currentColor';

export function BannerDividerIcon({ id }: { id: string }) {
  const props = {
    viewBox: '0 0 16 16',
    width: 14,
    height: 14,
    fill: 'none',
    stroke,
    strokeWidth: 1.15,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (id) {
    case 'heart':
      return (
        <svg {...props}>
          <path d="M8 13.5S3 10.2 3 6.6a2.6 2.6 0 0 1 5-1.3 2.6 2.6 0 0 1 5 1.3C13 10.2 8 13.5 8 13.5Z" />
        </svg>
      );
    case 'star':
      return (
        <svg {...props}>
          <path d="M8 2.5 9.6 6.2 13.6 6.6 10.5 9.2 11.5 13.2 8 11.2 4.5 13.2 5.5 9.2 2.4 6.6 6.4 6.2Z" />
        </svg>
      );
    case 'feather':
      return (
        <svg {...props}>
          <path d="M12.5 3.5S6.5 4.5 4 9c-.8 1.6-.5 3.2 1 3.8 1.5.6 3-.1 3.8-1.6 1.8-3.2 3.7-7.7 3.7-7.7Z" />
          <path d="M4.5 11.5 7 9" />
        </svg>
      );
    case 'moon':
      return (
        <svg {...props}>
          <path d="M11.2 3.2a5.2 5.2 0 1 0 1.6 9.8 4.2 4.2 0 0 1-1.6-9.8Z" />
        </svg>
      );
    case 'clover':
      return (
        <svg {...props}>
          <circle cx="8" cy="5.2" r="1.5" />
          <circle cx="5.4" cy="7.4" r="1.5" />
          <circle cx="10.6" cy="7.4" r="1.5" />
          <path d="M8 6.6v5" />
        </svg>
      );
    case 'diamond':
    default:
      return (
        <svg {...props}>
          <path d="M8 2.5 12.5 8 8 13.5 3.5 8Z" />
        </svg>
      );
  }
}
