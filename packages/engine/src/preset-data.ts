import { message as sourceMessage } from '../../contracts/src/messages';
import type { ClubBuild } from '../../contracts/src/build';
import type { ClubPolicy, Direction, SpendRequest } from '../../contracts/src/types';

// Data only, with type imports: the founding screen reads the presets from here without loading
// the engine (→ARCH-28).
/**
 * The rows a preset sets beyond its cards (→ECON-22): policy levels, the ticket price and direction
 * rows; every row it does not name returns to its default when the preset is applied (→ECON-25).
 */
export interface PresetRows {
  policy?: Partial<ClubPolicy>;
  ticket?: number;
  direction?: Direction;
  /** The spending request every delegated person starts with (→`SpendRequest`); absent is 적당히. */
  request?: SpendRequest;
}
/**
 * Ready-made directions (→ECON-22), one tap to fill every row of the board. Each has one identity
 * and lights or aims at a synergy (→CLUB-21); the owner can still compose any other mix.
 */
export const BUILD_PRESETS: {
  id: string;
  label: string;
  model: string;
  /** The synergy the preset lights at once or points toward, in the owner's terms. */
  aim: string;
  /** The rows beyond the cards it fills, in one line for the founding screen (→WEB-15). */
  summary: string;
  build: ClubBuild;
  rows: PresetRows;
}[] = [
  {
    id: 'local-pride',
    label: sourceMessage('copy.preset_data.7bd0f95449'),
    model: sourceMessage('copy.preset_data.d3684aa55a'),
    aim: sourceMessage('copy.preset_data.689cf66078'),
    summary: sourceMessage('copy.preset_data.a962ad7295'),
    build: {
      youth: 'homegrown',
      scouting: 'local',
      market: 'hold',
      revenue: 'members',
      fans: 'community',
      culture: 'family',
    },
    rows: {
      policy: { localInvest: 3 },
      ticket: 0.035,
      direction: { renewal: 'keepAll', youthGoal: 'firstTeam' },
      request: 2,
    },
  },
  {
    id: 'youth-academy',
    label: sourceMessage('copy.preset_data.af512882a9'),
    model: sourceMessage('copy.preset_data.86d2c15059'),
    aim: sourceMessage('copy.preset_data.2883deb2aa'),
    summary: sourceMessage('copy.preset_data.d9b539ec6b'),
    build: { youth: 'elite', culture: 'meritocracy' },
    rows: {
      policy: { academy: 4, recruitment: 1 },
      direction: {
        youthGoal: 'firstTeam',
        debut: 'early',
        renewal: 'youngFirst',
        school: 'developer',
        manager: 'developer',
        coaches: 'elite',
      },
    },
  },
  {
    id: 'trading',
    label: sourceMessage('copy.preset_data.741a79d7f9'),
    model: sourceMessage('copy.preset_data.3dfdb5628d'),
    aim: sourceMessage('copy.preset_data.7a8cba5ba7'),
    summary: sourceMessage('copy.preset_data.2d65f3dbab'),
    build: { scouting: 'data', market: 'selling', culture: 'meritocracy' },
    rows: {
      policy: { recruitment: 2 },
      direction: { youthGoal: 'sell', debut: 'early', renewal: 'youngFirst' },
    },
  },
  {
    id: 'commercial',
    label: sourceMessage('copy.preset_data.096f323d0b'),
    model: sourceMessage('copy.preset_data.4d49a5a2d4'),
    aim: sourceMessage('copy.preset_data.415f781654'),
    summary: sourceMessage('copy.preset_data.6db74febda'),
    build: { scouting: 'network', revenue: 'commercial', culture: 'stars' },
    rows: {
      policy: { globalMarketing: 3, tour: 2 },
      ticket: 0.08,
      request: 4,
    },
  },
  {
    id: 'global',
    label: sourceMessage('copy.preset_data.0e372a2477'),
    model: sourceMessage('copy.preset_data.072719174c'),
    aim: sourceMessage('copy.preset_data.4fdf232c8f'),
    summary: sourceMessage('copy.preset_data.ebad1b4e05'),
    build: { youth: 'worldwide', scouting: 'network', market: 'showcase' },
    rows: { policy: { globalScouting: 3, globalMarketing: 2, tour: 2, recruitment: 2 } },
  },
  {
    id: 'ambition',
    label: sourceMessage('copy.preset_data.db02ec8751'),
    model: sourceMessage('copy.preset_data.f3a48b9c51'),
    aim: sourceMessage('copy.preset_data.7600dc9821'),
    summary: sourceMessage('copy.preset_data.64a67f4044'),
    build: {
      scouting: 'proven',
      market: 'hold',
      revenue: 'owner',
      fans: 'fortress',
      culture: 'veterans',
    },
    rows: {
      policy: { support: 4, recruitment: 5 },
      direction: {
        renewal: 'coreOnly',
        manager: 'proven',
        youthGoal: 'minimal',
      },
      request: 5,
    },
  },
  {
    id: 'shoestring',
    label: sourceMessage('copy.preset_data.af91e935f5'),
    model: sourceMessage('copy.preset_data.edb6ffba81'),
    aim: sourceMessage('copy.preset_data.1bfa478ab7'),
    summary: sourceMessage('copy.preset_data.24bb5f447c'),
    build: {
      youth: 'partnership',
      scouting: 'local',
      market: 'hardball',
      revenue: 'frugal',
      fans: 'families',
      culture: 'veterans',
    },
    rows: {
      policy: { support: 2 },
      direction: { renewal: 'frugal', manager: 'cheap', coaches: 'cheap' },
      request: 1,
    },
  },
];
