'use client';

import { useEffect, useMemo, useRef, useState, type AnimationEvent } from 'react';
import type { User } from 'firebase/auth';
import { SecretItemGate } from '@/components/lake/SecretItemGate';
import { RecordsWriteShell, useRecordsComposer } from '@/components/records/RecordsWriteShell';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { useSaveToast } from '@/components/ui/SaveToast';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import { newId, type QuoteCategory, type QuoteItem } from '@/lib/types/site-content';

type Props = {
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
  /** false면 탭 이탈 아웃 애니 */
  active?: boolean;
};

const CATEGORIES: { id: QuoteCategory; label: string }[] = [
  { id: 'poem', label: '시' },
  { id: 'lyrics', label: '가사' },
  { id: 'sentence', label: '문장' },
];

type FilterId = 'all' | QuoteCategory;

const PANEL_OUT_MS = 280;
const LIST_OUT_MS = 220;
const PAGE_SIZE = 10;

function hasCite(item: QuoteItem) {
  return Boolean(item.author?.trim() || item.work?.trim());
}

/** 라틴 문자 비중이 높으면 영문/유럽어 인용으로 본다 */
function isLatinQuote(text: string) {
  const latin = (text.match(/[A-Za-z\u00C0-\u024F]/g) || []).length;
  if (!latin) return false;
  const cjk = (text.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) || []).length;
  return latin >= cjk;
}

function filterItems(items: QuoteItem[], filter: FilterId) {
  if (filter === 'all') return items;
  return items.filter((item) => item.category === filter);
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

function sameIds(a: QuoteItem[], b: QuoteItem[]) {
  return a.length === b.length && a.every((item, i) => item.id === b[i]?.id);
}

function IconPin({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path
        fill="currentColor"
        d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"
      />
    </svg>
  );
}

export function QuoteTab({ user, isAdmin, onOpenAuth, active = true }: Props) {
  const { quotes, saveQuotes } = useSiteContent();
  const { showSaveToast } = useSaveToast();
  const { confirm } = useLakeDialog();
  const { open, leaving, openComposer, closeComposer, finishClose } = useRecordsComposer();
  const [filter, setFilter] = useState<FilterId>('all');
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [author, setAuthor] = useState('');
  const [work, setWork] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<QuoteCategory>('poem');

  const [panelLeaving, setPanelLeaving] = useState(false);
  const [listPhase, setListPhase] = useState<'in' | 'out'>('in');
  const [shown, setShown] = useState<QuoteItem[]>([]);
  const listGen = useRef(0);
  const skipListOut = useRef(true);

  const items = useMemo(() => {
    return quotes
      .map((q, i) => ({ q, i }))
      .sort((a, b) => {
        const pin = Number(!!b.q.pinned) - Number(!!a.q.pinned);
        if (pin !== 0) return pin;
        return a.i - b.i;
      })
      .map(({ q }) => q);
  }, [quotes]);

  const filtered = useMemo(() => filterItems(items, filter), [items, filter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );
  const pagerNums = useMemo(() => pageNumbers(safePage, totalPages), [safePage, totalPages]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    if (!active) {
      setPanelLeaving(true);
      skipListOut.current = true;
      if (open) closeComposer();
      return;
    }
    setPanelLeaving(false);
    setListPhase('in');
    setShown(pageItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- enter Quote tab
  }, [active]);

  useEffect(() => {
    if (!active) return;
    if (skipListOut.current || sameIds(shown, pageItems)) {
      skipListOut.current = false;
      setShown(pageItems);
      setListPhase('in');
      return;
    }

    const gen = ++listGen.current;
    setListPhase('out');
    const t = window.setTimeout(() => {
      if (listGen.current !== gen) return;
      setShown(pageItems);
      setListPhase('in');
    }, LIST_OUT_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animate on page/filter slice change
  }, [pageItems, active]);

  function resetComposer() {
    setEditingId(null);
    setText('');
    setAuthor('');
    setWork('');
    setNote('');
    setCategory('poem');
  }

  function fillComposer(item: QuoteItem) {
    setEditingId(item.id);
    setText(item.text);
    setAuthor(item.author || '');
    setWork(item.work || '');
    setNote(item.note || '');
    setCategory(item.category || 'poem');
  }

  function handleOpen() {
    resetComposer();
    openComposer();
  }

  function handleCloseFinished() {
    finishClose();
    resetComposer();
  }

  function startEdit(item: QuoteItem) {
    fillComposer(item);
    openComposer();
  }

  function changeFilter(next: FilterId) {
    if (next === filter || listPhase === 'out') return;
    setFilter(next);
    setPage(1);
  }

  function changePage(next: number) {
    if (next === safePage || listPhase === 'out') return;
    setPage(next);
  }

  async function submit() {
    if (!isAdmin) return;
    const t = text.trim();
    if (!t) return;

    const existing = editingId ? quotes.find((q) => q.id === editingId) : undefined;
    const payload: QuoteItem = {
      id: editingId || newId(),
      text: t,
      author: author.trim() || undefined,
      work: work.trim() || undefined,
      note: note.trim() || undefined,
      category,
      pinned: existing?.pinned,
      date: existing?.date || new Date().toISOString().slice(0, 10),
    };

    if (editingId) {
      await saveQuotes(quotes.map((q) => (q.id === editingId ? { ...q, ...payload, id: editingId } : q)));
    } else {
      await saveQuotes([payload, ...quotes]);
      setFilter('all');
      setPage(1);
    }
    closeComposer();
    showSaveToast();
  }

  async function removeItem(item: QuoteItem) {
    if (!isAdmin) return;
    if (!(await confirm('이 필사를 삭제할까요?'))) return;
    await saveQuotes(quotes.filter((q) => q.id !== item.id));
    if (editingId === item.id) closeComposer();
    showSaveToast();
  }

  async function togglePin(item: QuoteItem) {
    if (!isAdmin) return;
    await saveQuotes(quotes.map((q) => (q.id === item.id ? { ...q, pinned: !q.pinned } : q)));
    showSaveToast();
  }

  function onPanelAnimEnd(e: AnimationEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (panelLeaving) setPanelLeaving(false);
  }

  return (
    <div
      className={`lh-quote${active && !panelLeaving ? ' is-in' : ''}${panelLeaving ? ' is-out' : ''}`}
      onAnimationEnd={onPanelAnimEnd}
      style={panelLeaving ? { animationDuration: `${PANEL_OUT_MS}ms` } : undefined}
    >
      <RecordsWriteShell
        heading="Quote"
        sub="필사"
        isAdmin={isAdmin}
        modalLabel="필사 작성"
        modalTitle={editingId ? '필사 수정' : '새 필사'}
        open={open}
        leaving={leaving}
        onOpen={handleOpen}
        onClose={closeComposer}
        onCloseFinished={handleCloseFinished}
        footer={
          <>
            <button type="button" className="lh-diary__pill lh-diary__pill--ghost" onClick={closeComposer}>
              취소
            </button>
            <button type="button" className="lh-diary__pill" onClick={() => void submit()}>
              {editingId ? '저장' : '등록'}
            </button>
          </>
        }
      >
        <div className="lh-rec-write__row lh-quote__cat-row" role="group" aria-label="분류">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`lh-quote__cat-pill${category === c.id ? ' is-active' : ''}`}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <textarea rows={5} placeholder="인용 문구" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="lh-rec-write__row">
          <input placeholder="작가" value={author} onChange={(e) => setAuthor(e.target.value)} />
          <input placeholder="작품명" value={work} onChange={(e) => setWork(e.target.value)} />
        </div>
        <input placeholder="메모 (선택)" value={note} onChange={(e) => setNote(e.target.value)} />
      </RecordsWriteShell>

      <div className="lh-rec__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={filter === 'all' ? 'is-active' : undefined}
          onClick={() => changeFilter('all')}
        >
          전체
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            className={filter === c.id ? 'is-active' : undefined}
            onClick={() => changeFilter(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {!shown.length && listPhase === 'in' ? <div className="page-coming">— 필사가 없습니다 —</div> : null}

      <div className={`lh-quote__list is-${listPhase}`}>
        {shown.map((item, index) => {
          const authorName = item.author?.trim() || '';
          const workName = item.work?.trim() || '';
          return (
            <SecretItemGate
              key={item.id}
              scope="quote"
              item={item}
              isAdmin={isAdmin}
              loggedIn={!!user}
              onRequestLogin={onOpenAuth}
            >
              <article
                className={`lh-quote__item${listPhase === 'in' ? ' is-in' : ' is-out'}${
                  item.pinned ? ' is-pinned' : ''
                }`}
                style={{ ['--lh-qi' as string]: String(Math.min(index, 8)) }}
              >
                {item.pinned ? (
                  <span className="lh-quote__pin" title="상단 고정" aria-label="상단 고정">
                    <IconPin />
                  </span>
                ) : null}
                {isAdmin ? (
                  <div className="lh-quote__tools">
                    <button
                      type="button"
                      className="lh-quote__tool"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void togglePin(item);
                      }}
                    >
                      {item.pinned ? '고정 해제' : '상단 고정'}
                    </button>
                    <button
                      type="button"
                      className="lh-quote__tool"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        startEdit(item);
                      }}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="lh-quote__tool"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void removeItem(item);
                      }}
                    >
                      삭제
                    </button>
                  </div>
                ) : null}
                <span className="lh-quote__mark" aria-hidden>
                  “
                </span>
                <p className={`lh-quote__text${isLatinQuote(item.text) ? ' is-latin' : ''}`}>{item.text}</p>
                {hasCite(item) ? (
                  <footer className="lh-quote__cite">
                    <span className="lh-quote__cite-rule" aria-hidden />
                    {authorName ? <span className="lh-quote__cite-author">{authorName}</span> : null}
                    {authorName && workName ? <span className="lh-quote__cite-dash">—</span> : null}
                    {workName ? <span className="lh-quote__cite-work">「{workName}」</span> : null}
                  </footer>
                ) : null}
                {item.note ? <p className="lh-quote__note">{item.note}</p> : null}
              </article>
            </SecretItemGate>
          );
        })}
      </div>

      {filtered.length > PAGE_SIZE ? (
        <nav className="lh-diary__pager" aria-label="필사 페이지">
          {pagerNums.map((n) => (
            <button
              key={n}
              type="button"
              className={`lh-diary__pager-btn${n === safePage ? ' is-current' : ''}`}
              aria-current={n === safePage ? 'page' : undefined}
              onClick={() => changePage(n)}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            className="lh-diary__pager-btn lh-diary__pager-btn--nav"
            aria-label="다음 페이지"
            disabled={safePage >= totalPages}
            onClick={() => changePage(Math.min(totalPages, safePage + 1))}
          >
            ›
          </button>
          <button
            type="button"
            className="lh-diary__pager-btn lh-diary__pager-btn--nav"
            aria-label="마지막 페이지"
            disabled={safePage >= totalPages}
            onClick={() => changePage(totalPages)}
          >
            »
          </button>
        </nav>
      ) : null}
    </div>
  );
}
