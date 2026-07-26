'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';

type View = 'home' | 'world' | 'roles' | 'chronicle';

const ORDER: View[] = ['home', 'world', 'roles', 'chronicle'];

const NAV: { id: View; label: string; en: string; no: string }[] = [
  { id: 'home', label: '메인 화면', en: 'Main Screen', no: '01' },
  { id: 'world', label: '세계관', en: 'World View', no: '02' },
  { id: 'roles', label: '캐릭터 소개', en: 'Character', no: '03' },
  { id: 'chronicle', label: '사건 · 연표', en: 'Chronicle', no: '04' },
];

type Role = {
  id: string;
  name: string;
  en: string;
  tag: string;
  quote: string;
  desc: string;
  initial: string;
};

const ROLES: Role[] = [
  {
    id: 'omuro',
    name: '오무로',
    en: 'OMURO',
    tag: '괴이 연구부',
    quote: '진짜 ‘괴이’라는 게 뭔지, 내 눈으로 직접 보고 싶을 뿐이야.',
    desc: '키사라기 고교 괴이 연구부 부장. 도시 전설과 실종 사건을 쫓는 열혈 신입생. 겉모습은 떠들썩하지만, 경계의 기척만큼은 누구보다 먼저 감지한다.',
    initial: 'オ',
  },
  {
    id: 'eve',
    name: '이브',
    en: 'EVE',
    tag: '전입생',
    quote: '……쓸데없는 참견은 사양할게.',
    desc: '어느 날 갑자기 전학 온 흑발의 소녀. 말은 짧고 차갑지만, 키사라기의 밤과 묘하게 맞닿아 있다. 그녀가 온 이유는 아직 기록되지 않았다.',
    initial: 'エ',
  },
  {
    id: 'izumi',
    name: '이즈미',
    en: 'IZUMI',
    tag: '동급생',
    quote: '후후, 재밌어지겠네.',
    desc: '언제나 생글생글한 미소 뒤로 속을 읽기 어려운 동급생. 이브의 주변을 맴돌며, 사건의 퍼즐을 조용히 맞추는 쪽이다.',
    initial: 'イ',
  },
];

const WHEEL_GAIN = 0.13;
const FRICTION_FWD = 0.955;
const FRICTION_REV = 0.97;
const SPEED_CAP = 0.055;
const STEP_CAP = 0.016;
const AUTO_FROM = 0.9;

function IconGlobe() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.8 2.6 4.2 5.8 4.2 9s-1.4 6.4-4.2 9c-2.8-2.6-4.2-5.8-4.2-9S9.2 5.6 12 3z" />
    </svg>
  );
}

function IconShare() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

function IconAudio({ muted }: { muted?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M4 10v4h3l4 3V7L7 10H4z" />
      {muted ? (
        <path d="M16 9l5 5M21 9l-5 5" />
      ) : (
        <path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10" />
      )}
    </svg>
  );
}

/** 단색 실루엣 — 레이아웃용 플레이스홀더 */
function CharFigure({ role }: { role: Role }) {
  return (
    <div className="sp-fig" aria-hidden>
      <svg className="sp-fig__svg" viewBox="0 0 420 780">
        <path
          fill="rgba(255,255,255,0.12)"
          d="M148 248 C108 320 78 410 70 520 L58 780 L168 780 L182 545 L238 545 L252 780 L362 780 L350 520 C342 410 312 320 272 248 Z"
        />
        <ellipse cx="210" cy="165" rx="52" ry="62" fill="rgba(255,255,255,0.16)" />
        <path
          fill="rgba(255,255,255,0.2)"
          d="M148 170 C150 100 178 78 210 76 C246 78 272 105 274 172 C276 220 262 250 248 262 L240 205 C232 240 218 255 210 258 C202 255 188 240 180 205 L172 262 C158 248 146 218 148 170 Z"
        />
        <ellipse cx="210" cy="102" rx="86" ry="12" fill="rgba(0,0,0,0.55)" />
        <path fill="rgba(0,0,0,0.65)" d="M162 42 h96 a8 8 0 0 1 8 8 v52 h-112 v-52 a8 8 0 0 1 8-8z" />
        <path fill="rgba(255,255,255,0.1)" d="M88 310 C60 380 50 480 58 580 L98 580 C92 480 100 390 125 320 Z" />
        <path fill="rgba(255,255,255,0.1)" d="M332 310 C360 380 370 480 362 580 L322 580 C328 480 320 390 295 320 Z" />
        <text
          x="210"
          y="400"
          textAnchor="middle"
          fontSize="28"
          fill="rgba(255,255,255,0.35)"
          fontFamily="serif"
        >
          {role.initial}
        </text>
      </svg>
    </div>
  );
}

export function GameLobby() {
  const [boot, setBoot] = useState(true);
  const [bootOut, setBootOut] = useState(false);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [roleIdx, setRoleIdx] = useState(0);
  const [menuHover, setMenuHover] = useState<View | null>(null);
  const [audioMuted, setAudioMuted] = useState(false);

  const [txTo, setTxTo] = useState<View | null>(null);
  const [txDir, setTxDir] = useState<1 | -1>(1);
  const [progress, setProgress] = useState(0);
  const [ticking, setTicking] = useState(false);
  const [parked, setParked] = useState(false);

  const heroRef = useRef<HTMLElement>(null);
  const worldScrollRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>('home');
  const progressRef = useRef(0);
  const speedRef = useRef(0);
  const tickingRef = useRef(false);
  const toRef = useRef<View | null>(null);
  const dirRef = useRef<1 | -1>(1);
  const modeRef = useRef<'idle' | 'wheel' | 'time'>('idle');
  const rafRef = useRef(0);
  const lastTs = useRef(0);
  const lastForward = useRef(0);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t1 = window.setTimeout(() => setBootOut(true), 1500);
    const t2 = window.setTimeout(() => {
      setBoot(false);
      document.body.style.overflow = prev;
      requestAnimationFrame(() => setReady(true));
    }, 2200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      document.body.style.overflow = prev;
    };
  }, []);

  const finishTo = useCallback((next: View) => {
    setView(next);
    viewRef.current = next;
    progressRef.current = 0;
    speedRef.current = 0;
    tickingRef.current = false;
    toRef.current = null;
    modeRef.current = 'idle';
    setProgress(0);
    setTicking(false);
    setParked(false);
    setTxTo(null);
  }, []);

  const startTransition = useCallback((next: View, mode: 'wheel' | 'time', dir: 1 | -1) => {
    if (next === viewRef.current && !tickingRef.current) return;
    toRef.current = next;
    dirRef.current = dir;
    modeRef.current = mode;
    tickingRef.current = true;
    if (mode === 'time') {
      progressRef.current = 0;
      speedRef.current = 0;
    }
    setTxTo(next);
    setTxDir(dir);
    setTicking(true);
    setParked(false);
    setMenuOpen(false);
  }, []);

  const go = useCallback(
    (next: View) => {
      if (next === viewRef.current && !tickingRef.current) {
        setMenuOpen(false);
        return;
      }
      const fromIdx = ORDER.indexOf(viewRef.current);
      const toIdx = ORDER.indexOf(next);
      startTransition(next, 'time', toIdx < fromIdx ? -1 : 1);
    },
    [startTransition],
  );

  useEffect(() => {
    const tick = (ts: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (!tickingRef.current) {
        lastTs.current = ts;
        return;
      }
      const dt = lastTs.current ? Math.min(48, ts - lastTs.current) : 16;
      lastTs.current = ts;
      const frame = dt / (1000 / 60);

      if (modeRef.current === 'time') {
        progressRef.current = Math.min(1, progressRef.current + 0.03 * frame);
        setParked(false);
      } else {
        const canAuto =
          progressRef.current >= AUTO_FROM &&
          progressRef.current < 1 &&
          Date.now() - lastForward.current < 900;
        if (canAuto) {
          progressRef.current = Math.min(1, progressRef.current + 0.008 * frame);
          setParked(false);
        } else if (Math.abs(speedRef.current) > 0.00015) {
          const step = Math.max(-STEP_CAP, Math.min(STEP_CAP, speedRef.current * frame));
          progressRef.current = Math.max(0, Math.min(1, progressRef.current + step));
          speedRef.current *= Math.pow(speedRef.current < 0 ? FRICTION_REV : FRICTION_FWD, frame);
          if (Math.abs(speedRef.current) < 0.00015) speedRef.current = 0;
          setParked(false);
        } else if (progressRef.current > 0.02 && progressRef.current < 0.995) {
          setParked(true);
        }
      }

      setProgress(progressRef.current);

      if (progressRef.current >= 1 && toRef.current) {
        finishTo(toRef.current);
      } else if (modeRef.current === 'wheel' && progressRef.current <= 0 && speedRef.current < 0) {
        progressRef.current = 0;
        speedRef.current = 0;
        tickingRef.current = false;
        toRef.current = null;
        modeRef.current = 'idle';
        setProgress(0);
        setTicking(false);
        setParked(false);
        setTxTo(null);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [finishTo]);

  useEffect(() => {
    if (boot || !ready) return;
    const onWheel = (e: WheelEvent) => {
      if (menuOpen) return;
      if (Math.abs(e.deltaY) < 1) return;

      const cur = viewRef.current;
      const idx = ORDER.indexOf(cur);

      if (cur === 'world' && !tickingRef.current) {
        const sc = worldScrollRef.current;
        if (sc) {
          const atTop = sc.scrollTop <= 2;
          const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2;
          if (e.deltaY > 0 && !atBottom) return;
          if (e.deltaY < 0 && !atTop) return;
        }
      }

      e.preventDefault();
      const wantDir: 1 | -1 = e.deltaY > 0 ? 1 : -1;
      let next: View | null = null;
      if (wantDir === 1 && idx < ORDER.length - 1) next = ORDER[idx + 1];
      if (wantDir === -1 && idx > 0) next = ORDER[idx - 1];
      if (!next && !tickingRef.current) return;

      if (!tickingRef.current && next) startTransition(next, 'wheel', wantDir);
      if (!tickingRef.current || modeRef.current !== 'wheel') return;

      const amp = Math.max(0.85, Math.min(Math.abs(e.deltaY) / 80, 2.2));
      if (wantDir === dirRef.current) {
        speedRef.current += WHEEL_GAIN * amp;
        lastForward.current = Date.now();
        if (progressRef.current < 0.12) {
          progressRef.current = Math.min(0.24, progressRef.current + 0.065 * amp);
          setProgress(progressRef.current);
        }
      } else {
        speedRef.current -= 0.02 * amp;
      }
      speedRef.current = Math.max(-SPEED_CAP, Math.min(SPEED_CAP, speedRef.current));
      setParked(false);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [boot, ready, menuOpen, startTransition]);

  const onHeroMove = useCallback((e: ReactMouseEvent<HTMLElement>) => {
    const el = heroRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(4));
    el.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(4));
  }, []);

  const onHeroLeave = useCallback(() => {
    heroRef.current?.style.setProperty('--mx', '0');
    heroRef.current?.style.setProperty('--my', '0');
  }, []);

  const role = ROLES[roleIdx];
  const prevRole = () => setRoleIdx((i) => (i - 1 + ROLES.length) % ROLES.length);
  const nextRole = () => setRoleIdx((i) => (i + 1) % ROLES.length);

  useEffect(() => {
    if (view !== 'roles') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prevRole();
      if (e.key === 'ArrowRight') nextRole();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  const renderView = (id: View, live?: boolean): ReactNode => {
    if (id === 'home') {
      return (
        <section
          ref={live ? heroRef : undefined}
          className="sp-home"
          onMouseMove={live ? onHeroMove : undefined}
          onMouseLeave={live ? onHeroLeave : undefined}
          style={{ ['--mx' as string]: 0, ['--my' as string]: 0 }}
        >
          <div className="sp-home__sky" aria-hidden />

          <div className="sp-home__copy">
            <p className="sp-home__jp">如月高校</p>
            <h1 className="sp-home__title">키사라기 고교</h1>
            <p className="sp-home__sub">현실과 겹쳐진 또 하나의 층</p>
          </div>

          <div className="sp-home-cta">
            <button type="button" className="sp-home-cta__main" onClick={() => go('world')}>
              <i>KISARAGI</i>
              <strong>
                세계관 보기 <span>›</span>
              </strong>
            </button>
            <button type="button" className="sp-home-cta__sub" onClick={() => go('roles')}>
              캐릭터 소개
            </button>
          </div>

          <div className="sp-scroll" aria-hidden>
            <span />
          </div>
        </section>
      );
    }

    if (id === 'world') {
      return (
        <section className="sp-world">
          <div className="sp-world__bg" aria-hidden />
          <div className="sp-world__paper" ref={live ? worldScrollRef : undefined}>
            <p className="sp-world__en">WORLD VIEW</p>
            <h2 className="sp-world__h">세계관</h2>
            <div className="sp-world__body">
              <article>
                <h3>경계가 숨 쉬는 학교</h3>
                <p>
                  도쿄 외곽의 명문 사립 키사라기 고교. 낮의 교정은 평온하지만, 해질녘이 되면 현실과
                  맞닿은 또 하나의 층이 얇아진다.
                </p>
              </article>
              <article>
                <h3>괴이 연구부</h3>
                <p>
                  정식 발족한 동아리. 부원은 아직 적지만, 도시 전설·신수·실종 사건의 기록을 모아
                  경계의 지도를 그려 나간다.
                </p>
              </article>
              <article>
                <h3>겹쳐진 밤</h3>
                <p>
                  어떤 학생에게는 그저 소문일 뿐이고, 어떤 학생에게는 매일 밤의 현실이다. 진실은
                  아직 봉인된 채, 교정 아래에 잠들어 있다.
                </p>
              </article>
            </div>
            <button type="button" className="sp-world__next" onClick={() => go('roles')}>
              캐릭터 소개 ›
            </button>
          </div>
        </section>
      );
    }

    if (id === 'roles') {
      return (
        <section className="sp-roles">
          <div className="sp-roles__bg" aria-hidden>
            <div className="sp-roles__stars" />
            <div className="sp-roles__ground" />
          </div>

          {/* 좌 컬럼: 텍스트 + 아바타 (SP처럼 한 덩어리) */}
          <div className="sp-roles__left">
            <div className="sp-roles__info">
              <div className="sp-roles__titlewrap">
                <span className="sp-roles__wm">{role.en}</span>
                <h2 className="sp-roles__name">{role.name}</h2>
              </div>
              <span className="sp-roles__tag">{role.tag}</span>
              <p className="sp-roles__quote">“{role.quote}”</p>
              <p className="sp-roles__desc">{role.desc}</p>
            </div>

            <div className="sp-roles__avatars">
              <button type="button" className="sp-roles__arrow" onClick={prevRole} aria-label="이전">
                ‹
              </button>
              <div className="sp-roles__avatar-box">
                {ROLES.map((r, i) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`sp-roles__avatar${i === roleIdx ? ' is-on' : ''}`}
                    onClick={() => setRoleIdx(i)}
                    aria-current={i === roleIdx ? 'true' : undefined}
                  >
                    {r.initial}
                  </button>
                ))}
              </div>
              <button type="button" className="sp-roles__arrow" onClick={nextRole} aria-label="다음">
                ›
              </button>
            </div>
          </div>

          {/* 우: 전신 영역 */}
          <div className="sp-roles__char" key={role.id}>
            <CharFigure role={role} />
          </div>
        </section>
      );
    }

    return (
      <section className="sp-chronicle">
        <div className="sp-chronicle__inner">
          <p className="sp-chronicle__en">CHRONICLE</p>
          <h2 className="sp-chronicle__h">사건 · 연표</h2>
          <ol className="sp-chronicle__list">
            <li>
              <em>01</em>
              <div>
                <strong>입학</strong>
                <p>오무로, 키사라기 고교 입성. 괴이 연구부 발족.</p>
              </div>
            </li>
            <li>
              <em>02</em>
              <div>
                <strong>전입</strong>
                <p>엔도 이브 전학. 같은 날, 골목에서 이상 기척.</p>
              </div>
            </li>
            <li>
              <em>03</em>
              <div>
                <strong>경계</strong>
                <p>기록이 열리기 시작한다. 봉인된 층의 문틈.</p>
              </div>
            </li>
          </ol>
          <Link href="/verse/gate" className="sp-chronicle__link">
            Portal로 이동
          </Link>
        </div>
      </section>
    );
  };

  return (
    <div
      className={[
        'sp',
        ready ? 'is-ready' : '',
        menuOpen ? 'is-menu' : '',
        ticking ? 'is-tx' : '',
        parked ? 'is-parked' : '',
        txDir < 0 ? 'is-tx-rev' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ ['--wipe' as string]: `${progress * 100}%` }}
    >
      {/* 번짐(bleed)용 왜곡 — 찢김 아님 */}
      <svg className="sp-svg" aria-hidden width="0" height="0">
        <defs>
          <filter id="sp-bleed" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012 0.045"
              numOctaves="3"
              seed="3"
              result="n"
            >
              <animate
                attributeName="baseFrequency"
                dur="4s"
                values="0.012 0.045;0.016 0.055;0.012 0.045"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      {boot && (
        <div className={`sp-boot${bootOut ? ' is-out' : ''}`} aria-busy="true">
          <div className="sp-boot__mark">
            <span>如</span>
          </div>
          <p className="sp-boot__loading">NOW LOADING</p>
          <p className="sp-boot__brand">如月高校</p>
        </div>
      )}

      <header className="sp-top">
        <button type="button" className="sp-top__brand" onClick={() => go('home')}>
          如月高校
        </button>

        <button
          type="button"
          className={`sp-top__center${menuOpen ? ' is-open' : ''}`}
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
        >
          {menuOpen ? (
            <span className="sp-top__close">
              접기 <i>×</i>
            </span>
          ) : (
            <span className="sp-top__more">
              더 보기
              <i className="sp-top__burger" aria-hidden>
                <b />
                <b />
                <b />
              </i>
            </span>
          )}
        </button>

        <div className="sp-top__right">
          <button type="button" className="sp-top__ico" aria-label="언어">
            <IconGlobe />
          </button>
          <button type="button" className="sp-top__ico" aria-label="공유">
            <IconShare />
          </button>
          <button
            type="button"
            className="sp-top__ico"
            aria-label={audioMuted ? '소리 켜기' : '소리 끄기'}
            onClick={() => setAudioMuted((v) => !v)}
          >
            <IconAudio muted={audioMuted} />
          </button>
          <Link href="/verse/gate" className="sp-top__cta">
            PORTAL
          </Link>
        </div>
      </header>

      {/* 메뉴: 고정 박스 — stage와 분리 */}
      <div className={`sp-overlay${menuOpen ? ' is-open' : ''}`} aria-hidden={!menuOpen}>
        <button type="button" className="sp-overlay__dim" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)} />
        <nav className="sp-menu-panel" aria-label="전체 메뉴">
          <div className="sp-menu-box">
            {NAV.map((item) => {
              const on = menuHover === item.id || (!menuHover && view === item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`sp-menu-row${on ? ' is-on' : ''}`}
                  onMouseEnter={() => setMenuHover(item.id)}
                  onMouseLeave={() => setMenuHover(null)}
                  onClick={() => go(item.id)}
                >
                  <span className="sp-menu-no">#{item.no}</span>
                  <span className="sp-menu-label">{item.label}</span>
                  <span className="sp-menu-sub">{item.en}</span>
                  <span className="sp-menu-line" aria-hidden />
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      <main className="sp-stage">
        <div
          className="sp-layer sp-layer--from"
          style={{
            opacity: 1 - progress * 0.25,
          }}
        >
          {renderView(view, true)}
        </div>

        {ticking && txTo && (
          <div className={`sp-layer sp-layer--to${parked ? ' is-bleed' : ''}`}>
            {renderView(txTo, false)}
          </div>
        )}
      </main>
    </div>
  );
}
