import type {
  Club,
  Fixture,
  MatchPlayback,
  MatchRecord,
  Player,
  Tactic,
  World,
} from '../../contracts/src/types';
import { clamp, integer, random, zeroMetrics } from './primitives';
import { rating, startingSquad, findClub, TACTICS } from './world';
export const METRICS = [
  '득점',
  '도움',
  '패스 시도',
  '패스 성공',
  '슛',
  '유효슛',
  '태클',
  '인터셉트',
  '드리블',
  '선방',
  '출전 분',
  '점유 분',
];
export function simulateMatch(
  w: World,
  f: Fixture,
  observe = false,
  keepPlayers = false,
): MatchPlayback {
  const home = findClub(w, f.home),
    away = findClub(w, f.away);
  const teams: [Club, Club] = [home, away];
  const r = random(`${w.seed}:match:${f.id}`),
    visual = random(`${w.seed}:visual:${f.id}`),
    contribution = random(`${w.seed}:contribution:${f.id}`);
  const squads: [Player[], Player[]] = [startingSquad(w, home), startingSquad(w, away)];
  const strength = [
    rating(w, home) + 3 + (home.id === w.playerClub ? (w.manager.ability - 50) / 4 : 4),
    rating(w, away) + (away.id === w.playerClub ? (w.manager.ability - 50) / 4 : 4),
  ];
  const tactics: [Tactic, Tactic] = teams.map((c) =>
    c.id === w.playerClub
      ? w.tactic
      : TACTICS[Math.abs(c.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % 4],
  ) as [Tactic, Tactic];
  const metrics: [number[], number[]] = [zeroMetrics(), zeroMetrics()];
  const contributions = squads.map((ps) => ps.map(() => zeroMetrics()));
  const frames: MatchPlayback['frames'] = [];
  const highlights: MatchRecord['highlights'] = [];
  const possessionChance =
    clamp(
      50 +
        (strength[0] - strength[1]) / 2 +
        (tactics[0] === 'possession' ? 8 : 0) -
        (tactics[1] === 'possession' ? 8 : 0),
      20,
      80,
    ) / 100;
  for (let minute = 1; minute <= 90; minute++) {
    const side: 0 | 1 = r() < possessionChance ? 0 : 1;
    const other: 0 | 1 = side === 0 ? 1 : 0;
    const actor = integer(r, 8, 10),
      passCount = integer(r, 5, 12);
    const accuracy = clamp(
      68 +
        strength[side] / 6 +
        (tactics[side] === 'possession' ? 9 : 0) -
        (tactics[other] === 'press' ? 5 : 0) +
        integer(r, -8, 8),
      35,
      96,
    );
    const passes = Math.round((passCount * accuracy) / 100);
    metrics[side][11]++;
    metrics[side][2] += passCount;
    metrics[side][3] += passes;
    const dribble = r() < 0.24;
    const shot =
      r() < (tactics[side] === 'press' ? 0.21 : tactics[side] === 'counter' ? 0.19 : 0.16);
    const onTarget =
      r() <
      clamp(42 + (squads[side][actor].attack - squads[side][actor].fatigue / 8) / 4, 35, 78) / 100;
    const goal =
      r() <
      clamp(
        25 +
          (squads[side][actor].attack -
            squads[side][actor].fatigue / 8 -
            squads[other][0].keeper +
            squads[other][0].fatigue / 10) /
            3,
        8,
        48,
      ) /
        100;
    let action = '패스';
    if (dribble) {
      metrics[side][8]++;
      action = '돌파';
    }
    if (!shot && passes < passCount) {
      metrics[other][6]++;
      metrics[other][7]++;
      action = '인터셉트';
    }
    if (shot) {
      metrics[side][4]++;
      action = '슛';
      if (onTarget) {
        metrics[side][5]++;
        if (goal) {
          metrics[side][0]++;
          metrics[side][1]++;
          action = '골';
          highlights.push({ minute, side, player: squads[side][actor].name, action });
        } else {
          metrics[other][9]++;
          action = '선방';
        }
      }
    }
    if (keepPlayers || observe) {
      const sampledPasser = integer(contribution, 5, 7);
      const passer = sampledPasser === actor ? 5 + ((sampledPasser - 5 + 1) % 3) : sampledPasser;
      contributions[side][passer][2] += passCount;
      contributions[side][passer][3] += passes;
      contributions[side][actor][8] += dribble ? 1 : 0;
      if (shot) {
        contributions[side][actor][4]++;
        if (onTarget) {
          contributions[side][actor][5]++;
          if (goal) {
            contributions[side][actor][0]++;
            contributions[side][passer][1]++;
          } else contributions[other][0][9]++;
        }
      }
      if (!shot && passes < passCount) {
        const defender = integer(contribution, 1, 4);
        contributions[other][defender][6]++;
        contributions[other][defender][7]++;
      }
    }
    if (observe)
      frames.push({
        minute,
        score: { home: metrics[0][0], away: metrics[1][0] },
        metrics: [metrics[0].slice(), metrics[1].slice()],
        ball: [
          side === 0 ? integer(visual, 35, 95) : integer(visual, 5, 65),
          integer(visual, 10, 90),
        ],
        side,
        player: actor,
        action,
      });
  }
  metrics[0][10] = 90;
  metrics[1][10] = 90;
  for (const ps of contributions) for (const s of ps) s[10] = 90;
  const record: MatchRecord = {
    ...f,
    score: { home: metrics[0][0], away: metrics[1][0] },
    metrics,
    players:
      keepPlayers || observe
        ? squads.flatMap((ps, side) =>
            ps.map((p, i) => ({ id: p.id, metrics: contributions[side][i] })),
          )
        : [],
    highlights,
    tactics,
  };
  return { record, frames, squads };
}
