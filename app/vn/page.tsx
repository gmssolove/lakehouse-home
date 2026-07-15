import type { Metadata } from 'next';
import { MainMenu } from '@/components/vn/MainMenu';

export const metadata: Metadata = {
  title: '키사라기고교 | VN',
};

export default function VnMenuPage() {
  return <MainMenu />;
}
