import { displayMessage, useTextLocale } from '../../presentation/text';
import { richMessage } from '../../presentation/LocalizedMessage';
import { lazy, Suspense, useEffect } from 'react';
import type { GameClient } from '../../runtime/client';
import type { ProgressionController } from '../../runtime/progression';
import { useGameState } from '../../runtime/store';
import { useTaskState } from '../../shared/routing/taskMemory';
import { Dialog } from '../../shared/ui/Dialog';
import type { ResponsibilityKey } from '../../../../../packages/contracts/src/types';
const OwnerOffice = lazy(() =>
  import('./OwnerOfficeView').then((m) => ({ default: m.OwnerOffice })),
);
const ApprovalInbox = lazy(() =>
  import('../../pages/club/ui/Rich').then((module) => ({ default: module.ApprovalInbox })),
);
const ClubOverview = lazy(() =>
  import('../../widgets/club-overview/ui/ClubOverview').then((module) => ({
    default: module.ClubOverview,
  })),
);
export function ClubOverviewHost() {
  useTextLocale();
  const w = useGameState((state) => state.view!.world);
  const [open, setOpen] = useTaskState(w.id, 'club-summary-open', false);
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener('popstate', close);
    return () => window.removeEventListener('popstate', close);
  }, [setOpen]);
  if (!open) return null;
  return (
    <Dialog
      label={displayMessage('copy.ClubOverview.409e4ac1d2')}
      wide
      onClose={() => setOpen(false)}
    >
      <Suspense fallback={<p role="status">{richMessage('copy.OfficeOverviewHost.211e374207')}</p>}>
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
  useTextLocale();
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
  useTextLocale();
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
    <Dialog
      label={displayMessage('copy.ApprovalButtons.df74662f55')}
      wide
      onClose={() => setOpen(false)}
    >
      <Suspense fallback={<p role="status">{richMessage('copy.OfficeOverviewHost.2f538e2105')}</p>}>
        <OwnerOffice key={id} client={client} controller={controller} focus={focus} />
      </Suspense>
    </Dialog>
  );
}
