import { describe, expect, it } from 'vitest';
import { generationDigestSchema } from '../../../../packages/contracts/src/schema';
import { Host } from './host';
import { req } from './host.testkit';
import type { Reply } from './protocol';

describe('generation progress (→WEB-115, WORLD-13)', () => {
  it('carries every season reached with its digest, the war on the 1946 restart', async () => {
    const replies: Reply[] = [];
    const host = new Host((reply) => replies.push(reply));
    const done = await host.handle(
      req('generate', -1, {
        type: 'generate',
        choice: { tier: 'oil', traits: [], decade: 1940, seed: 'digest' },
      }),
    );
    expect(done.ok, done.error).toBe(true);
    const progress = replies.filter(
      (reply) => reply.requestId === 'generate' && reply.progress !== undefined,
    );
    // 1930/31–1938/39 played, then the restart (→WORLD-14).
    expect(progress.map((reply) => reply.season)).toEqual([
      1931, 1932, 1933, 1934, 1935, 1936, 1937, 1938, 1946,
    ]);
    for (const reply of progress) {
      const digest = reply.digest!;
      expect(generationDigestSchema.parse(digest)).toEqual(digest);
      expect(digest.season).toBe(reply.season);
      expect(digest.closed).toBe(reply.season === 1946 ? 1938 : reply.season! - 1);
      expect(digest.elo).toHaveLength(10);
      const elo = digest.elo.map((row) => row.elo);
      expect(elo).toEqual([...elo].sort((a, b) => b - a));
      expect(digest.champions.map((row) => row.country)).toEqual([
        'ENG',
        'ESP',
        'GER',
        'ITA',
        'FRA',
        'POR',
        'NED',
        'BEL',
      ]);
      // A champion is a club of its own association, named from the world.
      for (const { country, club } of digest.champions) {
        expect(club.country).toBe(country);
        expect(club.name).not.toBe(club.id);
      }
      // Nothing before its time: no European Cup before 1955, no 발롱도르 before 1955/56.
      expect(digest.europe).toEqual([]);
      expect(digest.ballonDor).toBeUndefined();
    }
    expect(progress.at(-1)!.digest).toMatchObject({
      season: 1946,
      closed: 1938,
      feat: { kind: 'war' },
    });
    expect(progress.slice(0, -1).some((reply) => reply.digest!.feat?.kind === 'war')).toBe(false);
    expect(done.start!.listings.length).toBeGreaterThan(0);
  });
});
