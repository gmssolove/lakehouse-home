'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { isTauriApp } from '@/lib/vn/isTauriApp';
import { VN_FIRST_SCENE_ID } from '@/data/vn/scenes';
import type { VNSaveData } from '@/lib/vn/vnSave';
import { VnInGameMenu } from './VnInGameMenu';

type RouterLike = {
  push: (href: string) => void;
  back: () => void;
};

/** 씬 닫기: 앱 → /vn 메뉴, 웹 → 히스토리 back(아카이브) */
export function closeVnToArchiveOrMenu(router: RouterLike) {
  if (isTauriApp()) {
    router.push('/vn');
    return;
  }
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back();
    return;
  }
  router.push('/pair');
}

/** 메인 메뉴 나가기: 앱 → 창 닫기, 웹 → history.back (아카이브 복귀) */
export function exitVnApp(router: RouterLike) {
  if (isTauriApp()) {
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().close())
      .catch(() => {
        router.push('/vn');
      });
    return;
  }
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back();
    return;
  }
  router.push('/pair');
}

/**
 * /vn 타이틀 화면 — 인게임 메인과 동일 UI (배경만 교체 가능).
 */
export function MainMenu() {
  const router = useRouter();

  const start = useCallback(() => {
    router.push(`/vn/${VN_FIRST_SCENE_ID}?boot=tutorial`);
  }, [router]);

  const exit = useCallback(() => {
    exitVnApp(router);
  }, [router]);

  const loadSlot = useCallback(
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
    <div className="vn-main-menu-host">
      <VnInGameMenu
        backgroundUrl="/vn/backgrounds/main_menu.png"
        onStart={start}
        onContinue={loadSlot}
        onExit={exit}
      />
    </div>
  );
}
