'use client';

import { Fragment, type ReactNode } from 'react';

export const PROFILE_TEXT_LIMIT = 200;

export const PROFILE_SECTION_META: Record<string, { en: string; ko: string }> = {
  appearance: { en: 'APPEARANCE', ko: '외관' },
  personality: { en: 'PERSONALITY', ko: '성격' },
  traits: { en: 'TRAITS', ko: '특징' },
  bio: { en: 'BACKGROUND', ko: '배경' },
};

function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) {
      return <strong key={i}>{bold[1]}</strong>;
    }
    const lines = part.split('\n');
    return (
      <Fragment key={i}>
        {lines.map((line, j) => (
          <Fragment key={`${i}-${j}`}>
            {line}
            {j < lines.length - 1 ? <br /> : null}
          </Fragment>
        ))}
      </Fragment>
    );
  });
}

export function ProfileTextBlock({
  section,
  text,
}: {
  section: keyof typeof PROFILE_SECTION_META;
  text?: string;
}) {
  if (!text?.trim()) return null;
  const meta = PROFILE_SECTION_META[section];
  const paragraphs = splitParagraphs(text);

  return (
    <div className="psection trpg-inv-profile-section">
      <div className="trpg-inv-profile-section__head">
        <span className="trpg-inv-profile-section__en">{meta.en}</span>
        <div className="trpg-inv-profile-section__ko">{meta.ko}</div>
        <span className="trpg-inv-profile-section__rule" aria-hidden="true" />
      </div>
      <div className="trpg-inv-profile-section__body">
        {paragraphs.map((para, i) => (
          <p key={i} className="bg-text">
            {renderInline(para)}
          </p>
        ))}
      </div>
    </div>
  );
}

export function ProfileTextEdit({
  section,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  section: keyof typeof PROFILE_SECTION_META;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const meta = PROFILE_SECTION_META[section];
  const len = value.length;
  const over = len > PROFILE_TEXT_LIMIT;

  return (
    <section className="trpg-inv-section trpg-inv-profile-edit">
      <div className="trpg-inv-profile-section__head">
        <span className="trpg-inv-profile-section__en">{meta.en}</span>
        <div className="trpg-inv-profile-section__ko">{meta.ko}</div>
        <span className="trpg-inv-profile-section__rule" aria-hidden="true" />
      </div>
      <textarea
        className="trpg-inv-edit-field trpg-inv-profile-edit__field"
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="trpg-inv-profile-edit__meta">
        <span className={`lh-char-count${over ? ' is-over' : ''}`}>
          {len} / {PROFILE_TEXT_LIMIT}
        </span>
        {over ? (
          <span className="trpg-inv-profile-edit__warn">200자를 넘었습니다. 문단을 줄여 주세요.</span>
        ) : null}
      </div>
      <p className="trpg-inv-edit-hint">
        빈 줄로 문단 구분 · 핵심 명사는 **이렇게** 감싸면 굵게 표시됩니다.
      </p>
    </section>
  );
}
