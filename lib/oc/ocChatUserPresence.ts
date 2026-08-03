/**
 * 유저 presence — OC 상세 페이지 기준 online / idle / offline.
 * OC(캐릭터) 메신저 presence와 별개.
 */

export type OcUserPresenceState = 'online' | 'idle' | 'offline';

export type OcUserPresenceSnap = {
  state: OcUserPresenceState;
  /** state가 마지막으로 바뀐 시각 */
  updatedAt: number;
  /** 마지막 실제 상호작용(마우스/키보드/스크롤/터치 등) */
  lastActiveAt: number;
  /** 마지막 heartbeat (탭이 보이는 동안 주기 기록) */
  lastHeartbeatAt: number;
  /** 보고 있던 OC id (있으면) */
  viewingCharacterId?: string;
};

/** heartbeat 주기 — 30~60초 권장 중간값 */
export const OC_USER_PRESENCE_HEARTBEAT_MS = 45_000;
/** 탭은 켜져 있지만 상호작용이 없으면 idle */
export const OC_USER_PRESENCE_IDLE_MS = 18 * 60_000;
/** heartbeat가 이보다 오래 없으면 서버/판정에서 offline */
export const OC_USER_PRESENCE_STALE_MS = OC_USER_PRESENCE_HEARTBEAT_MS * 3;

const STORAGE_PREFIX = 'lh_oc_user_presence_v1:';

export function ocUserPresenceStorageKey(visitorId: string): string {
  return `${STORAGE_PREFIX}${visitorId}`;
}

export function normalizeOcUserPresenceSnap(
  raw: unknown,
  now = Date.now(),
): OcUserPresenceSnap {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const stateRaw = String(o.state || '').trim();
  const state: OcUserPresenceState =
    stateRaw === 'online' || stateRaw === 'idle' || stateRaw === 'offline'
      ? stateRaw
      : 'offline';
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
  return {
    state,
    updatedAt: num(o.updatedAt, 0),
    lastActiveAt: num(o.lastActiveAt, 0),
    lastHeartbeatAt: num(o.lastHeartbeatAt, 0),
    viewingCharacterId: String(o.viewingCharacterId || '').trim() || undefined,
  };
}

export function peekOcUserPresenceLocal(visitorId: string): OcUserPresenceSnap | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ocUserPresenceStorageKey(visitorId));
    if (!raw) return null;
    return normalizeOcUserPresenceSnap(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeOcUserPresenceLocal(
  visitorId: string,
  snap: OcUserPresenceSnap,
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      ocUserPresenceStorageKey(visitorId),
      JSON.stringify(normalizeOcUserPresenceSnap(snap)),
    );
  } catch {
    /* quota */
  }
}

/**
 * 스냅샷 + 현재 시각으로 실효 상태 재계산.
 * (클라이언트가 idle 전이 전에 죽어도 서버/프롬프트가 stale을 보정)
 */
export function resolveOcUserPresence(
  snap: OcUserPresenceSnap | null | undefined,
  now = Date.now(),
): OcUserPresenceSnap {
  if (!snap || !snap.lastHeartbeatAt) {
    return {
      state: 'offline',
      updatedAt: snap?.updatedAt || 0,
      lastActiveAt: snap?.lastActiveAt || 0,
      lastHeartbeatAt: snap?.lastHeartbeatAt || 0,
      viewingCharacterId: snap?.viewingCharacterId,
    };
  }
  if (now - snap.lastHeartbeatAt > OC_USER_PRESENCE_STALE_MS) {
    if (snap.state === 'offline') return snap;
    return {
      ...snap,
      state: 'offline',
      updatedAt: snap.lastHeartbeatAt + OC_USER_PRESENCE_STALE_MS,
    };
  }
  if (
    snap.state !== 'offline' &&
    snap.lastActiveAt > 0 &&
    now - snap.lastActiveAt >= OC_USER_PRESENCE_IDLE_MS
  ) {
    if (snap.state === 'idle') return snap;
    return {
      ...snap,
      state: 'idle',
      updatedAt: snap.lastActiveAt + OC_USER_PRESENCE_IDLE_MS,
    };
  }
  return snap;
}

export type OcUserPresenceTickInput = {
  prev: OcUserPresenceSnap | null;
  now?: number;
  /** OC 상세가 열려 있는가 */
  detailOpen: boolean;
  /** 탭이 보이는가 (visibilityState === 'visible') */
  tabVisible: boolean;
  /** 이번 틱에 실제 상호작용이 있었는가 */
  interacted?: boolean;
  /** heartbeat를 찍을 타이밍인가 */
  heartbeat?: boolean;
  viewingCharacterId?: string;
};

/**
 * 클라이언트 상태 머신 1스텝.
 * - detail 닫힘 또는 탭 숨김 → offline
 * - 보임 + 최근 상호작용 → online
 * - 보임 + IDLE_MS 무동작 → idle
 */
export function tickOcUserPresence(input: OcUserPresenceTickInput): OcUserPresenceSnap {
  const now = input.now ?? Date.now();
  const prev = input.prev
    ? normalizeOcUserPresenceSnap(input.prev, now)
    : {
        state: 'offline' as const,
        updatedAt: 0,
        lastActiveAt: 0,
        lastHeartbeatAt: 0,
      };

  if (!input.detailOpen || !input.tabVisible) {
    if (prev.state === 'offline' && !input.heartbeat) {
      return {
        ...prev,
        viewingCharacterId: undefined,
      };
    }
    return {
      state: 'offline',
      updatedAt: prev.state === 'offline' ? prev.updatedAt || now : now,
      lastActiveAt: prev.lastActiveAt,
      lastHeartbeatAt: input.heartbeat ? now : prev.lastHeartbeatAt,
      viewingCharacterId: undefined,
    };
  }

  const lastActiveAt = input.interacted ? now : prev.lastActiveAt || now;
  const lastHeartbeatAt = input.heartbeat ? now : prev.lastHeartbeatAt || now;
  const idle = now - lastActiveAt >= OC_USER_PRESENCE_IDLE_MS;
  const nextState: OcUserPresenceState = idle ? 'idle' : 'online';
  const viewingCharacterId = String(input.viewingCharacterId || '').trim() || undefined;

  return {
    state: nextState,
    updatedAt: nextState === prev.state ? prev.updatedAt || now : now,
    lastActiveAt,
    lastHeartbeatAt,
    viewingCharacterId,
  };
}

export function formatOcUserPresenceSince(
  updatedAt: number,
  now = Date.now(),
): string {
  if (!updatedAt || updatedAt <= 0) return 'unknown';
  const sec = Math.max(0, Math.floor((now - updatedAt) / 1000));
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

const STATE_KO: Record<OcUserPresenceState, string> = {
  online: 'online (OC 상세에서 활발히 보는 중)',
  idle: 'idle (탭/상세는 켜져 있으나 오래 무동작 — 자리 비움 가능)',
  offline: 'offline (상세 이탈·탭 숨김·종료)',
};

/** 시스템 프롬프트용 — {{userPresenceState}} / {{userPresenceSince}} 역할 */
export function ocChatUserPresencePromptLines(
  snap: OcUserPresenceSnap | null | undefined,
  now = Date.now(),
): string[] {
  const resolved = resolveOcUserPresence(snap, now);
  const since = formatOcUserPresenceSince(resolved.updatedAt, now);
  return [
    `userPresenceState: ${resolved.state}`,
    `userPresenceSince: ${since} (상태 변경 시각 기준)`,
    `- 유저 페이지 presence: ${STATE_KO[resolved.state]}`,
    '- 선톡/반응 소재로만 참고. "온라인이네?"는 idle이 아닐 때만 자연스럽게. idle이면 자리 비운 듯 짧게, offline이면 나중에 볼 짧은 한마디 위주.',
    '- 추측으로 위치·수면·일정을 단정하지 마라.',
  ];
}
