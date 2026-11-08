import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import type { GameClient } from '../../../runtime/client';
import { careerEnded } from '../../../../../../packages/contracts/src/owner';
import { gameActionsBlocked } from '../../../runtime/store';
import { approvalRequests } from '../../../runtime/progression';
import { answersRequest, type ApprovalRequest } from '../../../shared/routing/eventRouting';

/** Keep the authoritative client's commands, adding only the request journey's freshness guard. */
export function approvalClient(
  client: GameClient,
  request: ApprovalRequest,
  current: () => boolean,
  submitted: () => void,
  failed: (message: string) => void,
): GameClient {
  let inFlight = false;
  const isCurrent = () => client.state.view?.world.id === request.world && current();
  const pending = () => {
    const w = client.state.view?.world;
    return (
      w?.id === request.world && approvalRequests(w).some((item) => item.id === request.item.id)
    );
  };
  const command: GameClient['command'] = async (body, options) => {
    const w = client.state.view?.world;
    if (
      !w ||
      w.id !== request.world ||
      inFlight ||
      !isCurrent() ||
      gameActionsBlocked(client.state) ||
      w.critical ||
      careerEnded(w)
    )
      return;
    if (!pending()) {
      failed(sourceMessage('copy.ApprovalRequestHost.46413142a5'));
      return;
    }
    inFlight = true;
    const answers = answersRequest(w, request.item, body);
    failed('');
    try {
      const reply = await client.command(body, options);
      if (!isCurrent()) return reply;
      if (reply?.ok && answers && !pending()) submitted();
      else if (!reply?.ok) failed(reply?.error || sourceMessage('copy.approvalClient.7aaf1ef9de'));
      return reply;
    } catch (error) {
      if (isCurrent())
        failed(
          sourceMessage('copy.approvalClient.a6f90be03a', {
            p0: error instanceof Error ? error.message : String(error),
          }),
        );
      return undefined;
    } finally {
      inFlight = false;
    }
  };
  return new Proxy(client, {
    get(target, key) {
      if (key === 'command') return command;
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
