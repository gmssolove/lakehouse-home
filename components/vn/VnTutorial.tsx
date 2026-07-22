'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './vn-shell.module.css';

export type VnTutorialStep = {
  id: string;
  title: string;
  body: string;
  gifUrl?: string;
};

export const DEFAULT_VN_TUTORIAL_STEPS: VnTutorialStep[] = [
  {
    id: 'advance',
    title: '기본 진행',
    body: '화면을 클릭하거나 스페이스 / Enter로 대사를 넘길 수 있어요. 타이핑 중이면 한 번에 전체가 표시됩니다.',
  },
  {
    id: 'system',
    title: 'ESC · 시스템 메뉴',
    body: 'ESC(또는 우클릭)로 메뉴를 열면 효과음·BGM 음량, 저장·불러오기, 지난 대사를 확인할 수 있어요.',
  },
  {
    id: 'dialogue',
    title: '대사창 · AUTO',
    body: '대사창의 세이브 / 로드로도 저장·불러오기가 가능하고, AUTO로 자동 진행을 켤 수 있어요. (AUTO 모드 사용을 매우 권장합니다)',
  },
  {
    id: 'mission',
    title: '미션',
    body: '진행 중 미션이 지급되거나 완료될 수 있어요. 오른쪽 위 ✦ 버튼으로 미션 수첩을 열어 확인할 수 있습니다.',
  },
];

type Props = {
  onDone: () => void;
  steps?: VnTutorialStep[];
};

const LEGACY_DIALOGUE_BODY =
  '대사창의 세이브 / 로드로도 저장·불러오기가 가능하고, AUTO로 자동 진행을 켤 수 있어요.';

function resolveTutorialSteps(stepsProp?: VnTutorialStep[]): VnTutorialStep[] {
  const filtered = stepsProp?.filter((s) => s.title.trim() || s.body.trim()) ?? [];
  if (!filtered.length) return DEFAULT_VN_TUTORIAL_STEPS;

  const defaultsById = new Map(DEFAULT_VN_TUTORIAL_STEPS.map((s) => [s.id, s]));
  return filtered.map((s) => {
    const def = defaultsById.get(s.id);
    if (!def) return s;
    /* 저장된 예전 AUTO 기본 문구 → 권장 안내 포함 문구로 교체 */
    if (s.id === 'dialogue' && s.body.trim() === LEGACY_DIALOGUE_BODY) {
      return { ...s, body: def.body };
    }
    return s;
  });
}

/**
 * Shared VN tutorial — 단계 페이지. Skip / Start 만 영문.
 */
export function VnTutorial({ onDone, steps: stepsProp }: Props) {
  const steps = resolveTutorialSteps(stepsProp);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const [dir, setDir] = useState<1 | -1>(1);
  const [contentKey, setContentKey] = useState(0);
  const last = index >= steps.length - 1;
  const step = steps[index] ?? steps[0];

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= steps.length || next === index) return;
      setDir(next > index ? 1 : -1);
      setPhase('out');
      window.setTimeout(() => {
        setIndex(next);
        setContentKey((k) => k + 1);
        setPhase('in');
      }, 200);
    },
    [index, steps.length],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        if (last) onDone();
        else go(index + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (!last) onDone();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index, last, onDone]);

  const contentAnim =
    phase === 'out'
      ? dir > 0
        ? styles.tutorialContentOutNext
        : styles.tutorialContentOutPrev
      : dir > 0
        ? styles.tutorialContentInNext
        : styles.tutorialContentInPrev;

  return (
    <div className={styles.tutorial} role="dialog" aria-label="조작 안내" aria-modal="true">
      <div className={styles.tutorialPanel}>
        <header className={styles.tutorialHead}>
          <p className={styles.tutorialLatin}>TUTORIAL</p>
          <p className={styles.tutorialPage}>
            {index + 1} / {steps.length}
          </p>
        </header>

        <div key={contentKey} className={`${styles.tutorialContent} ${contentAnim}`}>
          <h2 className={styles.tutorialTitle}>{step.title}</h2>
          <p className={styles.tutorialBody}>{step.body}</p>
          <div className={styles.tutorialGifWrap}>
            {step.gifUrl ? (
              <img className={styles.tutorialGif} src={step.gifUrl} alt="" />
            ) : null}
          </div>
        </div>

        <div className={styles.tutorialNav}>
          <button
            type="button"
            className={styles.tutorialArrow}
            disabled={index === 0}
            onClick={() => go(index - 1)}
            aria-label="이전"
          >
            ‹
          </button>
          <div className={styles.tutorialDots} aria-hidden>
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={`${styles.tutorialDot}${i === index ? ` ${styles.tutorialDotOn}` : ''}`}
              />
            ))}
          </div>
          <button
            type="button"
            className={styles.tutorialArrow}
            disabled={last}
            onClick={() => go(index + 1)}
            aria-label="다음"
          >
            ›
          </button>
        </div>

        <div className={styles.tutorialActions}>
          {!last ? (
            <button type="button" className={styles.tutorialSkip} onClick={onDone}>
              Skip
            </button>
          ) : null}
          <button
            type="button"
            className={styles.tutorialStart}
            onClick={() => {
              if (last) onDone();
              else go(index + 1);
            }}
          >
            {last ? 'Start' : '다음'}
          </button>
        </div>
      </div>
    </div>
  );
}
