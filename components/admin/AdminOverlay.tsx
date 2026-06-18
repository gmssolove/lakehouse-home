'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { OcCharacter } from '@/lib/types/character';
import { ADMIN_SECTIONS, type AdminSectionId } from '@/lib/types/site-content';
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
  UxAdminPanel,
  UniverseAdminPanel,
} from '@/components/admin/AdminSectionPanels';
import { OcEditForm } from '@/components/admin/OcEditForm';

type Props = {
  phase: 'open' | 'closing';
  onRequestClose: () => void;
  onClosed: () => void;
};

export function AdminOverlay({ phase, onRequestClose, onClosed }: Props) {
  const router = useRouter();
  const site = useSiteContent();
  const { characters, categories, saveCharacters } = useOcData();
  const { pairs, savePairs } = usePairData();
  const [section, setSection] = useState<AdminSectionId>('main');
  const [ocEditId, setOcEditId] = useState<string | number | null>(null);
  const [pairEditId, setPairEditId] = useState<string | null>(null);

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
          {ADMIN_SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`adm-tab${section === item.id ? ' active' : ''}`}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
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
            title="Diary — 일기"
            items={site.diary}
            onSave={site.saveDiary}
            emptyLabel="등록된 일기가 없습니다."
          />
        )}
        {section === 'gallery' && <GalleryAdminPanel items={site.gallery} onSave={site.saveGallery} />}
        {section === 'universe' && <UniverseAdminPanel items={site.universe} onSave={site.saveUniverse} />}
        {section === 'trpg' && (
          <PostListAdminPanel
            title="TRPG — 시나리오"
            items={site.trpg}
            onSave={site.saveTrpg}
            emptyLabel="등록된 시나리오가 없습니다."
          />
        )}
        {section === 'guest' && <GuestAdminPanel items={site.guests} onSave={site.saveGuests} />}
        {section === 'banner' && <BannerAdminPanel items={site.banners} onSave={site.saveBanners} />}
        {section === 'bgm' && <BgmAdminPanel data={site.bgm} onSave={site.saveBgm} />}
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
          <PairAdminPanel pairs={pairs} editId={pairEditId} onSelect={setPairEditId} onSave={savePairs} />
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
  onSave: (next: OcCharacter[]) => Promise<void>;
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
  editId,
  onSelect,
  onSave,
}: {
  pairs: import('@/lib/types/character').PairItem[];
  editId: string | null;
  onSelect: (id: string | null) => void;
  onSave: (next: import('@/lib/types/character').PairItem[]) => Promise<void>;
}) {
  const { confirm } = useLakeDialog();
  const { showSaveToast, showDeleteToast } = useSaveToast();
  const selected = pairs.find((p) => p.id === editId);

  async function persist(next: import('@/lib/types/character').PairItem[], toast: 'save' | 'delete' | false = false) {
    await onSave(next);
    if (toast === 'save') showSaveToast();
    if (toast === 'delete') showDeleteToast();
  }

  return (
    <>
      <div style={{ marginBottom: '.75rem', fontSize: 12, color: 'var(--lake-copper-soft)' }}>Pair — 페어</div>
      <div className="lh-admin-grid">
        <div id="pair-list-panel">
          {pairs.map((p) => (
            <div
              key={p.id}
              className={`char-list-item${editId === p.id ? ' selected' : ''}`}
              style={{ fontSize: 11 }}
              onClick={() => onSelect(p.id)}
            >
              {p.chars[0]} & {p.chars[1]}
            </div>
          ))}
        </div>
        <div id="pair-edit-panel">
          {selected ? (
            <PairEditForm
              pair={selected}
              onSave={(item) => persist(pairs.map((p) => (p.id === item.id ? item : p)))}
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

function PairEditForm({
  pair,
  onSave,
  onDelete,
}: {
  pair: import('@/lib/types/character').PairItem;
  onSave: (p: import('@/lib/types/character').PairItem) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}) {
  const { showSaveToast } = useSaveToast();
  const [form, setForm] = useState(pair);

  async function handleSave() {
    await onSave(form);
    showSaveToast();
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <span style={{ fontSize: 12, color: 'var(--lake-copper-soft)' }}>Pair Detail Edit</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn-save" onClick={() => void handleSave()}>
            저장
          </button>
          <button type="button" className="btn-del" onClick={() => void onDelete()}>
            삭제
          </button>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">캐릭터 1</label>
          <input
            className="form-input"
            value={form.chars[0]}
            onChange={(e) => setForm({ ...form, chars: [e.target.value, form.chars[1]] })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">캐릭터 2</label>
          <input
            className="form-input"
            value={form.chars[1]}
            onChange={(e) => setForm({ ...form, chars: [form.chars[0], e.target.value] })}
          />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">관계</label>
        <input className="form-input" value={form.relation || ''} onChange={(e) => setForm({ ...form, relation: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label">소개</label>
        <textarea className="form-input" rows={3} value={form.desc || ''} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label">스토리</label>
        <textarea className="form-input" rows={5} value={form.story || ''} onChange={(e) => setForm({ ...form, story: e.target.value })} />
      </div>
    </>
  );
}
