'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './vn-engine.module.css';

export type CharacterSpriteProps = {
  character: string;
  expression: string;
  position: 'left' | 'center' | 'right';
  src: string;
  /** enter | expression | exit — idle일 때는 애니 없음 */
  phase: 'enter' | 'expression' | 'idle' | 'exit';
  onExitDone?: () => void;
};

/**
 * 단일 캐릭터 슬롯.
 * - enter: 슬라이드 + 페이드인
 * - expression: 이미지만 크로스페이드 (~0.25s)
 * - exit: 페이드아웃 후 onExitDone
 */
export function CharacterSprite({
  character,
  expression,
  position,
  src,
  phase,
  onExitDone,
}: CharacterSpriteProps) {
  const [shownSrc, setShownSrc] = useState(src);
  const [fadeSrc, setFadeSrc] = useState<string | null>(null);
  const [livePhase, setLivePhase] = useState(phase);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exprTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onExitRef = useRef(onExitDone);
  onExitRef.current = onExitDone;

  useLayoutEffect(() => {
    setLivePhase(phase);
  }, [phase]);

  useEffect(() => {
    if (phase === 'expression' && src !== shownSrc) {
      setFadeSrc(shownSrc);
      setShownSrc(src);
      if (exprTimer.current) clearTimeout(exprTimer.current);
      exprTimer.current = setTimeout(() => setFadeSrc(null), 280);
      return () => {
        if (exprTimer.current) clearTimeout(exprTimer.current);
      };
    }
    if (phase !== 'expression' && src !== shownSrc) {
      setShownSrc(src);
      setFadeSrc(null);
    }
  }, [phase, src, shownSrc]);

  useEffect(() => {
    if (phase !== 'exit') return;
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => onExitRef.current?.(), 320);
    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, [phase]);

  const posClass = styles[`pos_${position}`] ?? '';
  const phaseClass =
    livePhase === 'enter'
      ? styles.spriteEnter
      : livePhase === 'exit'
        ? styles.spriteExit
        : '';

  return (
    <div
      className={`${styles.spriteSlot} ${posClass} ${phaseClass}`}
      data-character={character}
      data-expression={expression}
    >
      {fadeSrc && (
        <img className={`${styles.sprite} ${styles.spriteFadeOut}`} src={fadeSrc} alt="" draggable={false} />
      )}
      <img
        className={`${styles.sprite}${fadeSrc ? ` ${styles.spriteFadeIn}` : ''}`}
        src={shownSrc}
        alt=""
        draggable={false}
      />
    </div>
  );
}

type SlotState = {
  key: string;
  character: string;
  expression: string;
  position: 'left' | 'center' | 'right';
  src: string;
  phase: 'enter' | 'expression' | 'idle' | 'exit';
};

type SpriteLayerProps = {
  sprites: { character: string; expression: string; position: 'left' | 'center' | 'right' }[];
  resolveUrl: (character: string, expression: string) => string | undefined;
};

function slotKey(s: { character: string; position: string }) {
  return `${s.character}@${s.position}`;
}

/** 등장·표정·퇴장 전환을 관리하는 스프라이트 레이어 */
export function SpriteLayer({ sprites, resolveUrl }: SpriteLayerProps) {
  const [slots, setSlots] = useState<SlotState[]>([]);
  const prevJson = useRef('');

  useEffect(() => {
    const json = JSON.stringify(sprites);
    if (json === prevJson.current) return;
    prevJson.current = json;

    setSlots((prev) => {
      const nextKeys = new Set(sprites.map(slotKey));
      const prevMap = new Map(prev.map((s) => [s.key, s]));
      const out: SlotState[] = [];

      for (const sp of sprites) {
        const key = slotKey(sp);
        const src = resolveUrl(sp.character, sp.expression);
        if (!src) continue;
        const old = prevMap.get(key);
        if (!old || old.phase === 'exit') {
          out.push({
            key,
            character: sp.character,
            expression: sp.expression,
            position: sp.position,
            src,
            phase: 'enter',
          });
        } else if (old.expression !== sp.expression || old.src !== src) {
          out.push({
            key,
            character: sp.character,
            expression: sp.expression,
            position: sp.position,
            src,
            phase: 'expression',
          });
        } else {
          out.push({ ...old, phase: 'idle' });
        }
      }

      for (const old of prev) {
        if (!nextKeys.has(old.key) && old.phase !== 'exit') {
          out.push({ ...old, phase: 'exit' });
        } else if (!nextKeys.has(old.key) && old.phase === 'exit') {
          out.push(old);
        }
      }

      return out;
    });
  }, [sprites, resolveUrl]);

  useEffect(() => {
    const needsSettle = slots.some((s) => s.phase === 'enter' || s.phase === 'expression');
    if (!needsSettle) return;
    const t = window.setTimeout(() => {
      setSlots((prev) =>
        prev.map((s) =>
          s.phase === 'enter' || s.phase === 'expression' ? { ...s, phase: 'idle' as const } : s,
        ),
      );
    }, 360);
    return () => clearTimeout(t);
  }, [slots]);

  return (
    <div className={styles.sprites} aria-hidden>
      {slots.map((s) => (
        <CharacterSprite
          key={s.key}
          character={s.character}
          expression={s.expression}
          position={s.position}
          src={s.src}
          phase={s.phase}
          onExitDone={() => setSlots((prev) => prev.filter((x) => x.key !== s.key))}
        />
      ))}
    </div>
  );
}
