import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { SaveCompatibilityError } from '../../../../packages/contracts/src/versions';
import { canonical } from '../../../../packages/contracts/src/index';
import {
  CAREER_READS_FORMAT,
  OBSOLETE_CAREER_READS_FORMAT,
} from '../../../../packages/contracts/src/career-reads';
import { newsJournalSchema } from '../../../../packages/contracts/src/news';
import {
  initializeNewsJournal,
  newsPage,
  refreshNewsJournal,
} from '../../../../packages/engine/src/news';
import { initializeCareerReads } from '../../../../packages/engine/src/career-reads';
import { advanceRound } from '../../../../packages/engine/src/season';
import { roundTrip } from '../../../../tests/fixtures/save-roundtrip';
import { simulatedWorld } from '../../../../tests/fixtures/worlds';
import { gameHost, input, loadWorld, savedWorld } from '../runtime/host.testkit';

describe('news journal save continuity', () => {
  it('retains headlines and counters through a save and the next settlement', () => {
    const w = simulatedWorld(input, { rounds: 2 });
    initializeNewsJournal(w);
    initializeCareerReads(w);
    const loaded = roundTrip(w);
    expect(loaded.newsJournal).toEqual(w.newsJournal);
    expect(loaded.careerReads).toEqual(w.careerReads);
    expect(loaded.careerReads!.format).toBe(CAREER_READS_FORMAT);
    advanceRound(w, undefined, false);
    advanceRound(loaded, undefined, false);
    expect(canonical(loaded.newsJournal)).toBe(canonical(w.newsJournal));
    expect(loaded.careerReads).toEqual(w.careerReads);
    expect(canonical(loaded.ownMatches)).toBe(canonical(w.ownMatches));
  });
  it('reconstructs an obsolete career summary once for a writer without changing source facts', async () => {
    const w = simulatedWorld(input, { rounds: 2 });
    initializeNewsJournal(w);
    initializeCareerReads(w);
    // Normalize every other optional writer model before isolating the career-summary upgrade.
    const prepared = gameHost();
    const initial = await loadWorld(prepared, 'prepare', w);
    expect(initial.ok, initial.error).toBe(true);
    const current = structuredClone(prepared.world!);
    expect(current.careerReads!.format).toBe(CAREER_READS_FORMAT);
    const obsolete = structuredClone(current);
    Object.assign(obsolete, {
      careerReads: { format: OBSOLETE_CAREER_READS_FORMAT, matches: 'discarded derived cursor' },
    });
    const decoded = roundTrip(obsolete);
    expect(decoded.careerReads).toBeUndefined();
    expect({ ...decoded, careerReads: current.careerReads }).toEqual(current);

    const writer = gameHost();
    const activated = await loadWorld(writer, 'repair', obsolete);
    expect(activated.ok, activated.error).toBe(true);
    expect(activated.upgraded).toBe(true);
    expect(writer.world!.careerReads).toEqual(current.careerReads);
    expect(writer.world).toEqual({ ...current, revision: current.revision + 1 });
    expect(savedWorld(writer)).toEqual(writer.world);

    const again = gameHost();
    const repeated = await loadWorld(again, 'reload-current', savedWorld(writer));
    expect(repeated.ok, repeated.error).toBe(true);
    expect(repeated.upgraded).toBeUndefined();
    expect(again.world).toEqual(writer.world);
    expect(repeated.view?.world).not.toHaveProperty('careerReads');
    const before = canonical(again.world);
    for (const careerReads of [
      { ...current.careerReads, format: CAREER_READS_FORMAT + 1 },
      { ...current.careerReads, matches: -1 },
      { format: '1' },
      null,
    ]) {
      const invalid = structuredClone(current);
      Object.assign(invalid, { careerReads });
      const rejected = await loadWorld(again, 'reject-summary', invalid);
      expect(rejected.ok).toBe(false);
      expect(canonical(again.world)).toBe(before);
    }
  });
  it('protects unsupported summary formats as incompatible while a malformed one is corruption', () => {
    const w = simulatedWorld(input, { rounds: 2 });
    initializeNewsJournal(w);
    initializeCareerReads(w);
    for (const careerReads of [{ format: CAREER_READS_FORMAT + 1 }, { format: '1' }, null]) {
      const unknown = structuredClone(w);
      Object.assign(unknown, { careerReads });
      expect(() => roundTrip(unknown)).toThrow(SaveCompatibilityError);
    }
    const malformed = structuredClone(w);
    malformed.careerReads!.matches = -1;
    expect(() => roundTrip(malformed)).toThrow(ZodError);
  });
  it('upgrades a missing journal once on writer activation', async () => {
    const w = simulatedWorld(input, { rounds: 2 });
    const writer = gameHost();
    const activated = await loadWorld(writer, 'writer', w);
    expect(activated.ok, activated.error).toBe(true);
    expect(activated.upgraded).toBe(true);
    expect(writer.world!.ownMatches).toEqual(w.ownMatches);
    expect(writer.world!.newsJournal).toBeDefined();
    const again = gameHost();
    const repeated = await loadWorld(again, 'again', savedWorld(writer));
    expect(repeated.ok, repeated.error).toBe(true);
    expect(repeated.upgraded).toBeUndefined();
    expect(again.world!.newsJournal).toEqual(writer.world!.newsJournal);
    const before = canonical(again.world);
    newsPage(again.world!);
    refreshNewsJournal(again.world!);
    expect(canonical(again.world)).toBe(before);
    expect(newsJournalSchema.safeParse(again.world!.newsJournal).success).toBe(true);
    expect(repeated.view?.world).not.toHaveProperty('newsJournal');
  });
});
