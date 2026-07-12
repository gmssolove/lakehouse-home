'use client';

import type { ChangeEvent, InputHTMLAttributes } from 'react';

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        d="M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Zm5.6-1.1L20 20"
      />
    </svg>
  );
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  value: string;
  onChange: (value: string) => void;
  /** line: 밑줄형(방명록) / box: 박스형(스크랩 등) / oc: OC 사이드바 */
  variant?: 'line' | 'box' | 'oc';
  wrapClassName?: string;
};

export function LakeSearchField({
  value,
  onChange,
  placeholder = '검색',
  variant = 'box',
  wrapClassName,
  className,
  ...rest
}: Props) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  }

  return (
    <label className={`lh-search lh-search--${variant}${wrapClassName ? ` ${wrapClassName}` : ''}`}>
      <span className="lh-search__icon" aria-hidden>
        <SearchIcon />
      </span>
      <input
        className={`lh-search__input${className ? ` ${className}` : ''}`}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        {...rest}
      />
    </label>
  );
}
