'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ExplorationView } from '@/components/vn/ExplorationView';
import { VNEngine } from '@/components/vn';
import {
  isDialogueScene,
  isExplorationScene,
  type VNAnyScene,
} from '@/components/vn/types';
import { closeVnToArchiveOrMenu } from '@/components/vn/MainMenu';
import { VnEndingScreen } from './VnEndingScreen';
import { VnPlayShell } from './VnPlayShell';
import type { VNSaveData } from '@/lib/vn/vnSave';

type Props = {
  scene: VNAnyScene;
  scenes: Record<string, VNAnyScene>;
};

export function VnSceneClient({ scene, scenes }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [startLineId, setStartLineId] = useState<string | undefined>(() => {
    const raw = searchParams.get('line');
    return raw?.trim() || undefined;
  });
  const [initialChecked, setInitialChecked] = useState<string[]>(() => {
    const raw = searchParams.get('hotspots');
    if (!raw?.trim()) return [];
    return raw
      .split(',')
      .map((s) => decodeURIComponent(s.trim()))
      .filter(Boolean);
  });

  const [active, setActive] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [ended, setEnded] = useState(false);
  const [key, setKey] = useState(0);

  const goBack = useCallback(() => {
    closeVnToArchiveOrMenu(router);
  }, [router]);

  const restart = useCallback(() => {
    setStartLineId(undefined);
    setInitialChecked([]);
    setEnded(false);
    setLeaving(false);
    setActive(true);
    setKey((k) => k + 1);
  }, []);

  const beginClose = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => {
      setActive(false);
      setLeaving(false);
      setEnded(true);
    }, 580);
  }, []);

  const goScene = useCallback(
    (sceneId: string) => {
      router.push(`/vn/${sceneId}`);
    },
    [router],
  );

  const loadSaveNavigate = useCallback(
    (data: VNSaveData) => {
      const qs = new URLSearchParams();
      if (data.lineId && data.lineId !== '__explore__') {
        qs.set('line', data.lineId);
      }
      if (data.hotspotsChecked?.length) {
        qs.set('hotspots', data.hotspotsChecked.map(encodeURIComponent).join(','));
      }
      const q = qs.toString();
      router.push(`/vn/${data.sceneId}${q ? `?${q}` : ''}`);
    },
    [router],
  );

  return (
    <div className="vn-stage active" id="detail-screen">
      {isDialogueScene(scene) ? (
        <VnPlayShell
          onExit={goBack}
          onNewGame={() => {
            setStartLineId(undefined);
            setInitialChecked([]);
            router.replace(`/vn/${scene.id}`);
          }}
          onContinueSave={(data) => {
            setStartLineId(
              data.lineId && data.lineId !== '__explore__' ? data.lineId : undefined,
            );
            if (data.hotspotsChecked?.length) {
              setInitialChecked(data.hotspotsChecked);
            }
            setKey((k) => k + 1);
            loadSaveNavigate(data);
          }}
        >
          {({ returnToMenu }) => (
            <>
              {active || leaving || ended ? (
                <VNEngine
                  key={`${key}-${startLineId ?? 'start'}`}
                  scene={scene}
                  scenes={scenes}
                  active={active && !ended}
                  leaving={leaving && !ended}
                  holdBgm={ended}
                  startLineId={startLineId}
                  onEnd={beginClose}
                  onClose={beginClose}
                  onExit={goBack}
                  onMainMenu={returnToMenu}
                  onNavigateScene={goScene}
                  onLoadSaveNavigate={loadSaveNavigate}
                />
              ) : null}
              {ended ? (
                <VnEndingScreen
                  onRestart={restart}
                  onMainMenu={() => {
                    setEnded(false);
                    setLeaving(false);
                    setActive(true);
                    returnToMenu();
                  }}
                />
              ) : null}
            </>
          )}
        </VnPlayShell>
      ) : ended && !active ? (
        <VnEndingScreen onRestart={restart} onMainMenu={goBack} />
      ) : isExplorationScene(scene) ? (
        <ExplorationView
          key={`${key}-explore`}
          scene={scene}
          active={active}
          leaving={leaving}
          initialChecked={initialChecked}
          onClose={beginClose}
          onNext={goScene}
        />
      ) : null}
    </div>
  );
}
