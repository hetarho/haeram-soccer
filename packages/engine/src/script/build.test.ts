import { expect, it } from 'vitest';
import type { Fixture, Tactic } from '../../../contracts/src/types';
import { cachedWorld } from '../../../../tests/fixtures/cached-world';
import { conditionedMatch } from '../../../../scripts/match-parity';
import { aggregateRecord, playAggregate } from '../aggregate/engine';
import type { AggregateAttributionTrace } from '../aggregate/types';
import { careerWorld } from '../career.testkit';
import { SCRIPTED_RELEASE } from '../match-model-release';
import { random } from '../primitives';
import { matchDetail, recordOf, detailIssues } from './build';

/** Full aggregate fixtures, two real world setups and a seeded rare-incident search: integration. */
it('every row counts back to the record', () => {
  const worlds = [2024, 1975].map((year) =>
    cachedWorld(
      `detail-world-${year}`,
      () => careerWorld({ seed: `detail-${year}`, year }, SCRIPTED_RELEASE),
      { input: { year, release: SCRIPTED_RELEASE } },
    ),
  );
  const tactics: readonly Tactic[] = ['possession', 'press', 'counter', 'balanced'];
  const rng = random('detail-coverage-825');
  const covered = new Set<string>();
  const selected: {
    world: number;
    tactics: readonly Tactic[];
    record: ReturnType<typeof aggregateRecord>;
    detail: ReturnType<typeof matchDetail>;
  }[] = [];
  const needed = [
    'sub',
    'injuryWithReplacement',
    'injuryWithoutReplacement',
    'red',
    'secondYellow',
    'penaltyScored',
    'penaltyNotScored',
    'directFreeKick',
    'extraTime',
    'shootout',
  ];
  for (let i = 0; i < 2000 && selected.length < 60; i++) {
    const world = i < 32 ? i % 2 : Math.floor(rng() * 2);
    const w = worlds[world]!;
    const pair = i < 32 ? Math.floor(i / 2) : Math.floor(rng() * 16);
    const pairing: [Tactic, Tactic] = [tactics[Math.floor(pair / 4) % 4]!, tactics[pair % 4]!];
    const clubs = w.clubs.filter(
      (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub,
    );
    const f: Fixture = {
      ...w.fixtures[0]!,
      id: `detail-search-${i}`,
      year: w.year,
      kind: 'cup',
      home: clubs[0]!.id,
      away: clubs[1]!.id,
    };
    const { prepared, rosters } = conditionedMatch(w, f, { tactics: pairing });
    const trace: AggregateAttributionTrace = { moves: [[], []], fouls: [[], []] };
    const match = playAggregate(w, f, prepared, rosters, { awayGoals: false }, undefined, trace);
    const features = new Set<string>();
    const incidents = match.participation.incidents;
    for (const x of incidents) {
      if (['sub', 'red', 'secondYellow'].includes(x.kind)) features.add(x.kind);
      if (x.kind === 'injury')
        features.add(
          incidents.some(
            (s) =>
              s.kind === 'sub' &&
              s.side === x.side &&
              s.player === x.player &&
              s.minute === x.minute,
          )
            ? 'injuryWithReplacement'
            : 'injuryWithoutReplacement',
        );
    }
    for (const side of match.facts.ledger.sides)
      for (const s of side.shots) {
        if (s.kind === 'penalty')
          features.add(s.outcome === 'goal' ? 'penaltyScored' : 'penaltyNotScored');
        if (s.kind === 'freeKick' && s.source < 0) features.add('directFreeKick');
      }
    if (match.facts.length === 120) features.add('extraTime');
    if (match.shootout) features.add('shootout');
    if (
      i >= 32 &&
      !needed.every((k) => covered.has(k)) &&
      ![...features].some((k) => !covered.has(k))
    )
      continue;
    features.forEach((k) => covered.add(k));
    const detail = matchDetail(match, rosters, trace);
    selected.push({
      world,
      tactics: pairing,
      record: aggregateRecord(f, rosters, match, SCRIPTED_RELEASE.revision),
      detail,
    });
  }
  expect(selected).toHaveLength(60);
  expect(needed.filter((k) => !covered.has(k))).toEqual([]);
  for (const world of [0, 1]) {
    expect(
      new Set(selected.filter((s) => s.world === world).map((s) => s.tactics.join('/'))).size,
    ).toBe(16);
  }
  for (const { record, detail } of selected) {
    expect(detailIssues(detail), detail.id).toEqual([]);
    const rebuilt = recordOf(detail);
    for (const key of [
      'score',
      'metrics',
      'detail',
      'players',
      'xg',
      'incidents',
      'regulation',
      'shootout',
    ] as const)
      expect(rebuilt[key], `${detail.id}/${key}`).toEqual(record[key]);
  }
  console.info(
    'T825 record recount',
    JSON.stringify({
      fixtures: selected.length,
      years: [2024, 1975],
      covered: [...covered].sort(),
    }),
  );
});
