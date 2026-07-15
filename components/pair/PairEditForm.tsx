'use client';

import { useEffect, useMemo, useState } from 'react';
import { DialogueNodesEditor } from '@/components/shared/DialogueNodesEditor';
import { LineVoiceVolumeControl } from '@/components/shared/LineVoiceVolumeControl';
import { GalleryCreditInput } from '@/components/ui/GalleryCreditInput';
import { ImageFrameEditor } from '@/components/ui/ImageFrameEditor';
import { LakeEditTabs } from '@/components/ui/LakeEditTabs';
import { useSaveToast } from '@/components/ui/SaveToast';
import {
  hydratePairDialogueBySide,
  serializePairDialogue,
  type PairDialogueBySide,
  type PairVnSide,
} from '@/lib/pair/dialogue';
import { PAIR_CARD_ASPECT } from '@/lib/oc/pairDefaults';
import { pairCover } from '@/lib/oc/pairCover';
import { uploadImageFile, uploadMediaFile } from '@/lib/r2/client';
import { DEFAULT_IMAGE_FRAME, type ImageFrame } from '@/lib/shared/imageFrame';
import type {
  OcCharacter,
  PairChemistry,
  PairCommission,
  PairCommissionKind,
  PairFloatingQuote,
  PairGalleryItem,
  PairItem,
  PairQuoteSlot,
  PairVnStandPose,
} from '@/lib/types/character';
import { newId } from '@/lib/types/site-content';
import { finalizeCommaList, splitCommaListLive } from '@/lib/ui/commaList';
import {
  emptyPairFloatingQuote,
  hydratePairFloatingQuotes,
  normalizePairFloatingQuotes,
  PAIR_QUOTE_SLOTS,
} from '@/lib/oc/floatingQuotes';

type PairEditTab = 'basic' | 'chars' | 'relation' | 'story' | 'dialogue' | 'works' | 'gallery';

const PAIR_EDIT_TABS: { id: PairEditTab; label: string }[] = [
  { id: 'basic', label: '기본' },
  { id: 'chars', label: '캐릭터' },
  { id: 'relation', label: '관계' },
  { id: 'story', label: '스토리' },
  { id: 'dialogue', label: '대사' },
  { id: 'works', label: '자료' },
  { id: 'gallery', label: '갤러리' },
];

const COMMISSION_KINDS: { id: PairCommissionKind; label: string }[] = [
  { id: 'anecdote', label: 'Anecdote' },
  { id: 'if', label: 'IF' },
  { id: 'au', label: 'AU' },
];

type Props = {
  pair: PairItem;
  characters?: OcCharacter[];
  onSave: (p: PairItem) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  order?: { canUp: boolean; canDown: boolean; position: number; total: number };
  onMove?: (direction: -1 | 1) => void;
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

function defaultChemistry(pair: PairItem): PairChemistry[] {
  if (pair.chemistry?.length) return pair.chemistry;
  return [
    { label: '긴장감', value: 50 },
    { label: '신뢰도', value: 50 },
    { label: '친밀도', value: 50 },
  ];
}

function emptyCommission(kind: PairCommissionKind = 'anecdote'): PairCommission {
  return { id: newId(), kind, title: '', body: '', url: '', note: '' };
}

export function PairEditForm({ pair, characters = [], onSave, onDelete, order, onMove }: Props) {
  const { showSaveToast } = useSaveToast();
  const [form, setForm] = useState(() => ({
    ...pair,
    dialogueBySide: hydratePairDialogueBySide(pair),
    floatingQuotes: hydratePairFloatingQuotes(pair),
  }));
  const [tab, setTab] = useState<PairEditTab>('basic');
  const [dlgSide, setDlgSide] = useState<PairVnSide>('A');
  const [uploading, setUploading] = useState(false);
  const [worksFilter, setWorksFilter] = useState<PairCommissionKind | 'all'>('all');

  useEffect(() => {
    setForm({
      ...pair,
      dialogueBySide: hydratePairDialogueBySide(pair),
      floatingQuotes: hydratePairFloatingQuotes(pair),
    });
    setDlgSide('A');
  }, [pair]);

  useEffect(() => {
    setTab('basic');
  }, [pair.id]);

  const dialogueBySide: PairDialogueBySide = form.dialogueBySide ?? {
    A: { nodes: [] },
    B: { nodes: [] },
  };
  const activePack = dialogueBySide[dlgSide];

  const ddayPreview = useMemo(() => formatDdayPreview(form.dday), [form.dday]);
  const chemistry = defaultChemistry(form);
  const commissions = form.commissions ?? [];
  const filteredCommissions =
    worksFilter === 'all' ? commissions : commissions.filter((c) => c.kind === worksFilter);

  const cover = pairCover(form);
  const nameA = form.chars[0] || 'A';
  const nameB = form.chars[1] || 'B';

  async function uploadCover(file: File) {
    setUploading(true);
    try {
      const url = await uploadImageFile(file, 'pair/cover');
      setForm((prev) => ({ ...prev, img: url }));
    } finally {
      setUploading(false);
    }
  }

  async function uploadPairAsset(file: File, folder: string, apply: (url: string) => void) {
    setUploading(true);
    try {
      const url = await uploadImageFile(file, folder);
      apply(url);
    } finally {
      setUploading(false);
    }
  }

  async function uploadGallery(file: File) {
    setUploading(true);
    try {
      const url = await uploadImageFile(file, 'pair/gallery');
      const item: PairGalleryItem = { id: newId(), src: url };
      setForm((prev) => ({ ...prev, gallery: [...(prev.gallery ?? []), item] }));
    } finally {
      setUploading(false);
    }
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
      chemistry: [...defaultChemistry(prev), { label: '지표', value: 50 }],
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

  function updateCommission(id: string, patch: Partial<PairCommission>) {
    setForm((prev) => ({
      ...prev,
      commissions: (prev.commissions ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }

  function removeCommission(id: string) {
    setForm((prev) => ({
      ...prev,
      commissions: (prev.commissions ?? []).filter((c) => c.id !== id),
    }));
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
    const bySide = form.dialogueBySide ?? hydratePairDialogueBySide(form);
    const dlg = serializePairDialogue(bySide);
    const {
      dialogues: _legacyDialogues,
      dialogue: _legacyDialogue,
      dialogueStart: _legacyStart,
      ...rest
    } = form;
    await onSave({
      ...rest,
      ...dlg,
      keywords: finalizeCommaList(form.keywords),
      flatLoreKeywords: finalizeCommaList(form.flatLoreKeywords),
      floatingQuotes: normalizePairFloatingQuotes(form.floatingQuotes),
      floatingQuotesBySide: undefined,
      commissions: (form.commissions ?? []).filter((c) => c.title.trim() || c.body?.trim() || c.url?.trim()),
    });
    showSaveToast();
  }

  return (
    <div className="lake-edit-shell pair-edit-form">
      <div className="pair-edit-toolbar">
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
                <ImageFrameEditor
                  className="pair-thumb-editor"
                  src={cover.src}
                  value={form.imgFrame}
                  onChange={(imgFrame) => setForm({ ...form, imgFrame })}
                  fit={cover.fit || 'cover'}
                  pos={cover.pos || 'center top'}
                  aspectRatio={PAIR_CARD_ASPECT}
                  allowWheelZoom
                />
                <label className="file-input-label" style={{ marginTop: 8 }}>
                  {uploading ? '업로드 중…' : '📁 파일 선택'}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadCover(f);
                      e.target.value = '';
                    }}
                  />
                </label>
                <input
                  className="form-input"
                  style={{ marginTop: 8 }}
                  placeholder="또는 URL"
                  value={form.img || ''}
                  onChange={(e) => setForm({ ...form, img: e.target.value })}
                />
              </div>

              <div className="pair-edit-basic__fields">
                <div className="lake-edit-section-title">페어 정보</div>
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
                  <label className="form-label">관계 라벨</label>
                  <input
                    className="form-input"
                    placeholder="적대 / 연인 / 라이벌…"
                    value={form.relation || ''}
                    onChange={(e) => setForm({ ...form, relation: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">태그</label>
                  <input
                    className="form-input"
                    placeholder="#태그1, #태그2, 캐치프라이즈"
                    value={(form.keywords || []).join(', ')}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        keywords: splitCommaListLive(e.target.value),
                      })
                    }
                  />
                </div>
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
                  <label className="form-label">상세 배경</label>
                  <label className="file-input-label">
                    {uploading ? '업로드 중…' : '📁 파일 선택'}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          void uploadPairAsset(f, 'pair/bg', (url) =>
                            setForm((prev) => ({ ...prev, bg: url })),
                          );
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <input
                    className="form-input"
                    style={{ marginTop: 8 }}
                    placeholder="또는 URL"
                    value={form.bg || ''}
                    onChange={(e) => setForm({ ...form, bg: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">로고</label>
                  <label className="file-input-label">
                    {uploading ? '업로드 중…' : '📁 파일 선택'}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          void uploadPairAsset(f, 'pair/logo', (url) =>
                            setForm((prev) => ({ ...prev, logo: url })),
                          );
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <input
                    className="form-input"
                    style={{ marginTop: 8 }}
                    placeholder="또는 URL"
                    value={form.logo || ''}
                    onChange={(e) => setForm({ ...form, logo: e.target.value })}
                  />
                </div>
                <div className="lake-edit-section-title" style={{ marginTop: 16 }}>
                  배경 비네트
                </div>
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
                  <label className="form-label">
                    비네트 세기
                    <span style={{ marginLeft: 8, opacity: 0.72 }}>
                      {typeof form.bgVignette === 'number' ? form.bgVignette : 16}%
                    </span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    className="lh-range-input"
                    value={typeof form.bgVignette === 'number' ? form.bgVignette : 16}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setForm({ ...form, bgVignette: n === 16 ? undefined : n });
                    }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    배경 딤
                    <span style={{ marginLeft: 8, opacity: 0.72 }}>
                      {typeof form.bgDim === 'number' ? form.bgDim : 0}%
                    </span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    className="lh-range-input"
                    value={typeof form.bgDim === 'number' ? form.bgDim : 0}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setForm({ ...form, bgDim: n === 0 ? undefined : n });
                    }}
                  />
                  <p className="lh-color-hint">밝은 배경에서 글자 가독성을 위해 어둡게 덮습니다.</p>
                </div>

                <div className="lake-edit-section-title" style={{ marginTop: 16 }}>
                  테마곡
                </div>
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
                  <label className="form-label">오디오 URL</label>
                  <input
                    className="form-input"
                    value={form.theme?.fileData || ''}
                    onChange={(e) =>
                      setForm({ ...form, theme: { ...(form.theme || {}), fileData: e.target.value } })
                    }
                  />
                </div>
                <label className="file-input-label" style={{ marginBottom: 8 }}>
                  {uploading ? '업로드 중…' : '테마곡 MP3 업로드'}
                  <input
                    type="file"
                    accept="audio/*"
                    hidden
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        void uploadPairAsset(f, 'pair/theme', (url) =>
                          setForm((prev) => ({
                            ...prev,
                            theme: { ...(prev.theme || {}), fileData: url },
                          })),
                        );
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
          </>
        ) : null}

        {tab === 'chars' ? (
          <>
            <div className="lake-edit-section-title">캐릭터 선택</div>
            {characters.length > 0 ? (
              <div className="pair-char-pick">
                {characters.slice(0, 16).map((c) => {
                  const selected = form.chars.includes(c.name);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`pair-char-card${selected ? ' is-selected' : ''}`}
                      onClick={() => {
                        const slot =
                          form.chars[0] === c.name ? 0 : form.chars[1] === c.name ? 1 : form.chars[0] ? 1 : 0;
                        pickCharacter(c.name, slot as 0 | 1);
                      }}
                    >
                      <span className="pair-char-card__img">
                        {c.img ? <img src={c.img} alt="" referrerPolicy="no-referrer" /> : c.name[0]}
                      </span>
                      <span className="pair-char-card__name">{c.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="pair-edit-hint">OC 목록이 없으면 아래에서 이름을 직접 입력하세요.</p>
            )}

            <div className="pair-char-slots">
              {([0, 1] as const).map((slot) => (
                <div key={slot} className="pair-char-slot">
                  <div className="pair-char-slot__head">{slot === 0 ? 'A' : 'B'}</div>
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
                  <div className="form-group">
                    <label className="form-label">전신</label>
                    <label className="file-input-label">
                      {uploading ? '업로드 중…' : '📁 파일 선택'}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            void uploadPairAsset(f, 'pair/char-body', (url) => {
                              setCharImgSlot('charBodyImgs', slot, url);
                            });
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <input
                      className="form-input"
                      style={{ marginTop: 8 }}
                      placeholder="또는 URL"
                      value={form.charBodyImgs?.[slot] || ''}
                      onChange={(e) => setCharImgSlot('charBodyImgs', slot, e.target.value)}
                    />
                    {form.charBodyImgs?.[slot]?.trim() ? (
                      <>
                        <p className="pair-edit-hint" style={{ marginTop: 8 }}>
                          드래그·휠로 전신 노출을 맞춥니다. 하단이 잘리면 페이드를 올리세요.
                        </p>
                        <ImageFrameEditor
                          className="pair-char-frame-editor pair-char-frame-editor--body"
                          src={form.charBodyImgs[slot]}
                          value={form.charBodyImgFrames?.[slot]}
                          onChange={(frame) => setCharFrameSlot('charBodyImgFrames', slot, frame)}
                          fit="contain"
                          pos="center top"
                          aspectRatio="3 / 5"
                          allowWheelZoom
                        />
                      </>
                    ) : null}
                  </div>
                  <div className="form-group">
                    <label className="form-label">전신 출처</label>
                    <GalleryCreditInput
                      value={form.charNotes?.[slot]?.bodyCredit || ''}
                      onChange={(bodyCredit) => updateCharNote(slot, { bodyCredit })}
                      placeholder="커미션 출처"
                    />
                  </div>
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
                    <label className="form-label">역할 / 포지션</label>
                    <input
                      className="form-input"
                      placeholder="주동 / 조력 / …"
                      value={form.charNotes?.[slot]?.role || ''}
                      onChange={(e) => updateCharNote(slot, { role: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">캐릭터 서술 (HTML)</label>
                    <textarea
                      className="form-input"
                      rows={5}
                      placeholder="중앙 반투명 박스 — HTML 태그 사용 가능"
                      value={form.charNotes?.[slot]?.story || ''}
                      onChange={(e) => updateCharNote(slot, { story: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="lake-edit-section-title">호칭</div>
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
          </>
        ) : null}

        {tab === 'relation' ? (
          <>
            <div className="lake-edit-section-title">키워드</div>
            <div className="form-group">
              <input
                className="form-input"
                placeholder="#적대, #키사라기고교"
                value={(form.keywords || []).join(', ')}
                onChange={(e) =>
                  setForm({
                    ...form,
                    keywords: splitCommaListLive(e.target.value),
                  })
                }
              />
            </div>

            <div className="lake-edit-section-title">D-Day</div>
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

            <div className="lake-edit-section-title">케미 수치</div>
            {chemistry.map((row, i) => (
              <div key={`${row.label}-${i}`} className="pair-chem-edit-row">
                <input
                  className="form-input pair-chem-edit-lbl"
                  value={row.label}
                  onChange={(e) => updateChem(i, { label: e.target.value })}
                />
                <input
                  type="range"
                  className="pair-chem-slider"
                  min={0}
                  max={100}
                  value={row.value}
                  onChange={(e) => updateChem(i, { value: Number(e.target.value) })}
                />
                <input
                  className="pair-chem-num"
                  type="number"
                  min={0}
                  max={100}
                  value={row.value}
                  onChange={(e) => updateChem(i, { value: Number(e.target.value) || 0 })}
                />
                <button type="button" className="lake-edit-mini-del" onClick={() => removeChem(i)}>
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="lake-edit-add-btn" onClick={addChem}>
              + 지표 추가
            </button>

            <div className="lake-edit-section-title">관계 개요</div>
            <div className="form-group">
              <textarea
                className="form-input"
                rows={3}
                placeholder="한 줄 요약·관계 설명"
                value={form.desc || ''}
                onChange={(e) => setForm({ ...form, desc: e.target.value })}
              />
            </div>

            <div className="lake-edit-section-title">납작캐해</div>
            <div className="form-group">
              <textarea
                className="form-input"
                rows={3}
                placeholder="공식 해석"
                value={form.flatLore || ''}
                onChange={(e) => setForm({ ...form, flatLore: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">납작캐해 키워드 (쉼표)</label>
              <input
                className="form-input"
                value={(form.flatLoreKeywords || []).join(', ')}
                onChange={(e) =>
                  setForm({
                    ...form,
                    flatLoreKeywords: splitCommaListLive(e.target.value),
                  })
                }
              />
            </div>
          </>
        ) : null}

        {tab === 'story' ? (
          <>
            <div className="lake-edit-section-title">페어 스토리 (공통 서사)</div>
            <p className="pair-edit-hint">중앙 하단 넓은 박스에 표시됩니다. HTML 태그 사용 가능.</p>
            <div className="form-group">
              <textarea
                className="form-input"
                rows={12}
                placeholder="페어 스토리…"
                value={form.story || ''}
                onChange={(e) => setForm({ ...form, story: e.target.value })}
              />
            </div>
          </>
        ) : null}

        {tab === 'dialogue' ? (
          <>
            <div className="lake-edit-section-title">대표 대사 (최대 2)</div>
            <p className="pair-edit-hint">
              캐릭터에 <strong>앵커</strong>된 인용 대사입니다. 최대 2줄.
              누구·어느 높이(얼굴/가슴/허리)를 고르고, 저장 후 상단 「대사」에서 크기만 조절하세요.
            </p>
            {(form.floatingQuotes || []).map((q, i) => (
              <div key={q.id} className="form-group" style={{ marginBottom: 10 }}>
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
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-save"
                style={{ padding: '5px 12px' }}
                disabled={(form.floatingQuotes?.length ?? 0) >= 2}
                onClick={() => {
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
                + 대표 대사 추가
              </button>
            </div>

            <div className="lake-edit-section-title">VN 스탠딩 위치</div>
            <p className="pair-edit-hint">
              상세에서 대사를 연 뒤 「위치」를 눌러 스탠딩을 드래그·휠로 조절할 수 있습니다.
            </p>
            {([0, 1] as const).map((slot) => {
              const label = slot === 0 ? `A · ${nameA}` : `B · ${nameB}`;
              const src = form.charBodyImgs?.[slot]?.trim() || form.charImgs?.[slot]?.trim() || '';
              const pose = form.vnStandPos?.[slot] ?? {};
              const setPoseFrame = (frame: ImageFrame) => {
                setForm((prev) => {
                  const next: [PairVnStandPose, PairVnStandPose] = [
                    { ...(prev.vnStandPos?.[0] ?? {}) },
                    { ...(prev.vnStandPos?.[1] ?? {}) },
                  ];
                  next[slot] = {
                    x: frame.x ?? 0,
                    y: frame.y ?? 0,
                    scale: frame.scale ?? 1,
                    bottomBlur: frame.bottomBlur ?? 0,
                  };
                  return { ...prev, vnStandPos: next };
                });
              };
              return (
                <div key={slot} className="lake-edit-card" style={{ marginBottom: 12 }}>
                  <div className="form-label" style={{ marginBottom: 8 }}>
                    {label}
                  </div>
                  {src ? (
                    <ImageFrameEditor
                      className="pair-vn-stand-editor"
                      src={src}
                      value={{
                        x: pose.x ?? 0,
                        y: pose.y ?? 0,
                        scale: pose.scale ?? 1,
                        bottomBlur: pose.bottomBlur ?? 0,
                      }}
                      onChange={setPoseFrame}
                      fit="contain"
                      pos="center bottom"
                      aspectRatio="9 / 16"
                      allowWheelZoom
                    />
                  ) : (
                    <p className="pair-edit-hint">캐릭터 탭에서 전신을 먼저 넣어 주세요.</p>
                  )}
                </div>
              );
            })}

            <div className="lake-edit-section-title">VN 대화</div>
            <p className="pair-edit-hint">
              <strong>왼쪽</strong> / <strong>오른쪽</strong> 전신마다 대사가 따로 재생됩니다. 기존 대사는
              왼쪽(A)에 있습니다. 각 줄은 <strong>화자 → 대사 → 다음에 → 선택지</strong>만 보면 됩니다.
            </p>
            <LineVoiceVolumeControl variant="panel" />

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
              hint={`${dlgSide === 'A' ? '왼쪽' : '오른쪽'} 전신 클릭 시 재생. 나레이션을 고르면 이름 없이 뜨고 캐릭터 둘 다 어두워집니다.`}
              startId={activePack.start || activePack.nodes[0]?.id || ''}
              onStartIdChange={(id) => patchActiveDialogue({ start: id })}
            />
          </>
        ) : null}

        {tab === 'works' ? (
          <>
            <div className="lake-edit-section-title">글커미션 · 자료 백업</div>
            <p className="pair-edit-hint">Anecdote / IF / AU 글·자료를 여기에 백업해 둡니다.</p>
            <div className="pair-works-filter" role="tablist" aria-label="자료 종류">
              <button
                type="button"
                className={`pair-works-filter__btn${worksFilter === 'all' ? ' is-active' : ''}`}
                onClick={() => setWorksFilter('all')}
              >
                전체
              </button>
              {COMMISSION_KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  className={`pair-works-filter__btn${worksFilter === k.id ? ' is-active' : ''}`}
                  onClick={() => setWorksFilter(k.id)}
                >
                  {k.label}
                </button>
              ))}
            </div>

            {filteredCommissions.length === 0 ? (
              <p className="pair-edit-hint">아직 자료가 없습니다. 아래에서 추가하세요.</p>
            ) : null}

            {filteredCommissions.map((c) => (
              <div key={c.id} className="lake-edit-card pair-works-card">
                <div className="lake-edit-row2">
                  <div className="form-group">
                    <label className="form-label">종류</label>
                    <select
                      className="form-input"
                      value={c.kind}
                      onChange={(e) => updateCommission(c.id, { kind: e.target.value as PairCommissionKind })}
                    >
                      {COMMISSION_KINDS.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">제목</label>
                    <input
                      className="form-input"
                      value={c.title}
                      onChange={(e) => updateCommission(c.id, { title: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">본문 / 백업</label>
                  <textarea
                    className="form-input"
                    rows={4}
                    value={c.body || ''}
                    onChange={(e) => updateCommission(c.id, { body: e.target.value })}
                  />
                </div>
                <div className="lake-edit-row2">
                  <div className="form-group">
                    <label className="form-label">링크 URL</label>
                    <input
                      className="form-input"
                      placeholder="https://…"
                      value={c.url || ''}
                      onChange={(e) => updateCommission(c.id, { url: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">메모</label>
                    <input
                      className="form-input"
                      value={c.note || ''}
                      onChange={(e) => updateCommission(c.id, { note: e.target.value })}
                    />
                  </div>
                </div>
                <button type="button" className="lake-edit-mini-del" onClick={() => removeCommission(c.id)}>
                  삭제
                </button>
              </div>
            ))}

            <div className="pair-edit-add-row">
              {COMMISSION_KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  className="lake-edit-add-btn"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      commissions: [...(prev.commissions ?? []), emptyCommission(k.id)],
                    }))
                  }
                >
                  + {k.label}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {tab === 'gallery' ? (
          <>
            <div className="lake-edit-section-title">갤러리</div>
            <div className="pair-gal-grid">
              {(form.gallery ?? []).map((g) => (
                <div key={g.id} className="pair-gal-item">
                  <div className="pair-gal-item__ph">
                    {g.src ? <img src={g.src} alt="" referrerPolicy="no-referrer" /> : '🖼'}
                  </div>
                  <div className="pair-gal-item__cap">
                    <span>{g.title || '이미지'}</span>
                    <button type="button" className="lake-edit-mini-del" onClick={() => removeGalleryItem(g.id)}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="form-group" style={{ marginTop: 10 }}>
              <label className="file-input-label">
                {uploading ? '업로드 중…' : '📁 갤러리 이미지 추가'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadGallery(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            {(form.gallery ?? []).map((g) => (
              <div key={`edit-${g.id}`} className="lake-edit-card">
                <div className="lake-edit-row2">
                  <div className="form-group">
                    <label className="form-label">URL</label>
                    <input
                      className="form-input"
                      value={g.src}
                      onChange={(e) => updateGalleryItem(g.id, { src: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">제목</label>
                    <input
                      className="form-input"
                      value={g.title || ''}
                      onChange={(e) => updateGalleryItem(g.id, { title: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">작가 / 출처</label>
                  <GalleryCreditInput
                    value={g.credit || ''}
                    onChange={(credit) => updateGalleryItem(g.id, { credit })}
                  />
                </div>
              </div>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}
