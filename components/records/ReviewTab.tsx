'use client';

import { useEffect, useMemo, useState, type AnimationEvent } from 'react';
import type { User } from 'firebase/auth';
import { SecretItemGate } from '@/components/lake/SecretItemGate';
import { RecordsWriteShell, useRecordsComposer } from '@/components/records/RecordsWriteShell';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { useSaveToast } from '@/components/ui/SaveToast';
import { ImageFileField } from '@/components/ui/ImageFileField';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { newId, type ReviewItem } from '@/lib/types/site-content';

type Props = {
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
  onSave?: (next: ReviewItem[]) => Promise<void>;
  /** false면 상세를 닫고 목록으로 복귀 */
  active?: boolean;
};

const DEFAULT_TITLE_COLOR = '#e8dcf5';
const DETAIL_OUT_MS = 280;
const QUOTE_SWEEP_MS = 580;

const STATUS_OPTS = [
  { id: '', label: '상태 없음' },
  { id: 'watching', label: '감상 중' },
  { id: 'done', label: '완결' },
  { id: 'oneshot', label: '단편' },
] as const;

function snapHalf(n: number) {
  return Math.min(5, Math.max(0.5, Math.round(n * 2) / 2));
}

function formatRating(rating: number) {
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
}

function statusLabel(status?: string) {
  if (!status) return '';
  return STATUS_OPTS.find((s) => s.id === status)?.label || status;
}

function formatCardDate(date?: string) {
  if (!date) return '';
  return date.slice(0, 10);
}

function parseGenres(raw: string) {
  return raw
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function Stars({
  rating,
  showValue = true,
  size,
}: {
  rating: number;
  showValue?: boolean;
  size?: 'lg';
}) {
  const value = snapHalf(rating);
  return (
    <span
      className={`lh-review__stars${size === 'lg' ? ' lh-review__stars--lg' : ''}`}
      aria-label={`${formatRating(value)}점`}
    >
      {Array.from({ length: 5 }, (_, i) => {
        const fill = value - i;
        const cls = fill >= 1 ? 'is-on' : fill >= 0.5 ? 'is-half' : undefined;
        return (
          <span key={i} className={`lh-review__star${cls ? ` ${cls}` : ''}`}>
            ★
          </span>
        );
      })}
      {showValue ? <em>{formatRating(value)}</em> : null}
    </span>
  );
}

function StarRatingInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const rating = snapHalf(value);
  return (
    <div className="lh-review__star-input" role="group" aria-label="별점">
      <div className="lh-review__star-input__list">
        {Array.from({ length: 5 }, (_, i) => {
          const full = i + 1;
          const half = i + 0.5;
          const fill = rating - i;
          const cls = fill >= 1 ? 'is-on' : fill >= 0.5 ? 'is-half' : undefined;
          return (
            <span key={i} className={`lh-review__star-hit${cls ? ` ${cls}` : ''}`}>
              ★
              <button
                type="button"
                className="lh-review__star-hit__half"
                aria-label={`${formatRating(half)}점`}
                onClick={() => onChange(half)}
              />
              <button
                type="button"
                className="lh-review__star-hit__full"
                aria-label={`${full}점`}
                onClick={() => onChange(full)}
              />
            </span>
          );
        })}
      </div>
      <span className="lh-review__star-input__value">{formatRating(rating)}점</span>
    </div>
  );
}

export function ReviewTab({ user, isAdmin, onOpenAuth, onSave, active = true }: Props) {
  const { reviews, reviewCategories, saveReviews } = useSiteContent();
  const persist = onSave || saveReviews;
  const { showSaveToast } = useSaveToast();
  const { confirm } = useLakeDialog();
  const { open, leaving, openComposer, closeComposer, finishClose } = useRecordsComposer();
  const [filter, setFilter] = useState('all');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailLeaving, setDetailLeaving] = useState(false);
  const [quoteRevealed, setQuoteRevealed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [titleColor, setTitleColor] = useState(DEFAULT_TITLE_COLOR);
  const [categoryId, setCategoryId] = useState(reviewCategories[0]?.id || 'movie');
  const [rating, setRating] = useState(4);
  const [genres, setGenres] = useState('');
  const [year, setYear] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [status, setStatus] = useState('');
  const [author, setAuthor] = useState('');
  const [highlight, setHighlight] = useState('');
  const [body, setBody] = useState('');
  const [uploading, setUploading] = useState(false);

  const cats = reviewCategories.length
    ? reviewCategories
    : [{ id: 'movie', label: '영화', kind: 'movie' as const }];

  const catLabel = (id: string) => cats.find((c) => c.id === id)?.label || id;

  const visible = useMemo(() => {
    return reviews
      .filter((r) => {
        if (r.secret && !isAdmin) return false;
        if (filter !== 'all' && r.categoryId !== filter) return false;
        return true;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [reviews, isAdmin, filter]);

  const detail = detailId ? reviews.find((r) => r.id === detailId) || null : null;

  useEffect(() => {
    if (active) return;
    setDetailId(null);
    setDetailLeaving(false);
    setQuoteRevealed(false);
    if (open) closeComposer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when leaving Review menu
  }, [active]);

  useEffect(() => {
    if (!detailId || !detail?.highlight || detailLeaving) {
      setQuoteRevealed(false);
      return;
    }
    setQuoteRevealed(false);
    const t = window.setTimeout(() => setQuoteRevealed(true), QUOTE_SWEEP_MS);
    return () => window.clearTimeout(t);
  }, [detailId, detail?.highlight, detailLeaving]);

  function resetComposer() {
    setEditingId(null);
    setTitle('');
    setTitleColor(DEFAULT_TITLE_COLOR);
    setGenres('');
    setYear('');
    setCoverUrl('');
    setRating(4);
    setStatus('');
    setAuthor('');
    setHighlight('');
    setBody('');
    setCategoryId(cats[0]?.id || 'movie');
  }

  function handleOpenWrite() {
    resetComposer();
    openComposer();
  }

  function handleCloseFinished() {
    finishClose();
    resetComposer();
  }

  function fillComposer(item: ReviewItem) {
    setEditingId(item.id);
    setTitle(item.title);
    setTitleColor(item.titleColor || DEFAULT_TITLE_COLOR);
    setCategoryId(item.categoryId);
    setRating(snapHalf(item.rating));
    setGenres((item.genres?.length ? item.genres : item.tags)?.join(', ') || '');
    setYear(item.year || '');
    setCoverUrl(item.coverUrl || '');
    setStatus(item.status || '');
    setAuthor(item.author || '');
    setHighlight(item.highlight || '');
    setBody(item.body || '');
  }

  function startEdit(item: ReviewItem) {
    fillComposer(item);
    openComposer();
  }

  function openDetail(id: string) {
    setDetailLeaving(false);
    setDetailId(id);
  }

  function requestCloseDetail() {
    if (!detailId || detailLeaving) return;
    setDetailLeaving(true);
  }

  function finishDetailClose() {
    if (!detailLeaving) return;
    setDetailId(null);
    setDetailLeaving(false);
    setQuoteRevealed(false);
  }

  function onDetailAnimEnd(e: AnimationEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (detailLeaving) finishDetailClose();
  }

  async function submit() {
    if (!isAdmin) return;
    const t = title.trim();
    if (!t) return;
    const payload: ReviewItem = {
      id: editingId || newId(),
      title: t,
      titleColor: titleColor || DEFAULT_TITLE_COLOR,
      categoryId,
      rating: snapHalf(rating),
      genres: parseGenres(genres),
      year: year.trim() || undefined,
      coverUrl: coverUrl.trim() || undefined,
      status: status || undefined,
      author: author.trim() || undefined,
      highlight: highlight.trim() || undefined,
      body: body.trim() || undefined,
      date: editingId
        ? reviews.find((r) => r.id === editingId)?.date || new Date().toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    };

    if (editingId) {
      await persist(reviews.map((r) => (r.id === editingId ? { ...r, ...payload, id: editingId } : r)));
    } else {
      await persist([payload, ...reviews]);
    }
    closeComposer();
    showSaveToast();
  }

  async function removeItem(item: ReviewItem) {
    if (!isAdmin) return;
    if (!(await confirm('이 리뷰를 삭제할까요?'))) return;
    await persist(reviews.filter((r) => r.id !== item.id));
    if (detailId === item.id) {
      setDetailId(null);
      setDetailLeaving(false);
    }
    if (editingId === item.id) closeComposer();
    showSaveToast();
  }

  if (detail) {
    const genreText =
      (detail.genres && detail.genres.length ? detail.genres : detail.tags)?.join(', ') || '';
    const st = statusLabel(detail.status);
    const titleStyle = { color: detail.titleColor || DEFAULT_TITLE_COLOR };

    return (
      <div
        className={`lh-review lh-review--detail${detailLeaving ? ' is-out' : ' is-in'}`}
        onAnimationEnd={onDetailAnimEnd}
        style={detailLeaving ? { animationDuration: `${DETAIL_OUT_MS}ms` } : undefined}
      >
        <div className="lh-review__detail-top">
          <button type="button" className="lh-review__back" onClick={requestCloseDetail}>
            ← back
          </button>
          <span className="lh-review__detail-kicker">
            {catLabel(detail.categoryId)}
            {detail.date ? ` · ${formatCardDate(detail.date)}` : ''}
          </span>
          {isAdmin ? (
            <div className="lh-review__detail-tools">
              <button type="button" className="lh-diary__pill lh-diary__pill--ghost" onClick={() => startEdit(detail)}>
                수정
              </button>
              <button
                type="button"
                className="lh-diary__pill lh-diary__pill--ghost"
                onClick={() => void removeItem(detail)}
              >
                삭제
              </button>
            </div>
          ) : null}
        </div>

        <article className="lh-review__detail">
          <div className="lh-review__detail-media">
            <div className="lh-review__detail-cover">
              {detail.coverUrl ? (
                <img src={detail.coverUrl} alt="" />
              ) : (
                <div className="lh-review__cover-empty">{detail.title[0] || '?'}</div>
              )}
            </div>
            <span className="lh-review__chip lh-review__chip--cat">#{catLabel(detail.categoryId)}</span>
          </div>

          <div className="lh-review__detail-main">
            <Stars rating={detail.rating} size="lg" />
            <div className="lh-review__detail-title-row">
              <h2 className="lh-review__detail-title" style={titleStyle}>
                {detail.title}
                {detail.year ? <span> ({detail.year})</span> : null}
              </h2>
              {st ? (
                <span className={`lh-review__chip lh-review__chip--status is-${detail.status || 'custom'}`}>
                  {st}
                </span>
              ) : null}
            </div>
            {detail.author ? <p className="lh-review__detail-credit">{detail.author}</p> : null}
            {genreText ? <p className="lh-review__detail-genres">{genreText}</p> : null}

            {detail.highlight ? (
              <p
                className={`lh-review__quote${quoteRevealed ? ' is-revealed' : ' is-sweeping'}`}
                aria-label="한줄 코멘트"
                style={{ ['--lh-quote-ms' as string]: `${QUOTE_SWEEP_MS}ms` }}
              >
                <span className="lh-review__quote-inner">{detail.highlight}</span>
                {!quoteRevealed ? (
                  <span className="lh-review__quote-shine" aria-hidden="true" />
                ) : null}
              </p>
            ) : null}

            {detail.body ? <div className="lh-review__detail-body">{detail.body}</div> : null}
          </div>
        </article>

        {isAdmin && open ? (
          <RecordsWriteShell
            heading="Review"
            sub="리뷰"
            isAdmin={isAdmin}
            headless
            writeLabel="+ 리뷰 쓰기"
            modalLabel="리뷰 수정"
            modalTitle="리뷰 수정"
            open={open}
            leaving={leaving}
            onOpen={handleOpenWrite}
            onClose={closeComposer}
            onCloseFinished={handleCloseFinished}
            footer={
              <>
                <button type="button" className="lh-diary__pill lh-diary__pill--ghost" onClick={closeComposer}>
                  취소
                </button>
                <button
                  type="button"
                  className="lh-diary__pill"
                  onClick={() => void submit()}
                  disabled={uploading}
                >
                  저장
                </button>
              </>
            }
          >
            <ComposerFields
              title={title}
              setTitle={setTitle}
              titleColor={titleColor}
              setTitleColor={setTitleColor}
              cats={cats}
              categoryId={categoryId}
              setCategoryId={setCategoryId}
              year={year}
              setYear={setYear}
              rating={rating}
              setRating={setRating}
              status={status}
              setStatus={setStatus}
              genres={genres}
              setGenres={setGenres}
              author={author}
              setAuthor={setAuthor}
              highlight={highlight}
              setHighlight={setHighlight}
              body={body}
              setBody={setBody}
              coverUrl={coverUrl}
              setCoverUrl={setCoverUrl}
              uploading={uploading}
              setUploading={setUploading}
            />
          </RecordsWriteShell>
        ) : null}
      </div>
    );
  }

  return (
    <div className="lh-review">
      <RecordsWriteShell
        heading="Review"
        sub="리뷰"
        isAdmin={isAdmin}
        writeLabel="+ 리뷰 쓰기"
        modalLabel="리뷰 작성"
        modalTitle={editingId ? '리뷰 수정' : '새 리뷰'}
        open={open}
        leaving={leaving}
        onOpen={handleOpenWrite}
        onClose={closeComposer}
        onCloseFinished={handleCloseFinished}
        footer={
          <>
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
          </>
        }
      >
        <ComposerFields
          title={title}
          setTitle={setTitle}
          titleColor={titleColor}
          setTitleColor={setTitleColor}
          cats={cats}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          year={year}
          setYear={setYear}
          rating={rating}
          setRating={setRating}
          status={status}
          setStatus={setStatus}
          genres={genres}
          setGenres={setGenres}
          author={author}
          setAuthor={setAuthor}
          highlight={highlight}
          setHighlight={setHighlight}
          body={body}
          setBody={setBody}
          coverUrl={coverUrl}
          setCoverUrl={setCoverUrl}
          uploading={uploading}
          setUploading={setUploading}
        />
      </RecordsWriteShell>

      <div className="lh-rec__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={filter === 'all' ? 'is-active' : undefined}
          onClick={() => setFilter('all')}
        >
          전체
        </button>
        {cats.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            className={filter === c.id ? 'is-active' : undefined}
            onClick={() => setFilter(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {!visible.length ? <div className="page-coming">— 리뷰가 없습니다 —</div> : null}

      <div className="lh-review__grid">
        {visible.map((item) => {
          const genreText =
            (item.genres && item.genres.length ? item.genres : item.tags)?.join(' · ') || '';
          return (
            <SecretItemGate
              key={item.id}
              scope="review"
              item={item}
              isAdmin={isAdmin}
              loggedIn={!!user}
              onRequestLogin={onOpenAuth}
            >
              <button type="button" className="lh-review__card" onClick={() => openDetail(item.id)}>
                <div className="lh-review__cover">
                  {item.coverUrl ? (
                    <img src={item.coverUrl} alt="" />
                  ) : (
                    <div className="lh-review__cover-empty">{item.title[0] || '?'}</div>
                  )}
                  <div className="lh-review__card-hover" aria-hidden="true">
                    <strong className="lh-review__card-hover-title">
                      {item.title}
                      {item.year ? ` (${item.year})` : ''}
                    </strong>
                    {genreText ? <span className="lh-review__card-hover-genre">{genreText}</span> : null}
                    {statusLabel(item.status) ? (
                      <span
                        className={`lh-review__chip lh-review__chip--status is-${item.status || 'custom'}`}
                      >
                        {statusLabel(item.status)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="lh-review__card-meta">
                  <Stars rating={item.rating} showValue={false} />
                  {item.date ? <time className="lh-review__date">{formatCardDate(item.date)}</time> : null}
                </div>
              </button>
            </SecretItemGate>
          );
        })}
      </div>
    </div>
  );
}

function ComposerFields({
  title,
  setTitle,
  titleColor,
  setTitleColor,
  cats,
  categoryId,
  setCategoryId,
  year,
  setYear,
  rating,
  setRating,
  status,
  setStatus,
  genres,
  setGenres,
  author,
  setAuthor,
  highlight,
  setHighlight,
  body,
  setBody,
  coverUrl,
  setCoverUrl,
  uploading,
  setUploading,
}: {
  title: string;
  setTitle: (v: string) => void;
  titleColor: string;
  setTitleColor: (v: string) => void;
  cats: { id: string; label: string }[];
  categoryId: string;
  setCategoryId: (v: string) => void;
  year: string;
  setYear: (v: string) => void;
  rating: number;
  setRating: (v: number) => void;
  status: string;
  setStatus: (v: string) => void;
  genres: string;
  setGenres: (v: string) => void;
  author: string;
  setAuthor: (v: string) => void;
  highlight: string;
  setHighlight: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  coverUrl: string;
  setCoverUrl: (v: string) => void;
  uploading: boolean;
  setUploading: (v: boolean) => void;
}) {
  return (
    <>
      <input placeholder="타이틀" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="lh-rec-write__color">
        <span>제목 색</span>
        <input
          type="color"
          value={titleColor || DEFAULT_TITLE_COLOR}
          onChange={(e) => setTitleColor(e.target.value)}
          aria-label="제목 색상"
        />
        <input
          type="text"
          value={titleColor || DEFAULT_TITLE_COLOR}
          onChange={(e) => setTitleColor(e.target.value)}
          placeholder="#e8dcf5"
          spellCheck={false}
        />
      </label>
      <div className="lh-rec-write__row">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <input placeholder="연도" value={year} onChange={(e) => setYear(e.target.value)} />
      </div>
      <div className="lh-rec-write__row">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="감상 상태">
          {STATUS_OPTS.map((s) => (
            <option key={s.id || 'none'} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          placeholder="감독·제작 등"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
        />
      </div>
      <StarRatingInput value={rating} onChange={setRating} />
      <input
        placeholder="장르 (쉼표로 구분)"
        value={genres}
        onChange={(e) => setGenres(e.target.value)}
      />
      <input
        placeholder="한줄 코멘트 (선택)"
        value={highlight}
        onChange={(e) => setHighlight(e.target.value)}
      />
      <textarea
        rows={5}
        placeholder="리뷰 본문"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <ImageFileField
        label="커버"
        value={coverUrl}
        folder="site/reviews"
        uploading={uploading}
        onUploadStart={() => setUploading(true)}
        onUploadEnd={() => setUploading(false)}
        onChange={setCoverUrl}
      />
    </>
  );
}
