import type { Club } from '../../contracts/src/types';
import { careerWorld } from './career.testkit';

// Coarse guards on the calibrated strength curve (artifacts/benchmarks/calibration-results.json, scripts/calibrate.ts):
// one rating point ≈ 16 Elo, draws and upsets as in long-run European top-flight football.
// The guard world plays the released model: its clubs nobody owns meet on the aggregate path
// (→MATCH-22), so the samples guard the curve that path holds.
export const w = careerWorld({ seed: 'calibration-guard' });
let serial = 0;
/** Eight clubs per strength, so tactics and generated squads vary across the sample. */
function clubs(strength: number) {
  return Array.from({ length: 8 }, (): Club => {
    const club: Club = {
      id: `GUARD:0:0:${serial++}`,
      name: `Guard ${serial}`,
      short: 'GRD',
      country: 'ENG',
      tier: 0,
      group: 0,
      strength,
      reputation: 50,
      fans: 10000,
      color: '#335577',
    };
    w.clubs.push(club);
    return club;
  });
}

export const level = clubs(77),
  rival = clubs(77),
  favourite = clubs(86),
  underdog = clubs(69),
  giant = clubs(95),
  minnow = clubs(58);

/** A loaded machine can slow a sample well past vitest's default, so allow 6 minutes. */
export const SLOW = 360000;
