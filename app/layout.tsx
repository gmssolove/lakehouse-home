import type { Metadata } from 'next';
import {
  Cormorant_Garamond,
  Cormorant_Upright,
  IM_Fell_English,
  Marcellus,
  My_Soul,
  Noto_Sans_KR,
  Playfair_Display,
  Pinyon_Script,
} from 'next/font/google';
import Script from 'next/script';
import Providers from './providers';
import './globals.css';

const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-noto-sans-kr',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  style: ['italic', 'normal'],
  weight: ['400', '500'],
  variable: '--font-playfair',
  display: 'swap',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  style: ['italic', 'normal'],
  weight: ['400', '500', '600'],
  variable: '--font-cormorant',
  display: 'swap',
});

const cormorantUpright = Cormorant_Upright({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-cormorant-upright',
  display: 'swap',
});

const imFell = IM_Fell_English({
  subsets: ['latin'],
  style: ['italic', 'normal'],
  weight: ['400'],
  variable: '--font-im-fell',
  display: 'swap',
});

const marcellus = Marcellus({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-marcellus',
  display: 'swap',
});

const pinyon = Pinyon_Script({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-pinyon',
  display: 'swap',
});

const mySoul = My_Soul({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-my-soul',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'lakehouse',
  description: 'archive & stories',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      className={[
        notoSansKr.variable,
        playfair.variable,
        cormorant.variable,
        cormorantUpright.variable,
        imFell.variable,
        marcellus.variable,
        pinyon.variable,
        mySoul.variable,
      ].join(' ')}
    >
      <body>
        <Providers>{children}</Providers>
        <Script src="/lakehouse-r2.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
