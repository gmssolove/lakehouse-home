'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { DialogueChoice, DialogueNode } from '@/lib/types/character';
import {
  DIALOGUE_FX_OPTIONS,
  DIALOGUE_MOTION_OPTIONS,
  isDialogueFx,
  isDialogueMotion,
  normalizeMotion,
} from '@/lib/vn/motions';

export type DialogueSpeakerPreset = { label: string; value: string };

/** 나레이션 마커 — 이름 칸 비움 · Pair에서는 양쪽 어두움 */
export const NARRATION_SPEAKER = '__narration__';

export function isNarrationSpeaker(speaker?: string) {
  const raw = (speaker || '').trim();
  return !raw || raw === NARRATION_SPEAKER || raw === '나레이션';
}

type Props = {
  nodes: DialogueNode[];
  onChange: (nodes: DialogueNode[]) => void;
  speakerPresets: DialogueSpeakerPreset[];
  defaultSpeaker?: string;
  onUploadExpression?: (index: number, file: File) => void | Promise<void>;
  onUploadVoice?: (index: number, file: File) => void | Promise<void>;
  uploadBusy?: boolean;
  listIdPrefix?: string;
  hint?: string;
  startId?: string;
  onStartIdChange?: (id: string) => void;
};

function nextDialogueId(rows: DialogueNode[]): string {
  const used = new Set(rows.map((r) => String(r.id)));
  const nums = rows
    .map((r) => Number(r.id))
    .filter((n) => Number.isFinite(n) && n > 0);
  let next = (nums.length ? Math.max(...nums) : 0) + 1;
  while (used.has(String(next))) next += 1;
  return String(next);
}

function emptyNode(rows: DialogueNode[], defaultSpeaker?: string): DialogueNode {
  return {
    id: nextDialogueId(rows),
    speaker: defaultSpeaker ?? '',
    text: '',
    next: '',
    choices: [],
  };
}

function previewText(text?: string, max = 42) {
  const t = (text || '').trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function speakerLabel(speaker: string | undefined, presets: DialogueSpeakerPreset[]) {
  if (isNarrationSpeaker(speaker)) return '나레이션';
  const raw = (speaker || '').trim();
  const hit = presets.find((p) => p.value === raw);
  return hit?.label || raw || '화자 미정';
}

function nextKind(next?: string): 'seq' | 'end' | 'jump' {
  const v = (next || '').trim();
  if (!v) return 'seq';
  if (v === '__end__') return 'end';
  return 'jump';
}

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function remapOpenIndex(idx: number, from: number, to: number): number {
  if (idx === from) return to;
  if (from < to) {
    if (idx > from && idx <= to) return idx - 1;
  } else if (to < from) {
    if (idx >= to && idx < from) return idx + 1;
  }
  return idx;
}

/** OC / Pair 수정탭 공통 VN 대사 에디터 */
export function DialogueNodesEditor({
  nodes,
  onChange,
  speakerPresets,
  defaultSpeaker,
  onUploadExpression,
  onUploadVoice,
  uploadBusy,
  listIdPrefix = 'dlg',
  hint,
  startId,
  onStartIdChange,
}: Props) {
  /** id 기반이 아니라 줄 번호로 펼침 — id 중복/변경 시 펼침 깨짐 방지 */
  const [openSet, setOpenSet] = useState<Set<number>>(() =>
    nodes.length ? new Set([nodes.length - 1]) : new Set(),
  );
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    speaker: string;
    text: string;
  } | null>(null);
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  const dragFromRef = useRef<number | null>(null);
  const dragOverRef = useRef<number | null>(null);
  const slotMidsRef = useRef<number[]>([]);
  const lenRef = useRef(nodes.length);

  dragFromRef.current = dragFrom;
  dragOverRef.current = dragOver;

  useEffect(() => {
    const prev = lenRef.current;
    lenRef.current = nodes.length;
    if (nodes.length === 0) {
      setOpenSet(new Set());
      return;
    }
    if (nodes.length > prev) {
      setOpenSet(new Set([nodes.length - 1]));
    } else if (nodes.length < prev) {
      setOpenSet((old) => {
        const next = new Set<number>();
        old.forEach((i) => {
          if (i < nodes.length) next.add(i);
        });
        return next;
      });
    }
  }, [nodes.length]);

  const allOpen = nodes.length > 0 && nodes.every((_, i) => openSet.has(i));
  const allClosed = nodes.length > 0 && nodes.every((_, i) => !openSet.has(i));
  const voiceCount = nodes.filter((n) => (n.voice || '').trim()).length;

  function setNodes(next: DialogueNode[]) {
    onChange(next);
  }

  function clearAllVoices() {
    if (!voiceCount) return;
    if (!window.confirm(`등록된 대사 음성 ${voiceCount}개를 모두 지울까요?`)) return;
    setNodes(
      nodes.map((n) => ((n.voice || '').trim() ? { ...n, voice: '' } : n)),
    );
  }

  function updateNode(i: number, patch: Partial<DialogueNode>) {
    const rows = [...nodes];
    rows[i] = { ...rows[i], ...patch };
    setNodes(rows);
  }

  function updateChoice(i: number, ci: number, patch: Partial<DialogueChoice>) {
    const rows = [...nodes];
    const node = rows[i];
    if (!node) return;
    const choices = [...(node.choices || [])];
    choices[ci] = { ...choices[ci], ...patch };
    rows[i] = { ...node, choices };
    setNodes(rows);
  }

  function addChoice(i: number) {
    const rows = [...nodes];
    const node = rows[i];
    if (!node) return;
    const mode = node.choiceMode === 'action' ? 'action' : 'dialogue';
    rows[i] = {
      ...node,
      choiceMode: mode,
      choices: [...(node.choices || []), { label: '', next: '' }],
    };
    setNodes(rows);
  }

  function removeChoice(i: number, ci: number) {
    const rows = [...nodes];
    const node = rows[i];
    if (!node) return;
    rows[i] = { ...node, choices: (node.choices || []).filter((_, idx) => idx !== ci) };
    setNodes(rows);
  }

  function setChoiceMode(i: number, mode: 'dialogue' | 'action' | 'none') {
    const rows = [...nodes];
    const node = rows[i];
    if (!node) return;
    if (mode === 'none') {
      rows[i] = { ...node, choiceMode: 'dialogue', choices: [] };
    } else {
      rows[i] = {
        ...node,
        choiceMode: mode,
        choices: node.choices?.length ? node.choices : [{ label: '', next: '' }],
      };
    }
    setNodes(rows);
  }

  function addNode() {
    const created = emptyNode(nodes, defaultSpeaker);
    setNodes([...nodes, created]);
    setOpenSet(new Set([nodes.length]));
  }

  function removeNode(i: number) {
    setNodes(nodes.filter((_, idx) => idx !== i));
    setOpenSet((old) => {
      const next = new Set<number>();
      old.forEach((idx) => {
        if (idx < i) next.add(idx);
        else if (idx > i) next.add(idx - 1);
      });
      return next;
    });
  }

  function reorderNode(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= nodes.length || to >= nodes.length) return;
    setNodes(arrayMove(nodes, from, to));
    setOpenSet((old) => {
      const next = new Set<number>();
      old.forEach((idx) => next.add(remapOpenIndex(idx, from, to)));
      return next;
    });
  }

  function hitIndexAtY(clientY: number): number | null {
    const mids = slotMidsRef.current;
    if (!mids.length) return null;
    for (let i = 0; i < mids.length; i += 1) {
      if (clientY < mids[i]) return i;
    }
    return mids.length - 1;
  }

  function endDrag(commit: boolean) {
    const from = dragFromRef.current;
    const to = dragOverRef.current;
    setDragFrom(null);
    setDragOver(null);
    setGhost(null);
    dragFromRef.current = null;
    dragOverRef.current = null;
    slotMidsRef.current = [];
    if (commit && from != null && to != null) reorderNode(from, to);
  }

  function onDragHandlePointerDown(e: ReactPointerEvent<HTMLButtonElement>, i: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const row = rowRefs.current[i];
    if (!row) return;
    const rect = row.getBoundingClientRect();
    const node = nodes[i];
    slotMidsRef.current = rowRefs.current.map((el) => {
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    e.currentTarget.setPointerCapture(e.pointerId);
    dragFromRef.current = i;
    dragOverRef.current = i;
    setDragFrom(i);
    setDragOver(i);
    setGhost({
      x: rect.left,
      y: e.clientY - Math.min(rect.height, 56) / 2,
      w: rect.width,
      h: Math.min(rect.height, 56),
      speaker: speakerLabel(node?.speaker, speakerPresets),
      text: previewText(node?.text) || '(내용 없음)',
    });
  }

  function onDragHandlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (dragFromRef.current == null) return;
    const nextOver = hitIndexAtY(e.clientY);
    if (nextOver != null && nextOver !== dragOverRef.current) {
      dragOverRef.current = nextOver;
      setDragOver(nextOver);
    }
    setGhost((g) =>
      g
        ? {
            ...g,
            y: e.clientY - g.h / 2,
          }
        : g,
    );
  }

  function onDragHandlePointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    if (dragFromRef.current == null) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    endDrag(true);
  }

  function slideOffset(i: number): number {
    if (dragFrom == null || dragOver == null || dragFrom === dragOver) return 0;
    const src = rowRefs.current[dragFrom];
    const gap = (src?.offsetHeight ?? 48) + 8;
    if (dragFrom < dragOver) {
      if (i > dragFrom && i <= dragOver) return -gap;
    } else if (i >= dragOver && i < dragFrom) {
      return gap;
    }
    return 0;
  }

  function toggle(i: number) {
    setOpenSet((old) => {
      const next = new Set(old);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function expandAll() {
    setOpenSet(new Set(nodes.map((_, i) => i)));
  }

  function collapseAll() {
    setOpenSet(new Set());
  }

  function setFlow(i: number, kind: 'seq' | 'end' | 'jump', jumpId?: string) {
    if (kind === 'seq') updateNode(i, { next: '' });
    else if (kind === 'end') updateNode(i, { next: '__end__' });
    else updateNode(i, { next: jumpId || '' });
  }

  const startValue = startId || nodes[0]?.id || '';

  return (
    <div className="lh-dialogue-editor">
      {hint ? <p className="lh-dialogue-editor__hint">{hint}</p> : null}

      {onStartIdChange ? (
        <div className="lh-dialogue-editor__start">
          <label className="form-label">어디부터 시작할까요?</label>
          <select
            className="form-input"
            value={startValue}
            onChange={(e) => onStartIdChange(e.target.value)}
          >
            {nodes.length === 0 ? <option value="">(대사 없음)</option> : null}
            {nodes.map((n, ni) => (
              <option key={`start-${ni}`} value={n.id}>
                {ni + 1}번 · {speakerLabel(n.speaker, speakerPresets)} ·{' '}
                {previewText(n.text) || '(빈 대사)'}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {nodes.length > 0 ? (
        <div className="lh-dialogue-editor__toolbar">
          <button type="button" className="lh-dialogue-editor__tool" onClick={expandAll} disabled={allOpen}>
            전부 펼치기
          </button>
          <button type="button" className="lh-dialogue-editor__tool" onClick={collapseAll} disabled={allClosed}>
            전부 접기
          </button>
          <button
            type="button"
            className="lh-dialogue-editor__tool lh-dialogue-editor__tool--danger"
            onClick={clearAllVoices}
            disabled={!voiceCount}
            title="이 목록에 등록된 대사 음성을 모두 제거"
          >
            음성 일괄 초기화{voiceCount ? ` (${voiceCount})` : ''}
          </button>
          <span className="lh-dialogue-editor__count">{nodes.length}줄 · 드래그로 순서</span>
        </div>
      ) : (
        <p className="lh-dialogue-editor__hint">아직 대사가 없습니다. 아래에서 한 줄씩 추가하세요.</p>
      )}

      <div className={`lh-dialogue-list${dragFrom != null ? ' is-sorting' : ''}`}>
        {nodes.map((node, i) => {
          const open = openSet.has(i);
          const choices = node.choices || [];
          const choiceCount = choices.filter((c) => c.label?.trim()).length;
          const hasChoices = choices.length > 0;
          const choiceModeUi: 'none' | 'dialogue' | 'action' = !hasChoices
            ? 'none'
            : node.choiceMode === 'action'
              ? 'action'
              : 'dialogue';
          const flow = nextKind(node.next);
          const jumpId =
            flow === 'jump' && nodes.some((n) => String(n.id) === String(node.next))
              ? String(node.next)
              : nodes.find((n, ni) => ni !== i)?.id || '';
          const shiftY = slideOffset(i);

          return (
            <article
              key={`${listIdPrefix}-row-${String(node.id)}-${i}`}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              className={`lh-dialogue-node${open ? ' is-open' : ' is-collapsed'}${
                dragFrom === i ? ' is-dragging' : ''
              }${dragOver === i && dragFrom !== null && dragFrom !== i ? ' is-drop-slot' : ''}`}
              style={
                dragFrom != null
                  ? {
                      transform: dragFrom === i ? undefined : `translateY(${shiftY}px)`,
                    }
                  : undefined
              }
            >
              <header className="lh-dialogue-node__bar">
                <button
                  type="button"
                  className="lh-dialogue-node__drag"
                  title="드래그해서 순서 변경"
                  aria-label={`${i + 1}번 대사 드래그`}
                  onPointerDown={(e) => onDragHandlePointerDown(e, i)}
                  onPointerMove={onDragHandlePointerMove}
                  onPointerUp={onDragHandlePointerUp}
                  onPointerCancel={() => endDrag(false)}
                >
                  ⋮⋮
                </button>
                <button
                  type="button"
                  className="lh-dialogue-node__toggle"
                  onClick={() => toggle(i)}
                  aria-expanded={open}
                >
                  <span className="lh-dialogue-node__chevron" aria-hidden>
                    {open ? '▼' : '▶'}
                  </span>
                  <span className="lh-dialogue-node__idx">{i + 1}</span>
                  <span className="lh-dialogue-node__summary">
                    <em>{speakerLabel(node.speaker, speakerPresets)}</em>
                    <span>{previewText(node.text) || '(내용 없음)'}</span>
                    {choiceCount > 0 ? (
                      <span className="lh-dialogue-node__badge">선택 {choiceCount}</span>
                    ) : null}
                    {node.location?.trim() ? (
                      <span className="lh-dialogue-node__badge lh-dialogue-node__badge--loc">
                        {node.location.trim()}
                      </span>
                    ) : null}
                  </span>
                </button>
              </header>

              {open ? (
                <div className="lh-dialogue-node__body">
                  <section className="lh-dialogue-block">
                    <div className="lh-dialogue-block__label">1. 누가 말하나요?</div>
                    <div className="lh-dialogue-node__presets">
                      <button
                        type="button"
                        className={`lh-dialogue-chip${isNarrationSpeaker(node.speaker) ? ' is-active' : ''}`}
                        onClick={() => updateNode(i, { speaker: NARRATION_SPEAKER })}
                      >
                        나레이션
                      </button>
                      {speakerPresets.map((p) => (
                        <button
                          key={`${p.value}-${p.label}`}
                          type="button"
                          className={`lh-dialogue-chip${
                            !isNarrationSpeaker(node.speaker) && node.speaker === p.value ? ' is-active' : ''
                          }`}
                          onClick={() => updateNode(i, { speaker: p.value })}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    {!isNarrationSpeaker(node.speaker) ? (
                      <input
                        className="form-input"
                        list={`${listIdPrefix}-speaker-${i}`}
                        placeholder="이름 직접 입력 (선택)"
                        value={node.speaker || ''}
                        onChange={(e) => updateNode(i, { speaker: e.target.value })}
                      />
                    ) : (
                      <p className="lh-dialogue-editor__hint" style={{ margin: '6px 0 0' }}>
                        이름란은 비워 두고, 본문만 나레이션으로 보여 줍니다. (Pair: 캐릭터 둘 다 어두워짐)
                      </p>
                    )}
                    <datalist id={`${listIdPrefix}-speaker-${i}`}>
                      {speakerPresets.map((p) => (
                        <option key={`dl-${p.value}`} value={p.value} />
                      ))}
                    </datalist>
                  </section>

                  <section className="lh-dialogue-block">
                    <div className="lh-dialogue-block__label">2. 대사</div>
                    <textarea
                      className="form-input lh-dialogue-node__text"
                      rows={3}
                      placeholder={
                        isNarrationSpeaker(node.speaker)
                          ? '나레이션 본문…'
                          : '캐릭터가 말할 내용…'
                      }
                      value={node.text}
                      onChange={(e) => updateNode(i, { text: e.target.value })}
                    />
                    <div className="lh-dialogue-block__label" style={{ marginTop: 10 }}>
                      장소 (대사창 상단에 표시)
                    </div>
                    <input
                      className="form-input"
                      placeholder="예: 교실 안"
                      value={node.location || ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateNode(i, { location: v });
                      }}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        updateNode(i, { location: v || undefined });
                      }}
                    />
                    <p className="lh-dialogue-editor__hint" style={{ margin: '6px 0 0' }}>
                      저장 후 캐릭터를 클릭해 대사창을 열면, 화면 중앙에 장소가 뜬 뒤 좌상단에 남습니다. 같은
                      장소가 이어지면 연출이 반복되지 않습니다.
                    </p>
                  </section>

                  <section className="lh-dialogue-block">
                    <div className="lh-dialogue-block__label">3. 이 대사 다음에</div>
                    <div className="lh-dialogue-flow">
                      <label className="lh-dialogue-radio">
                        <input
                          type="radio"
                          name={`${listIdPrefix}-flow-${i}`}
                          checked={flow === 'seq'}
                          onChange={() => setFlow(i, 'seq')}
                        />
                        바로 다음 줄({i + 2 > nodes.length ? '끝' : `${i + 2}번`})
                      </label>
                      <label className="lh-dialogue-radio">
                        <input
                          type="radio"
                          name={`${listIdPrefix}-flow-${i}`}
                          checked={flow === 'end'}
                          onChange={() => setFlow(i, 'end')}
                        />
                        여기서 대화 종료
                      </label>
                      <label className="lh-dialogue-radio">
                        <input
                          type="radio"
                          name={`${listIdPrefix}-flow-${i}`}
                          checked={flow === 'jump'}
                          onChange={() => setFlow(i, 'jump', jumpId)}
                        />
                        다른 줄로 점프
                      </label>
                    </div>
                    {flow === 'jump' ? (
                      <select
                        className="form-input"
                        value={
                          nodes.some((n) => String(n.id) === String(node.next))
                            ? String(node.next)
                            : ''
                        }
                        onChange={(e) => setFlow(i, 'jump', e.target.value)}
                      >
                        <option value="">대사 선택…</option>
                        {nodes.map((n, ni) =>
                          ni === i ? null : (
                            <option key={`jump-${ni}`} value={n.id}>
                              {ni + 1}번 · {previewText(n.text) || '(빈 대사)'}
                            </option>
                          ),
                        )}
                      </select>
                    ) : null}
                    {hasChoices ? (
                      <p className="lh-dialogue-editor__hint" style={{ marginTop: 6, marginBottom: 0 }}>
                        선택지가 있으면 위「다음에」대신, 각 선택지가 가리키는 대사가 우선합니다.
                      </p>
                    ) : null}
                  </section>

                  <section className="lh-dialogue-block">
                    <div className="lh-dialogue-block__label">4. 선택지</div>
                    <div className="lh-dialogue-mode">
                      <button
                        type="button"
                        className={`lh-dialogue-chip${choiceModeUi === 'none' ? ' is-active' : ''}`}
                        onClick={() => setChoiceMode(i, 'none')}
                      >
                        없음
                      </button>
                      <button
                        type="button"
                        className={`lh-dialogue-chip${choiceModeUi === 'dialogue' ? ' is-active' : ''}`}
                        onClick={() => setChoiceMode(i, 'dialogue')}
                      >
                        대사 선택지
                      </button>
                      <button
                        type="button"
                        className={`lh-dialogue-chip${choiceModeUi === 'action' ? ' is-active' : ''}`}
                        onClick={() => setChoiceMode(i, 'action')}
                      >
                        행동 선택지
                      </button>
                    </div>
                    {choiceModeUi !== 'none' ? (
                      <>
                        <p className="lh-dialogue-editor__hint" style={{ marginTop: 6 }}>
                          {choiceModeUi === 'action'
                            ? '행동 선택지: 화면 한가운데에 큰 박스로 뜹니다.'
                            : '대사 선택지: 대사창 옆에 작은 버튼으로 뜹니다.'}
                        </p>
                        {choices.map((ch, ci) => (
                          <div key={`${listIdPrefix}-ch-${i}-${ci}`} className="lh-dialogue-choice-row">
                            <input
                              className="form-input"
                              placeholder={
                                choiceModeUi === 'action' ? '행동 문구 (예: 고개를 끄덕인다)' : '선택지 문구'
                              }
                              value={ch.label}
                              onChange={(e) => updateChoice(i, ci, { label: e.target.value })}
                            />
                            <select
                              className="form-input"
                              value={ch.next || ''}
                              onChange={(e) => updateChoice(i, ci, { next: e.target.value })}
                            >
                              <option value="">→ 대화 종료</option>
                              {nodes.map((n, ni) => (
                                <option key={`ch-n-${ci}-${ni}`} value={n.id}>
                                  → {ni + 1}번 · {previewText(n.text, 22) || '(빈 대사)'}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="btn-del lh-dialogue-choice-row__del"
                              onClick={() => removeChoice(i, ci)}
                              aria-label="선택지 삭제"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button type="button" className="lh-dialogue-editor__tool" onClick={() => addChoice(i)}>
                          + 선택지 추가
                        </button>
                      </>
                    ) : null}
                  </section>

                  <details className="lh-dialogue-extras">
                    <summary>연출 · 표정 · 음성 (선택)</summary>
                    <div className="lh-dialogue-extras__body">
                      <div className="lh-dialogue-node__grid">
                        <div className="form-group">
                          <label className="form-label">몸 움직임</label>
                          <select
                            className="form-input"
                            value={normalizeMotion(node.motion) || ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              updateNode(i, {
                                motion: isDialogueMotion(v) ? v : '',
                              });
                            }}
                          >
                            <option value="">없음</option>
                            {DIALOGUE_MOTION_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">머리 위 효과</label>
                          <select
                            className="form-input"
                            value={node.fx || ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              updateNode(i, {
                                fx: isDialogueFx(v) ? v : '',
                              });
                            }}
                          >
                            <option value="">없음</option>
                            {DIALOGUE_FX_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">표정 이미지</label>
                          {node.expression ? (
                            <img src={node.expression} alt="" className="lh-dialogue-node__expr-preview" />
                          ) : null}
                          <input
                            className="form-input"
                            placeholder="URL (선택)"
                            value={node.expression || ''}
                            onChange={(e) => updateNode(i, { expression: e.target.value })}
                          />
                          {onUploadExpression ? (
                            <label className="file-input-label lh-dialogue-node__file">
                              {uploadBusy ? '업로드 중…' : '파일 선택'}
                              <input
                                type="file"
                                accept="image/*"
                                hidden
                                disabled={uploadBusy}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) void onUploadExpression(i, f);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          ) : null}
                        </div>
                        <div className="form-group">
                          <label className="form-label">대사 음성</label>
                          {node.voice ? (
                            <div className="lh-dialogue-node__voice-preview">
                              <audio controls src={node.voice} preload="metadata" />
                              <button
                                type="button"
                                className="btn-del"
                                style={{ padding: '3px 8px', marginTop: 6 }}
                                onClick={() => updateNode(i, { voice: '' })}
                              >
                                음성 제거
                              </button>
                            </div>
                          ) : null}
                          <input
                            className="form-input"
                            placeholder="음성 URL (선택)"
                            value={node.voice || ''}
                            onChange={(e) => updateNode(i, { voice: e.target.value })}
                          />
                          {onUploadVoice ? (
                            <label className="file-input-label lh-dialogue-node__file">
                              {uploadBusy ? '업로드 중…' : '음성 파일 선택'}
                              <input
                                type="file"
                                accept="audio/*"
                                hidden
                                disabled={uploadBusy}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) void onUploadVoice(i, f);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </details>

                  <button type="button" className="btn-del lh-dialogue-node__delete" onClick={() => removeNode(i)}>
                    이 줄 삭제
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <button type="button" className="btn-save lh-dialogue-editor__add" onClick={addNode}>
        + 대사 줄 추가
      </button>

      {ghost && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="lh-dialogue-ghost"
              style={{
                left: ghost.x,
                top: Math.max(8, ghost.y),
                width: ghost.w,
                minHeight: ghost.h,
              }}
              aria-hidden
            >
              <span className="lh-dialogue-ghost__grip">⋮⋮</span>
              <em>{ghost.speaker}</em>
              <span>{ghost.text}</span>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
