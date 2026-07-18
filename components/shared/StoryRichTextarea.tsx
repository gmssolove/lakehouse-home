'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  getEditorDomPlain,
  getPlainSelectionOffsets,
  setPlainSelectionOffsets,
} from '@/lib/oc/richEditorSelection';
import { editorHtmlToMarks } from '@/lib/oc/richText';
import {
  applyRichRange,
  insertRichDivider,
  insertRichIcon,
  insertPlainAt,
  marksToCharAttrs,
  marksToEditorHtml,
  normalizeFontId,
  normalizeSizePx,
  projectPlainOffsets,
  STORY_RICH_FONTS,
  STORY_RICH_SIZE_BASE,
  STORY_RICH_SIZE_MAX,
  STORY_RICH_SIZE_MIN,
  STORY_RICH_SIZE_STEP,
  type RichMarkKind,
  type StoryRichFontId,
  type WrapOpts,
} from '@/lib/oc/richTextMarks';
import {
  pushRecentRichIcon,
  readRecentRichIcons,
  STORY_RICH_ICONS,
  type StoryRichIconId,
} from '@/lib/oc/richIcons';

type Props = {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  /** 하단 힌트·구분선 버튼 숨김 (외부에서 구분선 제어) */
  hideHint?: boolean;
  /** 에디터 세로 리사이즈 핸들 */
  resizable?: boolean;
};

export type StoryRichTextareaHandle = {
  insertDivider: () => void;
};

type Offsets = { start: number; end: number };

type BubblePos = {
  top: number;
  left: number;
  placement: 'above' | 'below';
};

type ActiveMarks = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  soft: boolean;
};

const HISTORY_LIMIT = 80;
const BUBBLE_GAP = 10;
const DEFAULT_ACTIVE: ActiveMarks = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  soft: false,
};

function htmlLeaksMarkers(html: string): boolean {
  const text = html.replace(/<[^>]*>/g, '');
  return /\{@|\{\/@\}|\{=|\{\/=\}|\{#|\*\*|\/\/|__|~~|%%/.test(text);
}

function readActiveFromSelection(marks: string, off: Offsets): {
  color: string;
  fontId: StoryRichFontId;
  sizePx: number;
  active: ActiveMarks;
} {
  const chars = marksToCharAttrs(marks);
  const len = chars.length;
  const lo = Math.max(0, Math.min(off.start, off.end, len));
  const hi = Math.max(0, Math.min(Math.max(off.start, off.end), len));
  let idx = -1;
  for (let i = lo; i < hi; i += 1) {
    if (chars[i] && chars[i].ch !== '\n') {
      idx = i;
      break;
    }
  }
  if (idx < 0) {
    return {
      color: '#d7a982',
      fontId: 'chosun',
      sizePx: STORY_RICH_SIZE_BASE,
      active: DEFAULT_ACTIVE,
    };
  }
  const a = chars[idx];
  return {
    color: a.color && /^#[0-9a-fA-F]{6}$/.test(a.color) ? a.color : '#d7a982',
    fontId: normalizeFontId(a.font || '') ?? 'chosun',
    sizePx: a.size ?? STORY_RICH_SIZE_BASE,
    active: {
      bold: !!a.bold,
      italic: !!a.italic,
      underline: !!a.underline,
      strike: !!a.strike,
      soft: !!a.soft,
    },
  };
}

function computeBubblePos(bubbleEl: HTMLElement | null): BubblePos | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const rects = range.getClientRects();
  const rect =
    rects.length > 0
      ? rects[0]
      : range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return null;

  const bw = bubbleEl?.offsetWidth || 268;
  const bh = bubbleEl?.offsetHeight || 72;
  let placement: 'above' | 'below' = 'above';
  let top = rect.top - bh - BUBBLE_GAP;
  if (top < 8) {
    top = rect.bottom + BUBBLE_GAP;
    placement = 'below';
  }
  /* 아래도 넘치면 위로 강제 */
  if (placement === 'below' && top + bh > window.innerHeight - 8) {
    top = Math.max(8, rect.top - bh - BUBBLE_GAP);
    placement = 'above';
  }
  let left = rect.left + rect.width / 2 - bw / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
  return { top, left, placement };
}

const BUBBLE_LEAVE_MS = 140;

export const StoryRichTextarea = forwardRef<StoryRichTextareaHandle, Props>(function StoryRichTextarea(
  {
    value,
    onChange,
    rows = 6,
    placeholder = '본문을 입력하세요',
    className = '',
    hideHint = false,
    resizable = false,
  },
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const marksRef = useRef(value);
  const hydratedRef = useRef(false);
  const savedSelRef = useRef<Offsets | null>(null);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const interactRef = useRef(false);
  /** 드래그로 선택 중 — mouseup 전까지 버블 숨김 */
  const selectingRef = useRef(false);
  const bubbleLeaveTimer = useRef(0);

  const [color, setColor] = useState('#d7a982');
  const [fontId, setFontId] = useState<StoryRichFontId>('chosun');
  const [sizePx, setSizePx] = useState(STORY_RICH_SIZE_BASE);
  const [active, setActive] = useState<ActiveMarks>(DEFAULT_ACTIVE);
  const [isEmpty, setIsEmpty] = useState(!value.trim());
  /** 표시 의도 (true면 페이드인) */
  const [bubbleOpen, setBubbleOpen] = useState(false);
  /** 페이드아웃 중에도 마운트 유지 */
  const [bubbleLeaving, setBubbleLeaving] = useState(false);
  /** 위치만 잡힌 채 아직 is-open 전 (첫 페인트용) */
  const [bubblePending, setBubblePending] = useState(false);
  const [bubblePos, setBubblePos] = useState<BubblePos | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [iconPopOpen, setIconPopOpen] = useState(false);
  const [recentIcons, setRecentIcons] = useState<StoryRichIconId[]>([]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    setRecentIcons(readRecentRichIcons());
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(bubbleLeaveTimer.current);
    };
  }, []);

  const closeBubble = useCallback(() => {
    setIconPopOpen(false);
    window.clearTimeout(bubbleLeaveTimer.current);
    setBubblePending(false);
    setBubbleOpen((wasOpen) => {
      if (wasOpen) {
        setBubbleLeaving(true);
        bubbleLeaveTimer.current = window.setTimeout(() => {
          setBubbleLeaving(false);
          setBubblePos(null);
          setActive(DEFAULT_ACTIVE);
        }, BUBBLE_LEAVE_MS);
      } else {
        setBubbleLeaving(false);
        setBubblePos(null);
      }
      return false;
    });
  }, []);

  const rememberSelection = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const off = getPlainSelectionOffsets(el, { allowCollapsed: true });
    if (off) savedSelRef.current = off;
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
    if (restore) {
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
      paint(value, savedSelRef.current);
    }
  }, [value, paint]);

  const syncBubble = useCallback(() => {
    const el = editorRef.current;
    if (!el) {
      closeBubble();
      return;
    }

    /* 드래그 중에는 절대 열지 않음 — mouseup 후에만 */
    if (selectingRef.current) return;

    /* 버블 내부 조작 중엔 선택이 잠깐 풀려도 유지 */
    if (interactRef.current) {
      const pos = computeBubblePos(bubbleRef.current);
      if (pos) setBubblePos(pos);
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      closeBubble();
      return;
    }
    if (!el.contains(sel.anchorNode) || !el.contains(sel.focusNode)) {
      closeBubble();
      return;
    }

    const off = getPlainSelectionOffsets(el);
    if (!off || off.start === off.end) {
      closeBubble();
      return;
    }

    savedSelRef.current = off;
    const fmt = readActiveFromSelection(marksRef.current, off);
    setColor(fmt.color);
    setFontId(fmt.fontId);
    setSizePx(fmt.sizePx);
    setActive(fmt.active);
    window.clearTimeout(bubbleLeaveTimer.current);
    setBubbleLeaving(false);
    const rough = computeBubblePos(bubbleRef.current);
    if (rough) setBubblePos(rough);
    /* 1프레임은 닫힌 상태로 마운트 → 그다음 is-open (transition 재생) */
    setBubblePending(true);
    setBubbleOpen(false);
    requestAnimationFrame(() => {
      setBubblePending(false);
      setBubbleOpen(true);
      const pos = computeBubblePos(bubbleRef.current);
      if (pos) setBubblePos(pos);
      requestAnimationFrame(() => {
        const pos2 = computeBubblePos(bubbleRef.current);
        if (pos2) setBubblePos(pos2);
      });
    });
  }, [closeBubble]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (bubbleRef.current?.contains(t)) return;
      if (editorRef.current?.contains(t)) {
        selectingRef.current = true;
        closeBubble();
        return;
      }
      /* 에디터·버블 밖 클릭 → 닫기 */
      interactRef.current = false;
      closeBubble();
    };
    const onPointerUp = () => {
      if (!selectingRef.current) return;
      selectingRef.current = false;
      /* 선택이 확정된 뒤 한 프레임 뒤 표시 */
      requestAnimationFrame(() => {
        requestAnimationFrame(() => syncBubble());
      });
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerUp, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerUp, true);
    };
  }, [closeBubble, syncBubble]);

  useEffect(() => {
    const onSel = () => {
      /* 드래그 중 selectionchange는 무시 — 팝업이 미리 뜨지 않게 */
      if (selectingRef.current) return;
      if (interactRef.current) {
        syncBubble();
        return;
      }
      /* 키보드 선택 등: 이미 확정된 선택만 반영 (드래그 아님) */
      syncBubble();
    };
    document.addEventListener('selectionchange', onSel);
    const onScrollOrResize = () => {
      if (selectingRef.current) return;
      if (!bubbleOpen && !bubbleLeaving) return;
      const pos = computeBubblePos(bubbleRef.current);
      if (pos) setBubblePos(pos);
    };
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('selectionchange', onSel);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [bubbleLeaving, bubbleOpen, syncBubble]);

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
    const caret = getPlainSelectionOffsets(el, { allowCollapsed: true });
    const next = ensureMarksSynced();
    setIsEmpty(!next.trim());
    if (caret) savedSelRef.current = caret;
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
    requestAnimationFrame(syncBubble);
  }, [onChange, paint, syncBubble]);

  const redo = useCallback(() => {
    const nxt = redoStackRef.current.pop();
    if (nxt === undefined) return;
    undoStackRef.current.push(marksRef.current);
    marksRef.current = nxt;
    onChange(nxt);
    paint(nxt, savedSelRef.current);
    requestAnimationFrame(syncBubble);
  }, [onChange, paint, syncBubble]);

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
        const { next, changed: stepChanged } = applyRichRange(marks, lo, hi, step.kind, {
          colorHex: color,
          fontId,
          sizePx,
          ...step.opts,
        });
        if (!stepChanged) continue;
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
        syncBubble();
      });
    },
    [color, commitMarks, ensureMarksSynced, fontId, resolveSelection, sizePx, syncBubble],
  );

  const apply = useCallback(
    (kind: RichMarkKind, opts?: WrapOpts) => {
      applyStack([{ kind, opts }]);
    },
    [applyStack],
  );

  const insertDivider = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const marks = ensureMarksSynced();
    const live = getPlainSelectionOffsets(el, { allowCollapsed: true });
    const plainLen = projectPlainOffsets(marks).plain.length;
    /* 포커스 손실·넓은 선택으로 윗줄이 지워지지 않게: 삽입점만 사용 */
    const saved = savedSelRef.current;
    let pos = plainLen;
    if (live) {
      pos = Math.max(live.start, live.end);
    } else if (saved) {
      pos = Math.max(saved.start, saved.end);
    }
    pos = Math.max(0, Math.min(pos, plainLen));
    const { next, caretPlain } = insertRichDivider(marks, pos, pos);
    savedSelRef.current = { start: caretPlain, end: caretPlain };
    commitMarks(next, { start: caretPlain, end: caretPlain });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const ed = editorRef.current;
        if (!ed) return;
        setPlainSelectionOffsets(ed, caretPlain, caretPlain);
        ed.focus();
        closeBubble();
      });
    });
  }, [closeBubble, commitMarks, ensureMarksSynced]);

  const insertIcon = useCallback(
    (iconId: StoryRichIconId) => {
      const el = editorRef.current;
      if (!el) return;
      const marks = ensureMarksSynced();
      const live = getPlainSelectionOffsets(el, { allowCollapsed: true });
      const plainLen = projectPlainOffsets(marks).plain.length;
      const saved = savedSelRef.current;
      let start = plainLen;
      let end = plainLen;
      if (live) {
        start = live.start;
        end = live.end;
      } else if (saved) {
        start = saved.start;
        end = saved.end;
      }
      start = Math.max(0, Math.min(start, plainLen));
      end = Math.max(0, Math.min(end, plainLen));
      const inserted = insertRichIcon(marks, start, end, iconId);
      if (!inserted) return;
      setRecentIcons(pushRecentRichIcon(iconId));
      setIconPopOpen(false);
      savedSelRef.current = { start: inserted.caretPlain, end: inserted.caretPlain };
      commitMarks(inserted.next, { start: inserted.caretPlain, end: inserted.caretPlain });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const ed = editorRef.current;
          if (!ed) return;
          setPlainSelectionOffsets(ed, inserted.caretPlain, inserted.caretPlain);
          ed.focus();
          syncBubble();
        });
      });
    },
    [commitMarks, ensureMarksSynced, syncBubble],
  );

  useImperativeHandle(ref, () => ({ insertDivider }), [insertDivider]);

  const onEditorKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const ed = editorRef.current;
        if (ed) {
          const sel = window.getSelection();
          const node = sel?.anchorNode;
          const el =
            node instanceof HTMLElement
              ? node
              : node?.parentElement instanceof HTMLElement
                ? node.parentElement
                : null;
          const hr =
            el?.closest?.('hr.oc-rich-hr, hr[data-rich="hr"]') ||
            (el?.classList.contains('oc-rich-hr') ? el : null);
          if (hr && ed.contains(hr)) {
            e.preventDefault();
            let next = hr.nextElementSibling as HTMLElement | null;
            if (!next || next.tagName !== 'P') {
              next = document.createElement('p');
              next.className = 'oc-rich-p oc-rich-p--blank';
              next.appendChild(document.createElement('br'));
              hr.after(next);
            }
            const range = document.createRange();
            range.selectNodeContents(next);
            range.collapse(true);
            sel?.removeAllRanges();
            sel?.addRange(range);
            commitTyped();
            return;
          }

          /* 브라우저 <br> 삽입은 마커로 유실됨 → 평문 \\n 으로 문단 분리 */
          e.preventDefault();
          const marks = ensureMarksSynced();
          const live = getPlainSelectionOffsets(ed, { allowCollapsed: true });
          const plainLen = projectPlainOffsets(marks).plain.length;
          let start = live?.start ?? savedSelRef.current?.start ?? plainLen;
          let end = live?.end ?? savedSelRef.current?.end ?? start;
          start = Math.max(0, Math.min(start, plainLen));
          end = Math.max(0, Math.min(end, plainLen));
          const inserted = insertPlainAt(marks, start, end, '\n');
          commitMarks(inserted.next, {
            start: inserted.caretPlain,
            end: inserted.caretPlain,
          });
          return;
        }
      }
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
    [commitMarks, commitTyped, ensureMarksSynced, redo, undo],
  );

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      const ed = editorRef.current;
      if (!ed) return;
      const text = e.clipboardData.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      const marks = ensureMarksSynced();
      const live = getPlainSelectionOffsets(ed, { allowCollapsed: true });
      const plainLen = projectPlainOffsets(marks).plain.length;
      let start = live?.start ?? savedSelRef.current?.start ?? plainLen;
      let end = live?.end ?? savedSelRef.current?.end ?? start;
      start = Math.max(0, Math.min(start, plainLen));
      end = Math.max(0, Math.min(end, plainLen));

      /* 구분선(---) 평문 구간 안이면 그 뒤로 이동 */
      const plain = projectPlainOffsets(marks).plain;
      const parts = plain.split('\n');
      let offset = 0;
      for (const part of parts) {
        if (part === '---' && start >= offset && start <= offset + 3) {
          start = end = offset + 3 + (offset + 3 < plain.length ? 1 : 0);
          break;
        }
        offset += part.length + 1;
      }

      const { next, caretPlain } = insertPlainAt(marks, start, end, text);
      savedSelRef.current = { start: caretPlain, end: caretPlain };
      commitMarks(next, { start: caretPlain, end: caretPlain });
    },
    [commitMarks, ensureMarksSynced],
  );

  const beginInteract = useCallback(() => {
    interactRef.current = true;
    rememberSelection();
  }, [rememberSelection]);

  const endInteract = useCallback(() => {
    window.setTimeout(() => {
      interactRef.current = false;
      syncBubble();
    }, 0);
  }, [syncBubble]);

  const bubbleMounted = portalReady && (bubbleOpen || bubbleLeaving || bubblePending) && bubblePos;
  const bubble = bubbleMounted ? (
      <div
        ref={bubbleRef}
        className={`lh-story-rich__bubble is-${bubblePos.placement}${bubbleOpen ? ' is-open' : ''}${bubbleLeaving ? ' is-leaving' : ''}`}
        role="toolbar"
        aria-label="본문 서식"
        style={
          {
            top: bubblePos.top,
            left: bubblePos.left,
            ['--story-rich-swatch' as string]: color,
          } as CSSProperties
        }
        onPointerDownCapture={(e) => {
          beginInteract();
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'OPTION') {
            e.preventDefault();
          }
          rememberSelection();
        }}
      >
        <div className="lh-story-rich__bubble-row">
          <button
            type="button"
            className={`lh-story-rich__btn${active.bold ? ' is-on' : ''}`}
            title="굵게"
            onMouseDown={preserveSelection}
            onClick={() => apply('bold')}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={`lh-story-rich__btn${active.italic ? ' is-on' : ''}`}
            title="기울임"
            onMouseDown={preserveSelection}
            onClick={() => apply('italic')}
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className={`lh-story-rich__btn${active.underline ? ' is-on' : ''}`}
            title="밑줄"
            onMouseDown={preserveSelection}
            onClick={() => apply('underline')}
          >
            <span style={{ textDecoration: 'underline' }}>U</span>
          </button>
          <button
            type="button"
            className={`lh-story-rich__btn${active.strike ? ' is-on' : ''}`}
            title="취소선"
            onMouseDown={preserveSelection}
            onClick={() => apply('strike')}
          >
            <span style={{ textDecoration: 'line-through' }}>S</span>
          </button>
          <button
            type="button"
            className={`lh-story-rich__btn${active.soft ? ' is-on' : ''}`}
            title="옅게"
            onMouseDown={preserveSelection}
            onClick={() => apply('soft')}
          >
            옅게
          </button>
          <span className="lh-story-rich__sep" aria-hidden />
          <label className="lh-story-rich__color" title="색 · 기본은 색 마크 제거">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#d7a982'}
              onMouseDown={() => beginInteract()}
              onBlur={endInteract}
              onChange={(e) => {
                setColor(e.target.value);
                apply('color', { colorHex: e.target.value, keepIfSame: true });
              }}
              aria-label="글자 색"
            />
            <button
              type="button"
              className="lh-story-rich__btn lh-story-rich__btn--quiet"
              title="기본 색"
              onMouseDown={preserveSelection}
              onClick={() => {
                apply('color', { clear: true });
                setColor('#d7a982');
              }}
            >
              기본
            </button>
          </label>
        </div>
        <div className="lh-story-rich__bubble-row">
          <label className="lh-story-rich__select" title="폰트">
            <select
              value={fontId}
              onMouseDown={() => beginInteract()}
              onBlur={endInteract}
              onChange={(e) => {
                const next = e.target.value as StoryRichFontId;
                setFontId(next);
                apply('font', { fontId: next });
                endInteract();
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
          <label className="lh-story-rich__size" title="크기 (px)">
            <input
              type="number"
              min={STORY_RICH_SIZE_MIN}
              max={STORY_RICH_SIZE_MAX}
              step={STORY_RICH_SIZE_STEP}
              value={sizePx}
              onMouseDown={() => beginInteract()}
              onBlur={endInteract}
              onChange={(e) => {
                const next = normalizeSizePx(e.target.value);
                if (next == null) return;
                setSizePx(next);
                apply('size', { sizePx: next });
              }}
              aria-label="글자 크기"
            />
          </label>
          <button
            type="button"
            className="lh-story-rich__btn"
            title="폰트+크기 적용"
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
            title="구분선"
            onMouseDown={preserveSelection}
            onClick={() => insertDivider()}
          >
            ─
          </button>
          <div className="lh-story-rich__icon-wrap">
            <button
              type="button"
              className={`lh-story-rich__btn${iconPopOpen ? ' is-on' : ''}`}
              title="단색 아이콘"
              aria-expanded={iconPopOpen}
              aria-haspopup="dialog"
              onMouseDown={preserveSelection}
              onClick={() => {
                beginInteract();
                setIconPopOpen((v) => !v);
              }}
            >
              <i className="ti ti-icons" aria-hidden />
            </button>
            {iconPopOpen ? (
              <div
                className="lh-story-rich__icon-pop"
                role="dialog"
                aria-label="아이콘 선택"
                onPointerDownCapture={(e) => {
                  e.preventDefault();
                  beginInteract();
                  rememberSelection();
                }}
              >
                {recentIcons.length ? (
                  <div className="lh-story-rich__icon-section">
                    <span className="lh-story-rich__icon-label">최근</span>
                    <div className="lh-story-rich__icon-grid">
                      {recentIcons.map((id) => (
                        <button
                          key={`r-${id}`}
                          type="button"
                          className="lh-story-rich__icon-cell"
                          title={id}
                          onMouseDown={preserveSelection}
                          onClick={() => insertIcon(id)}
                        >
                          <i className={`ti ti-${id}`} aria-hidden />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="lh-story-rich__icon-section">
                  <span className="lh-story-rich__icon-label">아이콘</span>
                  <div className="lh-story-rich__icon-grid">
                    {STORY_RICH_ICONS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className="lh-story-rich__icon-cell"
                        title={id}
                        onMouseDown={preserveSelection}
                        onClick={() => insertIcon(id)}
                      >
                        <i className={`ti ti-${id}`} aria-hidden />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="lh-story-rich__btn"
            title="실행 취소"
            onMouseDown={preserveSelection}
            onClick={undo}
          >
            ↩
          </button>
          <button
            type="button"
            className="lh-story-rich__btn"
            title="다시 실행"
            onMouseDown={preserveSelection}
            onClick={redo}
          >
            ↪
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div
      ref={rootRef}
      className={`lh-story-rich ${className}`.trim()}
      style={{ ['--story-rich-swatch' as string]: color } as CSSProperties}
    >
      {bubble ? createPortal(bubble, document.body) : null}

      <div
        ref={editorRef}
        className={`lh-story-rich__editor${isEmpty ? ' is-empty' : ''}${resizable ? ' is-resizable' : ''}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="본문 편집"
        data-placeholder={placeholder}
        style={{ minHeight: `${Math.max(6, rows) * 1.55}rem` }}
        onMouseUp={() => {
          rememberSelection();
          /* pointerup 핸들러가 열지만, 에디터 내부 mouseup도 보조 */
          if (!selectingRef.current) syncBubble();
        }}
        onKeyUp={() => {
          rememberSelection();
          syncBubble();
        }}
        onKeyDown={onEditorKeyDown}
        onPaste={onPaste}
        onInput={commitTyped}
        onBlur={commitTyped}
      />
      {!hideHint ? (
        <p className="lh-story-rich__hint">
          드래그해 서식 · 구분선은 「─」 또는 줄에 --- · Ctrl+Z / Ctrl+Y
          <button type="button" className="lh-story-rich__hint-btn" onClick={() => insertDivider()}>
            구분선
          </button>
        </p>
      ) : null}
    </div>
  );
});
