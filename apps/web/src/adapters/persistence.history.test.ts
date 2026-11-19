import { describe, expect, it } from 'vitest';
import { canonical, validateWorld, type World } from '../../../../packages/contracts/src/index';
import { LOAD_CATALOG } from '../../../../packages/catalogs/src/index';
import {
  captureCupTitle,
  captureSeasonClose,
  managerCandidates,
  operate,
  simulateSeason,
  type MatchModelRelease,
} from '../../../../packages/engine/src/index';
import { sharedTransferredScorer } from '../../../../tests/fixtures/transferred-scorer';
import { cachedWorld } from '../../../../tests/fixtures/cached-world';
import { withoutMatchModel } from '../../../../tests/fixtures/earlier-saves';
import { simulatedWorld, withoutManagerHistory } from '../../../../tests/fixtures/worlds';
import { roundTrip } from '../../../../tests/fixtures/save-roundtrip';
import { CAREER } from './persistence.testkit';

// The archive's history, not the match model, is the subject of the two round trips below.
it('preserves first and second European phases and global standings in a saved history', () => {
  const w = cachedWorld('season from 2000', () => {
    // A career taken over in a world made fresh in 2000.
    const w = simulatedWorld({ ...CAREER, year: 2000 }, {});
    simulateSeason(w);
    return w;
  });
  expect(w.history[0].europe.find((e) => e.kind === 'ucl')?.secondStandings).toHaveLength(16);
  expect(canonical(roundTrip(w))).toBe(canonical(w));
});

it('roundtrips one transferred league scorer with both real club contributions', () => {
  const { w, playerId } = sharedTransferredScorer();
  const loaded = roundTrip(w);
  expect(canonical(loaded)).toBe(canonical(w));
  expect(loaded.scorerSeason!.players.find((p) => p.id === playerId)!.clubs).toHaveLength(2);
  const closed = cachedWorld('transferred scorer season', () => {
    const { w } = sharedTransferredScorer();
    simulateSeason(w);
    return w;
  });
  const archived = roundTrip(closed);
  expect(canonical(archived)).toBe(canonical(closed));
  expect(archived.history.at(-1)!.scorers!.some((p) => p.clubs?.length === 2)).toBe(true);
});

describe('own-manager history checkpoints (→SAVE-24)', () => {
  /**
   * A tracked career two rounds in, with a hire, a cup and a closed league finish recorded, taken
   * over under `release` (the switch as it stands unless given).
   */
  function tracked(release?: MatchModelRelease): World {
    const w = simulatedWorld({ country: 'ENG', seed: 'manager-save' }, { rounds: 2 }, release);
    w.cash = '999999999999';
    operate(w, { type: 'hire', id: managerCandidates(w).find((c) => c.source !== 'club')!.id });
    captureCupTitle(w, 'cup');
    const club = w.clubs.find((c) => c.id === w.playerClub)!;
    captureSeasonClose(w, { tier: club.tier, group: club.group });
    return w;
  }

  it('saves a tracked career and reads every fact back', () => {
    const w = tracked();
    expect(w.managerHistory!.tenures).toHaveLength(2);
    expect(w.ownMatches.every((m) => m.managerTenure === w.managerHistory!.tenures[0]!.id)).toBe(
      true,
    );
    expect(canonical(roundTrip(w))).toBe(canonical(w));
  });

  it('keeps an untracked career with attribution absent', () => {
    // A career saved before both features: no manager history and no full model.
    const w = withoutManagerHistory(withoutMatchModel(tracked()));
    const loaded = roundTrip(w);
    expect(loaded).not.toHaveProperty('managerHistory');
    expect(loaded.ownMatches.every((m) => !('managerTenure' in m))).toBe(true);
    expect(canonical(loaded)).toBe(canonical(w));
  });

  it('refuses dangling, foreign or duplicate attribution before activation', () => {
    const w = tracked();
    expect(() => validateWorld(structuredClone(w), LOAD_CATALOG)).not.toThrow();
    const dangling = structuredClone(w);
    dangling.ownMatches[0]!.managerTenure = `${w.playerClub}:tenure:9`;
    expect(() => validateWorld(dangling, LOAD_CATALOG)).toThrow('감독 이력 경기 참조');
    const foreign = structuredClone(w);
    foreign.managerHistory!.club = w.clubs.find((c) => c.id !== w.playerClub)!.id;
    foreign.managerHistory!.tenures = foreign.managerHistory!.tenures.map((t, i) => ({
      ...t,
      id: `${foreign.managerHistory!.club}:tenure:${i + 1}`,
    }));
    expect(() => validateWorld(foreign, LOAD_CATALOG)).toThrow();
    const duplicate = structuredClone(w);
    duplicate.managerHistory!.outcomes.push(duplicate.managerHistory!.outcomes[0]!);
    expect(() => validateWorld(duplicate, LOAD_CATALOG)).toThrow();
  });
});
