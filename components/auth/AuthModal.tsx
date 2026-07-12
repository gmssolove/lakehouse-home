'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { PRIVACY_POLICY_TEXT } from '@/lib/auth/privacyPolicy';
import {
  normalizeUsername,
  validateEmail,
  validateNickname,
  validatePassword,
  validateUsername,
} from '@/lib/auth/validation';
import {
  claimUsername,
  ensureAdminProfile,
  getEmailByUsername,
  isUsernameTaken,
  saveUserProfile,
} from '@/lib/auth/userProfile';
import { ADMIN_EMAIL, ADMIN_USERNAME } from '@/lib/types/character';
import { usernameKey } from '@/lib/auth/validation';
import { useSaveToast } from '@/components/ui/SaveToast';

type Props = {
  open: boolean;
  onClose: () => void;
  /** default = 전체 어두운 배경, popup = 현재 페이지 위 가벼운 스크림 */
  backdrop?: 'default' | 'popup';
};

function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="auth-label">
      {children}
      {required ? <span className="auth-required">*</span> : null}
    </label>
  );
}

export function AuthModal({ open, onClose, backdrop = 'default' }: Props) {
  const { showSaveToast } = useSaveToast();
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [username, setUsername] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [nickname, setNickname] = useState('');
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  function mapAuthError(code: string): string {
    const map: Record<string, string> = {
      'auth/user-not-found': '등록된 아이디가 아닙니다.',
      'auth/wrong-password': '비밀번호가 올바르지 않습니다.',
      'auth/invalid-email': '이메일 형식이 올바르지 않습니다.',
      'auth/invalid-credential': '아이디 또는 비밀번호가 올바르지 않습니다.',
      'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
      'auth/weak-password': '비밀번호는 6자 이상이어야 합니다.',
      'auth/too-many-requests': '너무 많은 시도입니다. 잠시 후 다시 시도해 주세요.',
      'auth/network-request-failed': '네트워크 오류입니다. 연결을 확인해 주세요.',
    };
    return map[code] || '오류가 발생했습니다.';
  }

  async function submitLogin() {
    setError('');
    setInfo('');
    const userErr = validateUsername(loginUsername);
    if (userErr) {
      setError(userErr);
      return;
    }
    const pwErr = validatePassword(loginPassword);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    setSubmitting(true);
    try {
      const email = await getEmailByUsername(loginUsername);
      if (!email) {
        setError('등록된 아이디가 아닙니다.');
        return;
      }
      await signInWithEmailAndPassword(auth, email, loginPassword);
      await ensureAdminProfile(auth.currentUser!);
      onClose();
    } catch (e: unknown) {
      setError(mapAuthError((e as { code?: string }).code || ''));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitSignup() {
    setError('');
    setInfo('');
    const userErr = validateUsername(username);
    if (userErr) {
      setError(userErr);
      return;
    }
    const normalizedUsername = normalizeUsername(username);
    if (usernameKey(normalizedUsername) === usernameKey(ADMIN_USERNAME)) {
      setError('이 아이디는 로그인 전용입니다. 로그인 탭에서 이용해 주세요.');
      return;
    }
    const pwErr = validatePassword(signupPassword);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (signupPassword !== passwordConfirm) {
      setError('비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    const nickErr = validateNickname(nickname);
    if (nickErr) {
      setError(nickErr);
      return;
    }
    const emailErr = validateEmail(signupEmail);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    if (!privacyAgreed) {
      showSaveToast('개인정보 수집 및 이용에 동의해야 가입할 수 있습니다');
      return;
    }

    setSubmitting(true);
    try {
      if (await isUsernameTaken(normalizedUsername)) {
        setError('이미 사용 중인 아이디입니다.');
        return;
      }

      const cred = await createUserWithEmailAndPassword(
        auth,
        signupEmail.trim(),
        signupPassword,
      );
      const uid = cred.user.uid;

      const claimed = await claimUsername(normalizedUsername, uid);
      if (!claimed) {
        await deleteUser(cred.user);
        setError('이미 사용 중인 아이디입니다.');
        return;
      }

      try {
        await updateProfile(cred.user, { displayName: nickname.trim() });
        await saveUserProfile(uid, {
          username: normalizedUsername,
          nickname: nickname.trim(),
          email: signupEmail.trim(),
        });
      } catch (profileErr) {
        await deleteUser(cred.user);
        throw profileErr;
      }

      onClose();
    } catch (e: unknown) {
      const code = (e as { code?: string }).code || '';
      if (code === 'auth/email-already-in-use') {
        const isAdminEmail =
          signupEmail.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
        setError(
          isAdminEmail
            ? '이미 가입된 관리자 계정입니다. 로그인 탭에서 아이디 gmssolove로 로그인해 주세요.'
            : '이미 사용 중인 이메일입니다.',
        );
        return;
      }
      setError(mapAuthError(code));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordReset() {
    setError('');
    setInfo('');
    setSubmitting(true);
    try {
      let email = signupEmail.trim();
      if (tab === 'login') {
        const userErr = validateUsername(loginUsername);
        if (userErr) {
          setError('비밀번호 재설정을 위해 로그인 아이디를 입력해 주세요.');
          return;
        }
        const resolved = await getEmailByUsername(loginUsername);
        if (!resolved) {
          setError('등록된 아이디가 아닙니다.');
          return;
        }
        email = resolved;
      } else {
        const emailErr = validateEmail(email);
        if (emailErr) {
          setError('비밀번호 재설정을 위해 가입 이메일을 입력해 주세요.');
          return;
        }
      }
      await sendPasswordResetEmail(auth, email);
      setInfo('비밀번호 재설정 링크를 이메일로 보냈습니다. 메일함을 확인해 주세요.');
    } catch (e: unknown) {
      setError(mapAuthError((e as { code?: string }).code || ''));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      id="auth-modal"
      className={`active${backdrop === 'popup' ? ' auth-modal--popup' : ''}`}
      style={{ display: 'flex' }}
    >
      {backdrop === 'popup' ? (
        <button type="button" className="auth-modal-backdrop" aria-label="닫기" onClick={onClose} />
      ) : null}
      <div className="auth-box">
        <button type="button" className="auth-close" onClick={onClose}>
          ✕
        </button>
        <div className="auth-box-header">
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab${tab === 'login' ? ' active' : ''}`}
              onClick={() => {
                setTab('login');
                setError('');
                setInfo('');
              }}
            >
              Login
            </button>
            <button
              type="button"
              className={`auth-tab${tab === 'signup' ? ' active' : ''}`}
              onClick={() => {
                setTab('signup');
                setError('');
                setInfo('');
              }}
            >
              Sign up
            </button>
          </div>
        </div>

        <div className="auth-box-scroll lh-scroll lh-scroll--overlay">
        <div className={`auth-form${tab === 'login' ? ' active' : ''}`} id="form-login">
          <div className="auth-field">
            <FieldLabel required>아이디</FieldLabel>
            <input
              className="auth-input"
              type="text"
              placeholder="아이디"
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="auth-field">
            <FieldLabel required>비밀번호</FieldLabel>
            <input
              className="auth-input"
              type="password"
              placeholder="비밀번호"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !submitting && submitLogin()}
              autoComplete="current-password"
            />
          </div>
          <button type="button" className="auth-forgot" onClick={() => void handlePasswordReset()}>
            비밀번호 찾기
          </button>
          {error && tab === 'login' && (
            <div style={{ color: 'var(--pink)', fontSize: 11, marginBottom: 8 }}>{error}</div>
          )}
          {info && tab === 'login' && (
            <div className="auth-reset-note">{info}</div>
          )}
          <button type="button" className="auth-btn" disabled={submitting} onClick={() => void submitLogin()}>
            Login
          </button>
        </div>

        <div className={`auth-form${tab === 'signup' ? ' active' : ''}`} id="form-signup">
          <div className="auth-field">
            <FieldLabel required>아이디</FieldLabel>
            <input
              className="auth-input"
              type="text"
              placeholder="아이디"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
            <p className="auth-hint">영문자, 숫자, _(밑줄)만 입력 가능 · 최소 3자 이상</p>
          </div>
          <div className="auth-field">
            <FieldLabel required>비밀번호</FieldLabel>
            <input
              className="auth-input"
              type="password"
              placeholder="6자 이상"
              value={signupPassword}
              onChange={(e) => setSignupPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="auth-field">
            <FieldLabel required>비밀번호 확인</FieldLabel>
            <input
              className="auth-input"
              type="password"
              placeholder="비밀번호 다시 입력"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="auth-field">
            <FieldLabel required>닉네임</FieldLabel>
            <input
              className="auth-input"
              type="text"
              placeholder="닉네임"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              autoComplete="nickname"
            />
          </div>
          <div className="auth-field">
            <FieldLabel required>E-mail</FieldLabel>
            <input
              className="auth-input"
              type="email"
              placeholder="example@email.com"
              value={signupEmail}
              onChange={(e) => setSignupEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !submitting && submitSignup()}
              autoComplete="email"
            />
          </div>

          <div className="auth-privacy">
            <label className="auth-privacy__check">
              <input
                type="checkbox"
                checked={privacyAgreed}
                onChange={(e) => setPrivacyAgreed(e.target.checked)}
              />
              <span>개인정보 수집 및 이용에 동의합니다</span>
              <button
                type="button"
                className="auth-privacy__toggle"
                onClick={(e) => {
                  e.preventDefault();
                  setPrivacyOpen((v) => !v);
                }}
              >
                {privacyOpen ? '닫기' : '보기'}
              </button>
            </label>
            {privacyOpen ? <div className="auth-privacy__body lh-scroll">{PRIVACY_POLICY_TEXT}</div> : null}
          </div>

          {error && tab === 'signup' && (
            <div style={{ color: 'var(--pink)', fontSize: 11, marginBottom: 8 }}>{error}</div>
          )}
          <button type="button" className="auth-btn" disabled={submitting} onClick={() => void submitSignup()}>
            Sign up
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
