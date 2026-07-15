import { Cinzel } from 'next/font/google';
import { VnTauriHotkeys } from '@/components/vn/VnTauriHotkeys';
import '../vn-route.css';

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-cinzel',
  display: 'swap',
});

/** VN — 공통 헤더/네비 없이 전체 화면만 */
export default function VnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`vn-fullscreen ${cinzel.variable}`}>
      <VnTauriHotkeys />
      {children}
    </div>
  );
}
