import type { Club, Player, Tactic, World } from '../../contracts/src/types';
import {
  activePlayers,
  addEvent,
  clubStyle,
  fatigueLoad,
  formationOf,
  ownMultiplier,
  slotOvr,
} from './world';
import { slotLine } from './player';
import { clamp, compareIds } from './primitives';
import { managerStyleEffects } from './styles';
import { synergyEffects } from './synergy';

export interface TacticalProfile {
  fit: number;
  /** Midfielders' 패스. */
  passing: number;
  /** Midfielders' 패스 and 시야: what possession plays through (→MATCH-8). */
  playmaking: number;
  /** Defenders' 태클, 위치선정 and 공중볼 (→MATCH-9). */
  defenseQuality: number;
  /** Defenders' 위치선정 and forwards' 속도: what a counter sits and runs on (→MATCH-8). */
  compactness: number;
  pace: number;
  stamina: number;
  fatigue: number;
  /** All modifiers below are percentage points, never a win probability. */
  possession: number;
  pass: number;
  shot: number;
  defense: number;
  pressure: number;
  tradeoff: string;
}

/** Stable opponent identity is shared by simulation and pre-match scouting. */
export function npcTactic(club: Pick<Club, 'id'>): Tactic {
  return clubStyle(club);
}

const tacticTradeoffs: Record<Tactic, string> = {
  balanced: '수비 안정 · 직접 슈팅 기회는 조금 줄어듭니다',
  possession: '중원 패스로 점유 · 직접 슈팅이 줄고 상대 압박을 받습니다',
  counter: '수비와 공격수로 압박을 공략 · 점유와 패스 성공을 양보합니다',
  press: '체력과 신선함으로 기회 창출 · 피로가 크고 역습에 노출됩니다',
};

/**
 * The XI's line quality at its formation's slots and the opposing preset determine the same
 * tradeoffs shown before a match (→MATCH-8, →MATCH-9): midfielders' 패스 (and 시야 for possession),
 * defenders' 태클, 위치선정 and 공중볼 (위치선정 for a counter), forwards' 슈팅 (속도 for a counter),
 * everyone's 체력.
 */
export function tacticalProfile(
  players: readonly Player[],
  tactic: Tactic,
  opponentTactic: Tactic = 'balanced',
): TacticalProfile {
  const average = (selected: readonly Player[], value: (player: Player) => number) =>
    selected.length
      ? selected.reduce((sum, player) => sum + value(player), 0) / selected.length
      : 50;
  const inLine = (line: string) => players.filter((_, i) => slotLine(tactic, i) === line);
  const fresh = (line: string, value: (attrs: Player['attrs']) => number) =>
    clamp(average(inLine(line), (player) => value(player.attrs) - fatigueLoad(player.fatigue) / 8));
  const passing = fresh('MF', (a) => a.passing),
    playmaking = fresh('MF', (a) => a.passing * 0.6 + a.vision * 0.4),
    defenseQuality = fresh('DF', (a) => (a.tackling + a.positioning + a.heading) / 3),
    compactness = fresh('DF', (a) => a.positioning),
    attack = fresh('FW', (a) => a.finishing),
    pace = fresh('FW', (a) => a.pace);
  const stamina = average(players, (player) => player.attrs.stamina);
  const fatigue = average(players, (player) => player.fatigue);
  const endurance = clamp(
    stamina - average(players, (player) => fatigueLoad(player.fatigue)) * 0.65,
  );
  const profile: TacticalProfile = {
    fit: 0,
    passing,
    playmaking,
    defenseQuality,
    compactness,
    pace,
    stamina,
    fatigue,
    possession: (passing - 55) * 0.12,
    pass: (passing - 55) * 0.24,
    shot: (attack - 55) * 0.035,
    defense: (defenseQuality - 55) * 0.1,
    pressure: 0,
    tradeoff: tacticTradeoffs[tactic],
  };
  switch (tactic) {
    case 'balanced':
      profile.fit = (passing + defenseQuality + attack + endurance) / 4;
      profile.defense += 1.4;
      profile.shot -= 0.4;
      break;
    case 'possession':
      profile.fit = playmaking * 0.65 + endurance * 0.2 + defenseQuality * 0.15;
      profile.possession += 2 + (playmaking - 50) * 0.18;
      profile.pass += 4.5 + (playmaking - 50) * 0.09;
      profile.shot -= 2.6 - (playmaking - 50) * 0.035;
      break;
    case 'counter':
      profile.fit = compactness * 0.55 + pace * 0.45;
      profile.possession -= 5.5;
      profile.pass -= 2.5;
      profile.shot += -1.6 + (compactness + pace - 100) * 0.055;
      profile.shot += opponentTactic === 'press' ? 4.5 : opponentTactic === 'possession' ? 1.5 : -1;
      profile.defense += 0.6;
      break;
    case 'press':
      profile.fit = endurance * 0.7 + attack * 0.2 + passing * 0.1;
      profile.possession += (endurance - 50) * 0.13;
      profile.shot += (endurance - 55) * 0.16 - 0.4;
      profile.shot += opponentTactic === 'possession' ? 1.2 : opponentTactic === 'counter' ? -3 : 0;
      profile.defense -= 1.5 + Math.max(0, 55 - endurance) * 0.04;
      profile.pass -= 1.5;
      profile.pressure = clamp((endurance - 40) * 0.1, 0, 6);
      break;
  }
  profile.fit = Math.round(clamp(profile.fit));
  return profile;
}

/**
 * The own club's profile: the tactic's tradeoffs plus the manager's school and active synergies,
 * shared by the simulation and the pre-match laboratory (→MATCH-9, →STAFF-14).
 */
export function ownTacticalProfile(
  w: World,
  players: readonly Player[],
  tactic: Tactic,
  opponentTactic: Tactic = 'balanced',
): TacticalProfile {
  const profile = tacticalProfile(players, tactic, opponentTactic),
    style = managerStyleEffects(w),
    synergy = synergyEffects(w);
  profile.pass += style.pass + synergy.pass;
  profile.possession += style.possession + synergy.possession;
  profile.shot += style.shot;
  profile.defense += style.defense + synergy.defense;
  return profile;
}

/** Press always costs six more fatigue points for the same player, including at the bounds. */
export function fatigueCost(player: { attrs: { stamina: number } }, tactic: Tactic): number {
  return Math.round(
    clamp(
      (tactic === 'press' ? 16 : 10) + (50 - player.attrs.stamina) / 20,
      tactic === 'press' ? 14 : 8,
      tactic === 'press' ? 19 : 13,
    ),
  );
}

export function setLineup(w: World, ids: string[] | null) {
  if (ids === null) {
    delete w.lineup;
    addEvent(
      w,
      'lineup',
      '선발을 감독에게 맡겼습니다',
      '능력과 피로를 비교해 매 경기 선발을 자동 구성합니다.',
    );
    return;
  }
  if (!Array.isArray(ids) || ids.length !== 11 || new Set(ids).size !== 11)
    throw new Error('중복 없이 선발 11명을 선택하세요.');
  const byId = new Map(activePlayers(w).map((player) => [player.id, player]));
  // Anyone may play any slot; he plays at his level there (→CLUB-6).
  if (ids.some((id) => !byId.has(id))) throw new Error('활동 중인 선수로 선발 11명을 선택하세요.');
  w.lineup = [...ids];
  addEvent(
    w,
    'lineup',
    '다음 경기 선발을 정했습니다',
    `선발 11명 · 평균 피로 ${Math.round(ids.reduce((sum, id) => sum + byId.get(id)!.fatigue, 0) / 11)} · 변경할 때까지 유지합니다.`,
  );
}

/**
 * The rest preset values recovery more heavily, trading immediate quality for fresher starters;
 * both fill the formation's slots with the best remaining pairing first.
 */
export function lineupPreset(w: World, preset: 'strongest' | 'rest'): string[] {
  const players = activePlayers(w);
  const slots = formationOf(w.tactic);
  const penalty = preset === 'rest' ? 0.8 : 0.2;
  const pairs = players.flatMap((p) =>
    slots.map((slot, i) => ({
      p,
      slot: i,
      value: slotOvr(p, slot, ownMultiplier(p)) - p.fatigue * penalty,
    })),
  );
  pairs.sort((a, b) => b.value - a.value || a.slot - b.slot || compareIds(a.p.id, b.p.id));
  const chosen: (string | undefined)[] = Array(slots.length);
  const used = new Set<string>();
  for (const pair of pairs) {
    if (chosen[pair.slot] || used.has(pair.p.id)) continue;
    chosen[pair.slot] = pair.p.id;
    used.add(pair.p.id);
  }
  return chosen.filter((id): id is string => !!id);
}

/**
 * Scores mirror the quantities that the event simulation uses for strength, attacks and saves:
 * 실효 OVR at the slots, the forwards' finishing and the keeper's reflexes.
 */
export function lineupSummary(players: readonly Player[], tactic: Tactic) {
  const count = players.length || 1;
  const slots = formationOf(tactic);
  const forwards = players.filter((_, i) => slotLine(tactic, i) === 'FW');
  const keeper = players[0];
  return {
    strength: Math.round(
      players.reduce(
        (sum, player, i) =>
          sum + slotOvr(player, slots[i]!, ownMultiplier(player)) - fatigueLoad(player.fatigue) / 6,
        0,
      ) / count,
    ),
    fatigue: Math.round(players.reduce((sum, player) => sum + player.fatigue, 0) / count),
    attack: Math.round(
      forwards.reduce(
        (sum, player) => sum + player.attrs.finishing - fatigueLoad(player.fatigue) / 8,
        0,
      ) / (forwards.length || 1),
    ),
    keeper: keeper ? Math.round(keeper.attrs.reflexes - fatigueLoad(keeper.fatigue) / 10) : 0,
  };
}
