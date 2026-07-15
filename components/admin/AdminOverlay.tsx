'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { OcCharacter } from '@/lib/types/character';
import { ADMIN_NAV_GROUPS, ADMIN_SECTIONS, type AdminSectionId } from '@/lib/types/site-content';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { useOcData } from '@/lib/hooks/useOcData';
import { usePairData } from '@/lib/hooks/usePairData';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { useSaveToast } from '@/components/ui/SaveToast';
import { useLakeBackNavigation } from '@/lib/hooks/useLakeBackNavigation';
import {
  BannerAdminPanel,
  BgmAdminPanel,
  GalleryAdminPanel,
  GuestAdminPanel,
  MainAdminPanel,
  OcSettingsAdminPanel,
  PostListAdminPanel,
  TrpgAdminPanel,
  UxAdminPanel,
  UniverseAdminPanel,
} from '@/components/admin/AdminSectionPanels';
import {
  AccessAdminPanel,
  CharArchiveAdminPanel,
  GuestSettingsAdminPanel,
  MusicAdminPanel,
  QuoteAdminPanel,
  ReviewAdminPanel,
  ScrapAdminPanel,
} from '@/components/admin/RecordsAdminPanels';
import { OcEditForm } from '@/components/admin/OcEditForm';
import { PairEditForm } from '@/components/pair/PairEditForm';
import { createEmptyPair } from '@/lib/oc/pairDefaults';
import { movePairInList, pairOrderMeta } from '@/lib/oc/pairOrder';
import { AdminNavIcon } from '@/components/admin/AdminNavIcon';

type Props = {
  phase: 'open' | 'closing';
  onRequestClose: () => void;
  onClosed: () => void;
};

export function AdminOverlay({ phase, onRequestClose, onClosed }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const site = useSiteContent();
  const { characters, categories, saveCharacters } = useOcData();
  const { pairs, savePairs } = usePairData();
  const [section, setSection] = useState<AdminSectionId>('main');
  const [trpgEditId, setTrpgEditId] = useState<string | null>(null);
  const [ocEditId, setOcEditId] = useState<string | number | null>(null);
  const [pairEditId, setPairEditId] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== 'open') return;
    const nextSection = searchParams.get('section');
    const edit = searchParams.get('edit');
    if (nextSection && ADMIN_SECTIONS.some((s) => s.id === nextSection)) {
      setSection(nextSection as AdminSectionId);
    }
    if (edit && (nextSection === 'trpg' || !nextSection)) {
      setSection('trpg');
      setTrpgEditId(edit);
    }
  }, [phase, searchParams]);

  const handleAdminBack = useCallback(() => {
    if (ocEditId != null) {
      setOcEditId(null);
      return;
    }
    if (pairEditId != null) {
      setPairEditId(null);
      return;
    }
    onRequestClose();
  }, [ocEditId, pairEditId, onRequestClose]);

  useLakeBackNavigation(phase === 'open', handleAdminBack, 'admin', {
    guardPath: '/',
    router,
  });

  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (phase === 'open') {
      setEntered(true);
      return;
    }
    setEntered(false);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'closing') return;
    const t = window.setTimeout(onClosed, 460);
    return () => window.clearTimeout(t);
  }, [phase, onClosed]);

  const overlayClass = [
    'adm-overlay',
    'active',
    entered && phase === 'open' ? 'adm-overlay--in' : '',
    phase === 'closing' ? 'adm-overlay--out' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={overlayClass} id="admin-overlay">
      <div className="adm-sidebar">
        <div className="adm-sidebar-logo">Admin</div>
        <button type="button" className="adm-sidebar-close" onClick={onRequestClose}>
          ✕
        </button>
        <div className="adm-tabs">
          {ADMIN_NAV_GROUPS.map((group) => (
            <div key={group.key} className="adm-nav-group">
              <p className="adm-nav-group__label">{group.label}</p>
              {ADMIN_SECTIONS.filter((item) => item.group === group.key).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`adm-tab${section === item.id ? ' active' : ''}`}
                  onClick={() => setSection(item.id)}
                >
                  <span className="adm-tab__icon">
                    <AdminNavIcon name={item.icon} />
                  </span>
                  <span className="adm-tab__label">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="adm-main">
        {section === 'main' && <MainAdminPanel data={site.main} onSave={site.saveMain} />}
        {section === 'notice' && (
          <PostListAdminPanel
            title="Notice — 공지사항"
            items={site.notices}
            onSave={site.saveNotices}
            emptyLabel="등록된 공지가 없습니다."
          />
        )}
        {section === 'diary' && (
          <PostListAdminPanel
            title="Records · Diary"
            items={site.diary}
            onSave={site.saveDiary}
            emptyLabel="등록된 일기가 없습니다."
          />
        )}
        {section === 'scrap' && (
          <ScrapAdminPanel
            items={site.scrap}
            categories={site.scrapCategories}
            onSave={site.saveScrap}
            onSaveCategories={site.saveScrapCategories}
          />
        )}
        {section === 'review' && (
          <ReviewAdminPanel
            categories={site.reviewCategories}
            items={site.reviews}
            onSaveCategories={site.saveReviewCategories}
            onSaveItems={site.saveReviews}
          />
        )}
        {section === 'music' && (
          <MusicAdminPanel
            tracks={site.musicTracks}
            playlists={site.musicPlaylists}
            onSaveTracks={site.saveMusicTracks}
            onSavePlaylists={site.saveMusicPlaylists}
          />
        )}
        {section === 'charArchive' && (
          <CharArchiveAdminPanel items={site.charArchive} onSave={site.saveCharArchive} />
        )}
        {section === 'gallery' && <GalleryAdminPanel items={site.gallery} onSave={site.saveGallery} />}
        {section === 'quote' && <QuoteAdminPanel items={site.quotes} onSave={site.saveQuotes} />}
        {section === 'universe' && <UniverseAdminPanel items={site.universe} onSave={site.saveUniverse} />}
        {section === 'trpg' && (
          <TrpgAdminPanel
            items={site.trpg}
            onSave={site.saveTrpg}
            settings={site.trpgSettings}
            onSaveSettings={site.saveTrpgSettings}
            initialEditId={trpgEditId}
          />
        )}
        {section === 'guest' && (
          <>
            <GuestSettingsAdminPanel data={site.guestSettings} onSave={site.saveGuestSettings} />
            <div style={{ height: 16 }} />
            <GuestAdminPanel items={site.guests} onSave={site.saveGuests} />
          </>
        )}
        {section === 'banner' && <BannerAdminPanel items={site.banners} onSave={site.saveBanners} />}
        {section === 'bgm' && <BgmAdminPanel data={site.bgm} onSave={site.saveBgm} />}
        {section === 'access' && <AccessAdminPanel data={site.accessSettings} onSave={site.saveAccessSettings} />}
        {section === 'ux' && <UxAdminPanel data={site.uiSettings} onSave={site.saveUiSettings} />}
        {section === 'oc' && (
          <>
            <OcSettingsAdminPanel data={site.ocSettings} onSave={site.saveOcSettings} />
            <div style={{ height: 16 }} />
            <OcAdminPanel
              characters={characters}
              categories={categories}
              editId={ocEditId}
              onSelect={setOcEditId}
              onSave={saveCharacters}
            />
          </>
        )}
        {section === 'pair' && (
          <PairAdminPanel pairs={pairs} characters={characters} editId={pairEditId} onSelect={setPairEditId} onSave={savePairs} />
        )}
      </div>
    </div>
  );
}

function OcAdminPanel({
  characters,
  categories,
  editId,
  onSelect,
  onSave,
}: {
  characters: OcCharacter[];
  categories: string[];
  editId: string | number | null;
  onSelect: (id: string | number | null) => void;
  onSave: (next: OcCharacter[]) => Promise<void | OcCharacter[]>;
}) {
  const { confirm } = useLakeDialog();
  const { showSaveToast, showDeleteToast } = useSaveToast();
  const selected = characters.find((c) => String(c.id) === String(editId));

  async function persist(next: OcCharacter[], toast: 'save' | 'delete' | false = false) {
    await onSave(next);
    if (toast === 'save') showSaveToast();
    if (toast === 'delete') showDeleteToast();
  }

  function newChar() {
    const nc: OcCharacter = {
      id: Date.now(),
      name: '새 OC',
      nameSub: '',
      role: '',
      category: categories[0] || 'OC',
      subcat: '',
      faction: '',
      stars: 5,
      tag: '',
      img: '',
      imgFit: 'contain',
      imgPos: 'center top',
      desc: '',
      profile: [],
      story: '',
      gallery: [],
      novel: [],
      pvIntroLines: [],
      dialogue: [],
      vnLines: [],
      theme: { title: '', artist: '', youtubeId: '', fileData: '' },
      auVersions: [],
    };
    void persist([...characters, nc], 'save');
    onSelect(nc.id);
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.75rem' }}>
        <span style={{ fontSize: 12, color: 'var(--lake-copper-soft, var(--pink))' }}>OC — 캐릭터</span>
        <button type="button" className="btn-save" onClick={newChar}>
          + OC 추가
        </button>
      </div>
      <div className="lh-admin-grid">
        <div id="oc-char-list-panel">
          {characters.map((c) => (
            <div
              key={c.id}
              className={`char-list-item${String(editId) === String(c.id) ? ' selected' : ''}`}
              onClick={() => onSelect(c.id)}
            >
              <div>{c.name}</div>
              {c.nameSub && (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{c.nameSub}</div>
              )}
            </div>
          ))}
        </div>
        <div id="oc-char-edit-panel" className="lh-oc-admin-block">
          {selected ? (
            <OcEditForm
              key={selected.id}
              character={selected}
              categories={categories}
              onSave={(item) => persist(characters.map((c) => (String(c.id) === String(item.id) ? item : c)))}
              onDelete={async () => {
                if (!(await confirm('이 OC 캐릭터를 삭제할까요?'))) return;
                await persist(characters.filter((c) => String(c.id) !== String(selected.id)), 'delete');
                onSelect(null);
              }}
            />
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>캐릭터를 선택하세요.</span>
          )}
        </div>
      </div>
    </>
  );
}

function PairAdminPanel({
  pairs,
  characters,
  editId,
  onSelect,
  onSave,
}: {
  pairs: import('@/lib/types/character').PairItem[];
  characters: import('@/lib/types/character').OcCharacter[];
  editId: string | null;
  onSelect: (id: string | null) => void;
  onSave: (
    next: import('@/lib/types/character').PairItem[],
  ) => Promise<void | import('@/lib/types/character').PairItem[]>;
}) {
  const { confirm } = useLakeDialog();
  const { showSaveToast, showDeleteToast } = useSaveToast();
  const selected = pairs.find((p) => p.id === editId);

  async function persist(next: import('@/lib/types/character').PairItem[], toast: 'save' | 'delete' | false = false) {
    await onSave(next);
    if (toast === 'save') showSaveToast();
    if (toast === 'delete') showDeleteToast();
  }

  async function movePair(id: string, direction: -1 | 1) {
    const next = movePairInList(pairs, id, direction);
    if (next === pairs) return;
    await persist(next, 'save');
  }

  const selectedOrder = selected ? pairOrderMeta(pairs, selected.id) : null;

  return (
    <>
      <div style={{ marginBottom: '.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--lake-copper-soft)' }}>Pair — 페어</span>
        <button
          type="button"
          className="btn-save"
            onClick={() => {
            const item = createEmptyPair();
            void persist([...pairs, item]);
            onSelect(item.id);
          }}
        >
          + 페어 추가
        </button>
      </div>
      <div className="lh-admin-grid">
        <div id="pair-list-panel">
          {pairs.map((p) => {
            const order = pairOrderMeta(pairs, p.id);
            const title = p.pairTitle?.trim() || `${p.chars[0]} & ${p.chars[1]}`;
            return (
              <div
                key={p.id}
                className={`char-list-item${editId === p.id ? ' selected' : ''}`}
                style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => onSelect(p.id)}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  {title}
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                    {p.chars[0]} & {p.chars[1]}
                  </div>
                </span>
                {pairs.length > 1 && (
                  <span className="pair-order-controls__btns" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="pair-order-btn pair-order-btn--mini"
                      disabled={!order.canUp}
                      aria-label="앞으로"
                      onClick={() => void movePair(p.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="pair-order-btn pair-order-btn--mini"
                      disabled={!order.canDown}
                      aria-label="뒤로"
                      onClick={() => void movePair(p.id, 1)}
                    >
                      ↓
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div id="pair-edit-panel">
          {selected ? (
            <PairEditForm
              pair={selected}
              characters={characters}
              onSave={async (item) => {
                await persist(pairs.map((p) => (p.id === item.id ? item : p)));
              }}
              order={
                selectedOrder && selectedOrder.index >= 0
                  ? {
                      canUp: selectedOrder.canUp,
                      canDown: selectedOrder.canDown,
                      position: selectedOrder.index + 1,
                      total: selectedOrder.total,
                    }
                  : undefined
              }
              onMove={(dir) => void movePair(selected.id, dir)}
              onDelete={async () => {
                if (!(await confirm('이 페어 항목을 삭제할까요?'))) return;
                await persist(pairs.filter((p) => p.id !== selected.id), 'delete');
                onSelect(null);
              }}
            />
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>페어를 선택하세요.</span>
          )}
        </div>
      </div>
    </>
  );
}
