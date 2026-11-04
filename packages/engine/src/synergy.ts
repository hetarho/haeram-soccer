import { message as sourceMessage } from '../../contracts/src/messages';
import { lineOf } from './player';
import type { ManagerStyle, Player, World } from '../../contracts/src/types';
import { ownStarters } from './world';
import { policyOf } from './policy';
import { staffMember } from './staff';
import { buildOf } from './build';
import { STADIUM_STEPS } from './facilities';

/**
 * Build synergies (→CLUB-21): when the manager, the staff, the club's choices and the squad point
 * the same way, the build gets a bonus on top of each card. Every condition is visible, so the owner
 * can see what is missing.
 */
export interface SynergyEffects {
  pass: number;
  possession: number;
  defense: number;
  lineHigh: number;
  /** Fatigue taken off each match for the players who played. */
  fatigueRelief: number;
  academyGrowth: number;
  academyPotential: number;
  marketPotential: number;
  feeMultiplier: number;
  sponsor: number;
  moraleBaseline: number;
}

export const NEUTRAL_SYNERGY: Readonly<SynergyEffects> = Object.freeze({
  pass: 0,
  possession: 0,
  defense: 0,
  lineHigh: 0,
  fatigueRelief: 0,
  academyGrowth: 1,
  academyPotential: 0,
  marketPotential: 0,
  feeMultiplier: 1,
  sponsor: 1,
  moraleBaseline: 0,
});

export interface SynergyState {
  id: string;
  label: string;
  /** What the build is, in football terms. */
  idea: string;
  conditions: { label: string; met: boolean }[];
  active: boolean;
  bonus: string;
  /** What it adds while active, in `synergyEffects`' terms. */
  effects: Partial<SynergyEffects>;
}

interface SynergyRule {
  id: string;
  label: string;
  idea: string;
  bonus: string;
  effects: Partial<SynergyEffects>;
  /** The manager schools that meet its manager condition, if it has one. */
  schools?: readonly ManagerStyle[];
  conditions: (w: World, starters: Player[]) => { label: string; met: boolean }[];
}

const average = (players: Player[], value: (p: Player) => number) =>
  players.length ? players.reduce((sum, p) => sum + value(p), 0) / players.length : 0;
const coach = (w: World, role: Parameters<typeof staffMember>[1]) => staffMember(w, role);

const RULES: readonly SynergyRule[] = [
  {
    id: 'gegenpress',
    label: sourceMessage('copy.synergy.b97b998386'),
    idea: sourceMessage('copy.synergy.c334cee875'),
    bonus: sourceMessage('copy.synergy.06793a1a73'),
    effects: { fatigueRelief: 2, lineHigh: 0.01 },
    schools: ['gegenpress'],
    conditions: (w, starters) => [
      {
        label: sourceMessage('copy.synergy.55b87fbdd0'),
        met: w.manager.style === 'gegenpress' || w.tactic === 'press',
      },
      {
        label: sourceMessage('copy.synergy.1b604a60b0'),
        met: (coach(w, 'fitness')?.ability ?? 0) >= 65 || coach(w, 'fitness')?.trait === 'recovery',
      },
      {
        label: sourceMessage('copy.synergy.6784774532'),
        met: average(starters, (p) => p.attrs.stamina) >= 60,
      },
    ],
  },
  {
    id: 'positional',
    label: sourceMessage('copy.synergy.ea45eeab67'),
    idea: sourceMessage('copy.synergy.2447c458a2'),
    bonus: sourceMessage('copy.synergy.e7821e001f'),
    effects: { pass: 1, possession: 1 },
    schools: ['positional'],
    conditions: (w, starters) => [
      {
        label: sourceMessage('copy.synergy.4cfd20cdf9'),
        met: w.manager.style === 'positional' || w.tactic === 'possession',
      },
      {
        label: sourceMessage('copy.synergy.aa4669a64a'),
        met:
          (coach(w, 'assistant')?.ability ?? 0) >= 65 ||
          coach(w, 'assistant')?.trait === 'specialist',
      },
      {
        label: sourceMessage('copy.synergy.ef59b29d02'),
        met:
          average(
            starters.filter((p) => lineOf(p.position) === 'MF'),
            (p) => p.attrs.passing,
          ) >= 62,
      },
    ],
  },
  {
    id: 'wall',
    label: sourceMessage('copy.synergy.e46fb65fe0'),
    idea: sourceMessage('copy.synergy.fda4870db1'),
    bonus: sourceMessage('copy.synergy.1bfa47423d'),
    effects: { defense: 1 },
    schools: ['organizer', 'counter'],
    conditions: (w, starters) => [
      {
        label: sourceMessage('copy.synergy.4b1db1d4ca'),
        met: w.manager.style === 'organizer' || w.manager.style === 'counter',
      },
      {
        label: sourceMessage('copy.synergy.9d0c21f892'),
        met:
          (coach(w, 'defense')?.ability ?? 0) >= 65 || coach(w, 'defense')?.trait === 'specialist',
      },
      {
        label: sourceMessage('copy.synergy.8ab6fa8c2d'),
        met:
          average(
            starters.filter((p) => lineOf(p.position) === 'DF'),
            (p) => (p.attrs.tackling + p.attrs.positioning) / 2,
          ) >= 62,
      },
    ],
  },
  {
    id: 'pipeline',
    label: sourceMessage('copy.synergy.b6c5840216'),
    idea: sourceMessage('copy.synergy.888a9c39d0'),
    bonus: sourceMessage('copy.synergy.bb3f667694'),
    effects: { academyGrowth: 1.15, academyPotential: 3 },
    schools: ['developer'],
    conditions: (w) => [
      { label: sourceMessage('copy.synergy.e20a736546'), met: (policyOf(w).academy ?? 1) >= 3 },
      {
        label: sourceMessage('copy.synergy.a4f6c2437e'),
        met: coach(w, 'youth')?.trait === 'developer' || (coach(w, 'youth')?.ability ?? 0) >= 70,
      },
      {
        label: sourceMessage('copy.synergy.47236d8a38'),
        met: w.manager.style === 'developer' || w.manager.trait === 'youth',
      },
    ],
  },
  {
    id: 'moneyball',
    label: sourceMessage('copy.synergy.26a7e06a1e'),
    idea: sourceMessage('copy.synergy.601cc6097f'),
    bonus: sourceMessage('copy.synergy.1cc62a8b3a'),
    effects: { marketPotential: 3, feeMultiplier: 0.92 },
    conditions: (w) => [
      { label: sourceMessage('copy.synergy.6a64c2301a'), met: buildOf(w).scouting === 'data' },
      {
        label: sourceMessage('copy.synergy.fff63d5c86'),
        met: coach(w, 'scout')?.trait === 'spotter' || coach(w, 'director')?.trait === 'negotiator',
      },
      { label: sourceMessage('copy.synergy.cf1e29959e'), met: policyOf(w).recruitment <= 2 },
    ],
  },
  {
    id: 'commercial',
    label: sourceMessage('copy.preset_data.096f323d0b'),
    idea: sourceMessage('copy.synergy.d1aacc478b'),
    bonus: sourceMessage('copy.synergy.4fc132b11b'),
    effects: { sponsor: 1.1 },
    conditions: (w) => [
      { label: sourceMessage('copy.synergy.fa3a96a3a9'), met: buildOf(w).revenue === 'commercial' },
      { label: sourceMessage('copy.synergy.02f8816265'), met: policyOf(w).globalMarketing >= 4 },
      {
        label: sourceMessage('copy.synergy.10f49edaf8'),
        met: STADIUM_STEPS[w.stadium].capacity >= 30000,
      },
    ],
  },
  {
    id: 'one-team',
    label: sourceMessage('copy.synergy.3d6c502f4f'),
    idea: sourceMessage('copy.synergy.2559025800'),
    bonus: sourceMessage('copy.styles.87bc607505'),
    effects: { moraleBaseline: 3 },
    schools: ['motivator'],
    conditions: (w) => [
      { label: sourceMessage('copy.influences.18c3bf60ff'), met: w.manager.style === 'motivator' },
      { label: sourceMessage('copy.synergy.0351073577'), met: policyOf(w).support >= 4 },
      { label: sourceMessage('copy.synergy.e4cb4f9995'), met: (w.morale ?? 60) >= 65 },
    ],
  },
  {
    id: 'local-heroes',
    label: sourceMessage('copy.synergy.b29e7850e7'),
    idea: sourceMessage('copy.synergy.d2c6598dad'),
    bonus: sourceMessage('copy.synergy.44c9a06868'),
    effects: { moraleBaseline: 2, academyPotential: 2 },
    conditions: (w) => {
      const build = buildOf(w);
      return [
        {
          label: sourceMessage('copy.synergy.28d796b534'),
          met: build.youth === 'homegrown' || build.youth === 'partnership',
        },
        { label: sourceMessage('copy.synergy.5f96b16ab8'), met: build.fans === 'community' },
        { label: sourceMessage('copy.synergy.e265e056b7'), met: build.culture === 'family' },
      ];
    },
  },
  {
    id: 'trading-machine',
    label: sourceMessage('copy.preset_data.741a79d7f9'),
    idea: sourceMessage('copy.synergy.8b29234f83'),
    bonus: sourceMessage('copy.synergy.d470fcffed'),
    effects: { marketPotential: 2, academyGrowth: 1.1 },
    conditions: (w) => {
      const build = buildOf(w);
      return [
        { label: sourceMessage('copy.synergy.6a64c2301a'), met: build.scouting === 'data' },
        { label: sourceMessage('copy.synergy.2825d0176b'), met: w.direction?.debut === 'early' },
        {
          label: sourceMessage('copy.synergy.28f438ec06'),
          met: build.market === 'selling' || build.market === 'showcase',
        },
      ];
    },
  },
  {
    id: 'global-scouting',
    label: sourceMessage('copy.synergy.a68d512d42'),
    idea: sourceMessage('copy.synergy.f8e476631e'),
    bonus: sourceMessage('copy.synergy.8fe0d65565'),
    effects: { academyPotential: 2, marketPotential: 2 },
    conditions: (w) => [
      { label: sourceMessage('copy.synergy.7a8b77e495'), met: buildOf(w).youth === 'worldwide' },
      { label: sourceMessage('copy.synergy.ca8e37bf2e'), met: policyOf(w).globalScouting >= 3 },
      {
        label: sourceMessage('copy.synergy.b1adea21fe'),
        met: coach(w, 'scout')?.trait === 'spotter' || (coach(w, 'scout')?.ability ?? 0) >= 65,
      },
    ],
  },
];

export function synergyStates(w: World): SynergyState[] {
  const starters = ownStarters(w);
  return RULES.map((rule) => {
    const conditions = rule.conditions(w, starters);
    return {
      id: rule.id,
      label: rule.label,
      idea: rule.idea,
      conditions,
      active: conditions.every((condition) => condition.met),
      bonus: rule.bonus,
      effects: rule.effects,
    };
  });
}

/** The combined bonus of every active synergy; neutral when none is active. */
export function synergyEffects(w: World): SynergyEffects {
  const effects: SynergyEffects = { ...NEUTRAL_SYNERGY };
  const states = synergyStates(w);
  for (const rule of RULES) {
    if (!states.find((state) => state.id === rule.id)!.active) continue;
    for (const [key, value] of Object.entries(rule.effects) as [keyof SynergyEffects, number][])
      effects[key] =
        key === 'academyGrowth' || key === 'feeMultiplier' || key === 'sponsor'
          ? effects[key] * value
          : effects[key] + value;
  }
  return effects;
}
