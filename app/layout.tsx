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
  preload: false,
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  style: ['italic', 'normal'],
  weight: ['400', '500', '600'],
  variable: '--font-cormorant',
  display: 'swap',
  preload: false,
});

const cormorantUpright = Cormorant_Upright({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-cormorant-upright',
  display: 'swap',
  preload: false,
});

const imFell = IM_Fell_English({
  subsets: ['latin'],
  style: ['italic', 'normal'],
  weight: ['400'],
  variable: '--font-im-fell',
  display: 'swap',
  preload: false,
});

const marcellus = Marcellus({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-marcellus',
  display: 'swap',
  preload: false,
});

const pinyon = Pinyon_Script({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-pinyon',
  display: 'swap',
  preload: true,
  adjustFontFallback: false,
});

const mySoul = My_Soul({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-my-soul',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
});

const gowunDodum = Gowun_Dodum({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-gowun-dodum',
  display: 'swap',
  preload: false,
});

const quicksand = Quicksand({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-quicksand',
  display: 'swap',
  preload: false,
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
        <link rel="icon" href="/favicon.ico" type="image/png" data-lake-favicon="1" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var h=localStorage.getItem('lake_favicon_href');if(!h)return;var l=document.querySelector('link[data-lake-favicon="1"]');if(!l)return;l.type=/svg/i.test(h)?'image/svg+xml':'image/png';l.href=h;}catch(e){}})();`,
          }}
        />
        <link rel="preconnect" href="https://img.lakehouse.me.kr" />
        <link rel="dns-prefetch" href="https://img.lakehouse.me.kr" />
        {/* Tabler는 load 이후 — jsdelivr가 멈추면 탭 스피너가 안 끝남 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){function add(){if(document.getElementById('tabler-icons'))return;var l=document.createElement('link');l.id='tabler-icons';l.rel='stylesheet';l.href='https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.34.1/dist/tabler-icons.min.css';document.head.appendChild(l);}if(document.readyState==='complete')add();else window.addEventListener('load',add,{once:true});})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){function ready(){document.documentElement.classList.add('lh-fonts-ready')}try{if(document.fonts){document.fonts.ready.then(ready);var fam=getComputedStyle(document.documentElement).getPropertyValue('--font-pinyon').trim().split(',')[0].replace(/['\"]/g,'');if(fam)document.fonts.load('400 28px '+fam).then(ready,ready);}else ready();setTimeout(ready,1200);}catch(e){ready()}try{var v=document.getElementById('lh-route-veil');if(v)v.remove();var b=document.body;if(b){b.style.setProperty('opacity','1','important');b.classList.remove('lh-route-leaving','lh-leaving','lh-route-enter','lh-route-forward','lh-route-back');document.querySelectorAll('.lh-route-panel-leaving').forEach(function(el){el.classList.remove('lh-route-panel-leaving');});}if(typeof Node!=='undefined'&&!Node.prototype.__lhRemoveChildPatched){Node.prototype.__lhRemoveChildPatched=true;var orig=Node.prototype.removeChild;Node.prototype.removeChild=function(child){if(!child||child.parentNode!==this)return child;try{return orig.call(this,child);}catch(e){return child;}};}}catch(e){}})();`,
          }}
        />
        <Providers>{children}</Providers>
        <div className="lh-grain" aria-hidden="true" />
        <Script src="/lakehouse-r2.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
