import type { CareKind, World } from '../../../../packages/contracts/src/types';
import { activePlayers } from '../../../../packages/engine/src/player-state';
import { currentDay, seasonDayLabel, seasonDayOf } from '../../../../packages/engine/src/calendar';
import type { ClientState, GameClient } from '../runtime/client';
import { gameActionsBlocked } from '../runtime/store';
import { careRequest, placeAcademy, placeTraining } from './teamState';
import { squadRegistration } from './squadRegistration';

export type ActivityPlace = 'manager' | 'coaching' | 'training' | 'academy';

const REQUESTS: Record<ActivityPlace, readonly CareKind[]> = {
  manager: ['backing', 'meeting', 'owner-visit', 'win-bonus'],
  coaching: ['recovery', 'bonding'],
  training: ['rest-day', 'camp', 'friendly'],
  academy: [],
};

/** Bounded live facts and genuine requests; reading a place does not draw or settle anything. */
export function placeActivities(w: World, place: ActivityPlace) {
  const choices = REQUESTS[place].map((kind) => careRequest(w, kind));
  const training = place === 'academy' ? placeTraining(w, 'youth') : placeTraining(w, 'assistant');
  const academy = place === 'academy' ? placeAcademy(w) : undefined;
  const players = activePlayers(w);
  const fatigue = Math.round(
    players.reduce((sum, player) => sum + player.fatigue, 0) / Math.max(1, players.length),
  );
  const facts =
    place === 'manager'
      ? [
          `감독 ${w.manager.name}${w.manager.interim ? ' · 대행' : ''}`,
          `감독 신뢰 ${Math.round(w.manager.trust)} · 분위기 ${w.morale ?? '기록 없음'}`,
        ]
      : academy
        ? [
            `유소년 ${academy.players.length}/${academy.capacity}명 · 1군 자리 ${academy.room.total}개`,
            ...academy.groups.map(
              (group) => `${group.label} ${group.players.length}명 · 성장 ×${group.factor}`,
            ),
            `다음 입단 ${
              academy.intakeDone || currentDay(w) > academy.intakeDay
                ? seasonDayLabel(w.year + 1, seasonDayOf(w.year + 1, 3, 15))
                : seasonDayLabel(w.year, academy.intakeDay)
            }`,
          ]
        : [
            `선수단 ${squadRegistration(w).value}명 · 평균 피로 ${fatigue} · 분위기 ${w.morale ?? '기록 없음'}`,
          ];
  if (place !== 'manager')
    facts.push(`${training.role} ${training.member} · ${training.focus} · ${training.call.reason}`);
  const kinds = new Set(REQUESTS[place].map((kind) => `care:${kind}`));
  const records = w.events
    .filter(
      (event) =>
        kinds.has(event.kind) ||
        (place === 'manager' && event.kind === 'win-bonus') ||
        (place === 'academy' &&
          ['youth-promotion', 'youth-release', 'youth-intake'].includes(event.kind)) ||
        (place !== 'manager' &&
          event.kind === 'training-focus' &&
          event.title.includes(training.role)),
    )
    .slice(-3)
    .reverse();
  return { choices, facts, records, training, academy };
}

/** One lock with the shared client guard, plus critical and replaced/stale preview protections. */
export function activityUnavailable(state: ClientState, expected: Pick<World, 'id' | 'revision'>) {
  const w = state.view?.world;
  if (!w || w.id !== expected.id) return '다른 게임으로 바뀌었어요. 현재 장소를 다시 열어 주세요.';
  if (w.revision !== expected.revision) return '조건이 바뀌었어요. 최신 내용을 다시 확인해 주세요.';
  if (w.bankrupt || w.critical) return '진행을 막는 구단 상황을 먼저 확인해 주세요.';
  if (!gameActionsBlocked(state)) return undefined;
  if (state.readonly) return '읽기 전용 탭에서는 요청할 수 없어요.';
  if (state.clockRunning || state.processing)
    return '달력 진행과 처리가 모두 멈춘 뒤 요청할 수 있어요.';
  if (state.error) return state.error;
  return '다른 요청을 처리하고 있어요.';
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
      if (!reply?.ok) failed(reply?.error || '처리하지 못했어요. 다시 시도해 주세요.');
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
