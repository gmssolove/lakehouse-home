import type { DialogueNode, PairItem } from '@/lib/types/character';

export type PairVnSide = 'A' | 'B';

export type PairSideDialogue = {
  nodes: DialogueNode[];
  start?: string;
};

export type PairDialogueBySide = {
  A: PairSideDialogue;
  B: PairSideDialogue;
};

function fromLegacyLines(pair: PairItem): DialogueNode[] {
  if (!pair.dialogues?.length) return [];
  return pair.dialogues.map((l) => ({
    id: l.id,
    speaker: l.speaker,
    text: l.text,
    choices: [],
  }));
}

function filterPlayable(nodes: DialogueNode[] | undefined): DialogueNode[] {
  return (nodes || []).filter(
    (n) => n.text?.trim() || n.choices?.some((c) => c.label?.trim()),
  );
}

function filterSavable(nodes: DialogueNode[] | undefined): DialogueNode[] {
  return filterPlayable(nodes).map((n) => ({
    ...n,
    text: n.text ?? '',
    choices: (n.choices || []).filter((c) => c.label?.trim()),
  }));
}

/** 편집 폼용 — legacy `dialogue` 는 왼쪽(A)으로 이관 */
export function hydratePairDialogueBySide(pair: PairItem): PairDialogueBySide {
  const hasSide = Boolean(pair.dialogueBySide?.A?.nodes?.length || pair.dialogueBySide?.B?.nodes?.length);
  if (hasSide || pair.dialogueBySide) {
    return {
      A: {
        nodes: [...(pair.dialogueBySide?.A?.nodes ?? [])],
        start: pair.dialogueBySide?.A?.start,
      },
      B: {
        nodes: [...(pair.dialogueBySide?.B?.nodes ?? [])],
        start: pair.dialogueBySide?.B?.start,
      },
    };
  }

  const legacy =
    pair.dialogue?.length ? [...pair.dialogue] : fromLegacyLines(pair);

  return {
    A: { nodes: legacy, start: pair.dialogueStart },
    B: { nodes: [], start: undefined },
  };
}

export function buildPairSideDialogueList(pair: PairItem, side: PairVnSide): DialogueNode[] {
  const pack = pair.dialogueBySide?.[side];
  if (pack?.nodes?.length) return filterPlayable(pack.nodes);

  /* 통합 대사: 이 사이드가 비어 있으면 반대쪽 스크립트를 양쪽 클릭에서 공유 */
  const other = side === 'A' ? pair.dialogueBySide?.B : pair.dialogueBySide?.A;
  if (other?.nodes?.length) return filterPlayable(other.nodes);

  /* 사이드 분리 전 데이터: 양쪽 클릭 모두 기존 단일 대사 */
  if (pair.dialogue?.length) return filterPlayable(pair.dialogue);
  return filterPlayable(fromLegacyLines(pair));
}

export function pairSideDialogueStart(pair: PairItem, side: PairVnSide): string | undefined {
  const pack = pair.dialogueBySide?.[side];
  if (pack?.nodes?.length) return pack.start;
  /* 통합 대사: 비어 있으면 반대쪽 시작 지점 공유 */
  const other = side === 'A' ? pair.dialogueBySide?.B : pair.dialogueBySide?.A;
  if (other?.nodes?.length) return other.start;
  if (pair.dialogueBySide) return pack?.start;
  return pair.dialogueStart;
}

export function pairSideHasDialogue(pair: PairItem, side: PairVnSide): boolean {
  return buildPairSideDialogueList(pair, side).length > 0;
}

export function pairHasDialogue(pair: PairItem): boolean {
  return pairSideHasDialogue(pair, 'A') || pairSideHasDialogue(pair, 'B');
}

/** 저장용 — legacy 필드 제거 + 사이드별 정리 */
export function serializePairDialogue(bySide: PairDialogueBySide): Pick<
  PairItem,
  'dialogueBySide' | 'dialogue' | 'dialogueStart' | 'dialogues'
> {
  const A = {
    nodes: filterSavable(bySide.A.nodes),
    ...(bySide.A.start?.trim() ? { start: bySide.A.start.trim() } : {}),
  };
  const B = {
    nodes: filterSavable(bySide.B.nodes),
    ...(bySide.B.start?.trim() ? { start: bySide.B.start.trim() } : {}),
  };

  return {
    dialogueBySide: { A, B },
    dialogue: undefined,
    dialogueStart: undefined,
    dialogues: undefined,
  };
}
