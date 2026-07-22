import type { Metadata, Viewport } from 'next';
import {
  Cormorant_Garamond,
  Cormorant_Upright,
  IM_Fell_English,
  Marcellus,
  My_Soul,
  Noto_Sans_KR,
  Noto_Serif_KR,
  Playfair_Display,
  Pinyon_Script,
  Gowun_Dodum,
  Quicksand,
} from 'next/font/google';
import localFont from 'next/font/local';
import Script from 'next/script';
import Providers from './providers';
import './globals.css';

const chosunNm = localFont({
  /* 브라우저-safe 재패킹본 — scripts/build-chosun-web-font.mjs */
  src: './fonts/ChosunNm.woff2',
  variable: '--font-chosun-nm',
  display: 'swap',
  weight: '400',
  fallback: ['Georgia', 'serif'],
  adjustFontFallback: false,
});

const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-noto-sans-kr',
  display: 'swap',
});

/* 실제 Noto Serif — CSS 별칭 --font-noto-serif-kr(ChosunNm)과 충돌하지 않게 분리 */
const notoSerifKr = Noto_Serif_KR({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-noto-serif-google',
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

const gowunDodum = Gowun_Dodum({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-gowun-dodum',
  display: 'swap',
});

const quicksand = Quicksand({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-quicksand',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'lakehouse',
  description: 'archive & stories',
  /* 동일 출처 프록시 — Admin RTDB favicon. OC/Pair 하드로드에서도 브라우저가 이 링크를 씀 */
  icons: {
    icon: [{ url: '/favicon.ico', type: 'image/png' }],
    shortcut: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={[
        chosunNm.variable,
        notoSansKr.variable,
        notoSerifKr.variable,
        playfair.variable,
        cormorant.variable,
        cormorantUpright.variable,
        imFell.variable,
        marcellus.variable,
        pinyon.variable,
        mySoul.variable,
        gowunDodum.variable,
        quicksand.variable,
      ].join(' ')}
    >
      {/* className 대신 CSS --lh-body-font('ChosunNm' 우선) — next/font Fallback이 Times로 가로채지 않게 */}
      <head>
        {/* Admin 파비콘 — 동일 출처 /favicon.ico (api/site-favicon 프록시). localStorage 불필요 */}
        <link rel="icon" href="/favicon.ico" type="image/png" data-lake-favicon="1" />
        {/* Tabler Icons webfont — 서식 에디터 단색 아이콘 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.34.1/dist/tabler-icons.min.css"
        />
      </head>
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var v=document.getElementById('lh-route-veil');if(v)v.remove();var b=document.body;if(b){b.style.setProperty('opacity','1','important');b.classList.remove('lh-route-leaving','lh-leaving','lh-route-enter','lh-route-forward','lh-route-back');document.querySelectorAll('.lh-route-panel-leaving').forEach(function(el){el.classList.remove('lh-route-panel-leaving');});}if(typeof Node!=='undefined'&&!Node.prototype.__lhRemoveChildPatched){Node.prototype.__lhRemoveChildPatched=true;var orig=Node.prototype.removeChild;Node.prototype.removeChild=function(child){if(!child||child.parentNode!==this)return child;try{return orig.call(this,child);}catch(e){return child;}};}}catch(e){}})();`,
          }}
        />
        <Providers>{children}</Providers>
        <div className="lh-grain" aria-hidden="true" />
        <Script src="/lakehouse-r2.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
