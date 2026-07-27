'use client';

import { ImageUploadCrop } from '@/components/ui/form/ImageUploadCrop';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { LakeToggle } from '@/components/ui/LakeToggle';
import { DEFAULT_AFFINITY_TIERS } from '@/lib/oc/ocChatAffinity';
import { resetOcChatForCharacter } from '@/lib/oc/ocChat';
import { OC_CHAT_DEFAULT_AVATAR } from '@/lib/oc/ocChatPrompt';
import type {
  OcChatAffinityTier,
  OcChatbotConfig,
  OcChatCirclePerson,
  OcChatEpisode,
  OcChatEpisodeChoice,
  OcChatEpisodeScene,
  OcChatFactRow,
  OcChatStickerFrequency,
  OcChatTypingBaseline,
} from '@/lib/types/character';
import { newId } from '@/lib/types/site-content';
import { useState } from 'react';

type Props = {
  value: OcChatbotConfig | undefined;
  onChange: (next: OcChatbotConfig) => void;
  /** 있으면 이 OC 채팅만 초기화 가능 */
  characterId?: string;
  characterName?: string;
};

function ensureTiers(cfg: OcChatbotConfig | undefined): OcChatAffinityTier[] {
  if (cfg?.affinityTiers?.length) return cfg.affinityTiers;
  return DEFAULT_AFFINITY_TIERS.map((t) => ({ ...t }));
}

export function OcChatbotEditor({ value, onChange, characterId, characterName }: Props) {
  const { confirm, alert } = useLakeDialog();
  const [resetting, setResetting] = useState(false);
  const cfg = value || {};
  const tiers = ensureTiers(cfg);
  const episodes = cfg.episodes || [];
  const selfFacts = cfg.selfFacts || [];
  const circle = cfg.circle || [];
  const typing = cfg.typingStyle || { baseline: 'steady' as const, flusterTrigger: [], flusterStyle: null };
  const stickers = cfg.stickerStyle || {
    usesStickers: false,
    frequency: null as null,
    allowedPackIds: [] as string[],
  };

  const patch = (partial: Partial<OcChatbotConfig>) => {
    onChange({ ...cfg, ...partial });
  };

  const resetChat = async () => {
    const id = String(characterId || '').trim();
    if (!id || resetting) return;
    const who = (characterName || '').trim() || '이 캐릭터';
    const ok = await confirm(
      `${who}의 채팅 기록·호감·스토리 진행만 삭제합니다.\n다른 OC에는 영향 없습니다.\n되돌릴 수 없습니다.`,
      '채팅 초기화',
    );
    if (!ok) return;
    setResetting(true);
    try {
      await resetOcChatForCharacter(id);
      await alert('채팅을 초기화했습니다. 상세를 새로고침하면 반영됩니다.', '완료');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '초기화에 실패했습니다';
      await alert(msg, '오류');
    } finally {
      setResetting(false);
    }
  };

  const setSelfFact = (i: number, next: OcChatFactRow) => {
    const list = [...selfFacts];
    list[i] = next;
    patch({ selfFacts: list });
  };

  const setCirclePerson = (i: number, next: OcChatCirclePerson) => {
    const list = [...circle];
    list[i] = next;
    patch({ circle: list });
  };

  const setCircleFact = (pi: number, fi: number, next: OcChatFactRow) => {
    const person = circle[pi];
    if (!person) return;
    const facts = [...(person.facts || [])];
    facts[fi] = next;
    setCirclePerson(pi, { ...person, facts });
  };

  const setTier = (i: number, next: OcChatAffinityTier) => {
    const list = [...tiers];
    list[i] = next;
    patch({ affinityTiers: list });
  };

  const setEpisode = (i: number, next: OcChatEpisode) => {
    const list = [...episodes];
    list[i] = next;
    patch({ episodes: list });
  };

  const addEpisode = () => {
    const id = `ep-${newId().slice(-6)}`;
    const s1 = `s-${newId().slice(-5)}`;
    patch({
      episodes: [
        ...episodes,
        {
          id,
          title: '첫 만남',
          scenes: [{ id: s1, speaker: 'char', text: '', next: null }],
        },
      ],
      startEpisodeId: cfg.startEpisodeId || id,
    });
  };

  const addScene = (ei: number) => {
    const ep = episodes[ei];
    if (!ep) return;
    const sid = `s-${newId().slice(-5)}`;
    const scenes = [...(ep.scenes || []), { id: sid, speaker: 'char' as const, text: '', next: null }];
    setEpisode(ei, { ...ep, scenes });
  };

  const setScene = (ei: number, si: number, scene: OcChatEpisodeScene) => {
    const ep = episodes[ei];
    if (!ep) return;
    const scenes = [...(ep.scenes || [])];
    scenes[si] = scene;
    setEpisode(ei, { ...ep, scenes });
  };

  const addChoice = (ei: number, si: number) => {
    const ep = episodes[ei];
    const scene = ep?.scenes?.[si];
    if (!scene) return;
    const choices: OcChatEpisodeChoice[] = [
      ...(scene.choices || []),
      { id: `c-${newId().slice(-5)}`, text: '', affinityDelta: 1, next: null },
    ];
    setScene(ei, si, { ...scene, choices, next: undefined });
  };

  return (
    <>
      <p style={{ fontSize: 10, opacity: 0.55, margin: '0 0 10px' }}>
        켜면 상세에 Message가 생깁니다. 시작 에피소드가 있으면 스토리→선택지→호감 후 자유 대화가
        열립니다. 기록이 방문자별로 남습니다.
      </p>
      <div className="form-group" style={{ marginBottom: 14 }}>
        <LakeToggle
          checked={Boolean(cfg.enabled)}
          onChange={(on) => patch({ enabled: on })}
          label="챗봇 사용"
        />
      </div>
      {characterId ? (
        <div className="form-group" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="btn-del"
            disabled={resetting}
            onClick={() => void resetChat()}
            style={{ opacity: resetting ? 0.5 : 1 }}
          >
            {resetting ? '초기화 중…' : '이 OC 채팅만 초기화'}
          </button>
          <p style={{ fontSize: 10, opacity: 0.45, margin: '6px 0 0' }}>
            이 캐릭터의 방문자 대화·호감·스토리 진행만 지웁니다.
          </p>
        </div>
      ) : null}
      <div className="form-group">
        <label className="form-label">채팅 프로필 사진</label>
        <p style={{ fontSize: 10, opacity: 0.5, margin: '0 0 8px' }}>
          비우면 기본 실루엣 아바타를 씁니다.
        </p>
        <ImageUploadCrop
          label=""
          value={cfg.chatAvatarUrl || ''}
          onChange={(url) => patch({ chatAvatarUrl: url || undefined })}
          showClear
        />
        {!cfg.chatAvatarUrl ? (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src={OC_CHAT_DEFAULT_AVATAR}
              alt=""
              width={40}
              height={40}
              style={{ borderRadius: '50%', objectFit: 'cover' }}
            />
            <span style={{ fontSize: 10, opacity: 0.5 }}>현재 기본 아바타</span>
          </div>
        ) : null}
      </div>
      <div className="form-group">
        <label className="form-label">첫 인사 (스토리 없을 때만)</label>
        <input
          className="form-input"
          value={cfg.greeting || ''}
          onChange={(e) => patch({ greeting: e.target.value })}
          placeholder="비우면 인사 없이 시작"
        />
      </div>
      <div className="form-group">
        <label className="form-label">말투·금기</label>
        <textarea
          className="form-input"
          rows={5}
          value={cfg.toneRules || ''}
          onChange={(e) => patch({ toneRules: e.target.value })}
          placeholder="예: 반말, 문장 짧게, 이모지 금지"
        />
      </div>
      <div className="form-group">
        <label className="form-label">샘플 대사</label>
        <textarea
          className="form-input"
          rows={6}
          value={cfg.sampleDialogue || ''}
          onChange={(e) => patch({ sampleDialogue: e.target.value })}
          placeholder={'예:\n이브: ...안녕.\n나: 좋은 아침.'}
        />
      </div>

      <h4 className="form-label" style={{ marginTop: 18 }}>
        본인 기본 정보
      </h4>
      <p style={{ fontSize: 10, opacity: 0.5, margin: '0 0 8px' }}>
        「몇 학년이야?」「외동이야?」처럼 물어볼 때 근거가 됩니다. 비어 있으면 모른다고/얼버무립니다.
      </p>
      {selfFacts.map((row, i) => (
        <div
          key={i}
          style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}
        >
          <input
            className="form-input"
            style={{ maxWidth: 120 }}
            value={row.k}
            onChange={(e) => setSelfFact(i, { ...row, k: e.target.value })}
            placeholder="항목 (학년)"
          />
          <input
            className="form-input"
            value={row.v}
            onChange={(e) => setSelfFact(i, { ...row, v: e.target.value })}
            placeholder="내용 (2학년)"
          />
          <button
            type="button"
            className="btn-del"
            style={{ padding: '4px 8px' }}
            onClick={() => patch({ selfFacts: selfFacts.filter((_, idx) => idx !== i) })}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-save"
        style={{ padding: '5px 12px', marginBottom: 8 }}
        onClick={() => patch({ selfFacts: [...selfFacts, { k: '', v: '' }] })}
      >
        + 항목 추가
      </button>
      <p style={{ fontSize: 10, opacity: 0.4, margin: '0 0 12px' }}>
        예: 학년 / 학교 / 반 / 가족구성 / 거주지 / 동아리 …
      </p>

      <h4 className="form-label" style={{ marginTop: 8 }}>
        주변 인물
      </h4>
      <p style={{ fontSize: 10, opacity: 0.5, margin: '0 0 8px' }}>
        이 OC가 채팅에서 언급해도 되는 사람들입니다. (공통 세계 관계 탭과는 별도로, 챗봇용)
      </p>
      {circle.map((person, pi) => (
        <div
          key={person.id || pi}
          style={{
            border: '1px solid rgba(215,169,130,0.2)',
            borderRadius: 10,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input
              className="form-input"
              value={person.name}
              onChange={(e) => setCirclePerson(pi, { ...person, name: e.target.value })}
              placeholder="이름"
            />
            <input
              className="form-input"
              value={person.relation || ''}
              onChange={(e) => setCirclePerson(pi, { ...person, relation: e.target.value })}
              placeholder="관계 (동급생)"
            />
            <button
              type="button"
              className="btn-del"
              style={{ padding: '4px 8px' }}
              onClick={() => patch({ circle: circle.filter((_, idx) => idx !== pi) })}
            >
              ✕
            </button>
          </div>
          <textarea
            className="form-input"
            rows={2}
            value={person.notes || ''}
            onChange={(e) => setCirclePerson(pi, { ...person, notes: e.target.value })}
            placeholder="메모 (이 OC 시점)"
            style={{ marginBottom: 6 }}
          />
          {(person.facts || []).map((fact, fi) => (
            <div
              key={fi}
              style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'center' }}
            >
              <input
                className="form-input"
                style={{ maxWidth: 100 }}
                value={fact.k}
                onChange={(e) => setCircleFact(pi, fi, { ...fact, k: e.target.value })}
                placeholder="항목"
              />
              <input
                className="form-input"
                value={fact.v}
                onChange={(e) => setCircleFact(pi, fi, { ...fact, v: e.target.value })}
                placeholder="내용"
              />
              <button
                type="button"
                className="btn-del"
                style={{ padding: '4px 8px' }}
                onClick={() =>
                  setCirclePerson(pi, {
                    ...person,
                    facts: (person.facts || []).filter((_, idx) => idx !== fi),
                  })
                }
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-save"
            style={{ padding: '4px 10px', marginTop: 4 }}
            onClick={() =>
              setCirclePerson(pi, {
                ...person,
                facts: [...(person.facts || []), { k: '', v: '' }],
              })
            }
          >
            + 팩트
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-save"
        style={{ padding: '5px 12px', marginBottom: 12 }}
        onClick={() =>
          patch({
            circle: [
              ...circle,
              { id: `c-${newId().slice(-6)}`, name: '', relation: '', notes: '', facts: [] },
            ],
          })
        }
      >
        + 인물 추가
      </button>

      <h4 className="form-label" style={{ marginTop: 18 }}>
        타이핑 성향
      </h4>
      <p style={{ fontSize: 10, opacity: 0.5, margin: '0 0 8px' }}>
        이브처럼 한 번에 쓰는 타입은 steady. 부끄럼·망설임은 fluster 트리거를 넣으세요.
      </p>
      <div className="form-group">
        <label className="form-label">baseline</label>
        <select
          className="form-input"
          value={typing.baseline || 'steady'}
          onChange={(e) =>
            patch({
              typingStyle: {
                ...typing,
                baseline: e.target.value as OcChatTypingBaseline,
              },
            })
          }
        >
          <option value="steady">steady (읽고 한 번에)</option>
          <option value="hesitant">hesitant (자주 멈춤)</option>
          <option value="burst">burst (짧게 끊김)</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">fluster 트리거 (쉼표 구분)</label>
        <input
          className="form-input"
          value={(typing.flusterTrigger || []).join(', ')}
          onChange={(e) =>
            patch({
              typingStyle: {
                ...typing,
                flusterTrigger: e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
            })
          }
          placeholder="예: 칭찬받음, 애정 표현"
        />
      </div>
      <div className="form-group">
        <label className="form-label">fluster style</label>
        <select
          className="form-input"
          value={typing.flusterStyle || ''}
          onChange={(e) =>
            patch({
              typingStyle: {
                ...typing,
                flusterStyle: (e.target.value || null) as OcChatTypingBaseline | null,
              },
            })
          }
        >
          <option value="">없음</option>
          <option value="hesitant">hesitant</option>
          <option value="burst">burst</option>
          <option value="steady">steady</option>
        </select>
      </div>

      <h4 className="form-label" style={{ marginTop: 18 }}>
        스티커
      </h4>
      <div className="form-group" style={{ marginBottom: 10 }}>
        <LakeToggle
          checked={Boolean(stickers.usesStickers)}
          onChange={(on) =>
            patch({
              stickerStyle: {
                ...stickers,
                usesStickers: on,
                frequency: on ? stickers.frequency || 'medium' : null,
              },
            })
          }
          label="이미지 스티커 사용"
        />
      </div>
      {stickers.usesStickers ? (
        <>
          <div className="form-group">
            <label className="form-label">빈도</label>
            <select
              className="form-input"
              value={stickers.frequency || 'medium'}
              onChange={(e) =>
                patch({
                  stickerStyle: {
                    ...stickers,
                    frequency: e.target.value as OcChatStickerFrequency,
                  },
                })
              }
            >
              <option value="rare">rare</option>
              <option value="medium">medium</option>
              <option value="often">often</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">허용 팩 id (쉼표, data/oc-stickers.json)</label>
            <input
              className="form-input"
              value={(stickers.allowedPackIds || []).join(', ')}
              onChange={(e) =>
                patch({
                  stickerStyle: {
                    ...stickers,
                    allowedPackIds: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  },
                })
              }
              placeholder="예: pack_basic_emoji"
            />
          </div>
        </>
      ) : null}

      <h4 className="form-label" style={{ marginTop: 18 }}>
        호감 구간
      </h4>
      <p style={{ fontSize: 10, opacity: 0.5, margin: '0 0 8px' }}>
        자유 대화 톤에 반영됩니다. 비우면 기본 3단(낯선/익숙한/가까운).
      </p>
      {tiers.map((t, i) => (
        <div
          key={i}
          className="form-group"
          style={{
            border: '1px solid rgba(215,169,130,0.18)',
            borderRadius: 8,
            padding: 10,
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input
              className="form-input"
              style={{ width: 64 }}
              type="number"
              value={t.min}
              onChange={(e) => setTier(i, { ...t, min: Number(e.target.value) || 0 })}
              title="min"
            />
            <input
              className="form-input"
              style={{ width: 64 }}
              type="number"
              value={t.max}
              onChange={(e) => setTier(i, { ...t, max: Number(e.target.value) || 0 })}
              title="max"
            />
            <input
              className="form-input"
              value={t.label}
              onChange={(e) => setTier(i, { ...t, label: e.target.value })}
              placeholder="라벨"
            />
          </div>
          <input
            className="form-input"
            value={t.toneNote || ''}
            onChange={(e) => setTier(i, { ...t, toneNote: e.target.value })}
            placeholder="이 구간일 때 AI 톤 메모"
          />
        </div>
      ))}
      <button
        type="button"
        className="btn-save"
        style={{ padding: '5px 12px', marginBottom: 16 }}
        onClick={() =>
          patch({
            affinityTiers: [
              ...tiers,
              { min: 0, max: 20, label: '새 구간', toneNote: '' },
            ],
          })
        }
      >
        + 구간 추가
      </button>

      <h4 className="form-label">스토리 에피소드</h4>
      <div className="form-group">
        <label className="form-label">시작 에피소드 id</label>
        <select
          className="form-input"
          value={cfg.startEpisodeId || ''}
          onChange={(e) => patch({ startEpisodeId: e.target.value || undefined })}
        >
          <option value="">(첫 에피소드)</option>
          {episodes.map((ep) => (
            <option key={ep.id} value={ep.id}>
              {ep.title || ep.id}
            </option>
          ))}
        </select>
      </div>

      {episodes.map((ep, ei) => (
        <div
          key={ep.id}
          style={{
            border: '1px solid rgba(215,169,130,0.22)',
            borderRadius: 10,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              className="form-input"
              value={ep.title}
              onChange={(e) => setEpisode(ei, { ...ep, title: e.target.value })}
              placeholder="에피소드 제목"
            />
            <input
              className="form-input"
              style={{ maxWidth: 140 }}
              value={ep.id}
              onChange={(e) => setEpisode(ei, { ...ep, id: e.target.value.trim() || ep.id })}
              placeholder="id"
            />
            <button
              type="button"
              className="btn-del"
              onClick={() =>
                patch({
                  episodes: episodes.filter((_, j) => j !== ei),
                  startEpisodeId:
                    cfg.startEpisodeId === ep.id ? undefined : cfg.startEpisodeId,
                })
              }
            >
              ✕
            </button>
          </div>

          {(ep.scenes || []).map((sc, si) => (
            <div
              key={sc.id}
              style={{
                borderTop: '1px dashed rgba(215,169,130,0.2)',
                paddingTop: 10,
                marginTop: 10,
              }}
            >
              <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <select
                  className="form-input"
                  style={{ width: 120 }}
                  value={sc.speaker}
                  onChange={(e) =>
                    setScene(ei, si, {
                      ...sc,
                      speaker: e.target.value === 'narration' ? 'narration' : 'char',
                    })
                  }
                >
                  <option value="char">캐릭터</option>
                  <option value="narration">지문</option>
                </select>
                <input
                  className="form-input"
                  style={{ width: 100 }}
                  value={sc.id}
                  onChange={(e) => setScene(ei, si, { ...sc, id: e.target.value.trim() || sc.id })}
                  placeholder="scene id"
                />
                <input
                  className="form-input"
                  style={{ width: 120 }}
                  value={sc.next ?? ''}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setScene(ei, si, { ...sc, next: v ? v : null });
                  }}
                  placeholder="next (빈칸=종료)"
                  disabled={!!(sc.choices && sc.choices.length)}
                />
                <button
                  type="button"
                  className="btn-del"
                  onClick={() =>
                    setEpisode(ei, {
                      ...ep,
                      scenes: (ep.scenes || []).filter((_, j) => j !== si),
                    })
                  }
                >
                  씬✕
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <input
                  className="form-input"
                  style={{ width: 100 }}
                  type="number"
                  min={0}
                  value={sc.delayMs ?? ''}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setScene(ei, si, {
                      ...sc,
                      delayMs: v === '' ? undefined : Math.max(0, Number(v) || 0),
                    });
                  }}
                  placeholder="delay ms"
                  title="공개 전 대기(ms) — 안 읽씹 텀"
                />
                <select
                  className="form-input"
                  style={{ width: 140 }}
                  value={sc.readAction || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setScene(ei, si, {
                      ...sc,
                      readAction:
                        v === 'keepUnread' || v === 'markRead' ? v : undefined,
                    });
                  }}
                  title="유저 말 읽음 처리"
                >
                  <option value="">읽음(자동)</option>
                  <option value="markRead">읽음 후 대사</option>
                  <option value="keepUnread">안 읽음 유지</option>
                </select>
                <select
                  className="form-input"
                  style={{ width: 120 }}
                  value={sc.effect || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setScene(ei, si, {
                      ...sc,
                      effect: v === 'leave' ? 'leave' : undefined,
                    });
                  }}
                >
                  <option value="">효과 없음</option>
                  <option value="leave">톡방 나가기</option>
                </select>
              </div>
              <textarea
                className="form-input"
                rows={2}
                value={sc.text}
                onChange={(e) => setScene(ei, si, { ...sc, text: e.target.value })}
                placeholder="대사 / 지문"
              />
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 4 }}>선택지</div>
                {(sc.choices || []).map((ch, ci) => (
                  <div key={ch.id || ci} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input
                      className="form-input"
                      value={ch.text}
                      onChange={(e) => {
                        const choices = [...(sc.choices || [])];
                        choices[ci] = { ...ch, text: e.target.value };
                        setScene(ei, si, { ...sc, choices });
                      }}
                      placeholder="선택 문구"
                    />
                    <input
                      className="form-input"
                      style={{ width: 64 }}
                      type="number"
                      value={ch.affinityDelta ?? 0}
                      onChange={(e) => {
                        const choices = [...(sc.choices || [])];
                        choices[ci] = {
                          ...ch,
                          affinityDelta: Number(e.target.value) || 0,
                        };
                        setScene(ei, si, { ...sc, choices });
                      }}
                      title="호감 Δ"
                    />
                    <input
                      className="form-input"
                      style={{ width: 100 }}
                      value={ch.next ?? ''}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        const choices = [...(sc.choices || [])];
                        choices[ci] = { ...ch, next: v ? v : null };
                        setScene(ei, si, { ...sc, choices });
                      }}
                      placeholder="next"
                    />
                    <button
                      type="button"
                      className="btn-del"
                      onClick={() => {
                        const choices = (sc.choices || []).filter((_, j) => j !== ci);
                        setScene(ei, si, {
                          ...sc,
                          choices: choices.length ? choices : undefined,
                        });
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-save"
                  style={{ padding: '4px 10px' }}
                  onClick={() => addChoice(ei, si)}
                >
                  + 선택지
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn-save"
            style={{ padding: '5px 12px', marginTop: 10 }}
            onClick={() => addScene(ei)}
          >
            + 씬
          </button>
        </div>
      ))}

      <button type="button" className="btn-save" style={{ padding: '6px 14px' }} onClick={addEpisode}>
        + 에피소드
      </button>
    </>
  );
}
