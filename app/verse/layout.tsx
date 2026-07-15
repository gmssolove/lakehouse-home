import type { Metadata } from 'next';
import { Cormorant_Garamond } from 'next/font/google';
import '@/styles/verse.css';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-kb-latin',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '如月高校 — Portal',
  description: 'Kisaragi Universe Portal',
};

export default function VerseLayout({ children }: { children: React.ReactNode }) {
  return <div className={`verse-root ${cormorant.variable}`}>{children}</div>;
}
