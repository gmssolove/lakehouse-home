'use client';

import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/client';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AuthModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  async function submit() {
    setError('');
    try {
      if (tab === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      onClose();
    } catch (e: unknown) {
      const code = (e as { code?: string }).code || '';
      const map: Record<string, string> = {
        'auth/user-not-found': '등록된 이메일이 아닙니다.',
        'auth/wrong-password': '비밀번호가 올바르지 않습니다.',
        'auth/invalid-email': '이메일 형식이 올바르지 않습니다.',
        'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
        'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
        'auth/weak-password': '비밀번호는 6자 이상이어야 합니다.',
      };
      setError(map[code] || '오류가 발생했습니다.');
    }
  }

  return (
    <div
      id="auth-modal"
      className="active"
      style={{ display: 'flex' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="auth-box">
        <button type="button" className="auth-close" onClick={onClose}>
          ✕
        </button>
        <div className="auth-box-title">lakehouse</div>
        <div className="auth-box-sub">계정으로 로그인하세요</div>
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab${tab === 'login' ? ' active' : ''}`}
            onClick={() => setTab('login')}
          >
            Login
          </button>
          <button
            type="button"
            className={`auth-tab${tab === 'signup' ? ' active' : ''}`}
            onClick={() => setTab('signup')}
          >
            Sign up
          </button>
        </div>
        <div className={`auth-form${tab === 'login' ? ' active' : ''}`} id="form-login">
          <input
            className="auth-input"
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="auth-input"
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          {error && tab === 'login' && (
            <div style={{ color: 'var(--pink)', fontSize: 11, marginBottom: 8 }}>{error}</div>
          )}
          <button type="button" className="auth-btn" onClick={submit}>
            Login
          </button>
        </div>
        <div className={`auth-form${tab === 'signup' ? ' active' : ''}`} id="form-signup">
          <input
            className="auth-input"
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="auth-input"
            type="password"
            placeholder="password (6자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          {error && tab === 'signup' && (
            <div style={{ color: 'var(--pink)', fontSize: 11, marginBottom: 8 }}>{error}</div>
          )}
          <button type="button" className="auth-btn" onClick={submit}>
            Sign up
          </button>
        </div>
      </div>
    </div>
  );
}
