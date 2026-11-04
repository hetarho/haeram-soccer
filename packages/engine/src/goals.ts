import { message as sourceMessage } from '../../contracts/src/messages';
import { careerPromotion } from './career-reads';
import type { World } from '../../contracts/src/types';
import { clubOf, ownSeasons } from './player-state';

export interface ClubGoal {
  id: string;
  title: string;
  description: string;
  action: string;
  current: number;
  target: number;
  done: boolean;
  progress: number;
}

function goal(
  id: string,
  title: string,
  description: string,
  action: string,
  value: number,
  target: number,
): ClubGoal {
  const earned = Math.round(Math.max(0, value) * 100) / 100;
  const current = Math.min(target, earned);
  return {
    id,
    title,
    description,
    action,
    current,
    target,
    done: earned >= target,
    progress: Math.round(Math.min(100, (earned / target) * 100) * 100) / 100,
  };
}

/** Retained canonical facts are the only source; reading milestones never awards or writes anything. */
export function clubMilestones(w: World) {
  const own = clubOf(w),
    archived = w.careerReads ? [] : [...ownSeasons(w)].sort((a, b) => a.year - b.year),
    wins =
      w.careerReads?.wins ??
      w.ownMatches.filter((match) =>
        match.home === w.playerClub
          ? match.score.home > match.score.away
          : match.score.away > match.score.home,
      ).length;
  const hasPromotion =
    (w.careerReads ? careerPromotion(w) : w.events.some((event) => event.kind === 'promotion')) ||
    archived.some((season, index) => season.tier > (archived[index + 1]?.tier ?? own.tier));
  const goals: ClubGoal[] = [
    goal(
      'debut',
      sourceMessage('copy.goals.e48985f15c'),
      sourceMessage('copy.goals.d2f198cf02'),
      sourceMessage('copy.goals.4e02a6760d'),
      Math.max(
        w.ownMatches.length,
        w.tables[w.playerClub]?.played || 0,
        w.careerReads?.bestPlayed ?? 0,
        ...archived.map((season) => season.played),
      ),
      1,
    ),
    goal(
      'first-win',
      sourceMessage('copy.goals.a17eac6a35'),
      sourceMessage('copy.goals.d27444fa04'),
      sourceMessage('copy.goals.c6c811d41d'),
      Math.max(
        wins,
        w.tables[w.playerClub]?.won || 0,
        w.careerReads?.bestWon ?? 0,
        ...archived.map((season) => season.won),
      ),
      1,
    ),
    goal(
      'player-growth',
      sourceMessage('copy.goals.163c32fb41'),
      sourceMessage('copy.goals.c264eb7850'),
      sourceMessage('copy.goals.dea6f164bb'),
      w.players.reduce((sum, player) => sum + (player.developed || 0), 0),
      1,
    ),
    goal(
      'facilities',
      sourceMessage('copy.goals.1c4d522ad0'),
      sourceMessage('copy.goals.95d4ff88ff'),
      // No career starts a work (→ECON-32): a work under way opens it.
      sourceMessage('copy.goals.77905c5c5b'),
      w.stadium,
      1,
    ),
    goal(
      'supporters',
      sourceMessage('copy.goals.af120907db'),
      sourceMessage('copy.goals.2f7333308d'),
      sourceMessage('copy.goals.cceccf5dce'),
      Math.max(own.fans, w.careerReads?.bestFans ?? 0, ...archived.map((season) => season.fans)),
      1000,
    ),
    goal(
      'season',
      sourceMessage('copy.goals.585c8a88bb'),
      sourceMessage('copy.goals.3001b4d1be'),
      sourceMessage('copy.goals.66d026b264'),
      // `careerReads.history` counts every archive read, the world's seasons before the owner too.
      w.careerReads ? ownSeasons(w).length : archived.length,
      1,
    ),
    goal(
      'promotion',
      sourceMessage('copy.goals.957608c5cf'),
      sourceMessage('copy.goals.27fe78eb70'),
      sourceMessage('copy.goals.3583e44f21'),
      hasPromotion ? 1 : 0,
      1,
    ),
  ];
  return {
    goals,
    next: goals.find((item) => !item.done),
    completed: goals.filter((item) => item.done).length,
    total: goals.length,
  };
}
