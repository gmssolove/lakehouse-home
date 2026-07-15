'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isTauriApp } from '@/lib/vn/isTauriApp';
import { VN_FIRST_SCENE_ID } from '@/data/vn/scenes';
import {
  listVnSlots,
  VN_SAVE_SLOTS,
  type VNSaveData,
  type VNSaveSlotId,
} from '@/lib/vn/vnSave';

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

type Panel = 'none' | 'continue' | 'settings';

function formatSavedAt(ts: number) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function MainMenu() {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>('none');
  const [bgOk, setBgOk] = useState(true);
  const [slots, setSlots] = useState<Record<VNSaveSlotId, VNSaveData | null> | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const start = useCallback(() => {
    router.push(`/vn/${VN_FIRST_SCENE_ID}`);
  }, [router]);

  const exit = useCallback(() => {
    exitVnApp(router);
  }, [router]);

  const openContinue = useCallback(() => {
    setPanel('continue');
    setSlotsLoading(true);
    setSlotsError(null);
    void listVnSlots()
      .then((data) => {
        setSlots(data);
        setSlotsLoading(false);
      })
      .catch(() => {
        setSlotsError('세이브를 불러오지 못했습니다.');
        setSlotsLoading(false);
      });
  }, []);

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

  const openSettings = useCallback(() => {
    setPanel('settings');
  }, []);

  const closePanel = useCallback(() => setPanel('none'), []);

  return (
    <div className={`vn-main-menu${bgOk ? '' : ' vn-main-menu--fallback'}`}>
      {bgOk ? (
        <img
          className="vn-main-menu__bg"
          src="/vn/backgrounds/main_menu.png"
          alt=""
          onError={() => setBgOk(false)}
        />
      ) : null}
      <div className="vn-main-menu__veil" aria-hidden />

      <div className="vn-main-menu__content">
        <p className="vn-main-menu__latin">KISARAGI</p>
        <h1 className="vn-main-menu__title">키사라기고교</h1>

        <nav className="vn-main-menu__nav" aria-label="메인 메뉴">
          <button type="button" className="vn-main-menu__btn" onClick={start}>
            시작하기
          </button>
          <button type="button" className="vn-main-menu__btn" onClick={openContinue}>
            이어하기
          </button>
          <button type="button" className="vn-main-menu__btn" onClick={openSettings}>
            설정
          </button>
          <button type="button" className="vn-main-menu__btn" onClick={exit}>
            나가기
          </button>
        </nav>
      </div>

      {panel === 'continue' ? (
        <div className="vn-menu-overlay" role="dialog" aria-label="이어하기">
          <div className="vn-menu-panel">
            <header className="vn-menu-panel__head">
              <h2 className="vn-menu-panel__title">이어하기</h2>
              <button type="button" className="vn-menu-panel__close" onClick={closePanel}>
                닫기
              </button>
            </header>
            {slotsLoading ? (
              <p className="vn-menu-panel__hint">불러오는 중…</p>
            ) : null}
            {slotsError ? <p className="vn-menu-panel__hint">{slotsError}</p> : null}
            <ul className="vn-menu-slots">
              {VN_SAVE_SLOTS.map((id, i) => {
                const data = slots?.[id] ?? null;
                const empty = !data;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className={`vn-menu-slot${empty ? ' is-empty' : ''}`}
                      disabled={empty || slotsLoading}
                      onClick={() => data && loadSlot(data)}
                    >
                      <span className="vn-menu-slot__label">슬롯 {i + 1}</span>
                      <span className="vn-menu-slot__meta">
                        {empty ? '빈 슬롯' : formatSavedAt(data.savedAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}

      {panel === 'settings' ? (
        <div className="vn-menu-overlay" role="dialog" aria-label="설정">
          <div className="vn-menu-panel">
            <header className="vn-menu-panel__head">
              <h2 className="vn-menu-panel__title">설정</h2>
              <button type="button" className="vn-menu-panel__close" onClick={closePanel}>
                닫기
              </button>
            </header>
            <p className="vn-menu-panel__hint">설정 항목이 없습니다.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
