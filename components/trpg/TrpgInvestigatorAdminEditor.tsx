'use client';

import { useState } from 'react';
import { ImageFileField } from '@/components/ui/ImageFileField';
import { ImageFrameEditor } from '@/components/ui/ImageFrameEditor';
import { InvestigatorCardImage, InvestigatorPortraitImage } from '@/components/trpg/TrpgInvestigatorImage';
import { LikeHateEdit, LikeHateView } from '@/components/trpg/TrpgInvestigatorLikeHate';
import { mergePlayerInfoFields, DEFAULT_PLAYER_INFO_FIELDS } from '@/lib/trpg/defaultPlayerInfo';
import { newId } from '@/lib/types/site-content';
import type {
  TrpgPlayerInfoField,
  TrpgPlayerProfile,
  TrpgPlayerRelation,
  TrpgPlayerStat,
} from '@/lib/types/site-content';

type Props = {
  players: TrpgPlayerProfile[];
  uploading: boolean;
  onUploadStart: () => void;
  onUploadEnd: () => void;
  onChange: (players: TrpgPlayerProfile[]) => void;
};

function emptyPlayer(): TrpgPlayerProfile {
  return {
    id: newId(),
    name: '탐사자',
    nameEn: '',
    tags: [],
    infoFields: DEFAULT_PLAYER_INFO_FIELDS.map((f) => ({ ...f })),
    stats: [],
    relations: [],
  };
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

export function TrpgInvestigatorAdminEditor({
  players,
  uploading,
  onUploadStart,
  onUploadEnd,
  onChange,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(players[0]?.id ?? null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TrpgPlayerProfile | null>(null);

  const active = players.find((p) => p.id === activeId) ?? null;
  const view = editing && draft ? draft : active;

  function updatePlayers(next: TrpgPlayerProfile[]) {
    onChange(next);
    if (activeId && !next.some((p) => p.id === activeId)) {
      setActiveId(next[0]?.id ?? null);
      setEditing(false);
      setDraft(null);
    }
  }

  function patchPlayer(id: string, patch: Partial<TrpgPlayerProfile>) {
    updatePlayers(players.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function startEdit(player: TrpgPlayerProfile) {
    setDraft({ ...player });
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

  function removePlayer(id: string) {
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

  return (
    <div className="trpg-inv-admin-editor trpg-inv-archive">
      <div className="wrap">
      <div className={`grid-area lh-scroll${view ? ' shrunk' : ''}`}>
        {players.map((player) => (
          <button
            key={player.id}
            type="button"
            className={`inv-card${player.id === activeId ? ' active' : ''}`}
            onClick={() => {
              setActiveId(player.id);
              setEditing(false);
              setDraft(null);
            }}
          >
            {player.img ? (
              <InvestigatorCardImage player={player} />
            ) : (
              <div className="card-img-placeholder">{player.name[0] || '?'}</div>
            )}
            <div className="card-bottom">
              <span className="card-name-ko">{player.name}</span>
              <span className="card-name-en">
                {player.nameEn?.trim() ||
                  (player.role?.trim() && !/[가-힣]/.test(player.role) ? player.role : player.name.toUpperCase())}
              </span>
              <CardDeco />
            </div>
          </button>
        ))}
        <button
          type="button"
          className="btn-edit"
          style={{ gridColumn: '1 / -1', justifySelf: 'start' }}
          onClick={() => {
            const p = emptyPlayer();
            updatePlayers([...players, p]);
            setActiveId(p.id);
            startEdit(p);
          }}
        >
          + 탐사자
        </button>
      </div>

      <div className={`profile-panel${view ? ' open' : ''}`}>
        {view ? (
          <div className="panel-inner lh-scroll">
            <div className="panel-topbar">
              <span className="panel-topbar-title">{editing ? '수정 모드' : 'INVESTIGATOR'}</span>
              <div className="topbar-btns">
                {editing ? (
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
                    <button type="button" className="btn" onClick={() => removePlayer(view.id)}>
                      삭제
                    </button>
                  </>
                )}
              </div>
            </div>

            {editing && draft ? (
              <>
                <section className="trpg-inv-section">
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
                </section>

                <section className="trpg-inv-section">
                  <h4 className="trpg-inv-section__label">프로필 이미지</h4>
                  <ImageFileField
                    label=""
                    value={draft.img || ''}
                    folder="site/trpg/players"
                    uploading={uploading}
                    onUploadStart={onUploadStart}
                    onUploadEnd={onUploadEnd}
                    onChange={(img) => updateDraft({ img, imgFrame: undefined })}
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
                        allowWheelZoom={false}
                      />
                    </div>
                  ) : null}
                </section>

                <section className="trpg-inv-section">
                  <h4 className="trpg-inv-section__label">태그</h4>
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
                </section>

                <section className="trpg-inv-section">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <h4 className="trpg-inv-section__label" style={{ margin: 0 }}>
                      기본 정보
                    </h4>
                    <button type="button" className="btn-edit" onClick={addInfoField}>
                      + 항목
                    </button>
                  </div>
                  {(draft.infoFields ?? []).map((field, i) => (
                    <div key={i} className="trpg-inv-info-field-row">
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
                      <button type="button" className="btn-del" style={{ padding: '4px 8px' }} onClick={() => removeInfoField(i)}>
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
                    value={draft.appearance || ''}
                    onChange={(e) => updateDraft({ appearance: e.target.value })}
                  />
                </section>

                <section className="trpg-inv-section">
                  <h4 className="trpg-inv-section__label">성격</h4>
                  <textarea
                    className="trpg-inv-edit-field"
                    rows={3}
                    value={draft.personality || ''}
                    onChange={(e) => updateDraft({ personality: e.target.value })}
                  />
                </section>

                <section className="trpg-inv-section">
                  <h4 className="trpg-inv-section__label">특징</h4>
                  <textarea
                    className="trpg-inv-edit-field"
                    rows={3}
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <h4 className="trpg-inv-section__label" style={{ margin: 0 }}>
                      능력치
                    </h4>
                    <button type="button" className="btn-edit" onClick={addStat}>
                      + 능력치
                    </button>
                  </div>
                  <div className="trpg-inv-stat-edit">
                    {(draft.stats ?? []).map((stat, i) => (
                      <div key={i} className="trpg-inv-stat-edit-box">
                        <input
                          className="trpg-inv-edit-field"
                          style={{ marginBottom: 4, fontSize: 10, textAlign: 'center' }}
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
                        <button type="button" className="btn-del" style={{ marginTop: 4, width: '100%', padding: '3px 0' }} onClick={() => removeStat(i)}>
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
                    value={draft.bio || ''}
                    onChange={(e) => updateDraft({ bio: e.target.value })}
                  />
                </section>

                <section className="trpg-inv-section">
                  <h4 className="trpg-inv-section__label">관계</h4>
                  {(draft.relations ?? []).map((rel, i) => (
                    <div key={rel.id} className="trpg-inv-rel-edit">
                      <div className="trpg-inv-rel-edit-row">
                        <label>이름</label>
                        <input
                          className="trpg-inv-edit-field"
                          value={rel.name}
                          onChange={(e) => updateRelation(i, { name: e.target.value })}
                        />
                      </div>
                      <div className="trpg-inv-rel-edit-row">
                        <label>설명</label>
                        <input
                          className="trpg-inv-edit-field"
                          value={rel.desc || ''}
                          onChange={(e) => updateRelation(i, { desc: e.target.value })}
                        />
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <button type="button" className="btn-del" onClick={() => removeRelation(i)}>
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                  <button type="button" className="trpg-inv-add-btn" onClick={addRelation}>
                    + 관계 추가
                  </button>
                </section>
              </>
            ) : (
              <>
                <div className="ph">
                  <InvestigatorPortraitImage player={view} />
                  <div className="ph-meta">
                    <div className="ph-name">{view.name}</div>
                    <div className="ph-name-en">
                      {view.nameEn?.trim() ||
                        (view.role?.trim() && !/[가-힣]/.test(view.role) ? view.role : view.name.toUpperCase())}
                    </div>
                    <CardDeco />
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
                {view.appearance ? (
                  <div className="psection">
                    <div className="plabel">외관</div>
                    <p className="bg-text">{view.appearance}</p>
                  </div>
                ) : null}
                {view.personality ? (
                  <div className="psection">
                    <div className="plabel">성격</div>
                    <p className="bg-text">{view.personality}</p>
                  </div>
                ) : null}
                {view.traits ? (
                  <div className="psection">
                    <div className="plabel">특징</div>
                    <p className="bg-text">{view.traits}</p>
                  </div>
                ) : null}
                <LikeHateView likes={view.likes} dislikes={view.dislikes} />
                {view.stats?.length ? (
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
                {view.bio ? (
                  <div className="psection">
                    <div className="plabel">배경</div>
                    <p className="bg-text">{view.bio}</p>
                  </div>
                ) : null}
                {view.relations?.length ? (
                  <div className="psection">
                    <div className="plabel">관계</div>
                    <div className="rel-list">
                      {view.relations.map((rel) => (
                        <div key={rel.id} className="rel-item">
                          <div className="rel-av">{rel.name[0]}</div>
                          <div>
                            <div className="rel-name">{rel.name}</div>
                            {rel.desc ? <div className="rel-desc">{rel.desc}</div> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
      </div>
    </div>
  );
}
