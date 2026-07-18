'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import type { User } from 'firebase/auth';
import { SecretItemGate } from '@/components/lake/SecretItemGate';
import { RecordsWriteShell, useRecordsComposer } from '@/components/records/RecordsWriteShell';
import { TwitterOEmbed, TwitterWidgetsScript } from '@/components/records/TwitterOEmbed';
import { YoutubeEmbedCard } from '@/components/records/YoutubeEmbedCard';
import { LakeSearchField } from '@/components/ui/LakeSearchField';
import { SecretPostFields } from '@/components/ui/SecretPostFields';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { useSaveToast } from '@/components/ui/SaveToast';
import { detectScrapKind, hostLabel } from '@/lib/scrap/detect';
import { useSiteContent } from '@/lib/hooks/useSiteContent';
import {
  DEFAULT_SCRAP_CATEGORIES,
  newId,
  type ScrapItem,
  type ScrapKind,
} from '@/lib/types/site-content';

type Props = {
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
  active?: boolean;
};

function resolveKind(item: ScrapItem): ScrapKind {
  if (item.kind) return item.kind;
  return detectScrapKind(item.sourceUrl, item.body);
}

function normalizeTag(raw: string) {
  const t = raw.trim().replace(/^#+/, '');
  if (!t) return '';
  return `#${t}`;
}

/** 직접 입력한 태그만 — 영상 제목/채널 자동 태그 제외 (author/handle은 태그로 재사용될 수 있어 제외하지 않음) */
function resolveTags(item: ScrapItem): string[] {
  const blocked = new Set(
    [item.youtubeTitle, item.youtubeChannel]
      .map((v) => normalizeTag(v || ''))
      .filter(Boolean),
  );
  const fromArr = (item.tags || []).map(normalizeTag).filter(Boolean);
  const raw = fromArr.length ? fromArr : item.tag ? [normalizeTag(item.tag)] : [];
  return Array.from(new Set(raw.filter((t) => t && !blocked.has(t))));
}

function formatScrapDay(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}

function IconPin() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
      <path
        fill="currentColor"
        d="M16 3a1 1 0 0 1 .8 1.6l-1.5 2 1.2 4.2a1 1 0 0 1-1.55 1.1L12.5 10.3V18a.5.5 0 0 1-1 0v-7.7L9.05 11.9a1 1 0 0 1-1.55-1.1l1.2-4.2-1.5-2A1 1 0 0 1 8 3h8z"
      />
    </svg>
  );
}

function IconLink() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        d="M10 14a4 4 0 0 0 5.7.4l2-2a4 4 0 0 0-5.6-5.7l-1.1 1.1M14 10a4 4 0 0 0-5.7-.4l-2 2a4 4 0 0 0 5.6 5.7l1.1-1.1"
      />
    </svg>
  );
}

async function fetchEmbed(url: string) {
  const res = await fetch(`/api/scrap-embed?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error('embed failed');
  return (await res.json()) as {
    kind: ScrapKind;
    sourceUrl: string;
    author?: string;
    handle?: string;
    body?: string;
    embedHtml?: string;
    youtubeId?: string;
    youtubeTitle?: string;
    youtubeChannel?: string;
    youtubeThumbUrl?: string;
    youtubeEmbedHtml?: string;
    youtubeDuration?: string;
    youtubeUploadDate?: string;
    fallback?: boolean;
  };
}

function ScrapTagChips({
  tags,
  draft,
  onDraftChange,
  onChange,
}: {
  tags: string[];
  draft: string;
  onDraftChange: (v: string) => void;
  onChange: (next: string[]) => void;
}) {
  function commit(raw: string) {
    const parts = raw.split(/[,，]/).map(normalizeTag).filter(Boolean);
    if (!parts.length) return;
    onChange(Array.from(new Set([...tags, ...parts])));
    onDraftChange('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
      return;
    }
    if (e.key === 'Backspace' && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="lh-scrap__tag-input">
      {tags.map((t) => (
        <button
          key={t}
          type="button"
          className="lh-scrap__pill lh-scrap__pill--edit"
          onClick={() => onChange(tags.filter((x) => x !== t))}
          title="클릭하여 제거"
        >
          {t}
          <span aria-hidden>×</span>
        </button>
      ))}
      <input
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (draft.trim()) commit(draft);
        }}
        placeholder={tags.length ? '태그 추가 (Enter)' : '태그 (Enter / 쉼표)'}
      />
    </div>
  );
}

function ScrapCard({
  item,
  onOpen,
  onTagClick,
  activeTag,
  pageActive,
}: {
  item: ScrapItem;
  onOpen: () => void;
  onTagClick: (tag: string) => void;
  activeTag: string | null;
  pageActive: boolean;
}) {
  const kind = resolveKind(item);
  const tags = resolveTags(item);
  const day = formatScrapDay(item.date);

  return (
    <article className="lh-scrap__card">
      <div className="lh-scrap__tag-row">
        <div className="lh-scrap__tag-left">
          <span className="lh-scrap__pin" aria-hidden>
            <IconPin />
          </span>
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              className={`lh-scrap__pill${activeTag === t ? ' is-active' : ''}`}
              onClick={() => onTagClick(t)}
            >
              {t}
            </button>
          ))}
        </div>
        {day ? <time className="lh-scrap__day">{day}</time> : null}
      </div>

      {kind === 'memo' && !item.sourceUrl ? (
        <button type="button" className="lh-scrap__note" onClick={onOpen}>
          {item.body || '—'}
        </button>
      ) : null}

      {kind === 'twitter' && item.sourceUrl ? (
        <>
          {item.body?.trim() ? <p className="lh-scrap__note-extra">{item.body}</p> : null}
          <TwitterOEmbed key={item.id} sourceUrl={item.sourceUrl} embedHtml={item.embedHtml} />
        </>
      ) : null}

      {kind === 'youtube' ? (
        <>
          {item.body?.trim() ? <p className="lh-scrap__note-extra">{item.body}</p> : null}
          <YoutubeEmbedCard key={item.id} item={item} active={pageActive} />
        </>
      ) : null}

      {kind === 'link' && item.sourceUrl ? (
        <a className="lh-scrap__link" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
          <div className="lh-scrap__link-top">
            <IconLink />
            외부 링크
          </div>
          <div className="lh-scrap__link-url">{hostLabel(item.sourceUrl)}</div>
          {item.body ? <p className="lh-scrap__link-memo">{item.body}</p> : null}
        </a>
      ) : null}

      {kind === 'memo' && item.sourceUrl ? (
        <a className="lh-scrap__link" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
          <div className="lh-scrap__link-top">
            <IconLink />
            외부 링크
          </div>
          <div className="lh-scrap__link-url">{hostLabel(item.sourceUrl)}</div>
        </a>
      ) : null}
    </article>
  );
}

export function ScrapTab({ user, isAdmin, onOpenAuth, active = true }: Props) {
  const { scrap, saveScrap, scrapCategories } = useSiteContent();
  const { showSaveToast } = useSaveToast();
  const { confirm } = useLakeDialog();
  const { open, leaving, openComposer, closeComposer, finishClose } = useRecordsComposer();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [body, setBody] = useState('');
  const [secret, setSecret] = useState(false);
  const [secretPassword, setSecretPassword] = useState('');
  const [resolving, setResolving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const raw = scrapCategories.length ? scrapCategories : DEFAULT_SCRAP_CATEGORIES;
    const rest = raw.filter((c) => c.id !== 'all');
    return [{ id: 'all', label: '전체' }, ...rest];
  }, [scrapCategories]);

  const categoryChoices = useMemo(
    () => categories.filter((c) => c.id !== 'all'),
    [categories],
  );

  const visible = useMemo(() => {
    const list = [...scrap].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return list.filter((item) => {
      if (filter !== 'all' && (item.categoryId || '') !== filter) return false;
      const itemTags = resolveTags(item);
      if (activeTag && !itemTags.includes(activeTag)) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return [...itemTags, item.tag, item.author, item.body, item.handle, item.sourceUrl, item.youtubeTitle]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [scrap, filter, query, activeTag]);

  function resetComposer() {
    setEditingId(null);
    setTags([]);
    setTagDraft('');
    setCategoryId(categoryChoices[0]?.id || '');
    setSourceUrl('');
    setBody('');
    setSecret(false);
    setSecretPassword('');
  }

  function handleOpen() {
    resetComposer();
    openComposer();
  }

  function handleCloseFinished() {
    finishClose();
    resetComposer();
  }

  async function submit() {
    if (!isAdmin) return;
    const url = sourceUrl.trim();
    const memo = body.trim();
    const pending = normalizeTag(tagDraft);
    const finalTags = Array.from(new Set([...tags, ...(pending ? [pending] : [])]));
    if (!url && !memo && !finalTags.length) return;

    setResolving(true);
    try {
      const primary = finalTags[0] || undefined;
      let item: ScrapItem = {
        id: editingId || newId(),
        tags: finalTags.length ? finalTags : undefined,
        tag: primary,
        author: primary || hostLabel(url) || 'Scrap',
        body: memo,
        sourceUrl: url || undefined,
        categoryId: categoryId || undefined,
        secret: secret || undefined,
        secretPassword: secret ? secretPassword.trim() || undefined : undefined,
        date: editingId
          ? scrap.find((s) => s.id === editingId)?.date || new Date().toISOString()
          : new Date().toISOString(),
        kind: detectScrapKind(url, memo),
        embedHtml: undefined,
      };

      if (url) {
        try {
          const embed = await fetchEmbed(url);
          item = {
            ...item,
            kind: embed.kind,
            sourceUrl: embed.sourceUrl || url,
            author: embed.author || item.author,
            handle: embed.handle,
            body: memo,
            embedHtml: embed.embedHtml,
            youtubeId: embed.youtubeId,
            youtubeTitle: embed.youtubeTitle,
            youtubeChannel: embed.youtubeChannel,
            youtubeThumbUrl: embed.youtubeThumbUrl,
            youtubeEmbedHtml: embed.youtubeEmbedHtml,
            youtubeDuration: embed.youtubeDuration,
            youtubeUploadDate: embed.youtubeUploadDate,
            tags: finalTags.length ? finalTags : undefined,
            // 태그는 직접 입력만 — 영상 제목/작성자 자동 채움 금지
            tag: primary,
            categoryId: categoryId || undefined,
          };
          if (embed.fallback && embed.kind === 'twitter') {
            item.embedHtml = undefined;
          }
        } catch {
          item.kind = detectScrapKind(url, memo);
        }
      } else {
        item.kind = 'memo';
        item.author = primary || '메모';
        item.tag = primary;
        item.tags = finalTags.length ? finalTags : undefined;
      }

      if (editingId) {
        await saveScrap(scrap.map((s) => (s.id === editingId ? { ...s, ...item, id: editingId } : s)));
      } else {
        await saveScrap([item, ...scrap]);
      }
      closeComposer();
      showSaveToast();
    } finally {
      setResolving(false);
    }
  }

  async function removeItem(item: ScrapItem) {
    if (!isAdmin) return;
    if (!(await confirm('이 스크랩을 삭제할까요?'))) return;
    await saveScrap(scrap.filter((s) => s.id !== item.id));
    showSaveToast();
  }

  function startEdit(item: ScrapItem) {
    setEditingId(item.id);
    setTags(resolveTags(item));
    setTagDraft('');
    setCategoryId(item.categoryId || categoryChoices[0]?.id || '');
    setSourceUrl(item.sourceUrl || '');
    setBody(item.body || '');
    setSecret(!!item.secret);
    setSecretPassword(item.secretPassword || '');
    openComposer();
  }

  function toggleTagFilter(tag: string) {
    setActiveTag((cur) => (cur === tag ? null : tag));
  }

  return (
    <div className="lh-scrap">
      <TwitterWidgetsScript />

      <RecordsWriteShell
        heading="Scrap"
        sub="스크랩"
        isAdmin={isAdmin}
        writeLabel="+ 글 쓰기"
        modalLabel="스크랩 작성"
        modalTitle={editingId ? '스크랩 수정' : '새 스크랩'}
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
            <button
              type="button"
              className="lh-diary__pill"
              onClick={() => void submit()}
              disabled={resolving}
            >
              {resolving ? '불러오는 중…' : editingId ? '저장' : '등록'}
            </button>
          </>
        }
      >
        <ScrapTagChips tags={tags} draft={tagDraft} onDraftChange={setTagDraft} onChange={setTags} />
        {categoryChoices.length ? (
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categoryChoices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        ) : null}
        <input
          placeholder="URL 붙여넣기 (Twitter / YouTube / 링크)"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
        />
        <textarea
          rows={3}
          placeholder="메모 (URL 없으면 메모 카드)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <SecretPostFields
          value={{ secret, secretPassword }}
          onChange={(patch) => {
            if ('secret' in patch) setSecret(!!patch.secret);
            if ('secretPassword' in patch) setSecretPassword(patch.secretPassword || '');
          }}
        />
      </RecordsWriteShell>

      <div className="lh-scrap__bar">
        <div className="lh-rec__tabs" role="tablist">
          {categories.map((c) => (
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
        <LakeSearchField
          variant="line"
          wrapClassName="lh-scrap__search"
          placeholder="검색"
          value={query}
          onChange={setQuery}
        />
      </div>

      {activeTag ? (
        <div className="lh-scrap__tag-filter">
          <button type="button" className="lh-scrap__filter-clear" onClick={() => setActiveTag(null)}>
            {activeTag} ×
          </button>
        </div>
      ) : null}

      {!visible.length ? <div className="page-coming">— 스크랩이 없습니다 —</div> : null}

      <div className="lh-scrap__masonry">
        {visible.map((item) => (
          <SecretItemGate
            key={item.id}
            scope="scrap"
            item={item}
            isAdmin={isAdmin}
            loggedIn={!!user}
            onRequestLogin={onOpenAuth}
          >
            <div className="lh-scrap__masonry-item">
              <ScrapCard
                item={item}
                onOpen={() => startEdit(item)}
                onTagClick={toggleTagFilter}
                activeTag={activeTag}
                pageActive={active}
              />
              {isAdmin ? (
                <div className="lh-scrap__card-tools">
                  <button type="button" onClick={() => startEdit(item)}>
                    수정
                  </button>
                  <button type="button" onClick={() => void removeItem(item)}>
                    삭제
                  </button>
                </div>
              ) : null}
            </div>
          </SecretItemGate>
        ))}
      </div>
    </div>
  );
}
