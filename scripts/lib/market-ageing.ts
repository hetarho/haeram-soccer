import type { World } from '../../packages/contracts/src/types';
import { AGEING, ageingCurve } from '../../packages/engine/src/player';
import { overall } from '../../packages/engine/src/player-state';
import { startingSquad } from '../../packages/engine/src/world';

interface Career {
  born: number;
  onset: number;
  strength: Map<number, number>;
  regularAt30: boolean;
}

/** Follow individual opening ratings. A skipped summer never supplies a fictitious observation. */
export class MarketAgeingCareers {
  private readonly careers = new Map<string, Career>();
  private lastYear = 0;

  read(world: World) {
    this.lastYear = world.year;
    for (const club of world.clubs) {
      const squad = world.squads?.[club.id];
      if (!squad) continue;
      const regulars = squad.some((player) => world.year - player.born === 30)
        ? new Set(startingSquad(world, club).map((player) => player.id))
        : undefined;
      for (const player of squad) {
        const age = world.year - player.born;
        if (age < 24 || age > 38) continue;
        let career = this.careers.get(player.id);
        if (!career) {
          career = {
            born: player.born,
            onset: AGEING.pace.declineFrom + ageingCurve(world.seed, player.id).shift,
            strength: new Map(),
            regularAt30: false,
          };
          this.careers.set(player.id, career);
        }
        career.strength.set(age, overall(player));
        if (age === 30 && regulars?.has(player.id)) career.regularAt30 = true;
      }
    }
  }

  summarize() {
    const onsetAges: Record<number, number> = {};
    const nearPeak = {
      through34: { eligible: 0, observed: 0, stayed: 0 },
      through37: { eligible: 0, observed: 0, stayed: 0 },
    };
    const twoYearLoss = { observed: 0, lostSix: 0 };
    for (const career of this.careers.values()) {
      const { born, onset, regularAt30, strength } = career;
      if (strength.has(24)) onsetAges[onset] = (onsetAges[onset] ?? 0) + 1;
      const before = strength.get(onset - 1);
      const after = strength.get(onset + 1);
      if (before !== undefined && after !== undefined && strength.has(onset)) {
        twoYearLoss.observed++;
        if (before - after >= 6) twoYearLoss.lostSix++;
      }
      if (!regularAt30) continue;
      const prePeak = valuesThrough(strength, 24, 30);
      if (prePeak.length < 7) continue;
      for (const [target, read] of [
        [34, nearPeak.through34],
        [37, nearPeak.through37],
      ] as const) {
        if (born + target > this.lastYear) continue;
        read.eligible++;
        const after30 = valuesThrough(strength, 31, target);
        if (after30.length < target - 30) continue;
        read.observed++;
        const peak = Math.max(...prePeak, ...after30);
        if ([prePeak.at(-1)!, ...after30].every((value) => value >= peak - 3)) read.stayed++;
      }
    }
    return { onsetAges, nearPeak, twoYearLoss };
  }
}

function valuesThrough(strength: ReadonlyMap<number, number>, from: number, to: number) {
  const values: number[] = [];
  for (let age = from; age <= to; age++) {
    const value = strength.get(age);
    if (value !== undefined) values.push(value);
  }
  return values;
}
