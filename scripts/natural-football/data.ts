import type { MatchPlayback } from '../../packages/contracts/src/types';
import { message } from '../../packages/contracts/src/messages';

export interface ComparisonExport {
  version: 1;
  meta: {
    head: string;
    seed: string;
    year: number;
    country: string;
    club: string;
    fixture: string;
    home: string;
    away: string;
    inputHash: string;
    recordHash: string;
    exportedAt: string;
    diagnostics: {
      samples: number;
      maxSpeed: number;
      pressureSeconds: number;
      pressureSpells2: number;
      pressureSpells5: number;
    };
  };
  playback: MatchPlayback;
}

export function readExport(value: unknown): ComparisonExport {
  const data = value as Partial<ComparisonExport> | null;
  if (
    data?.version !== 1 ||
    !data.meta ||
    !data.playback?.frames?.length ||
    !data.playback.squads ||
    !data.playback.record ||
    !/^[a-f0-9]{40}$/.test(data.meta.head) ||
    !/^[a-f0-9]{64}$/.test(data.meta.inputHash) ||
    !/^[a-f0-9]{64}$/.test(data.meta.recordHash)
  ) {
    throw new Error(message('naturalFootball.invalid'));
  }
  return data as ComparisonExport;
}

export function assertComparable(baseline: ComparisonExport, candidate: ComparisonExport) {
  for (const field of [
    'seed',
    'year',
    'country',
    'club',
    'fixture',
    'inputHash',
    'recordHash',
  ] as const) {
    if (baseline.meta[field] !== candidate.meta[field])
      throw new Error(message('naturalFootball.mismatch', { field }));
  }
}
