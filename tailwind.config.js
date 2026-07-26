/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './components/verse/**/*.{js,ts,jsx,tsx}',
    './app/verse/**/*.{js,ts,jsx,tsx}',
  ],
  // 기존 사이트 CSS와 충돌 방지 — 유틸리티만 생성
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        'lobby-gold': '#d4af37',
        'lobby-gold-soft': '#e8d48b',
        'lobby-ink': '#0c0a08',
      },
      fontFamily: {
        lobby: ['var(--font-noto-sans-kr)', 'Noto Sans KR', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
