'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_REVIEW_CATEGORIES,
  DEFAULT_SCRAP_CATEGORIES,
  DEFAULT_SITE_GUEST_SETTINGS,
  newId,
  type CharArchiveItem,
  type LakeAccessScope,
  type MusicPlaylist,
  type MusicTrack,
  type ReviewCategory,
  type ReviewItem,
  type QuoteItem,
  type ScrapCategory,
  type ScrapItem,
  type SiteAccessSettings,
  type SiteGuestSettings,
  type TimelinePost,
} from '@/lib/types/site-content';
import { DEFAULT_SITE_ACCESS_SETTINGS } from '@/lib/types/secret-content';
import { ImageFileField } from '@/components/ui/ImageFileField';
import { LakeToggle } from '@/components/ui/LakeToggle';
import { SecretPostFields } from '@/components/ui/SecretPostFields';
import { finalizeCommaList, splitCommaListLive } from '@/lib/ui/commaList';
import { uploadMediaFile } from '@/lib/r2/client';
import { normalizeUploadFile } from '@/lib/r2/mime';
import { useSaveToast } from '@/components/ui/SaveToast';
import { AdminPanelShell } from '@/components/admin/AdminSectionPanels';

type AccessProps = { data: SiteAccessSettings; onSave: (next: SiteAccessSettings) => Promise<void> };

const SCOPE_LABELS: Record<LakeAccessScope, string> = {
  oc: 'OC 프로필',
  trpg: 'TRPG 아카이브',
  diary: 'Records · Diary',
  scrap: 'Records · Scrap',
  review: 'Records · Review',
  music: 'Records · Music',
  charArchive: 'Character · Archive',
  notice: 'Notice',
  gallery: 'Records · Gallery',
  quote: 'Records · Quote',
};

export function AccessAdminPanel({ data, onSave }: AccessProps) {
  const { showSaveToast } = useSaveToast();
  const [form, setForm] = useState({ ...DEFAULT_SITE_ACCESS_SETTINGS, ...data });

  return (
    <AdminPanelShell
      title="접근 · 비밀번호"
      onSave={async () => {
        await onSave(form);
        showSaveToast();
      }}
    >
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
        섹션별 기본 비밀번호입니다. 비밀글 항목에서 개별 비밀번호를 지정하면 그 값이 우선합니다. 비워 두면 해당 섹션
        기본 잠금이 없습니다 (비밀글만 잠금).
      </p>
      {(Object.keys(SCOPE_LABELS) as LakeAccessScope[]).map((scope) => (
        <div key={scope} className="form-group">
          <label className="form-label">{SCOPE_LABELS[scope]}</label>
          <input
            className="form-input"
            type="password"
            value={form[scope]}
            onChange={(e) => setForm({ ...form, [scope]: e.target.value })}
            placeholder="기본 비밀번호"
          />
        </div>
      ))}
    </AdminPanelShell>
  );
}

type ScrapProps = {
  items: ScrapItem[];
  categories: ScrapCategory[];
  onSave: (next: ScrapItem[]) => Promise<void>;
  onSaveCategories: (next: ScrapCategory[]) => Promise<void>;
};

export function ScrapAdminPanel({ items, categories, onSave, onSaveCategories }: ScrapProps) {
  const { showSaveToast, showDeleteToast } = useSaveToast();
  const [editId, setEditId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cats, setCats] = useState(categories.length ? categories : DEFAULT_SCRAP_CATEGORIES);
  const selected = items.find((i) => i.id === editId);

  useEffect(() => {
    setCats(categories.length ? categories : DEFAULT_SCRAP_CATEGORIES);
  }, [categories]);

  function add() {
    const item: ScrapItem = {
      id: newId(),
      author: '작성자',
      body: '',
      date: new Date().toISOString().slice(0, 10),
    };
    void onSave([...items, item]);
    setEditId(item.id);
    showSaveToast();
  }

  return (
    <>
      <AdminPanelShell
        title="스크랩 카테고리"
        onSave={async () => {
          await onSaveCategories(cats);
          showSaveToast();
        }}
      >
        {cats.map((c, idx) => (
          <div key={c.id} className="lh-oc-admin-grid" style={{ marginBottom: 6 }}>
            <input
              className="form-input"
              value={c.label}
              onChange={(e) => setCats(cats.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))}
            />
            {c.id !== 'all' ? (
              <button type="button" className="btn-del" onClick={() => setCats(cats.filter((_, i) => i !== idx))}>
                삭제
              </button>
            ) : (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>기본</span>
            )}
          </div>
        ))}
        <button
          type="button"
          className="btn-edit"
          onClick={() => setCats([...cats, { id: newId(), label: '새 카테고리' }])}
        >
          + 카테고리
        </button>
      </AdminPanelShell>
      <div style={{ height: 12 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.75rem' }}>
        <span style={{ fontSize: 12, color: 'var(--lake-copper-soft, var(--pink))' }}>Scrap</span>
        <button type="button" className="btn-save" onClick={add}>
          + 스크랩
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
              <div>{item.author}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{item.date}</div>
            </div>
          ))}
        </div>
        <div className="lh-oc-admin-block">
          {selected ? (
            <ScrapEditForm
              key={selected.id}
              item={selected}
              categories={cats.filter((c) => c.id !== 'all')}
              uploading={uploading}
              onUploadStart={() => setUploading(true)}
              onUploadEnd={() => setUploading(false)}
              onSave={(item) => void onSave(items.map((i) => (i.id === item.id ? item : i)))}
              onDelete={() => {
                void onSave(items.filter((i) => i.id !== selected.id));
                showDeleteToast();
                setEditId(null);
              }}
            />
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>항목 선택</span>
          )}
        </div>
      </div>
    </>
  );
}

function ScrapEditForm({
  item,
  categories,
  uploading,
  onUploadStart,
  onUploadEnd,
  onSave,
  onDelete,
}: {
  item: ScrapItem;
  categories: ScrapCategory[];
  uploading: boolean;
  onUploadStart: () => void;
  onUploadEnd: () => void;
  onSave: (item: ScrapItem) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState(item);
  return (
    <AdminPanelShell title="스크랩 편집" onSave={() => onSave(form)} onDelete={onDelete}>
      <div className="lh-oc-admin-grid">
        <input className="form-input" placeholder="작성자" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
        <input className="form-input" placeholder="핸들" value={form.handle || ''} onChange={(e) => setForm({ ...form, handle: e.target.value })} />
      </div>
      <input className="form-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={{ marginTop: 6 }} />
      <textarea className="form-input" rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} style={{ marginTop: 6 }} />
      <ImageFileField label="아바타" value={form.avatarUrl || ''} folder="site/scrap" uploading={uploading} onUploadStart={onUploadStart} onUploadEnd={onUploadEnd} onChange={(avatarUrl) => setForm({ ...form, avatarUrl })} />
      <ImageFileField label="첨부 이미지" value={form.imageUrl || ''} folder="site/scrap" uploading={uploading} onUploadStart={onUploadStart} onUploadEnd={onUploadEnd} onChange={(imageUrl) => setForm({ ...form, imageUrl })} />
      <input className="form-input" placeholder="원문 URL" value={form.sourceUrl || ''} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} style={{ marginTop: 6 }} />
      <div className="form-group" style={{ marginTop: 8 }}>
        <label className="form-label">카테고리</label>
        <select
          className="form-input"
          value={form.categoryId || ''}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value || undefined })}
        >
          <option value="">선택 안 함</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '12px 0 6px' }}>인용 트윗 (선택)</p>
      <div className="lh-oc-admin-grid">
        <input className="form-input" placeholder="인용 닉네임" value={form.quotedAuthor || ''} onChange={(e) => setForm({ ...form, quotedAuthor: e.target.value })} />
        <input className="form-input" placeholder="인용 @핸들" value={form.quotedHandle || ''} onChange={(e) => setForm({ ...form, quotedHandle: e.target.value })} />
      </div>
      <ImageFileField label="인용 아바타" value={form.quotedAvatarUrl || ''} folder="site/scrap" uploading={uploading} onUploadStart={onUploadStart} onUploadEnd={onUploadEnd} onChange={(quotedAvatarUrl) => setForm({ ...form, quotedAvatarUrl })} />
      <textarea className="form-input" rows={3} placeholder="인용 본문" value={form.quotedBody || ''} onChange={(e) => setForm({ ...form, quotedBody: e.target.value })} style={{ marginTop: 6 }} />
      <ImageFileField label="인용 이미지" value={form.quotedImageUrl || ''} folder="site/scrap" uploading={uploading} onUploadStart={onUploadStart} onUploadEnd={onUploadEnd} onChange={(quotedImageUrl) => setForm({ ...form, quotedImageUrl })} />
      <SecretPostFields value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
    </AdminPanelShell>
  );
}

type ReviewProps = {
  categories: ReviewCategory[];
  items: ReviewItem[];
  onSaveCategories: (next: ReviewCategory[]) => Promise<void>;
  onSaveItems: (next: ReviewItem[]) => Promise<void>;
};

export function ReviewAdminPanel({ categories, items, onSaveCategories, onSaveItems }: ReviewProps) {
  const { showSaveToast } = useSaveToast();
  const [editId, setEditId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cats, setCats] = useState(categories.length ? categories : DEFAULT_REVIEW_CATEGORIES);
  const selected = items.find((i) => i.id === editId);

  return (
    <>
      <AdminPanelShell
        title="리뷰 카테고리"
        onSave={async () => {
          await onSaveCategories(cats);
          showSaveToast();
        }}
      >
        {cats.map((c, idx) => (
          <div key={c.id} className="lh-oc-admin-grid" style={{ marginBottom: 6 }}>
            <input className="form-input" value={c.label} onChange={(e) => setCats(cats.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))} />
            <button type="button" className="btn-del" onClick={() => setCats(cats.filter((_, i) => i !== idx))}>
              삭제
            </button>
          </div>
        ))}
        <button type="button" className="btn-edit" onClick={() => setCats([...cats, { id: newId(), label: '새 카테고리', kind: 'custom' }])}>
          + 카테고리
        </button>
      </AdminPanelShell>
      <div style={{ height: 16 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.75rem' }}>
        <span style={{ fontSize: 12, color: 'var(--lake-copper-soft, var(--pink))' }}>Review</span>
        <button
          type="button"
          className="btn-save"
          onClick={() => {
            const item: ReviewItem = {
              id: newId(),
              title: '새 리뷰',
              categoryId: cats[0]?.id || 'book',
              rating: 5,
              date: new Date().toISOString().slice(0, 10),
            };
            void onSaveItems([...items, item]);
            setEditId(item.id);
            showSaveToast();
          }}
        >
          + 리뷰
        </button>
      </div>
      <div className="lh-admin-grid">
        <div>
          {items.map((item) => (
            <div key={item.id} className={`char-list-item${editId === item.id ? ' selected' : ''}`} onClick={() => setEditId(item.id)}>
              <div>{item.title}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                {Number.isInteger(item.rating) ? item.rating : item.rating.toFixed(1)}점
              </div>
            </div>
          ))}
        </div>
        <div className="lh-oc-admin-block">
          {selected ? (
            <ReviewEditForm
              key={selected.id}
              item={selected}
              categories={cats}
              uploading={uploading}
              onUploadStart={() => setUploading(true)}
              onUploadEnd={() => setUploading(false)}
              onSave={(item) => void onSaveItems(items.map((i) => (i.id === item.id ? item : i)))}
              onDelete={() => {
                void onSaveItems(items.filter((i) => i.id !== selected.id));
                setEditId(null);
              }}
            />
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>항목 선택</span>
          )}
        </div>
      </div>
    </>
  );
}

function ReviewEditForm({
  item,
  categories,
  uploading,
  onUploadStart,
  onUploadEnd,
  onSave,
  onDelete,
}: {
  item: ReviewItem;
  categories: ReviewCategory[];
  uploading: boolean;
  onUploadStart: () => void;
  onUploadEnd: () => void;
  onSave: (item: ReviewItem) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState(item);
  return (
    <AdminPanelShell
      title="리뷰 편집"
      onSave={() =>
        onSave({
          ...form,
          rating: Math.min(5, Math.max(0.5, Math.round(Number(form.rating) * 2) / 2)),
          genres: finalizeCommaList(form.genres),
          tags: finalizeCommaList(form.tags),
        })
      }
      onDelete={onDelete}
    >
      <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <select className="form-input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} style={{ marginTop: 6 }}>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <div className="lh-oc-admin-grid" style={{ marginTop: 6 }}>
        <input
          className="form-input"
          type="number"
          min={0.5}
          max={5}
          step={0.5}
          value={form.rating}
          onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
          aria-label="별점"
        />
        <select
          className="form-input"
          value={form.status || ''}
          onChange={(e) => setForm({ ...form, status: e.target.value || undefined })}
          aria-label="감상 상태"
        >
          <option value="">상태 없음</option>
          <option value="watching">감상 중</option>
          <option value="done">완결</option>
          <option value="oneshot">단편</option>
        </select>
      </div>
      <div className="lh-oc-admin-grid" style={{ marginTop: 6 }}>
        <input
          className="form-input"
          placeholder="연도"
          value={form.year || ''}
          onChange={(e) => setForm({ ...form, year: e.target.value })}
        />
        <input
          className="form-input"
          placeholder="장르 (쉼표 구분)"
          value={(form.genres ?? []).join(', ')}
          onChange={(e) =>
            setForm({
              ...form,
              genres: splitCommaListLive(e.target.value),
            })
          }
        />
      </div>
      <input
        className="form-input"
        placeholder="감독·제작 등"
        value={form.author || ''}
        onChange={(e) => setForm({ ...form, author: e.target.value })}
        style={{ marginTop: 6 }}
      />
      <input
        className="form-input"
        placeholder="한줄 코멘트"
        value={form.highlight || ''}
        onChange={(e) => setForm({ ...form, highlight: e.target.value })}
        style={{ marginTop: 6 }}
      />
      <ImageFileField value={form.coverUrl || ''} folder="site/review" uploading={uploading} onUploadStart={onUploadStart} onUploadEnd={onUploadEnd} onChange={(coverUrl) => setForm({ ...form, coverUrl })} />
      <input
        className="form-input"
        placeholder="태그 (쉼표 구분)"
        value={(form.tags ?? []).join(', ')}
        onChange={(e) => setForm({ ...form, tags: splitCommaListLive(e.target.value) })}
        style={{ marginTop: 6 }}
      />
      <textarea className="form-input" rows={4} placeholder="리뷰 본문" value={form.body || ''} onChange={(e) => setForm({ ...form, body: e.target.value })} style={{ marginTop: 6 }} />
      <SecretPostFields value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
    </AdminPanelShell>
  );
}

type QuoteProps = {
  items: QuoteItem[];
  onSave: (next: QuoteItem[]) => Promise<void>;
};

export function QuoteAdminPanel({ items, onSave }: QuoteProps) {
  const { showSaveToast, showDeleteToast } = useSaveToast();
  const [editId, setEditId] = useState<string | null>(null);
  const selected = items.find((i) => i.id === editId);

  function add() {
    const item: QuoteItem = {
      id: newId(),
      text: '',
      category: 'poem',
      date: new Date().toISOString().slice(0, 10),
    };
    void onSave([item, ...items]);
    setEditId(item.id);
    showSaveToast();
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.75rem' }}>
        <span style={{ fontSize: 12, color: 'var(--lake-copper-soft, var(--pink))' }}>Quote</span>
        <button type="button" className="btn-save" onClick={add}>
          + 인용
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
              <div>{item.text.slice(0, 40) || '(빈 인용)'}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                {[
                  item.category === 'poem' ? '시' : item.category === 'lyrics' ? '가사' : item.category === 'sentence' ? '문장' : null,
                  item.author,
                  item.work,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          ))}
        </div>
        <div className="lh-oc-admin-block">
          {selected ? (
            <QuoteEditForm
              key={selected.id}
              item={selected}
              onSave={(item) => {
                void onSave(items.map((i) => (i.id === item.id ? item : i)));
                showSaveToast();
              }}
              onDelete={() => {
                void onSave(items.filter((i) => i.id !== selected.id));
                setEditId(null);
                showDeleteToast();
              }}
            />
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>항목 선택</span>
          )}
        </div>
      </div>
    </>
  );
}

function QuoteEditForm({
  item,
  onSave,
  onDelete,
}: {
  item: QuoteItem;
  onSave: (item: QuoteItem) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState(item);
  return (
    <AdminPanelShell title="인용 편집" onSave={() => onSave(form)} onDelete={onDelete}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {(
          [
            { id: 'poem', label: '시' },
            { id: 'lyrics', label: '가사' },
            { id: 'sentence', label: '문장' },
          ] as const
        ).map((c) => (
          <button
            key={c.id}
            type="button"
            className="btn-save"
            style={{
              opacity: form.category === c.id ? 1 : 0.5,
              background: form.category === c.id ? undefined : 'transparent',
              border: '1px solid rgba(201,161,92,0.35)',
            }}
            onClick={() => setForm({ ...form, category: c.id })}
          >
            {c.label}
          </button>
        ))}
      </div>
      <textarea
        className="form-input"
        rows={5}
        placeholder="인용 문구"
        value={form.text}
        onChange={(e) => setForm({ ...form, text: e.target.value })}
      />
      <div className="lh-oc-admin-grid" style={{ marginTop: 6 }}>
        <input
          className="form-input"
          placeholder="작가"
          value={form.author || ''}
          onChange={(e) => setForm({ ...form, author: e.target.value })}
        />
        <input
          className="form-input"
          placeholder="작품명"
          value={form.work || ''}
          onChange={(e) => setForm({ ...form, work: e.target.value })}
        />
      </div>
      <input
        className="form-input"
        placeholder="메모 (선택)"
        value={form.note || ''}
        onChange={(e) => setForm({ ...form, note: e.target.value })}
        style={{ marginTop: 6 }}
      />
      <input
        className="form-input"
        type="date"
        value={form.date || ''}
        onChange={(e) => setForm({ ...form, date: e.target.value })}
        style={{ marginTop: 6 }}
      />
      <SecretPostFields value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
    </AdminPanelShell>
  );
}

type MusicProps = {
  tracks: MusicTrack[];
  playlists: MusicPlaylist[];
  onSaveTracks: (next: MusicTrack[]) => Promise<void>;
  onSavePlaylists: (next: MusicPlaylist[]) => Promise<void>;
};

export function MusicAdminPanel({ tracks, playlists, onSaveTracks, onSavePlaylists }: MusicProps) {
  const { showSaveToast } = useSaveToast();
  const [trackEditId, setTrackEditId] = useState<string | null>(null);
  const [plEditId, setPlEditId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const trackSel = tracks.find((t) => t.id === trackEditId);
  const plSel = playlists.find((p) => p.id === plEditId);

  async function saveTrack(item: MusicTrack) {
    await onSaveTracks(tracks.map((t) => (t.id === item.id ? item : t)));
    if (item.fileUrl?.trim()) {
      const targetPlId = plEditId ?? playlists[0]?.id;
      if (targetPlId) {
        const pl = playlists.find((p) => p.id === targetPlId);
        if (pl && !(pl.trackIds ?? []).includes(item.id)) {
          await onSavePlaylists(
            playlists.map((p) =>
              p.id === targetPlId ? { ...p, trackIds: [...(p.trackIds ?? []), item.id] } : p,
            ),
          );
        }
      }
    }
    showSaveToast();
  }

  async function savePlaylist(item: MusicPlaylist) {
    await onSavePlaylists(playlists.map((p) => (p.id === item.id ? item : p)));
    showSaveToast();
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.75rem' }}>
        <span style={{ fontSize: 12 }}>Music · Tracks</span>
        <button
          type="button"
          className="btn-save"
          onClick={() => {
            const t: MusicTrack = { id: newId(), title: '새 곡', artist: '', fileUrl: '' };
            void (async () => {
              await onSaveTracks([...tracks, t]);
              if (playlists.length) {
                const targetPlId = plEditId ?? playlists[0].id;
                await onSavePlaylists(
                  playlists.map((p) =>
                    p.id === targetPlId ? { ...p, trackIds: [...(p.trackIds ?? []), t.id] } : p,
                  ),
                );
              }
              setTrackEditId(t.id);
              showSaveToast();
            })();
          }}
        >
          + 곡
        </button>
      </div>
      <div className="lh-admin-grid">
        <div>
          {tracks.map((t) => (
            <div key={t.id} className={`char-list-item${trackEditId === t.id ? ' selected' : ''}`} onClick={() => setTrackEditId(t.id)}>
              {t.title}
            </div>
          ))}
        </div>
        <div className="lh-oc-admin-block">
          {trackSel ? (
            <TrackEditForm
              key={trackSel.id}
              item={trackSel}
              uploading={uploading}
              onUploadStart={() => setUploading(true)}
              onUploadEnd={() => setUploading(false)}
              onSave={(item) => void saveTrack(item)}
              onDelete={() => {
                void onSaveTracks(tracks.filter((t) => t.id !== trackSel.id));
                setTrackEditId(null);
              }}
            />
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>곡 선택</span>
          )}
        </div>
      </div>
      <div style={{ height: 20 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.75rem' }}>
        <span style={{ fontSize: 12 }}>Playlists</span>
        <button
          type="button"
          className="btn-save"
          onClick={() => {
            const p: MusicPlaylist = { id: newId(), title: '새 플레이리스트', trackIds: [] };
            void onSavePlaylists([...playlists, p]);
            setPlEditId(p.id);
            showSaveToast();
          }}
        >
          + 플레이리스트
        </button>
      </div>
      <div className="lh-admin-grid">
        <div>
          {playlists.map((p) => (
            <div key={p.id} className={`char-list-item${plEditId === p.id ? ' selected' : ''}`} onClick={() => setPlEditId(p.id)}>
              {p.title}
            </div>
          ))}
        </div>
        <div className="lh-oc-admin-block">
          {plSel ? (
            <PlaylistEditForm
              key={plSel.id}
              item={plSel}
              tracks={tracks}
              uploading={uploading}
              onUploadStart={() => setUploading(true)}
              onUploadEnd={() => setUploading(false)}
              onSave={(item) => void savePlaylist(item)}
              onDelete={() => {
                void onSavePlaylists(playlists.filter((p) => p.id !== plSel.id));
                setPlEditId(null);
              }}
            />
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>플레이리스트 선택</span>
          )}
        </div>
      </div>
    </>
  );
}

function TrackEditForm({
  item,
  uploading,
  onUploadStart,
  onUploadEnd,
  onSave,
  onDelete,
}: {
  item: MusicTrack;
  uploading: boolean;
  onUploadStart: () => void;
  onUploadEnd: () => void;
  onSave: (item: MusicTrack) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState(item);

  async function uploadAudio(file: File) {
    onUploadStart();
    try {
      const normalized = normalizeUploadFile(file, 'audio/mpeg');
      const url = await uploadMediaFile(normalized, 'site/music');
      const next = { ...form, fileUrl: url };
      setForm(next);
      onSave(next);
    } catch (err) {
      alert(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      onUploadEnd();
    }
  }

  return (
    <AdminPanelShell title="곡 편집" onSave={() => onSave(form)} onDelete={onDelete}>
      <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <input className="form-input" value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} style={{ marginTop: 6 }} />
      <label className="file-input-label" style={{ marginTop: 8, display: 'block' }}>
        🎵 오디오 파일
        <input type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAudio(f); e.target.value = ''; }} />
      </label>
      {form.fileUrl ? <audio controls src={form.fileUrl} style={{ width: '100%', marginTop: 6 }} /> : null}
      <ImageFileField value={form.coverUrl || ''} folder="site/music" uploading={uploading} onUploadStart={onUploadStart} onUploadEnd={onUploadEnd} onChange={(coverUrl) => setForm({ ...form, coverUrl })} />
      <textarea className="form-input" rows={6} placeholder="가사 (전체)" value={form.lyrics || ''} onChange={(e) => setForm({ ...form, lyrics: e.target.value })} style={{ marginTop: 6 }} />
      <textarea
        className="form-input"
        rows={4}
        placeholder="가사 타이밍 (초|가사 줄마다)"
        value={(form.lyricLines ?? []).map((l) => `${l.time}|${l.text}`).join('\n')}
        onChange={(e) =>
          setForm({
            ...form,
            lyricLines: e.target.value
              .split('\n')
              .map((line) => {
                const [t, ...rest] = line.split('|');
                const time = Number(t);
                if (!Number.isFinite(time)) return null;
                return { time, text: rest.join('|').trim() };
              })
              .filter((l): l is { time: number; text: string } => !!l && !!l.text),
          })
        }
        style={{ marginTop: 6 }}
      />
      <SecretPostFields value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
    </AdminPanelShell>
  );
}

function PlaylistEditForm({
  item,
  tracks,
  uploading,
  onUploadStart,
  onUploadEnd,
  onSave,
  onDelete,
}: {
  item: MusicPlaylist;
  tracks: MusicTrack[];
  uploading: boolean;
  onUploadStart: () => void;
  onUploadEnd: () => void;
  onSave: (item: MusicPlaylist) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState({ ...item, trackIds: item.trackIds ?? [] });

  function moveTrack(id: string, dir: -1 | 1) {
    const ids = [...(form.trackIds ?? [])];
    const idx = ids.indexOf(id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= ids.length) return;
    [ids[idx], ids[next]] = [ids[next], ids[idx]];
    setForm({ ...form, trackIds: ids });
  }

  return (
    <AdminPanelShell title="플레이리스트" onSave={() => onSave(form)} onDelete={onDelete}>
      <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <textarea className="form-input" rows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ marginTop: 6 }} />
      <ImageFileField value={form.coverUrl || ''} folder="site/music" uploading={uploading} onUploadStart={onUploadStart} onUploadEnd={onUploadEnd} onChange={(coverUrl) => setForm({ ...form, coverUrl })} />
      <div style={{ marginTop: 10, fontSize: 11 }}>수록곡 (체크 + 순서)</div>
      {tracks.map((t) => {
        const checked = (form.trackIds ?? []).includes(t.id);
        return (
          <div key={t.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
            <LakeToggle
              checked={checked}
              onChange={(next) => {
                const ids = next
                  ? [...(form.trackIds ?? []), t.id]
                  : (form.trackIds ?? []).filter((id) => id !== t.id);
                const updated = { ...form, trackIds: ids };
                setForm(updated);
                onSave(updated);
              }}
              label={t.title}
            />
            {checked ? (
              <>
                <button type="button" className="btn-edit" onClick={() => moveTrack(t.id, -1)}>
                  ↑
                </button>
                <button type="button" className="btn-edit" onClick={() => moveTrack(t.id, 1)}>
                  ↓
                </button>
              </>
            ) : null}
          </div>
        );
      })}
      <SecretPostFields value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
    </AdminPanelShell>
  );
}

type CharArchiveProps = { items: CharArchiveItem[]; onSave: (next: CharArchiveItem[]) => Promise<void> };

export function CharArchiveAdminPanel({ items, onSave }: CharArchiveProps) {
  const [editId, setEditId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const selected = items.find((i) => i.id === editId);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.75rem' }}>
        <span style={{ fontSize: 12 }}>Character Archive</span>
        <button
          type="button"
          className="btn-save"
          onClick={() => {
            const item: CharArchiveItem = {
              id: newId(),
              title: '새 글',
              kind: 'story',
              body: '',
              date: new Date().toISOString().slice(0, 10),
            };
            void onSave([...items, item]);
            setEditId(item.id);
          }}
        >
          + 추가
        </button>
      </div>
      <div className="lh-admin-grid">
        <div>
          {items.map((item) => (
            <div key={item.id} className={`char-list-item${editId === item.id ? ' selected' : ''}`} onClick={() => setEditId(item.id)}>
              {item.title}
            </div>
          ))}
        </div>
        <div className="lh-oc-admin-block">
          {selected ? (
            <CharArchiveEditForm
              key={selected.id}
              item={selected}
              uploading={uploading}
              onUploadStart={() => setUploading(true)}
              onUploadEnd={() => setUploading(false)}
              onSave={(item) => void onSave(items.map((i) => (i.id === item.id ? item : i)))}
              onDelete={() => {
                void onSave(items.filter((i) => i.id !== selected.id));
                setEditId(null);
              }}
            />
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>항목 선택</span>
          )}
        </div>
      </div>
    </>
  );
}

function CharArchiveEditForm({
  item,
  uploading,
  onUploadStart,
  onUploadEnd,
  onSave,
  onDelete,
}: {
  item: CharArchiveItem;
  uploading: boolean;
  onUploadStart: () => void;
  onUploadEnd: () => void;
  onSave: (item: CharArchiveItem) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState(item);
  return (
    <AdminPanelShell title="캐릭터 아카이브" onSave={() => onSave(form)} onDelete={onDelete}>
      <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <select className="form-input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CharArchiveItem['kind'] })} style={{ marginTop: 6 }}>
        <option value="story">썰</option>
        <option value="rant">주접</option>
        <option value="impression">감상</option>
        <option value="novel">소설</option>
        <option value="other">기타</option>
      </select>
      <input className="form-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={{ marginTop: 6 }} />
      <ImageFileField value={form.coverUrl || ''} folder="site/char_archive" uploading={uploading} onUploadStart={onUploadStart} onUploadEnd={onUploadEnd} onChange={(coverUrl) => setForm({ ...form, coverUrl })} />
      <textarea className="form-input" rows={8} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} style={{ marginTop: 6 }} />
      <SecretPostFields value={form} onChange={(patch) => setForm({ ...form, ...patch })} />
    </AdminPanelShell>
  );
}

type TimelineProps = {
  items: TimelinePost[];
  onSave: (next: TimelinePost[]) => Promise<void>;
};

export function TimelineAdminPanel({ items, onSave }: TimelineProps) {
  const { showSaveToast, showDeleteToast } = useSaveToast();
  const [editId, setEditId] = useState<string | null>(null);
  const selected = items.find((i) => i.id === editId);

  function add() {
    const item: TimelinePost = {
      id: newId(),
      authorName: '작성자',
      body: '',
      date: new Date().toISOString(),
      tags: [],
      replies: [],
      reactions: {},
    };
    void onSave([...items, item]);
    setEditId(item.id);
    showSaveToast();
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.75rem' }}>
        <span style={{ fontSize: 12, color: 'var(--lake-copper-soft, var(--pink))' }}>Timeline</span>
        <button type="button" className="btn-save" onClick={add}>
          + 글
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
              <div>{item.authorName}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{item.body.slice(0, 40)}</div>
            </div>
          ))}
        </div>
        <div className="lh-oc-admin-block">
          {selected ? (
            <TimelineEditForm
              key={selected.id}
              item={selected}
              onSave={(item) => void onSave(items.map((i) => (i.id === item.id ? item : i)))}
              onDelete={() => {
                void onSave(items.filter((i) => i.id !== selected.id));
                showDeleteToast();
                setEditId(null);
              }}
            />
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>항목 선택</span>
          )}
        </div>
      </div>
    </>
  );
}

function TimelineEditForm({
  item,
  onSave,
  onDelete,
}: {
  item: TimelinePost;
  onSave: (item: TimelinePost) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState(item);
  const [uploading, setUploading] = useState(false);
  return (
    <AdminPanelShell
      title="타임라인 편집"
      onSave={() => onSave({ ...form, tags: finalizeCommaList(form.tags) })}
      onDelete={onDelete}
    >
      <input className="form-input" placeholder="작성자" value={form.authorName} onChange={(e) => setForm({ ...form, authorName: e.target.value })} />
      <ImageFileField
        label="프로필 사진"
        value={form.authorAvatarUrl || ''}
        folder="site/timeline"
        uploading={uploading}
        onUploadStart={() => setUploading(true)}
        onUploadEnd={() => setUploading(false)}
        onChange={(authorAvatarUrl) => setForm({ ...form, authorAvatarUrl })}
      />
      <input className="form-input" type="datetime-local" value={form.date?.slice(0, 16) || ''} onChange={(e) => setForm({ ...form, date: new Date(e.target.value).toISOString() })} style={{ marginTop: 6 }} />
      <textarea className="form-input" rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} style={{ marginTop: 6 }} />
      <input
        className="form-input"
        placeholder="태그 (쉼표)"
        value={(form.tags ?? []).join(', ')}
        onChange={(e) => setForm({ ...form, tags: splitCommaListLive(e.target.value) })}
        style={{ marginTop: 6 }}
      />
      <input className="form-input" placeholder="이미지 URL" value={form.imageUrl || ''} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} style={{ marginTop: 6 }} />
      <LakeToggle checked={!!form.secret} onChange={(secret) => setForm({ ...form, secret })} label="비밀글 (관리자만)" />
      <LakeToggle checked={!!form.pinned} onChange={(pinned) => setForm({ ...form, pinned })} label="상단 고정 공지" />
    </AdminPanelShell>
  );
}

type GuestSettingsProps = {
  data: SiteGuestSettings;
  onSave: (next: SiteGuestSettings) => Promise<void>;
};

export function GuestSettingsAdminPanel({ data, onSave }: GuestSettingsProps) {
  const { showSaveToast } = useSaveToast();
  const [form, setForm] = useState({ ...DEFAULT_SITE_GUEST_SETTINGS, ...data });

  return (
    <AdminPanelShell
      title="방명록 안내"
      onSave={async () => {
        await onSave(form);
        showSaveToast();
      }}
    >
      <div className="form-group">
        <label className="form-label">안내 문구</label>
        <textarea
          className="form-input"
          rows={8}
          value={form.guideText || ''}
          onChange={(e) => setForm({ ...form, guideText: e.target.value })}
          placeholder="방명록 상단에 표시할 안내 문구"
        />
      </div>
      <div className="form-group">
        <label className="form-label">방명록 답글 닉네임</label>
        <input
          className="form-input"
          value={form.replyName || ''}
          onChange={(e) => setForm({ ...form, replyName: e.target.value })}
          placeholder="비우면 사이트 닉네임 사용"
        />
        <p className="form-hint" style={{ marginTop: 6, fontSize: 11, opacity: 0.65 }}>
          관리자 답글에 표시됩니다. 바꾸면 기존 답글에도 바로 반영됩니다.
        </p>
      </div>
    </AdminPanelShell>
  );
}
