const USERNAME_RE = /^[a-zA-Z0-9_]{3,}$/;

export function validateUsername(username: string): string | null {
  const trimmed = username.trim();
  if (!trimmed) return '아이디를 입력해 주세요.';
  if (trimmed.length < 3) return '아이디는 3자 이상이어야 합니다.';
  if (!USERNAME_RE.test(trimmed)) {
    return '아이디는 영문자, 숫자, _(밑줄)만 사용할 수 있습니다.';
  }
  return null;
}

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return '이메일을 입력해 주세요.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return '이메일 형식이 올바르지 않습니다.';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return '비밀번호를 입력해 주세요.';
  if (password.length < 6) return '비밀번호는 6자 이상이어야 합니다.';
  return null;
}

export function validateNickname(nickname: string): string | null {
  const trimmed = nickname.trim();
  if (!trimmed) return '닉네임을 입력해 주세요.';
  if (trimmed.length < 2) return '닉네임은 2자 이상이어야 합니다.';
  return null;
}

export function normalizeUsername(username: string): string {
  return username.trim();
}

export function usernameKey(username: string): string {
  return normalizeUsername(username).toLowerCase();
}
