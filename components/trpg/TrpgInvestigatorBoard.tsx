'use client';

import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ImageFileField } from '@/components/ui/ImageFileField';
import { ImageFrameEditor } from '@/components/ui/ImageFrameEditor';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { InvestigatorCardImage, normalizePortraitKind } from '@/components/trpg/TrpgInvestigatorImage';
import { TrpgInvestigatorDetail } from '@/components/trpg/TrpgInvestigatorDetail';
import { LikeHateEdit, LikeHateView } from '@/components/trpg/TrpgInvestigatorLikeHate';
import { ProfileTextBlock, ProfileTextEdit } from '@/components/trpg/TrpgProfileText';
import { useOcData } from '@/lib/hooks/useOcData';
import { normalizeHex } from '@/lib/oc/characterTheme';
import { mergePlayerInfoFields } from '@/lib/trpg/defaultPlayerInfo';
import { normalizeImageFrame, type ImageFrame } from '@/lib/shared/imageFrame';
import { newId } from '@/lib/types/site-content';
import type {
  TrpgPlayerExpression,
  TrpgPlayerExpressionKind,
  TrpgPlayerInfoField,
  TrpgPlayerItem,
  TrpgPlayerProfile,
  TrpgPlayerRelation,
  TrpgPlayerStat,
} from '@/lib/types/site-content';

type InvViewTab = 'profile' | 'background' | 'stats' | 'items' | 'relations';

const DEFAULT_PORTRAIT_POS = 'center bottom';
const DEFAULT_PORTRAIT_FIT = 'contain';

function portraitFrameFromDefault(draft: TrpgPlayerProfile): {
  imgFrame: ImageFrame;
  imgFit: string;
  imgPos: string;
} {
  const frame = normalizeImageFrame(draft.stageImgFrame);
  return {
    imgFrame: { scale: frame.scale, x: frame.x, y: frame.y },
    imgFit: draft.stageImgFit || draft.imgFit || DEFAULT_PORTRAIT_FIT,
    imgPos: draft.stageImgPos || draft.imgPos || DEFAULT_PORTRAIT_POS,
  };
}

const INV_VIEW_TABS: { id: InvViewTab; label: string }[] = [
  { id: 'profile', label: '프로필' },
  { id: 'background', label: '배경' },
  { id: 'stats', label: '능력치' },
  { id: 'items', label: '소지품' },
  { id: 'relations', label: '관계' },
];

function padItemSlots(items: TrpgPlayerItem[] | undefined): TrpgPlayerItem[] {
  const list = [...(items ?? [])];
  const minSlots = 8;
  while (list.length < minSlots) {
    list.push({ id: `empty-${list.length}`, name: '—', empty: true });
  }
  return list;
}

function investigatorCardSubtitle(player: TrpgPlayerProfile) {
  if (player.nameEn?.trim()) return player.nameEn.trim();
  const role = player.role?.trim();
  if (role && !/[가-힣]/.test(role)) return role;
  return player.name.toUpperCase();
}

function CardDeco() {
  return (
    <div className="card-deco" aria-hidden="true">
      <div className="card-deco-line" />
      <div className="card-deco-dot" />
      <div className="card-deco-line r" />
    </div>
  );
}

type Props = {
  players: TrpgPlayerProfile[];
  editable?: boolean;
  uploading?: boolean;
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
  onChange?: (players: TrpgPlayerProfile[]) => void;
};

export function TrpgInvestigatorBoard({
  players,
  editable = false,
  uploading = false,
  onUploadStart,
  onUploadEnd,
  onChange,
}: Props) {
  const { confirm } = useLakeDialog();
  const { characters: ocCharacters } = useOcData();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<InvViewTab>('profile');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TrpgPlayerProfile | null>(null);
  const [expressionId, setExpressionId] = useState<string>('default');
  const [expandedExprIds, setExpandedExprIds] = useState<string[]>([]);

  const active = players.find((p) => p.id === activeId) ?? null;
  const view = editing && draft ? draft : active;

  function updatePlayers(next: TrpgPlayerProfile[]) {
    onChange?.(next);
    if (activeId && !next.some((p) => p.id === activeId)) {
      setActiveId(null);
      setEditing(false);
      setDraft(null);
    }
  }

  function patchPlayer(id: string, patch: Partial<TrpgPlayerProfile>) {
    updatePlayers(players.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function openCard(id: string) {
    // 같은 카드 재클릭 시 닫지 않음 — 상세가 바로 열리도록 (간헐적 첫 클릭 무시에 가깝게)
    if (activeId === id) return;
    setActiveId(id);
    setViewTab('profile');
    setEditing(false);
    setDraft(null);
    setExpressionId('default');
  }

  function openInvestigatorProfile(id: string) {
    if (!players.some((p) => p.id === id)) return;
    setActiveId(id);
    setViewTab('profile');
    setEditing(false);
    setDraft(null);
    setExpressionId('default');
  }

  const closePanel = useCallback(() => {
    setActiveId(null);
    setEditing(false);
    setDraft(null);
    setExpressionId('default');
  }, []);

  /* 상세 닫힌 뒤 body 잠금 잔여만 제거 (open 클래스는 Detail이 소유) */
  useLayoutEffect(() => {
    if (activeId) return;
    document.body.classList.remove('trpg-inv-detail-open');
  }, [activeId]);

  function startEdit(player: TrpgPlayerProfile) {
    setDraft({ ...player, infoFields: mergePlayerInfoFields(player.infoFields) });
    setEditing(true);
    setExpandedExprIds([]);
  }

  function saveEdit() {
    if (!draft) return;
    patchPlayer(draft.id, draft);
    setEditing(false);
    setDraft(null);
    setExpandedExprIds([]);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft(null);
    setExpandedExprIds([]);
  }

  async function removePlayer(id: string) {
    if (!(await confirm('이 탐사자를 삭제할까요?'))) return;
    updatePlayers(players.filter((p) => p.id !== id));
  }

  function updateDraft(patch: Partial<TrpgPlayerProfile>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function updateInfoField(index: number, patch: Partial<TrpgPlayerInfoField>) {
    if (!draft) return;
    const infoFields = [...(draft.infoFields ?? [])];
    infoFields[index] = { ...infoFields[index], ...patch };
    updateDraft({ infoFields });
  }

  function addInfoField() {
    if (!draft) return;
    updateDraft({ infoFields: [...(draft.infoFields ?? []), { key: '', value: '' }] });
  }

  function removeInfoField(index: number) {
    if (!draft) return;
    updateDraft({ infoFields: (draft.infoFields ?? []).filter((_, i) => i !== index) });
  }

  function moveInfoField(index: number, dir: -1 | 1) {
    if (!draft) return;
    const fields = [...(draft.infoFields ?? [])];
    const next = index + dir;
    if (next < 0 || next >= fields.length) return;
    [fields[index], fields[next]] = [fields[next], fields[index]];
    updateDraft({ infoFields: fields });
  }

  function updateStat(index: number, patch: Partial<TrpgPlayerStat>) {
    if (!draft) return;
    const stats = [...(draft.stats ?? [])];
    stats[index] = { ...stats[index], ...patch };
    updateDraft({ stats });
  }

  function addStat() {
    if (!draft) return;
    updateDraft({ stats: [...(draft.stats ?? []), { label: 'STAT', value: 50, max: 99 }] });
  }

  function removeStat(index: number) {
    if (!draft) return;
    updateDraft({ stats: (draft.stats ?? []).filter((_, i) => i !== index) });
  }

  function updateRelation(index: number, patch: Partial<TrpgPlayerRelation>) {
    if (!draft) return;
    const relations = [...(draft.relations ?? [])];
    relations[index] = { ...relations[index], ...patch };
    updateDraft({ relations });
  }

  function addRelation() {
    if (!draft) return;
    updateDraft({ relations: [...(draft.relations ?? []), { id: newId(), name: '', desc: '' }] });
  }

  function selectRelationPlayer(index: number, playerId: string) {
    if (!draft) return;
    if (!playerId) {
      updateRelation(index, { playerId: undefined, name: '' });
      return;
    }
    const linked = players.find((p) => p.id === playerId);
    if (!linked) return;
    updateRelation(index, { playerId, name: linked.name });
  }

  function resolveRelationPlayer(rel: TrpgPlayerRelation) {
    if (rel.playerId) {
      return players.find((p) => p.id === rel.playerId) ?? null;
    }
    return null;
  }

  function removeRelation(index: number) {
    if (!draft) return;
    updateDraft({ relations: (draft.relations ?? []).filter((_, i) => i !== index) });
  }

  function addTag(tag: string) {
    if (!draft || !tag.trim()) return;
    updateDraft({ tags: [...(draft.tags ?? []), tag.trim()] });
  }

  function removeTag(index: number) {
    if (!draft) return;
    updateDraft({ tags: (draft.tags ?? []).filter((_, i) => i !== index) });
  }

  function updateItem(index: number, patch: Partial<TrpgPlayerItem>) {
    if (!draft) return;
    const items = [...(draft.items ?? [])];
    items[index] = { ...items[index], ...patch };
    updateDraft({ items });
  }

  function addItem() {
    if (!draft) return;
    updateDraft({
      items: [...(draft.items ?? []), { id: newId(), name: '아이템', icon: '📦', count: '×1' }],
    });
  }

  function removeItem(index: number) {
    if (!draft) return;
    updateDraft({ items: (draft.items ?? []).filter((_, i) => i !== index) });
  }

  function updateExpression(index: number, patch: Partial<TrpgPlayerExpression>) {
    if (!draft) return;
    const expressions = [...(draft.expressions ?? [])];
    expressions[index] = { ...expressions[index], ...patch };
    updateDraft({ expressions });
  }

  function addExpression(kind: TrpgPlayerExpressionKind = 'expression') {
    if (!draft) return;
    const frame = portraitFrameFromDefault(draft);
    const id = newId();
    updateDraft({
      expressions: [
        ...(draft.expressions ?? []),
        {
          id,
          label: kind === 'version' ? '버전' : '표정',
          kind,
          img: '',
          ...frame,
        },
      ],
    });
    setExpandedExprIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function removeExpression(index: number) {
    if (!draft) return;
    const removed = draft.expressions?.[index];
    updateDraft({ expressions: (draft.expressions ?? []).filter((_, i) => i !== index) });
    if (removed) {
      setExpandedExprIds((prev) => prev.filter((id) => id !== removed.id));
    }
  }

  function toggleExpressionExpanded(id: string) {
    setExpandedExprIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function applyDefaultFrameToExpression(index: number) {
    if (!draft) return;
    updateExpression(index, portraitFrameFromDefault(draft));
  }

  function resolveLinkedOcId(player: TrpgPlayerProfile) {
    if (player.ocId && ocCharacters.some((c) => String(c.id) === String(player.ocId))) {
      return String(player.ocId);
    }
    const name = player.name.trim().toLowerCase();
    if (!name) return null;
    const hit = ocCharacters.find((c) => c.name.trim().toLowerCase() === name);
    return hit ? String(hit.id) : null;
  }

  const relationCandidates = draft ? players.filter((p) => p.id !== draft.id) : [];
  const linkedOcId = useMemo(
    () => (view && !editing ? resolveLinkedOcId(view) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolve against current OC list + view
    [view, editing, ocCharacters],
  );

  return (
    <div className={`trpg-inv-archive${editable ? ' trpg-inv-archive--editable' : ''}`}>
      <div className="wrap wrap--grid-only">
        <div className="grid-area lh-scroll">
          {players.map((player) => (
            <div key={player.id} className="inv-card-slot">
              <button
                type="button"
                className={`inv-card${player.id === activeId ? ' active' : ''}`}
                onClick={() => openCard(player.id)}
              >
                <span className="inv-card__lift">
                  {player.img ? (
                    <InvestigatorCardImage player={player} />
                  ) : (
                    <div className="card-img-placeholder">{player.name[0] || '?'}</div>
                  )}
                  <div className="card-bottom">
                    <span className="card-name-ko">{player.name}</span>
                    <span className="card-name-en">{investigatorCardSubtitle(player)}</span>
                    <CardDeco />
                  </div>
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {view ? (
        <TrpgInvestigatorDetail
          player={view}
          expressionId={expressionId}
          onExpressionChange={setExpressionId}
          editing={editing}
          editable={editable}
          onClose={closePanel}
          onStartEdit={() => startEdit(view)}
          onSaveEdit={saveEdit}
          onCancelEdit={cancelEdit}
          onDelete={() => void removePlayer(view.id)}
          onQuotePosChange={
            editing && draft
              ? (quotePos) => {
                  updateDraft({ quotePos });
                }
              : undefined
          }
          onImgFrameChange={
            editing && draft
              ? (stageImgFrame) => {
                  updateDraft({ stageImgFrame });
                }
              : undefined
          }
          identity={
            !editing ? (
              <header className="trpg-inv-detail__identity ph-meta">
                <div className="ph-name-row">
                  <div className="ph-name">{view.name}</div>
                  <div className="ph-name-en">{investigatorCardSubtitle(view)}</div>
                </div>
                {view.playerName ? (
                  <div className="trpg-inv-player-label">플레이어 · {view.playerName}</div>
                ) : null}
                {view.tags?.length ? (
                  <div className="ph-tags">
                    {view.tags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                {linkedOcId ? (
                  <Link
                    href={`/oc?c=${encodeURIComponent(linkedOcId)}&view=detail&from=trpg`}
                    className="trpg-inv-detail__oc-link"
                  >
                    OC 프로필 보기 →
                  </Link>
                ) : null}
              </header>
            ) : null
          }
        >
          {editing && draft ? (
            <div className="trpg-inv-edit-body">
              <div className="trpg-inv-edit-intro">
                <div className="trpg-inv-edit-intro__media">
                  <h4 className="trpg-inv-section__label">카드 이미지</h4>
                  <ImageFileField
                    label=""
                    value={draft.img || ''}
                    folder="site/trpg/players"
                    uploading={uploading}
                    onUploadStart={onUploadStart}
                    onUploadEnd={onUploadEnd}
                    onChange={(img) => updateDraft({ img, imgFrame: undefined, imgFit: 'cover' })}
                  />
                  {draft.img ? (
                    <div className="trpg-inv-img-frame-editor">
                      <ImageFrameEditor
                        src={draft.img}
                        value={draft.imgFrame}
                        onChange={(imgFrame) => updateDraft({ imgFrame })}
                        fit={draft.imgFit || 'cover'}
                        pos={draft.imgPos || 'center top'}
                        aspectRatio="3 / 4"
                        allowWheelZoom
                      />
                    </div>
                  ) : null}
                  <p className="trpg-inv-edit-hint">목록 카드에만 쓰입니다.</p>

                  <h4 className="trpg-inv-section__label trpg-inv-section__label--spaced">스테이지 일러스트</h4>
                  <ImageFileField
                    label=""
                    value={draft.stageImg || ''}
                    folder="site/trpg/players"
                    uploading={uploading}
                    onUploadStart={onUploadStart}
                    onUploadEnd={onUploadEnd}
                    onChange={(stageImg) =>
                      updateDraft({
                        stageImg: stageImg || undefined,
                        stageImgFrame: undefined,
                        stageImgFit: 'contain',
                        stageImgPos: DEFAULT_PORTRAIT_POS,
                      })
                    }
                  />
                  <div className="trpg-inv-edit-row" style={{ marginTop: 6 }}>
                    <button
                      type="button"
                      className="btn-edit"
                      disabled={!draft.img}
                      onClick={() =>
                        updateDraft({
                          stageImg: draft.img,
                          stageImgFrame: undefined,
                          stageImgFit: 'contain',
                          stageImgPos: DEFAULT_PORTRAIT_POS,
                        })
                      }
                    >
                      카드 이미지에서 가져오기
                    </button>
                    {draft.stageImg ? (
                      <button
                        type="button"
                        className="btn-edit"
                        onClick={() =>
                          updateDraft({
                            stageImg: undefined,
                            stageImgFrame: undefined,
                            stageImgFit: undefined,
                            stageImgPos: undefined,
                          })
                        }
                      >
                        비우기 (카드 이미지 사용)
                      </button>
                    ) : null}
                  </div>
                  <p className="trpg-inv-edit-hint">
                    상세 스테이지용입니다. 비우면 카드 이미지를 쓰고, 위치·확대는 왼쪽 스테이지에서 조절하세요.
                  </p>
                  <h4 className="trpg-inv-section__label trpg-inv-section__label--spaced">퍼스널 컬러</h4>
                  <div className="trpg-inv-personal-edit">
                    <span
                      className="trpg-inv-personal-edit__swatch"
                      style={{
                        backgroundColor: normalizeHex(draft.personalColor) || '#d7a982',
                      }}
                      aria-hidden="true"
                    />
                    <input
                      type="color"
                      className="trpg-inv-personal-edit__picker"
                      value={normalizeHex(draft.personalColor) || '#d7a982'}
                      onChange={(e) => updateDraft({ personalColor: e.target.value })}
                      aria-label="퍼스널 컬러 선택"
                    />
                    <input
                      className="trpg-inv-edit-field trpg-inv-personal-edit__hex"
                      placeholder="#d7a982"
                      value={draft.personalColor || ''}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        updateDraft({ personalColor: raw || undefined });
                      }}
                    />
                    {draft.personalColor ? (
                      <button
                        type="button"
                        className="btn-edit"
                        onClick={() => updateDraft({ personalColor: undefined })}
                      >
                        지우기
                      </button>
                    ) : null}
                  </div>
                  <p className="trpg-inv-edit-hint">
                    스테이지 배경에 약 16%로 스며드는 비네트 색입니다. 비우면 효과 없음.
                  </p>
                </div>
                <div className="trpg-inv-edit-intro__meta">
                  <h4 className="trpg-inv-section__label">이름</h4>
                  <div className="trpg-inv-edit-grid">
                    <div className="trpg-inv-edit-row">
                      <label>한글</label>
                      <input
                        className="trpg-inv-edit-field"
                        value={draft.name}
                        onChange={(e) => updateDraft({ name: e.target.value })}
                      />
                    </div>
                    <div className="trpg-inv-edit-row">
                      <label>영문</label>
                      <input
                        className="trpg-inv-edit-field"
                        value={draft.nameEn || ''}
                        onChange={(e) => updateDraft({ nameEn: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="trpg-inv-edit-row trpg-inv-edit-row--quote">
                    <label>대표 한마디</label>
                    <textarea
                      className="trpg-inv-edit-field trpg-inv-edit-field--quote"
                      placeholder={'한 줄 대사…\n엔터로 줄바꿈'}
                      rows={3}
                      value={draft.quote || ''}
                      onChange={(e) => updateDraft({ quote: e.target.value })}
                    />
                    <div className="trpg-inv-quote-align" role="group" aria-label="대사 정렬">
                      {(
                        [
                          { id: 'left', label: '왼쪽' },
                          { id: 'center', label: '중앙' },
                          { id: 'right', label: '오른쪽' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={`trpg-inv-quote-align__btn${(draft.quoteAlign || 'center') === opt.id ? ' is-active' : ''}`}
                          onClick={() => updateDraft({ quoteAlign: opt.id })}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <span className="trpg-inv-edit-hint">
                      줄바꿈은 Enter로만. 수정 모드에서 스테이지 대사를 드래그해 위치를 잡으세요.
                    </span>
                  </div>
                  <div className="trpg-inv-edit-grid">
                    <div className="trpg-inv-edit-row">
                      <label>플레이어</label>
                      <input
                        className="trpg-inv-edit-field"
                        placeholder="연기한 플레이어"
                        value={draft.playerName || ''}
                        onChange={(e) => updateDraft({ playerName: e.target.value })}
                      />
                    </div>
                    <div className="trpg-inv-edit-row">
                      <label>연결 OC</label>
                      <select
                        className="trpg-inv-edit-field"
                        value={draft.ocId || ''}
                        onChange={(e) => updateDraft({ ocId: e.target.value || undefined })}
                      >
                        <option value="">없음 (이름 자동 매칭)</option>
                        {ocCharacters.map((c) => (
                          <option key={String(c.id)} value={String(c.id)}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <h4 className="trpg-inv-section__label trpg-inv-section__label--spaced">태그</h4>
                  <div className="trpg-inv-tag-row">
                    {(draft.tags ?? []).map((tag, i) => (
                      <span key={`${tag}-${i}`} className="trpg-inv-tag-editable">
                        {tag}
                        <button type="button" className="trpg-inv-tag-del" onClick={() => removeTag(i)}>
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    className="trpg-inv-edit-field"
                    placeholder="태그 입력 후 Enter"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag((e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }}
                  />
                </div>
              </div>

              {(['expression', 'version'] as const).map((kind) => {
                const kindItems = (draft.expressions ?? [])
                  .map((ex, i) => ({ ex, i }))
                  .filter(({ ex }) => normalizePortraitKind(ex.kind) === kind);
                const kindLabel = kind === 'version' ? '버전' : '표정';
                const kindEn = kind === 'version' ? 'VERSION' : 'EXPRESSION';
                return (
                  <section key={kind} className="trpg-inv-section">
                    <div className="trpg-inv-section__head">
                      <h4 className="trpg-inv-section__label">
                        {kindLabel}
                        <span className="trpg-inv-section__label-en">{kindEn}</span>
                      </h4>
                      <div className="trpg-inv-expr-edit__tools">
                        {kindItems.length > 0 && (draft.stageImg || draft.img) ? (
                          <button
                            type="button"
                            className="btn-edit"
                            onClick={() => {
                              const frame = portraitFrameFromDefault(draft);
                              updateDraft({
                                expressions: (draft.expressions ?? []).map((ex) =>
                                  normalizePortraitKind(ex.kind) === kind
                                    ? { ...ex, ...frame, imgFrame: { ...frame.imgFrame } }
                                    : ex,
                                ),
                              });
                            }}
                          >
                            기본 프레임 일괄 적용
                          </button>
                        ) : null}
                        <button type="button" className="btn-edit" onClick={() => addExpression(kind)}>
                          + {kindLabel}
                        </button>
                      </div>
                    </div>
                    <p className="trpg-inv-section__hint">
                      {kind === 'version'
                        ? '의상·연령 등 다른 버전 일러스트입니다. 스테이지 왼쪽에서 › 로 전환해 고릅니다.'
                        : '같은 버전의 표정 일러스트입니다. 「기본 프레임 맞추기」는 스테이지 위치·확대를 복사합니다.'}
                    </p>
                    {kindItems.map(({ ex, i }) => {
                      const open = expandedExprIds.includes(ex.id);
                      const label = ex.label?.trim() || `${kindLabel} ${i + 1}`;
                      return (
                        <div key={ex.id} className={`trpg-inv-expr-edit${open ? ' is-open' : ''}`}>
                          <div className="trpg-inv-expr-edit__summary">
                            <button
                              type="button"
                              className="trpg-inv-expr-edit__toggle"
                              onClick={() => toggleExpressionExpanded(ex.id)}
                              aria-expanded={open}
                            >
                              <span className="trpg-inv-expr-edit__chevron" aria-hidden="true">
                                {open ? '▾' : '▸'}
                              </span>
                              {ex.img ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img className="trpg-inv-expr-edit__thumb" src={ex.img} alt="" />
                              ) : (
                                <span className="trpg-inv-expr-edit__thumb is-empty">?</span>
                              )}
                              <span className="trpg-inv-expr-edit__summary-text">
                                <strong>{label}</strong>
                                <em>{ex.img ? '이미지 설정됨' : '이미지 없음'}</em>
                              </span>
                            </button>
                            <button
                              type="button"
                              className="btn-del"
                              onClick={() => removeExpression(i)}
                              aria-label={`${label} 삭제`}
                            >
                              ✕
                            </button>
                          </div>
                          {open ? (
                            <div className="trpg-inv-expr-edit__body">
                              <div className="trpg-inv-expr-edit__row">
                                <input
                                  className="trpg-inv-edit-field"
                                  placeholder={
                                    kind === 'version' ? '라벨 (교복, 사복…)' : '라벨 (미소, 진지…)'
                                  }
                                  value={ex.label || ''}
                                  onChange={(e) => updateExpression(i, { label: e.target.value })}
                                />
                              </div>
                              <ImageFileField
                                label=""
                                value={ex.img || ''}
                                folder="site/trpg/players"
                                uploading={uploading}
                                onUploadStart={onUploadStart}
                                onUploadEnd={onUploadEnd}
                                onChange={(img) =>
                                  updateExpression(i, {
                                    img,
                                    kind,
                                    ...portraitFrameFromDefault(draft),
                                  })
                                }
                              />
                              {ex.img ? (
                                <>
                                  <div className="trpg-inv-expr-edit__frame trpg-inv-img-frame-editor">
                                    <ImageFrameEditor
                                      key={`${ex.id}-${ex.imgFrame?.scale ?? 1}-${ex.imgFrame?.x ?? 0}-${ex.imgFrame?.y ?? 0}-${ex.imgPos || DEFAULT_PORTRAIT_POS}`}
                                      src={ex.img}
                                      value={ex.imgFrame}
                                      onChange={(imgFrame) => updateExpression(i, { imgFrame })}
                                      fit={ex.imgFit || draft.imgFit || DEFAULT_PORTRAIT_FIT}
                                      pos={ex.imgPos || draft.imgPos || DEFAULT_PORTRAIT_POS}
                                      aspectRatio="3 / 4"
                                      allowWheelZoom
                                    />
                                  </div>
                                  <div className="trpg-inv-expr-edit__tools">
                                    <button
                                      type="button"
                                      className="btn-edit"
                                      onClick={() => applyDefaultFrameToExpression(i)}
                                      disabled={!(draft.stageImg || draft.img)}
                                    >
                                      기본 프레임 맞추기
                                    </button>
                                  </div>
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </section>
                );
              })}

              <section className="trpg-inv-section">
                <div className="trpg-inv-section__head">
                  <h4 className="trpg-inv-section__label">기본 정보</h4>
                  <button type="button" className="btn-edit" onClick={addInfoField}>
                    + 항목
                  </button>
                </div>
                {(draft.infoFields ?? []).map((field, i) => (
                  <div key={i} className="trpg-inv-info-field-row">
                    <button type="button" className="btn-edit" onClick={() => moveInfoField(i, -1)} disabled={i === 0} aria-label="위로">
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-edit"
                      onClick={() => moveInfoField(i, 1)}
                      disabled={i === (draft.infoFields ?? []).length - 1}
                      aria-label="아래로"
                    >
                      ↓
                    </button>
                    <input
                      className="trpg-inv-edit-field trpg-inv-info-field-key"
                      placeholder="항목명"
                      value={field.key}
                      onChange={(e) => updateInfoField(i, { key: e.target.value })}
                    />
                    <span className="trpg-inv-info-field-sep">·</span>
                    <input
                      className="trpg-inv-edit-field trpg-inv-info-field-val"
                      placeholder="내용"
                      value={field.value}
                      onChange={(e) => updateInfoField(i, { value: e.target.value })}
                    />
                    <button type="button" className="btn-del" onClick={() => removeInfoField(i)}>
                      ✕
                    </button>
                  </div>
                ))}
              </section>

              <ProfileTextEdit
                section="appearance"
                value={draft.appearance || ''}
                onChange={(appearance) => updateDraft({ appearance })}
                placeholder="외모·복장 등"
                rows={4}
              />

              <ProfileTextEdit
                section="personality"
                value={draft.personality || ''}
                onChange={(personality) => updateDraft({ personality })}
                placeholder="성격·말투 등"
                rows={4}
              />

              <ProfileTextEdit
                section="traits"
                value={draft.traits || ''}
                onChange={(traits) => updateDraft({ traits })}
                placeholder="버릇·특기 등"
                rows={3}
              />

              <LikeHateEdit
                likes={draft.likes || ''}
                dislikes={draft.dislikes || ''}
                onChangeLikes={(likes) => updateDraft({ likes })}
                onChangeDislikes={(dislikes) => updateDraft({ dislikes })}
              />

              <section className="trpg-inv-section">
                <div className="trpg-inv-section__head">
                  <h4 className="trpg-inv-section__label">능력치</h4>
                  <button type="button" className="btn-edit" onClick={addStat}>
                    + 능력치
                  </button>
                </div>
                <div className="trpg-inv-stat-edit">
                  {(draft.stats ?? []).map((stat, i) => (
                    <div key={i} className="trpg-inv-stat-edit-box">
                      <input
                        className="trpg-inv-edit-field trpg-inv-stat-edit-box__label"
                        value={stat.label}
                        onChange={(e) => updateStat(i, { label: e.target.value })}
                      />
                      <input
                        className="trpg-inv-edit-field"
                        type="number"
                        min={0}
                        value={stat.value}
                        onChange={(e) => updateStat(i, { value: Number(e.target.value) || 0 })}
                      />
                      <button type="button" className="btn-del trpg-inv-stat-edit-box__del" onClick={() => removeStat(i)}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <ProfileTextEdit
                section="bio"
                value={draft.bio || ''}
                onChange={(bio) => updateDraft({ bio })}
                placeholder="캐릭터 배경·설정"
                rows={5}
              />

              <section className="trpg-inv-section">
                <h4 className="trpg-inv-section__label">소지품</h4>
                <div className="trpg-inv-edit-row">
                  <label>소지금</label>
                  <input
                    className="trpg-inv-edit-field"
                    placeholder="34,000 ¥"
                    value={draft.money || ''}
                    onChange={(e) => updateDraft({ money: e.target.value })}
                  />
                </div>
                {(draft.items ?? []).map((item, i) => (
                  <div key={item.id} className="trpg-inv-item-edit">
                    <div className="trpg-inv-item-edit__row">
                      <input
                        className="trpg-inv-edit-field trpg-inv-item-edit__icon"
                        placeholder="🔦"
                        value={item.icon || ''}
                        onChange={(e) => updateItem(i, { icon: e.target.value })}
                      />
                      <input
                        className="trpg-inv-edit-field"
                        placeholder="이름"
                        value={item.name}
                        onChange={(e) => updateItem(i, { name: e.target.value })}
                      />
                      <input
                        className="trpg-inv-edit-field trpg-inv-item-edit__count"
                        placeholder="×1"
                        value={item.count || ''}
                        onChange={(e) => updateItem(i, { count: e.target.value })}
                      />
                      <label className="trpg-inv-item-edit__key">
                        <input
                          type="checkbox"
                          checked={!!item.key}
                          onChange={(e) => updateItem(i, { key: e.target.checked })}
                        />
                        중요
                      </label>
                      <button type="button" className="btn-del" onClick={() => removeItem(i)}>
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" className="trpg-inv-add-btn" onClick={addItem}>
                  + 소지품 추가
                </button>
                <div className="trpg-inv-edit-row" style={{ marginTop: 10 }}>
                  <label>메모</label>
                  <textarea
                    className="trpg-inv-edit-field"
                    rows={2}
                    placeholder="소지품 관련 메모"
                    value={draft.itemNote || ''}
                    onChange={(e) => updateDraft({ itemNote: e.target.value })}
                  />
                </div>
              </section>

              <section className="trpg-inv-section">
                <h4 className="trpg-inv-section__label">관계</h4>
                {(draft.relations ?? []).map((rel, i) => {
                  const linked = resolveRelationPlayer(rel);
                  return (
                    <div key={rel.id} className="trpg-inv-rel-edit">
                      <div className="trpg-inv-rel-edit-row">
                        <label>탐사자</label>
                        <select
                          className="trpg-inv-edit-field"
                          value={rel.playerId || ''}
                          onChange={(e) => selectRelationPlayer(i, e.target.value)}
                        >
                          <option value="">선택…</option>
                          {relationCandidates.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="trpg-inv-rel-edit-row">
                        <label>설명</label>
                        <input
                          className="trpg-inv-edit-field"
                          value={rel.desc || ''}
                          onChange={(e) => updateRelation(i, { desc: e.target.value })}
                          placeholder="관계 설명"
                        />
                      </div>
                      {linked ? (
                        <button
                          type="button"
                          className="trpg-inv-rel-preview"
                          onClick={() => openInvestigatorProfile(linked.id)}
                        >
                          {linked.img ? (
                            <span className="trpg-inv-rel-preview__av">
                              <InvestigatorCardImage player={linked} />
                            </span>
                          ) : (
                            <span className="trpg-inv-rel-preview__av trpg-inv-rel-preview__av--ph">
                              {linked.name[0] || '?'}
                            </span>
                          )}
                          <span className="trpg-inv-rel-preview__meta">
                            <span className="trpg-inv-rel-preview__name">{linked.name}</span>
                            {linked.nameEn ? (
                              <span className="trpg-inv-rel-preview__sub">{linked.nameEn}</span>
                            ) : null}
                          </span>
                        </button>
                      ) : null}
                      <div className="trpg-inv-rel-edit__actions">
                        <button type="button" className="btn-del" onClick={() => removeRelation(i)}>
                          삭제
                        </button>
                      </div>
                    </div>
                  );
                })}
                <button type="button" className="trpg-inv-add-btn" onClick={addRelation}>
                  + 관계 추가
                </button>
              </section>
            </div>
          ) : (
            <>
              <div className="inv-panel-tabs" role="tablist" aria-label="탐사자 정보 탭">
                {INV_VIEW_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={viewTab === t.id}
                    className={`inv-panel-tab${viewTab === t.id ? ' active' : ''}`}
                    onClick={() => setViewTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="trpg-inv-detail__tab-body" key={viewTab}>
                {viewTab === 'profile' ? (
                  <>
                    {view.infoFields?.length ? (
                      <div className="psection">
                        <div className="plabel">기본 정보</div>
                        <div className="info-grid">
                          {view.infoFields.map((field) => (
                            <div key={`${field.key}-${field.value}`} className="info-row">
                              <label>{field.key}</label>
                              <span>{field.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <ProfileTextBlock section="appearance" text={view.appearance} />
                    <ProfileTextBlock section="personality" text={view.personality} />
                    <ProfileTextBlock section="traits" text={view.traits} />
                    <LikeHateView likes={view.likes} dislikes={view.dislikes} />
                  </>
                ) : null}

                {viewTab === 'background' ? <ProfileTextBlock section="bio" text={view.bio} /> : null}

                {viewTab === 'stats' ? (
                  view.stats?.length ? (
                    <div className="psection">
                      <div className="plabel">능력치</div>
                      <div className="stats">
                        {view.stats.map((stat) => (
                          <div key={stat.label} className="sbox">
                            <div className="slabel">{stat.label}</div>
                            <div className="sval">
                              {stat.value}
                              {stat.max != null ? <span className="smax"> / {stat.max}</span> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="trpg-inv-detail__empty">등록된 능력치가 없습니다.</p>
                  )
                ) : null}

                {viewTab === 'items' ? (
                  <div className="psection">
                    <div className="plabel">소지금</div>
                    <div className="money-row">
                      <span className="money-label">현재 소지금</span>
                      <span className="money-val">{view.money || '—'}</span>
                    </div>
                    <div className="plabel" style={{ marginTop: 12 }}>
                      소지품
                    </div>
                    <div className="items-grid">
                      {padItemSlots(view.items).map((item) =>
                        item.empty ? (
                          <div key={item.id} className="item-slot empty">
                            <div className="item-icon">·</div>
                            <div className="item-name">—</div>
                          </div>
                        ) : (
                          <div key={item.id} className={`item-slot${item.key ? ' key' : ''}`}>
                            <div className="item-icon">{item.icon || '📦'}</div>
                            <div className="item-name">{item.name}</div>
                            {item.count ? <div className="item-count">{item.count}</div> : null}
                          </div>
                        ),
                      )}
                    </div>
                    {view.itemNote ? <div className="item-note">📌 {view.itemNote}</div> : null}
                  </div>
                ) : null}

                {viewTab === 'relations' ? (
                  view.relations?.length ? (
                    <div className="psection">
                      <div className="plabel">관계</div>
                      <div className="rel-list">
                        {view.relations.map((rel) => {
                          const linked = resolveRelationPlayer(rel);
                          const label = linked?.name || rel.name;
                          const RowTag = linked ? 'button' : 'div';
                          return (
                            <RowTag
                              key={rel.id}
                              type={linked ? 'button' : undefined}
                              className={`rel-item${linked ? ' rel-item--link' : ''}`}
                              onClick={linked ? () => openInvestigatorProfile(linked.id) : undefined}
                            >
                              {linked?.img ? (
                                <span className="rel-av rel-av--img">
                                  <InvestigatorCardImage player={linked} />
                                </span>
                              ) : (
                                <div className="rel-av">{label[0] || '?'}</div>
                              )}
                              <div>
                                <div className="rel-name">{label}</div>
                                {rel.desc ? <div className="rel-desc">{rel.desc}</div> : null}
                              </div>
                            </RowTag>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="trpg-inv-detail__empty">등록된 관계가 없습니다.</p>
                  )
                ) : null}
              </div>
            </>
          )}
        </TrpgInvestigatorDetail>
      ) : null}
    </div>
  );
}
