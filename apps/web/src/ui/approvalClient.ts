import type { GameClient } from '../runtime/client';
import { gameActionsBlocked } from '../runtime/store';
import { stoppingEvents } from '../runtime/progression';
import { answersRequest, type ApprovalRequest } from './eventRouting';

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
    return w?.id === request.world && stoppingEvents(w).some((item) => item.id === request.item.id);
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
      w.bankrupt
    )
      return;
    if (!pending()) {
      failed('이미 처리되었거나 조건이 바뀐 요청이에요. 홈에서 최신 요청을 확인해 주세요.');
      return;
    }
    inFlight = true;
    const answers = answersRequest(w, request.item, body);
    failed('');
    try {
      const reply = await client.command(body, options);
      if (!isCurrent()) return reply;
      if (reply?.ok && answers && !pending()) submitted();
      else if (!reply?.ok) failed(reply?.error || '처리하지 못했어요. 다시 시도해 주세요.');
      return reply;
    } catch (error) {
      if (isCurrent())
        failed(`${error instanceof Error ? error.message : String(error)} 다시 시도해 주세요.`);
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
