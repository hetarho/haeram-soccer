import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import type { World } from '../../../../../../packages/contracts/src/types';
import { careerEnded } from '../../../../../../packages/contracts/src/owner';
import {
  currentDay,
  seasonDayLabel,
  seasonDayOf,
} from '../../../../../../packages/engine/src/calendar';
import type { ClientState, GameClient } from '../../../runtime/client';
import { gameActionsBlocked } from '../../../runtime/store';
import { placeAcademy, youthCall } from '../../../entities/player';

/**
 * The academy place's bounded live facts and real records (→WEB-102): the only place with owner
 * decisions, promotion and release. Reading it does not draw or settle anything.
 */
export function placeActivities(w: World) {
  const academy = placeAcademy(w);
  const facts = [
    sourceMessage('copy.placeActivityChoices.639fc9ce8e', {
      p0: academy.players.length,
      p1: academy.capacity,
      p2: academy.room.total,
    }),
    ...academy.groups.map((group) =>
      sourceMessage('copy.placeActivityChoices.1fe30589d5', {
        p0: group.label,
        p1: group.players.length,
        p2: group.factor,
      }),
    ),
    sourceMessage('copy.placeActivityChoices.fffce0d1b4', {
      p0:
        academy.intakeDone || currentDay(w) > academy.intakeDay
          ? seasonDayLabel(w.year + 1, seasonDayOf(w.year + 1, 3, 15))
          : seasonDayLabel(w.year, academy.intakeDay),
    }),
    youthCall(w),
  ];
  const records = w.events
    .filter((event) => ['youth-promotion', 'youth-release', 'youth-intake'].includes(event.kind))
    .slice(-3)
    .reverse();
  return { facts, records, academy };
}

/** One lock with the shared client guard, plus critical and replaced/stale preview protections. */
export function activityUnavailable(state: ClientState, expected: Pick<World, 'id' | 'revision'>) {
  const w = state.view?.world;
  if (!w || w.id !== expected.id) return sourceMessage('copy.placeActivityChoices.72e94ab565');
  if (w.revision !== expected.revision)
    return sourceMessage('copy.placeActivityChoices.28162087be');
  if (careerEnded(w) || w.critical) return sourceMessage('copy.ownerFigures.37b69c4bc8');
  if (!gameActionsBlocked(state)) return undefined;
  if (state.readonly) return sourceMessage('copy.placeActivityChoices.8dd5f8bdad');
  if (state.clockRunning || state.processing)
    return sourceMessage('copy.placeActivityChoices.3297b53108');
  if (state.error) return state.error;
  return sourceMessage('copy.placeActivityChoices.0e30e6b37b');
}

/** Reuse existing command/form implementations while keeping this inspection in its own world. */
export function placeActivityClient(
  client: GameClient,
  expected: Pick<World, 'id' | 'revision'>,
  current: () => boolean,
  failed: (message: string) => void,
): GameClient {
  let inFlight = false;
  const identity = { id: expected.id, revision: expected.revision };
  const isCurrent = () => current() && client.state.view?.world.id === identity.id;
  const command: GameClient['command'] = async (body, options) => {
    if (inFlight || !current()) return;
    const reason = activityUnavailable(client.state, identity);
    if (reason) {
      if (isCurrent()) failed(reason);
      return;
    }
    inFlight = true;
    failed('');
    try {
      const reply = await client.command(body, options);
      if (!isCurrent()) return;
      if (!reply?.ok) failed(reply?.error || sourceMessage('copy.approvalClient.7aaf1ef9de'));
      return reply;
    } catch (error) {
      if (isCurrent()) failed(error instanceof Error ? error.message : String(error));
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
