import type { ReactNode, SVGProps } from 'react';

export function LakeEditIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" {...props}>
      <path
        d="M10.2 2.8 13.2 5.8 5.6 13.4H2.6v-3l7.6-7.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LakeDeleteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" {...props}>
      <path
        d="m2.5 2.5 7 7M9.5 2.5l-7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LakeSaveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" {...props}>
      <path
        d="M3.5 13.5h9V4.8L11.2 3H3.5v10.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path d="M6 3v3.5h4V3" fill="none" stroke="currentColor" strokeWidth="1.15" />
    </svg>
  );
}

export function LakeTrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" {...props}>
      <path
        d="M3.5 5.5h9M5.2 5.5V4.2a.8.8 0 0 1 .8-.8h4a.8.8 0 0 1 .8.8V5.5M6.2 8.2v3.2M9.8 8.2v3.2M4.8 5.5l.7 7.6a.9.9 0 0 0 .9.8h3.2a.9.9 0 0 0 .9-.8l.7-7.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LakeCancelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" {...props}>
      <path
        d="M4.5 8h7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LakeReplyArrowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" {...props}>
      <path
        d="M3.2 8.8 8.8 3.2M8.8 3.2H4.6M8.8 3.2v4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LakeReplyBackIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" {...props}>
      <path
        d="M11.5 4.5 6 10c0 0-2.2 1.4-3.5 2.2.8-1.4 1.6-3.4 1.6-3.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type IconBtnProps = {
  label: string;
  onClick?: () => void;
  variant?: 'default' | 'delete';
  className?: string;
  children: ReactNode;
};

export function LakeIconToolButton({ label, onClick, variant = 'default', className = '', children }: IconBtnProps) {
  return (
    <button
      type="button"
      className={`lake-icon-tool${variant === 'delete' ? ' lake-icon-tool--plain' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
