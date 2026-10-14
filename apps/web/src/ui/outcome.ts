import type {
  Command,
  Event,
  TrainingFocus,
  World,
} from '../../../../packages/contracts/src/types';
import { activeTrainingFocus } from '../../../../packages/engine/src/training';
import { seasonDate } from '../../../../packages/engine/src/calendar';
import {
  activePlayers,
  clubOf,
  startingSquad,
  tacticLabel,
} from '../../../../packages/engine/src/world';
import { lineupSummary } from '../../../../packages/engine/src/strategy';
import { compactMoney, number } from './format';
import { orderIds, ownLeagueIds } from './league';
import { STADIUM_STEPS } from '../../../../packages/engine/src/facilities';

export interface OutcomeChange {
  label: string;
  value: string;
  previous?: string;
  /** Direction of the underlying value, not a judgement of the choice. */
  trend?: 'up' | 'down';
}
export interface Outcome {
  title: string;
  changes: OutcomeChange[];
  events: Pick<Event, 'title' | 'detail'>[];
  /** Records that happened but are not listed; the season detail keeps them. */
  hiddenEvents: number;
  note?: string;
}

const titles: Record<Command['type'], string> = {
  advance: '한 라운드를 진행했어요',
  'advance-days': '하루를 진행했어요',
  'next-match': '다음 경기까지 진행했어요',
  season: '시즌 끝까지 진행했어요',
  tactics: '감독에게 전술을 요청했어요',
  lineup: '다음 경기 선발을 정했어요',
  'coach-training': '코치에게 훈련 방향을 전했어요',
  hire: '새 감독을 선임했어요',
  'renew-manager': '감독과 재계약했어요',
  recruit: '선수를 영입했어요',
  'transfer-stance': '선수의 이적 상태를 바꿨어요',
  campaign: '마케팅 캠페인을 시작했어요',
  sponsor: '후원 계약을 맺었어요',
  facility: '시설 공사를 시작했어요',
  ticket: '티켓 가격을 바꿨어요',
  support: '구단주 추가 출자를 받았어요',
  'accept-condition': '훈련을 지원하고 전술을 바꿨어요',
  policy: '방향의 투자 줄을 바꿨어요',
  'hire-staff': '새 코치를 선임했어요',
  'release-staff': '코치와 계약을 정리했어요',
  'renew-staff': '코치와 재계약했어요',
  'promote-youth': '유소년을 1군으로 올렸어요',
  'release-youth': '유소년을 내보냈어요',
  intervention: '개입 수준을 바꿨어요',
  bid: '이적 제안을 보냈어요',
  'respond-bid': '이적 제안에 답했어요',
  'read-inbox': '소식을 확인했어요',
  care: '구단주 요청을 전했어요',
  build: '방향을 정했어요',
  direction: '방향을 바꿨어요',
  'contract-offer': '선수에게 계약을 제시했어요',
  'contract-decline': '선수의 계약 요구를 거절했어요',
  'sign-sponsor': '후원 계약을 맺었어요',
};
const notes: Partial<Record<Command['type'], string>> = {
  lineup: '다음 경기부터 바꿀 때까지 이 선발을 씁니다.',
  'coach-training': '받아들이거나 지시한 방향은 다음 라운드 정산부터 4라운드 동안 반영돼요.',
  campaign: '4라운드 뒤 실제 수입과 신규 팬이 정산돼요.',
  facility: '완공되는 날부터 효과가 생기고 연간 유지비가 늘어요.',
  ticket: '다음 홈 경기 관중과 입장 수입부터 반영돼요.',
  policy: '다음 라운드 정산부터 비용과 효과가 반영돼요.',
  build: '바로 적용했어요. 카드와 다이얼은 언제든 다시 바꿀 수 있어요.',
  'transfer-stance': '제안은 이적시장이 열려 있을 때 들어오고, 수락해야 이적이 성사돼요.',
};
const trainingLabel: Record<TrainingFocus, string> = {
  balanced: '균형 훈련',
  recovery: '회복 훈련',
  hard: '하드 트레이닝',
};
/** Routine ledger records carry raw minor units and fixture IDs; the cash change summarizes them. */
export const ROUTINE_EVENTS = new Set([
  'operating-cost',
  'operating-expenses',
  'match-cost',
  'gate',
  'league-share',
  'parachute',
  'match-bonus',
  'sponsor:local',
  'sponsor:kit',
  'sponsor:shirt',
  'sponsor:stadium',
  'sponsor:sleeve',
  'europe-prize',
]);
const progression = new Set<Command['type']>(['advance', 'advance-days', 'season']);

function rankOf(w: World) {
  if (!w.tables[w.playerClub]?.played) return undefined;
  return orderIds(ownLeagueIds(w), w.tables).indexOf(w.playerClub) + 1;
}
function same(a: Event, b: Event) {
  return (
    a.year === b.year &&
    a.round === b.round &&
    a.kind === b.kind &&
    a.title === b.title &&
    a.detail === b.detail &&
    a.amount === b.amount
  );
}
/** Views keep a bounded event tail, so locate the previous last record instead of comparing lengths. */
export function newEvents(before: World, after: World): Event[] {
  const last = before.events.at(-1);
  if (!last) return after.events;
  for (let i = after.events.length - 1; i >= 0; i--)
    if (same(after.events[i], last)) return after.events.slice(i + 1);
  return after.events;
}

function compare<T extends number | string>(
  changes: OutcomeChange[],
  label: string,
  before: T | undefined,
  after: T | undefined,
  format: (value: T) => string = String,
) {
  if (before === undefined || after === undefined || before === after) return;
  changes.push({
    label,
    previous: format(before),
    value: format(after),
    trend:
      typeof before === 'number' && typeof after === 'number'
        ? after > before
          ? 'up'
          : 'down'
        : undefined,
  });
}

/**
 * Explain one committed player action from recorded world facts only.
 * `next-match` opens live playback, so its result is never summarized here.
 */
export function describeOutcome(
  command: Command,
  before: World,
  after: World,
  limit = 3,
): Outcome | undefined {
  // Reading news decides nothing, live playback reveals a watched result and the season review
  // reports a closed season.
  if (
    before.id !== after.id ||
    before.year !== after.year ||
    command.type === 'next-match' ||
    command.type === 'read-inbox'
  )
    return undefined;
  const club = clubOf(after),
    previous = clubOf(before);
  // An outcome card carries recorded values as text, in the app's notation (→WEB-67).
  const cash = (value: string) => compactMoney(value, club.country, after.year);
  const changes: OutcomeChange[] = [];
  if (progression.has(command.type))
    compare(changes, '날짜', seasonDate(before), seasonDate(after));
  const a = before.tables[before.playerClub],
    b = after.tables[after.playerClub];
  if (a && b && b.played > a.played)
    changes.push({
      label: `우리 경기 ${b.played - a.played}개`,
      value: `${b.won - a.won}승 ${b.drawn - a.drawn}무 ${b.lost - a.lost}패 · 승점 ${a.points} → ${b.points}`,
    });
  compare(changes, '리그 순위', rankOf(before), rankOf(after), (n) => `${n}위`);
  if (before.cash !== after.cash) {
    const diff = BigInt(after.cash) - BigInt(before.cash);
    changes.push({
      label: '운영 자금',
      previous: cash(before.cash),
      value: `${cash(after.cash)} (${diff > 0n ? '+' : ''}${cash(diff.toString())})`,
      trend: diff > 0n ? 'up' : 'down',
    });
  }
  compare(changes, '서포터', previous.fans, club.fans, (n) => `${number(n)}명`);
  compare(
    changes,
    '선수단',
    activePlayers(before).length,
    activePlayers(after).length,
    (n) => `${n}명`,
  );
  compare(
    changes,
    '경기장',
    STADIUM_STEPS[before.stadium].capacity,
    STADIUM_STEPS[after.stadium].capacity,
    (n) => `${n.toLocaleString('en-US')}석`,
  );
  compare(changes, '훈련장', before.trainingGround, after.trainingGround, (n) => `${n}단계`);
  compare(changes, '유소년 시설', before.academyFacility, after.academyFacility, (n) => `${n}단계`);
  compare(changes, '적용 전술', tacticLabel[before.tactic], tacticLabel[after.tactic]);
  compare(
    changes,
    '훈련',
    trainingLabel[activeTrainingFocus(before)],
    trainingLabel[activeTrainingFocus(after)],
  );
  if (before.manager.id === after.manager.id)
    compare(
      changes,
      '감독 신뢰',
      Math.round(before.manager.trust),
      Math.round(after.manager.trust),
    );
  else compare(changes, '감독', before.manager.name, after.manager.name);
  compare(changes, '클럽 평판', Math.round(previous.reputation), Math.round(club.reputation));
  compare(changes, '팀 분위기', before.morale, after.morale);
  if (command.type === 'care')
    compare(
      changes,
      '선발 평균 피로',
      lineupSummary(startingSquad(before, clubOf(before)), before.tactic).fatigue,
      lineupSummary(startingSquad(after, clubOf(after)), after.tactic).fatigue,
    );
  compare(changes, '티켓 기본가', before.ticket, after.ticket, (n) => `${n} (1901년 기준)`);
  const records = newEvents(before, after).filter((event) => !ROUTINE_EVENTS.has(event.kind));
  const shown = records.slice(-limit).reverse();
  let note = notes[command.type];
  if (command.type === 'lineup' && !command.ids)
    note = '매 경기 감독이 능력과 피로를 보고 선발을 고릅니다.';
  // The owner chooses how many seasons a renewal adds (→STAFF-14).
  if (command.type === 'renew-manager') {
    const seasons = after.manager.until - before.manager.until;
    note = `계약이 ${seasons === 1 ? '한 시즌' : `${seasons}시즌`} 늘었어요. 새 연봉은 다음 라운드 정산부터 나가요.`;
  }
  // Coaches are hired, renewed and delegated per department in 사람 › 코치진 (→WEB-43, WEB-71).
  if (command.type === 'hire-staff' || command.type === 'renew-staff')
    note = '다음 라운드부터 반영돼요. 계약과 자동 결정은 사람 › 코치진에서 관리해요.';
  if (command.type === 'direction')
    note = '스태프가 맡은 결정에서 이 방향으로 골라요. 개입 수준이 그 결정을 맡길 때만 쓰여요.';
  if (command.type === 'tactics')
    note = after.manager.pending
      ? '조건부 수락이에요. 훈련 지원금을 내면 전술이 바뀝니다.'
      : before.tactic === after.tactic
        ? '적용 전술은 그대로예요. 감독의 답변을 확인하세요.'
        : '다음 경기부터 새 전술을 씁니다.';
  return {
    title: titles[command.type],
    changes,
    events: shown.map(({ title, detail }) => ({ title, detail })),
    hiddenEvents: records.length - shown.length,
    note,
  };
}
