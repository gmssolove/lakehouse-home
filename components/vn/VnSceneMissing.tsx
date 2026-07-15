'use client';

import { useRouter } from 'next/navigation';
import { closeVnToArchiveOrMenu } from '@/components/vn/MainMenu';

type Props = {
  sceneId: string;
};

export function VnSceneMissing({ sceneId }: Props) {
  const router = useRouter();

  return (
    <div className="vn-missing">
      <p>존재하지 않는 씬입니다.</p>
      <p>
        <code>{sceneId}</code>
      </p>
      <button type="button" className="detail-back-btn" onClick={() => closeVnToArchiveOrMenu(router)}>
        닫기
      </button>
    </div>
  );
}
