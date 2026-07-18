'use client';

import { useRef, useState } from 'react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

/** 갤러리 작가/출처 — 앞에 © 고정 (IME 조합 중에는 값 고정 유지) */
export function GalleryCreditInput({ value, onChange, placeholder = '작가 / 출처', className }: Props) {
  const composing = useRef(false);
  const [draft, setDraft] = useState<string | null>(null);
  const display = (draft ?? value).replace(/^©+\s*/g, '');

  const commit = (raw: string) => {
    const bare = raw.replace(/^©+\s*/g, '');
    onChange(bare.trim() ? `© ${bare.replace(/^\s+/, '')}` : '');
  };

  return (
    <div className={`lh-gallery-credit${className ? ` ${className}` : ''}`}>
      <span className="lh-gallery-credit__mark" aria-hidden="true">
        ©
      </span>
      <input
        className="form-input lh-gallery-credit__input"
        placeholder={placeholder}
        value={display}
        onCompositionStart={() => {
          composing.current = true;
          setDraft(display);
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          const next = e.currentTarget.value;
          setDraft(null);
          commit(next);
        }}
        onChange={(e) => {
          // trim 하지 않음 — 입력 중 띄어쓰기 유지
          const bare = e.target.value.replace(/^©+\s*/g, '');
          if (composing.current) {
            setDraft(bare);
            return;
          }
          commit(bare);
        }}
      />
    </div>
  );
}
