import Script from 'next/script';
import '../oc-route.css';
import '../pair-route.css';

/**
 * OC/Pair 공유 레이아웃.
 * 네비 직후 카드 rise가 첫 페인트에 돌지 않게 html.lh-nav-instant를 동기 적용.
 */
export default function ArchiveGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script id="lh-nav-instant-boot" strategy="beforeInteractive">{`
        try {
          if (sessionStorage.getItem('lh_nav_instant') === '1') {
            document.documentElement.classList.add('lh-nav-instant');
          }
        } catch (e) {}
      `}</Script>
      <div className="archive-layout">{children}</div>
    </>
  );
}
