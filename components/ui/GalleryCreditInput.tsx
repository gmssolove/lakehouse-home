'use client';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

/** 갤러리 작가/출처 — 앞에 © 고정 */
export function GalleryCreditInput({ value, onChange, placeholder = '작가 / 출처', className }: Props) {
  const display = value.replace(/^©+\s*/g, '');

  return (
    <div className={`lh-gallery-credit${className ? ` ${className}` : ''}`}>
      <span className="lh-gallery-credit__mark" aria-hidden="true">
        ©
      </span>
      <input
        className="form-input lh-gallery-credit__input"
        placeholder={placeholder}
        value={display}
        onChange={(e) => {
          const raw = e.target.value.trim();
          onChange(raw ? `© ${raw}` : '');
        }}
      />
    </div>
  );
}
