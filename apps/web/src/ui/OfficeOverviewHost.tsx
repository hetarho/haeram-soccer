import { lazy, Suspense, useEffect } from 'react';
import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { useGameState } from '../runtime/store';
import { useTaskState } from './taskMemory';
import { Dialog } from './Dialog';
import type { ResponsibilityKey } from '../../../../packages/contracts/src/types';
const OwnerOffice = lazy(() =>
  import('./OwnerOfficeView').then((m) => ({ default: m.OwnerOffice })),
);
const ApprovalInbox = lazy(() =>
  import('./Rich').then((module) => ({ default: module.ApprovalInbox })),
);
const ClubOverview = lazy(() =>
  import('./ClubOverview').then((module) => ({ default: module.ClubOverview })),
);
export function ClubOverviewHost() {
  const w = useGameState((state) => state.view!.world);
  const [open, setOpen] = useTaskState(w.id, 'club-summary-open', false);
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener('popstate', close);
    return () => window.removeEventListener('popstate', close);
  }, [setOpen]);
  if (!open) return null;
  return (
    <Dialog label="우리 팀 오버뷰" wide onClose={() => setOpen(false)}>
      <Suspense fallback={<p role="status">구단 현황을 여는 중…</p>}>
        <ClubOverview w={w} />
      </Suspense>
    </Dialog>
  );
}
export function ApprovalInboxHost({
  client,
  controller,
}: {
  client: GameClient;
  controller: ProgressionController;
}) {
  return (
    <Suspense fallback={null}>
      <ApprovalInbox client={client} controller={controller} />
    </Suspense>
  );
}
export function OfficeOverviewHost({
  client,
  controller,
}: {
  client: GameClient;
  controller: ProgressionController;
}) {
  const id = useGameState((state) => state.view!.world.id);
  const [open, setOpen] = useTaskState(id, 'office-overview', false);
  const [focus] = useTaskState<ResponsibilityKey | 'finance' | undefined>(
    id,
    'office-focus',
    undefined,
  );
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener('popstate', close);
    return () => window.removeEventListener('popstate', close);
  }, [setOpen]);
  if (!open) return null;
  return (
    <Dialog label="결재 설정" wide onClose={() => setOpen(false)}>
      <Suspense fallback={<p role="status">결재라인을 여는 중…</p>}>
        <OwnerOffice key={id} client={client} controller={controller} focus={focus} />
      </Suspense>
    </Dialog>
  );
}
