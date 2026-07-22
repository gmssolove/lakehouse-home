'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import type { VNSaveData } from '@/lib/vn/vnSave';
import { VnInGameMenu } from './VnInGameMenu';
import { VnPcResHint } from './VnPcResHint';
import { VnTutorial, type VnTutorialStep } from './VnTutorial';

type Phase = 'menu' | 'tutorial' | 'reshint' | 'play';

export type VnPlayShellApi = {
  /** ESC 「메인 메뉴」— 인게임 타이틀로 */
  returnToMenu: () => void;
};

type Props = {
  menuBackgroundUrl?: string;
  /** 타이틀 배경 흐림 px */
  menuBackgroundBlur?: number;
  tutorialSteps?: VnTutorialStep[];
  children: ReactNode | ((api: VnPlayShellApi) => ReactNode);
  onExit: () => void;
  onContinueSave: (data: VNSaveData) => void;
  /** 「게임 시작」— 이어하기 잔여 상태(?line= 등) 초기화 */
  onNewGame?: () => void;
};

/**
 * 모든 VN 공통: 메인 → 튜토리얼 → 해상도 안내 → 플레이.
 * ?line= 이 있으면(이어하기) 바로 플레이.
 */
export function VnPlayShell({
  menuBackgroundUrl,
  menuBackgroundBlur,
  tutorialSteps,
  children,
  onExit,
  onContinueSave,
  onNewGame,
}: Props) {
  const searchParams = useSearchParams();
  const resume = useMemo(() => {
    const line = searchParams.get('line')?.trim();
    const hotspots = searchParams.get('hotspots')?.trim();
    return Boolean(line || hotspots);
  }, [searchParams]);

  const bootTutorial = searchParams.get('boot') === 'tutorial';

  const [phase, setPhase] = useState<Phase>(() => {
    if (resume) return 'play';
    if (bootTutorial) return 'tutorial';
    return 'menu';
  });

  const startNew = useCallback(() => {
    onNewGame?.();
    setPhase('tutorial');
  }, [onNewGame]);
  /** 튜토리얼 종료 → 해상도 안내(챕터/플레이 시작 전) */
  const finishTutorial = useCallback(() => setPhase('reshint'), []);
  const dismissResHint = useCallback(() => setPhase('play'), []);
  const returnToMenu = useCallback(() => setPhase('menu'), []);

  if (phase === 'menu') {
    return (
      <VnInGameMenu
        backgroundUrl={menuBackgroundUrl}
        backgroundBlur={menuBackgroundBlur}
        onStart={startNew}
        onContinue={(data) => {
          onContinueSave(data);
          setPhase('play');
        }}
        onExit={onExit}
      />
    );
  }

  if (phase === 'tutorial') {
    return <VnTutorial steps={tutorialSteps} onDone={finishTutorial} />;
  }

  if (phase === 'reshint') {
    return <VnPcResHint onDone={dismissResHint} />;
  }

  const play =
    typeof children === 'function' ? children({ returnToMenu }) : children;

  return <>{play}</>;
}
