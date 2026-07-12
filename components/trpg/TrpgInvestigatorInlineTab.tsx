'use client';

import { ImageFileField } from '@/components/ui/ImageFileField';
import { LikeHateEdit } from '@/components/trpg/TrpgInvestigatorLikeHate';
import { ImageFrameEditor } from '@/components/ui/ImageFrameEditor';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { movePlayerInList, playerOrderMeta } from '@/lib/trpg/playerOrder';
import { newId } from '@/lib/types/site-content';
import type { TrpgPlayerProfile, TrpgRelationship } from '@/lib/types/site-content';

type Props = {
  players: TrpgPlayerProfile[];
  relationships: TrpgRelationship[];
  relationshipNotes: string;
  uploading: boolean;
  onUploadStart: () => void;
  onUploadEnd: () => void;
  onChangePlayers: (players: TrpgPlayerProfile[]) => void;
  onChangeRelationships: (relationships: TrpgRelationship[]) => void;
  onChangeRelationshipNotes: (notes: string) => void;
};

export function TrpgInvestigatorInlineTab({
  players,
  relationships,
  relationshipNotes,
  uploading,
  onUploadStart,
  onUploadEnd,
  onChangePlayers,
  onChangeRelationships,
  onChangeRelationshipNotes,
}: Props) {
  const { confirm } = useLakeDialog();

  function updatePlayer(id: string, patch: Partial<TrpgPlayerProfile>) {
    onChangePlayers(players.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removePlayer(id: string) {
    onChangePlayers(players.filter((p) => p.id !== id));
    onChangeRelationships(relationships.filter((r) => r.fromId !== id && r.toId !== id));
  }

  async function confirmRemovePlayer(id: string) {
    if (!(await confirm('이 탐사자를 삭제할까요?'))) return;
    removePlayer(id);
  }

  function addPlayer() {
    onChangePlayers([...players, { id: newId(), name: '탐사자', role: 'HO' }]);
  }

  function movePlayer(id: string, direction: -1 | 1) {
    onChangePlayers(movePlayerInList(players, id, direction));
  }

  function updateRelation(id: string, patch: Partial<TrpgRelationship>) {
    onChangeRelationships(relationships.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRelation(id: string) {
    onChangeRelationships(relationships.filter((r) => r.id !== id));
  }

  function addRelation() {
    const rel: TrpgRelationship = {
      id: newId(),
      fromId: players[0]?.id ?? '',
      toId: players[1]?.id ?? players[0]?.id ?? '',
      label: '',
    };
    onChangeRelationships([...relationships, rel]);
  }

  function playerName(id: string) {
    return players.find((p) => p.id === id)?.name || '—';
  }

  return (
    <>
      <div className="trpg-edit-section">
        <div className="trpg-edit-section__title">탐사자 프로필</div>
        <div className="trpg-edit-card-list">
          {players.map((player, index) => {
            const order = playerOrderMeta(players, player.id);
            return (
            <div key={player.id} className="trpg-edit-card-item">
              <div className="trpg-edit-card-item__head">
                <span className="trpg-edit-card-item__label">
                  {player.name || `탐사자 ${index + 1}`}
                  {players.length > 1 ? (
                    <span className="trpg-edit-card-item__order"> · {order.index + 1}/{order.total}</span>
                  ) : null}
                </span>
                <div className="trpg-edit-card-item__actions">
                  {players.length > 1 ? (
                    <span className="trpg-player-order-controls">
                      <button
                        type="button"
                        className="trpg-player-order-btn"
                        disabled={!order.canUp}
                        aria-label="앞으로"
                        onClick={() => movePlayer(player.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="trpg-player-order-btn"
                        disabled={!order.canDown}
                        aria-label="뒤로"
                        onClick={() => movePlayer(player.id, 1)}
                      >
                        ↓
                      </button>
                    </span>
                  ) : null}
                  <button type="button" className="trpg-edit-mini-del" onClick={() => void confirmRemovePlayer(player.id)}>
                    ✕
                  </button>
                </div>
              </div>
              <div className="trpg-edit-row col2">
                <div className="trpg-edit-field">
                  <label>이름 (한글)</label>
                  <input
                    className="form-input"
                    value={player.name}
                    onChange={(e) => updatePlayer(player.id, { name: e.target.value })}
                  />
                </div>
                <div className="trpg-edit-field">
                  <label>이름 (영문)</label>
                  <input
                    className="form-input"
                    value={player.nameEn || ''}
                    placeholder={player.name.toUpperCase()}
                    onChange={(e) => updatePlayer(player.id, { nameEn: e.target.value })}
                  />
                </div>
              </div>
              <div className="trpg-edit-field">
                <label>대표 한마디</label>
                <input
                  className="form-input"
                  placeholder="캐릭터를 한 줄로…"
                  value={player.quote || ''}
                  onChange={(e) => updatePlayer(player.id, { quote: e.target.value })}
                />
              </div>
              <div className="trpg-edit-field">
                <label>프로필 이미지</label>
                <ImageFileField
                  label=""
                  value={player.img || ''}
                  folder="site/trpg/investigators"
                  uploading={uploading}
                  onUploadStart={onUploadStart}
                  onUploadEnd={onUploadEnd}
                  onChange={(img) => updatePlayer(player.id, { img, imgFrame: undefined })}
                />
                {player.img ? (
                  <div className="trpg-inv-img-frame-editor">
                    <ImageFrameEditor
                      src={player.img}
                      value={player.imgFrame}
                      onChange={(imgFrame) => updatePlayer(player.id, { imgFrame })}
                      fit={player.imgFit || 'cover'}
                      pos={player.imgPos || 'center top'}
                      aspectRatio="3 / 4"
                      allowWheelZoom={false}
                    />
                  </div>
                ) : null}
              </div>
              <div className="trpg-edit-field">
                <label>표정 · 버전</label>
                {(player.expressions ?? []).map((ex, i) => (
                  <div key={ex.id} className="trpg-inv-expr-edit" style={{ marginTop: 8 }}>
                    <div className="trpg-edit-row col2">
                      <input
                        className="form-input"
                        placeholder="라벨"
                        value={ex.label || ''}
                        onChange={(e) => {
                          const expressions = [...(player.expressions ?? [])];
                          expressions[i] = { ...expressions[i], label: e.target.value };
                          updatePlayer(player.id, { expressions });
                        }}
                      />
                      <button
                        type="button"
                        className="trpg-edit-mini-del"
                        onClick={() => {
                          updatePlayer(player.id, {
                            expressions: (player.expressions ?? []).filter((_, idx) => idx !== i),
                          });
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    <ImageFileField
                      label=""
                      value={ex.img || ''}
                      folder="site/trpg/investigators"
                      uploading={uploading}
                      onUploadStart={onUploadStart}
                      onUploadEnd={onUploadEnd}
                      onChange={(img) => {
                        const expressions = [...(player.expressions ?? [])];
                        expressions[i] = { ...expressions[i], img, imgFrame: undefined };
                        updatePlayer(player.id, { expressions });
                      }}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="trpg-edit-add-btn"
                  style={{ marginTop: 8 }}
                  onClick={() =>
                    updatePlayer(player.id, {
                      expressions: [...(player.expressions ?? []), { id: newId(), label: '표정', img: '' }],
                    })
                  }
                >
                  + 표정 추가
                </button>
              </div>
              <div className="trpg-edit-field">
                <label>외관</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={player.appearance || ''}
                  onChange={(e) => updatePlayer(player.id, { appearance: e.target.value })}
                />
              </div>
              <div className="trpg-edit-field">
                <label>성격</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={player.personality || ''}
                  onChange={(e) => updatePlayer(player.id, { personality: e.target.value })}
                />
              </div>
              <div className="trpg-edit-field">
                <label>특징</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={player.traits || ''}
                  onChange={(e) => updatePlayer(player.id, { traits: e.target.value })}
                />
              </div>
              <LikeHateEdit
                variant="inline"
                likes={player.likes || ''}
                dislikes={player.dislikes || ''}
                onChangeLikes={(likes) => updatePlayer(player.id, { likes })}
                onChangeDislikes={(dislikes) => updatePlayer(player.id, { dislikes })}
              />
              <div className="trpg-edit-field">
                <label>배경</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="캐릭터 배경·설정"
                  value={player.bio || ''}
                  onChange={(e) => updatePlayer(player.id, { bio: e.target.value })}
                />
              </div>
            </div>
            );
          })}
        </div>
        <button type="button" className="trpg-edit-add-btn" onClick={addPlayer}>
          + 탐사자 추가
        </button>
      </div>

      <div className="trpg-edit-section">
        <div className="trpg-edit-section__title">탐사자 관계</div>
        <div className="trpg-edit-card-list">
          {relationships.map((rel, index) => (
            <div key={rel.id} className="trpg-edit-card-item">
              <div className="trpg-edit-card-item__head">
                <span className="trpg-edit-card-item__label">
                  {playerName(rel.fromId)} → {playerName(rel.toId)}
                  {!rel.fromId && !rel.toId ? `관계 ${index + 1}` : null}
                </span>
                <button type="button" className="trpg-edit-mini-del" onClick={() => removeRelation(rel.id)}>
                  ✕
                </button>
              </div>
              <div className="trpg-edit-row col2">
                <div className="trpg-edit-field">
                  <label>출발</label>
                  <select
                    className="form-input"
                    value={rel.fromId}
                    onChange={(e) => updateRelation(rel.id, { fromId: e.target.value })}
                  >
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="trpg-edit-field">
                  <label>대상</label>
                  <select
                    className="form-input"
                    value={rel.toId}
                    onChange={(e) => updateRelation(rel.id, { toId: e.target.value })}
                  >
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="trpg-edit-field">
                <label>관계 설명</label>
                <input
                  className="form-input"
                  value={rel.label || ''}
                  placeholder="친구"
                  onChange={(e) => updateRelation(rel.id, { label: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="trpg-edit-add-btn" onClick={addRelation} disabled={players.length < 1}>
          + 관계 추가
        </button>
      </div>

      <div className="trpg-edit-section">
        <div className="trpg-edit-section__title">관계도 메모</div>
        <div className="trpg-edit-field">
          <textarea
            className="form-input"
            rows={4}
            placeholder="관계도 전체 메모"
            value={relationshipNotes}
            onChange={(e) => onChangeRelationshipNotes(e.target.value)}
          />
        </div>
      </div>
    </>
  );
}
