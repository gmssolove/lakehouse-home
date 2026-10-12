import { HomePageClient } from '@/components/home/HomePageClient';

/** 홈 셸은 정적에 가깝게 — 데이터는 클라이언트 + /api/site-section 캐시 */
export const revalidate = 120;

export default function HomePage() {
  return <HomePageClient />;
}
