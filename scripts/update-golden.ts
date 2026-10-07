import { writeFileSync } from 'node:fs';
import { runFixture, type FixtureDefinition } from '../tests/fixtures/run';
if (!process.argv.includes('--write'))
  throw new Error('Use --write only after reviewing intentional engine/catalog changes');
const input = {
  country: 'ENG' as const,
  name: 'Synthetic Archives',
  color: '#234a31',
  seed: 'portable-release-1',
  difficulty: 2,
};
const definitions: FixtureDefinition[] = [
  {
    name: 'founding-and-commercial-decisions',
    input,
    commands: [
      { type: 'sponsor', kind: 'stable' },
      { type: 'campaign', kind: 'outreach' },
      { type: 'recruit', candidate: 0, loan: true },
      { type: 'tactics', tactic: 'counter', tone: 'evidence' },
      { type: 'advance', rounds: 5 },
    ],
  },
  {
    name: 'proud-manager-departure',
    input,
    managerConflict: true,
    commands: [
      { type: 'tactics', tactic: 'press', tone: 'respect' },
      { type: 'tactics', tactic: 'press', tone: 'demand' },
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
];
for (const definition of definitions) definition.expected = runFixture(definition);
writeFileSync(
  'tests/fixtures/portable-v1.json',
  JSON.stringify(
    { synthetic: true, engine: '1.0.0', catalog: '2026-demo-1', definitions },
    null,
    2,
  ) + '\n',
);
console.log('Wrote four reviewed portable scenarios; CI only reads these expected facts.');
