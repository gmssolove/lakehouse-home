'use client';

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import {
  getEditorDomPlain,
  getPlainSelectionOffsets,
  setPlainSelectionOffsets,
} from '@/lib/oc/richEditorSelection';
import { editorHtmlToMarks } from '@/lib/oc/richText';
import {
  marksToEditorHtml,
  plainOffsetsToMarkOffsets,
  projectPlainOffsets,
  normalizeSizePx,
  STORY_RICH_FONTS,
  STORY_RICH_SIZE_MAX,
  STORY_RICH_SIZE_MIN,
  wrapRichSelection,
  type RichMarkKind,
  type StoryRichFontId,
  type WrapOpts,
} from '@/lib/oc/richTextMarks';

type Props = {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
};

type Offsets = { start: number; end: number };

const HISTORY_LIMIT = 80;

function htmlLeaksMarkers(html: string): boolean {
  const text = html.replace(/<[^>]*>/g, '');
  return /\{@|\{\/@\}|\{=|\{\/=\}|\{#|\*\*|\/\/|__|~~|%%/.test(text);
}

export function StoryRichTextarea({
  value,
  onChange,
  rows = 6,
  placeholder = '본문을 입력하세요',
  className = '',
}: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const marksRef = useRef(value);
  const hydratedRef = useRef(false);
  const savedSelRef = useRef<Offsets | null>(null);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const [color, setColor] = useState('#d7a982');
  const [fontId, setFontId] = useState<StoryRichFontId>('chosun');
  const [sizePx, setSizePx] = useState(16);
  const [isEmpty, setIsEmpty] = useState(!value.trim());

  const rememberSelection = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const off = getPlainSelectionOffsets(el);
    if (off && off.start !== off.end) savedSelRef.current = off;
  }, []);

  const preserveSelection = useCallback(
    (e: { preventDefault: () => void }) => {
      e.preventDefault();
      rememberSelection();
    },
    [rememberSelection],
  );

  const resolveSelection = useCallback((): Offsets | null => {
    const el = editorRef.current;
    if (el) {
      const live = getPlainSelectionOffsets(el);
      if (live && live.start !== live.end) {
        savedSelRef.current = live;
        return live;
      }
    }
    const saved = savedSelRef.current;
    if (saved && saved.start !== saved.end) return saved;
    return null;
  }, []);

  const paint = useCallback((marks: string, restore?: Offsets | null) => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = marksToEditorHtml(marks);
    marksRef.current = marks;
    setIsEmpty(!marks.trim());
    if (restore && restore.start !== restore.end) {
      setPlainSelectionOffsets(el, restore.start, restore.end);
      savedSelRef.current = restore;
    }
  }, []);

  const pushHistory = useCallback((prev: string) => {
    const stack = undoStackRef.current;
    if (stack[stack.length - 1] === prev) return;
    stack.push(prev);
    if (stack.length > HISTORY_LIMIT) stack.shift();
    redoStackRef.current = [];
  }, []);

  const commitMarks = useCallback(
    (next: string, restore?: Offsets | null, opts?: { recordHistory?: boolean }) => {
      const prev = marksRef.current;
      if (next === prev) {
        if (restore) paint(next, restore);
        return;
      }
      if (opts?.recordHistory !== false) pushHistory(prev);
      /*
       * DOM roundTrip으로 덮어쓰면 굵게+폰트 중첩이 풀리는 경우가 있음.
       * 마커→HTML이 깨질 때만 복구용으로 roundTrip을 쓴다.
       */
      let normalized = next;
      if (htmlLeaksMarkers(marksToEditorHtml(next))) {
        const el = editorRef.current;
        if (el) {
          el.innerHTML = marksToEditorHtml(next);
          const roundTrip = editorHtmlToMarks(el);
          if (
            roundTrip &&
            projectPlainOffsets(roundTrip).plain === projectPlainOffsets(next).plain &&
            !htmlLeaksMarkers(marksToEditorHtml(roundTrip))
          ) {
            normalized = roundTrip;
          }
        }
      }

      marksRef.current = normalized;
      onChange(normalized);
      paint(normalized, restore ?? null);
    },
    [onChange, paint, pushHistory],
  );

  useLayoutEffect(() => {
    if (!hydratedRef.current) {
      paint(value);
      hydratedRef.current = true;
      return;
    }
    if (value !== marksRef.current) {
      /* 외부 value 변경은 히스토리에 안 넣음 */
      paint(value, savedSelRef.current);
    }
  }, [value, paint]);

  const ensureMarksSynced = useCallback((): string => {
    const el = editorRef.current;
    if (!el) return marksRef.current;
    const domPlain = getEditorDomPlain(el);
    const markPlain = projectPlainOffsets(marksRef.current).plain;
    if (domPlain === markPlain) return marksRef.current;
    const next = editorHtmlToMarks(el);
    marksRef.current = next;
    return next;
  }, []);

  const commitTyped = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const prev = marksRef.current;
    const next = ensureMarksSynced();
    setIsEmpty(!next.trim());
    if (next === value && next === prev) return;
    if (next !== prev) pushHistory(prev);
    marksRef.current = next;
    if (next !== value) onChange(next);
  }, [ensureMarksSynced, onChange, pushHistory, value]);

  const undo = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (prev === undefined) return;
    redoStackRef.current.push(marksRef.current);
    marksRef.current = prev;
    onChange(prev);
    paint(prev, savedSelRef.current);
  }, [onChange, paint]);

  const redo = useCallback(() => {
    const nxt = redoStackRef.current.pop();
    if (nxt === undefined) return;
    undoStackRef.current.push(marksRef.current);
    marksRef.current = nxt;
    onChange(nxt);
    paint(nxt, savedSelRef.current);
  }, [onChange, paint]);

  /** 같은 선택에 여러 서식을 순서대로 겹쳐 적용 (굵게 위에 폰트·크기 등) */
  const applyStack = useCallback(
    (steps: Array<{ kind: RichMarkKind; opts?: WrapOpts }>) => {
      if (!steps.length) return;
      const el = editorRef.current;
      if (!el) return;

      const plain = resolveSelection();
      if (!plain) return;

      let marks = ensureMarksSynced();
      const beforePlain = projectPlainOffsets(marks).plain;
      const plainLen = beforePlain.length;
      const lo = Math.max(0, Math.min(plain.start, plain.end, plainLen));
      const hi = Math.max(0, Math.min(Math.max(plain.start, plain.end), plainLen));
      if (lo >= hi) return;

      let changed = false;
      for (const step of steps) {
        const { start, end } = plainOffsetsToMarkOffsets(marks, lo, hi);
        if (start >= end) continue;
        const { next } = wrapRichSelection(marks, start, end, step.kind, {
          colorHex: color,
          fontId,
          sizePx,
          ...step.opts,
        });
        if (next === marks) continue;
        if (projectPlainOffsets(next).plain !== beforePlain) continue;
        if (htmlLeaksMarkers(marksToEditorHtml(next))) continue;
        marks = next;
        changed = true;
      }
      if (!changed) return;

      const restore = { start: lo, end: hi };
      savedSelRef.current = restore;
      commitMarks(marks, restore);

      requestAnimationFrame(() => {
        const ed = editorRef.current;
        if (!ed) return;
        setPlainSelectionOffsets(ed, restore.start, restore.end);
        ed.focus();
      });
    },
    [color, commitMarks, ensureMarksSynced, fontId, resolveSelection, sizePx],
  );

  const apply = useCallback(
    (kind: RichMarkKind, opts?: WrapOpts) => {
      applyStack([{ kind, opts }]);
    },
    [applyStack],
  );

  const onEditorKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }
      if (key === 'y') {
        e.preventDefault();
        redo();
      }
    },
    [redo, undo],
  );

  return (
    <div
      className={`lh-story-rich ${className}`.trim()}
      style={{ ['--story-rich-swatch' as string]: color } as CSSProperties}
    >
      <div
        className="lh-story-rich__bar"
        role="toolbar"
        aria-label="본문 서식"
        onPointerDownCapture={rememberSelection}
      >
        <button
          type="button"
          className="lh-story-rich__btn"
          title="굵게"
          onMouseDown={preserveSelection}
          onClick={() => apply('bold')}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className="lh-story-rich__btn"
          title="기울임"
          onMouseDown={preserveSelection}
          onClick={() => apply('italic')}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className="lh-story-rich__btn"
          title="밑줄"
          onMouseDown={preserveSelection}
          onClick={() => apply('underline')}
        >
          <span style={{ textDecoration: 'underline' }}>U</span>
        </button>
        <button
          type="button"
          className="lh-story-rich__btn"
          title="취소선"
          onMouseDown={preserveSelection}
          onClick={() => apply('strike')}
        >
          <span style={{ textDecoration: 'line-through' }}>S</span>
        </button>
        <button
          type="button"
          className="lh-story-rich__btn"
          title="옅게"
          onMouseDown={preserveSelection}
          onClick={() => apply('soft')}
        >
          옅게
        </button>
        <span className="lh-story-rich__sep" aria-hidden />
        <label className="lh-story-rich__color" title="색 고른 뒤 「색」">
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#d7a982'}
            onMouseDown={() => rememberSelection()}
            onChange={(e) => setColor(e.target.value)}
            aria-label="글자 색 선택"
          />
          <button
            type="button"
            className="lh-story-rich__btn"
            onMouseDown={preserveSelection}
            onClick={() => apply('color')}
          >
            색
          </button>
        </label>
        <span className="lh-story-rich__sep" aria-hidden />
        <label className="lh-story-rich__select" title="드래그한 구간에 바로 적용 (기존 굵게 등과 중첩)">
          <select
            value={fontId}
            onMouseDown={() => rememberSelection()}
            onChange={(e) => {
              const next = e.target.value as StoryRichFontId;
              setFontId(next);
              apply('font', { fontId: next });
            }}
            aria-label="폰트"
          >
            {STORY_RICH_FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="lh-story-rich__size" title="1px 단위 · 드래그한 구간에 바로 적용">
          <input
            type="number"
            min={STORY_RICH_SIZE_MIN}
            max={STORY_RICH_SIZE_MAX}
            step={1}
            value={sizePx}
            onMouseDown={() => rememberSelection()}
            onChange={(e) => {
              const next = normalizeSizePx(e.target.value);
              if (next == null) return;
              setSizePx(next);
              apply('size', { sizePx: next });
            }}
            aria-label="글자 크기 (px)"
          />
          <span aria-hidden>px</span>
        </label>
        <button
          type="button"
          className="lh-story-rich__btn"
          title="선택 구간에 폰트+크기 한 번에 적용 (굵게 등과 중첩 유지)"
          onMouseDown={preserveSelection}
          onClick={() =>
            applyStack([
              { kind: 'font', opts: { fontId, keepIfSame: true } },
              { kind: 'size', opts: { sizePx, keepIfSame: true } },
            ])
          }
        >
          Aa
        </button>
        <span className="lh-story-rich__sep" aria-hidden />
        <button
          type="button"
          className="lh-story-rich__btn"
          title="실행 취소 (Ctrl+Z)"
          onMouseDown={preserveSelection}
          onClick={undo}
        >
          ↩
        </button>
        <button
          type="button"
          className="lh-story-rich__btn"
          title="다시 실행 (Ctrl+Y)"
          onMouseDown={preserveSelection}
          onClick={redo}
        >
          ↪
        </button>
      </div>

      <div
        ref={editorRef}
        className={`lh-story-rich__editor${isEmpty ? ' is-empty' : ''}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="본문 편집"
        data-placeholder={placeholder}
        style={{ minHeight: `${Math.max(6, rows) * 1.55}rem` }}
        onMouseUp={rememberSelection}
        onKeyUp={rememberSelection}
        onSelect={rememberSelection}
        onKeyDown={onEditorKeyDown}
        onInput={commitTyped}
        onBlur={commitTyped}
      />
      <p className="lh-story-rich__hint">Ctrl+Z 되돌리기 · Ctrl+Y / Ctrl+Shift+Z 다시 실행</p>
    </div>
  );
}
