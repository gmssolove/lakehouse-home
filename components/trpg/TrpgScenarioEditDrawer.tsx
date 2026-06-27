'use client';

import { useEffect, useRef, useState } from 'react';
import { TrpgEditForm } from '@/components/admin/AdminSectionPanels';
import { LakeEditModal } from '@/components/ui/LakeEditModal';
import { useLakeDialog } from '@/components/ui/LakeDialog';
import { useSaveToast } from '@/components/ui/SaveToast';
import { useOcData } from '@/lib/hooks/useOcData';
import type { TrpgScenario } from '@/lib/types/site-content';

export type TrpgEditTabId = 'basic' | 'session' | 'investigators' | 'logs' | 'gallery' | 'dice' | 'handouts';

type Props = {
  open: boolean;
  scenario: TrpgScenario;
  onClose: () => void;
  onSave: (next: TrpgScenario[]) => Promise<void>;
  allScenarios: TrpgScenario[];
  initialTab?: TrpgEditTabId;
};

export function TrpgScenarioEditDrawer({
  open,
  scenario,
  onClose,
  onSave,
  allScenarios,
  initialTab = 'basic',
}: Props) {
  const { characters } = useOcData();
  const { confirm } = useLakeDialog();
  const { showSaveToast, showDeleteToast } = useSaveToast();
  const [uploading, setUploading] = useState(false);
  const actionsRef = useRef<{ save: () => void; delete: () => void } | null>(null);

  const scenariosRef = useRef(allScenarios);
  scenariosRef.current = allScenarios;

  useEffect(() => {
    if (!open) actionsRef.current = null;
  }, [open]);

  async function persistScenario(item: TrpgScenario, close = false) {
    await onSave(scenariosRef.current.map((s) => (s.id === item.id ? item : s)));
    if (close) {
      showSaveToast();
      onClose();
    }
  }

  async function handleSave(item: TrpgScenario) {
    await persistScenario(item, true);
  }

  async function handleDelete() {
    if (!(await confirm('이 시나리오를 삭제할까요?'))) return;
    await onSave(allScenarios.filter((s) => s.id !== scenario.id));
    showDeleteToast();
    onClose();
  }

  return (
    <LakeEditModal
      open={open}
      className="lake-edit-modal--trpg"
      eyebrow="ADMIN · TRPG"
      title={scenario.title}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="lake-edit-modal__btn is-primary" onClick={() => actionsRef.current?.save()}>
            저장
          </button>
          <button type="button" className="lake-edit-modal__btn is-danger" onClick={() => void handleDelete()}>
            삭제
          </button>
        </>
      }
    >
      <TrpgEditForm
        key={`${scenario.id}-${initialTab}`}
        embed
        initialTab={initialTab}
        item={scenario}
        characters={characters}
        uploading={uploading}
        onUploadStart={() => setUploading(true)}
        onUploadEnd={() => setUploading(false)}
        onSave={(item) => void handleSave(item)}
        onPersist={(item) => void persistScenario(item)}
        onDelete={() => void handleDelete()}
        onBindActions={(actions) => {
          actionsRef.current = actions;
        }}
      />
    </LakeEditModal>
  );
}
