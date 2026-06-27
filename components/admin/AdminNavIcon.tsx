import type { AdminNavIcon as IconName } from '@/lib/types/site-content';

const stroke = 'currentColor';

export function AdminNavIcon({ name }: { name: IconName }) {
  const props = {
    viewBox: '0 0 16 16',
    width: 15,
    height: 15,
    fill: 'none',
    stroke,
    strokeWidth: 1.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'diary':
      return (
        <svg {...props}>
          <path d="M4 2.5h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" />
          <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
        </svg>
      );
    case 'scrap':
      return (
        <svg {...props}>
          <path d="M3.5 4.5 6 2l2.5 2.5M6 2v9" />
          <path d="M9.5 6.5h3.5v7.5H3.5V9" />
        </svg>
      );
    case 'music':
      return (
        <svg {...props}>
          <path d="M6 11.5V4.5l5.5-1.5v7" />
          <circle cx="4.5" cy="11.5" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
        </svg>
      );
    case 'review':
      return (
        <svg {...props}>
          <path d="M3 3.5h10v9H3z" />
          <path d="M5.5 6.5h5M5.5 9h3.5" />
          <path d="M10.5 11.5 12.5 13.5" />
        </svg>
      );
    case 'timeline':
      return (
        <svg {...props}>
          <path d="M3 4h10M3 8h7M3 12h5" />
          <circle cx="12.5" cy="8" r="1.2" fill={stroke} stroke="none" />
        </svg>
      );
    case 'trpg':
      return (
        <svg {...props}>
          <rect x="2.5" y="4.5" width="11" height="7" rx="1.2" />
          <circle cx="5.5" cy="8" r="1" />
          <circle cx="8" cy="8" r="1" />
          <circle cx="10.5" cy="8" r="1" />
        </svg>
      );
    case 'universe':
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M2.5 8h11M8 2.5a7 7 0 0 1 0 11M8 2.5a7 7 0 0 0 0 11" />
        </svg>
      );
    case 'archive':
      return (
        <svg {...props}>
          <circle cx="8" cy="5.5" r="2.2" />
          <path d="M3.5 13.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" />
        </svg>
      );
    case 'gallery':
      return (
        <svg {...props}>
          <rect x="2.5" y="3.5" width="11" height="9" rx="1" />
          <path d="m5 10 2.5-2.5 2 2 2.5-3 2 2.5" />
        </svg>
      );
    case 'oc':
      return (
        <svg {...props}>
          <circle cx="8" cy="5.5" r="2.2" />
          <path d="M4 13c0-2.2 1.8-4 4-4s4 1.8 4 4" />
        </svg>
      );
    case 'pair':
      return (
        <svg {...props}>
          <circle cx="5.5" cy="6" r="2" />
          <circle cx="10.5" cy="6" r="2" />
          <path d="M3.5 13c.3-2 1.6-3.2 2-3.2M12.5 13c-.3-2-1.6-3.2-2-3.2" />
        </svg>
      );
    case 'main':
      return (
        <svg {...props}>
          <path d="M3 7.5 8 3.5l5 4" />
          <path d="M4.5 7v5.5h7V7" />
        </svg>
      );
    case 'banner':
      return (
        <svg {...props}>
          <rect x="2.5" y="4" width="11" height="8" rx="1" />
          <path d="M2.5 6.5h11" />
        </svg>
      );
    case 'bgm':
      return (
        <svg {...props}>
          <path d="M3.5 8.5v-3h2.5l4-1.2v6.2" />
          <path d="M3.5 8.5a2 2 0 1 0 0 .1" />
          <path d="M10 7.5a2 2 0 1 0 0 .1" />
        </svg>
      );
    case 'ux':
      return (
        <svg {...props}>
          <path d="M8 2.5v2M4.5 4l1.4 1.4M11.5 4 10 5.5M3 8.5h2M11 8.5h2M4.5 13l1.4-1.4M11.5 13 10 11.5" />
          <circle cx="8" cy="8.5" r="2.2" />
        </svg>
      );
    case 'notice':
      return (
        <svg {...props}>
          <path d="M3.5 7h2l2.5-2v8l-2.5-2h-2z" />
          <path d="M11 6.5v5" />
        </svg>
      );
    case 'guest':
      return (
        <svg {...props}>
          <path d="M3.5 4.5h9v7h-9z" />
          <path d="M5.5 7h5M5.5 9.5h3.5" />
        </svg>
      );
    case 'access':
      return (
        <svg {...props}>
          <rect x="4" y="7" width="8" height="6.5" rx="1" />
          <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="4.5" />
        </svg>
      );
  }
}
