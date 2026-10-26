import type { Club, Fixture } from '../../contracts/src/types';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { playGrid } from './grid/engine';
import { buildGridSetup } from './grid/setup';
import { createWorld, rating, simulateMatch } from './index';

// Coarse guards on the calibrated strength curve (docs/CALIBRATION.md, scripts/calibrate.ts):
// one rating point ≈ 16 Elo, draws and upsets as in long-run European top-flight football.
// The guard world never activates the model, whatever the switch: the summary and grid samples
// play the model a world carries, so they guard the pre-feature figures recorded with them. On the
// candidate (T419, same clubs and counts) the grid's +20 favourite wins 87.5%, equal sides score
// 3.12 and a +39 giant's matches 4.03 goals, and the summary samples, which the aggregate plays
// there, give equal sides 20.9% draws and the giant's matches 4.27 goals: residuals for T410.
export const w = createWorld(
  {
    country: 'ENG',
    name: 'Calibration Guard',
    color: '#335577',
    seed: 'calibration-guard',
    level: 'normal' as const,
  },
  DISABLED_RELEASE,
);
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

export type Path = 'summary' | 'grid';
/** Fixtures per sample: a grid match takes about 40 ms, the summary well under 1 ms. */
const COUNT: Record<Path, number> = { summary: 1600, grid: 480 };

const play = (f: Fixture, path: Path) =>
  path === 'grid'
    ? playGrid(buildGridSetup(w, f, { observe: false, recordPlayers: false })).record
    : simulateMatch(w, f).record;

/** Home and away pools play the path's sample; gap is home strength minus away. */
export function sample(home: Club[], away: Club[], path: Path) {
  const t = { w: 0, d: 0, l: 0, goals: 0, gap: 0, shots: 0 };
  for (let i = 0; i < COUNT[path]; i++) {
    const h = home[i % home.length],
      a = away[Math.floor(i / home.length) % away.length];
    if (h === a) continue;
    const f: Fixture = {
      id: `guard:${h.id}:${a.id}:${i}`,
      year: w.year,
      round: 1,
      kind: 'league',
      home: h.id,
      away: a.id,
      country: 'ENG',
      groupKey: 'ENG:0:0',
    };
    const { score, metrics } = play(f, path);
    t.gap += rating(w, h) + 3 - rating(w, a);
    t.goals += score.home + score.away;
    t.shots += metrics[0][4] + metrics[1][4];
    if (score.home > score.away) t.w++;
    else if (score.home === score.away) t.d++;
    else t.l++;
  }
  const n = t.w + t.d + t.l;
  return {
    win: t.w / n,
    draw: t.d / n,
    loss: t.l / n,
    goals: t.goals / n,
    gap: t.gap / n,
    shots: t.shots / n / 2,
  };
}

export const level = clubs(77),
  rival = clubs(77),
  favourite = clubs(86),
  underdog = clubs(69),
  giant = clubs(95),
  minnow = clubs(58);

/**
 * A grid sample runs 70–80 s alone since T218's own matches; the full suite on a loaded machine
 * pushes it past 120 s (261020: three timeouts at load 20, each passing alone), so allow 6 minutes.
 */
export const SLOW = 360000;
