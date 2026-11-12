import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { Fixture, Tactic } from '../packages/contracts/src/types';
import { cachedWorld } from '../tests/fixtures/cached-world';
import { attributePlayerFacts } from '../packages/engine/src/aggregate/players';
import { aggregateStreams } from '../packages/engine/src/aggregate/team';
import type { AggregateAttributionTrace } from '../packages/engine/src/aggregate/types';
import { matchDetail } from '../packages/engine/src/script/build';
import { aggregateRun, conditionedMatch } from './match-parity';
import { coreFixturePairs } from './grid-bands';
import { settledFile, protoCell } from './export-settled';

it("the engine's detail equals the exported files", () => {
  const setup = cachedWorld('T825-exporter-pairs', () => {
    const pairs = coreFixturePairs();
    // Store each world once, not one copy per club pairing.
    return {
      worlds: Object.fromEntries(new Map(pairs.map((p) => [p.w.seed, p.w]))),
      pairs: pairs.map((p) => ({ seed: p.w.seed, home: p.home.id, away: p.away.id })),
    };
  });
  const pairs = setup.pairs;
  // The ten files are the prototype's revision-10 exports (T819), which the script writer's tests
  // read as inputs, so they stay as recorded: the worlds settle on revision 10 by name, whose
  // attribution ignores the players' places (→MATCH-16), not on the released revision 11 (T838).
  for (const w of Object.values(setup.worlds))
    if (w.matchModel) w.matchModel = { ...w.matchModel, revision: 'continuous-aggregate-10' };
  const tactics: readonly (readonly [Tactic, Tactic])[] = [
    ['possession', 'possession'],
    ['possession', 'counter'],
    ['counter', 'possession'],
    ['counter', 'counter'],
  ];
  for (let i = 1; i <= 10; i++) {
    const id = `s${String(i).padStart(2, '0')}`;
    const bytes = readFileSync(
      new URL(`./match-proto/fixtures/settled/${id}.json`, import.meta.url),
      'utf8',
    );
    const expected = JSON.parse(bytes) as ReturnType<typeof settledFile>;
    const n = Number(expected.source.fixture.split(':')[1]);
    const pair = pairs[n % pairs.length]!;
    const w = setup.worlds[pair.seed]!;
    const f: Fixture = {
      ...w.fixtures[0]!,
      year: expected.source.year,
      round: 1,
      kind: 'league',
      id: expected.source.fixture,
      home: pair.home,
      away: pair.away,
    };
    const conditioning = { tactics: tactics[n % 4]! };
    const { match, sample } = aggregateRun(w, f, 'settled', undefined, conditioning);
    const { rosters } = conditionedMatch(w, f, conditioning);
    const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
    attributePlayerFacts(
      match.input,
      match.plan,
      match.participation,
      match.facts,
      aggregateStreams(w.seed, match.retry === 0 ? f.id : `${f.id}:retry${match.retry}`),
      trace,
    );
    const detail = matchDetail(match, rosters, trace);
    const line = (side: number, n: number) =>
      n < 0 ? -1 : side * 11 + detail.sides[side]!.lines[n]!.slot;
    expect(
      detail.events.map((e) => [
        ...e.slice(0, 4),
        protoCell(e[4]!),
        protoCell(e[5]!),
        line(e[0]!, e[6]!),
        e[7]!,
        e[8]!,
        line(e[7] === 1 ? e[0]! : 1 - e[0]!, e[9]!),
      ]),
    ).toEqual(expected.events);
    expect(
      detail.shots.map((s) => [
        ...s.slice(0, 2),
        protoCell(s[2]!),
        ...s.slice(3, 8),
        line(s[0]!, s[8]!),
        line(s[0]!, s[9]!),
        s[10]!,
        line(1 - s[0]!, s[11]!),
      ]),
    ).toEqual(expected.shots);
    expect(
      detail.fouls.map((f) => [
        f[0]!,
        protoCell(f[1]!),
        line(1 - f[0]!, f[2]!),
        line(f[0]!, f[3]!),
        f[4]!,
      ]),
    ).toEqual(expected.fouls);
    expect(
      detail.incidents.filter((x) => x[2] === 0).map((x) => [x[0]!, x[1]!, line(x[1]!, x[3]!)]),
    ).toEqual(expected.cards);
    const exported = settledFile(id, w, f, match, rosters, sample.record.added!);
    expect(JSON.stringify(exported) + '\n').toBe(bytes);
  }
});
