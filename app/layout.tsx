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
  // icons는 SiteEffects + head bootstrap이 담당 (정적 /favicon.svg가 OC·Pair 하드로드에 고착되던 문제)
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
        {/* Tabler Icons webfont — 서식 에디터 단색 아이콘 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.34.1/dist/tabler-icons.min.css"
        />
        {/* Admin 파비콘을 하드 네비 first paint에 맞춤 (lhdata/site/main localStorage) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=JSON.parse(localStorage.getItem('lhdata_site_main')||'null');var h=d&&d.favicon;if(!h||typeof h!=='string')return;h=h.trim();if(!h)return;if(h.indexOf('data:')===0&&h.length>24000)return;var u=h;if(h.indexOf('data:')!==0){try{var x=new URL(h,location.origin);x.searchParams.set('v',String(h.length));u=/^https?:/i.test(h)?x.toString():(x.pathname+x.search)}catch(e){}}document.querySelectorAll('link[rel=\"icon\"],link[rel=\"shortcut icon\"]').forEach(function(el){el.remove()});var l=document.createElement('link');l.rel='icon';l.setAttribute('data-lake-favicon','1');l.href=u;document.head.appendChild(l)}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
        <div className="lh-grain" aria-hidden="true" />
        <Script src="/lakehouse-r2.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
