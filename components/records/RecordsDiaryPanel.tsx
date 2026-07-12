'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { User } from 'firebase/auth';
import { SecretItemGate } from '@/components/lake/SecretItemGate';
import { SecretLockBadge, SecretLockIcon } from '@/components/ui/SecretLockBadge';
import { LakeToggle } from '@/components/ui/LakeToggle';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { useSaveToast } from '@/components/ui/SaveToast';
import { uploadImageFile } from '@/lib/r2/client';
import { normalizeUploadFile } from '@/lib/r2/mime';
import { newId, type DiaryThread, type SitePost } from '@/lib/types/site-content';

const PAGE_SIZE = 10;

type Props = {
  items: SitePost[];
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
  onSave: (next: SitePost[]) => Promise<void>;
  /** 다이어리 탭이 보이는지 — 스포일러 리셋용 */
  active?: boolean;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** datetime-local 표시/편집용 (로컬, UTC 변환 없음) */
function toDateTimeLocal(date: string) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(date)) return date.slice(0, 16);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const now = new Date();
    return `${date}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 저장: 로컬 datetime 문자열 유지 (UTC 변환 시 날짜/시간 밀림 방지) */
function fromDateTimeLocal(value: string) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value.slice(0, 16);
  return toDateTimeLocal(value);
}

function parseLocalDate(date: string) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(date)) {
    const [y, m, rest] = date.split('-');
    const [day, time] = rest.split('T');
    const [hh, mm] = (time || '00:00').split(':');
    return new Date(Number(y), Number(m) - 1, Number(day), Number(hh), Number(mm));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, day] = date.split('-').map(Number);
    return new Date(y, m - 1, day, 12, 0);
  }
  return new Date(date);
}

function formatDiaryDate(date: string) {
  const d = parseLocalDate(date);
  if (Number.isNaN(d.getTime())) {
    const raw = date.replace(/[-:T\s]/g, '');
    if (raw.length >= 8) return raw.slice(2, 8);
    return date;
  }
  return `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function formatDiaryTime(date: string) {
  const d = parseLocalDate(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDiaryStamp(date: string) {
  const day = formatDiaryDate(date);
  const time = formatDiaryTime(date);
  return time ? `${day} ${time}` : day;
}

function splitDateTime(value: string) {
  const local = toDateTimeLocal(value);
  return {
    day: local.slice(0, 10),
    time: local.slice(11, 16) || '00:00',
  };
}

function pageNumbers(current: number, total: number) {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  let start = Math.max(1, current - 2);
  let end = start + 4;
  if (end > total) {
    end = total;
    start = Math.max(1, end - 4);
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

async function uploadDiaryImage(file: File): Promise<string> {
  const normalized = normalizeUploadFile(file);
  try {
    return await uploadImageFile(normalized, 'site/diary');
  } catch (err) {
    const legacy = typeof window !== 'undefined' ? window.LakeR2Upload : undefined;
    if (legacy?.uploadFile) return legacy.uploadFile(normalized, 'site/diary');
    throw err;
  }
}

function IconThread() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 7h10M7 11h7M7 15h5M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H11l-4 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
      />
    </svg>
  );
}

function IconHeart({ filled, size = 18 }: { filled: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 20s-7-4.35-7-9.2A3.8 3.8 0 0 1 12 7.6a3.8 3.8 0 0 1 7 3.2C19 15.65 12 20 12 20z"
      />
    </svg>
  );
}

function DiaryLikeButton({
  liked,
  count,
  label,
  onToggle,
}: {
  liked: boolean;
  count: number;
  label: string;
  /** true면 좋아요 성공(로그인됨), false면 미로그인 등 */
  onToggle: () => boolean | Promise<boolean>;
}) {
  const [pop, setPop] = useState(false);

  return (
    <button
      type="button"
      className={`lh-diary__action lh-diary__action--like${liked ? ' is-liked' : ''}${pop ? ' is-pop' : ''}`}
      aria-label={label}
      aria-pressed={liked}
      onClick={() => {
        void (async () => {
          const ok = await onToggle();
          if (ok && !liked) setPop(true);
        })();
      }}
    >
      <span className="lh-diary__heart" onAnimationEnd={() => setPop(false)}>
        <IconHeart filled={liked} />
      </span>
      <em>{count}</em>
    </button>
  );
}

function IconPin({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path
        fill="currentColor"
        d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"
      />
    </svg>
  );
}

function IconMore() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <circle cx="12" cy="5" r="1.35" fill="currentColor" />
      <circle cx="12" cy="12" r="1.35" fill="currentColor" />
      <circle cx="12" cy="19" r="1.35" fill="currentColor" />
    </svg>
  );
}

function IconBubble() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M12 3.5c-4.7 0-8.5 3.1-8.5 7 0 2.3 1.3 4.3 3.4 5.6-.1.7-.5 2-1.5 3.2 1.8-.3 3.3-1.1 4.3-1.8.7.1 1.5.2 2.3.2 4.7 0 8.5-3.1 8.5-7s-3.8-7-8.5-7z"
      />
    </svg>
  );
}

function IconImage() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <rect
        x="3.5"
        y="5"
        width="17"
        height="14"
        rx="2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="8.5" cy="10" r="1.4" fill="currentColor" />
      <path
        d="M4.5 16.5 9 12.5l3 2.5 3.5-4 4 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SpoilerImage({
  src,
  spoiler,
  className,
  resetKey,
}: {
  src: string;
  spoiler?: boolean;
  className?: string;
  /** 탭 이탈·숨김 시 변경되어 스포일러 다시 잠금 */
  resetKey?: string | number | boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    setRevealed(false);
    setLightbox(false);
  }, [resetKey, src]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const blurred = !!spoiler && !revealed;
  return (
    <>
      <button
        type="button"
        className={`lh-diary__media${blurred ? ' is-spoiler' : ' is-zoomable'}${className ? ` ${className}` : ''}`}
        onClick={() => {
          if (blurred) setRevealed(true);
          else setLightbox(true);
        }}
        aria-label={blurred ? '스포일러 이미지 — 클릭하여 보기' : '이미지 크게 보기'}
      >
        <img src={src} alt="" />
        {blurred ? <span className="lh-diary__spoiler-label">스포일러 · 탭하여 보기</span> : null}
      </button>
      {lightbox && typeof document !== 'undefined'
        ? createPortal(
            <div className="lh-diary__lightbox" role="dialog" aria-modal="true" aria-label="이미지 보기">
              <button
                type="button"
                className="lh-diary__lightbox-backdrop"
                aria-label="닫기"
                onClick={() => setLightbox(false)}
              />
              <img src={src} alt="" className="lh-diary__lightbox-img" />
              <button
                type="button"
                className="lh-diary__lightbox-close"
                aria-label="닫기"
                onClick={() => setLightbox(false)}
              >
                ×
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function ImageAttachButton({
  url,
  spoiler,
  uploading,
  onUploading,
  onChange,
  onSpoilerChange,
  onClear,
  triggerOnly = false,
  hideTrigger = false,
}: {
  url: string;
  spoiler: boolean;
  uploading: boolean;
  onUploading: (v: boolean) => void;
  onChange: (url: string) => void;
  onSpoilerChange: (v: boolean) => void;
  onClear: () => void;
  /** 아이콘 버튼만 */
  triggerOnly?: boolean;
  /** 미리보기만 (아이콘 숨김) */
  hideTrigger?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    onUploading(true);
    try {
      const next = await uploadDiaryImage(file);
      onChange(next);
    } catch (err) {
      alert(err instanceof Error ? err.message : '이미지 업로드 실패');
    } finally {
      onUploading(false);
    }
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      hidden
      disabled={uploading}
      onChange={(e) => {
        void pick(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );

  if (triggerOnly) {
    return (
      <>
        <button
          type="button"
          className={`lh-diary__icon-btn${url ? ' is-on' : ''}`}
          aria-label="이미지 추가"
          title="이미지 추가"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <IconImage />
        </button>
        {fileInput}
      </>
    );
  }

  return (
    <div className="lh-diary__attach">
      {!hideTrigger ? (
        <button
          type="button"
          className={`lh-diary__icon-btn${url ? ' is-on' : ''}`}
          aria-label="이미지 추가"
          title="이미지 추가"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <IconImage />
        </button>
      ) : null}
      {fileInput}
      {url ? (
        <div className="lh-diary__attach-preview">
          <SpoilerImage src={url} spoiler={spoiler} />
          <div className="lh-diary__attach-tools">
            <LakeToggle checked={spoiler} onChange={onSpoilerChange} label="스포일러" />
            <button type="button" className="lh-diary__attach-clear" onClick={onClear}>
              제거
            </button>
          </div>
        </div>
      ) : null}
      {uploading ? <span className="lh-diary__attach-status">업로드 중…</span> : null}
    </div>
  );
}

export function RecordsDiaryPanel({ items, user, isAdmin, onOpenAuth, onSave, active = true }: Props) {
  const { showSaveToast } = useSaveToast();
  const { confirm } = useLakeDialog();
  const [body, setBody] = useState('');
  const [date, setDate] = useState(() => toDateTimeLocal(new Date().toISOString()));
  const [secret, setSecret] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageSpoiler, setImageSpoiler] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [threadOpenId, setThreadOpenId] = useState<string | null>(null);
  const [threadDraft, setThreadDraft] = useState('');
  const [threadImage, setThreadImage] = useState('');
  const [threadSpoiler, setThreadSpoiler] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [spoilerEpoch, setSpoilerEpoch] = useState(0);
  const [page, setPage] = useState(1);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerLeaving, setComposerLeaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!active) setSpoilerEpoch((n) => n + 1);
  }, [active]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') setSpoilerEpoch((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);


  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const pin = Number(!!b.pinned) - Number(!!a.pinned);
      if (pin !== 0) return pin;
      return toDateTimeLocal(b.date).localeCompare(toDateTimeLocal(a.date));
    });
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [sorted, safePage],
  );
  const pagerNums = useMemo(() => pageNumbers(safePage, totalPages), [safePage, totalPages]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    if (!composerOpen || composerLeaving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeComposer();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [composerOpen, composerLeaving]);

  useEffect(() => {
    if (!menuId) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuId(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuId]);

  async function persist(next: SitePost[]) {
    await onSave(next);
  }

  function resetComposer() {
    setEditingId(null);
    setBody('');
    setSecret(false);
    setImageUrl('');
    setImageSpoiler(false);
    setDate(toDateTimeLocal(new Date().toISOString()));
  }

  function openComposer(forEdit = false) {
    if (!forEdit) resetComposer();
    setComposerLeaving(false);
    setComposerOpen(true);
  }

  function closeComposer() {
    if (!composerOpen || composerLeaving) return;
    setComposerLeaving(true);
  }

  function finishComposerClose() {
    if (!composerLeaving) return;
    setComposerOpen(false);
    setComposerLeaving(false);
    resetComposer();
  }

  async function submit() {
    if (!isAdmin) return;
    const b = body.trim();
    if (!b && !imageUrl.trim()) return;
    const stamped = fromDateTimeLocal(date);

    if (editingId) {
      await persist(
        items.map((p) =>
          p.id === editingId
            ? {
                ...p,
                body: b,
                date: stamped,
                secret,
                title: p.title || '',
                imageUrl: imageUrl.trim() || undefined,
                imageSpoiler: imageUrl.trim() ? imageSpoiler : undefined,
              }
            : p,
        ),
      );
    } else {
      const post: SitePost = {
        id: newId(),
        title: '',
        body: b,
        date: stamped,
        secret: secret || undefined,
        imageUrl: imageUrl.trim() || undefined,
        imageSpoiler: imageUrl.trim() ? imageSpoiler : undefined,
        likedBy: [],
        threads: [],
      };
      await persist([post, ...items]);
    }
    closeComposer();
    showSaveToast();
  }

  function startEdit(item: SitePost) {
    setEditingId(item.id);
    setBody(item.body);
    setDate(toDateTimeLocal(item.date));
    setSecret(!!item.secret);
    setImageUrl(item.imageUrl || '');
    setImageSpoiler(!!item.imageSpoiler);
    setMenuId(null);
    setComposerLeaving(false);
    setComposerOpen(true);
  }

  async function togglePin(item: SitePost) {
    setMenuId(null);
    await persist(items.map((p) => (p.id === item.id ? { ...p, pinned: !p.pinned } : p)));
    showSaveToast();
  }

  async function removeItem(item: SitePost) {
    setMenuId(null);
    if (!(await confirm('이 일기를 삭제할까요?'))) return;
    await persist(items.filter((p) => p.id !== item.id));
    if (editingId === item.id) closeComposer();
    showSaveToast();
  }

  async function toggleLike(item: SitePost): Promise<boolean> {
    if (!user) {
      onOpenAuth();
      return false;
    }
    const uid = user.uid;
    const liked = item.likedBy ?? [];
    const nextLiked = liked.includes(uid) ? liked.filter((id) => id !== uid) : [...liked, uid];
    await persist(items.map((p) => (p.id === item.id ? { ...p, likedBy: nextLiked } : p)));
    return true;
  }

  async function toggleThreadLike(item: SitePost, threadId: string): Promise<boolean> {
    if (!user) {
      onOpenAuth();
      return false;
    }
    const uid = user.uid;
    await persist(
      items.map((p) => {
        if (p.id !== item.id) return p;
        return {
          ...p,
          threads: (p.threads ?? []).map((t) => {
            if (t.id !== threadId) return t;
            const liked = t.likedBy ?? [];
            return {
              ...t,
              likedBy: liked.includes(uid) ? liked.filter((id) => id !== uid) : [...liked, uid],
            };
          }),
        };
      }),
    );
    return true;
  }

  async function addThread(item: SitePost) {
    if (!isAdmin) return;
    const t = threadDraft.trim();
    if (!t && !threadImage.trim()) return;
    const thread: DiaryThread = {
      id: newId(),
      body: t,
      date: toDateTimeLocal(new Date().toISOString()),
      imageUrl: threadImage.trim() || undefined,
      imageSpoiler: threadImage.trim() ? threadSpoiler : undefined,
      likedBy: [],
    };
    await persist(
      items.map((p) =>
        p.id === item.id ? { ...p, threads: [...(p.threads ?? []), thread] } : p,
      ),
    );
    setThreadDraft('');
    setThreadImage('');
    setThreadSpoiler(false);
    setThreadOpenId(null);
    showSaveToast();
  }

  async function removeThread(item: SitePost, threadId: string) {
    if (!isAdmin) return;
    if (!(await confirm('이 타래를 삭제할까요?'))) return;
    await persist(
      items.map((p) =>
        p.id === item.id
          ? { ...p, threads: (p.threads ?? []).filter((t) => t.id !== threadId) }
          : p,
      ),
    );
  }

  const { day: dateDay, time: dateTime } = splitDateTime(date);

  function openDatePicker() {
    dateInputRef.current?.showPicker?.();
    dateInputRef.current?.focus();
  }

  function openTimePicker() {
    timeInputRef.current?.showPicker?.();
    timeInputRef.current?.focus();
  }

  return (
    <div className="lh-diary">
      <div className="lh-diary__headbar">
        <div className="lh-diary__titles">
          <h2 className="page-heading">Diary</h2>
          <div className="page-sub">일기</div>
        </div>
        {isAdmin ? (
          <button type="button" className="lh-diary__write-btn" onClick={() => openComposer(false)}>
            + 글 쓰기
          </button>
        ) : null}
      </div>

      {isAdmin && composerOpen ? (
        <div
          className={`lh-diary__modal${composerLeaving ? ' is-out' : ' is-in'}`}
          role="dialog"
          aria-modal="true"
          aria-label="일기 작성"
        >
          <button type="button" className="lh-diary__modal-backdrop" aria-label="닫기" onClick={closeComposer} />
          <div
            className="lh-diary__modal-panel"
            onAnimationEnd={(e) => {
              if (e.target !== e.currentTarget) return;
              if (composerLeaving) finishComposerClose();
            }}
          >
            <div className="lh-diary__modal-top">
              <strong>{editingId ? '일기 수정' : '새 일기'}</strong>
              <button type="button" className="lh-diary__modal-close" aria-label="닫기" onClick={closeComposer}>
                ×
              </button>
            </div>
            <section className="lh-diary__composer" ref={composerRef}>
              <div className="lh-diary__composer-meta">
                <label className="lh-diary__cal" onClick={openDatePicker}>
                  <input
                    ref={dateInputRef}
                    type="date"
                    className="lh-diary__date-input"
                    value={dateDay}
                    onChange={(e) => setDate(`${e.target.value}T${dateTime}`)}
                    onClick={(e) => {
                      e.stopPropagation();
                      openDatePicker();
                    }}
                    aria-label="날짜 선택"
                  />
                </label>
                <label className="lh-diary__cal" onClick={openTimePicker}>
                  <input
                    ref={timeInputRef}
                    type="time"
                    className="lh-diary__date-input lh-diary__date-input--time"
                    value={dateTime}
                    onChange={(e) => setDate(`${dateDay}T${e.target.value}`)}
                    onClick={(e) => {
                      e.stopPropagation();
                      openTimePicker();
                    }}
                    aria-label="시간 선택"
                  />
                </label>
                {editingId ? <span className="lh-diary__editing">수정 중</span> : null}
              </div>
              <textarea
                rows={5}
                placeholder="오늘의 기록…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              {(imageUrl || uploading) && (
                <ImageAttachButton
                  url={imageUrl}
                  spoiler={imageSpoiler}
                  uploading={uploading}
                  onUploading={setUploading}
                  onChange={setImageUrl}
                  onSpoilerChange={setImageSpoiler}
                  onClear={() => {
                    setImageUrl('');
                    setImageSpoiler(false);
                  }}
                  hideTrigger
                />
              )}
              <div className="lh-diary__composer-bar">
                <div className="lh-diary__composer-tools">
                  <button
                    type="button"
                    className={`lh-diary__icon-btn${secret ? ' is-on' : ''}`}
                    aria-pressed={secret}
                    aria-label="비밀글"
                    title="비밀글"
                    onClick={() => setSecret((v) => !v)}
                  >
                    <SecretLockIcon />
                  </button>
                  <ImageAttachButton
                    url={imageUrl}
                    spoiler={imageSpoiler}
                    uploading={uploading}
                    onUploading={setUploading}
                    onChange={setImageUrl}
                    onSpoilerChange={setImageSpoiler}
                    onClear={() => {
                      setImageUrl('');
                      setImageSpoiler(false);
                    }}
                    triggerOnly
                  />
                </div>
                <div className="lh-diary__composer-actions">
                  <button type="button" className="lh-diary__pill lh-diary__pill--ghost" onClick={closeComposer}>
                    취소
                  </button>
                  <button
                    type="button"
                    className="lh-diary__pill"
                    onClick={() => void submit()}
                    disabled={uploading}
                  >
                    {editingId ? '저장' : '등록'}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {!sorted.length ? <div className="page-coming">— 일기가 없습니다 —</div> : null}

      <div className="lh-diary__list">
        {pageItems.map((item) => {
          const likedBy = item.likedBy ?? [];
          const liked = !!user && likedBy.includes(user.uid);
          const threads = item.threads ?? [];

          return (
            <SecretItemGate
              key={item.id}
              scope="diary"
              item={item}
              isAdmin={isAdmin}
              loggedIn={!!user}
              onRequestLogin={onOpenAuth}
            >
              <article className={`lh-diary__card${item.pinned ? ' is-pinned' : ''}`}>
                <header className="lh-diary__head">
                  <div className="lh-diary__head-left">
                    {item.pinned ? (
                      <span className="lh-diary__pin" title="상단 고정" aria-label="상단 고정">
                        <IconPin />
                      </span>
                    ) : null}
                    <time className="lh-diary__date" dateTime={item.date}>
                      {formatDiaryDate(item.date)}
                      {formatDiaryTime(item.date) ? (
                        <span className="lh-diary__time">{formatDiaryTime(item.date)}</span>
                      ) : null}
                    </time>
                    {item.secret ? <SecretLockBadge compact /> : null}
                  </div>
                  {isAdmin ? (
                    <div className="lh-diary__menu" ref={menuId === item.id ? menuRef : undefined}>
                      <button
                        type="button"
                        className="lh-diary__menu-btn"
                        aria-label="더보기"
                        aria-expanded={menuId === item.id}
                        onClick={() => setMenuId((id) => (id === item.id ? null : item.id))}
                      >
                        <IconMore />
                      </button>
                      {menuId === item.id ? (
                        <div className="lh-diary__menu-pop" role="menu">
                          <button type="button" role="menuitem" onClick={() => startEdit(item)}>
                            수정
                          </button>
                          <button type="button" role="menuitem" onClick={() => void togglePin(item)}>
                            {item.pinned ? '고정 해제' : '상단 고정'}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="is-danger"
                            onClick={() => void removeItem(item)}
                          >
                            삭제
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </header>

                {item.body ? <p className="lh-diary__body">{item.body}</p> : null}
                {item.imageUrl ? (
                  <SpoilerImage
                    src={item.imageUrl}
                    spoiler={item.imageSpoiler}
                    resetKey={`${spoilerEpoch}-${active}`}
                  />
                ) : null}

                <footer className="lh-diary__actions">
                  <button
                    type="button"
                    className={`lh-diary__action${threadOpenId === item.id ? ' is-on' : ''}${!isAdmin ? ' is-locked' : ''}`}
                    aria-label={isAdmin ? '타래' : '타래 (작성자 전용)'}
                    title={isAdmin ? '타래' : '작성자만 타래를 쓸 수 있어요'}
                    onClick={() => {
                      if (!isAdmin) return;
                      setThreadOpenId((id) => (id === item.id ? null : item.id));
                      setThreadDraft('');
                      setThreadImage('');
                      setThreadSpoiler(false);
                    }}
                  >
                    <IconThread />
                    {!isAdmin ? <span className="lh-diary__action-x">×</span> : null}
                    <em>{threads.length}</em>
                  </button>

                  <DiaryLikeButton
                    liked={liked}
                    count={likedBy.length}
                    label="좋아요"
                    onToggle={() => toggleLike(item)}
                  />
                </footer>

                {threads.length || (isAdmin && threadOpenId === item.id) ? (
                  <div
                    className={`lh-diary__rail${
                      isAdmin && threadOpenId === item.id && !threads.length ? ' is-enter' : ''
                    }`}
                  >
                    {threads.map((t) => {
                      const tLiked = !!user && (t.likedBy ?? []).includes(user.uid);
                      return (
                        <div key={t.id} className="lh-diary__rail-item">
                          <div className="lh-diary__rail-dot" aria-hidden />
                          <div className="lh-diary__rail-card">
                            <div className="lh-diary__rail-meta">
                              <time className="lh-diary__stamp">{formatDiaryStamp(t.date)}</time>
                              {isAdmin ? (
                                <button
                                  type="button"
                                  className="lh-diary__rail-del"
                                  onClick={() => void removeThread(item, t.id)}
                                >
                                  삭제
                                </button>
                              ) : null}
                            </div>
                            {t.body ? <p className="lh-diary__rail-body">{t.body}</p> : null}
                            {t.imageUrl ? (
                              <SpoilerImage
                                src={t.imageUrl}
                                spoiler={t.imageSpoiler}
                                className="lh-diary__rail-img-wrap"
                                resetKey={`${spoilerEpoch}-${active}-${t.id}`}
                              />
                            ) : null}
                            <div className="lh-diary__rail-actions">
                              {isAdmin ? (
                                <button
                                  type="button"
                                  className={`lh-diary__action${threadOpenId === item.id ? ' is-on' : ''}`}
                                  aria-label="타래 이어쓰기"
                                  title="타래 이어쓰기"
                                  onClick={() => {
                                    setThreadOpenId((id) => (id === item.id ? null : item.id));
                                    setThreadDraft('');
                                    setThreadImage('');
                                    setThreadSpoiler(false);
                                  }}
                                >
                                  <IconThread />
                                </button>
                              ) : null}
                              <DiaryLikeButton
                                liked={tLiked}
                                count={t.likedBy?.length ?? 0}
                                label="타래 좋아요"
                                onToggle={() => toggleThreadLike(item, t.id)}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {isAdmin && threadOpenId === item.id ? (
                      <div className="lh-diary__rail-item lh-diary__rail-item--compose is-enter">
                        <div className="lh-diary__rail-dot lh-diary__rail-dot--bubble" aria-hidden>
                          <IconBubble />
                        </div>
                        <div className="lh-diary__rail-compose">
                          <textarea
                            rows={2}
                            placeholder="타래 이어쓰기…"
                            value={threadDraft}
                            autoFocus
                            onChange={(e) => setThreadDraft(e.target.value)}
                          />
                          <ImageAttachButton
                            url={threadImage}
                            spoiler={threadSpoiler}
                            uploading={uploading}
                            onUploading={setUploading}
                            onChange={setThreadImage}
                            onSpoilerChange={setThreadSpoiler}
                            onClear={() => {
                              setThreadImage('');
                              setThreadSpoiler(false);
                            }}
                          />
                          <button
                            type="button"
                            className="lh-rec__btn"
                            disabled={uploading}
                            onClick={() => void addThread(item)}
                          >
                            등록
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            </SecretItemGate>
          );
        })}
      </div>

      {sorted.length > PAGE_SIZE ? (
        <nav className="lh-diary__pager" aria-label="다이어리 페이지">
          {pagerNums.map((n) => (
            <button
              key={n}
              type="button"
              className={`lh-diary__pager-btn${n === safePage ? ' is-current' : ''}`}
              aria-current={n === safePage ? 'page' : undefined}
              onClick={() => setPage(n)}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            className="lh-diary__pager-btn lh-diary__pager-btn--nav"
            aria-label="다음 페이지"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            ›
          </button>
          <button
            type="button"
            className="lh-diary__pager-btn lh-diary__pager-btn--nav"
            aria-label="마지막 페이지"
            disabled={safePage >= totalPages}
            onClick={() => setPage(totalPages)}
          >
            »
          </button>
        </nav>
      ) : null}
    </div>
  );
}
