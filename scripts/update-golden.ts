import { writeFileSync } from 'node:fs';
import { transferOffers } from '../packages/engine/src/scout-search';
import { ENGINE_VERSION } from '../packages/engine/src/world';
import { CATALOG_VERSION } from '../packages/catalogs/src/index';
import { fixtureCareer, runFixture, type FixtureDefinition } from '../tests/fixtures/run';
if (!process.argv.includes('--write'))
  throw new Error('Use --write only after reviewing intentional engine/catalog changes');
const input = { country: 'ENG' as const, seed: 'portable-release-1' };
// The squad member the staff propose as a playing coach (`run.ts`'s staff-playing-coach setup).
const playingCoach = fixtureCareer({ input }).players[6]!.id;
// The scout's first club player (free agents list first and are never loaned, →CLUB-49/50); the
// fixture's settings and policy leave the scout's list as the fresh career has it.
const loanable = transferOffers(fixtureCareer({ input })).findIndex(
  (offer) => offer.source.kind === 'club' && offer.available,
);
const definitions: FixtureDefinition[] = [
  {
    name: 'takeover-and-commercial-decisions',
    input,
    policy: { localInvest: 3 },
    commands: [
      { type: 'sign-sponsor', slot: 'local', offer: 0 },
      { type: 'recruit', candidate: loanable, loan: true },
      { type: 'advance', rounds: 5 },
    ],
  },
  {
    name: 'french-redenomination',
    input: { ...input, country: 'FRA' },
    year: 1959,
    commands: [{ type: 'season', count: 1 }],
  },
  {
    name: 'modern-european-season',
    input: { ...input, country: 'FRA' },
    year: 2024,
    cupQualification: true,
    commands: [{ type: 'season', count: 1 }],
  },
  {
    name: 'current-responsibilities-and-manual-events',
    input,
    currentRules: true,
    commands: [
      {
        type: 'settings',
        settings: {
          responsibilities: {
            manager: 'delegated',
            staff: 'delegated',
            contracts: 'delegated',
            recruitment: 'delegated',
            sales: 'delegated',
            academy: 'delegated',
            sponsors: 'delegated',
          },
          mode: 'manual',
          observations: { matchEve: true, windowOpen: false },
        },
      },
      { type: 'next-event' },
      { type: 'next-event' },
    ],
  },
  {
    name: 'staff-proposed-combined-contract',
    input,
    currentRules: true,
    setup: 'staff-playing-coach',
    commands: [{ type: 'answer-playing-coach', player: playingCoach, accept: true }],
  },
  {
    name: 'financial-mediation-fixed-reinforcement-promise',
    input,
    currentRules: true,
    setup: 'financial-conflict',
    commands: [{ type: 'resolve-mediation', id: 'mediation:1950:0', support: 'manager' }],
  },
];
for (const definition of definitions) definition.expected = runFixture(definition);
writeFileSync(
  'tests/fixtures/portable-v1.json',
  JSON.stringify(
    { synthetic: true, engine: ENGINE_VERSION, catalog: CATALOG_VERSION, definitions },
    null,
    2,
  ) + '\n',
);
console.log(
  `Wrote ${definitions.length} reviewed portable scenarios; CI only reads these expected facts.`,
);
