import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import { newsJournalSchema } from '../../../../packages/contracts/src/news';
import {
  initializeNewsJournal,
  newsPage,
  refreshNewsJournal,
} from '../../../../packages/engine/src/news';
import { advanceRound } from '../../../../packages/engine/src/season';
import { simulatedWorld } from '../../../../tests/fixtures/worlds';
import { Host } from '../runtime/host';
import { input, req } from '../runtime/host.testkit';
import { decode, encode } from './persistence';

describe('news journal checkpoint continuity', () => {
  it('retains headlines and counters through export/import and the next settlement', async () => {
    const w = simulatedWorld(input, { rounds: 2 });
    initializeNewsJournal(w);
    const raw = await encode(w);
    const loaded = (await decode(raw)).world;
    expect(loaded.newsJournal).toEqual(w.newsJournal);
    advanceRound(w, undefined, false);
    advanceRound(loaded, undefined, false);
    expect(canonical(loaded.newsJournal)).toBe(canonical(w.newsJournal));
    expect(canonical(loaded.ownMatches)).toBe(canonical(w.ownMatches));
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
    expect(repeated.view?.world.newsJournal).toBeUndefined();
  });
});
