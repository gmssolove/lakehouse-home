'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  dustFxActive,
  dustFxIntensity,
  type DustFxConfig,
} from '@/lib/shared/dustFx';

type ParticleKind = 'spark' | 'mote';

type Particle = {
  kind: ParticleKind;
  left: string;
  top: string;
  size: number;
  duration: string;
  delay: string;
  driftX: string;
  driftY: string;
  opacity: number;
  anim: string;
};

type Props = {
  fx?: DustFxConfig | null;
  className?: string;
  /** false면 파티클 미생성·미렌더 (IO/진입 지연 게이트) */
  active?: boolean;
};

function makeParticles(intensity: number): Particle[] {
  const t = intensity / 100;
  /* 58→~28 상한 — 페어 상세 진입 시 GPU 레이어 폭증 완화 */
  const sparkCount = Math.round(10 + t * 18);
  const moteCount = Math.round(5 + t * 10);
  const speedMul = 1.4 - t * 0.45;
  const out: Particle[] = [];

  for (let i = 0; i < sparkCount; i++) {
    const size = 0.65 + Math.random() * 1.35;
    const duration = (12 + Math.random() * 24) * speedMul;
    out.push({
      kind: 'spark',
      left: `${3 + Math.random() * 94}%`,
      top: `${8 + Math.random() * 84}%`,
      size,
      duration: `${duration.toFixed(1)}s`,
      delay: `${(-Math.random() * duration).toFixed(1)}s`,
      driftX: `${(-18 + Math.random() * 36).toFixed(1)}px`,
      driftY: `${(-40 - Math.random() * 48).toFixed(1)}px`,
      opacity: 0.2 + Math.random() * (0.4 + t * 0.35),
      anim: 'lhDustSpark',
    });
  }

  for (let i = 0; i < moteCount; i++) {
    const size = 1.4 + Math.random() * 2.4;
    const duration = (18 + Math.random() * 28) * speedMul;
    out.push({
      kind: 'mote',
      left: `${4 + Math.random() * 92}%`,
      top: `${10 + Math.random() * 80}%`,
      size,
      duration: `${duration.toFixed(1)}s`,
      delay: `${(-Math.random() * duration).toFixed(1)}s`,
      driftX: `${(-24 + Math.random() * 48).toFixed(1)}px`,
      driftY: `${(-32 - Math.random() * 40).toFixed(1)}px`,
      opacity: 0.12 + Math.random() * (0.22 + t * 0.2),
      anim: 'lhDustMote',
    });
  }

  return out;
}

/**
 * 상세 스테이지용 먼지 부유 — spark + mote.
 */
export function DustAtmosphere({ fx, className, active = true }: Props) {
  const enabled = dustFxActive(fx) && active;
  const intensity = dustFxIntensity(fx);
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!enabled) {
      setParticles([]);
      return;
    }
    setParticles(makeParticles(intensity));
  }, [enabled, intensity]);

  const style = useMemo(
    () =>
      ({
        ['--dust-i' as string]: (intensity / 100).toFixed(3),
      }) as CSSProperties,
    [intensity],
  );

  if (!enabled || !particles.length) return null;

  return (
    <div
      className={`lh-dust-atmosphere${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden
    >
      {particles.map((p, i) => (
        <span
          key={`${intensity}-${p.kind}-${i}`}
          className={`lh-dust-atmosphere__mote is-${p.kind}`}
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            animationName: p.anim,
            animationDuration: p.duration,
            animationDelay: p.delay,
            ['--dust-dx' as string]: p.driftX,
            ['--dust-dy' as string]: p.driftY,
          }}
        />
      ))}
    </div>
  );
}
