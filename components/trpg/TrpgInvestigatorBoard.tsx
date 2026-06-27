'use client';

import { useState } from 'react';
import { ImageFileField } from '@/components/ui/ImageFileField';
import { ImageFrameEditor } from '@/components/ui/ImageFrameEditor';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { InvestigatorCardImage, InvestigatorPortraitImage } from '@/components/trpg/TrpgInvestigatorImage';
import { LikeHateEdit, LikeHateView } from '@/components/trpg/TrpgInvestigatorLikeHate';
import { mergePlayerInfoFields } from '@/lib/trpg/defaultPlayerInfo';
import { newId } from '@/lib/types/site-content';
import type {
  TrpgPlayerInfoField,
  TrpgPlayerItem,
  TrpgPlayerProfile,
  TrpgPlayerRelation,
  TrpgPlayerStat,
} from '@/lib/types/site-content';

type InvViewTab = 'profile' | 'background' | 'stats' | 'items' | 'relations';

const INV_VIEW_TABS: { id: InvViewTab; label: string }[] = [
  { id: 'profile', label: '프로필' },
  { id: 'background', label: '배경' },
  { id: 'stats', label: '능력치' },
  { id: 'items', label: '소지품' },
  { id: 'relations', label: '관계' },
];

function ProfileTextBlock({ label, text }: { label: string; text?: string }) {
  if (!text?.trim()) return null;
  return (
    <div className="psection">
      <div className="plabel">{label}</div>
      <p className="bg-text">{text}</p>
    </div>
  );
}

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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<InvViewTab>('profile');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TrpgPlayerProfile | null>(null);

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
    setActiveId((prev) => (prev === id ? null : id));
    setViewTab('profile');
    setEditing(false);
    setDraft(null);
  }

  function openInvestigatorProfile(id: string) {
    if (!players.some((p) => p.id === id)) return;
    setActiveId(id);
    setEditing(false);
    setDraft(null);
  }

  function closePanel() {
    setActiveId(null);
    setEditing(false);
    setDraft(null);
  }

  function startEdit(player: TrpgPlayerProfile) {
    setDraft({ ...player, infoFields: mergePlayerInfoFields(player.infoFields) });
    setEditing(true);
  }

  function saveEdit() {
    if (!draft) return;
    patchPlayer(draft.id, draft);
    setEditing(false);
    setDraft(null);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft(null);
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

  const relationCandidates = draft ? players.filter((p) => p.id !== draft.id) : [];

  return (
    <div className={`trpg-inv-archive${editable ? ' trpg-inv-archive--editable' : ''}`}>
      <div className="wrap">
        <div className={`grid-area lh-scroll${active ? ' shrunk' : ''}`}>
          {players.map((player) => (
              <div key={player.id} className="inv-card-slot">
                <button
                  type="button"
                  className={`inv-card${player.id === activeId ? ' active' : ''}`}
                  onClick={() => openCard(player.id)}
                >
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
                </button>
              </div>
            ))}
        </div>

        <div className={`profile-panel${active ? ' open' : ''}`}>
          {view ? (
            <div className="panel-inner">
              <div className="panel-topbar">
                <span className="panel-topbar-title">{editing ? '수정 모드' : 'INVESTIGATOR'}</span>
                <div className="topbar-btns">
                  {editable ? (
                    editing ? (
                      <>
                        <button type="button" className="btn primary" onClick={saveEdit}>
                          저장
                        </button>
                        <button type="button" className="btn" onClick={cancelEdit}>
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="btn primary" onClick={() => startEdit(view)}>
                          ✏ 수정
                        </button>
                        <button type="button" className="btn" onClick={() => void removePlayer(view.id)}>
                          삭제
                        </button>
                        <button type="button" className="btn" onClick={closePanel}>
                          ✕
                        </button>
                      </>
                    )
                  ) : (
                    <button type="button" className="btn" onClick={closePanel}>
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div className="panel-scroll lh-scroll">
              {editing && draft ? (
                <div className="trpg-inv-edit-body">
                  <div className="trpg-inv-edit-intro">
                    <div className="trpg-inv-edit-intro__media">
                      <h4 className="trpg-inv-section__label">프로필 이미지</h4>
                      <ImageFileField
                        label=""
                        value={draft.img || ''}
                        folder="site/trpg/players"
                        uploading={uploading}
                        onUploadStart={onUploadStart}
                        onUploadEnd={onUploadEnd}
                        onChange={(img) => updateDraft({ img, imgFrame: undefined, imgFit: 'contain' })}
                      />
                      {draft.img ? (
                        <div className="trpg-inv-img-frame-editor">
                          <ImageFrameEditor
                            src={draft.img}
                            value={draft.imgFrame}
                            onChange={(imgFrame) => updateDraft({ imgFrame })}
                            fit={draft.imgFit || 'contain'}
                            pos={draft.imgPos || 'center top'}
                            aspectRatio="3 / 4"
                            allowWheelZoom={false}
                          />
                        </div>
                      ) : null}
                    </div>
                    <div className="trpg-inv-edit-intro__meta">
                      <h4 className="trpg-inv-section__label">이름</h4>
                      <div className="trpg-inv-edit-grid trpg-inv-edit-grid--stack">
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
                        <div className="trpg-inv-edit-row">
                          <label>플레이어</label>
                          <input
                            className="trpg-inv-edit-field"
                            placeholder="연기한 플레이어"
                            value={draft.playerName || ''}
                            onChange={(e) => updateDraft({ playerName: e.target.value })}
                          />
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

                  <section className="trpg-inv-section">
                    <h4 className="trpg-inv-section__label">외관</h4>
                    <textarea
                      className="trpg-inv-edit-field"
                      rows={3}
                      placeholder="외모·복장 등"
                      value={draft.appearance || ''}
                      onChange={(e) => updateDraft({ appearance: e.target.value })}
                    />
                  </section>

                  <section className="trpg-inv-section">
                    <h4 className="trpg-inv-section__label">성격</h4>
                    <textarea
                      className="trpg-inv-edit-field"
                      rows={3}
                      placeholder="성격·말투 등"
                      value={draft.personality || ''}
                      onChange={(e) => updateDraft({ personality: e.target.value })}
                    />
                  </section>

                  <section className="trpg-inv-section">
                    <h4 className="trpg-inv-section__label">특징</h4>
                    <textarea
                      className="trpg-inv-edit-field"
                      rows={3}
                      placeholder="버릇·특기 등"
                      value={draft.traits || ''}
                      onChange={(e) => updateDraft({ traits: e.target.value })}
                    />
                  </section>

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

                  <section className="trpg-inv-section">
                    <h4 className="trpg-inv-section__label">배경</h4>
                    <textarea
                      className="trpg-inv-edit-field"
                      rows={4}
                      placeholder="캐릭터 배경·설정"
                      value={draft.bio || ''}
                      onChange={(e) => updateDraft({ bio: e.target.value })}
                    />
                  </section>

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
                  <div className="ph">
                    <InvestigatorPortraitImage player={view} />
                    <div className="ph-meta">
                      <div className="ph-name">{view.name}</div>
                      <div className="ph-name-en">{investigatorCardSubtitle(view)}</div>
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
                    </div>
                  </div>

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
                      <ProfileTextBlock label="외관" text={view.appearance} />
                      <ProfileTextBlock label="성격" text={view.personality} />
                      <ProfileTextBlock label="특징" text={view.traits} />
                      <LikeHateView likes={view.likes} dislikes={view.dislikes} />
                    </>
                  ) : null}

                  {viewTab === 'background' ? <ProfileTextBlock label="배경" text={view.bio} /> : null}

                  {viewTab === 'stats' && view.stats?.length ? (
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

                  {viewTab === 'relations' && view.relations?.length ? (
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
                  ) : null}
                </>
              )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
