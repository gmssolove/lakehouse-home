'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { DialogueNodesEditor } from '@/components/shared/DialogueNodesEditor';
import { LineVoiceVolumeControl } from '@/components/shared/LineVoiceVolumeControl';
import { GalleryCreditInput } from '@/components/ui/GalleryCreditInput';
import { IntroSectionImageField } from '@/components/pair/IntroSectionImageField';
import {
  isIntroPovArtUnified,
  patchIntroPovArt,
  patchIntroPovArtUnify,
  patchIntroPovText,
  resolveIntroPov,
  resolveIntroPovArt,
  type IntroViewpoint,
} from '@/lib/pair/introViewpoint';
import { EntrySplashFormFields } from '@/components/shared/EntrySplash';
import { DustFxFields } from '@/components/shared/DustFxFields';
import { LakeEditTabs } from '@/components/ui/LakeEditTabs';
import { LakeToggle } from '@/components/ui/LakeToggle';
import { SecretPostFields } from '@/components/ui/SecretPostFields';
import { useSaveToast } from '@/components/ui/SaveToast';
import { AudioFileField } from '@/components/ui/AudioFileField';
import {
  AccordionSection,
  FieldLabel,
  ImageUploadCrop,
  RepeatableList,
  SliderField,
  TextAreaField,
} from '@/components/ui/form';
import { usePortalListReorder } from '@/components/ui/form/usePortalListReorder';
import {
  hydratePairDialogueBySide,
  serializePairDialogue,
  type PairDialogueBySide,
  type PairVnSide,
} from '@/lib/pair/dialogue';
import { PAIR_CARD_ASPECT } from '@/lib/oc/pairDefaults';
import { pairCover } from '@/lib/oc/pairCover';
import { CREEPY_FX_KINDS, DEFAULT_VIGNETTE_COLOR } from '@/lib/oc/creepyFx';
import { uploadImageFile, uploadMediaFile } from '@/lib/r2/client';
import { DEFAULT_IMAGE_FRAME, type ImageFrame } from '@/lib/shared/imageFrame';
import type {
  CreepyFxKind,
  OcCharacter,
  PairChemistry,
  PairFloatingQuote,
  PairGalleryItem,
  PairIntro,
  PairInterviewQA,
  PairItem,
  PairQuoteSlot,
  PairTimelineEvent,
} from '@/lib/types/character';
import { pairGalleryUrls } from '@/lib/types/character';
import { newId } from '@/lib/types/site-content';
import { finalizeCommaList, splitCommaListLive } from '@/lib/ui/commaList';
import {
  emptyPairFloatingQuote,
  hydratePairFloatingQuotes,
  normalizePairFloatingQuotes,
  PAIR_QUOTE_SLOTS,
} from '@/lib/oc/floatingQuotes';
import { StoryEntriesEditor } from '@/components/shared/StoryEntriesEditor';
import { StoryRichTextarea } from '@/components/shared/StoryRichTextarea';
import { RiskStagesEditor } from '@/components/shared/RiskStagesEditor';
import { hydratePairStories, pinPairStoriesForSave } from '@/lib/oc/storyEntries';
import { finalizeRiskStages, resolveRiskStages } from '@/lib/oc/riskStages';

type PairEditTab =
  | 'basic'
  | 'profile'
  | 'color'
  | 'background'
  | 'theme'
  | 'loading'
  | 'fx'
  | 'intro'
  | 'story'
  | 'gallery'
  | 'dialogue';

const PAIR_EDIT_TABS: { id: PairEditTab; label: string }[] = [
  { id: 'basic', label: '기본' },
  { id: 'profile', label: '프로필' },
  { id: 'color', label: '컬러' },
  { id: 'background', label: '배경' },
  { id: 'theme', label: '테마곡' },
  { id: 'loading', label: '로딩' },
  { id: 'fx', label: '연출' },
  { id: 'intro', label: '소개' },
  { id: 'story', label: '스토리' },
  { id: 'gallery', label: '갤러리' },
  { id: 'dialogue', label: 'VN' },
];

type Props = {
  pair: PairItem;
  characters?: OcCharacter[];
  onSave: (p: PairItem) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  order?: { canUp: boolean; canDown: boolean; position: number; total: number };
  onMove?: (direction: -1 | 1) => void;
  /** 스토리 탭에서 특정 포스트로 포커스 */
  initialStoryFocusId?: string | null;
};

function formatDdayPreview(iso?: string) {
  if (!iso?.trim()) return { main: 'D+??', since: '날짜 미설정' };
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return { main: 'D+??', since: '날짜 미설정' };
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return { main: `D${diff >= 0 ? '+' : ''}${diff}`, since: `Since ${iso}` };
}

/** undefined/null만 기본 3종 — []는 의도적 빈 목록 */
function defaultChemistry(pair: PairItem): PairChemistry[] {
  if (pair.chemistry != null) return pair.chemistry;
  return [
    { label: '긴장감', value: 50 },
    { label: '신뢰도', value: 50 },
    { label: '친밀도', value: 50 },
  ];
}

export function PairEditForm({
  pair,
  characters = [],
  onSave,
  onDelete,
  order,
  onMove,
  initialStoryFocusId = null,
}: Props) {
  const { showSaveToast } = useSaveToast();
  const [form, setForm] = useState(() => {
    const hydrated = hydratePairStories(pair);
    return {
      ...hydrated,
      dialogueBySide: hydratePairDialogueBySide(hydrated),
      floatingQuotes: hydratePairFloatingQuotes(hydrated),
      riskStages: resolveRiskStages(hydrated),
    };
  });
  const [tab, setTab] = useState<PairEditTab>('basic');
  const [dlgSide, setDlgSide] = useState<PairVnSide>('A');
  const [introPov, setIntroPov] = useState<IntroViewpoint>('A');
  // #1 VN 대사 통합/분리 — 기존 B 대사가 있으면 분리 모드로 시작
  const [dlgSplit, setDlgSplit] = useState<boolean>(
    () => (hydratePairDialogueBySide(pair).B.nodes.length ?? 0) > 0,
  );
  const [uploading, setUploading] = useState(false);
  const [galleryDraft, setGalleryDraft] = useState('');
  const [storyEditTab, setStoryEditTab] = useState<'log' | 'timeline'>('log');
  const [tlDragIndex, setTlDragIndex] = useState<number | null>(null);
  const [galOpenId, setGalOpenId] = useState<string | null>(null);
  const [handNoteDraft, setHandNoteDraft] = useState<[string, string]>(['', '']);
  const [storyFocusId, setStoryFocusId] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState({
    chem: true,
    define: true,
    firstnow: true,
    interview: true,
  });
  const toggleIntro = (key: keyof typeof introOpen) =>
    setIntroOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    const hydrated = hydratePairStories(pair);
    setForm({
      ...hydrated,
      dialogueBySide: hydratePairDialogueBySide(hydrated),
      floatingQuotes: hydratePairFloatingQuotes(hydrated),
      riskStages: resolveRiskStages(hydrated),
    });
    setDlgSide('A');
    setIntroPov('A');
    setDlgSplit((hydratePairDialogueBySide(hydrated).B.nodes.length ?? 0) > 0);
    // 편집 중 RTDB 스냅샷으로 입력이 덮이지 않도록 id 변경 시에만 리셋
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair.id]);

  useEffect(() => {
    let focus = initialStoryFocusId;
    if (!focus) {
      try {
        focus = sessionStorage.getItem('lh_pair_story_focus');
        if (focus) sessionStorage.removeItem('lh_pair_story_focus');
      } catch {
        focus = null;
      }
    }
    let openStory = false;
    try {
      openStory = sessionStorage.getItem('lh_pair_open_story_tab') === '1';
      if (openStory) sessionStorage.removeItem('lh_pair_open_story_tab');
    } catch {
      openStory = false;
    }
    if (focus || openStory) {
      setStoryFocusId(focus);
      setTab('story');
      setStoryEditTab('log');
      return;
    }
    setStoryFocusId(null);
  }, [pair.id, initialStoryFocusId]);

  const dialogueBySide: PairDialogueBySide = form.dialogueBySide ?? {
    A: { nodes: [] },
    B: { nodes: [] },
  };
  const activePack = dialogueBySide[dlgSide];

  const ddayPreview = useMemo(() => formatDdayPreview(form.dday), [form.dday]);
  const chemistry = defaultChemistry(form);

  const cover = pairCover(form);
  const nameA = form.chars[0] || 'A';
  const nameB = form.chars[1] || 'B';
  const introPovFields = resolveIntroPov(form.intro, introPov);
  const introPovArt = resolveIntroPovArt(form.intro, introPov);
  const introPovArtUnified = isIntroPovArtUnified(form.intro);

  function patchTimeline(next: PairTimelineEvent[]) {
    setForm((prev) => ({
      ...prev,
      timeline: next.map((t, i) => ({ ...t, order: i })),
    }));
  }

  function addTimelineEvent() {
    patchTimeline([...(form.timeline ?? []), { id: newId(), date: '', title: '', body: '' }]);
  }

  function patchIntro(patch: Partial<PairIntro>) {
    setForm((prev) => ({ ...prev, intro: { ...(prev.intro ?? {}), ...patch } }));
  }
  function addInterview() {
    patchIntro({
      interview: [
        ...(form.intro?.interview ?? []),
        { id: newId(), question: '', answerA: '', answerB: '' },
      ],
    });
  }
  function patchInterview(id: string, patch: Partial<PairInterviewQA>) {
    patchIntro({
      interview: (form.intro?.interview ?? []).map((q) => (q.id === id ? { ...q, ...patch } : q)),
    });
  }
  function removeInterview(id: string) {
    patchIntro({ interview: (form.intro?.interview ?? []).filter((q) => q.id !== id) });
  }

  function patchTimelineEvent(id: string, patch: Partial<PairTimelineEvent>) {
    patchTimeline((form.timeline ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function removeTimelineEvent(id: string) {
    patchTimeline((form.timeline ?? []).filter((t) => t.id !== id));
  }

  function moveTimelineEvent(from: number, to: number) {
    const list = [...(form.timeline ?? [])];
    if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    patchTimeline(list);
  }

  function setCharImgSlot(
    field: 'charBodyImgs' | 'charColors',
    slot: 0 | 1,
    value: string,
  ) {
    if (field === 'charBodyImgs') {
      setForm((prev) => {
        const nextImgs = [...(prev.charBodyImgs ?? ['', ''])] as [string, string];
        const prevUrl = nextImgs[slot] || '';
        nextImgs[slot] = value;
        if (prevUrl.trim() === value.trim()) {
          return { ...prev, charBodyImgs: nextImgs };
        }
        /* URL이 바뀌면 예전 크롭·위치가 새 이미지에 남지 않게 초기화 */
        const nextFrames: [ImageFrame, ImageFrame] = [
          { ...(prev.charBodyImgFrames?.[0] ?? {}) },
          { ...(prev.charBodyImgFrames?.[1] ?? {}) },
        ];
        const nextLayouts: [ImageFrame, ImageFrame] = [
          { ...(prev.charBodyLayout?.[0] ?? {}) },
          { ...(prev.charBodyLayout?.[1] ?? {}) },
        ];
        nextFrames[slot] = { ...DEFAULT_IMAGE_FRAME, bottomBlur: 22 };
        nextLayouts[slot] = { ...DEFAULT_IMAGE_FRAME };
        return {
          ...prev,
          charBodyImgs: nextImgs,
          charBodyImgFrames: nextFrames,
          charBodyLayout: nextLayouts,
        };
      });
      return;
    }
    const next = [...(form[field] ?? ['', ''])] as [string, string];
    next[slot] = value;
    setForm({ ...form, [field]: next });
  }

  function setCharFrameSlot(
    field: 'charBodyImgFrames',
    slot: 0 | 1,
    value: ImageFrame,
  ) {
    setForm((prev) => {
      const next: [ImageFrame, ImageFrame] = [
        { ...(prev[field]?.[0] ?? {}) },
        { ...(prev[field]?.[1] ?? {}) },
      ];
      next[slot] = value;
      return { ...prev, [field]: next };
    });
  }

  function updateChem(index: number, patch: Partial<PairChemistry>) {
    const next = [...chemistry];
    next[index] = { ...next[index], ...patch };
    setForm((prev) => ({ ...prev, chemistry: next }));
  }

  function addChem() {
    setForm((prev) => ({
      ...prev,
      chemistry: [...defaultChemistry(prev), { label: '축', value: 50 }],
    }));
  }

  function resetChemRadar() {
    setForm((prev) => ({
      ...prev,
      chemistry: [
        { label: '긴장', value: 50, hint: '서로에게 느끼는 긴장·설렘·날카로움의 정도' },
        { label: '신뢰', value: 50, hint: '상대를 믿고 등을 맡길 수 있는 정도' },
        { label: '친밀', value: 50, hint: '거리감 없이 가까운 정도' },
        { label: '갈등', value: 50, hint: '부딪히고 상처 입히는 마찰의 세기' },
        { label: '케미', value: 50, hint: '함께일 때 반응이 잘 맞는 정도' },
        { label: '의존', value: 50, hint: '상대 없이 버티기 어려운 정도' },
      ],
    }));
  }

  function removeChem(index: number) {
    setForm((prev) => ({
      ...prev,
      chemistry: defaultChemistry(prev).filter((_, i) => i !== index),
    }));
  }

  function pickCharacter(name: string, slot: 0 | 1) {
    const nextChars = [...form.chars] as [string, string];
    nextChars[slot] = name;
    const char = characters.find((c) => c.name === name);
    const nextImgs = [...(form.charImgs ?? ['', ''])] as [string, string];
    const nextSubs = [...(form.charSubs ?? ['', ''])] as [string, string];
    if (char) {
      nextImgs[slot] = char.img || '';
      nextSubs[slot] = char.nameSub || '';
    }
    setForm({ ...form, chars: nextChars, charImgs: nextImgs, charSubs: nextSubs });
  }

  function updateCharNote(slot: 0 | 1, patch: Partial<NonNullable<PairItem['charNotes']>[0]>) {
    const notes: [NonNullable<PairItem['charNotes']>[0], NonNullable<PairItem['charNotes']>[0]] = [
      { ...(form.charNotes?.[0] ?? {}) },
      { ...(form.charNotes?.[1] ?? {}) },
    ];
    notes[slot] = { ...notes[slot], ...patch };
    setForm({ ...form, charNotes: notes });
  }

  function updateGalleryItem(id: string, patch: Partial<PairGalleryItem>) {
    setForm((prev) => ({
      ...prev,
      gallery: (prev.gallery ?? []).map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
  }

  function removeGalleryItem(id: string) {
    setForm((prev) => ({ ...prev, gallery: (prev.gallery ?? []).filter((g) => g.id !== id) }));
  }

  function setGalleryUrls(id: string, urls: string[]) {
    const cleaned = urls.map((u) => u.trim()).filter(Boolean);
    updateGalleryItem(id, {
      src: cleaned[0] || '',
      images: cleaned,
    });
  }

  const galleryItems = form.gallery ?? [];
  const onGalleryReorder = useCallback((next: PairGalleryItem[]) => {
    setForm((prev) => ({ ...prev, gallery: next }));
  }, []);
  const galSort = usePortalListReorder({
    items: galleryItems,
    onReorder: onGalleryReorder,
    labelOf: (g, i) => g.title?.trim() || `항목 ${i + 1}`,
    thumbOf: (g) => pairGalleryUrls(g)[0],
  });

  async function uploadExpressionImage(i: number, file: File) {
    setUploading(true);
    try {
      const url = await uploadImageFile(file, 'pair/vn-expr');
      setForm((prev) => {
        const bySide = hydratePairDialogueBySide(prev);
        const pack = bySide[dlgSide];
        const rows = [...(pack.nodes || [])];
        if (!rows[i]) return prev;
        rows[i] = { ...rows[i], expression: url };
        return {
          ...prev,
          dialogueBySide: {
            ...bySide,
            [dlgSide]: { ...pack, nodes: rows },
          },
        };
      });
    } finally {
      setUploading(false);
    }
  }

  async function uploadDialogueVoice(i: number, file: File) {
    setUploading(true);
    try {
      const url = await uploadMediaFile(file, 'pair/vn-voice');
      setForm((prev) => {
        const bySide = hydratePairDialogueBySide(prev);
        const pack = bySide[dlgSide];
        const rows = [...(pack.nodes || [])];
        if (!rows[i]) return prev;
        rows[i] = { ...rows[i], voice: url };
        return {
          ...prev,
          dialogueBySide: {
            ...bySide,
            [dlgSide]: { ...pack, nodes: rows },
          },
        };
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '대사 음성 업로드에 실패했습니다.';
      alert(msg);
    } finally {
      setUploading(false);
    }
  }

  function patchActiveDialogue(patch: Partial<{ nodes: typeof activePack.nodes; start?: string }>) {
    setForm((prev) => {
      const bySide = prev.dialogueBySide ?? hydratePairDialogueBySide(prev);
      return {
        ...prev,
        dialogueBySide: {
          ...bySide,
          [dlgSide]: { ...bySide[dlgSide], ...patch },
        },
      };
    });
  }

  async function handleSave() {
    const bySideRaw = form.dialogueBySide ?? hydratePairDialogueBySide(form);
    // #1 통합 모드면 B를 비워 A 스크립트를 양쪽이 공유하게 저장
    const bySide = dlgSplit ? bySideRaw : { A: bySideRaw.A, B: { nodes: [] } };
    const dlg = serializePairDialogue(bySide);
    const {
      dialogues: _legacyDialogues,
      dialogue: _legacyDialogue,
      dialogueStart: _legacyStart,
      ...rest
    } = form;
    const riskFinal = finalizeRiskStages(form.riskStages);
    const pinned = pinPairStoriesForSave({
      ...rest,
      ...dlg,
      ...riskFinal,
      keywords: finalizeCommaList(form.keywords),
      flatLoreKeywords: finalizeCommaList(form.flatLoreKeywords),
      floatingQuotes: normalizePairFloatingQuotes(form.floatingQuotes),
      floatingQuotesBySide: undefined,
    });
    if (!riskFinal.riskStages) delete pinned.riskStages;
    if (!riskFinal.riskLevel) delete pinned.riskLevel;
    await onSave(pinned);
    showSaveToast();
  }

  return (
    <div className="lake-edit-shell pair-edit-form">
      <div className="pair-edit-toolbar lake-edit-shell__sticky-bar">
        <div className="pair-edit-toolbar__meta">
          <span className="pair-edit-toolbar__title">Pair Edit</span>
          {(form.pairTitle || form.chars.join(' × ')) && (
            <span className="pair-edit-toolbar__sub">
              {form.pairTitle?.trim() || `${form.chars[0]} × ${form.chars[1]}`}
            </span>
          )}
        </div>
        <div className="pair-edit-toolbar__actions">
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

      {order && onMove && order.total > 1 && (
        <div className="pair-order-controls">
          <span className="pair-order-controls__label">
            목록 순서 {order.position} / {order.total}
          </span>
          <div className="pair-order-controls__btns">
            <button type="button" className="pair-order-btn" disabled={!order.canUp} onClick={() => onMove(-1)}>
              ↑ 앞으로
            </button>
            <button type="button" className="pair-order-btn" disabled={!order.canDown} onClick={() => onMove(1)}>
              ↓ 뒤로
            </button>
          </div>
        </div>
      )}

      <LakeEditTabs tabs={PAIR_EDIT_TABS} active={tab} onChange={(id) => setTab(id as PairEditTab)} />

      <div className="lake-edit-shell__body">
        {tab === 'basic' ? (
          <>
            <div className="pair-edit-basic">
              <div className="pair-edit-basic__cover">
                <div className="lake-edit-section-title">카드 이미지</div>
                <p className="pair-edit-hint">
                  OC 카드와 같은 비율입니다. 드래그·휠로 맞춘 뒤 저장하면 목록에 반영됩니다.
                </p>
                <ImageUploadCrop
                  value={form.img || ''}
                  folder="pair/cover"
                  frame={form.imgFrame}
                  frameSrc={cover.src}
                  onFrameChange={(imgFrame) => setForm({ ...form, imgFrame })}
                  onChange={(url) => setForm({ ...form, img: url })}
                  aspectRatio={PAIR_CARD_ASPECT}
                  fit={cover.fit || 'cover'}
                  pos={cover.pos || 'center top'}
                  allowWheelZoom
                  frameClassName="pair-thumb-editor"
                  uploading={uploading}
                  onUploadStart={() => setUploading(true)}
                  onUploadEnd={() => setUploading(false)}
                />
              </div>

              <div className="pair-edit-basic__fields">
                <AccordionSection title="페어 정보" defaultOpen>
                  <div className="form-group">
                    <label className="form-label">페어명 (한글)</label>
                    <input
                      className="form-input"
                      value={form.pairTitle || ''}
                      onChange={(e) => setForm({ ...form, pairTitle: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">페어명 (영문)</label>
                    <input
                      className="form-input"
                      value={form.pairSub || ''}
                      onChange={(e) => setForm({ ...form, pairSub: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">관계 유형</label>
                    <input
                      className="form-input"
                      placeholder="친구 / 가족 / 연인 / 라이벌…"
                      value={form.relation || ''}
                      onChange={(e) => setForm({ ...form, relation: e.target.value })}
                    />
                  </div>
                  <TextAreaField
                    label="캐치프레이즈"
                    rows={2}
                    placeholder="중앙에 뜨는 캐치프레이즈 (엔터로 줄바꿈)"
                    value={form.catchphrase || ''}
                    onChange={(v) => setForm({ ...form, catchphrase: v })}
                  />
                  <TextAreaField
                    label="태그"
                    rows={2}
                    placeholder="#태그1, #태그2 (쉼표 또는 엔터로 구분)"
                    value={(form.keywords || []).join('\n')}
                    onChange={(v) =>
                      setForm({
                        ...form,
                        keywords: splitCommaListLive(v),
                      })
                    }
                  />
                  <div className="form-group">
                    <label className="form-label">포인트 컬러</label>
                    <input
                      type="color"
                      className="lh-color-picker"
                      value={form.color?.trim() || '#d7a982'}
                      onChange={(e) => setForm({ ...form, color: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">케미 레이더 색</label>
                    <div className="lh-color-personal-row" style={{ gap: 10, alignItems: 'center' }}>
                      <input
                        type="color"
                        className="lh-color-picker"
                        value={form.radarColor?.trim() || form.color?.trim() || '#d7a982'}
                        onChange={(e) => setForm({ ...form, radarColor: e.target.value })}
                      />
                      {form.radarColor?.trim() ? (
                        <button
                          type="button"
                          className="lake-edit-mini-del"
                          onClick={() => setForm({ ...form, radarColor: undefined })}
                        >
                          포인트와 동일
                        </button>
                      ) : (
                        <span className="pair-edit-hint" style={{ margin: 0 }}>
                          비우면 포인트 컬러
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">타임라인 레일 색</label>
                    <div className="lh-color-personal-row" style={{ gap: 10, alignItems: 'center' }}>
                      <input
                        type="color"
                        className="lh-color-picker"
                        value={form.timelineRailColor?.trim() || form.color?.trim() || '#d7a982'}
                        onChange={(e) => setForm({ ...form, timelineRailColor: e.target.value })}
                      />
                      {form.timelineRailColor?.trim() ? (
                        <button
                          type="button"
                          className="lake-edit-mini-del"
                          onClick={() => setForm({ ...form, timelineRailColor: undefined })}
                        >
                          포인트와 동일
                        </button>
                      ) : (
                        <span className="pair-edit-hint" style={{ margin: 0 }}>
                          비우면 포인트 컬러
                        </span>
                      )}
                    </div>
                  </div>
                </AccordionSection>

                <AccordionSection title="D-Day" defaultOpen>
                  <div className="pair-dday-edit">
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">기준 날짜</label>
                      <input
                        className="form-input"
                        type="date"
                        value={form.dday || ''}
                        onChange={(e) => setForm({ ...form, dday: e.target.value })}
                      />
                    </div>
                    <div className="pair-dday-preview">{ddayPreview.main}</div>
                    <div className="pair-dday-since">{ddayPreview.since}</div>
                  </div>
                </AccordionSection>

                <AccordionSection title="비밀글" defaultOpen>
                  <SecretPostFields
                    value={form}
                    onChange={(patch) => setForm({ ...form, ...patch })}
                  />
                </AccordionSection>

                <AccordionSection title="호칭" defaultOpen>
                  <div className="lake-edit-row2">
                    <div className="form-group">
                      <label className="form-label">
                        {nameA} → {nameB}
                      </label>
                      <input
                        className="form-input"
                        placeholder="예: 너, ○○ 씨"
                        value={form.honorifics?.aToB || ''}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            honorifics: { ...form.honorifics, aToB: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">
                        {nameB} → {nameA}
                      </label>
                      <input
                        className="form-input"
                        placeholder="예: ○○ 군, 선배"
                        value={form.honorifics?.bToA || ''}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            honorifics: { ...form.honorifics, bToA: e.target.value },
                          })
                        }
                      />
                    </div>
                  </div>
                </AccordionSection>

                <AccordionSection title="위험도 설정" defaultOpen>
                  <p className="lh-color-hint" style={{ margin: '0 0 8px' }}>
                    1~7단계 프리셋에서 고른 뒤, 라벨·주의 문구·색을 수정할 수 있습니다.
                  </p>
                  <RiskStagesEditor
                    stages={form.riskStages ?? []}
                    onChange={(riskStages) => setForm((f) => ({ ...f, riskStages }))}
                  />
                </AccordionSection>
              </div>
            </div>
          </>
        ) : null}

        {tab === 'fx' ? (
          <>
            <div className="lake-edit-section-title">기괴 연출 (호러/괴이)</div>
            <p className="pair-edit-hint" style={{ marginTop: -4 }}>
              공포·괴이 컨셉용 화면 연출입니다. 기본 꺼짐.
            </p>
            <label className="lh-toggle-row">
              <input
                type="checkbox"
                checked={Boolean(form.creepyFx?.enabled)}
                onChange={(e) =>
                  setForm((f) => ({ ...f, creepyFx: { ...(f.creepyFx ?? {}), enabled: e.target.checked } }))
                }
              />
              <span className="lh-toggle-row__text">
                <strong>기괴 연출 사용</strong>
                <FieldLabel as="span">공포·괴이 컨셉용 화면 연출</FieldLabel>
              </span>
            </label>
            {form.creepyFx?.enabled ? (
              <div style={{ display: 'grid', gap: 12, marginBottom: 8 }}>
                <div className="lh-creepy-kind-grid">
                  {CREEPY_FX_KINDS.map((k) => {
                    const on = (form.creepyFx?.kinds ?? []).includes(k.id);
                    return (
                      <label key={k.id} className="lh-toggle-row">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setForm((f) => {
                              const prev = f.creepyFx?.kinds ?? [];
                              const next: CreepyFxKind[] = checked
                                ? [...prev, k.id]
                                : prev.filter((x) => x !== k.id);
                              return { ...f, creepyFx: { ...(f.creepyFx ?? {}), kinds: next } };
                            });
                          }}
                        />
                        <span className="lh-toggle-row__text">
                          <strong>{k.label}</strong>
                          <FieldLabel as="span">{k.desc}</FieldLabel>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <SliderField
                  label="강도"
                  min={1}
                  max={100}
                  step={1}
                  value={typeof form.creepyFx?.intensity === 'number' ? form.creepyFx.intensity : 40}
                  displayValue={`${typeof form.creepyFx?.intensity === 'number' ? form.creepyFx.intensity : 40}%`}
                  onChange={(n) =>
                    setForm((f) => ({ ...f, creepyFx: { ...(f.creepyFx ?? {}), intensity: n } }))
                  }
                  aria-label="기괴 연출 강도"
                />
                {(form.creepyFx?.kinds ?? []).includes('creepVignette') ? (
                  <>
                    <label className="form-label" style={{ marginTop: 6 }}>
                      어둠 잠식 색상
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="color"
                        className="lh-color-swatch-input"
                        value={form.creepyFx?.vignetteColor || DEFAULT_VIGNETTE_COLOR}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            creepyFx: { ...(f.creepyFx ?? {}), vignetteColor: e.target.value },
                          }))
                        }
                        aria-label="어둠 잠식 색상"
                      />
                      <input
                        className="form-input"
                        style={{ maxWidth: 130 }}
                        placeholder={DEFAULT_VIGNETTE_COLOR}
                        value={form.creepyFx?.vignetteColor || ''}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            creepyFx: { ...(f.creepyFx ?? {}), vignetteColor: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
            <DustFxFields
              value={form.dustFx}
              onChange={(dustFx) => setForm((f) => ({ ...f, dustFx }))}
            />
          </>
        ) : null}

        {tab === 'background' ? (
          <>
            <div className="lake-edit-section-title">상세 배경 · 로고</div>
            <div className="form-group">
              <ImageUploadCrop
                label="상세 배경"
                value={form.bg || ''}
                folder="pair/bg"
                onChange={(url) => setForm({ ...form, bg: url })}
                showPreview
                uploading={uploading}
                onUploadStart={() => setUploading(true)}
                onUploadEnd={() => setUploading(false)}
              />
            </div>
            <div className="form-group">
              <ImageUploadCrop
                label="로고"
                value={form.logo || ''}
                folder="pair/logo"
                onChange={(url) => setForm({ ...form, logo: url })}
                showPreview
                uploading={uploading}
                onUploadStart={() => setUploading(true)}
                onUploadEnd={() => setUploading(false)}
              />
            </div>
            <div className="lake-edit-section-title" style={{ marginTop: 16 }}>배경 비네트</div>
            <p className="pair-edit-hint">OC 상세처럼 배경에 퍼스널 컬러가 스며듭니다.</p>
            <div className="form-group">
              <label className="form-label">비네트 색</label>
              <input
                type="color"
                className="lh-color-picker"
                value={form.bgVignetteColor?.trim() || form.color?.trim() || '#d7a982'}
                onChange={(e) => setForm({ ...form, bgVignetteColor: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="lh-toggle-row" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={!!form.bgVignetteSplit}
                  onChange={(e) => setForm({ ...form, bgVignetteSplit: e.target.checked || undefined })}
                />
                <span className="lh-toggle-row__text">
                  <strong>좌우 분리 틴트</strong>
                  <FieldLabel as="span">캐릭터 위치(A 왼쪽 · B 오른쪽)별로 다른 비네트 색을 넣습니다.</FieldLabel>
                </span>
              </label>
            </div>
            {form.bgVignetteSplit ? (
              <div className="form-group" style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">왼쪽(A) 색</label>
                  <input
                    type="color"
                    className="lh-color-picker"
                    value={
                      form.bgVignetteColorA?.trim() ||
                      form.charColors?.[0]?.trim() ||
                      form.bgVignetteColor?.trim() ||
                      form.color?.trim() ||
                      '#d7a982'
                    }
                    onChange={(e) => setForm({ ...form, bgVignetteColorA: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">오른쪽(B) 색</label>
                  <input
                    type="color"
                    className="lh-color-picker"
                    value={
                      form.bgVignetteColorB?.trim() ||
                      form.charColors?.[1]?.trim() ||
                      form.bgVignetteColor?.trim() ||
                      form.color?.trim() ||
                      '#d7a982'
                    }
                    onChange={(e) => setForm({ ...form, bgVignetteColorB: e.target.value })}
                  />
                </div>
              </div>
            ) : null}
            <div className="form-group">
              <SliderField
                label="비네트 세기"
                min={0}
                max={100}
                step={1}
                value={typeof form.bgVignette === 'number' ? form.bgVignette : 16}
                displayValue={`${typeof form.bgVignette === 'number' ? form.bgVignette : 16}%`}
                onChange={(n) => setForm({ ...form, bgVignette: n === 16 ? undefined : n })}
                aria-label="비네트 세기"
              />
            </div>
            <div className="form-group">
              <SliderField
                label="배경 딤"
                min={0}
                max={100}
                step={1}
                value={typeof form.bgDim === 'number' ? form.bgDim : 0}
                displayValue={`${typeof form.bgDim === 'number' ? form.bgDim : 0}%`}
                onChange={(n) => setForm({ ...form, bgDim: n === 0 ? undefined : n })}
                aria-label="배경 딤"
                hint="밝은 배경에서 글자 가독성을 위해 어둡게 덮습니다."
              />
            </div>
          </>
        ) : null}

        {tab === 'theme' ? (
          <>
            <div className="lake-edit-section-title">테마곡</div>
            <p className="pair-edit-hint">상세를 열면 이 곡이 재생됩니다. (페이지 BGM과 별개)</p>
            <div className="lake-edit-row2">
              <div className="form-group">
                <label className="form-label">테마곡명</label>
                <input
                  className="form-input"
                  value={form.theme?.title || ''}
                  onChange={(e) =>
                    setForm({ ...form, theme: { ...(form.theme || {}), title: e.target.value } })
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">아티스트</label>
                <input
                  className="form-input"
                  value={form.theme?.artist || ''}
                  onChange={(e) =>
                    setForm({ ...form, theme: { ...(form.theme || {}), artist: e.target.value } })
                  }
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">YouTube URL / ID</label>
              <input
                className="form-input"
                value={form.theme?.youtubeId || ''}
                onChange={(e) =>
                  setForm({ ...form, theme: { ...(form.theme || {}), youtubeId: e.target.value } })
                }
              />
            </div>
            <div className="form-group">
              <AudioFileField
                label="오디오 URL / MP3"
                value={form.theme?.fileData || ''}
                folder="pair/theme"
                uploading={uploading}
                onUploadStart={() => setUploading(true)}
                onUploadEnd={() => setUploading(false)}
                onChange={(url) =>
                  setForm({ ...form, theme: { ...(form.theme || {}), fileData: url } })
                }
              />
            </div>
          </>
        ) : null}

        {tab === 'loading' ? (
          <>
            <div className="lake-edit-section-title">상세 진입 로딩 화면 (TMI · TIP)</div>
            <EntrySplashFormFields
              key={pair.id}
              value={form.entrySplash}
              onChange={(entrySplash) => setForm((prev) => ({ ...prev, entrySplash }))}
            />
            <div className="lake-edit-section-title" style={{ marginTop: 16 }}>정보판 호버 TMI</div>
            <p className="pair-edit-hint">타이틀·관계·호칭에 마우스를 올리면 커서 옆에 작게 표시됩니다.</p>
            <div className="form-group">
              <label className="form-label">타이틀 TMI</label>
              <input
                className="form-input"
                placeholder="예: 둘만의 암호 같은 이름"
                value={form.infoTips?.title || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    infoTips: { ...form.infoTips, title: e.target.value },
                  })
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">관계 라벨 TMI</label>
              <input
                className="form-input"
                value={form.infoTips?.relation || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    infoTips: { ...form.infoTips, relation: e.target.value },
                  })
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">호칭 TMI</label>
              <input
                className="form-input"
                value={form.infoTips?.honorifics || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    infoTips: { ...form.infoTips, honorifics: e.target.value },
                  })
                }
              />
            </div>
          </>
        ) : null}

        {tab === 'profile' ? (
          <>
            <p className="pair-edit-hint">
              A·B 각 카드에서 내 OC를 선택하거나 이름을 직접 입력하세요. (선택 없이 커스텀도 가능)
            </p>
            <div className="pair-char-slots">
              {([0, 1] as const).map((slot) => (
                <div key={slot} className="pair-char-slot">
                  <div className="pair-char-slot__head">{slot === 0 ? 'A' : 'B'}</div>

                  <AccordionSection title="기본" defaultOpen>
                    {characters.length > 0 ? (
                      <div className="form-group">
                        <label className="form-label">캐릭터 선택</label>
                        <select
                          className="form-input"
                          value={
                            characters.find((c) => c.name === form.chars[slot])
                              ? form.chars[slot]
                              : ''
                          }
                          onChange={(e) => {
                            if (e.target.value) pickCharacter(e.target.value, slot);
                          }}
                        >
                          <option value="">직접 입력 / 미선택</option>
                          {characters.slice(0, 40).map((c) => (
                            <option key={c.id} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    <div className="form-group">
                      <label className="form-label">이름</label>
                      <input
                        className="form-input"
                        value={form.chars[slot]}
                        onChange={(e) => {
                          const next = [...form.chars] as [string, string];
                          next[slot] = e.target.value;
                          setForm({ ...form, chars: next });
                        }}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">영문 / 서브</label>
                      <input
                        className="form-input"
                        value={form.charSubs?.[slot] || ''}
                        onChange={(e) => {
                          const next = [...(form.charSubs ?? ['', ''])] as [string, string];
                          next[slot] = e.target.value;
                          setForm({ ...form, charSubs: next });
                        }}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">캐릭터 컬러</label>
                      <input
                        type="color"
                        className="lh-color-picker"
                        value={form.charColors?.[slot]?.trim() || form.color?.trim() || '#d7a982'}
                        onChange={(e) => setCharImgSlot('charColors', slot, e.target.value)}
                      />
                    </div>
                  </AccordionSection>

                  <AccordionSection title="전신·출처" defaultOpen>
                    <div className="form-group">
                      <label className="form-label">전신</label>
                      <ImageUploadCrop
                        value={form.charBodyImgs?.[slot] || ''}
                        folder="pair/char-body"
                        frame={form.charBodyImgFrames?.[slot]}
                        onFrameChange={(frame) => setCharFrameSlot('charBodyImgFrames', slot, frame)}
                        onChange={(url) => setCharImgSlot('charBodyImgs', slot, url)}
                        fit="contain"
                        pos="center top"
                        aspectRatio="3 / 5"
                        allowWheelZoom
                        frameClassName="pair-char-frame-editor pair-char-frame-editor--body"
                        hint="드래그·휠로 전신 노출을 맞춥니다. 하단이 잘리면 페이드를 올리세요."
                        uploading={uploading}
                        onUploadStart={() => setUploading(true)}
                        onUploadEnd={() => setUploading(false)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">전신 출처</label>
                      <GalleryCreditInput
                        value={form.charNotes?.[slot]?.bodyCredit || ''}
                        onChange={(bodyCredit) => updateCharNote(slot, { bodyCredit })}
                        placeholder="커미션 출처"
                      />
                    </div>
                  </AccordionSection>

                  <AccordionSection title="프로필·키워드" defaultOpen>
                    <div className="form-group">
                      <label className="form-label">프로필 링크</label>
                      <input
                        className="form-input"
                        placeholder="이미지 클릭 시 이동할 URL (대사 있으면 VN 우선)"
                        value={form.charNotes?.[slot]?.profileLink || ''}
                        onChange={(e) => updateCharNote(slot, { profileLink: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">OC 프로필 보기 (내 OC 연결)</label>
                      <select
                        className="form-input"
                        value={form.charNotes?.[slot]?.ocProfileId || ''}
                        onChange={(e) => updateCharNote(slot, { ocProfileId: e.target.value })}
                      >
                        <option value="">표시 안 함</option>
                        {(characters ?? []).map((c) => (
                          <option key={String(c.id)} value={String(c.id)}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <FieldLabel>지정하면 상세 화면에 「프로필 보기」 버튼이 뜨고 해당 OC 상세로 이동합니다.</FieldLabel>
                    </div>
                    <div className="form-group">
                      <label className="form-label">역할 / 포지션</label>
                      <input
                        className="form-input"
                        placeholder="주동 / 조력 / …"
                        value={form.charNotes?.[slot]?.role || ''}
                        onChange={(e) => updateCharNote(slot, { role: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">이름 위 한 줄 대사</label>
                      <input
                        className="form-input"
                        placeholder="이름 위에 뜨는 한 줄 (PV 대사 폰트·애니)"
                        value={form.charNotes?.[slot]?.quote || ''}
                        onChange={(e) => updateCharNote(slot, { quote: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">대표 이모티콘</label>
                      <input
                        className="form-input"
                        placeholder="예: 🐍"
                        value={form.charNotes?.[slot]?.emoji || ''}
                        onChange={(e) => updateCharNote(slot, { emoji: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">손글씨 쪽지</label>
                      <p className="pair-edit-hint" style={{ marginTop: 0 }}>
                        이미지(스캔·일러)를 올리면 상세 기본정보에 쪽지 아이콘이 생기고, 누르면 펼쳐 봅니다.
                      </p>
                      <div className="lh-gal-edit-imgs">
                        {(form.charNotes?.[slot]?.handwritingNotes || []).map((src, ni) => (
                          <div key={`${src}-${ni}`} className="lh-gal-edit-imgs__row">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt="" referrerPolicy="no-referrer" />
                            <button
                              type="button"
                              className="btn-del"
                              onClick={() => {
                                const next = (form.charNotes?.[slot]?.handwritingNotes || []).filter(
                                  (_, j) => j !== ni,
                                );
                                updateCharNote(slot, {
                                  handwritingNotes: next.length ? next : undefined,
                                });
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <ImageUploadCrop
                        label="쪽지 이미지 추가"
                        value={handNoteDraft[slot]}
                        folder="pair/hand-notes"
                        onChange={(v) =>
                          setHandNoteDraft((d) => {
                            const next: [string, string] = [...d];
                            next[slot] = v;
                            return next;
                          })
                        }
                        onUploaded={(url) => {
                          const prev = form.charNotes?.[slot]?.handwritingNotes || [];
                          updateCharNote(slot, { handwritingNotes: [...prev, url] });
                          setHandNoteDraft((d) => {
                            const next: [string, string] = [...d];
                            next[slot] = '';
                            return next;
                          });
                        }}
                        uploading={uploading}
                        onUploadStart={() => setUploading(true)}
                        onUploadEnd={() => setUploading(false)}
                        urlPlaceholder="또는 URL"
                      />
                      {handNoteDraft[slot]?.trim() ? (
                        <button
                          type="button"
                          className="lh-repeatable__add"
                          style={{ marginTop: 8 }}
                          onClick={() => {
                            const src = handNoteDraft[slot].trim();
                            if (!src) return;
                            const prev = form.charNotes?.[slot]?.handwritingNotes || [];
                            updateCharNote(slot, { handwritingNotes: [...prev, src] });
                            setHandNoteDraft((d) => {
                              const next: [string, string] = [...d];
                              next[slot] = '';
                              return next;
                            });
                          }}
                        >
                          + URL로 쪽지 추가
                        </button>
                      ) : null}
                      <div className="pair-note-sfx">
                        <div className="pair-note-sfx__head">
                          <span className="pair-note-sfx__title">펼침 효과음</span>
                          <span className="pair-note-sfx__hint">쪽지를 열 때 한 번 재생됩니다 · 비우면 무음</span>
                        </div>
                        <AudioFileField
                          label=""
                          value={form.charNotes?.[slot]?.handwritingNoteSfx || ''}
                          folder="pair/hand-notes-sfx"
                          uploading={uploading}
                          onUploadStart={() => setUploading(true)}
                          onUploadEnd={() => setUploading(false)}
                          onChange={(url) =>
                            updateCharNote(slot, {
                              handwritingNoteSfx: url.trim() ? url.trim() : undefined,
                            })
                          }
                        />
                      </div>
                      <div className="pair-note-sfx">
                        <div className="pair-note-sfx__head">
                          <span className="pair-note-sfx__title">닫힘 효과음</span>
                          <span className="pair-note-sfx__hint">쪽지를 닫을 때 한 번 재생됩니다 · 비우면 무음</span>
                        </div>
                        <AudioFileField
                          label=""
                          value={form.charNotes?.[slot]?.handwritingNoteCloseSfx || ''}
                          folder="pair/hand-notes-sfx"
                          uploading={uploading}
                          onUploadStart={() => setUploading(true)}
                          onUploadEnd={() => setUploading(false)}
                          onChange={(url) =>
                            updateCharNote(slot, {
                              handwritingNoteCloseSfx: url.trim() ? url.trim() : undefined,
                            })
                          }
                        />
                      </div>
                    </div>
                    <TextAreaField
                      label="키워드"
                      rows={2}
                      placeholder="#차분, #독설 (쉼표 또는 엔터로 구분)"
                      value={(form.charNotes?.[slot]?.keywords || []).join('\n')}
                      onChange={(v) =>
                        updateCharNote(slot, { keywords: splitCommaListLive(v) })
                      }
                    />
                    <TextAreaField
                      label="납작 캐해"
                      rows={3}
                      placeholder="이 캐릭터의 납작 캐해 (글)"
                      value={form.charNotes?.[slot]?.flatLore || ''}
                      onChange={(v) => updateCharNote(slot, { flatLore: v })}
                    />
                  </AccordionSection>

                  <AccordionSection title="추가 항목" defaultOpen>
                    <div className="form-group">
                      <label className="form-label">추가 프로필 항목</label>
                      <RepeatableList
                        addLabel="+ 항목 추가"
                        onAdd={() =>
                          updateCharNote(slot, {
                            fields: [...(form.charNotes?.[slot]?.fields || []), { k: '', v: '' }],
                          })
                        }
                      >
                        {(form.charNotes?.[slot]?.fields || []).map((f, fi) => (
                          <div key={fi} style={{ display: 'flex', gap: 6 }}>
                            <input
                              className="form-input"
                              style={{ flex: '0 0 34%' }}
                              placeholder="항목 (예: 나이)"
                              value={f.k}
                              onChange={(e) => {
                                const next = [...(form.charNotes?.[slot]?.fields || [])];
                                next[fi] = { ...next[fi], k: e.target.value };
                                updateCharNote(slot, { fields: next });
                              }}
                            />
                            <input
                              className="form-input"
                              style={{ flex: 1 }}
                              placeholder="내용"
                              value={f.v}
                              onChange={(e) => {
                                const next = [...(form.charNotes?.[slot]?.fields || [])];
                                next[fi] = { ...next[fi], v: e.target.value };
                                updateCharNote(slot, { fields: next });
                              }}
                            />
                            <button
                              type="button"
                              className="btn-del"
                              style={{ padding: '2px 8px' }}
                              onClick={() =>
                                updateCharNote(slot, {
                                  fields: (form.charNotes?.[slot]?.fields || []).filter(
                                    (_, x) => x !== fi,
                                  ),
                                })
                              }
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </RepeatableList>
                    </div>
                  </AccordionSection>
                </div>
              ))}
            </div>

            <AccordionSection title="납작캐해 (페어)" defaultOpen>
              <FieldLabel>
                왼쪽 메뉴 「납작캐해」에 표시됩니다. A/B 카드의 납작 캐해는 캐릭터 플레이트용입니다.
              </FieldLabel>
              <div className="form-group">
                <label className="form-label">본문</label>
                <StoryRichTextarea
                  rows={5}
                  value={form.flatLore || ''}
                  onChange={(v) => setForm((f) => ({ ...f, flatLore: v }))}
                  placeholder="페어 납작캐해 — 저장 후 상세 왼쪽 메뉴에 표시"
                />
              </div>
              <TextAreaField
                label="키워드"
                rows={2}
                placeholder="#키워드 (쉼표 또는 엔터로 구분)"
                value={(form.flatLoreKeywords || []).join('\n')}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    flatLoreKeywords: splitCommaListLive(v),
                  }))
                }
              />
            </AccordionSection>
          </>
        ) : null}

        {tab === 'color' ? (
          <>
            <p className="pair-edit-hint">
              소개 「인터뷰」이름에만 적용됩니다. OC 개별 프로필에는 영향 없습니다.
            </p>
            <div className="lake-edit-section-title">캐릭터 퍼스널 컬러</div>
            {([0, 1] as const).map((slot) => (
              <div className="form-group" key={`pc-${slot}`}>
                <label className="form-label">
                  {form.chars[slot]?.trim() || (slot === 0 ? '캐릭터 A' : '캐릭터 B')}
                </label>
                <input
                  type="color"
                  className="lh-color-picker"
                  value={form.charColors?.[slot]?.trim() || form.color?.trim() || '#d7a982'}
                  onChange={(e) => setCharImgSlot('charColors', slot, e.target.value)}
                />
              </div>
            ))}
            <div className="lake-edit-section-title">글로우 효과</div>
            <div className="form-group">
              <LakeToggle
                label="글로우 효과"
                checked={!!form.personalNameGlow}
                onChange={(personalNameGlow) => setForm({ ...form, personalNameGlow })}
              />
            </div>
            {form.personalNameGlow ? (
              <>
                <FieldLabel>
                  비우면(퍼스널과 동일) 텍스트 색과 같은 색으로 발광합니다. 어두운 퍼스널
                  컬러는 다크 배경에서 보이도록 그림자가 자동으로 밝아집니다.
                </FieldLabel>
                {([0, 1] as const).map((slot) => {
                  const personal =
                    form.charColors?.[slot]?.trim() || form.color?.trim() || '#d7a982';
                  const custom = form.personalNameGlowColors?.[slot]?.trim() || '';
                  return (
                    <div className="form-group" key={`glow-${slot}`}>
                      <label className="form-label">
                        글로우 색상 · {form.chars[slot]?.trim() || (slot === 0 ? 'A' : 'B')}
                      </label>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="color"
                          className="lh-color-picker"
                          value={custom || personal}
                          onChange={(e) => {
                            const next = [
                              ...(form.personalNameGlowColors ?? ['', '']),
                            ] as [string, string];
                            next[slot] = e.target.value;
                            setForm({ ...form, personalNameGlowColors: next });
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={!custom}
                          onClick={() => {
                            const next = [
                              ...(form.personalNameGlowColors ?? ['', '']),
                            ] as [string, string];
                            next[slot] = '';
                            setForm({ ...form, personalNameGlowColors: next });
                          }}
                        >
                          퍼스널과 동일
                        </button>
                        {!custom ? (
                          <span className="pair-edit-hint" style={{ margin: 0 }}>
                            현재: 퍼스널과 동일
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </>
            ) : null}
          </>
        ) : null}

        {tab === 'intro' ? (
          <div className="pair-intro-edit">
            <AccordionSection
              title="관계 정의"
              open={introOpen.define}
              onToggle={() => toggleIntro('define')}
            >
              <div className="form-group">
                <StoryRichTextarea
                  rows={3}
                  placeholder="이게 정확히 무슨 관계인지 — 드래그 후 색·굵기·폰트·크기 적용"
                  value={form.desc || ''}
                  onChange={(v) => setForm({ ...form, desc: v })}
                />
              </div>
              <IntroSectionImageField
                label="관계 정의 일러스트"
                src={form.intro?.defineImg}
                frame={form.intro?.defineImgFrame}
                aspectRatio={form.intro?.defineImgAspect}
                size={form.intro?.defineImgSize}
                onChange={({ src, frame, aspectRatio, size }) =>
                  patchIntro({
                    defineImg: src || undefined,
                    defineImgFrame: frame,
                    defineImgAspect: aspectRatio,
                    defineImgSize: size,
                  })
                }
              />
            </AccordionSection>

            <AccordionSection
              title="첫인상 · 현인상"
              open={introOpen.firstnow}
              onToggle={() => toggleIntro('firstnow')}
            >
              <div
                className="pair-menu pair-menu--story-sub pair-menu--intro-pov pair-intro-edit__pov"
                role="tablist"
                aria-label="시점"
              >
                <span className="pair-menu__slot">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={introPov === 'A'}
                    className={`pair-menu__item${introPov === 'A' ? ' is-active' : ''}`}
                    onClick={() => setIntroPov('A')}
                  >
                    <span className="pair-menu__glow" aria-hidden />
                    <span className="pair-menu__ko">{nameA} 시점</span>
                  </button>
                </span>
                <span className="pair-menu__sep" aria-hidden>
                  |
                </span>
                <span className="pair-menu__slot">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={introPov === 'B'}
                    className={`pair-menu__item${introPov === 'B' ? ' is-active' : ''}`}
                    onClick={() => setIntroPov('B')}
                  >
                    <span className="pair-menu__glow" aria-hidden />
                    <span className="pair-menu__ko">{nameB} 시점</span>
                  </button>
                </span>
              </div>
              <div className="pair-intro-edit__2col" key={`intro-pov-${introPov}`}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">첫인상</label>
                  <StoryRichTextarea
                    rows={3}
                    placeholder={`${introPov === 'A' ? nameA : nameB}의 시선으로 — 처음 만났을 때`}
                    value={introPovFields.first}
                    onChange={(v) => patchIntro(patchIntroPovText(introPov, 'first', v))}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">현인상</label>
                  <StoryRichTextarea
                    rows={3}
                    placeholder={`${introPov === 'A' ? nameA : nameB}의 시선으로 — 지금은`}
                    value={introPovFields.now}
                    onChange={(v) => patchIntro(patchIntroPovText(introPov, 'now', v))}
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 10 }}>
                <label className="lh-toggle-row" style={{ marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    checked={introPovArtUnified}
                    onChange={(e) =>
                      patchIntro(patchIntroPovArtUnify(form.intro, introPov, e.target.checked))
                    }
                  />
                  <span className="lh-toggle-row__text">
                    <strong>시점 일러스트 통일</strong>
                    <FieldLabel as="span">
                      A·B 시점에 같은 이미지·구도·확대 사용
                    </FieldLabel>
                  </span>
                </label>
                <IntroSectionImageField
                  label={
                    introPovArtUnified
                      ? '공통 시점 일러스트'
                      : `${introPov === 'A' ? nameA : nameB} 시점 일러스트`
                  }
                  src={introPovArt.src}
                  frame={introPovArt.frame}
                  aspectRatio={introPovArt.aspectRatio}
                  size={introPovArt.size}
                  onChange={({ src, frame, aspectRatio, size }) =>
                    patchIntro(
                      patchIntroPovArt(form.intro, introPov, {
                        src,
                        frame,
                        aspectRatio,
                        size,
                      }),
                    )
                  }
                />
                <p className="pair-edit-hint" style={{ marginTop: 6 }}>
                  본문은 시점마다 따로, 일러스트는 {introPovArtUnified ? 'A·B 공통 1장' : '시점마다 1장'}
                  입니다.
                </p>
              </div>
            </AccordionSection>

            <AccordionSection
              title={`인터뷰 (${(form.intro?.interview ?? []).length})`}
              open={introOpen.interview}
              onToggle={() => toggleIntro('interview')}
            >
              <IntroSectionImageField
                label="인터뷰 섹션 일러스트"
                src={form.intro?.interviewImg}
                frame={form.intro?.interviewImgFrame}
                aspectRatio={form.intro?.interviewImgAspect}
                size={form.intro?.interviewImgSize}
                onChange={({ src, frame, aspectRatio, size }) =>
                  patchIntro({
                    interviewImg: src || undefined,
                    interviewImgFrame: frame,
                    interviewImgAspect: aspectRatio,
                    interviewImgSize: size,
                  })
                }
              />
              <RepeatableList addLabel="+ 질문 추가" onAdd={addInterview}>
                {(form.intro?.interview ?? []).map((q, i) => (
                  <div key={q.id} className="pair-intro-edit__card">
                    <div className="pair-intro-edit__card-head">
                      <span className="pair-intro-edit__card-idx">Q{i + 1}</span>
                      <button
                        type="button"
                        className="lake-edit-mini-del"
                        onClick={() => removeInterview(q.id)}
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      className="form-input"
                      placeholder="질문 (예: 상대의 첫인상은?)"
                      value={q.question}
                      onChange={(e) => patchInterview(q.id, { question: e.target.value })}
                    />
                    <div className="pair-intro-edit__2col" style={{ marginTop: 8 }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">{nameA}</label>
                        <textarea
                          className="form-input"
                          rows={2}
                          value={q.answerA || ''}
                          onChange={(e) => patchInterview(q.id, { answerA: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">{nameB}</label>
                        <textarea
                          className="form-input"
                          rows={2}
                          value={q.answerB || ''}
                          onChange={(e) => patchInterview(q.id, { answerB: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </RepeatableList>
            </AccordionSection>

            <AccordionSection
              title={`케미 레이더 (${chemistry.length})`}
              open={introOpen.chem}
              onToggle={() => toggleIntro('chem')}
            >
              <p className="pair-edit-hint" style={{ marginTop: 0 }}>
                축 이름 + 수치(0~100) + 호버 TMI. 표시는 축 3개 이상일 때 레이더로 나옵니다.
                레이더 색은 기본정보 · 포인트 컬러 옆에서 바꿀 수 있습니다.
              </p>
              <div className="form-group">
                <label className="form-label">레이더 색</label>
                <div className="lh-color-personal-row" style={{ gap: 10, alignItems: 'center' }}>
                  <input
                    type="color"
                    className="lh-color-picker"
                    value={form.radarColor?.trim() || form.color?.trim() || '#d7a982'}
                    onChange={(e) => setForm({ ...form, radarColor: e.target.value })}
                  />
                  {form.radarColor?.trim() ? (
                    <button
                      type="button"
                      className="lake-edit-mini-del"
                      onClick={() => setForm({ ...form, radarColor: undefined })}
                    >
                      포인트와 동일
                    </button>
                  ) : (
                    <span className="pair-edit-hint" style={{ margin: 0 }}>
                      기본: 포인트 컬러
                    </span>
                  )}
                </div>
              </div>
              <RepeatableList addLabel="+ 축 추가" onAdd={addChem}>
                {chemistry.map((row, i) => (
                  <div key={`${row.label}-${i}`} className="pair-chem-edit-card">
                    <div className="pair-chem-edit-row pair-chem-edit-row--radar">
                      <input
                        className="form-input pair-chem-edit-lbl"
                        placeholder="축 (예: 긴장)"
                        value={row.label}
                        onChange={(e) => updateChem(i, { label: e.target.value })}
                      />
                      <input
                        className="form-input pair-chem-num"
                        type="number"
                        min={0}
                        max={100}
                        value={row.value}
                        onChange={(e) =>
                          updateChem(i, {
                            value: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                          })
                        }
                        aria-label={`${row.label || '케미'} 수치`}
                      />
                      <button type="button" className="lake-edit-mini-del" onClick={() => removeChem(i)}>
                        ✕
                      </button>
                    </div>
                    <input
                      className="form-input"
                      style={{ marginTop: 6 }}
                      placeholder="호버 TMI (축에 마우스 올리면 표시)"
                      value={row.hint || ''}
                      onChange={(e) => updateChem(i, { hint: e.target.value })}
                    />
                  </div>
                ))}
              </RepeatableList>
              <button
                type="button"
                className="btn-edit"
                style={{ marginTop: 8, padding: '5px 12px' }}
                onClick={resetChemRadar}
              >
                기본 6축 복원
              </button>
            </AccordionSection>
          </div>
        ) : null}

        {tab === 'story' ? (
          <>
            <div className="lake-edit-section-title">스토리</div>
            <div
              className="pair-subtabs pair-subtabs--edit pair-subtabs--seg"
              role="tablist"
              aria-label="스토리 편집"
            >
              <button
                type="button"
                role="tab"
                aria-selected={storyEditTab === 'log'}
                className={`pair-subtab${storyEditTab === 'log' ? ' is-active' : ''}`}
                onClick={() => setStoryEditTab('log')}
              >
                로그
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={storyEditTab === 'timeline'}
                className={`pair-subtab${storyEditTab === 'timeline' ? ' is-active' : ''}`}
                onClick={() => setStoryEditTab('timeline')}
              >
                타임라인
              </button>
            </div>

            {storyEditTab === 'log' ? (
              <>
                <p className="pair-edit-hint">
                  로그를 추가한 뒤 상세에서 본문·PDF 가져오기·분위기 등을 설정합니다. 구분선은 에디터 「─」
                  버튼으로 넣습니다.
                </p>
                <StoryEntriesEditor
                  entries={form.storyEntries || []}
                  categories={form.storyCategories}
                  categoryColors={form.storyCategoryColors}
                  focusEntryId={storyFocusId}
                  enableSeriesTools={true}
                  enablePdfImport={true}
                  enableCategories={true}
                  enableToolbarAdd={true}
                  onChange={(storyEntries, storyCategories, storyCategoryColors) =>
                    setForm((f) => ({ ...f, storyEntries, storyCategories, storyCategoryColors }))
                  }
                />
              </>
            ) : (
              <>
                <p className="pair-edit-hint">
                  날짜·제목·내용·이미지를 사건별로 정리합니다. 카드를 드래그해 순서를 바꿀 수 있어요.
                  이미지는 내용 아래에 표시됩니다.
                </p>
                <div className="form-group">
                  <label className="form-label">레일 색</label>
                  <div className="lh-color-personal-row" style={{ gap: 10, alignItems: 'center' }}>
                    <input
                      type="color"
                      className="lh-color-picker"
                      value={form.timelineRailColor?.trim() || form.color?.trim() || '#d7a982'}
                      onChange={(e) => setForm({ ...form, timelineRailColor: e.target.value })}
                    />
                    {form.timelineRailColor?.trim() ? (
                      <button
                        type="button"
                        className="lake-edit-mini-del"
                        onClick={() => setForm({ ...form, timelineRailColor: undefined })}
                      >
                        포인트와 동일
                      </button>
                    ) : (
                      <span className="pair-edit-hint" style={{ margin: 0 }}>
                        기본: 포인트 컬러
                      </span>
                    )}
                  </div>
                </div>
                <div className="pair-tl-editor">
                  {(form.timeline ?? []).map((ev, i) => (
                    <div
                      key={ev.id}
                      className={`pair-tl-card${tlDragIndex === i ? ' is-dragging' : ''}`}
                      draggable
                      onDragStart={() => setTlDragIndex(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (tlDragIndex !== null) moveTimelineEvent(tlDragIndex, i);
                        setTlDragIndex(null);
                      }}
                      onDragEnd={() => setTlDragIndex(null)}
                    >
                      <div className="pair-tl-card__head">
                        <span className="pair-tl-card__handle" aria-hidden title="드래그로 이동">
                          ⠿
                        </span>
                        <input
                          className="form-input"
                          style={{ width: 160 }}
                          value={ev.date ?? ''}
                          placeholder="날짜 (예: 2025.05.11)"
                          onChange={(e) => patchTimelineEvent(ev.id, { date: e.target.value })}
                          aria-label="날짜"
                        />
                        <input
                          className="form-input"
                          style={{ flex: 1, minWidth: 120 }}
                          value={ev.title ?? ''}
                          placeholder="제목"
                          onChange={(e) => patchTimelineEvent(ev.id, { title: e.target.value })}
                          aria-label="제목"
                        />
                        <button
                          type="button"
                          className="lake-edit-mini-del"
                          onClick={() => removeTimelineEvent(ev.id)}
                          aria-label="삭제"
                        >
                          ✕
                        </button>
                      </div>
                      <textarea
                        className="form-input"
                        rows={3}
                        value={ev.body ?? ''}
                        placeholder="내용"
                        style={{ resize: 'vertical', marginTop: 8 }}
                        onChange={(e) => patchTimelineEvent(ev.id, { body: e.target.value })}
                        aria-label="내용"
                      />
                      <div className="pair-tl-card__media">
                        <ImageUploadCrop
                          value={ev.image || ''}
                          folder="pair/timeline"
                          onChange={(url) => patchTimelineEvent(ev.id, { image: url })}
                          showPreview
                          showClear
                          uploading={uploading}
                          onUploadStart={() => setUploading(true)}
                          onUploadEnd={() => setUploading(false)}
                          urlPlaceholder="이미지 URL"
                        />
                      </div>
                    </div>
                  ))}
                  <button type="button" className="lh-repeatable__add" onClick={addTimelineEvent}>
                    + 사건 추가
                  </button>
                </div>
              </>
            )}
          </>
        ) : null}

        {tab === 'dialogue' ? (
          <>
            <AccordionSection title="대표 대사 (최대 2)" defaultOpen>
              <FieldLabel>
                캐릭터에 앵커된 인용 대사입니다. 최대 2줄. 누구·어느 높이(얼굴/가슴/허리)를 고르고,
                저장 후 상단 「대사」에서 크기만 조절하세요.
              </FieldLabel>
              <RepeatableList
                addLabel="+ 대표 대사 추가"
                addDisabled={(form.floatingQuotes?.length ?? 0) >= 2}
                onAdd={() => {
                  const n = form.floatingQuotes?.length ?? 0;
                  if (n >= 2) return;
                  const nextSide: PairFloatingQuote['side'] = n === 0 ? 'A' : 'B';
                  setForm((prev) => ({
                    ...prev,
                    floatingQuotes: [
                      ...(prev.floatingQuotes || []),
                      emptyPairFloatingQuote(nextSide),
                    ],
                  }));
                }}
              >
                {(form.floatingQuotes || []).map((q, i) => (
                  <div key={q.id} className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, opacity: 0.55, minWidth: 18, paddingTop: 8 }}>{i + 1}</span>
                      <select
                        className="form-input"
                        style={{ width: 120, flex: '0 0 auto' }}
                        value={q.side}
                        onChange={(e) => {
                          const side = e.target.value === 'B' ? 'B' : 'A';
                          setForm((prev) => {
                            const list = [...(prev.floatingQuotes || [])];
                            list[i] = { ...q, side };
                            return { ...prev, floatingQuotes: list };
                          });
                        }}
                        aria-label="캐릭터"
                      >
                        <option value="A">왼쪽 · {nameA}</option>
                        <option value="B">오른쪽 · {nameB}</option>
                      </select>
                      <select
                        className="form-input"
                        style={{ width: 88, flex: '0 0 auto' }}
                        value={q.slot || 'chest'}
                        onChange={(e) => {
                          const slot = e.target.value as PairQuoteSlot;
                          setForm((prev) => {
                            const list = [...(prev.floatingQuotes || [])];
                            list[i] = { ...q, slot };
                            return { ...prev, floatingQuotes: list };
                          });
                        }}
                        aria-label="슬롯"
                      >
                        {PAIR_QUOTE_SLOTS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <textarea
                        className="form-input"
                        rows={2}
                        value={q.text}
                        onChange={(e) => {
                          setForm((prev) => {
                            const list = [...(prev.floatingQuotes || [])];
                            list[i] = { ...q, text: e.target.value };
                            return { ...prev, floatingQuotes: list };
                          });
                        }}
                        placeholder="…너는 뭐지?"
                        style={{ flex: '1 1 180px', minWidth: 140 }}
                      />
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ padding: '6px 10px', flex: '0 0 auto' }}
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            floatingQuotes: (prev.floatingQuotes || []).filter((_, j) => j !== i),
                          }))
                        }
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </RepeatableList>
            </AccordionSection>

            <AccordionSection title="VN 대화" defaultOpen>
              <FieldLabel>
                {dlgSplit
                  ? '왼쪽/오른쪽 전신마다 대사가 따로 재생됩니다. 화자 → 대사 → 다음에 → 선택지 순으로 작성하세요.'
                  : '하나의 대사를 양쪽 캐릭터 클릭에서 공통으로 재생합니다. 화자 칸에서 A/B를 골라 한 스크립트에 섞어 쓰세요.'}
              </FieldLabel>
              <LineVoiceVolumeControl variant="panel" />

              <label className="lh-toggle-row">
                <input
                  type="checkbox"
                  checked={dlgSplit}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setDlgSplit(on);
                    if (!on) setDlgSide('A');
                  }}
                />
                <span className="lh-toggle-row__text">
                  <strong>왼쪽/오른쪽 대사 따로 쓰기</strong>
                  <FieldLabel as="span">고급 · 전신마다 별도 스크립트</FieldLabel>
                </span>
              </label>

            {dlgSplit ? (
            <div className="pair-dlg-sides" role="tablist" aria-label="대사 사이드">
              <button
                type="button"
                role="tab"
                aria-selected={dlgSide === 'A'}
                className={`pair-dlg-sides__btn${dlgSide === 'A' ? ' is-active' : ''}`}
                onClick={() => setDlgSide('A')}
              >
                <strong>왼쪽 · {nameA}</strong>
                <small>{dialogueBySide.A.nodes.length}줄</small>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={dlgSide === 'B'}
                className={`pair-dlg-sides__btn${dlgSide === 'B' ? ' is-active' : ''}`}
                onClick={() => setDlgSide('B')}
              >
                <strong>오른쪽 · {nameB}</strong>
                <small>{dialogueBySide.B.nodes.length}줄</small>
              </button>
            </div>
            ) : null}

            <DialogueNodesEditor
              key={`pair-dlg-${dlgSide}`}
              nodes={activePack.nodes || []}
              onChange={(nodes) => patchActiveDialogue({ nodes })}
              speakerPresets={[
                { label: dlgSide === 'A' ? nameA : nameB, value: dlgSide },
                { label: dlgSide === 'A' ? nameB : nameA, value: dlgSide === 'A' ? 'B' : 'A' },
                { label: '나', value: '나' },
              ]}
              defaultSpeaker={dlgSide}
              onUploadExpression={uploadExpressionImage}
              onUploadVoice={uploadDialogueVoice}
              uploadBusy={uploading}
              listIdPrefix={`pair-dlg-${dlgSide}`}
              hint={
                dlgSplit
                  ? `${dlgSide === 'A' ? '왼쪽' : '오른쪽'} 전신 클릭 시 재생. 나레이션을 고르면 이름 없이 뜨고 캐릭터 둘 다 어두워집니다.`
                  : '두 캐릭터 클릭 시 공통 재생. 화자에서 A/B를 골라 섞어 쓰세요. 나레이션은 이름 없이 뜨고 둘 다 어두워집니다.'
              }
              startId={activePack.start || activePack.nodes[0]?.id || ''}
              onStartIdChange={(id) => patchActiveDialogue({ start: id })}
            />
            </AccordionSection>
          </>
        ) : null}

        {tab === 'gallery' ? (
          <>
            <div className="lake-edit-section-title">갤러리</div>
            <p className="pair-edit-hint">
              항목을 펼쳐 이미지를 여러 장 넣을 수 있습니다. 드래그로 순서를 바꾸고, 공개 화면에서는 슬라이드로
              봅니다.
            </p>
            <RepeatableList
              addLabel="+ 갤러리 항목 추가"
              onAdd={() => {
                const item: PairGalleryItem = { id: newId(), src: '', images: [] };
                setForm((prev) => ({ ...prev, gallery: [...(prev.gallery ?? []), item] }));
                setGalOpenId(item.id);
              }}
            >
              {galSort.ghostNode}
              {galleryItems.map((g, i) => {
                const open = galOpenId === g.id;
                const urls = pairGalleryUrls(g);
                return (
                  <div
                    key={g.id}
                    ref={(el) => galSort.setRowRef(i, el)}
                    className={`lh-gal-edit-card${open ? ' is-open' : ''}${
                      galSort.dragFrom === i ? ' is-dragging' : ''
                    }${galSort.dragOver === i && galSort.dragFrom !== i ? ' is-drop-slot' : ''}`}
                  >
                    <div className="lh-gal-edit-card__head">
                      <button
                        type="button"
                        className="lh-gal-edit-card__handle"
                        title="드래그로 이동"
                        aria-label="순서 변경"
                        {...galSort.handleProps(i)}
                      >
                        ⠿
                      </button>
                      <button
                        type="button"
                        className="lh-gal-edit-card__toggle"
                        onClick={() => setGalOpenId(open ? null : g.id)}
                        aria-expanded={open}
                      >
                        <span className="lh-gal-edit-card__thumb">
                          {urls[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={urls[0]} alt="" referrerPolicy="no-referrer" />
                          ) : (
                            '🖼'
                          )}
                        </span>
                        <span className="lh-gal-edit-card__title">
                          {g.title?.trim() || `항목 ${i + 1}`}
                          {urls.length > 1 ? (
                            <em className="lh-gal-edit-card__count">{urls.length}장</em>
                          ) : null}
                        </span>
                        <span className="lh-gal-edit-card__chev" aria-hidden>
                          {open ? '▾' : '▸'}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="lake-edit-mini-del"
                        onClick={() => removeGalleryItem(g.id)}
                        aria-label="삭제"
                      >
                        ✕
                      </button>
                    </div>
                    {open ? (
                      <div className="lh-gal-edit-card__body">
                        <div className="form-group">
                          <label className="form-label">제목</label>
                          <input
                            className="form-input"
                            value={g.title || ''}
                            onChange={(e) => updateGalleryItem(g.id, { title: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">작가 / 출처</label>
                          <GalleryCreditInput
                            value={g.credit || ''}
                            onChange={(credit) => updateGalleryItem(g.id, { credit })}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">이미지 ({urls.length})</label>
                          <div className="lh-gal-edit-imgs">
                            {urls.map((src, ui) => (
                              <div key={`${src}-${ui}`} className="lh-gal-edit-imgs__row">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={src} alt="" referrerPolicy="no-referrer" />
                                <button
                                  type="button"
                                  className="btn-del"
                                  disabled={ui === 0}
                                  onClick={() => {
                                    const next = [...urls];
                                    const [m] = next.splice(ui, 1);
                                    next.splice(ui - 1, 0, m);
                                    setGalleryUrls(g.id, next);
                                  }}
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  className="btn-del"
                                  disabled={ui >= urls.length - 1}
                                  onClick={() => {
                                    const next = [...urls];
                                    const [m] = next.splice(ui, 1);
                                    next.splice(ui + 1, 0, m);
                                    setGalleryUrls(g.id, next);
                                  }}
                                >
                                  ↓
                                </button>
                                <button
                                  type="button"
                                  className="btn-del"
                                  onClick={() => setGalleryUrls(g.id, urls.filter((_, j) => j !== ui))}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                          <ImageUploadCrop
                            label="이미지 추가"
                            value={galleryDraft}
                            folder="pair/gallery"
                            onChange={setGalleryDraft}
                            onUploaded={(url) => {
                              setGalleryUrls(g.id, [...urls, url]);
                              setGalleryDraft('');
                            }}
                            uploading={uploading}
                            onUploadStart={() => setUploading(true)}
                            onUploadEnd={() => setUploading(false)}
                            urlPlaceholder="또는 URL"
                          />
                          {galleryDraft.trim() ? (
                            <button
                              type="button"
                              className="lh-repeatable__add"
                              style={{ marginTop: 8 }}
                              onClick={() => {
                                const src = galleryDraft.trim();
                                if (!src) return;
                                setGalleryUrls(g.id, [...urls, src]);
                                setGalleryDraft('');
                              }}
                            >
                              + URL로 이미지 추가
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </RepeatableList>
          </>
        ) : null}
        <div className="lake-edit-shell__end-space" aria-hidden="true" />
      </div>
    </div>
  );
}
