'use client';

import { useEffect, useState } from 'react';
import {
  getLineVoiceVolume,
  setLineVoiceVolume,
  subscribeLineVoiceVolume,
} from '@/lib/vn/playLineVoice';

type Props = {
  /** overlay 미사용. panel = 수정 모달 */
  variant?: 'panel' | 'overlay';
};

/** OC/Pair 대사 음성 — 전역 볼륨 (localStorage 일괄) */
export function LineVoiceVolumeControl({ variant: _variant = 'panel' }: Props) {
  const [vol, setVol] = useState(0.85);

  useEffect(() => {
    setVol(getLineVoiceVolume());
    return subscribeLineVoiceVolume(setVol);
  }, []);

  const pct = Math.round(vol * 100);

  return (
    <div
      data-testid="line-voice-volume"
      style={{
        margin: '0 0 14px',
        padding: '14px 16px',
        border: '2px solid rgba(215, 169, 130, 0.7)',
        borderRadius: 12,
        background: 'rgba(28, 22, 14, 0.92)',
        display: 'block',
        visibility: 'visible',
        opacity: 1,
        position: 'relative',
        zIndex: 5,
      }}
    >
      <div
        style={{
          marginBottom: 8,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: '#f0cfad',
        }}
      >
        대사 음성 볼륨 (전체) — {pct}%
      </div>
      <div style={{ fontSize: 11, color: 'rgba(232,222,211,0.55)', marginBottom: 10, lineHeight: 1.5 }}>
        OC·Pair 대사에 넣은 음성이 재생될 때 이 설정이 공통 적용됩니다. (이 기기에만 저장)
      </div>
      <input
        id="lh-line-voice-vol-range"
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        aria-label="대사 음성 볼륨"
        onChange={(e) => setLineVoiceVolume(Number(e.target.value) / 100)}
        style={{
          display: 'block',
          width: '100%',
          height: 28,
          margin: 0,
          cursor: 'pointer',
          accentColor: '#d7a982',
        }}
      />
    </div>
  );
}
