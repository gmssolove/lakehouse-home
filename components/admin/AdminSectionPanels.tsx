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
  UniverseCard,
} from '@/lib/types/site-content';
import { newId } from '@/lib/types/site-content';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { useSaveToast } from '@/components/ui/SaveToast';
import { CLICK_SOUND_PRESETS, playClickSound } from '@/lib/sounds/clickSound';
import { CURSOR_PRESETS } from '@/lib/ui/cursorPresets';

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
          <div className="form-group">
            <label className="form-label">이미지 URL</label>
            <input className="form-input" value={form.img} onChange={(e) => setForm({ ...form, img: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">캡션</label>
            <input
              className="form-input"
              value={form.caption || ''}
              onChange={(e) => setForm({ ...form, caption: e.target.value })}
            />
          </div>
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

export function BgmAdminPanel({ data, onSave }: BgmProps) {
  const [form, setForm] = useState(data);
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

  return (
    <AdminPanelShell title="BGM — 배경음악" onSave={() => onSave(form)}>
      <p className="form-hint" style={{ marginBottom: '1rem', opacity: 0.72, fontSize: 13 }}>
        플레이리스트에 곡이 2개 이상이면 순서대로 재생되고, 끝나면 다음 곡으로 넘어갑니다.
      </p>
      <div className="form-group">
        <label className="form-label">기본 곡명 (단일 URL용)</label>
        <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label">기본 아티스트</label>
        <input className="form-input" value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label">기본 오디오 URL (플레이리스트 없을 때)</label>
        <input className="form-input" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
      </div>

      <div className="form-group">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <label className="form-label" style={{ margin: 0 }}>
            플레이리스트
          </label>
          <button
            type="button"
            className="btn-edit"
            onClick={() =>
              setForm({
                ...form,
                playlist: [...playlist, { title: '', artist: '', url: '' }],
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
                {i + 1}번 곡
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
            <div className="form-group">
              <label className="form-label">오디오 URL</label>
              <input
                className="form-input"
                value={track.url}
                onChange={(e) => updatePlaylistItem(i, { url: e.target.value })}
              />
            </div>
            <button
              type="button"
              className="btn-edit"
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

function AdminPanelShell({
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
