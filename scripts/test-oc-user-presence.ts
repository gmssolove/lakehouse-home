/**
 * 유저 presence 상태 머신 시나리오 테스트
 * 실행: npx tsx scripts/test-oc-user-presence.ts
 */
import assert from 'node:assert/strict';
import {
  OC_USER_PRESENCE_HEARTBEAT_MS,
  OC_USER_PRESENCE_IDLE_MS,
  OC_USER_PRESENCE_STALE_MS,
  formatOcUserPresenceSince,
  ocChatUserPresencePromptLines,
  resolveOcUserPresence,
  tickOcUserPresence,
  type OcUserPresenceSnap,
} from '../lib/oc/ocChatUserPresence';

const t0 = 1_700_000_000_000;

function snap(partial: Partial<OcUserPresenceSnap>): OcUserPresenceSnap {
  return {
    state: 'offline',
    updatedAt: t0,
    lastActiveAt: t0,
    lastHeartbeatAt: t0,
    ...partial,
  };
}

/* --- 시나리오 1: 페이지에 머물며 상호작용 → online --- */
{
  const online = tickOcUserPresence({
    prev: null,
    now: t0,
    detailOpen: true,
    tabVisible: true,
    interacted: true,
    heartbeat: true,
    viewingCharacterId: 'oc-1',
  });
  assert.equal(online.state, 'online');
  assert.equal(online.viewingCharacterId, 'oc-1');
  assert.equal(online.lastActiveAt, t0);
  assert.equal(online.lastHeartbeatAt, t0);

  const still = tickOcUserPresence({
    prev: online,
    now: t0 + 30_000,
    detailOpen: true,
    tabVisible: true,
    interacted: true,
    heartbeat: true,
  });
  assert.equal(still.state, 'online');
  assert.equal(still.updatedAt, online.updatedAt);
}

/* --- 시나리오 2: 탭 전환/최소화 → offline --- */
{
  const online = tickOcUserPresence({
    prev: null,
    now: t0,
    detailOpen: true,
    tabVisible: true,
    interacted: true,
    heartbeat: true,
  });
  const hidden = tickOcUserPresence({
    prev: online,
    now: t0 + 5_000,
    detailOpen: true,
    tabVisible: false,
    heartbeat: true,
  });
  assert.equal(hidden.state, 'offline');
  assert.ok(hidden.updatedAt >= t0 + 5_000);
  assert.equal(hidden.viewingCharacterId, undefined);

  const leftDetail = tickOcUserPresence({
    prev: online,
    now: t0 + 6_000,
    detailOpen: false,
    tabVisible: true,
    heartbeat: true,
  });
  assert.equal(leftDetail.state, 'offline');
}

/* --- 시나리오 3: 켜놓고 20분+ 방치 → idle --- */
{
  const online = tickOcUserPresence({
    prev: null,
    now: t0,
    detailOpen: true,
    tabVisible: true,
    interacted: true,
    heartbeat: true,
  });
  const almost = tickOcUserPresence({
    prev: online,
    now: t0 + OC_USER_PRESENCE_IDLE_MS - 1_000,
    detailOpen: true,
    tabVisible: true,
    interacted: false,
    heartbeat: true,
  });
  assert.equal(almost.state, 'online');

  const idle = tickOcUserPresence({
    prev: almost,
    now: t0 + OC_USER_PRESENCE_IDLE_MS + 30_000,
    detailOpen: true,
    tabVisible: true,
    interacted: false,
    heartbeat: true,
  });
  assert.equal(idle.state, 'idle');
  assert.ok(idle.updatedAt > almost.updatedAt);

  /* 다시 움직이면 online */
  const back = tickOcUserPresence({
    prev: idle,
    now: t0 + OC_USER_PRESENCE_IDLE_MS + 60_000,
    detailOpen: true,
    tabVisible: true,
    interacted: true,
    heartbeat: true,
  });
  assert.equal(back.state, 'online');
}

/* --- 서버 resolve: heartbeat stale → offline --- */
{
  const stale = resolveOcUserPresence(
    snap({
      state: 'online',
      lastHeartbeatAt: t0,
      lastActiveAt: t0,
      updatedAt: t0,
    }),
    t0 + OC_USER_PRESENCE_STALE_MS + 1,
  );
  assert.equal(stale.state, 'offline');
}

/* --- 서버 resolve: heartbeat ok but active old → idle --- */
{
  const idle = resolveOcUserPresence(
    snap({
      state: 'online',
      lastHeartbeatAt: t0 + OC_USER_PRESENCE_IDLE_MS + 60_000,
      lastActiveAt: t0,
      updatedAt: t0,
    }),
    t0 + OC_USER_PRESENCE_IDLE_MS + 60_000,
  );
  assert.equal(idle.state, 'idle');
}

/* --- 프롬프트 필드 --- */
{
  const lines = ocChatUserPresencePromptLines(
    snap({ state: 'online', updatedAt: t0, lastActiveAt: t0, lastHeartbeatAt: t0 }),
    t0 + 90_000,
  ).join('\n');
  assert.ok(lines.includes('userPresenceState: online'));
  assert.ok(lines.includes('userPresenceSince:'));
  assert.ok(formatOcUserPresenceSince(t0, t0 + 90_000).includes('분'));
}

assert.ok(OC_USER_PRESENCE_HEARTBEAT_MS >= 30_000 && OC_USER_PRESENCE_HEARTBEAT_MS <= 60_000);
assert.ok(OC_USER_PRESENCE_IDLE_MS >= 15 * 60_000 && OC_USER_PRESENCE_IDLE_MS <= 20 * 60_000);

console.log('oc-user-presence tests passed', {
  heartbeatMs: OC_USER_PRESENCE_HEARTBEAT_MS,
  idleMs: OC_USER_PRESENCE_IDLE_MS,
});
