import { describe, expect, it, vi } from 'vitest';
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
import { simulatedWorld } from '../../../../tests/fixtures/worlds';
import { Host } from '../runtime/host';
import { input, req } from '../runtime/host.testkit';
import { decode, encode } from './persistence';
import { MemoryCheckpoint, Saves } from './persistence.testkit';
import { MANIFEST, type StoragePort } from './repository';

describe('news journal checkpoint continuity', () => {
  it('retains headlines and counters through export/import and the next settlement', async () => {
    const w = simulatedWorld(input, { rounds: 2 });
    initializeNewsJournal(w);
    initializeCareerReads(w);
    const raw = await encode(w);
    const loaded = (await decode(raw)).world;
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
    const prepared = new Host();
    const initial = await prepared.handle(
      req('prepare', -1, { type: 'inspect', raw: await encode(w), activate: true, upgrade: true }),
    );
    expect(initial.ok, initial.error).toBe(true);
    const current = structuredClone(prepared.world!);
    expect(current.careerReads!.format).toBe(CAREER_READS_FORMAT);
    const obsolete = structuredClone(current);
    Object.assign(obsolete, {
      careerReads: { format: OBSOLETE_CAREER_READS_FORMAT, matches: 'discarded derived cursor' },
    });
    const raw = await encode(obsolete);
    const decoded = (await decode(raw)).world;
    expect(decoded.careerReads).toBeUndefined();
    expect({ ...decoded, careerReads: current.careerReads }).toEqual(current);

    const reader = new Host();
    const inspected = await reader.handle(req('inspect', -1, { type: 'inspect', raw }));
    expect(inspected.ok, inspected.error).toBe(true);
    expect(inspected.raw).toBeUndefined();
    expect(inspected.upgraded).toBeUndefined();
    expect(reader.world).toBeUndefined();
    const readOnly = await reader.handle(
      req('read-only', -1, { type: 'inspect', raw, activate: true }),
    );
    expect(readOnly.ok, readOnly.error).toBe(true);
    expect(readOnly.raw).toBeUndefined();
    expect(readOnly.upgraded).toBeUndefined();
    expect(reader.world!.careerReads).toBeUndefined();
    expect(reader.world!.revision).toBe(current.revision);

    const writer = new Host();
    const activated = await writer.handle(
      req('repair', -1, { type: 'inspect', raw, activate: true, upgrade: true }),
    );
    expect(activated.ok, activated.error).toBe(true);
    expect(activated.upgraded).toBe(true);
    expect(activated.raw).toBeDefined();
    expect(writer.world!.careerReads).toEqual(current.careerReads);
    expect(writer.world).toEqual({ ...current, revision: current.revision + 1 });
    const repairedRaw = activated.raw!;
    expect((await decode(repairedRaw)).world).toEqual(writer.world);

    const again = new Host();
    const repeated = await again.handle(
      req('reload-current', -1, {
        type: 'inspect',
        raw: repairedRaw,
        activate: true,
        upgrade: true,
      }),
    );
    expect(repeated.ok, repeated.error).toBe(true);
    expect(repeated.upgraded).toBeUndefined();
    expect(repeated.raw).toBeUndefined();
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
      const rejected = await again.handle(
        req('reject-summary', -1, {
          type: 'inspect',
          raw: await encode(invalid),
          activate: true,
          upgrade: true,
        }),
      );
      expect(rejected.ok).toBe(false);
      expect(rejected.raw).toBeUndefined();
      expect(canonical(again.world)).toBe(before);
    }
  });
  it('protects unsupported summary formats from fallback while retaining compatible corruption recovery', async () => {
    const w = simulatedWorld(input, { rounds: 2 });
    initializeNewsJournal(w);
    initializeCareerReads(w);
    const previousRaw = await encode(w, 1, 0);
    const stored = async (activeRaw: string) => {
      const data = new Map<string, string>();
      const port: StoragePort = {
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => void data.set(key, value),
        removeItem: (key) => void data.delete(key),
      };
      await new MemoryCheckpoint(port, 'previous').write(previousRaw);
      await new MemoryCheckpoint(port, 'active').write(activeRaw);
      port.setItem(MANIFEST, JSON.stringify({ worldId: w.id, generation: 2, parentGeneration: 1 }));
      return { data, port };
    };
    for (const careerReads of [{ format: CAREER_READS_FORMAT + 1 }, { format: '1' }, null]) {
      const unknown = structuredClone(w);
      Object.assign(unknown, { careerReads });
      const activeRaw = await encode(unknown, 2, 1);
      const { data, port } = await stored(activeRaw);
      const before = new Map(data);
      const inspect = vi.fn(decode);
      const saves = new Saves(port, inspect);
      await expect(saves.load()).rejects.toBeInstanceOf(SaveCompatibilityError);
      // Incompatibility never consults or adopts the older valid checkpoint.
      expect(inspect.mock.calls.map(([raw]) => raw)).toEqual([activeRaw]);
      expect(saves.incompatibleCheckpoint).toBe(true);
      expect(saves.incompatibleBackup).toBe(activeRaw);
      expect(saves.recoveryRaw()).toBe(activeRaw);
      await expect(saves.commit(await encode(w, 3, 2))).rejects.toBeInstanceOf(
        SaveCompatibilityError,
      );
      expect(data).toEqual(before);
    }

    const malformed = structuredClone(w);
    malformed.careerReads!.matches = -1;
    const activeRaw = await encode(malformed, 2, 1);
    await expect(decode(activeRaw)).rejects.toBeInstanceOf(ZodError);
    const { data, port } = await stored(activeRaw);
    const before = new Map(data);
    const inspect = vi.fn(decode);
    const saves = new Saves(port, inspect);
    const recovered = await saves.load();
    expect(inspect.mock.calls.map(([raw]) => raw)).toEqual([activeRaw, previousRaw]);
    expect(recovered?.recovered).toBe(true);
    expect(recovered?.raw).toBe(previousRaw);
    expect(recovered?.world.careerReads).toEqual(w.careerReads);
    expect(saves.incompatibleCheckpoint).toBe(false);
    // Inspection alone never commits a replacement, even when ordinary recovery is available.
    expect(data).toEqual(before);
  });
  it('upgrades a missing journal once on writer activation and leaves read-only worlds intact', async () => {
    const w = simulatedWorld(input, { rounds: 2 });
    const raw = await encode(w);
    const reader = new Host();
    const inspected = await reader.handle(
      req('reader', -1, { type: 'inspect', raw, activate: true }),
    );
    expect(inspected.ok, inspected.error).toBe(true);
    expect(reader.world!.newsJournal).toBeUndefined();
    const writer = new Host();
    const activated = await writer.handle(
      req('writer', -1, { type: 'inspect', raw, activate: true, upgrade: true }),
    );
    expect(activated.ok, activated.error).toBe(true);
    expect(activated.upgraded).toBe(true);
    expect(writer.world!.ownMatches).toEqual(w.ownMatches);
    expect(writer.world!.newsJournal).toBeDefined();
    const saved = activated.raw!;
    const again = new Host();
    const repeated = await again.handle(
      req('again', -1, { type: 'inspect', raw: saved, activate: true, upgrade: true }),
    );
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
