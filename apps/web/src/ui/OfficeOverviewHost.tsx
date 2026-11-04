import { lazy, Suspense, useEffect } from 'react';
import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { useGameState } from '../runtime/store';
import { useTaskState } from './taskMemory';
import { Dialog } from './Dialog';
const OwnerOffice = lazy(() =>
  import('./OwnerOfficeView').then((m) => ({ default: m.OwnerOffice })),
);
const ApprovalInbox = lazy(() =>
  import('./Rich').then((module) => ({ default: module.ApprovalInbox })),
);
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
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener('popstate', close);
    return () => window.removeEventListener('popstate', close);
  }, [setOpen]);
  if (!open) return null;
  return (
    <Dialog label="결재 설정" wide onClose={() => setOpen(false)}>
      <Suspense fallback={<p role="status">결재라인을 여는 중…</p>}>
        <OwnerOffice key={id} client={client} controller={controller} />
      </Suspense>
    </Dialog>
  );
}
