import type { Club, Player, Tactic, World } from '../../contracts/src/types';
import { activePlayers, addEvent, LINEUP_ROLES, overall, TACTICS } from './world';
import { clamp, compareIds } from './primitives';

export interface TacticalProfile {
  fit: number;
  passing: number;
  defenseQuality: number;
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
  return TACTICS[
    Math.abs(club.id.split('').reduce((sum, letter) => sum + letter.charCodeAt(0), 0)) % 4
  ];
}

const tacticTradeoffs: Record<Tactic, string> = {
  balanced: '수비 안정 · 직접 슈팅 기회는 조금 줄어듭니다',
  possession: '중원 패스로 점유 · 직접 슈팅이 줄고 상대 압박을 받습니다',
  counter: '수비와 공격수로 압박을 공략 · 점유와 패스 성공을 양보합니다',
  press: '체력과 신선함으로 기회 창출 · 피로가 크고 역습에 노출됩니다',
};

/** Role quality and the opposing preset determine the same tradeoffs shown before a match. */
export function tacticalProfile(
  players: readonly Player[],
  tactic: Tactic,
  opponentTactic: Tactic = 'balanced',
): TacticalProfile {
  const average = (selected: readonly Player[], value: (player: Player) => number) =>
    selected.length
      ? selected.reduce((sum, player) => sum + value(player), 0) / selected.length
      : 50;
  const passing = clamp(
    average(
      players.filter((player) => player.role === 'MID'),
      (player) => player.passing - player.fatigue / 8,
    ),
  );
  const defenseQuality = clamp(
    average(
      players.filter((player) => player.role === 'DEF'),
      (player) => player.defense - player.fatigue / 8,
    ),
  );
  const attack = clamp(
    average(
      players.filter((player) => player.role === 'FWD'),
      (player) => player.attack - player.fatigue / 8,
    ),
  );
  const stamina = average(players, (player) => player.stamina);
  const fatigue = average(players, (player) => player.fatigue);
  const endurance = clamp(stamina - fatigue * 0.65);
  const profile: TacticalProfile = {
    fit: 0,
    passing,
    defenseQuality,
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
      profile.fit = passing * 0.65 + endurance * 0.2 + defenseQuality * 0.15;
      profile.possession += 2 + (passing - 50) * 0.18;
      profile.pass += 4.5 + (passing - 50) * 0.09;
      profile.shot -= 2.6 - (passing - 50) * 0.035;
      break;
    case 'counter':
      profile.fit = defenseQuality * 0.55 + attack * 0.45;
      profile.possession -= 5.5;
      profile.pass -= 2.5;
      profile.shot += -1.6 + (defenseQuality + attack - 100) * 0.055;
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

/** Press always costs six more fatigue points for the same player, including at the bounds. */
export function fatigueCost(player: Pick<Player, 'stamina'>, tactic: Tactic): number {
  return Math.round(
    clamp(
      (tactic === 'press' ? 16 : 10) + (50 - player.stamina) / 20,
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
  if (ids.some((id, i) => !byId.has(id) || byId.get(id)!.role !== LINEUP_ROLES[i]))
    throw new Error('활동 중인 선수로 GK 1명, DEF 4명, MID 3명, FWD 3명을 선택하세요.');
  w.lineup = [...ids];
  addEvent(
    w,
    'lineup',
    '다음 경기 선발을 정했습니다',
    `선발 11명 · 평균 피로 ${Math.round(ids.reduce((sum, id) => sum + byId.get(id)!.fatigue, 0) / 11)} · 변경할 때까지 유지합니다.`,
  );
}

/** The rest preset values recovery more heavily, trading immediate quality for fresher starters. */
export function lineupPreset(w: World, preset: 'strongest' | 'rest'): string[] {
  const players = activePlayers(w);
  const used = new Set<string>();
  return LINEUP_ROLES.flatMap((role) => {
    const candidates = players
      .filter((player) => player.role === role && !used.has(player.id))
      .sort((a, b) => {
        const penalty = preset === 'rest' ? 0.8 : 0.2;
        return (
          overall(b) - b.fatigue * penalty - (overall(a) - a.fatigue * penalty) ||
          compareIds(a.id, b.id)
        );
      });
    const chosen = candidates[0];
    if (!chosen) return [];
    used.add(chosen.id);
    return [chosen.id];
  });
}

/** Scores mirror the quantities that the event simulation uses for strength, attacks and saves. */
export function lineupSummary(players: readonly Player[]) {
  const count = players.length || 1;
  const forwards = players.filter((player) => player.role === 'FWD');
  const keeper = players.find((player) => player.role === 'GK');
  return {
    strength: Math.round(
      players.reduce((sum, player) => sum + overall(player) - player.fatigue / 6, 0) / count,
    ),
    fatigue: Math.round(players.reduce((sum, player) => sum + player.fatigue, 0) / count),
    attack: Math.round(
      forwards.reduce((sum, player) => sum + player.attack - player.fatigue / 8, 0) /
        (forwards.length || 1),
    ),
    keeper: keeper ? Math.round(keeper.keeper - keeper.fatigue / 10) : 0,
  };
}
