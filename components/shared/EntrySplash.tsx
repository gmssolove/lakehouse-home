'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ENTRY_SPLASH_FADE_MS,
  ENTRY_SPLASH_MIN_MS,
  createEntrySplashItem,
  entrySplashLabelText,
  normalizeEntrySplash,
  pickEntrySplashTipItem,
} from '@/lib/shared/entrySplash';
import { useBalancedDialogueText } from '@/lib/hooks/useBalancedDialogueText';
import type { EntrySplashConfig, EntrySplashLabel, EntrySplashTipItem } from '@/lib/types/character';

type Props = {
  config?: EntrySplashConfig | null;
  imageSrc?: string;
  eyebrow?: string;
  title?: string;
  tipStorageKey?: string;
  onDone: () => void;
};

export function EntrySplash({
  config,
  imageSrc = '',
  eyebrow = '',
  title = '',
  tipStorageKey,
  onDone,
}: Props) {
  const splash = useMemo(() => normalizeEntrySplash(config), [config]);
  const tipItem = useMemo(
    () => pickEntrySplashTipItem(splash.items, tipStorageKey),
    // once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const hasPhoto = Boolean(imageSrc.trim());
  const [imgReady, setImgReady] = useState(!hasPhoto);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!hasPhoto) {
      setImgReady(true);
      return;
    }
    let done = false;
    const img = new Image();
    const mark = () => {
      if (done) return;
      done = true;
      setImgReady(true);
    };
    img.onload = mark;
    img.onerror = mark;
    img.src = imageSrc;
    return () => {
      done = true;
    };
  }, [hasPhoto, imageSrc]);

  useEffect(() => {
    const t0 = performance.now();
    let fadeT = 0;
    let poll = 0;

    const tryFinish = () => {
      const elapsed = performance.now() - t0;
      if (!imgReady || elapsed < ENTRY_SPLASH_MIN_MS) return;
      window.clearInterval(poll);
      setExiting(true);
      fadeT = window.setTimeout(() => onDone(), ENTRY_SPLASH_FADE_MS);
    };

    poll = window.setInterval(tryFinish, 80);
    tryFinish();
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(fadeT);
    };
  }, [imgReady, onDone]);

  const labelText = tipItem ? entrySplashLabelText(tipItem.kind) : '';
  const { ref: tipTextRef, text: balancedTipText } = useBalancedDialogueText(
    tipItem?.text?.trim() || '',
    Boolean(tipItem?.text?.trim()),
    {
      boxSelector: '.lh-entry-splash__tip',
      subtractSelector: '.lh-entry-splash__tip-lbl',
    },
  );

  return (
    <div
      className={`lh-entry-splash lh-entry-splash--${splash.layout}${hasPhoto ? '' : ' lh-entry-splash--no-photo'}${
        exiting ? ' is-exiting' : ''
      }`}
      role="status"
      aria-live="polite"
      aria-label="로딩"
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {hasPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="lh-entry-splash__bg"
          src={imageSrc}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="lh-entry-splash__bg lh-entry-splash__bg--fallback" aria-hidden />
      )}
      <div className="lh-entry-splash__scrim" aria-hidden />
      <div className="lh-entry-splash__atmosphere" aria-hidden>
        <span className="lh-entry-splash__fog lh-entry-splash__fog--a" />
        <span className="lh-entry-splash__fog lh-entry-splash__fog--b" />
        <span className="lh-entry-splash__glow" />
        <span className="lh-entry-splash__dust" />
      </div>

      {splash.layout === 'fullbleed' ? (
        <div className="lh-entry-splash__center">
          {eyebrow.trim() ? (
            <p className="lh-entry-splash__eyebrow">{eyebrow.trim()}</p>
          ) : null}
          {title.trim() ? <h1 className="lh-entry-splash__title">{title.trim()}</h1> : null}
        </div>
      ) : null}

      {splash.layout === 'corner' ? (
        <div className="lh-entry-splash__corner">
          {tipItem ? (
            <div className="lh-entry-splash__tip lh-entry-splash__tip--corner">
              <p className="lh-entry-splash__tip-line">
                <span className="lh-entry-splash__tip-lbl">{labelText}</span>
                <span ref={tipTextRef} className="lh-entry-splash__tip-text">
                  {balancedTipText}
                </span>
              </p>
            </div>
          ) : null}
          <div className="lh-entry-splash__spinner" aria-hidden>
            <span className="lh-entry-splash__ring" />
          </div>
        </div>
      ) : (
        <>
          {tipItem ? (
            <div className="lh-entry-splash__tip">
              <span className="lh-entry-splash__tip-rule" aria-hidden />
              <p className="lh-entry-splash__tip-line">
                <span className="lh-entry-splash__tip-lbl">{labelText}</span>
                <span ref={tipTextRef} className="lh-entry-splash__tip-text">
                  {balancedTipText}
                </span>
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** 레거시 tips/label 제거한 깨끗한 config */
function commitSplash(
  splash: ReturnType<typeof normalizeEntrySplash>,
  patch: Partial<Pick<EntrySplashConfig, 'enabled' | 'layout' | 'items'>>,
): EntrySplashConfig {
  return {
    enabled: patch.enabled ?? splash.enabled,
    layout: patch.layout ?? splash.layout,
    items: patch.items ?? splash.items,
  };
}

/** 수정 폼용 — 로딩 화면 설정 (항목별 TIP/TMI) */
export function EntrySplashFormFields({
  value,
  onChange,
}: {
  value?: EntrySplashConfig | null;
  onChange: (next: EntrySplashConfig) => void;
}) {
  const splash = normalizeEntrySplash(value);
  const [draftKind, setDraftKind] = useState<EntrySplashLabel>('tmi');
  const [draftText, setDraftText] = useState('');

  const setItems = (items: EntrySplashTipItem[]) => {
    onChange(commitSplash(splash, { items }));
  };

  const patchItem = (id: string, patch: Partial<Pick<EntrySplashTipItem, 'kind' | 'text'>>) => {
    setItems(
      splash.items.map((it) =>
        it.id === id
          ? {
              ...it,
              ...patch,
              text: patch.text !== undefined ? patch.text : it.text,
            }
          : it,
      ),
    );
  };

  const addItem = () => {
    const text = draftText.replace(/^\s+|\s+$/g, '');
    if (!text) return;
    setItems([...splash.items, createEntrySplashItem(draftKind, text)]);
    setDraftText('');
  };

  return (
    <div className="lh-entry-splash-form">
      <label className="lh-entry-splash-form__enable">
        <input
          type="checkbox"
          checked={splash.enabled}
          onChange={(e) => onChange(commitSplash(splash, { enabled: e.target.checked }))}
        />
        <span>상세 진입 시 로딩 화면 표시</span>
      </label>
      <fieldset className="lh-entry-splash-form__layout" disabled={!splash.enabled}>
        <legend>로딩 화면 스타일</legend>
        <label>
          <input
            type="radio"
            name="entry-splash-layout"
            checked={splash.layout === 'fullbleed'}
            onChange={() => onChange(commitSplash(splash, { layout: 'fullbleed' }))}
          />
          풀블리드
        </label>
        <label>
          <input
            type="radio"
            name="entry-splash-layout"
            checked={splash.layout === 'corner'}
            onChange={() => onChange(commitSplash(splash, { layout: 'corner' }))}
          />
          코너 스피너 + 중앙 Tip/TMI
        </label>
      </fieldset>

      <div className="lh-tip-item-editor" style={{ opacity: splash.enabled ? 1 : 0.45 }}>
        <span className="form-label" style={{ display: 'block', marginBottom: 8 }}>
          Tip / TMI 항목
        </span>
        <div className="lh-tip-item-editor__add">
          <select
            className="form-input"
            style={{ width: 88 }}
            disabled={!splash.enabled}
            value={draftKind}
            onChange={(e) => setDraftKind(e.target.value === 'tip' ? 'tip' : 'tmi')}
          >
            <option value="tmi">TMI</option>
            <option value="tip">TIP</option>
          </select>
          <input
            className="form-input"
            style={{ flex: 1 }}
            disabled={!splash.enabled}
            placeholder="문구 입력 후 추가"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addItem();
              }
            }}
          />
          <button
            type="button"
            className="btn-save"
            style={{ padding: '6px 12px' }}
            disabled={!splash.enabled || !draftText.trim()}
            onClick={addItem}
          >
            추가
          </button>
        </div>
        <ul className="lh-tip-item-editor__list">
          {splash.items.map((it) => (
            <li key={it.id} className="lh-tip-item-editor__row">
              <select
                className="form-input lh-tip-item-editor__kind-select"
                disabled={!splash.enabled}
                value={it.kind}
                aria-label="종류"
                onChange={(e) =>
                  patchItem(it.id, { kind: e.target.value === 'tip' ? 'tip' : 'tmi' })
                }
              >
                <option value="tmi">TMI</option>
                <option value="tip">TIP</option>
              </select>
              <input
                className="form-input lh-tip-item-editor__text-input"
                disabled={!splash.enabled}
                value={it.text}
                onChange={(e) => patchItem(it.id, { text: e.target.value })}
                aria-label="문구"
              />
              <button
                type="button"
                className="btn-del"
                style={{ padding: '2px 8px' }}
                disabled={!splash.enabled}
                onClick={() => setItems(splash.items.filter((x) => x.id !== it.id))}
              >
                ✕
              </button>
            </li>
          ))}
          {!splash.items.length ? (
            <li className="lh-tip-item-editor__empty">아직 항목이 없습니다</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
