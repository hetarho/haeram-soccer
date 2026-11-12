import { describe, expect, it } from 'vitest';
import { careerWorld } from '../career.testkit';
import { describe as narrate } from '../match/commentary';
import { playGrid } from './engine';
import { buildGridSetup } from './setup';

/** The grid's own trace through the shared commentary (→MATCH-24); the cases on one entry are match/commentary.test.ts. */
describe('grid commentary', () => {
  it('uses only verified terms over a whole match', () => {
    const w = careerWorld({ seed: 'grid-commentary' });
    const [home, away] = w.clubs.filter(
      (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub,
    );
    const setup = buildGridSetup(
      w,
      { ...w.fixtures[0]!, id: 'commentary', home: home!.id, away: away!.id },
      { observe: true, recordPlayers: false },
    );
    const result = playGrid(setup);
    const all = { names: setup.rosters.map((r) => r.map((p) => p.name)) as [string[], string[]] };
    const texts = result.trace!.map((e) => narrate(e, all));
    expect(texts.every((t) => t.length > 0 && !t.includes('선수'))).toBe(true);
    for (const banned of ['골든 존', '존 5', '존 14', '포켓', '하프 턴', 'undefined'])
      expect(
        texts.some((t) => t.includes(banned)),
        banned,
      ).toBe(false);
    expect(texts.filter((t) => t.endsWith('골!'))).toHaveLength(
      result.record.score.home + result.record.score.away,
    );
  });
});
