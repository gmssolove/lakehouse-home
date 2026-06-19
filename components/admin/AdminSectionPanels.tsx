'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
import { CLICK_SOUND_PRESETS, playClickSound } from '@/lib/sounds/clickSound';
import { CURSOR_PRESETS } from '@/lib/ui/cursorPresets';
import { SecretPostFields } from '@/components/ui/SecretPostFields';
import { ImageFileField } from '@/components/ui/ImageFileField';
import { TrpgThumbnailEditor } from '@/components/trpg/TrpgThumbnailEditor';
import { useOcData } from '@/lib/hooks/useOcData';
import { uploadMediaFile } from '@/lib/r2/client';
import { parseLogHtmlFile } from '@/lib/trpg/logImport';
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
      <div className="lh-admin-grid">
        <div>
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
        <div className="lh-oc-admin-block">
          {selected ? (
            <TrpgEditForm
              key={selected.id}
              item={selected}
              characters={characters}
              uploading={uploading}
              onUploadStart={() => setUploading(true)}
              onUploadEnd={() => setUploading(false)}
              onSave={(item) => persist(items.map((i) => (i.id === item.id ? item : i)))}
              onDelete={async () => {
                if (!(await confirm('이 시나리오를 삭제할까요?'))) return;
                await persist(items.filter((i) => i.id !== selected.id), 'delete');
                setEditId(null);
              }}
            />
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>시나리오를 선택하세요.</span>
          )}
        </div>
      </div>
    </>
  );
}

function TrpgEditForm({
  item,
  characters,
  uploading,
  onUploadStart,
  onUploadEnd,
  onSave,
  onDelete,
}: {
  item: TrpgScenario;
  characters: OcCharacter[];
  uploading: boolean;
  onUploadStart: () => void;
  onUploadEnd: () => void;
  onSave: (item: TrpgScenario) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState(item);

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

  function removeLog(id: string) {
    setForm({ ...form, logs: (form.logs ?? []).filter((l) => l.id !== id) });
  }

  async function importLogHtml(file: File) {
    try {
      const parsed = await parseLogHtmlFile(file);
      const log: TrpgSessionLog = {
        id: newId(),
        title: parsed.title,
        date: new Date().toISOString().slice(0, 10),
        body: parsed.body,
        html: parsed.html,
      };
      setForm((f) => ({ ...f, logs: [...(f.logs ?? []), log] }));
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

  async function uploadThumb(file: File) {
    onUploadStart();
    try {
      const url = await uploadMediaFile(file, 'site/trpg');
      setForm((f) => ({ ...f, thumbnail: url }));
    } catch (err) {
      alert(err instanceof Error ? err.message : '썸네일 업로드 실패');
    } finally {
      onUploadEnd();
    }
  }

  return (
    <AdminPanelShell title="시나리오 편집" onSave={() => onSave(form)} onDelete={onDelete}>
      <div className="form-group">
        <label className="form-label">시나리오 제목</label>
        <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label">부제</label>
        <input
          className="form-input"
          value={form.subtitle || ''}
          placeholder="부제를 입력합니다."
          onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
        />
      </div>
      <div className="lh-oc-admin-grid">
        <div className="form-group">
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
        <div className="form-group">
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
      <div className="form-group">
        <label className="form-label">썸네일 URL</label>
        <input
          className="form-input"
          value={form.thumbnail || ''}
          placeholder="공식 썸네일 URL"
          onChange={(e) => setForm({ ...form, thumbnail: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label className="form-label">썸네일 업로드</label>
        <label className="file-input-label" style={{ margin: 0, opacity: uploading ? 0.6 : 1 }}>
          {uploading ? '업로드 중…' : '📁 이미지 선택'}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadThumb(f);
              e.target.value = '';
            }}
          />
        </label>
        {form.thumbnail ? (
          <div style={{ marginTop: 8 }}>
            <TrpgThumbnailEditor
              src={form.thumbnail}
              frame={form.thumbnailFrame}
              onChange={(thumbnailFrame) => setForm((prev) => ({ ...prev, thumbnailFrame }))}
            />
          </div>
        ) : null}
      </div>
      <div className="lh-oc-admin-grid">
        <div className="form-group">
          <label className="form-label">w. (작가/크리에이터)</label>
          <input
            className="form-input"
            value={form.author || ''}
            placeholder="예: 티알생쥐"
            onChange={(e) => setForm({ ...form, author: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">KP</label>
          <input
            className="form-input"
            value={form.kp || ''}
            placeholder="예: 감자토스트"
            onChange={(e) => setForm({ ...form, kp: e.target.value })}
          />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">시스템</label>
        <input
          className="form-input"
          value={form.system || ''}
          placeholder="CoC, inSANe 등"
          onChange={(e) => setForm({ ...form, system: e.target.value })}
        />
      </div>
      <div className="lh-oc-admin-grid">
        <div className="form-group">
          <label className="form-label">플레이 시작일</label>
          <input
            className="form-input"
            type="date"
            value={form.dateStart || ''}
            onChange={(e) => setForm({ ...form, dateStart: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">플레이 종료일</label>
          <input
            className="form-input"
            type="date"
            value={form.dateEnd || ''}
            onChange={(e) => setForm({ ...form, dateEnd: e.target.value })}
          />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">플레이어 / HO (요약)</label>
        <textarea
          className="form-input"
          rows={2}
          value={form.players || ''}
          placeholder="KPC · PC 목록 요약"
          onChange={(e) => setForm({ ...form, players: e.target.value })}
        />
      </div>
      <div className="form-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="form-label" style={{ margin: 0 }}>
            탐사자 프로필
          </label>
          <button type="button" className="btn-edit" onClick={addPlayer}>
            + 탐사자
          </button>
        </div>
        {(form.playerProfiles ?? []).map((p) => (
          <div
            key={p.id}
            style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(215,169,130,0.12)' }}
          >
            <div className="lh-oc-admin-grid">
              <input
                className="form-input"
                placeholder="이름"
                value={p.name}
                onChange={(e) => updatePlayer(p.id, { name: e.target.value })}
              />
              <input
                className="form-input"
                placeholder="HO / 역할"
                value={p.role || ''}
                onChange={(e) => updatePlayer(p.id, { role: e.target.value })}
              />
            </div>
            <ImageFileField
              label="프로필 이미지"
              value={p.img || ''}
              folder="site/trpg/players"
              uploading={uploading}
              onUploadStart={onUploadStart}
              onUploadEnd={onUploadEnd}
              onChange={(img) => updatePlayer(p.id, { img })}
            />
            <textarea
              className="form-input"
              rows={2}
              placeholder="소개"
              value={p.bio || ''}
              onChange={(e) => updatePlayer(p.id, { bio: e.target.value })}
              style={{ marginTop: 6 }}
            />
            <button type="button" className="btn-del" style={{ marginTop: 6 }} onClick={() => removePlayer(p.id)}>
              삭제
            </button>
          </div>
        ))}
      </div>
      <div className="form-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="form-label" style={{ margin: 0 }}>
            탐사자 관계
          </label>
          <button type="button" className="btn-edit" onClick={addRelation}>
            + 관계
          </button>
        </div>
        {(form.relationships ?? []).map((rel) => (
          <div key={rel.id} className="lh-oc-admin-grid" style={{ marginBottom: 8 }}>
            <select
              className="form-input"
              value={rel.fromId}
              onChange={(e) => updateRelation(rel.id, { fromId: e.target.value })}
            >
              {(form.playerProfiles ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              className="form-input"
              placeholder="관계"
              value={rel.label || ''}
              onChange={(e) => updateRelation(rel.id, { label: e.target.value })}
            />
            <select
              className="form-input"
              value={rel.toId}
              onChange={(e) => updateRelation(rel.id, { toId: e.target.value })}
            >
              {(form.playerProfiles ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn-del" onClick={() => removeRelation(rel.id)}>
              삭제
            </button>
          </div>
        ))}
        <textarea
          className="form-input"
          rows={2}
          placeholder="관계도 메모"
          value={form.relationshipNotes || ''}
          onChange={(e) => setForm({ ...form, relationshipNotes: e.target.value })}
        />
      </div>
      <div className="form-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="form-label" style={{ margin: 0 }}>
            애프터 · 갤러리
          </label>
          <button type="button" className="btn-edit" onClick={addGalleryItem}>
            + 이미지
          </button>
        </div>
        {(form.gallery ?? []).map((g) => (
          <div key={g.id} style={{ marginBottom: 8 }}>
            <ImageFileField
              value={g.img}
              folder="site/trpg/gallery"
              uploading={uploading}
              onUploadStart={onUploadStart}
              onUploadEnd={onUploadEnd}
              onChange={(img) => updateGallery(g.id, { img })}
            />
            <div className="lh-oc-admin-grid" style={{ marginTop: 6 }}>
              <input
                className="form-input"
                placeholder="제목"
                value={g.title || ''}
                onChange={(e) => updateGallery(g.id, { title: e.target.value })}
              />
              <input
                className="form-input"
                placeholder="작가/출처"
                value={g.artist || ''}
                onChange={(e) => updateGallery(g.id, { artist: e.target.value })}
              />
            </div>
            <input
              className="form-input"
              placeholder="캡션"
              value={g.caption || ''}
              onChange={(e) => updateGallery(g.id, { caption: e.target.value })}
              style={{ marginTop: 6 }}
            />
            <button type="button" className="btn-del" style={{ marginTop: 6 }} onClick={() => removeGallery(g.id)}>
              삭제
            </button>
          </div>
        ))}
      </div>
      <div className="form-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="form-label" style={{ margin: 0 }}>
            주요 판정 · 다이스
          </label>
          <button type="button" className="btn-edit" onClick={addDiceHighlight}>
            + 판정
          </button>
        </div>
        {(form.diceHighlights ?? []).map((d) => (
          <div key={d.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(215,169,130,0.12)' }}>
            <input
              className="form-input"
              placeholder="제목 (예: SAN check)"
              value={d.title}
              onChange={(e) => updateDiceHighlight(d.id, { title: e.target.value })}
            />
            <div className="lh-oc-admin-grid" style={{ marginTop: 6 }}>
              <input
                className="form-input"
                placeholder="주사위 (예: 1d100 ≤ 50)"
                value={d.roll || ''}
                onChange={(e) => updateDiceHighlight(d.id, { roll: e.target.value })}
              />
              <input
                className="form-input"
                placeholder="세션 (예: 2회차)"
                value={d.session || ''}
                onChange={(e) => updateDiceHighlight(d.id, { session: e.target.value })}
              />
            </div>
            <input
              className="form-input"
              placeholder="결과 (예: 23 — 성공)"
              value={d.result || ''}
              onChange={(e) => updateDiceHighlight(d.id, { result: e.target.value })}
              style={{ marginTop: 6 }}
            />
            <textarea
              className="form-input"
              rows={2}
              placeholder="메모"
              value={d.note || ''}
              onChange={(e) => updateDiceHighlight(d.id, { note: e.target.value })}
              style={{ marginTop: 6 }}
            />
            <button type="button" className="btn-del" style={{ marginTop: 6 }} onClick={() => removeDiceHighlight(d.id)}>
              삭제
            </button>
          </div>
        ))}
      </div>
      <div className="form-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="form-label" style={{ margin: 0 }}>
            핸드아웃
          </label>
          <button type="button" className="btn-edit" onClick={addHandout}>
            + 핸드아웃
          </button>
        </div>
        {(form.handouts ?? []).map((h) => (
          <div key={h.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(215,169,130,0.12)' }}>
            <input
              className="form-input"
              placeholder="제목"
              value={h.title}
              onChange={(e) => updateHandout(h.id, { title: e.target.value })}
            />
            <ImageFileField
              label="핸드아웃 이미지"
              value={h.img || ''}
              folder="site/trpg/handouts"
              uploading={uploading}
              onUploadStart={onUploadStart}
              onUploadEnd={onUploadEnd}
              onChange={(img) => updateHandout(h.id, { img })}
            />
            <textarea
              className="form-input"
              rows={3}
              placeholder="본문"
              value={h.body || ''}
              onChange={(e) => updateHandout(h.id, { body: e.target.value })}
              style={{ marginTop: 6 }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!h.spoiler}
                onChange={(e) => updateHandout(h.id, { spoiler: e.target.checked })}
              />
              스포일러 (탭하여 공개)
            </label>
            <button type="button" className="btn-del" style={{ marginTop: 6 }} onClick={() => removeHandout(h.id)}>
              삭제
            </button>
          </div>
        ))}
      </div>
      <div className="form-group">
        <label className="form-label">아카이브 소개</label>
        <textarea
          className="form-input"
          rows={4}
          value={form.summary || ''}
          placeholder="시나리오 요약·후기 등"
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label className="form-label">연결 캐릭터 (OC)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 140, overflow: 'auto' }}>
          {characters.length === 0 ? (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>OC 캐릭터가 없습니다.</span>
          ) : (
            characters.map((c) => (
              <label
                key={String(c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(String(c.id))}
                  onChange={() => toggleCharacter(String(c.id))}
                />
                {c.name}
              </label>
            ))
          )}
        </div>
      </div>
      <div className="form-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="form-label" style={{ margin: 0 }}>
            세션 로그
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <label className="btn-edit" style={{ cursor: 'pointer', margin: 0 }}>
              HTML 불러오기
              <input
                type="file"
                accept=".html,.htm,text/html"
                multiple
                hidden
                onChange={(e) => {
                  const files = e.target.files;
                  if (files) {
                    void Promise.all([...files].map((f) => importLogHtml(f)));
                  }
                  e.target.value = '';
                }}
              />
            </label>
            <button type="button" className="btn-edit" onClick={addLog}>
              + 로그
            </button>
          </div>
        </div>
        {(form.logs ?? []).map((log) => (
          <div
            key={log.id}
            className="trpg-log-admin-card"
            style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(215,169,130,0.12)' }}
          >
            <div className="lh-oc-admin-grid">
              <input
                className="form-input"
                placeholder="제목"
                value={log.title}
                onChange={(e) => updateLog(log.id, { title: e.target.value })}
              />
              <input
                className="form-input"
                placeholder="부제 (캠페인)"
                value={log.subtitle || ''}
                onChange={(e) => updateLog(log.id, { subtitle: e.target.value })}
              />
            </div>
            <div className="lh-oc-admin-grid" style={{ marginTop: 6 }}>
              <input
                className="form-input"
                type="date"
                value={log.date || ''}
                onChange={(e) => updateLog(log.id, { date: e.target.value })}
              />
              <input
                className="form-input"
                placeholder="태그 (쉼표)"
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
            <ImageFileField
              label="로그 썸네일"
              value={log.thumbnail || ''}
              folder="site/trpg/logs"
              uploading={uploading}
              onUploadStart={onUploadStart}
              onUploadEnd={onUploadEnd}
              onChange={(thumbnail) => updateLog(log.id, { thumbnail })}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11 }}>
              <input
                type="checkbox"
                checked={!!log.thumbnailSpoiler}
                onChange={(e) => updateLog(log.id, { thumbnailSpoiler: e.target.checked })}
              />
              썸네일 스포일러
            </label>
            <textarea
              className="form-input"
              rows={2}
              placeholder="요약"
              value={log.summary || ''}
              onChange={(e) => updateLog(log.id, { summary: e.target.value })}
              style={{ marginTop: 6 }}
            />
            <div style={{ marginTop: 6, fontSize: 11 }}>탐사자 아바타</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(form.playerProfiles ?? []).map((p) => (
                <label key={p.id} style={{ fontSize: 10, display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={(log.playerIds ?? []).includes(p.id)}
                    onChange={(e) => {
                      const ids = new Set(log.playerIds ?? []);
                      if (e.target.checked) ids.add(p.id);
                      else ids.delete(p.id);
                      updateLog(log.id, { playerIds: [...ids] });
                    }}
                  />
                  {p.name}
                </label>
              ))}
            </div>
            <label className="btn-edit" style={{ cursor: 'pointer', marginTop: 8, display: 'inline-block' }}>
              HTML 추가
              <input
                type="file"
                accept=".html,.htm,text/html"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importLogHtml(f);
                  e.target.value = '';
                }}
              />
            </label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="로그 내용"
              value={log.body}
              onChange={(e) => updateLog(log.id, { body: e.target.value })}
              style={{ marginTop: 6 }}
            />
            <SecretPostFields
              value={log}
              onChange={(patch) => updateLog(log.id, patch)}
            />
            <button type="button" className="btn-del" style={{ marginTop: 6 }} onClick={() => removeLog(log.id)}>
              삭제
            </button>
          </div>
        ))}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        <input
          type="checkbox"
          checked={!!form.cleared}
          onChange={(e) => setForm({ ...form, cleared: e.target.checked })}
        />
        CLEARED 스탬프 표시
      </label>
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
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        <input
          type="checkbox"
          checked={!!form.comingSoon}
          onChange={(e) => setForm({ ...form, comingSoon: e.target.checked })}
        />
        Coming Soon (링크 비활성)
      </label>
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
  return (
    <MediaListAdminPanel
      title="Banner — 배너"
      items={items}
      onSave={onSave}
      createItem={() => ({ id: newId(), title: '새 배너', img: '', href: '', ownerName: '' })}
      renderFields={(form, setForm) => (
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
            <img
              src={form.img}
              alt=""
              style={{ maxWidth: '100%', maxHeight: 140, objectFit: 'contain', marginBottom: 8 }}
            />
          ) : null}
          <div className="form-group">
            <label className="form-label">링크</label>
            <input className="form-input" value={form.href || ''} onChange={(e) => setForm({ ...form, href: e.target.value })} />
          </div>
        </>
      )}
    />
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
      <div className="form-group">
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
        <label className="form-label">
          <input
            type="checkbox"
            checked={form.pvIntroEnabled}
            onChange={(e) => setForm({ ...form, pvIntroEnabled: e.target.checked })}
            style={{ marginRight: 8 }}
          />
          PV 인트로 연출 사용
        </label>
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
        <label className="form-label">
          <input
            type="checkbox"
            checked={form.autoResumeMainBgm}
            onChange={(e) => setForm({ ...form, autoResumeMainBgm: e.target.checked })}
            style={{ marginRight: 8 }}
          />
          OC 상세 이탈 시 메인 BGM 자동 재개
        </label>
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
        <label className="form-label">
          <input
            type="checkbox"
            checked={form.clickSoundEnabled}
            onChange={(e) => setForm({ ...form, clickSoundEnabled: e.target.checked })}
            style={{ marginRight: 8 }}
          />
          클릭 효과음
        </label>
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
          <label className="form-label">
            <input
              type="checkbox"
              checked={form.customCursorEnabled}
              onChange={(e) => setForm({ ...form, customCursorEnabled: e.target.checked })}
              style={{ marginRight: 8 }}
            />
            커스텀 커서 사용
          </label>
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
        <label className="form-label">
          <input
            type="checkbox"
            checked={form.clickRippleEnabled}
            onChange={(e) => setForm({ ...form, clickRippleEnabled: e.target.checked })}
            style={{ marginRight: 8 }}
          />
          클릭 리플 이펙트
        </label>
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
