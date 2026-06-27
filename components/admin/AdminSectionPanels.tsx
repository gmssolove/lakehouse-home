'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  BannerItem,
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
  TrpgPlayerProfile,
  TrpgRelationship,
  TrpgSessionLog,
  TrpgScenario,
  UniverseCard,
} from '@/lib/types/site-content';
import { newId } from '@/lib/types/site-content';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { useSaveToast } from '@/components/ui/SaveToast';
import { BANNER_DIVIDER_PRESETS, BannerDividerIcon } from '@/lib/banner/dividerIcons';
import { CLICK_SOUND_PRESETS, playClickSound } from '@/lib/sounds/clickSound';
import { CURSOR_PRESETS } from '@/lib/ui/cursorPresets';
import { LakeToggle } from '@/components/ui/LakeToggle';
import { SecretPostFields } from '@/components/ui/SecretPostFields';
import { ImageFileField } from '@/components/ui/ImageFileField';
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
  initialEditId?: string | null;
};

export function TrpgAdminPanel({ items, onSave, initialEditId = null }: TrpgProps) {
  const { confirm } = useLakeDialog();
  const { showSaveToast, showDeleteToast } = useSaveToast();
  const { characters } = useOcData();
  const [editId, setEditId] = useState<string | null>(initialEditId);
  const [uploading, setUploading] = useState(false);
  const editBodyRef = useRef<HTMLDivElement>(null);
  const selected = items.find((i) => i.id === editId);

  useEffect(() => {
    if (initialEditId) setEditId(initialEditId);
  }, [initialEditId]);

  async function persist(next: TrpgScenario[], toast: ToastAction = false) {
    await onSave(next);
    if (toast === 'save') showSaveToast();
    if (toast === 'delete') showDeleteToast();
  }

  function addItem() {
    const item: TrpgScenario = {
      id: newId(),
      title: '새 시나리오',
      subtitle: '',
      thumbnail: '',
      author: '',
      kp: '',
      system: '',
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

  return (
    <>
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

  useEffect(() => {
    setForm(item);
  }, [item]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, item.id]);

  useEffect(() => {
    onBindActions?.({ save: () => onSave(form), delete: onDelete });
  }, [form, onBindActions, onDelete, onSave]);

  const selectedIds = new Set(form.characterIds ?? []);

  function toggleCharacter(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setForm({ ...form, characterIds: [...next] });
  }

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
    const g: TrpgGalleryItem = { id: newId(), img: '', title: '', caption: '' };
    setForm((f) => ({ ...f, gallery: [...(f.gallery ?? []), g] }));
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
              <div className="trpg-edit-section__title">썸네일</div>
              <div className="trpg-edit-thumb-block">
                <ImageFileField
                  label="이미지"
                  value={form.thumbnail || ''}
                  folder="site/trpg"
                  uploading={uploading}
                  onUploadStart={onUploadStart}
                  onUploadEnd={onUploadEnd}
                  onChange={(thumbnail) => setForm((prev) => ({ ...prev, thumbnail }))}
                />
                {form.thumbnail ? (
                  <div className="trpg-edit-thumb-editor">
                    <TrpgThumbnailEditor
                      src={form.thumbnail}
                      frame={form.thumbnailFrame}
                      onChange={(thumbnailFrame) => setForm((prev) => ({ ...prev, thumbnailFrame }))}
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
              <div className="trpg-edit-section__title">연결 캐릭터 (OC)</div>
              {characters.length === 0 ? (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>OC 캐릭터가 없습니다.</span>
              ) : (
                <div className="lake-toggle-row">
                  {characters.map((c) => (
                    <LakeToggle
                      key={String(c.id)}
                      checked={selectedIds.has(String(c.id))}
                      onChange={() => toggleCharacter(String(c.id))}
                      label={c.name}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="trpg-edit-section">
              <div className="trpg-edit-section__title">완료 여부</div>
              <LakeToggle
                checked={!!form.cleared}
                onChange={(cleared) => setForm({ ...form, cleared })}
                label="CLEARED 스탬프 표시"
              />
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
              {(form.gallery ?? []).map((g, index) => (
                <div key={g.id} className="trpg-edit-card-item">
                  <div className="trpg-edit-card-item__head">
                    <span className="trpg-edit-card-item__label">{g.title || `이미지 ${index + 1}`}</span>
                    <button type="button" className="trpg-edit-mini-del" onClick={() => removeGallery(g.id)}>
                      ✕
                    </button>
                  </div>
                  <ImageFileField
                    label=""
                    value={g.img}
                    folder="site/trpg/gallery"
                    uploading={uploading}
                    onUploadStart={onUploadStart}
                    onUploadEnd={onUploadEnd}
                    onChange={(img) => updateGallery(g.id, { img })}
                  />
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
                      <input
                        className="form-input"
                        placeholder="작가/출처"
                        value={g.artist || ''}
                        onChange={(e) => updateGallery(g.id, { artist: e.target.value })}
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
                </div>
              ))}
            </div>
            <button type="button" className="trpg-edit-add-btn" onClick={addGalleryItem}>
              + 이미지 추가
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
              {item.comingSoon && (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>Coming Soon</div>
              )}
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

  return (
    <AdminPanelShell title="세계관 카드" onSave={() => onSave(form)} onDelete={onDelete}>
      <div className="lh-oc-admin-grid">
        <div className="form-group">
          <label className="form-label">이름</label>
          <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">아이콘</label>
          <input className="form-input" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">부제</label>
        <input className="form-input" value={form.sub} onChange={(e) => setForm({ ...form, sub: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label">링크 (비우면 Coming Soon)</label>
        <input className="form-input" value={form.href} onChange={(e) => setForm({ ...form, href: e.target.value })} />
      </div>
      <LakeToggle
        checked={!!form.comingSoon}
        onChange={(comingSoon) => setForm({ ...form, comingSoon })}
        label="Coming Soon (링크 비활성)"
      />
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
      title="Gallery — 갤러리"
      items={items}
      onSave={onSave}
      createItem={() => ({ id: newId(), title: '새 이미지', img: '', caption: '' })}
      renderFields={(form, setForm) => (
        <>
          <div className="form-group">
            <label className="form-label">제목</label>
            <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <ImageFileField value={form.img} folder="site/gallery" onChange={(img) => setForm({ ...form, img })} />
          <div className="form-group">
            <label className="form-label">캡션</label>
            <input
              className="form-input"
              value={form.caption || ''}
              onChange={(e) => setForm({ ...form, caption: e.target.value })}
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
              <div>{item.title}</div>
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
