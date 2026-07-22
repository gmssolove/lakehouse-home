'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  classifyDiceResultTone,
  type VnDiceRoll,
} from '@/lib/vn/parseCcfoliaLog';
import { getSfxVolume } from '@/lib/vn/vnAudioVolume';
import { playSafe } from '@/lib/vn/safeAudio';
import styles from './vn-dice-layer.module.css';

type Props = {
  dice: VnDiceRoll;
  lineKey: string;
  /** 주사위가 구르기 시작할 때 */
  rollSfxUrl?: string;
  /** 이 판정만 결과 효과음 (최우선) — 성공/실패 문구 등장 시 */
  resultSfxUrl?: string;
  /** 판정 종류별 결과 효과음 URL */
  resultSfxByTone?: Partial<
    Record<'extreme' | 'great' | 'ok' | 'fail' | 'fumble', string>
  >;
  /** 종류별 미지정·기타 판정 폴백 */
  resultSfxFallbackUrl?: string;
};

type Tone = ReturnType<typeof classifyDiceResultTone>;

type Phase = 'boot' | 'roll' | 'land' | 'result';

const LAND_MS = 1700;
const RESULT_MS = 1950;

function toneEyebrow(tone: Tone): string {
  switch (tone) {
    case 'extreme':
      return 'EXTREME';
    case 'great':
      return 'GREAT SUCCESS';
    case 'ok':
      return 'SUCCESS';
    case 'fail':
      return 'FAILURE';
    case 'fumble':
      return 'FUMBLE';
    default:
      return 'ROLL';
  }
}

/** CoC 1d100 → 십·일 (100 → 00) */
function splitRoll(roll: number): [number, number] {
  const n = ((Math.round(roll) % 100) + 100) % 100;
  return [Math.floor(n / 10), n % 10];
}

function fillerFaces(shown: number): number[] {
  const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== shown);
  const out: number[] = [];
  for (let i = 0; i < 5; i++) out.push(pool[(shown * 3 + i * 2) % pool.length]!);
  return out;
}

function playUrl(url: string | undefined, hold?: { current: HTMLAudioElement | null }) {
  const src = url?.trim();
  if (!src) return;
  try {
    const el = new Audio(src);
    el.volume = getSfxVolume();
    if (hold) hold.current = el;
    playSafe(el, 'sfx', src);
  } catch {
    /* ignore */
  }
}

function DiceCube({
  digit,
  variant,
  settled,
}: {
  digit: number;
  variant: 'a' | 'b';
  settled: boolean;
}) {
  const fillers = useMemo(() => fillerFaces(digit), [digit]);
  const faces = [digit, fillers[0], fillers[1], fillers[2], fillers[3], fillers[4]];

  return (
    <div className={`${styles.persp} ${styles[`persp_${variant}`]}`}>
      <div
        className={`${styles.cube} ${settled ? styles.cubeLanded : styles[`spin_${variant}`]}`}
      >
        {faces.map((n, i) => (
          <div key={i} className={`${styles.face} ${styles[`face_${i}`]}`}>
            {n}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 3D 주사위 굴림 → 착지 후 배경 블러 + 판정 문구.
 * 굴림 SFX = 구르기 시작 / 결과 SFX = 성공·실패 문구 등장 (타임아웃에서 직접 재생).
 */
export function VnDiceLayer({
  dice,
  lineKey,
  rollSfxUrl,
  resultSfxUrl,
  resultSfxByTone,
  resultSfxFallbackUrl,
}: Props) {
  const [phase, setPhase] = useState<Phase>('boot');
  const [tens, ones] = useMemo(() => splitRoll(dice.roll), [dice.roll]);
  const tone = useMemo(() => classifyDiceResultTone(dice.result), [dice.result]);
  const rollHold = useRef<HTMLAudioElement | null>(null);
  const resultHold = useRef<HTMLAudioElement | null>(null);
  const urlsRef = useRef({
    rollSfxUrl,
    resultSfxUrl,
    resultSfxByTone,
    resultSfxFallbackUrl,
    tone,
  });
  urlsRef.current = {
    rollSfxUrl,
    resultSfxUrl,
    resultSfxByTone,
    resultSfxFallbackUrl,
    tone,
  };

  useEffect(() => {
    setPhase('boot');
    rollHold.current = null;
    resultHold.current = null;

    const tRoll = window.setTimeout(() => {
      setPhase('roll');
      /* 굴림 시작 순간에만 굴림음 */
      playUrl(urlsRef.current.rollSfxUrl, rollHold);
    }, 30);

    const tLand = window.setTimeout(() => setPhase('land'), LAND_MS);

    const tResult = window.setTimeout(() => {
      setPhase('result');
      const u = urlsRef.current;
      const byTone =
        u.tone !== 'neutral' ? u.resultSfxByTone?.[u.tone]?.trim() || undefined : undefined;
      /* 성공/실패 문구가 뜨는 순간에만 결과음 (굴림음과 분리) */
      playUrl(u.resultSfxUrl?.trim() || byTone || u.resultSfxFallbackUrl?.trim(), resultHold);
    }, RESULT_MS);

    return () => {
      window.clearTimeout(tRoll);
      window.clearTimeout(tLand);
      window.clearTimeout(tResult);
    };
  }, [lineKey, dice.roll, dice.result]);

  const playing = phase !== 'boot';
  const settled = phase === 'land' || phase === 'result';
  const showResult = phase === 'result';
  const veilOn = settled;

  return (
    <div
      className={`${styles.root}${veilOn ? ` ${styles.rootVeil}` : ''}${showResult ? ` ${styles.rootResult}` : ''}`}
      aria-live="polite"
      key={lineKey}
      data-tone={tone}
    >
      <div className={styles.veil} aria-hidden />

      <div className={styles.stage}>
        {showResult ? (
          <div className={styles.verdict} data-tone={tone}>
            <p className={styles.eyebrow}>{toneEyebrow(tone)}</p>
            <div className={styles.verdictGlow} aria-hidden>
              <span className={styles.bloomOuter} />
              <span className={styles.bloomInner} />
            </div>
            <p className={styles.verdictText}>{dice.result}</p>
            <p className={styles.rollHint}>
              <span className={styles.rollHintNum}>
                {tens}
                {ones}
              </span>
            </p>
          </div>
        ) : (
          <div className={styles.verdictSlot} aria-hidden />
        )}

        <div className={`${styles.diceRow}${playing ? ` ${styles.diceRowPlay}` : ''}`}>
          <div className={styles.dieWrap}>
            <div className={`${styles.shadow} ${styles.shadow_a}`} />
            <DiceCube digit={tens} variant="a" settled={settled} />
          </div>
          <div className={styles.dieWrap}>
            <div className={`${styles.shadow} ${styles.shadow_b}`} />
            <DiceCube digit={ones} variant="b" settled={settled} />
          </div>
        </div>
      </div>
    </div>
  );
}
