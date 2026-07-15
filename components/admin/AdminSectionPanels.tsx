'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  BannerItem,
  ClickerButton,
  ClickerSoundPreset,
  GalleryItem,
  GuestEntry,
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
import { TrpgInvestigatorInlineTab } from '@/components/trpg/TrpgInvestigatorInlineTab';
import { TrpgLogTypographyControls } from '@/components/trpg/TrpgLogTypographyControls';
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

  return (
    <AdminPanelShell title="Main — 홈 메인 문구" onSave={() => onSave(form)}>
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
            <div
              key={item.id}
              className={`char-list-item${editId === item.id ? ' selected' : ''}`}
              onClick={() => setEditId(item.id)}
            >
              <div>{item.title}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{item.date}</div>
            </div>
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
    await onSave(next);
    if (toast === 'save') showSaveToast();
    if (toast === 'delete') showDeleteToast();
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
            <div
              key={item.id}
              className={`char-list-item${editId === item.id ? ' selected' : ''}`}
              onClick={() => setEditId(item.id)}
            >
              <div>{item.title}</div>
              {item.system ? (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{item.system}</div>
              ) : null}
            </div>
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

type TrpgEditTab = 'basic' | 'session' | 'investigators' | 'logs' | 'gallery' | 'dice' | 'handouts';

export type { TrpgEditTab };

const TRPG_EDIT_TABS: { id: TrpgEditTab; label: string }[] = [
  { id: 'basic', label: '기본' },
  { id: 'session', label: '세션' },
  { id: 'investigators', label: '탐사자' },
  { id: 'logs', label: '로그' },
  { id: 'gallery', label: '갤러리' },
  { id: 'dice', label: '주요 판정' },
  { id: 'handouts', label: '핸드아웃' },
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
  const [form, setForm] = useState(item);
  const [tab, setTab] = useState<TrpgEditTab>(initialTab);
  const [htmlPaste, setHtmlPaste] = useState('');
  const [galleryImgsOpen, setGalleryImgsOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setForm(item);
  }, [item]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, item.id]);

  useEffect(() => {
    setGalleryImgsOpen({});
  }, [item.id]);

  useEffect(() => {
    onBindActions?.({ save: () => onSave(form), delete: onDelete });
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
            <div className="trpg-edit-section">
              <div className="trpg-edit-section__title">시나리오 정보</div>
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
            </div>
            <div className="trpg-edit-section">
              <div className="trpg-edit-section__title">썸네일 · 호버 카드</div>
              <div className="trpg-edit-thumb-block">
                <ImageFileField
                  label="썸네일 이미지"
                  value={form.thumbnail || ''}
                  folder="site/trpg"
                  uploading={uploading}
                  onUploadStart={onUploadStart}
                  onUploadEnd={onUploadEnd}
                  onChange={(thumbnail) => setForm((prev) => ({ ...prev, thumbnail }))}
                />
                <ImageFileField
                  label="호버 초상 (오른쪽 · 비우면 연결 OC·탐사자)"
                  value={form.cardHoverImg || ''}
                  folder="site/trpg/hover"
                  uploading={uploading}
                  onUploadStart={onUploadStart}
                  onUploadEnd={onUploadEnd}
                  onChange={(cardHoverImg) => setForm((prev) => ({ ...prev, cardHoverImg }))}
                />
                <div className="trpg-edit-row col2" style={{ marginTop: 10 }}>
                  <div className="trpg-edit-field">
                    <label>호버 제목 (Enter 줄바꿈 · 비우면 시나리오 제목)</label>
                    <textarea
                      className="form-input"
                      rows={2}
                      value={form.cardHoverTitle || ''}
                      placeholder={form.title || '호버에 표시할 제목'}
                      onChange={(e) => setForm({ ...form, cardHoverTitle: e.target.value })}
                    />
                  </div>
                  <div className="trpg-edit-field">
                    <label>호버 PC 이름</label>
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
            </div>
            <div className="trpg-edit-section">
              <div className="trpg-edit-section__title">플레이 후기</div>
              <div className="trpg-edit-field">
                <textarea
                  className="form-input"
                  rows={5}
                  value={form.review || ''}
                  placeholder="티켓 Overview에 표시될 후기"
                  onChange={(e) => setForm({ ...form, review: e.target.value })}
                />
              </div>
            </div>
            <div className="trpg-edit-section">
              <div className="trpg-edit-section__title">세션 · 페이지 설정</div>
              <div className="trpg-edit-field">
                <label>세션 바로가기 URL</label>
                <input
                  className="form-input"
                  placeholder="코코포리아·배포 원본 링크"
                  value={form.sessionUrl || ''}
                  onChange={(e) => setForm({ ...form, sessionUrl: e.target.value })}
                />
              </div>
              <div className="trpg-edit-field">
                <ImageFileField
                  label="페이지 배경 이미지"
                  value={form.pageBackground?.startsWith('http') || form.pageBackground?.startsWith('/') ? form.pageBackground : ''}
                  folder="site/trpg/bg"
                  uploading={uploading}
                  onUploadStart={onUploadStart}
                  onUploadEnd={onUploadEnd}
                  onChange={(pageBackground) => setForm({ ...form, pageBackground })}
                />
                <label style={{ marginTop: 8, display: 'block' }}>배경 (CSS 색·그라데이션·URL)</label>
                <input
                  className="form-input"
                  placeholder="#0a0a0a 또는 linear-gradient(...) 또는 이미지 URL"
                  value={form.pageBackground || ''}
                  onChange={(e) => setForm({ ...form, pageBackground: e.target.value })}
                />
              </div>
              <div className="trpg-edit-row col2">
                <div className="trpg-edit-field">
                  <label>시나리오 BGM 제목</label>
                  <input
                    className="form-input"
                    value={form.pageBgm?.title || ''}
                    onChange={(e) => setForm({ ...form, pageBgm: { ...form.pageBgm, title: e.target.value } })}
                  />
                </div>
                <div className="trpg-edit-field">
                  <label>아티스트</label>
                  <input
                    className="form-input"
                    value={form.pageBgm?.artist || ''}
                    onChange={(e) => setForm({ ...form, pageBgm: { ...form.pageBgm, artist: e.target.value } })}
                  />
                </div>
              </div>
              <div className="trpg-edit-field">
                <AudioFileField
                  label="BGM 파일"
                  value={form.pageBgm?.fileUrl || form.pageBgm?.url || ''}
                  folder="site/trpg/bgm"
                  uploading={uploading}
                  onUploadStart={onUploadStart}
                  onUploadEnd={onUploadEnd}
                  onChange={(fileUrl) => {
                    const pageBgm = { ...form.pageBgm, fileUrl, url: fileUrl };
                    const next = { ...form, pageBgm };
                    setForm(next);
                    onPersist?.(next);
                  }}
                />
              </div>
            </div>
          </>
        ) : null}

        {tab === 'session' ? (
          <>
            <div className="trpg-edit-section">
              <div className="trpg-edit-section__title">참여 정보</div>
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
            </div>
            <div className="trpg-edit-section">
              <div className="trpg-edit-section__title">플레이어 / HO 요약</div>
              <div className="trpg-edit-field">
                <textarea
                  className="form-input"
                  rows={2}
                  value={form.players || ''}
                  placeholder="PL 카논"
                  onChange={(e) => setForm({ ...form, players: e.target.value })}
                />
              </div>
            </div>
            <div className="trpg-edit-section">
              <div className="trpg-edit-section__title">TRPG 연관 바로가기 · 연결 캐릭터 (OC)</div>
              <p className="trpg-edit-hint">
                OC를 선택해 추가하면 해당 캐릭터 상세에 이 시나리오가 연관 바로가기로 표시됩니다.
              </p>
              <LinkPickList
                options={characters.map((c) => ({ id: String(c.id), label: c.name }))}
                selectedIds={[...(form.characterIds ?? [])].map(String)}
                onChange={(ids) => setForm({ ...form, characterIds: ids })}
                emptyLabel="연결된 OC가 없습니다."
                selectPlaceholder="OC 선택해서 추가…"
              />
            </div>
            <div className="trpg-edit-section">
              <div className="trpg-edit-section__title">완료 여부</div>
              <LakeToggle
                checked={!!form.cleared}
                onChange={(cleared) => setForm({ ...form, cleared })}
                label="CLEARED 스탬프 표시"
              />
            </div>
            <div className="trpg-edit-section">
              <div className="trpg-edit-section__title">비밀글</div>
              <SecretPostFields value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
            </div>
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
            <div className="trpg-edit-section">
              <div className="trpg-edit-section__title">세션 로그</div>
              <div className="trpg-edit-card-list">
                {(form.logs ?? []).map((log, index) => (
                  <div key={log.id} className="trpg-edit-card-item">
                    <div className="trpg-edit-card-item__head">
                      <span className="trpg-edit-card-item__label">
                        {log.title || `로그 ${index + 1}`}
                        {log.html ? <em className="trpg-edit-log-html-badge">HTML</em> : null}
                      </span>
                      <button type="button" className="trpg-edit-mini-del" onClick={() => void removeLog(log.id)}>
                        ✕
                      </button>
                    </div>
                    <div className="trpg-edit-row col2">
                      <div className="trpg-edit-field">
                        <label>제목</label>
                        <input
                          className="form-input"
                          placeholder="제목"
                          value={log.title}
                          onChange={(e) => updateLog(log.id, { title: e.target.value })}
                        />
                      </div>
                      <div className="trpg-edit-field">
                        <label>부제 (●●●●)</label>
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
                        <label>날짜</label>
                        <input
                          className="form-input"
                          type="date"
                          value={log.date || ''}
                          onChange={(e) => updateLog(log.id, { date: e.target.value })}
                        />
                      </div>
                      <div className="trpg-edit-field">
                        <label>태그</label>
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
                    <div className="trpg-edit-field">
                      <label>배너 이미지</label>
                      <ImageFileField
                        label=""
                        value={log.thumbnail || ''}
                        folder="site/trpg/logs"
                        uploading={uploading}
                        onUploadStart={onUploadStart}
                        onUploadEnd={onUploadEnd}
                        onChange={(thumbnail) => updateLog(log.id, { thumbnail })}
                      />
                    </div>
                    <div className="trpg-edit-field">
                      <label>본문 표시</label>
                      <TrpgLogTypographyControls
                        fontSize={log.logFontSize ?? 12}
                        lineHeight={log.logLineHeight ?? 1.72}
                        onChange={(patch) => updateLog(log.id, patch)}
                      />
                    </div>
                    <div className="trpg-edit-field">
                      <label>본문</label>
                      <textarea
                        className="form-input"
                        rows={6}
                        placeholder="세션 로그 본문..."
                        value={log.body}
                        onChange={(e) => updateLog(log.id, { body: e.target.value })}
                      />
                    </div>
                    <div className="trpg-edit-field">
                      <label>HTML 로그 파일</label>
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
                        <label>참여 탐사자</label>
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
                    <div className="trpg-edit-field">
                      <label>비밀 여부</label>
                      <SecretPostFields value={log} onChange={(patch) => updateLog(log.id, patch)} />
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="trpg-edit-add-btn" onClick={addLog}>
                + 로그 추가
              </button>
            </div>
            <div className="trpg-edit-section">
              <div className="trpg-edit-section__title">HTML 불러오기</div>
              <p className="trpg-edit-hint">코코포리아 등에서 보낸 HTML을 새 로그로 추가합니다. 저장 버튼을 눌러야 반영됩니다.</p>
              <div className="trpg-edit-field">
                <textarea
                  className="form-input"
                  rows={4}
                  style={{ fontFamily: 'monospace', fontSize: 11 }}
                  placeholder="HTML 코드를 직접 붙여넣을 수 있습니다."
                  value={htmlPaste}
                  onChange={(e) => setHtmlPaste(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                <button
                  type="button"
                  className="btn-edit"
                  onClick={() => {
                    if (!htmlPaste.trim()) return;
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
            </div>
          </>
        ) : null}

        {tab === 'gallery' ? (
          <div className="trpg-edit-section">
            <div className="trpg-edit-section__title">애프터 · 갤러리</div>
            <div className="trpg-edit-card-list">
              {(form.gallery ?? []).map((g, index) => {
                const images = galleryImageList(g);
                const galleryCount = form.gallery?.length ?? 0;
                const filledCount = images.filter((u) => u.trim()).length;
                const canCollapse = images.length > 1;
                const imgsOpen = !canCollapse || galleryImgsOpen[g.id] === true;
                return (
                  <div key={g.id} className="trpg-edit-card-item">
                    <div className="trpg-edit-card-item__head">
                      <span className="trpg-edit-card-item__label">{g.title || `갤러리 ${index + 1}`}</span>
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
                    <div className="trpg-edit-gallery-imgs">
                      {canCollapse ? (
                        <button
                          type="button"
                          className={`trpg-edit-gallery-toggle${imgsOpen ? ' is-open' : ''}`}
                          aria-expanded={imgsOpen}
                          onClick={() =>
                            setGalleryImgsOpen((prev) => ({ ...prev, [g.id]: !imgsOpen }))
                          }
                        >
                          <span>
                            사진 {filledCount || images.length}장
                            {!imgsOpen && images[0]?.trim() ? ' · 접힘' : ''}
                          </span>
                          <em>{imgsOpen ? '접기' : '펼치기'}</em>
                        </button>
                      ) : null}

                      {!imgsOpen && canCollapse && images[0]?.trim() ? (
                        <div className="trpg-edit-gallery-preview">
                          <img src={images[0]} alt="" />
                        </div>
                      ) : null}

                      {imgsOpen
                        ? images.map((url, imgIndex) => (
                            <div key={`${g.id}-${imgIndex}`} className="trpg-edit-gallery-imgs__row">
                              <ImageFileField
                                label={images.length > 1 ? `사진 ${imgIndex + 1}` : '사진'}
                                value={url}
                                folder="site/trpg/gallery"
                                uploading={uploading}
                                onUploadStart={onUploadStart}
                                onUploadEnd={onUploadEnd}
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
                                  </>
                                ) : null}
                                {images.length > 1 ? (
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
                                ) : null}
                              </div>
                            </div>
                          ))
                        : null}

                      <button
                        type="button"
                        className="trpg-edit-add-btn trpg-edit-add-btn--sub"
                        onClick={() => {
                          setGalleryImages(g.id, [...images, '']);
                          if (canCollapse) {
                            setGalleryImgsOpen((prev) => ({ ...prev, [g.id]: true }));
                          }
                        }}
                      >
                        + 사진 추가
                      </button>
                    </div>
                    <div className="trpg-edit-row col2" style={{ marginTop: 8 }}>
                      <div className="trpg-edit-field">
                        <label>제목</label>
                        <input
                          className="form-input"
                          placeholder="제목"
                          value={g.title || ''}
                          onChange={(e) => updateGallery(g.id, { title: e.target.value })}
                        />
                      </div>
                      <div className="trpg-edit-field">
                        <label>작가/출처</label>
                        <GalleryCreditInput
                          value={g.artist || ''}
                          onChange={(artist) => updateGallery(g.id, { artist })}
                        />
                      </div>
                    </div>
                    <div className="trpg-edit-field">
                      <label>캡션 (선택)</label>
                      <input
                        className="form-input"
                        placeholder="이미지 설명"
                        value={g.caption || ''}
                        onChange={(e) => updateGallery(g.id, { caption: e.target.value })}
                      />
                    </div>
                    {images.filter((u) => u.trim()).length > 1 || images.length > 1 ? (
                      <div className="trpg-edit-field" style={{ marginTop: 8 }}>
                        <label>복수 이미지 보기</label>
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
                  </div>
                );
              })}
            </div>
            <button type="button" className="trpg-edit-add-btn" onClick={addGalleryItem}>
              + 갤러리 박스 추가
            </button>
          </div>
        ) : null}

        {tab === 'dice' ? (
          <div className="trpg-edit-section">
            <div className="trpg-edit-section__title">주요 판정 · 다이스</div>
              <div className="trpg-edit-card-list">
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
                        <label>항목</label>
                        <input
                          className="form-input"
                          placeholder="회피"
                          value={d.title}
                          onChange={(e) => updateDiceHighlight(d.id, { title: e.target.value })}
                        />
                      </div>
                      <div className="trpg-edit-field">
                        <label>결과</label>
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
                        <label>주사위</label>
                        <input
                          className="form-input"
                          placeholder="1d100 ≤ 50"
                          value={d.roll || ''}
                          onChange={(e) => updateDiceHighlight(d.id, { roll: e.target.value })}
                        />
                      </div>
                      <div className="trpg-edit-field">
                        <label>세션</label>
                        <input
                          className="form-input"
                          placeholder="2회차"
                          value={d.session || ''}
                          onChange={(e) => updateDiceHighlight(d.id, { session: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="trpg-edit-field">
                      <label>메모</label>
                      <textarea
                        className="form-input"
                        rows={2}
                        placeholder="메모"
                        value={d.note || ''}
                        onChange={(e) => updateDiceHighlight(d.id, { note: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="trpg-edit-add-btn" onClick={addDiceHighlight}>
                + 판정 추가
              </button>
            </div>
        ) : null}

        {tab === 'handouts' ? (
          <>
            <div className="trpg-edit-section">
              <div className="trpg-edit-section__title">핸드아웃</div>
              <div className="trpg-edit-card-list">
                {(form.handouts ?? []).map((h, index) => (
                  <div key={h.id} className="trpg-edit-card-item">
                    <div className="trpg-edit-card-item__head">
                      <span className="trpg-edit-card-item__label">{h.title || `핸드아웃 ${index + 1}`}</span>
                      <button type="button" className="trpg-edit-mini-del" onClick={() => removeHandout(h.id)}>
                        ✕
                      </button>
                    </div>
                    <ImageFileField
                      label=""
                      value={h.img || ''}
                      folder="site/trpg/handouts"
                      uploading={uploading}
                      onUploadStart={onUploadStart}
                      onUploadEnd={onUploadEnd}
                      onChange={(img) => updateHandout(h.id, { img })}
                    />
                    <div className="trpg-edit-field" style={{ marginTop: 8 }}>
                      <label>제목</label>
                      <input
                        className="form-input"
                        placeholder="핸드아웃 제목"
                        value={h.title}
                        onChange={(e) => updateHandout(h.id, { title: e.target.value })}
                      />
                    </div>
                    <div className="trpg-edit-field">
                      <label>본문</label>
                      <textarea
                        className="form-input"
                        rows={3}
                        placeholder="본문"
                        value={h.body || ''}
                        onChange={(e) => updateHandout(h.id, { body: e.target.value })}
                      />
                    </div>
                    <LakeToggle
                      checked={!!h.spoiler}
                      onChange={(spoiler) => updateHandout(h.id, { spoiler })}
                      label="스포일러 (탭하여 공개)"
                    />
                  </div>
                ))}
              </div>
              <button type="button" className="trpg-edit-add-btn" onClick={addHandout}>
                + 핸드아웃 추가
              </button>
            </div>
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
            <div
              key={item.id}
              className={`char-list-item${editId === item.id ? ' selected' : ''}`}
              onClick={() => setEditId(item.id)}
            >
              <div>{item.name}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                {item.comingSoon
                  ? 'Coming Soon'
                  : item.href === '/verse/gate'
                    ? '게이트 · /verse/gate'
                    : item.href || '링크 없음'}
              </div>
            </div>
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
            <div
              key={item.id}
              className={`char-list-item${editId === item.id ? ' selected' : ''}`}
              onClick={() => setEditId(item.id)}
            >
              <div>{item.divider ? `구분 ${item.dividerIcon || '◆'}` : item.title}</div>
            </div>
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
                    <label className="form-label">이미지 URL</label>
                    <input className="form-input" value={form.img} onChange={(e) => setForm({ ...form, img: e.target.value })} />
                  </div>
                  <label className="file-input-label" style={{ marginBottom: 8 }}>
                    이미지 파일 업로드
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        readFileAsDataUrl(f, (url) => setForm({ ...form, img: url }));
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {form.img ? (
                    <img src={form.img} alt="" style={{ maxWidth: '100%', maxHeight: 140, objectFit: 'contain', marginBottom: 8 }} />
                  ) : null}
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
            <div
              key={item.id}
              className={`char-list-item${editId === item.id ? ' selected' : ''}`}
              onClick={() => setEditId(item.id)}
            >
              <div>{item.name}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{item.date}</div>
            </div>
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
  const [form, setForm] = useState(item);

  return (
    <AdminPanelShell title="방명록" onSave={() => onSave(form)} onDelete={onDelete}>
      <div className="form-group">
        <label className="form-label">이름</label>
        <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label">날짜</label>
        <input className="form-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label">메시지</label>
        <textarea className="form-input" rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      </div>
      <input className="form-input" placeholder="이미지 URL" value={form.imageUrl || ''} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} style={{ marginTop: 6 }} />
      <input className="form-input" placeholder="영상 URL" value={form.videoUrl || ''} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} style={{ marginTop: 6 }} />
      <LakeToggle checked={!!form.secret} onChange={(secret) => setForm({ ...form, secret })} label="비밀글 (관리자만)" />
      <div className="form-group" style={{ marginTop: 8 }}>
        <label className="form-label">관리자 답변</label>
        <textarea
          className="form-input"
          rows={4}
          value={form.reply || ''}
          onChange={(e) => setForm({ ...form, reply: e.target.value })}
          placeholder="방명록에 대한 답변을 입력하세요"
        />
      </div>
    </AdminPanelShell>
  );
}

type BgmProps = {
  data: SiteBgm;
  onSave: (next: SiteBgm) => Promise<void>;
};

function bgmFileLabel(fileUrl?: string, url?: string) {
  const src = fileUrl?.trim() || url?.trim();
  if (!src) return '등록된 파일 없음';
  try {
    const name = decodeURIComponent(src.split('/').pop() || src);
    return name.length > 48 ? `…${name.slice(-44)}` : name;
  } catch {
    return src.length > 48 ? `…${src.slice(-44)}` : src;
  }
}

function BgmAudioUploadRow({
  label,
  fileUrl,
  url,
  uploading,
  onPick,
  onClear,
}: {
  label: string;
  fileUrl?: string;
  url?: string;
  uploading: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const hasFile = !!(fileUrl?.trim() || url?.trim());
  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label">{label}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <label className="file-input-label" style={{ margin: 0, opacity: uploading ? 0.6 : 1 }}>
          {uploading ? '업로드 중…' : '📁 오디오 파일 선택'}
          <input
            type="file"
            accept="audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/*,.mp3,.ogg,.wav,.m4a"
            hidden
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
              e.target.value = '';
            }}
          />
        </label>
        {hasFile && (
          <button type="button" className="btn-edit" onClick={onClear} disabled={uploading}>
            파일 제거
          </button>
        )}
      </div>
      <p className="form-hint" style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.72 }}>
        {hasFile ? `등록됨: ${bgmFileLabel(fileUrl, url)}` : 'MP3 · OGG · WAV 등을 업로드하세요.'}
      </p>
    </div>
  );
}

export function BgmAdminPanel({ data, onSave }: BgmProps) {
  const [form, setForm] = useState(data);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  useEffect(() => setForm(data), [data]);

  const playlist = form.playlist ?? [];

  function updatePlaylistItem(index: number, patch: Partial<(typeof playlist)[number]>) {
    const next = playlist.map((item, i) => (i === index ? { ...item, ...patch } : item));
    setForm({ ...form, playlist: next });
  }

  function movePlaylistItem(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= playlist.length) return;
    const next = [...playlist];
    [next[index], next[j]] = [next[j], next[index]];
    setForm({ ...form, playlist: next });
  }

  async function uploadBgmFile(key: string, file: File, onUrl: (url: string) => void) {
    setUploadingKey(key);
    try {
      const url = await uploadMediaFile(file, 'site/bgm');
      onUrl(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'BGM 업로드 실패');
    } finally {
      setUploadingKey(null);
    }
  }

  return (
    <AdminPanelShell title="BGM — 배경음악" onSave={() => onSave(form)}>
      <p className="form-hint" style={{ marginBottom: '1rem', opacity: 0.72, fontSize: 13 }}>
        오디오 파일을 업로드해 등록하세요. 2곡 이상이면 순서대로 재생되고, 끝나면 다음 곡으로 넘어갑니다.
      </p>

      <div
        style={{
          marginBottom: 16,
          paddingBottom: 16,
          borderBottom: '1px solid rgba(215,169,130,0.12)',
        }}
      >
        <span className="form-label" style={{ display: 'block', marginBottom: 8, opacity: 0.9 }}>
          1번 곡 (메인)
        </span>
        <div className="form-group">
          <label className="form-label">곡명</label>
          <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">아티스트</label>
          <input className="form-input" value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} />
        </div>
        <BgmAudioUploadRow
          label="오디오 파일"
          fileUrl={form.fileUrl}
          url={form.url}
          uploading={uploadingKey === 'main'}
          onPick={(f) =>
            void uploadBgmFile('main', f, (url) => setForm({ ...form, fileUrl: url, url: '' }))
          }
          onClear={() => setForm({ ...form, fileUrl: '', url: '' })}
        />
      </div>

      <div className="form-group">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <label className="form-label" style={{ margin: 0 }}>
            2번째 곡부터 (플레이리스트)
          </label>
          <button
            type="button"
            className="btn-edit"
            onClick={() =>
              setForm({
                ...form,
                playlist: [...playlist, { title: '', artist: '', fileUrl: '', url: '' }],
              })
            }
          >
            + 곡 추가
          </button>
        </div>
        {playlist.map((track, i) => (
          <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(215,169,130,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="form-label" style={{ margin: 0, opacity: 0.85 }}>
                {i + 2}번 곡
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn-edit"
                  disabled={i === 0}
                  onClick={() => movePlaylistItem(i, -1)}
                  title="위로"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn-edit"
                  disabled={i === playlist.length - 1}
                  onClick={() => movePlaylistItem(i, 1)}
                  title="아래로"
                >
                  ↓
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">곡명</label>
              <input
                className="form-input"
                value={track.title}
                onChange={(e) => updatePlaylistItem(i, { title: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">아티스트</label>
              <input
                className="form-input"
                value={track.artist}
                onChange={(e) => updatePlaylistItem(i, { artist: e.target.value })}
              />
            </div>
            <BgmAudioUploadRow
              label="오디오 파일"
              fileUrl={track.fileUrl}
              url={track.url}
              uploading={uploadingKey === `pl-${i}`}
              onPick={(f) =>
                void uploadBgmFile(`pl-${i}`, f, (url) =>
                  updatePlaylistItem(i, { fileUrl: url, url: '' }),
                )
              }
              onClear={() => updatePlaylistItem(i, { fileUrl: '', url: '' })}
            />
            <button
              type="button"
              className="btn-edit"
              style={{ marginTop: 8 }}
              onClick={() => setForm({ ...form, playlist: playlist.filter((_, j) => j !== i) })}
            >
              삭제
            </button>
          </div>
        ))}
      </div>
    </AdminPanelShell>
  );
}

type OcSettingsProps = {
  data: SiteOcSettings;
  onSave: (next: SiteOcSettings) => Promise<void>;
};

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

  return (
    <AdminPanelShell title="UX · 클릭음 / 커서 / 이펙트" onSave={() => onSave(form)}>
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
      {form.clickSoundPreset === 'custom' && (
        <>
          <label className="file-input-label" style={{ marginBottom: 8 }}>
            MP3 / WAV 파일 업로드
            <input
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => setForm({ ...form, clickSoundCustom: String(reader.result || '') });
                reader.readAsDataURL(f);
                e.target.value = '';
              }}
            />
          </label>
          <div className="form-group">
            <label className="form-label">또는 URL / data URL</label>
            <input
              className="form-input"
              value={form.clickSoundCustom}
              onChange={(e) => setForm({ ...form, clickSoundCustom: e.target.value })}
            />
          </div>
        </>
      )}

      <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(215,169,130,.18)' }}>
        <div style={{ fontSize: 11, color: 'var(--lake-copper-soft)', marginBottom: '.65rem', letterSpacing: '.12em' }}>
          커서
        </div>
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
        {form.cursorPreset === 'custom' && (
          <>
            <label className="file-input-label" style={{ marginBottom: 8 }}>
              PNG / SVG / CUR 파일 업로드
              <input
                type="file"
                accept="image/png,image/svg+xml,image/x-icon,.cur"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => setForm({ ...form, cursorCustom: String(reader.result || '') });
                  reader.readAsDataURL(f);
                  e.target.value = '';
                }}
              />
            </label>
            <div className="form-group">
              <label className="form-label">또는 URL / data URL</label>
              <input
                className="form-input"
                value={form.cursorCustom}
                onChange={(e) => setForm({ ...form, cursorCustom: e.target.value })}
              />
            </div>
          </>
        )}
      </div>

      <div className="form-group" style={{ marginTop: '1rem' }}>
        <LakeToggle
          checked={form.clickRippleEnabled}
          onChange={(clickRippleEnabled) => setForm({ ...form, clickRippleEnabled })}
          label="클릭 리플 이펙트"
        />
      </div>

      <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(215,169,130,.18)' }}>
        <div style={{ fontSize: 11, color: 'var(--lake-copper-soft)', marginBottom: '.65rem', letterSpacing: '.12em' }}>
          클리커 위젯
        </div>
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
        <div className="form-group">
          <label className="form-label">기본 볼륨 (0–1)</label>
          <input
            className="form-input"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={form.clickerDefaultVolume}
            onChange={(e) =>
              setForm({
                ...form,
                clickerDefaultVolume: Math.min(1, Math.max(0, Number(e.target.value) || 0)),
              })
            }
          />
        </div>
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
        <AudioFileField
          label="공통 커스텀 사운드 (버튼별 없으면 사용)"
          value={form.clickerSoundCustom}
          folder="site/clicker"
          onChange={(clickerSoundCustom) => setForm({ ...form, clickerSoundCustom })}
        />
        {form.clickerSoundCustom ? (
          <button
            type="button"
            className="btn-edit"
            style={{ marginBottom: 10 }}
            onClick={() => setForm({ ...form, clickerSoundCustom: '' })}
          >
            공통 사운드 지우기
          </button>
        ) : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            margin: '0.85rem 0 0.5rem',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--lake-copper-soft)', letterSpacing: '.1em' }}>
            버튼 ({(form.clickerButtons || []).length})
          </span>
          <button
            type="button"
            className="btn-save"
            style={{ padding: '4px 10px' }}
            onClick={() => {
              const next: ClickerButton = {
                id: newId(),
                key: 'a',
                label: '',
              };
              setForm({ ...form, clickerButtons: [...(form.clickerButtons || []), next] });
            }}
          >
            + 버튼 추가
          </button>
        </div>

        {(form.clickerButtons || []).map((btn, index) => (
          <div
            key={btn.id}
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              border: '1px solid rgba(215,169,130,.16)',
              borderRadius: 10,
              background: 'rgba(8,10,9,.28)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 12, color: 'rgba(240,207,173,.88)' }}>버튼 {index + 1}</span>
              <button
                type="button"
                className="btn-edit"
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
            </div>
            <div className="form-group">
              <label className="form-label">키보드 키 (한 글자)</label>
              <input
                className="form-input"
                value={btn.key}
                maxLength={1}
                onChange={(e) => {
                  const key = e.target.value.slice(-1).toLowerCase() || '';
                  setForm({
                    ...form,
                    clickerButtons: (form.clickerButtons || []).map((b) =>
                      b.id === btn.id ? { ...b, key } : b,
                    ),
                  });
                }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">표시 라벨 (비우면 키)</label>
              <input
                className="form-input"
                value={btn.label || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    clickerButtons: (form.clickerButtons || []).map((b) =>
                      b.id === btn.id ? { ...b, label: e.target.value } : b,
                    ),
                  })
                }
              />
            </div>
            <ImageFileField
              label="이미지"
              value={btn.img || ''}
              folder="site/clicker"
              onChange={(img) =>
                setForm({
                  ...form,
                  clickerButtons: (form.clickerButtons || []).map((b) =>
                    b.id === btn.id ? { ...b, img, imgFrame: undefined } : b,
                  ),
                })
              }
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
                    onChange={(e) =>
                      setForm({
                        ...form,
                        clickerButtons: (form.clickerButtons || []).map((b) =>
                          b.id === btn.id ? { ...b, cutout: e.target.checked } : b,
                        ),
                      })
                    }
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
                <button
                  type="button"
                  className="btn-edit"
                  style={{ marginBottom: 8 }}
                  onClick={() =>
                    setForm({
                      ...form,
                      clickerButtons: (form.clickerButtons || []).map((b) =>
                        b.id === btn.id ? { ...b, img: '', imgFrame: undefined } : b,
                      ),
                    })
                  }
                >
                  이미지 지우기
                </button>
              </>
            ) : null}
            <AudioFileField
              label="버튼 전용 사운드"
              value={btn.sound || ''}
              folder="site/clicker"
              onChange={(sound) =>
                setForm({
                  ...form,
                  clickerButtons: (form.clickerButtons || []).map((b) =>
                    b.id === btn.id ? { ...b, sound } : b,
                  ),
                })
              }
            />
            {btn.sound ? (
              <button
                type="button"
                className="btn-edit"
                onClick={() =>
                  setForm({
                    ...form,
                    clickerButtons: (form.clickerButtons || []).map((b) =>
                      b.id === btn.id ? { ...b, sound: '' } : b,
                    ),
                  })
                }
              >
                버튼 사운드 지우기
              </button>
            ) : null}
          </div>
        ))}
      </div>
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
            <div
              key={item.id}
              className={`char-list-item${editId === item.id ? ' selected' : ''}`}
              onClick={() => {
                setEditId(item.id);
                setForm(item);
              }}
            >
              <div>{item.title?.trim() ? item.title : '(제목 없음)'}</div>
            </div>
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
  onSave: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const { showSaveToast } = useSaveToast();

  async function handleSave() {
    await onSave();
    showSaveToast();
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <span style={{ fontSize: 12, color: 'var(--lake-copper-soft, var(--pink))' }}>{title}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn-save" onClick={() => void handleSave()}>
            저장
          </button>
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
