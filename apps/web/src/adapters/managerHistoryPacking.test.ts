import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import type { World } from '../../../../packages/contracts/src/types';
import {
  CURRENT_CHECKPOINT_SCHEMA,
  FULL_MODEL_CHECKPOINT_SCHEMA,
  isSaveCompatibilityError,
  MANAGER_HISTORY_CHECKPOINT_SCHEMA,
} from '../../../../packages/contracts/src/versions';
import {
  advanceRound,
  captureCupTitle,
  captureSeasonClose,
  managerCandidates,
  operate,
  type MatchModelRelease,
} from '../../../../packages/engine/src/index';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/releases';
import {
  simulatedWorld,
  withCandidateModel,
  withoutManagerHistory,
} from '../../../../tests/fixtures/worlds';
import { pack, unpack } from './packing';
import { checkpointContainerFor, type PackedManagerHistory } from './managerHistoryPacking';

/**
 * A tracked career two rounds in whose facts hold every field shape: an owner hire, a resignation
 * with an interim, a person-linked manager, all three outcome kinds, and the first record treated
 * as settled before tracking (unattributed). Founded under `release`, the switch as it stands
 * unless given.
 */
function career(release?: MatchModelRelease): World {
  const w = simulatedWorld(
    {
      country: 'ENG',
      name: 'Packed Tenures',
      color: '#335577',
      seed: 'manager-packing',
      level: 'easy',
    },
    { rounds: 2 },
    release,
  );
  w.cash = '999999999999';
  delete w.ownMatches[0]!.managerTenure;
  operate(w, { type: 'hire', id: managerCandidates(w).find((c) => c.source !== 'club')!.id });
  w.manager = { ...w.manager, pride: 90, trust: 20, conflicts: 2 };
  operate(w, { type: 'tactics', tactic: 'counter', tone: 'demand' });
  // The owner replaces the interim the resignation left in charge.
  operate(w, { type: 'hire', id: managerCandidates(w).find((c) => c.source !== 'club')!.id });
  captureCupTitle(w, 'cup');
  const club = w.clubs.find((c) => c.id === w.playerClub)!;
  captureSeasonClose(w, { tier: club.tier + 1, group: 0 });
  w.managerHistory!.tenures[0] = { ...w.managerHistory!.tenures[0]!, person: w.players[0]!.id };
  // Play on to the next own result, settled under the latest tenure.
  const settled = w.ownMatches.length;
  for (let n = 0; n < 4 && w.ownMatches.length === settled; n++) advanceRound(w, undefined, false);
  return w;
}
const roundTrip = (w: World) => unpack(JSON.parse(JSON.stringify(pack(w))));
/** What unpacking reports after `edit` changed the packed history section. */
function readBroken(w: World, edit: (section: PackedManagerHistory) => void) {
  const packed = JSON.parse(JSON.stringify(pack(w)));
  edit(packed.managerHistory);
  try {
    unpack(packed);
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('manager-history packing (→SAVE-24)', () => {
  it('round trips every fact, date and link exactly, and omits an untracked career', () => {
    const w = career();
    const facts = w.managerHistory!;
    expect(facts.tenures.length).toBeGreaterThanOrEqual(3);
    expect(facts.tenures[0]!.person).toBeDefined();
    expect(facts.tenures.some((t) => t.interim && t.departure === 'replaced')).toBe(true);
    expect(facts.tenures.some((t) => t.departure === 'resigned')).toBe(true);
    expect(new Set(facts.outcomes.map((o) => o.source.kind))).toEqual(
      new Set(['cup-title', 'league-finish', 'promotion']),
    );
    expect(w.ownMatches[0]!.managerTenure).toBeUndefined();
    expect(w.ownMatches.at(-1)!.managerTenure).toBe(facts.tenures.at(-1)!.id);
    const packed = pack(w);
    // The facts travel only in their section; the compact world carries none of them inline.
    expect(packed.world.managerHistory).toBeUndefined();
    expect(packed.managerHistory!.records![0]).toBe(0);
    expect(canonical(roundTrip(w))).toBe(canonical(w));
    const plain = withoutManagerHistory(structuredClone(w));
    expect(pack(plain).managerHistory).toBeUndefined();
    expect(canonical(roundTrip(plain))).toBe(canonical(plain));
  });

  it('selects the manager-history container whether or not the full model is active', () => {
    // Founded with the release off: the full model is active only where the case records it.
    const w = career(DISABLED_RELEASE);
    expect(checkpointContainerFor(w)).toBe(MANAGER_HISTORY_CHECKPOINT_SCHEMA);
    const modelled = withCandidateModel(structuredClone(w));
    expect(checkpointContainerFor(modelled)).toBe(MANAGER_HISTORY_CHECKPOINT_SCHEMA);
    expect(canonical(roundTrip(modelled))).toBe(canonical(modelled));
    expect(checkpointContainerFor(withoutManagerHistory(structuredClone(modelled)))).toBe(
      FULL_MODEL_CHECKPOINT_SCHEMA,
    );
    expect(checkpointContainerFor(withoutManagerHistory(structuredClone(w)))).toBe(
      CURRENT_CHECKPOINT_SCHEMA,
    );
    // A link alone is history too, and without its facts it cannot be written.
    const link = withoutManagerHistory(structuredClone(w));
    link.ownMatches[1]!.managerTenure = `${w.playerClub}:tenure:1`;
    expect(checkpointContainerFor(link)).toBe(MANAGER_HISTORY_CHECKPOINT_SCHEMA);
    expect(() => pack(link)).toThrow('감독 이력');
  });

  it('refuses a newer section as incompatible and malformed data as corruption', () => {
    const w = career();
    expect(isSaveCompatibilityError(readBroken(w, (s) => (s.version = 2 as 1)))).toBe(true);
    const tenures = w.managerHistory!.tenures.length;
    const recorded = w.ownMatches.length;
    for (const edit of [
      (s: PackedManagerHistory) => s.header.pop(),
      (s: PackedManagerHistory) => (s.header[4] = 2),
      (s: PackedManagerHistory) => s.tenures.pop(),
      (s: PackedManagerHistory) => (s.tenures[3] = 2),
      (s: PackedManagerHistory) => (s.tenures[11] = 9),
      // A dictionary ref past the end.
      (s: PackedManagerHistory) => (s.tenures[0] = 10_000_000),
      // An absent date with a day; an outcome with a filled unused column.
      (s: PackedManagerHistory) => {
        const last = s.tenures.length - 14;
        s.tenures[last + 9] = 0;
        s.tenures[last + 10] = 4;
      },
      (s: PackedManagerHistory) => (s.outcomes[11] = 1),
      // Dangling tenures: an outcome or a record pointing past them.
      (s: PackedManagerHistory) => (s.outcomes[2] = tenures),
      (s: PackedManagerHistory) => (s.records![s.records!.length - 2] = tenures + 1),
      // A duplicate source, a broken run and a link section that links nothing.
      (s: PackedManagerHistory) => s.outcomes.push(...s.outcomes.slice(0, 12)),
      (s: PackedManagerHistory) => s.records!.push(0, 1),
      (s: PackedManagerHistory) => (s.records = [0, recorded]),
    ]) {
      const failure = readBroken(w, edit);
      expect(failure, edit.toString()).toBeInstanceOf(Error);
      expect(isSaveCompatibilityError(failure)).toBe(false);
    }
    // Facts inline in the compact world are malformed, not a newer game.
    const inline = JSON.parse(JSON.stringify(pack(w)));
    inline.world.managerHistory = w.managerHistory;
    expect(() => unpack(inline)).toThrow('감독 이력');
  });
});
