'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  BannerItem,
  ClickerButton,
  ClickerSoundPreset,
  GalleryItem,
  GuestEntry,
  GuestReply,
  SiteBgm,
  SiteMain,
  SiteOcSettings,
  SitePost,
  SiteUiSettings,
  TrpgDiceHighlight,
  TrpgGalleryItem,
  TrpgHandout,
  TrpgListSettings,
  TrpgPlayerProfile,
  TrpgRelationship,
  TrpgSessionLog,
  TrpgScenario,
  UniverseCard,
} from '@/lib/types/site-content';
import { DEFAULT_TRPG_LIST_SETTINGS, newId } from '@/lib/types/site-content';
import { normalizeGuestEntry } from '@/lib/guest/normalize';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { useSaveToast } from '@/components/ui/SaveToast';
import { BANNER_DIVIDER_PRESETS, BannerDividerIcon } from '@/lib/banner/dividerIcons';
import { CLICK_SOUND_PRESETS, playClickSound } from '@/lib/sounds/clickSound';
import { CLICKER_SOUND_PRESETS, playClickerPreset } from '@/lib/clicker/sounds';
import { CURSOR_PRESETS } from '@/lib/ui/cursorPresets';
import { LakeToggle } from '@/components/ui/LakeToggle';
import { LinkPickList } from '@/components/ui/LinkPickList';
import { SecretPostFields } from '@/components/ui/SecretPostFields';
import { ImageFileField } from '@/components/ui/ImageFileField';
import { ImageFrameEditor } from '@/components/ui/ImageFrameEditor';
import { GalleryCreditInput } from '@/components/ui/GalleryCreditInput';
import { AudioFileField } from '@/components/ui/AudioFileField';
import { ScenarioVnEditor, type ScenarioVnEditorHandle } from '@/components/shared/ScenarioVnEditor';
import { uploadImageFile } from '@/lib/r2/client';
import { AdminListItem } from '@/components/ui/AdminListItem';
import {
  AccordionSection,
  FieldLabel,
  FileUploadField,
  RepeatableList,
  SliderField,
  TextAreaField,
} from '@/components/ui/form';
import { TrpgInvestigatorInlineTab } from '@/components/trpg/TrpgInvestigatorInlineTab';
import { TrpgThumbnailEditor } from '@/components/trpg/TrpgThumbnailEditor';
import { useOcData } from '@/lib/hooks/useOcData';
import { uploadMediaFile } from '@/lib/r2/client';
import { parseLogHtmlFile, parseLogHtmlString } from '@/lib/trpg/logImport';
import { TRPG_FONT_OPTIONS } from '@/lib/trpg/fonts';
import type { OcCharacter } from '@/lib/types/character';

type ToastAction = 'save' | 'delete' | false;

function readFileAsDataUrl(file: File, onReady: (url: string) => void) {
  const reader = new FileReader();
  reader.onload = () => onReady(String(reader.result || ''));
  reader.readAsDataURL(file);
}

type MainProps = {
  data: SiteMain;
  onSave: (next: SiteMain) => Promise<void>;
};

export function MainAdminPanel({ data, onSave }: MainProps) {
  const [form, setForm] = useState(data);
  useEffect(() => setForm(data), [data]);
  const set = <K extends keyof SiteMain>(k: K, v: SiteMain[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const applyFavicon = (url: string) => {
    const next = url.trim();
    if (!next) return;
    setForm((f) => {
      const prev = (f.favicon || '').trim();
      const hist = Array.isArray(f.faviconHistory) ? [...f.faviconHistory] : [];
      // 직전 파비콘을 히스토리에 보관(되돌리기용), 중복 제거
      if (prev && prev !== next && !hist.includes(prev)) hist.unshift(prev);
      const cleaned = hist.filter((h) => h && h !== next).slice(0, 12);
      return { ...f, favicon: next, faviconHistory: cleaned };
    });
  };
  const clearFavicon = () =>
    setForm((f) => {
      const prev = (f.favicon || '').trim();
      const hist = Array.isArray(f.faviconHistory) ? [...f.faviconHistory] : [];
      if (prev && !hist.includes(prev)) hist.unshift(prev);
      return { ...f, favicon: '', faviconHistory: hist.slice(0, 12) };
    });

  const faviconHistory = (form.faviconHistory ?? []).filter(
    (h) => h && h !== (form.favicon || '').trim(),
  );

  return (
    <AdminPanelShell title="Main — 홈 메인 문구" onSave={() => onSave(form)}>
      <div className="form-group">
        <FileUploadField
          label="파비콘"
          value={form.favicon || ''}
          onChange={(url) => {
            if (!url.trim()) clearFavicon();
            else applyFavicon(url);
          }}
          accept="image"
          acceptAttr="image/*,.ico,.svg"
          folder="site/favicon"
          emptyLabel="📁 파비콘 업로드"
          changeLabel="파일 변경"
        />
        {faviconHistory.length ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, opacity: 0.55, marginBottom: 4 }}>이전 파비콘 (클릭해서 되돌리기)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {faviconHistory.map((h, i) => (
                <button
                  key={`fav-hist-${i}`}
                  type="button"
                  title="이 파비콘으로 되돌리기"
                  onClick={() => applyFavicon(h)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    border: '1px solid rgba(215,169,130,0.35)',
                    background: 'rgba(0,0,0,0.25)',
                    padding: 2,
                    cursor: 'pointer',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={h} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="form-group">
        <label className="form-label">상단 라벨</label>
        <input className="form-input" value={form.eyebrow} onChange={(e) => set('eyebrow', e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">라틴 문구</label>
        <input className="form-input" value={form.latin} onChange={(e) => set('latin', e.target.value)} />
      </div>
      <div className="lh-oc-admin-grid">
        <div className="form-group">
          <label className="form-label">제목 (앞)</label>
          <input className="form-input" value={form.heading} onChange={(e) => set('heading', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">제목 (강조)</label>
          <input
            className="form-input"
            value={form.headingAccent}
            onChange={(e) => set('headingAccent', e.target.value)}
          />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">설명</label>
        <textarea className="form-input" rows={4} value={form.desc} onChange={(e) => set('desc', e.target.value)} />
      </div>
    </AdminPanelShell>
  );
}

type PostProps = {
  title: string;
  items: SitePost[];
  onSave: (next: SitePost[]) => Promise<void>;
  emptyLabel: string;
};

export function PostListAdminPanel({ title, items, onSave, emptyLabel }: PostProps) {
  const { confirm } = useLakeDialog();
  const { showSaveToast, showDeleteToast } = useSaveToast();
  const [editId, setEditId] = useState<string | null>(null);
  const selected = items.find((i) => i.id === editId);

  async function persist(next: SitePost[], toast: ToastAction = false) {
    await onSave(next);
    if (toast === 'save') showSaveToast();
    if (toast === 'delete') showDeleteToast();
  }

  function addItem() {
    const item: SitePost = {
      id: newId(),
      title: '새 글',
      body: '',
      date: new Date().toISOString().slice(0, 10),
    };
    void persist([...items, item], 'save');
    setEditId(item.id);
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.75rem' }}>
        <span style={{ fontSize: 12, color: 'var(--lake-copper-soft, var(--pink))' }}>{title}</span>
        <button type="button" className="btn-save" onClick={addItem}>
          + 추가
        </button>
      </div>
      <div className="lh-admin-grid">
        <div>
          {items.length === 0 && (
            <div className="page-coming" style={{ fontSize: 11 }}>
              {emptyLabel}
            </div>
          )}
          {items.map((item) => (
            <AdminListItem
              key={item.id}
              title={item.title}
              subtitle={item.date}
              selected={editId === item.id}
              onClick={() => setEditId(item.id)}
            />
          ))}
        </div>
        <div className="lh-oc-admin-block">
          {selected ? (
            <PostEditForm
              key={selected.id}
              item={selected}
              onSave={(item) => persist(items.map((i) => (i.id === item.id ? item : i)))}
              onDelete={async () => {
                if (!(await confirm('이 항목을 삭제할까요?'))) return;
                await persist(items.filter((i) => i.id !== selected.id), 'delete');
                setEditId(null);
              }}
            />
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>항목을 선택하세요.</span>
          )}
        </div>
      </div>
    </>
  );
}

function PostEditForm({
  item,
  onSave,
  onDelete,
}: {
  item: SitePost;
  onSave: (item: SitePost) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState(item);

  return (
    <AdminPanelShell title="글 편집" onSave={() => onSave(form)} onDelete={onDelete}>
      <div className="form-group">
        <label className="form-label">제목</label>
        <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label">날짜</label>
        <input className="form-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label">내용</label>
        <textarea className="form-input" rows={8} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      </div>
      <SecretPostFields value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
    </AdminPanelShell>
  );
}

type TrpgProps = {
  items: TrpgScenario[];
  onSave: (next: TrpgScenario[]) => Promise<void>;
  settings: TrpgListSettings;
  onSaveSettings: (next: TrpgListSettings) => Promise<void>;
  initialEditId?: string | null;
};

const TRPG_ASPECT_PRESETS = [
  { value: '16 / 10', label: '16:10 (카드)' },
  { value: '16 / 9', label: '16:9' },
  { value: '2 / 1', label: '2:1 (와이드)' },
  { value: '3 / 2', label: '3:2' },
  { value: '4 / 3', label: '4:3' },
  { value: '3 / 4', label: '3:4 (세로)' },
  { value: '1 / 1', label: '1:1' },
];

export function TrpgAdminPanel({
  items,
  onSave,
  settings,
  onSaveSettings,
  initialEditId = null,
}: TrpgProps) {
  const { confirm } = useLakeDialog();
  const { showSaveToast, showDeleteToast } = useSaveToast();
  const { characters } = useOcData();
  const [editId, setEditId] = useState<string | null>(initialEditId);
  const [uploading, setUploading] = useState(false);
  const [listSettings, setListSettings] = useState(settings);
  const editBodyRef = useRef<HTMLDivElement>(null);
  const selected = items.find((i) => i.id === editId);

  useEffect(() => {
    if (initialEditId) setEditId(initialEditId);
  }, [initialEditId]);

  useEffect(() => {
    setListSettings(settings);
  }, [settings]);

  async function persist(next: TrpgScenario[], toast: ToastAction = false) {
    try {
      await onSave(next);
      if (toast === 'save') showSaveToast();
      if (toast === 'delete') showDeleteToast();
    } catch (err) {
      window.alert(
        err instanceof Error
          ? err.message
          : '저장에 실패했습니다. HTML 로그 용량을 줄여 다시 시도해 주세요.',
      );
    }
  }

  async function persistSettings(next: TrpgListSettings) {
    setListSettings(next);
    await onSaveSettings(next);
    showSaveToast();
  }

  function addItem() {
    const item: TrpgScenario = {
      id: newId(),
      title: '새 시나리오',
      subtitle: '',
      thumbnail: '',
      categoryId: listSettings.categories[0]?.id || '',
      author: '',
      kp: '',
      system: listSettings.categories[0]?.label || '',
      dateStart: '',
      dateEnd: '',
      players: '',
      cleared: false,
      summary: '',
      playerProfiles: [],
      relationships: [],
      gallery: [],
      diceHighlights: [],
      handouts: [],
      characterIds: [],
      logs: [],
    };
    void persist([...items, item], 'save');
    setEditId(item.id);
  }

  function addCategory() {
    const id = `cat_${Date.now().toString(36)}`;
    void persistSettings({
      ...listSettings,
      categories: [...listSettings.categories, { id, label: '새 카테고리' }],
    });
  }

  return (
    <>
      <div className="trpg-edit-section" style={{ marginBottom: '1rem' }}>
        <div className="trpg-edit-section__title">리스트 카드 설정</div>
        <div className="trpg-edit-field">
          <label className="form-label">카드 비율</label>
          <div className="trpg-edit-row col2">
            <select
              className="form-input"
              value={
                TRPG_ASPECT_PRESETS.some((p) => p.value === listSettings.cardAspect)
                  ? listSettings.cardAspect
                  : '__custom'
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__custom') return;
                void persistSettings({ ...listSettings, cardAspect: v });
              }}
            >
              {TRPG_ASPECT_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
              <option value="__custom">커스텀…</option>
            </select>
            <input
              className="form-input"
              value={listSettings.cardAspect}
              placeholder="예: 3 / 4"
              onChange={(e) => setListSettings({ ...listSettings, cardAspect: e.target.value })}
              onBlur={() => {
                const next = listSettings.cardAspect.trim() || DEFAULT_TRPG_LIST_SETTINGS.cardAspect;
                if (next !== settings.cardAspect) void persistSettings({ ...listSettings, cardAspect: next });
              }}
            />
          </div>
        </div>
        <div className="trpg-edit-field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label className="form-label">필터 카테고리</label>
            <button type="button" className="btn-save" onClick={addCategory}>
              + 카테고리
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {listSettings.categories.map((cat, idx) => (
              <div key={cat.id} className="trpg-edit-row col2" style={{ alignItems: 'center' }}>
                <input
                  className="form-input"
                  value={cat.label}
                  placeholder="표시 이름"
                  onChange={(e) => {
                    const categories = listSettings.categories.map((c, i) =>
                      i === idx ? { ...c, label: e.target.value } : c,
                    );
                    setListSettings({ ...listSettings, categories });
                  }}
                  onBlur={() => {
                    const categories = listSettings.categories
                      .map((c) => ({ ...c, label: c.label.trim() || c.id }))
                      .filter((c) => c.id);
                    void persistSettings({ ...listSettings, categories });
                  }}
                />
                <button
                  type="button"
                  className="btn-del"
                  onClick={() => {
                    const categories = listSettings.categories.filter((_, i) => i !== idx);
                    void persistSettings({
                      ...listSettings,
                      categories: categories.length ? categories : DEFAULT_TRPG_LIST_SETTINGS.categories,
                    });
                  }}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.75rem' }}>
        <span style={{ fontSize: 12, color: 'var(--lake-copper-soft, var(--pink))' }}>TRPG — 시나리오</span>
        <button type="button" className="btn-save" onClick={addItem}>
          + 추가
        </button>
      </div>
      <div className="lh-admin-grid trpg-admin-grid">
        <div className="trpg-admin-list">
          {items.length === 0 && (
            <div className="page-coming" style={{ fontSize: 11 }}>
              등록된 시나리오가 없습니다.
            </div>
          )}
          {items.map((item) => (
            <AdminListItem
              key={item.id}
              title={item.title}
              subtitle={item.system || undefined}
              selected={editId === item.id}
              onClick={() => setEditId(item.id)}
            />
          ))}
        </div>
        <div ref={editBodyRef} className="lh-oc-admin-block trpg-admin-edit lh-scroll">
          {selected ? (
            <TrpgEditForm
              key={selected.id}
              item={selected}
              characters={characters}
              listSettings={listSettings}
              uploading={uploading}
              onUploadStart={() => setUploading(true)}
              onUploadEnd={() => setUploading(false)}
              onSave={(item) => persist(items.map((i) => (i.id === item.id ? item : i)), 'save')}
              onPersist={(item) => void persist(items.map((i) => (i.id === item.id ? item : i)))}
              onDelete={async () => {
                if (!(await confirm('이 시나리오를 삭제할까요?'))) return;
                await persist(items.filter((i) => i.id !== selected.id), 'delete');
                setEditId(null);
              }}
            />
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>시나리오를 선택하세요.</span>
          )}
          {selected ? (
            <button
              type="button"
              className="oc-edit-scroll-top"
              aria-label="맨 위로"
              onClick={() => editBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              ↑
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}

type TrpgEditTab = 'basic' | 'session' | 'investigators' | 'logs' | 'gallery' | 'dice' | 'handouts' | 'vn';

export type { TrpgEditTab };

const TRPG_EDIT_TABS: { id: TrpgEditTab; label: string }[] = [
  { id: 'basic', label: '기본' },
  { id: 'session', label: '세션' },
  { id: 'investigators', label: '탐사자' },
  { id: 'logs', label: '로그' },
  { id: 'gallery', label: '갤러리' },
  { id: 'dice', label: '주요 판정' },
  { id: 'handouts', label: '핸드아웃' },
  { id: 'vn', label: '비주얼 노벨' },
];

export function TrpgEditForm({
  item,
  characters,
  listSettings = DEFAULT_TRPG_LIST_SETTINGS,
  uploading,
  onUploadStart,
  onUploadEnd,
  onSave,
  onDelete,
  embed = false,
  initialTab = 'basic',
  onBindActions,
  onPersist,
}: {
  item: TrpgScenario;
  characters: OcCharacter[];
  listSettings?: TrpgListSettings;
  uploading: boolean;
  onUploadStart: () => void;
  onUploadEnd: () => void;
  onSave: (item: TrpgScenario) => void;
  onDelete: () => void;
  embed?: boolean;
  initialTab?: TrpgEditTab;
  onBindActions?: (actions: { save: () => void; delete: () => void }) => void;
  onPersist?: (item: TrpgScenario) => void;
}) {
  const { confirm } = useLakeDialog();
  const formRef = useRef<HTMLDivElement>(null);
  const vnEditorRef = useRef<ScenarioVnEditorHandle | null>(null);
  const formStateRef = useRef(item);
  const [form, setForm] = useState(item);
  const [tab, setTab] = useState<TrpgEditTab>(initialTab);
  const [htmlPaste, setHtmlPaste] = useState('');
  formStateRef.current = form;

  /* 시나리오가 바뀔 때만 폼 리셋 — 저장 직후 item 갱신으로 편집 중이던 값이 덮이지 않게 */
  useEffect(() => {
    setForm(item);
  }, [item.id]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, item.id]);

  useEffect(() => {
    onBindActions?.({
      save: () => {
        const snap = vnEditorRef.current?.getSnapshot();
        const base = formStateRef.current;
        onSave(
          snap
            ? { ...base, vnEditable: snap.editable, vnScene: snap.vnScene }
            : base,
        );
      },
      delete: onDelete,
    });
  }, [form, onBindActions, onDelete, onSave]);

  function addLog() {
    const log: TrpgSessionLog = {
      id: newId(),
      title: '세션 로그',
      date: new Date().toISOString().slice(0, 10),
      body: '',
    };
    setForm({ ...form, logs: [...(form.logs ?? []), log] });
  }

  function updateLog(id: string, patch: Partial<TrpgSessionLog>) {
    setForm({
      ...form,
      logs: (form.logs ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)),
    });
  }

  async function removeLog(id: string) {
    if (!(await confirm('이 세션 로그를 삭제할까요?'))) return;
    setForm({ ...form, logs: (form.logs ?? []).filter((l) => l.id !== id) });
  }

  async function importLogHtmlFiles(files: File[]) {
    if (!files.length) return;
    try {
      const parsedList = await Promise.all(files.map((file) => parseLogHtmlFile(file)));
      const newLogs: TrpgSessionLog[] = parsedList.map((parsed) => ({
        id: newId(),
        title: parsed.title,
        date: new Date().toISOString().slice(0, 10),
        body: parsed.body,
        html: parsed.html,
      }));
      setForm((f) => ({ ...f, logs: [...(f.logs ?? []), ...newLogs] }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'HTML 로그 불러오기 실패');
    }
  }

  async function attachLogHtml(logId: string, file: File) {
    try {
      const parsed = await parseLogHtmlFile(file);
      updateLog(logId, {
        title: parsed.title || undefined,
        body: parsed.body,
        html: parsed.html,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'HTML 로그 불러오기 실패');
    }
  }

  function addPlayer() {
    const p: TrpgPlayerProfile = { id: newId(), name: '탐사자', role: 'HO' };
    setForm((f) => ({ ...f, playerProfiles: [...(f.playerProfiles ?? []), p] }));
  }

  function updatePlayer(id: string, patch: Partial<TrpgPlayerProfile>) {
    setForm((f) => ({
      ...f,
      playerProfiles: (f.playerProfiles ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }

  function removePlayer(id: string) {
    setForm((f) => ({
      ...f,
      playerProfiles: (f.playerProfiles ?? []).filter((p) => p.id !== id),
      relationships: (f.relationships ?? []).filter((r) => r.fromId !== id && r.toId !== id),
    }));
  }

  function addRelation() {
    const players = form.playerProfiles ?? [];
    const rel: TrpgRelationship = {
      id: newId(),
      fromId: players[0]?.id ?? '',
      toId: players[1]?.id ?? players[0]?.id ?? '',
      label: '',
    };
    setForm((f) => ({ ...f, relationships: [...(f.relationships ?? []), rel] }));
  }

  function updateRelation(id: string, patch: Partial<TrpgRelationship>) {
    setForm((f) => ({
      ...f,
      relationships: (f.relationships ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }

  function removeRelation(id: string) {
    setForm((f) => ({ ...f, relationships: (f.relationships ?? []).filter((r) => r.id !== id) }));
  }

  function addGalleryItem() {
    const g: TrpgGalleryItem = { id: newId(), img: '', imgs: [''], title: '', caption: '' };
    setForm((f) => ({ ...f, gallery: [...(f.gallery ?? []), g] }));
  }

  function galleryImageList(g: TrpgGalleryItem): string[] {
    if (g.imgs && g.imgs.length) return g.imgs;
    return g.img ? [g.img] : [''];
  }

  function setGalleryImages(id: string, imgs: string[]) {
    updateGallery(id, { img: imgs.find((s) => s.trim()) || '', imgs });
  }

  function moveGalleryItem(id: string, dir: -1 | 1) {
    setForm((f) => {
      const list = [...(f.gallery ?? [])];
      const i = list.findIndex((g) => g.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return f;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...f, gallery: list };
    });
  }

  function moveGalleryImage(id: string, index: number, dir: -1 | 1) {
    const g = (form.gallery ?? []).find((item) => item.id === id);
    if (!g) return;
    const images = galleryImageList(g);
    const j = index + dir;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[index], next[j]] = [next[j], next[index]];
    setGalleryImages(id, next);
  }

  function updateGallery(id: string, patch: Partial<TrpgGalleryItem>) {
    setForm((f) => ({
      ...f,
      gallery: (f.gallery ?? []).map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
  }

  function removeGallery(id: string) {
    setForm((f) => ({ ...f, gallery: (f.gallery ?? []).filter((g) => g.id !== id) }));
  }

  function addDiceHighlight() {
    const d: TrpgDiceHighlight = { id: newId(), title: '주요 판정', roll: '1d100', result: '', note: '' };
    setForm((f) => ({ ...f, diceHighlights: [...(f.diceHighlights ?? []), d] }));
  }

  function updateDiceHighlight(id: string, patch: Partial<TrpgDiceHighlight>) {
    setForm((f) => ({
      ...f,
      diceHighlights: (f.diceHighlights ?? []).map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));
  }

  function removeDiceHighlight(id: string) {
    setForm((f) => ({ ...f, diceHighlights: (f.diceHighlights ?? []).filter((d) => d.id !== id) }));
  }

  function addHandout() {
    const h: TrpgHandout = { id: newId(), title: '핸드아웃', body: '', spoiler: false };
    setForm((f) => ({ ...f, handouts: [...(f.handouts ?? []), h] }));
  }

  function updateHandout(id: string, patch: Partial<TrpgHandout>) {
    setForm((f) => ({
      ...f,
      handouts: (f.handouts ?? []).map((h) => (h.id === id ? { ...h, ...patch } : h)),
    }));
  }

  function removeHandout(id: string) {
    setForm((f) => ({ ...f, handouts: (f.handouts ?? []).filter((h) => h.id !== id) }));
  }

  const formBody = (
    <div ref={formRef} className="trpg-edit-shell">
      <div className="trpg-edit-shell__tabs" role="tablist" aria-label="시나리오 수정 탭">
        {TRPG_EDIT_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`trpg-edit-shell__tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="trpg-edit-shell__body lh-scroll">
        {tab === 'basic' ? (
          <>
            <AccordionSection title="시나리오 정보" defaultOpen>
              <div className="trpg-edit-field">
                <label className="form-label">제목</label>
                <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="trpg-edit-field">
                <label className="form-label">부제</label>
                <input
                  className="form-input"
                  value={form.subtitle || ''}
                  placeholder="부제를 입력합니다."
                  onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                />
              </div>
              <div className="trpg-edit-row col2">
                <div className="trpg-edit-field">
                  <label className="form-label">제목 글꼴</label>
                  <select
                    className="form-input"
                    value={form.titleFont || 'default'}
                    onChange={(e) => setForm({ ...form, titleFont: e.target.value as TrpgScenario['titleFont'] })}
                  >
                    {TRPG_FONT_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="trpg-edit-field">
                  <label className="form-label">부제 글꼴</label>
                  <select
                    className="form-input"
                    value={form.subtitleFont || 'default'}
                    onChange={(e) => setForm({ ...form, subtitleFont: e.target.value as TrpgScenario['subtitleFont'] })}
                  >
                    {TRPG_FONT_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </AccordionSection>

            <AccordionSection title="썸네일 · 호버 카드" defaultOpen>
              <div className="trpg-edit-thumb-block">
                <FileUploadField
                  label="썸네일 이미지"
                  accept="image"
                  value={form.thumbnail || ''}
                  folder="site/trpg"
                  onChange={(thumbnail) => setForm((prev) => ({ ...prev, thumbnail }))}
                />
                <FileUploadField
                  label="호버 초상 (오른쪽 · 비우면 연결 OC·탐사자)"
                  accept="image"
                  value={form.cardHoverImg || ''}
                  folder="site/trpg/hover"
                  onChange={(cardHoverImg) => setForm((prev) => ({ ...prev, cardHoverImg }))}
                />
                <div className="trpg-edit-row col2" style={{ marginTop: 10 }}>
                  <TextAreaField
                    label="호버 제목 (Enter 줄바꿈 · 비우면 시나리오 제목)"
                    rows={2}
                    value={form.cardHoverTitle || ''}
                    placeholder={form.title || '호버에 표시할 제목'}
                    onChange={(cardHoverTitle) => setForm({ ...form, cardHoverTitle })}
                  />
                  <div className="trpg-edit-field">
                    <label className="form-label">호버 PC 이름</label>
                    <input
                      className="form-input"
                      value={form.cardHoverPcName || ''}
                      placeholder="비우면 연결 OC / 탐사자"
                      onChange={(e) => setForm({ ...form, cardHoverPcName: e.target.value })}
                    />
                  </div>
                </div>
                {form.thumbnail ? (
                  <div className="trpg-edit-thumb-editor">
                    <TrpgThumbnailEditor
                      src={form.thumbnail}
                      frame={form.thumbnailFrame}
                      onChange={(thumbnailFrame) => setForm((prev) => ({ ...prev, thumbnailFrame }))}
                      aspectRatio={listSettings.cardAspect || DEFAULT_TRPG_LIST_SETTINGS.cardAspect}
                      hoverImg={form.cardHoverImg}
                      hoverFrame={form.cardHoverImgFrame}
                      onHoverFrameChange={(cardHoverImgFrame) =>
                        setForm((prev) => ({
                          ...prev,
                          cardHoverImgFrame,
                          cardHoverImgFit: 'contain',
                          cardHoverImgPos: prev.cardHoverImgPos || 'right bottom',
                        }))
                      }
                      preview={{
                        id: form.id,
                        title: form.title,
                        author: form.author,
                        kp: form.kp,
                        system: form.system,
                        dateStart: form.dateStart,
                        dateEnd: form.dateEnd,
                        players: form.players,
                        cleared: form.cleared,
                        playerProfiles: form.playerProfiles,
                        characterIds: form.characterIds,
                        cardHoverTitle: form.cardHoverTitle,
                        cardHoverPcName: form.cardHoverPcName,
                        cardHoverImg: form.cardHoverImg,
                        cardHoverImgFrame: form.cardHoverImgFrame,
                        cardHoverImgFit: 'contain',
                        cardHoverImgPos: form.cardHoverImgPos || 'right bottom',
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </AccordionSection>

            <AccordionSection title="카드 편집" defaultOpen>
              <TextAreaField
                label="플레이 후기"
                rows={5}
                value={form.review || ''}
                placeholder="티켓 Overview에 표시될 후기"
                onChange={(review) => setForm({ ...form, review })}
              />
              <div className="trpg-edit-field">
                <label className="form-label">세션 바로가기 URL</label>
                <input
                  className="form-input"
                  placeholder="코코포리아·배포 원본 링크"
                  value={form.sessionUrl || ''}
                  onChange={(e) => setForm({ ...form, sessionUrl: e.target.value })}
                />
              </div>
              <FileUploadField
                label="페이지 배경 이미지"
                accept="image"
                value={
                  form.pageBackground?.startsWith('http') || form.pageBackground?.startsWith('/')
                    ? form.pageBackground
                    : ''
                }
                folder="site/trpg/bg"
                onChange={(pageBackground) => setForm({ ...form, pageBackground })}
              />
              <div className="trpg-edit-field">
                <label className="form-label">배경 (CSS 색·그라데이션·URL)</label>
                <input
                  className="form-input"
                  placeholder="#0a0a0a 또는 linear-gradient(...) 또는 이미지 URL"
                  value={form.pageBackground || ''}
                  onChange={(e) => setForm({ ...form, pageBackground: e.target.value })}
                />
              </div>
              <div className="trpg-edit-row col2">
                <div className="trpg-edit-field">
                  <label className="form-label">시나리오 BGM 제목</label>
                  <input
                    className="form-input"
                    value={form.pageBgm?.title || ''}
                    onChange={(e) => setForm({ ...form, pageBgm: { ...form.pageBgm, title: e.target.value } })}
                  />
                </div>
                <div className="trpg-edit-field">
                  <label className="form-label">아티스트</label>
                  <input
                    className="form-input"
                    value={form.pageBgm?.artist || ''}
                    onChange={(e) => setForm({ ...form, pageBgm: { ...form.pageBgm, artist: e.target.value } })}
                  />
                </div>
              </div>
              <FileUploadField
                label="BGM 파일"
                accept="audio"
                value={form.pageBgm?.fileUrl || form.pageBgm?.url || ''}
                folder="site/trpg/bgm"
                onChange={(fileUrl) => {
                  const pageBgm = { ...form.pageBgm, fileUrl, url: fileUrl };
                  const next = { ...form, pageBgm };
                  setForm(next);
                  onPersist?.(next);
                }}
              />
            </AccordionSection>
          </>
        ) : null}

        {tab === 'session' ? (
          <>
            <AccordionSection title="참여 정보" defaultOpen>
              <div className="trpg-edit-row col2">
                <div className="trpg-edit-field">
                  <label className="form-label">멤버 (W.)</label>
                  <input
                    className="form-input"
                    value={form.author || ''}
                    placeholder="예: sio, akutagawa"
                    onChange={(e) => setForm({ ...form, author: e.target.value })}
                  />
                </div>
                <div className="trpg-edit-field">
                  <label className="form-label">KP</label>
                  <input
                    className="form-input"
                    value={form.kp || ''}
                    placeholder="예: tomato"
                    onChange={(e) => setForm({ ...form, kp: e.target.value })}
                  />
                </div>
              </div>
              <div className="trpg-edit-field">
                <label className="form-label">시스템</label>
                <input
                  className="form-input"
                  value={form.system || ''}
                  placeholder="CoC, inSANe 등"
                  onChange={(e) => setForm({ ...form, system: e.target.value })}
                />
              </div>
              <div className="trpg-edit-field">
                <label className="form-label">리스트 카테고리</label>
                <select
                  className="form-input"
                  value={form.categoryId || ''}
                  onChange={(e) => {
                    const categoryId = e.target.value || undefined;
                    const cat = listSettings.categories.find((c) => c.id === categoryId);
                    setForm({
                      ...form,
                      categoryId,
                      system: form.system?.trim() ? form.system : cat?.label || form.system,
                    });
                  }}
                >
                  <option value="">(시스템 문자열로 자동 매칭)</option>
                  {listSettings.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="trpg-edit-row col2">
                <div className="trpg-edit-field">
                  <label className="form-label">플레이 시작일</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.dateStart || ''}
                    onChange={(e) => setForm({ ...form, dateStart: e.target.value })}
                  />
                </div>
                <div className="trpg-edit-field">
                  <label className="form-label">플레이 종료일</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.dateEnd || ''}
                    onChange={(e) => setForm({ ...form, dateEnd: e.target.value })}
                  />
                </div>
              </div>
              <TextAreaField
                label="플레이어 / HO 요약"
                rows={2}
                value={form.players || ''}
                placeholder="PL 카논"
                onChange={(players) => setForm({ ...form, players })}
              />
            </AccordionSection>

            <AccordionSection title="TRPG 연관 바로가기" defaultOpen>
              <FieldLabel>OC를 선택해 추가하면 해당 캐릭터 상세에 이 시나리오가 연관 바로가기로 표시됩니다.</FieldLabel>
              <LinkPickList
                options={characters.map((c) => ({ id: String(c.id), label: c.name }))}
                selectedIds={[...(form.characterIds ?? [])].map(String)}
                onChange={(ids) => setForm({ ...form, characterIds: ids })}
                emptyLabel="연결된 OC가 없습니다."
                selectPlaceholder="OC 선택해서 추가…"
              />
              <LakeToggle
                checked={!!form.cleared}
                onChange={(cleared) => setForm({ ...form, cleared })}
                label="CLEARED 스탬프 표시"
              />
              <SecretPostFields value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
            </AccordionSection>
          </>
        ) : null}

        {tab === 'investigators' ? (
          <TrpgInvestigatorInlineTab
            players={form.playerProfiles ?? []}
            relationships={form.relationships ?? []}
            relationshipNotes={form.relationshipNotes ?? ''}
            uploading={uploading}
            onUploadStart={onUploadStart}
            onUploadEnd={onUploadEnd}
            onChangePlayers={(playerProfiles) => setForm({ ...form, playerProfiles })}
            onChangeRelationships={(relationships) => setForm({ ...form, relationships })}
            onChangeRelationshipNotes={(relationshipNotes) => setForm({ ...form, relationshipNotes })}
          />
        ) : null}

        {tab === 'logs' ? (
          <>
            <RepeatableList addLabel="+ 로그 추가" onAdd={addLog}>
              {(form.logs ?? []).map((log, index) => (
                <AccordionSection
                  key={log.id}
                  title={
                    <>
                      {log.title || '세션 로그'}
                      {log.html ? <em className="trpg-edit-log-html-badge"> HTML</em> : null}
                    </>
                  }
                  defaultOpen={index === 0}
                >
                  <div className="trpg-edit-card-item__head" style={{ marginBottom: 0, padding: 0, border: 0 }}>
                    <span />
                    <button type="button" className="trpg-edit-mini-del" onClick={() => void removeLog(log.id)}>
                      ✕
                    </button>
                  </div>
                  <div className="trpg-edit-row col2">
                    <div className="trpg-edit-field">
                      <label className="form-label">제목</label>
                      <input
                        className="form-input"
                        placeholder="제목"
                        value={log.title}
                        onChange={(e) => updateLog(log.id, { title: e.target.value })}
                      />
                    </div>
                    <div className="trpg-edit-field">
                      <label className="form-label">부제 (●●●●)</label>
                      <input
                        className="form-input"
                        placeholder="부제 (캠페인)"
                        value={log.subtitle || ''}
                        onChange={(e) => updateLog(log.id, { subtitle: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="trpg-edit-row col2">
                    <div className="trpg-edit-field">
                      <label className="form-label">날짜</label>
                      <input
                        className="form-input"
                        type="date"
                        value={log.date || ''}
                        onChange={(e) => updateLog(log.id, { date: e.target.value })}
                      />
                    </div>
                    <div className="trpg-edit-field">
                      <label className="form-label">태그</label>
                      <input
                        className="form-input"
                        placeholder="태그 (쉼표 구분)"
                        value={(log.tags ?? []).join(', ')}
                        onChange={(e) =>
                          updateLog(log.id, {
                            tags: e.target.value
                              .split(',')
                              .map((t) => t.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </div>
                  </div>
                  <FileUploadField
                    label="배너 이미지"
                    accept="image"
                    value={log.thumbnail || ''}
                    folder="site/trpg/logs"
                    onChange={(thumbnail) => updateLog(log.id, { thumbnail })}
                  />
                  <SliderField
                    label="글자 크기 (px)"
                    min={10}
                    max={24}
                    step={1}
                    value={log.logFontSize ?? 12}
                    displayValue={`${log.logFontSize ?? 12}px`}
                    onChange={(logFontSize) => updateLog(log.id, { logFontSize })}
                  />
                  <SliderField
                    label="줄간격"
                    min={1}
                    max={3}
                    step={0.05}
                    value={log.logLineHeight ?? 1.72}
                    displayValue={String(log.logLineHeight ?? 1.72)}
                    onChange={(logLineHeight) => updateLog(log.id, { logLineHeight })}
                  />
                  <TextAreaField
                    label="본문"
                    rows={6}
                    placeholder="세션 로그 본문..."
                    value={log.body}
                    onChange={(body) => updateLog(log.id, { body })}
                  />
                  <div className="trpg-edit-field">
                    <label className="form-label">HTML 로그 파일</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <label className="btn-edit" style={{ cursor: 'pointer', margin: 0 }}>
                        파일 선택
                        <input
                          type="file"
                          accept=".html,.htm,text/html,application/xhtml+xml"
                          hidden
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void attachLogHtml(log.id, file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {log.html ? (
                        <button type="button" className="btn-del" onClick={() => updateLog(log.id, { html: undefined })}>
                          HTML 제거
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {(form.playerProfiles ?? []).length > 0 ? (
                    <div className="trpg-edit-field">
                      <label className="form-label">참여 탐사자</label>
                      <div className="lake-toggle-row">
                        {(form.playerProfiles ?? []).map((p) => (
                          <LakeToggle
                            key={p.id}
                            checked={(log.playerIds ?? []).includes(p.id)}
                            onChange={(checked) => {
                              const ids = new Set(log.playerIds ?? []);
                              if (checked) ids.add(p.id);
                              else ids.delete(p.id);
                              updateLog(log.id, { playerIds: [...ids] });
                            }}
                            label={p.name}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <SecretPostFields value={log} onChange={(patch) => updateLog(log.id, patch)} />
                </AccordionSection>
              ))}
            </RepeatableList>

            <AccordionSection title="HTML 불러오기" defaultOpen={false}>
              <FieldLabel>코코포리아 등에서 보낸 HTML을 새 로그로 추가합니다. 저장 버튼을 눌러야 반영됩니다.</FieldLabel>
              <TextAreaField
                label="HTML 붙여넣기"
                rows={4}
                placeholder="HTML 코드를 직접 붙여넣을 수 있습니다."
                value={htmlPaste}
                onChange={setHtmlPaste}
                className="trpg-edit-html-paste"
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                <button
                  type="button"
                  className="btn-edit"
                  onClick={() => {
                    if (!htmlPaste.trim()) return;
                    try {
                      const parsed = parseLogHtmlString(htmlPaste.trim());
                      const log: TrpgSessionLog = {
                        id: newId(),
                        title: parsed.title,
                        date: new Date().toISOString().slice(0, 10),
                        body: parsed.body,
                        html: parsed.html,
                      };
                      setForm((f) => ({ ...f, logs: [...(f.logs ?? []), log] }));
                      setHtmlPaste('');
                    } catch (err) {
                      alert(err instanceof Error ? err.message : 'HTML 로그 붙여넣기 실패');
                    }
                  }}
                >
                  붙여넣기 적용
                </button>
                <label className="btn-edit" style={{ cursor: 'pointer', margin: 0 }}>
                  HTML 파일 추가
                  <input
                    type="file"
                    accept=".html,.htm,text/html,application/xhtml+xml"
                    multiple
                    hidden
                    onChange={(e) => {
                      const files = e.target.files ? [...e.target.files] : [];
                      if (files.length) void importLogHtmlFiles(files);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </AccordionSection>
          </>
        ) : null}

        {tab === 'gallery' ? (
          <RepeatableList addLabel="+ 갤러리 박스 추가" onAdd={addGalleryItem}>
            {(form.gallery ?? []).map((g, index) => {
              const images = galleryImageList(g);
              const galleryCount = form.gallery?.length ?? 0;
              const filledCount = images.filter((u) => u.trim()).length;
              return (
                <AccordionSection
                  key={g.id}
                  title={`${g.title || `갤러리 ${index + 1}`} · 사진 ${filledCount || images.length}장`}
                  defaultOpen={images.length <= 1}
                >
                  <div className="trpg-edit-card-item__head" style={{ marginBottom: 0, padding: 0, border: 0 }}>
                    <span />
                    <div className="trpg-edit-order">
                      <button
                        type="button"
                        className="trpg-edit-order__btn"
                        aria-label="박스 위로"
                        disabled={index === 0}
                        onClick={() => moveGalleryItem(g.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="trpg-edit-order__btn"
                        aria-label="박스 아래로"
                        disabled={index >= galleryCount - 1}
                        onClick={() => moveGalleryItem(g.id, 1)}
                      >
                        ↓
                      </button>
                      <button type="button" className="trpg-edit-mini-del" onClick={() => removeGallery(g.id)}>
                        ✕
                      </button>
                    </div>
                  </div>
                  <RepeatableList
                    addLabel="+ 사진 추가"
                    onAdd={() => setGalleryImages(g.id, [...images, ''])}
                  >
                    {images.map((url, imgIndex) => (
                      <div key={`${g.id}-${imgIndex}`} className="trpg-edit-gallery-imgs__row">
                        <FileUploadField
                          label={images.length > 1 ? `사진 ${imgIndex + 1}` : '사진'}
                          accept="image"
                          value={url}
                          folder="site/trpg/gallery"
                          onChange={(img) => {
                            const next = [...images];
                            next[imgIndex] = img;
                            setGalleryImages(g.id, next);
                          }}
                        />
                        <div className="trpg-edit-order">
                          {images.length > 1 ? (
                            <>
                              <button
                                type="button"
                                className="trpg-edit-order__btn"
                                aria-label="사진 위로"
                                disabled={imgIndex === 0}
                                onClick={() => moveGalleryImage(g.id, imgIndex, -1)}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="trpg-edit-order__btn"
                                aria-label="사진 아래로"
                                disabled={imgIndex >= images.length - 1}
                                onClick={() => moveGalleryImage(g.id, imgIndex, 1)}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className="trpg-edit-mini-del"
                                aria-label="이 사진 삭제"
                                onClick={() => {
                                  const next = images.filter((_, i) => i !== imgIndex);
                                  setGalleryImages(g.id, next.length ? next : ['']);
                                }}
                              >
                                ✕
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </RepeatableList>
                  <div className="trpg-edit-row col2">
                    <div className="trpg-edit-field">
                      <label className="form-label">제목</label>
                      <input
                        className="form-input"
                        placeholder="제목"
                        value={g.title || ''}
                        onChange={(e) => updateGallery(g.id, { title: e.target.value })}
                      />
                    </div>
                    <div className="trpg-edit-field">
                      <label className="form-label">작가/출처</label>
                      <GalleryCreditInput
                        value={g.artist || ''}
                        onChange={(artist) => updateGallery(g.id, { artist })}
                      />
                    </div>
                  </div>
                  <div className="trpg-edit-field">
                    <label className="form-label">캡션 (선택)</label>
                    <input
                      className="form-input"
                      placeholder="이미지 설명"
                      value={g.caption || ''}
                      onChange={(e) => updateGallery(g.id, { caption: e.target.value })}
                    />
                  </div>
                  {images.filter((u) => u.trim()).length > 1 || images.length > 1 ? (
                    <div className="trpg-edit-field">
                      <label className="form-label">복수 이미지 보기</label>
                      <div className="trpg-edit-seg" role="group" aria-label="복수 이미지 보기 방식">
                        <button
                          type="button"
                          className={g.viewMode !== 'scroll' ? 'is-on' : undefined}
                          onClick={() => updateGallery(g.id, { viewMode: 'slider' })}
                        >
                          화살표로 넘기기
                        </button>
                        <button
                          type="button"
                          className={g.viewMode === 'scroll' ? 'is-on' : undefined}
                          onClick={() => updateGallery(g.id, { viewMode: 'scroll' })}
                        >
                          스크롤로 보기
                        </button>
                      </div>
                    </div>
                  ) : null}
                </AccordionSection>
              );
            })}
          </RepeatableList>
        ) : null}

        {tab === 'dice' ? (
          <RepeatableList addLabel="+ 판정 추가" onAdd={addDiceHighlight}>
            {(form.diceHighlights ?? []).map((d, index) => (
              <div key={d.id} className="trpg-edit-card-item">
                <div className="trpg-edit-card-item__head">
                  <span className="trpg-edit-card-item__label">{d.title || `판정 ${index + 1}`}</span>
                  <button type="button" className="trpg-edit-mini-del" onClick={() => removeDiceHighlight(d.id)}>
                    ✕
                  </button>
                </div>
                <div className="trpg-edit-row col2">
                  <div className="trpg-edit-field">
                    <label className="form-label">항목</label>
                    <input
                      className="form-input"
                      placeholder="회피"
                      value={d.title}
                      onChange={(e) => updateDiceHighlight(d.id, { title: e.target.value })}
                    />
                  </div>
                  <div className="trpg-edit-field">
                    <label className="form-label">결과</label>
                    <input
                      className="form-input"
                      placeholder="성공 / 실패"
                      value={d.result || ''}
                      onChange={(e) => updateDiceHighlight(d.id, { result: e.target.value })}
                    />
                  </div>
                </div>
                <div className="trpg-edit-row col2">
                  <div className="trpg-edit-field">
                    <label className="form-label">주사위</label>
                    <input
                      className="form-input"
                      placeholder="1d100 ≤ 50"
                      value={d.roll || ''}
                      onChange={(e) => updateDiceHighlight(d.id, { roll: e.target.value })}
                    />
                  </div>
                  <div className="trpg-edit-field">
                    <label className="form-label">세션</label>
                    <input
                      className="form-input"
                      placeholder="2회차"
                      value={d.session || ''}
                      onChange={(e) => updateDiceHighlight(d.id, { session: e.target.value })}
                    />
                  </div>
                </div>
                <TextAreaField
                  label="메모"
                  rows={2}
                  placeholder="메모"
                  value={d.note || ''}
                  onChange={(note) => updateDiceHighlight(d.id, { note })}
                />
              </div>
            ))}
          </RepeatableList>
        ) : null}

        {tab === 'handouts' ? (
          <RepeatableList addLabel="+ 핸드아웃 추가" onAdd={addHandout}>
            {(form.handouts ?? []).map((h, index) => (
              <div key={h.id} className="trpg-edit-card-item">
                <div className="trpg-edit-card-item__head">
                  <span className="trpg-edit-card-item__label">{h.title || `핸드아웃 ${index + 1}`}</span>
                  <button type="button" className="trpg-edit-mini-del" onClick={() => removeHandout(h.id)}>
                    ✕
                  </button>
                </div>
                <FileUploadField
                  label="이미지 / 파일"
                  accept="image"
                  value={h.img || ''}
                  folder="site/trpg/handouts"
                  onChange={(img) => updateHandout(h.id, { img })}
                />
                <div className="trpg-edit-field">
                  <label className="form-label">제목</label>
                  <input
                    className="form-input"
                    placeholder="핸드아웃 제목"
                    value={h.title}
                    onChange={(e) => updateHandout(h.id, { title: e.target.value })}
                  />
                </div>
                <TextAreaField
                  label="본문"
                  rows={3}
                  placeholder="본문"
                  value={h.body || ''}
                  onChange={(body) => updateHandout(h.id, { body })}
                />
                <LakeToggle
                  checked={!!h.spoiler}
                  onChange={(spoiler) => updateHandout(h.id, { spoiler })}
                  label="스포일러 (탭하여 공개)"
                />
              </div>
            ))}
          </RepeatableList>
        ) : null}

        {tab === 'vn' ? (
          <>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">「비주얼 노벨로 보기」 버튼 색</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(form.vnPlayBtnColor || '') ? form.vnPlayBtnColor! : '#d7a982'}
                  onChange={(e) => setForm({ ...form, vnPlayBtnColor: e.target.value })}
                  aria-label="VN 보기 버튼 색"
                />
                <input
                  className="form-input"
                  style={{ maxWidth: 120 }}
                  value={form.vnPlayBtnColor || '#d7a982'}
                  onChange={(e) => setForm({ ...form, vnPlayBtnColor: e.target.value })}
                  placeholder="#d7a982"
                />
                <button
                  type="button"
                  className="lh-dialogue-editor__tool"
                  onClick={() => setForm({ ...form, vnPlayBtnColor: undefined })}
                >
                  기본값
                </button>
              </div>
              <p className="lh-dialogue-editor__hint" style={{ margin: '6px 0 0' }}>
                시나리오 상세의 VN 보기 버튼 액센트 색입니다.
              </p>
            </div>
            <ScenarioVnEditor
              ref={vnEditorRef}
              scenarioId={form.id}
              scenarioTitle={form.title || '시나리오'}
              initial={
                form.vnEditable ??
                (form.vnScene
                  ? {
                      speakers: form.vnScene.speakers,
                      lines: form.vnScene.lines,
                      backgrounds: form.vnScene.backgrounds,
                      bgms: form.vnScene.bgms,
                      ambients: form.vnScene.ambients,
                      handouts: form.vnScene.handouts,
                      diceSfxList: form.vnScene.diceSfxList,
                      diceRollSfx: form.vnScene.diceRollSfx,
                      diceResultSfx: form.vnScene.diceResultSfx,
                      diceResultSfxByTone: form.vnScene.diceResultSfxByTone,
                      maxOnStage: form.vnScene.maxOnStage,
                      menuTheme: form.vnScene.menuTheme,
                      chapterLoading: form.vnScene.chapterLoading,
                    }
                  : null)
              }
              uploadBusy={uploading}
              onUploadSprite={async (speakerKey, file) => {
                onUploadStart();
                try {
                  return await uploadImageFile(file, `site/trpg/vn/${form.id}/${speakerKey}`);
                } finally {
                  onUploadEnd();
                }
              }}
              onUploadBackground={async (backgroundKey, file) => {
                onUploadStart();
                try {
                  return await uploadImageFile(file, `site/trpg/vn/${form.id}/bg/${backgroundKey}`);
                } finally {
                  onUploadEnd();
                }
              }}
              onUploadBgm={async (bgmKey, file) => {
                onUploadStart();
                try {
                  return await uploadMediaFile(file, `site/trpg/vn/${form.id}/bgm/${bgmKey}`);
                } finally {
                  onUploadEnd();
                }
              }}
              onUploadAmbient={async (ambientKey, file) => {
                onUploadStart();
                try {
                  return await uploadMediaFile(file, `site/trpg/vn/${form.id}/ambient/${ambientKey}`);
                } finally {
                  onUploadEnd();
                }
              }}
              onUploadDiceSfx={async (diceSfxKey, file) => {
                onUploadStart();
                try {
                  return await uploadMediaFile(file, `site/trpg/vn/${form.id}/dice-sfx/${diceSfxKey}`);
                } finally {
                  onUploadEnd();
                }
              }}
              onUploadHandout={async (handoutKey, file) => {
                onUploadStart();
                try {
                  return await uploadImageFile(file, `site/trpg/vn/${form.id}/handout/${handoutKey}`);
                } finally {
                  onUploadEnd();
                }
              }}
              onUploadTutorialGif={async (stepId, file) => {
                onUploadStart();
                try {
                  return await uploadImageFile(file, `site/trpg/vn/${form.id}/tutorial/${stepId}`);
                } finally {
                  onUploadEnd();
                }
              }}
              onUploadExpression={async (lineId, file) => {
                onUploadStart();
                try {
                  return await uploadImageFile(file, `site/trpg/vn/${form.id}/expr/${lineId}`);
                } finally {
                  onUploadEnd();
                }
              }}
              onUploadVoice={async (lineId, file) => {
                onUploadStart();
                try {
                  return await uploadMediaFile(file, `site/trpg/vn/${form.id}/voice/${lineId}`);
                } finally {
                  onUploadEnd();
                }
              }}
              onUploadSfx={async (lineId, file) => {
                onUploadStart();
                try {
                  return await uploadMediaFile(file, `site/trpg/vn/${form.id}/sfx/${lineId}`);
                } finally {
                  onUploadEnd();
                }
              }}
              onDraftChange={(editable, vnScene) => {
                setForm((f) => ({ ...f, vnEditable: editable, vnScene }));
              }}
              onSave={async (editable, vnScene) => {
                const next = { ...formStateRef.current, vnEditable: editable, vnScene };
                setForm(next);
                if (onPersist) onPersist(next);
                else onSave(next);
              }}
            />
          </>
        ) : null}
      </div>
    </div>
  );

  if (embed) return formBody;

  return (
    <AdminPanelShell title="시나리오 편집" onSave={() => onSave(form)} onDelete={onDelete}>
      {formBody}
    </AdminPanelShell>
  );
}

type UniverseProps = {
  items: UniverseCard[];
  onSave: (next: UniverseCard[]) => Promise<void>;
};

export function UniverseAdminPanel({ items, onSave }: UniverseProps) {
  const { confirm } = useLakeDialog();
  const { showSaveToast, showDeleteToast } = useSaveToast();
  const [editId, setEditId] = useState<string | null>(null);
  const selected = items.find((i) => i.id === editId);

  async function persist(next: UniverseCard[], toast: ToastAction = false) {
    await onSave(next);
    if (toast === 'save') showSaveToast();
    if (toast === 'delete') showDeleteToast();
  }

  function addCard() {
    const card: UniverseCard = {
      id: newId(),
      name: '새 세계관',
      sub: '',
      icon: '✦',
      href: '',
      comingSoon: false,
    };
    void persist([...items, card], 'save');
    setEditId(card.id);
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.75rem' }}>
        <span style={{ fontSize: 12, color: 'var(--lake-copper-soft, var(--pink))' }}>Universe — 세계관 카드</span>
        <button type="button" className="btn-save" onClick={addCard}>
          + 카드 추가
        </button>
      </div>
      <div className="lh-admin-grid">
        <div>
          {items.map((item) => (
            <AdminListItem
              key={item.id}
              title={item.name}
              subtitle={
                item.comingSoon
                  ? 'Coming Soon'
                  : item.href === '/verse/gate'
                    ? '게이트 · /verse/gate'
                    : item.href || '링크 없음'
              }
              selected={editId === item.id}
              onClick={() => setEditId(item.id)}
            />
          ))}
        </div>
        <div className="lh-oc-admin-block">
          {selected ? (
            <UniverseEditForm
              key={selected.id}
              card={selected}
              onSave={(card) => persist(items.map((i) => (i.id === card.id ? card : i)))}
              onDelete={async () => {
                if (!(await confirm('이 카드를 삭제할까요?'))) return;
                await persist(items.filter((i) => i.id !== selected.id), 'delete');
                setEditId(null);
              }}
            />
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>카드를 선택하세요.</span>
          )}
        </div>
      </div>
    </>
  );
}

function UniverseEditForm({
  card,
  onSave,
  onDelete,
}: {
  card: UniverseCard;
  onSave: (c: UniverseCard) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState(card);
  const [linkMode, setLinkMode] = useState<'none' | 'kisaragi-gate' | 'custom'>(() => {
    if (card.href === '/verse/gate') return 'kisaragi-gate';
    if ((card.href || '').trim()) return 'custom';
    return 'none';
  });

  return (
    <AdminPanelShell
      title="세계관 카드"
      onSave={() => {
        const hex = (form.glowColor || form.veilColor || '').trim();
        const normalized =
          /^#?[0-9a-fA-F]{6}$/.test(hex) ? (hex.startsWith('#') ? hex : `#${hex}`) : '#d7a982';
        onSave({
          ...form,
          glowColor: normalized,
          glowOpacity: Math.min(100, Math.max(0, form.glowOpacity ?? form.veilOpacity ?? 28)),
          veilColor: undefined,
          veilOpacity: undefined,
        });
      }}
      onDelete={onDelete}
    >
      <div className="lh-oc-admin-grid">
        <div className="form-group">
          <label className="form-label">이름</label>
          <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">아이콘 (이미지 없을 때)</label>
          <input className="form-input" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">부제</label>
        <input className="form-input" value={form.sub} onChange={(e) => setForm({ ...form, sub: e.target.value })} />
      </div>

      <div className="trpg-edit-section" style={{ marginTop: '0.75rem' }}>
        <div className="trpg-edit-section__title">입장 연결</div>
        <div className="trpg-edit-field">
          <label>대상</label>
          <select
            className="form-input"
            value={linkMode}
            onChange={(e) => {
              const v = e.target.value as 'none' | 'kisaragi-gate' | 'custom';
              setLinkMode(v);
              if (v === 'kisaragi-gate') {
                setForm({
                  ...form,
                  href: '/verse/gate',
                  comingSoon: false,
                  name: form.name?.trim() ? form.name : '키사라기고교',
                  sub: form.sub?.trim() ? form.sub : '如月高校 — Kisaragi High School',
                  icon: form.icon?.trim() ? form.icon : '如',
                });
                return;
              }
              if (v === 'none') {
                setForm({ ...form, href: '' });
                return;
              }
              setForm({
                ...form,
                href: form.href === '/verse/gate' ? '' : form.href,
              });
            }}
          >
            <option value="none">없음 (링크 비움)</option>
            <option value="kisaragi-gate">키사라기고교 게이트 (/verse/gate)</option>
            <option value="custom">직접 입력</option>
          </select>
        </div>
        {linkMode === 'kisaragi-gate' ? (
          <div className="trpg-edit-field">
            <label>링크 URL</label>
            <input className="form-input" value="/verse/gate" readOnly />
          </div>
        ) : linkMode === 'custom' ? (
          <div className="trpg-edit-field">
            <label>링크 URL</label>
            <input
              className="form-input"
              placeholder="/path 또는 https://…"
              value={form.href}
              onChange={(e) => setForm({ ...form, href: e.target.value })}
            />
          </div>
        ) : null}
      </div>

      <LakeToggle
        checked={!!form.comingSoon}
        onChange={(comingSoon) => setForm({ ...form, comingSoon })}
        label="준비중 / Coming Soon (링크 비활성)"
      />

      <div className="form-group" style={{ marginTop: '1rem' }}>
        <label className="form-label">카드 썸네일</label>
        <ImageFileField
          value={form.img || ''}
          folder="site/universe"
          onChange={(img) => setForm({ ...form, img })}
        />
      </div>
      {form.img ? (
        <div className="lh-oc-admin-grid">
          <div className="form-group">
            <label className="form-label">맞춤 (fit)</label>
            <select
              className="form-input"
              value={form.imgFit || 'cover'}
              onChange={(e) =>
                setForm({ ...form, imgFit: e.target.value as 'cover' | 'contain' })
              }
            >
              <option value="cover">cover</option>
              <option value="contain">contain</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">위치 (object-position)</label>
            <input
              className="form-input"
              placeholder="center / right bottom"
              value={form.imgPos || ''}
              onChange={(e) => setForm({ ...form, imgPos: e.target.value })}
            />
          </div>
        </div>
      ) : null}

      <div className="trpg-edit-section" style={{ marginTop: '1.1rem' }}>
        <div className="trpg-edit-section__title">펼침 액센트 그라데이션</div>
        <div className="trpg-edit-row col2">
          <div className="trpg-edit-field">
            <label>색</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="color"
                value={
                  /^#[0-9a-fA-F]{6}$/.test(form.glowColor || form.veilColor || '')
                    ? (form.glowColor || form.veilColor)!
                    : '#d7a982'
                }
                onChange={(e) => setForm({ ...form, glowColor: e.target.value })}
                style={{
                  width: 42,
                  height: 32,
                  padding: 0,
                  border: '1px solid rgba(215,169,130,.28)',
                  background: 'transparent',
                }}
              />
              <input
                className="form-input"
                value={form.glowColor || form.veilColor || '#d7a982'}
                placeholder="#d7a982"
                onChange={(e) => setForm({ ...form, glowColor: e.target.value })}
              />
            </div>
          </div>
          <div className="trpg-edit-field">
            <label>
              불투명도 ({Math.min(100, Math.max(0, form.glowOpacity ?? form.veilOpacity ?? 28))}%)
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={form.glowOpacity ?? form.veilOpacity ?? 28}
              onChange={(e) => setForm({ ...form, glowOpacity: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </div>

      <div className="trpg-edit-section" style={{ marginTop: '1.25rem' }}>
        <div className="trpg-edit-section__title">입장 BGM</div>
        <div className="trpg-edit-row col2">
          <div className="trpg-edit-field">
            <label>곡 제목</label>
            <input
              className="form-input"
              value={form.entryBgm?.title || ''}
              onChange={(e) =>
                setForm({ ...form, entryBgm: { ...form.entryBgm, title: e.target.value } })
              }
            />
          </div>
          <div className="trpg-edit-field">
            <label>아티스트</label>
            <input
              className="form-input"
              value={form.entryBgm?.artist || ''}
              onChange={(e) =>
                setForm({ ...form, entryBgm: { ...form.entryBgm, artist: e.target.value } })
              }
            />
          </div>
        </div>
        <div className="trpg-edit-field">
          <AudioFileField
            label="BGM 파일"
            value={form.entryBgm?.fileUrl || form.entryBgm?.url || ''}
            folder="site/universe/bgm"
            onChange={(fileUrl) => {
              const entryBgm = { ...form.entryBgm, fileUrl, url: fileUrl };
              setForm({ ...form, entryBgm });
            }}
          />
        </div>
      </div>
    </AdminPanelShell>
  );
}

type GalleryProps = {
  items: GalleryItem[];
  onSave: (next: GalleryItem[]) => Promise<void>;
};

export function GalleryAdminPanel({ items, onSave }: GalleryProps) {
  return (
    <MediaListAdminPanel
      title="Records · Gallery"
      items={items}
      onSave={onSave}
      createItem={() => ({ id: newId(), title: '', img: '', caption: '', date: new Date().toISOString().slice(0, 10) })}
      renderFields={(form, setForm) => (
        <>
          <div className="form-group">
            <label className="form-label">제목 (선택)</label>
            <input
              className="form-input"
              value={form.title || ''}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <ImageFileField value={form.img} folder="site/gallery" onChange={(img) => setForm({ ...form, img })} />
          <div className="form-group">
            <label className="form-label">코멘트</label>
            <textarea
              className="form-input"
              rows={3}
              value={form.caption || ''}
              onChange={(e) => setForm({ ...form, caption: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">날짜</label>
            <input
              className="form-input"
              type="date"
              value={form.date || ''}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <SecretPostFields value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
        </>
      )}
    />
  );
}

type BannerProps = {
  items: BannerItem[];
  onSave: (next: BannerItem[]) => Promise<void>;
};

export function BannerAdminPanel({ items, onSave }: BannerProps) {
  const { confirm } = useLakeDialog();
  const { showSaveToast, showDeleteToast } = useSaveToast();
  const [editId, setEditId] = useState<string | null>(null);
  const selected = items.find((i) => i.id === editId);
  const [form, setForm] = useState<BannerItem | null>(selected ?? null);

  useEffect(() => {
    setForm(selected ?? null);
  }, [selected]);

  async function persist(next: BannerItem[], toast: ToastAction = false) {
    await onSave(next);
    if (toast === 'save') showSaveToast();
    if (toast === 'delete') showDeleteToast();
  }

  function addBanner() {
    const item: BannerItem = { id: newId(), title: '새 배너', img: '', href: '', ownerName: '' };
    void persist([...items, item], 'save');
    setEditId(item.id);
    setForm(item);
  }

  function addDivider() {
    const item: BannerItem = { id: newId(), title: '구분', img: '', divider: true, dividerIcon: 'diamond' };
    void persist([...items, item], 'save');
    setEditId(item.id);
    setForm(item);
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: '.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--lake-copper-soft, var(--pink))' }}>Banner — 배너</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn-edit" onClick={addDivider}>
            + 구분 아이콘
          </button>
          <button type="button" className="btn-save" onClick={addBanner}>
            + 배너
          </button>
        </div>
      </div>
      <div className="lh-admin-grid">
        <div>
          {items.map((item) => (
            <AdminListItem
              key={item.id}
              title={item.divider ? `구분 ${item.dividerIcon || '◆'}` : item.title}
              selected={editId === item.id}
              onClick={() => setEditId(item.id)}
            />
          ))}
        </div>
        <div className="lh-oc-admin-block">
          {form && editId === form.id ? (
            <AdminPanelShell
              title={form.divider ? '구분 아이콘' : '배너 편집'}
              onSave={() => persist(items.map((i) => (i.id === form.id ? form : i)))}
              onDelete={async () => {
                if (!(await confirm('이 항목을 삭제할까요?'))) return;
                await persist(items.filter((i) => i.id !== form.id), 'delete');
                setEditId(null);
                setForm(null);
              }}
            >
              {form.divider ? (
                <div className="form-group">
                  <label className="form-label">구분 아이콘</label>
                  <div className="lh-banner-divider-pick">
                    {BANNER_DIVIDER_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`lh-banner-divider-pick__btn${form.dividerIcon === preset.id ? ' is-active' : ''}`}
                        onClick={() => setForm({ ...form, dividerIcon: preset.id })}
                        title={preset.label}
                      >
                        <BannerDividerIcon id={preset.id} />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">제목 (관리용)</label>
                    <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">링크 주인 이름 (호버 표시)</label>
                    <input
                      className="form-input"
                      value={form.ownerName || ''}
                      placeholder="예: 로나"
                      onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <FileUploadField
                      label="배너 이미지"
                      value={form.img || ''}
                      onChange={(img) => setForm({ ...form, img })}
                      accept="image"
                      asDataUrl
                      emptyLabel="📁 이미지 업로드"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">링크</label>
                    <input className="form-input" value={form.href || ''} onChange={(e) => setForm({ ...form, href: e.target.value })} />
                  </div>
                </>
              )}
            </AdminPanelShell>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>항목 선택</span>
          )}
        </div>
      </div>
    </>
  );
}

type GuestProps = {
  items: GuestEntry[];
  onSave: (next: GuestEntry[]) => Promise<void>;
};

export function GuestAdminPanel({ items, onSave }: GuestProps) {
  const { confirm } = useLakeDialog();
  const { showSaveToast, showDeleteToast } = useSaveToast();
  const [editId, setEditId] = useState<string | null>(null);
  const selected = items.find((i) => i.id === editId);

  async function persist(next: GuestEntry[], toast: ToastAction = false) {
    await onSave(next);
    if (toast === 'save') showSaveToast();
    if (toast === 'delete') showDeleteToast();
  }

  function addGuest() {
    const item: GuestEntry = {
      id: newId(),
      name: 'Guest',
      message: '',
      date: new Date().toISOString().slice(0, 10),
    };
    void persist([...items, item], 'save');
    setEditId(item.id);
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.75rem' }}>
        <span style={{ fontSize: 12, color: 'var(--lake-copper-soft, var(--pink))' }}>Guest — 방명록</span>
        <button type="button" className="btn-save" onClick={addGuest}>
          + 방명 추가
        </button>
      </div>
      <div className="lh-admin-grid">
        <div>
          {items.map((item) => (
            <AdminListItem
              key={item.id}
              title={item.name}
              subtitle={item.date}
              selected={editId === item.id}
              onClick={() => setEditId(item.id)}
            />
          ))}
        </div>
        <div className="lh-oc-admin-block">
          {selected ? (
            <GuestEditForm
              key={selected.id}
              item={selected}
              onSave={(item) => persist(items.map((i) => (i.id === item.id ? item : i)))}
              onDelete={async () => {
                if (!(await confirm('이 방명록을 삭제할까요?'))) return;
                await persist(items.filter((i) => i.id !== selected.id), 'delete');
                setEditId(null);
              }}
            />
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>방명을 선택하세요.</span>
          )}
        </div>
      </div>
    </>
  );
}

function GuestEditForm({
  item,
  onSave,
  onDelete,
}: {
  item: GuestEntry;
  onSave: (g: GuestEntry) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}) {
  const normalized = normalizeGuestEntry(item);
  const [replies, setReplies] = useState<GuestReply[]>(normalized.replies ?? []);
  const [draft, setDraft] = useState('');

  const build = (nextReplies: GuestReply[]): GuestEntry => ({
    ...normalized,
    replies: nextReplies,
    reply: undefined,
    replyDate: undefined,
  });

  function addReply() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const reply: GuestReply = {
      id: newId(),
      authorName: 'lakehouse',
      isAdmin: true,
      message: trimmed,
      date: new Date().toISOString().slice(0, 10),
    };
    const next = [...replies, reply];
    setReplies(next);
    setDraft('');
    void onSave(build(next));
  }

  function deleteReply(replyId: string) {
    const next = replies.filter((r) => r.id !== replyId);
    setReplies(next);
    void onSave(build(next));
  }

  return (
    <AdminPanelShell title="방명록 — 답변 · 삭제" onDelete={onDelete}>
      {/* 방문자 글은 읽기 전용 — 관리자는 답변/삭제만 */}
      <div className="form-group">
        <label className="form-label">작성자</label>
        <div className="form-input" style={{ opacity: 0.8 }}>{normalized.name}</div>
      </div>
      <div className="form-group">
        <label className="form-label">날짜</label>
        <div className="form-input" style={{ opacity: 0.8 }}>{normalized.date}</div>
      </div>
      <div className="form-group">
        <label className="form-label">메시지</label>
        <div className="form-input" style={{ whiteSpace: 'pre-wrap', opacity: 0.9, minHeight: 60 }}>
          {normalized.message || '(내용 없음)'}
        </div>
      </div>
      {normalized.imageUrl ? (
        <img src={normalized.imageUrl} alt="" style={{ maxWidth: '100%', borderRadius: 6, marginTop: 6 }} />
      ) : null}

      <div className="form-group" style={{ marginTop: 12 }}>
        <label className="form-label">답변 ({replies.length})</label>
        {replies.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {replies.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '6px 8px',
                  border: '1px solid var(--lake-line, rgba(255,255,255,0.1))',
                  borderRadius: 6,
                }}
              >
                <span style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{r.message}</span>
                <button
                  type="button"
                  className="btn-del"
                  style={{ flex: '0 0 auto' }}
                  onClick={() => deleteReply(r.id)}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <textarea
          className="form-input"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="답변을 입력하고 등록을 누르세요"
        />
        <button type="button" className="btn-save" style={{ marginTop: 6 }} onClick={addReply} disabled={!draft.trim()}>
          답변 등록
        </button>
      </div>
    </AdminPanelShell>
  );
}

type BgmProps = {
  data: SiteBgm;
  onSave: (next: SiteBgm) => Promise<void>;
};

type BgmTrackRow = {
  title: string;
  artist: string;
  fileUrl: string;
  url: string;
};

export function BgmAdminPanel({ data, onSave }: BgmProps) {
  const [form, setForm] = useState(data);
  useEffect(() => setForm(data), [data]);

  const tracks: BgmTrackRow[] = [
    {
      title: form.title,
      artist: form.artist,
      fileUrl: form.fileUrl || '',
      url: form.url || '',
    },
    ...(form.playlist || []).map((t) => ({
      title: t.title,
      artist: t.artist,
      fileUrl: t.fileUrl || '',
      url: t.url || '',
    })),
  ];

  function writeTracks(next: BgmTrackRow[]) {
    const safe = next.length ? next : [{ title: '', artist: '', fileUrl: '', url: '' }];
    const [main, ...rest] = safe;
    setForm({
      ...form,
      title: main.title,
      artist: main.artist,
      fileUrl: main.fileUrl,
      url: main.url,
      playlist: rest,
    });
  }

  function updateTrack(index: number, patch: Partial<BgmTrackRow>) {
    writeTracks(tracks.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function playPreview(track: BgmTrackRow) {
    const src = (track.fileUrl || track.url || '').trim();
    if (!src) return;
    try {
      const audio = new Audio(src);
      void audio.play();
    } catch {
      /* ignore */
    }
  }

  return (
    <AdminPanelShell title="BGM — 배경음악" onSave={() => onSave(form)}>
      <p className="form-hint" style={{ marginBottom: '1rem', opacity: 0.72, fontSize: 13 }}>
        오디오 파일을 업로드해 등록하세요. 2곡 이상이면 순서대로 재생되고, 끝나면 다음 곡으로 넘어갑니다.
      </p>

      <RepeatableList
        addLabel="+ 곡 추가"
        onAdd={() => writeTracks([...tracks, { title: '', artist: '', fileUrl: '', url: '' }])}
      >
        {tracks.map((track, index) => {
          const audioValue = track.fileUrl || track.url;
          const isMain = index === 0;
          return (
            <div
              key={index}
              style={{
                marginBottom: 12,
                paddingBottom: 12,
                borderBottom: '1px solid rgba(215,169,130,0.12)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                  gap: 8,
                }}
              >
                <span className="form-label" style={{ margin: 0, opacity: 0.9 }}>
                  {index + 1}번 곡
                  {isMain ? <span className="lh-bgm-main-badge">메인</span> : null}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn-save"
                    style={{ padding: '4px 10px' }}
                    disabled={!audioValue.trim()}
                    onClick={() => playPreview(track)}
                  >
                    ▶ 미리듣기
                  </button>
                  <button
                    type="button"
                    className="btn-edit"
                    disabled={isMain || tracks.length <= 1}
                    onClick={() => writeTracks(tracks.filter((_, i) => i !== index))}
                  >
                    삭제
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">곡명</label>
                <input
                  className="form-input"
                  value={track.title}
                  onChange={(e) => updateTrack(index, { title: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">아티스트</label>
                <input
                  className="form-input"
                  value={track.artist}
                  onChange={(e) => updateTrack(index, { artist: e.target.value })}
                />
              </div>
              <FileUploadField
                label="오디오 파일"
                value={audioValue}
                onChange={(next) => updateTrack(index, { fileUrl: next, url: '' })}
                accept="audio"
                folder="site/bgm"
                emptyLabel="📁 오디오 파일 선택"
                changeLabel="파일 변경"
              />
            </div>
          );
        })}
      </RepeatableList>
    </AdminPanelShell>
  );
}

type OcSettingsProps = {
  data: SiteOcSettings;
  onSave: (next: SiteOcSettings) => Promise<void>;
};

function TipToastSettingsBlock({
  title,
  value,
  onChange,
}: {
  title: string;
  value: SiteOcSettings['tipToastOc'];
  onChange: (next: SiteOcSettings['tipToastOc']) => void;
}) {
  const [draftKind, setDraftKind] = useState<'tip' | 'tmi'>('tmi');
  const [draftText, setDraftText] = useState('');

  const addItem = () => {
    const text = draftText.replace(/^\s+|\s+$/g, '');
    if (!text) return;
    const id = `tt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    onChange({
      ...value,
      items: [...(value.items || []), { id, kind: draftKind, text }],
    });
    setDraftText('');
  };

  return (
    <div className="form-group" style={{ marginTop: 18 }}>
      <div className="lake-edit-section-title" style={{ marginBottom: 8 }}>
        {title}
      </div>
      <p style={{ fontSize: 11, opacity: 0.65, margin: '0 0 10px' }}>
        목록 진입 시 TIP·TMI를 각각 하나씩 코너에 띄웁니다. 항목을 하나씩 추가하세요.
      </p>
      <LakeToggle
        checked={value.enabled}
        onChange={(enabled) => onChange({ ...value, enabled })}
        label="코너 Tip/TMI 알림 사용"
      />
      <div className="lh-tip-item-editor" style={{ marginTop: 10, opacity: value.enabled ? 1 : 0.45 }}>
        <div className="lh-tip-item-editor__add">
          <select
            className="form-input"
            style={{ width: 88 }}
            disabled={!value.enabled}
            value={draftKind}
            onChange={(e) => setDraftKind(e.target.value === 'tip' ? 'tip' : 'tmi')}
          >
            <option value="tmi">TMI</option>
            <option value="tip">TIP</option>
          </select>
          <input
            className="form-input"
            style={{ flex: 1 }}
            disabled={!value.enabled}
            placeholder="문구 입력 후 추가"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addItem();
              }
            }}
          />
          <button
            type="button"
            className="btn-save"
            style={{ padding: '6px 12px' }}
            disabled={!value.enabled || !draftText.trim()}
            onClick={addItem}
          >
            추가
          </button>
        </div>
        <ul className="lh-tip-item-editor__list">
          {(value.items || []).map((it) => (
            <li key={it.id} className="lh-tip-item-editor__row">
              <select
                className="form-input lh-tip-item-editor__kind-select"
                disabled={!value.enabled}
                value={it.kind}
                aria-label="종류"
                onChange={(e) =>
                  onChange({
                    ...value,
                    items: (value.items || []).map((x) =>
                      x.id === it.id
                        ? { ...x, kind: e.target.value === 'tip' ? 'tip' : 'tmi' }
                        : x,
                    ),
                  })
                }
              >
                <option value="tmi">TMI</option>
                <option value="tip">TIP</option>
              </select>
              <input
                className="form-input lh-tip-item-editor__text-input"
                disabled={!value.enabled}
                value={it.text}
                aria-label="문구"
                onChange={(e) =>
                  onChange({
                    ...value,
                    items: (value.items || []).map((x) =>
                      x.id === it.id ? { ...x, text: e.target.value } : x,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="btn-del"
                style={{ padding: '2px 8px' }}
                disabled={!value.enabled}
                onClick={() =>
                  onChange({
                    ...value,
                    items: (value.items || []).filter((x) => x.id !== it.id),
                  })
                }
              >
                ✕
              </button>
            </li>
          ))}
          {!(value.items || []).length ? (
            <li className="lh-tip-item-editor__empty">아직 항목이 없습니다</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

export function OcSettingsAdminPanel({ data, onSave }: OcSettingsProps) {
  const [form, setForm] = useState(data);
  useEffect(() => setForm(data), [data]);

  return (
    <AdminPanelShell title="OC — 전역 설정" onSave={() => onSave(form)}>
      <div className="form-group">
        <LakeToggle
          checked={form.pvIntroEnabled}
          onChange={(pvIntroEnabled) => setForm({ ...form, pvIntroEnabled })}
          label="PV 인트로 연출 사용"
        />
      </div>
      <div className="form-group">
        <label className="form-label">인트로 전체 시간 (ms) — 대사 스윕·간격 포함</label>
        <input
          className="form-input"
          type="number"
          min={700}
          max={12000}
          step={100}
          value={form.pvIntroDurationMs}
          onChange={(e) => setForm({ ...form, pvIntroDurationMs: Number(e.target.value) || 7500 })}
        />
      </div>
      <div className="form-group">
        <LakeToggle
          checked={form.autoResumeMainBgm}
          onChange={(autoResumeMainBgm) => setForm({ ...form, autoResumeMainBgm })}
          label="OC 상세 이탈 시 메인 BGM 자동 재개"
        />
      </div>
      <TipToastSettingsBlock
        title="OC 탭 · 코너 Tip/TMI"
        value={form.tipToastOc}
        onChange={(tipToastOc) => setForm({ ...form, tipToastOc })}
      />
      <TipToastSettingsBlock
        title="Pair 탭 · 코너 Tip/TMI"
        value={form.tipToastPair}
        onChange={(tipToastPair) => setForm({ ...form, tipToastPair })}
      />
    </AdminPanelShell>
  );
}

type UxSettingsProps = {
  data: SiteUiSettings;
  onSave: (next: SiteUiSettings) => Promise<void>;
};

export function UxAdminPanel({ data, onSave }: UxSettingsProps) {
  const [form, setForm] = useState(data);
  useEffect(() => setForm(data), [data]);

  function updateButton(id: string, patch: Partial<ClickerButton>) {
    setForm((prev) => ({
      ...prev,
      clickerButtons: (prev.clickerButtons || []).map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  }

  return (
    <AdminPanelShell title="UX · 클릭음 / 커서 / 이펙트" onSave={() => onSave(form)}>
      <AccordionSection title="클릭 효과음" defaultOpen>
        <div className="form-group">
          <LakeToggle
            checked={form.clickSoundEnabled}
            onChange={(clickSoundEnabled) => setForm({ ...form, clickSoundEnabled })}
            label="클릭 효과음"
          />
        </div>
        <div className="form-group">
          <label className="form-label">클릭음 프리셋</label>
          <select
            className="form-input"
            value={form.clickSoundPreset}
            onChange={(e) =>
              setForm({ ...form, clickSoundPreset: e.target.value as SiteUiSettings['clickSoundPreset'] })
            }
          >
            {CLICK_SOUND_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn-save"
          style={{ marginBottom: 10, padding: '5px 12px' }}
          onClick={() => playClickSound(form)}
        >
          미리듣기
        </button>
        {form.clickSoundPreset === 'custom' ? (
          <FileUploadField
            label="커스텀 클릭음"
            value={form.clickSoundCustom}
            onChange={(clickSoundCustom) => setForm({ ...form, clickSoundCustom })}
            accept="audio"
            asDataUrl
            emptyLabel="📁 MP3 / WAV 업로드"
            changeLabel="파일 변경"
          />
        ) : null}
      </AccordionSection>

      <AccordionSection title="커서" defaultOpen>
        <div className="form-group">
          <LakeToggle
            checked={form.customCursorEnabled}
            onChange={(customCursorEnabled) => setForm({ ...form, customCursorEnabled })}
            label="커스텀 커서 사용"
          />
        </div>
        <div className="form-group">
          <label className="form-label">커서 프리셋</label>
          <select
            className="form-input"
            value={form.cursorPreset}
            onChange={(e) =>
              setForm({ ...form, cursorPreset: e.target.value as SiteUiSettings['cursorPreset'] })
            }
          >
            {CURSOR_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom — 직접 업로드</option>
          </select>
        </div>
        {form.cursorPreset === 'custom' ? (
          <FileUploadField
            label="커스텀 커서"
            value={form.cursorCustom}
            onChange={(cursorCustom) => setForm({ ...form, cursorCustom })}
            accept="image"
            acceptAttr="image/png,image/svg+xml,image/x-icon,.cur,.png,.svg"
            asDataUrl
            emptyLabel="📁 PNG / SVG / CUR 업로드"
            changeLabel="파일 변경"
          />
        ) : null}
        <div className="form-group" style={{ marginTop: '0.75rem' }}>
          <LakeToggle
            checked={form.clickRippleEnabled}
            onChange={(clickRippleEnabled) => setForm({ ...form, clickRippleEnabled })}
            label="클릭 리플 이펙트"
          />
        </div>
      </AccordionSection>

      <AccordionSection title="클리키 위젯" defaultOpen>
        <div className="form-group">
          <LakeToggle
            checked={form.clickerEnabled}
            onChange={(clickerEnabled) => setForm({ ...form, clickerEnabled })}
            label="메인 화면에 클리커 표시"
          />
        </div>
        <div className="form-group">
          <label className="form-label">타이틀</label>
          <input
            className="form-input"
            value={form.clickerTitle}
            onChange={(e) => setForm({ ...form, clickerTitle: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">호버 힌트 문구 (박스 아래 · 한 번 누르면 숨김)</label>
          <input
            className="form-input"
            value={form.clickerHint}
            onChange={(e) => setForm({ ...form, clickerHint: e.target.value })}
            placeholder="z · x · c · v"
          />
        </div>
        <SliderField
          label="기본 볼륨"
          value={form.clickerDefaultVolume}
          min={0}
          max={1}
          step={0.05}
          displayValue={`${Math.round((form.clickerDefaultVolume || 0) * 100)}%`}
          onChange={(clickerDefaultVolume) => setForm({ ...form, clickerDefaultVolume })}
        />
        <div className="form-group">
          <label className="form-label">기본 사운드 프리셋</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="form-input"
              value={form.clickerSoundPreset}
              onChange={(e) =>
                setForm({
                  ...form,
                  clickerSoundPreset: e.target.value as ClickerSoundPreset,
                })
              }
            >
              {CLICKER_SOUND_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-save"
              style={{ padding: '5px 12px', whiteSpace: 'nowrap' }}
              onClick={() => {
                const ref = { current: null as AudioContext | null };
                playClickerPreset(ref, form.clickerSoundPreset, 0, form.clickerDefaultVolume || 0.5);
              }}
            >
              미리듣기
            </button>
          </div>
        </div>
        <FileUploadField
          label="공통 커스텀 사운드 (버튼별 없으면 사용)"
          value={form.clickerSoundCustom}
          onChange={(clickerSoundCustom) => setForm({ ...form, clickerSoundCustom })}
          accept="audio"
          folder="site/clicker"
          emptyLabel="📁 오디오 업로드"
          changeLabel="파일 변경"
        />
      </AccordionSection>

      <AccordionSection title={`버튼 관리 (${(form.clickerButtons || []).length})`} defaultOpen>
        <RepeatableList
          addLabel="+ 버튼 추가"
          onAdd={() => {
            const next: ClickerButton = {
              id: newId(),
              key: 'a',
              label: '',
            };
            setForm({ ...form, clickerButtons: [...(form.clickerButtons || []), next] });
          }}
        >
          {(form.clickerButtons || []).map((btn, index) => (
            <AccordionSection key={btn.id} title={`버튼 ${index + 1}`} defaultOpen={false}>
              <div className="form-group">
                <label className="form-label">키보드 키 (한 글자)</label>
                <input
                  className="form-input"
                  value={btn.key}
                  maxLength={1}
                  onChange={(e) => {
                    const key = e.target.value.slice(-1).toLowerCase() || '';
                    updateButton(btn.id, { key });
                  }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">표시 라벨 (비우면 키)</label>
                <input
                  className="form-input"
                  value={btn.label || ''}
                  onChange={(e) => updateButton(btn.id, { label: e.target.value })}
                />
              </div>
              <FileUploadField
                label="이미지"
                value={btn.img || ''}
                onChange={(img) => updateButton(btn.id, { img, imgFrame: undefined })}
                accept="image"
                folder="site/clicker"
                emptyLabel="📁 이미지 업로드"
                changeLabel="파일 변경"
              />
              {btn.img ? (
                <>
                  <label
                    className="form-group"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      marginBottom: 10,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(btn.cutout)}
                      onChange={(e) => updateButton(btn.id, { cutout: e.target.checked })}
                    />
                    <span style={{ fontSize: 12, color: 'rgba(230,210,180,.88)' }}>
                      투명 컷아웃 (배경 지운 PNG · 실루엣 테두리)
                    </span>
                  </label>
                  <div className="form-group lh-clicker-frame-edit">
                    <ImageFrameEditor
                      src={btn.img}
                      value={btn.imgFrame}
                      onChange={(imgFrame) =>
                        setForm((prev) => ({
                          ...prev,
                          clickerButtons: (prev.clickerButtons || []).map((b) =>
                            b.id === btn.id ? { ...b, imgFrame: { ...imgFrame, bottomBlur: 0 } } : b,
                          ),
                        }))
                      }
                      fit={btn.cutout ? 'contain' : 'cover'}
                      pos={btn.cutout ? 'center center' : 'center top'}
                      aspectRatio="1 / 1"
                      className={`image-frame-editor--clicker${btn.cutout ? ' is-cutout' : ''}`}
                      showBottomBlur={false}
                    />
                  </div>
                </>
              ) : null}
              <FileUploadField
                label="버튼 전용 사운드"
                value={btn.sound || ''}
                onChange={(sound) => updateButton(btn.id, { sound })}
                accept="audio"
                folder="site/clicker"
                emptyLabel="📁 오디오 업로드"
                changeLabel="파일 변경"
              />
              <button
                type="button"
                className="btn-edit"
                style={{ marginTop: 8 }}
                disabled={(form.clickerButtons || []).length <= 1}
                onClick={() =>
                  setForm({
                    ...form,
                    clickerButtons: (form.clickerButtons || []).filter((b) => b.id !== btn.id),
                  })
                }
              >
                삭제
              </button>
            </AccordionSection>
          ))}
        </RepeatableList>
      </AccordionSection>
    </AdminPanelShell>
  );
}

function MediaListAdminPanel<T extends { id: string; title: string }>({
  title,
  items,
  onSave,
  createItem,
  renderFields,
}: {
  title: string;
  items: T[];
  onSave: (next: T[]) => Promise<void>;
  createItem: () => T;
  renderFields: (form: T, setForm: (f: T) => void) => ReactNode;
}) {
  const { confirm } = useLakeDialog();
  const { showSaveToast, showDeleteToast } = useSaveToast();
  const [editId, setEditId] = useState<string | null>(null);
  const selected = items.find((i) => i.id === editId);
  const [form, setForm] = useState<T | null>(null);

  async function persist(next: T[], toast: ToastAction = false) {
    await onSave(next);
    if (toast === 'save') showSaveToast();
    if (toast === 'delete') showDeleteToast();
  }

  useEffect(() => {
    setForm(selected ?? null);
  }, [selected]);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.75rem' }}>
        <span style={{ fontSize: 12, color: 'var(--lake-copper-soft, var(--pink))' }}>{title}</span>
        <button
          type="button"
          className="btn-save"
          onClick={() => {
            const item = createItem();
            void persist([...items, item], 'save');
            setEditId(item.id);
            setForm(item);
          }}
        >
          + 추가
        </button>
      </div>
      <div className="lh-admin-grid">
        <div>
          {items.map((item) => (
            <AdminListItem
              key={item.id}
              title={item.title?.trim() ? item.title : '(제목 없음)'}
              selected={editId === item.id}
              onClick={() => {
                setEditId(item.id);
                setForm(item);
              }}
            />
          ))}
        </div>
        <div className="lh-oc-admin-block">
          {form && editId === form.id ? (
            <AdminPanelShell
              title="편집"
              onSave={() => persist(items.map((i) => (i.id === form.id ? form : i)))}
              onDelete={async () => {
                if (!(await confirm('이 항목을 삭제할까요?'))) return;
                await persist(
                  items.filter((i) => i.id !== form.id),
                  'delete',
                );
                setEditId(null);
                setForm(null);
              }}
            >
              {renderFields(form, setForm)}
            </AdminPanelShell>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>항목을 선택하세요.</span>
          )}
        </div>
      </div>
    </>
  );
}

export function AdminPanelShell({
  title,
  children,
  onSave,
  onDelete,
}: {
  title: string;
  children: ReactNode;
  onSave?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const { showSaveToast } = useSaveToast();

  async function handleSave() {
    if (!onSave) return;
    try {
      await onSave();
      showSaveToast();
    } catch (err) {
      window.alert(
        err instanceof Error
          ? err.message
          : '저장에 실패했습니다. HTML 로그 용량을 줄여 다시 시도해 주세요.',
      );
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <span style={{ fontSize: 12, color: 'var(--lake-copper-soft, var(--pink))' }}>{title}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {onSave && (
            <button type="button" className="btn-save" onClick={() => void handleSave()}>
              저장
            </button>
          )}
          {onDelete && (
            <button type="button" className="btn-del" onClick={() => void onDelete()}>
              삭제
            </button>
          )}
        </div>
      </div>
      {children}
    </>
  );
}
