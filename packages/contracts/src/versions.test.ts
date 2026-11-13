import { describe, expect, it } from 'vitest';
import root from '../../../package.json';
import web from '../../../apps/web/package.json';
import catalogs from '../../catalogs/package.json';
import engine from '../../engine/package.json';
import contracts from '../package.json';
import { MATCH_MODEL_REVISION } from './match-model';
import type { World } from './types';
import {
  CURRENT_ENGINE_VERSION,
  COMPATIBLE_ENGINE_VERSIONS,
  earlierRulesMessage,
  envelopeEngine,
  isEarlierEngine,
  LEGACY_ENGINE_VERSIONS,
  NEWER_GAME_MESSAGE,
  RULES_FOUR_VERSIONS,
  SaveCompatibilityError,
  SUPPORTED_ENGINE_VERSIONS,
  upgradeWorldRules,
} from './versions';

const PIN = { catalog: '2026-demo-3', catalogHash: 'h' };
/** The facts a rules upgrade must carry as stored, on a career small enough to compare whole. */
const career = (engine: string) =>
  ({
    schema: 1,
    engine,
    ...PIN,
    id: 'world',
    revision: 41,
    year: 1962,
    round: 6,
    ownMatches: [{ id: 'f:1', year: 1962, round: 3, score: { home: 1, away: 0 } }],
    matchModel: { revision: MATCH_MODEL_REVISION },
  }) as unknown as World;

describe('the current game version (→SAVE-10, SAVE-26)', () => {
  it('is every package version and the rules a world plays', () => {
    expect(CURRENT_ENGINE_VERSION).toMatch(/^0\.\d+\.\d+$/);
    for (const pkg of [root, web, contracts, engine, catalogs])
      expect(pkg.version).toBe(CURRENT_ENGINE_VERSION);
    // Only the current release and explicitly listed compatible patches; never a range.
    expect(SUPPORTED_ENGINE_VERSIONS).toEqual([
      CURRENT_ENGINE_VERSION,
      ...COMPATIBLE_ENGINE_VERSIONS,
    ]);
    expect(COMPATIBLE_ENGINE_VERSIONS).toContain('0.8.0');
    expect(new Set(SUPPORTED_ENGINE_VERSIONS).size).toBe(SUPPORTED_ENGINE_VERSIONS.length);
  });

  it('rewrites every explicit compatible patch label without changing retained facts or absence', () => {
    for (const engine of COMPATIBLE_ENGINE_VERSIONS) {
      expect(engine.split('.').slice(0, 2)).toEqual(CURRENT_ENGINE_VERSION.split('.').slice(0, 2));
      expect(isEarlierEngine(engine)).toBe(false);
      const stored = career(engine);
      const before = structuredClone(stored);
      const upgraded = upgradeWorldRules(stored, PIN);
      expect(upgraded).toEqual({
        ...before,
        engine: CURRENT_ENGINE_VERSION,
        revision: before.revision + 1,
      });
      expect(upgraded.ownMatches).toBe(stored.ownMatches);
      expect(upgraded).not.toHaveProperty('owner');
      expect(stored).toEqual(before);
      expect(upgradeWorldRules(upgraded, PIN)).toBe(upgraded);
    }
  });

  it('a current checkpoint moves only its catalog pin and revision on activation', () => {
    const stored = career(CURRENT_ENGINE_VERSION);
    const before = structuredClone(stored);
    const pin = { catalog: '2026-demo-5', catalogHash: 'g' };
    const upgraded = upgradeWorldRules(stored, pin);
    expect(upgraded).toEqual({ ...before, ...pin, revision: before.revision + 1 });
    expect(upgraded.ownMatches).toBe(stored.ownMatches);
    expect(stored).toEqual(before);
    expect(upgradeWorldRules(upgraded, pin)).toBe(upgraded);
  });

  it('the founded rules-4.0.0 line, 0.7.0 and its 4.0.0 label, is earlier rules (→SAVE-26)', () => {
    expect(RULES_FOUR_VERSIONS).toEqual(['4.0.0', '0.7.0']);
    for (const engine of RULES_FOUR_VERSIONS) {
      expect(isEarlierEngine(engine)).toBe(true);
      expect(LEGACY_ENGINE_VERSIONS).toContain(engine);
      const stored = career(engine);
      const before = structuredClone(stored);
      expect(() => upgradeWorldRules(stored, PIN)).toThrow(SaveCompatibilityError);
      expect(stored).toEqual(before);
    }
    expect(envelopeEngine('{"schema":4,"engine":"0.7.0"}')).toBe('0.7.0');
    expect(earlierRulesMessage('0.7.0')).toBe(
      '이 저장은 규칙 0.7.0 커리어입니다 — 게임 버전 ' +
        CURRENT_ENGINE_VERSION +
        ' 커리어만 열 수 있습니다. 새 커리어를 시작하세요',
    );
  });

  it('keeps every released earlier version as earlier rules, refused with its message', () => {
    expect(LEGACY_ENGINE_VERSIONS).toContain('1.0.0');
    expect(LEGACY_ENGINE_VERSIONS).toContain('1.22.0');
    expect(LEGACY_ENGINE_VERSIONS).toContain('2.0.0');
    expect(LEGACY_ENGINE_VERSIONS).toContain('3.0.0');
    expect(LEGACY_ENGINE_VERSIONS).not.toContain(CURRENT_ENGINE_VERSION);
    for (const legacy of LEGACY_ENGINE_VERSIONS) {
      expect(isEarlierEngine(legacy)).toBe(true);
      expect(() => upgradeWorldRules(career(legacy), PIN)).toThrow(SaveCompatibilityError);
    }
    expect(earlierRulesMessage('1.22.0')).toBe(
      '이 저장은 규칙 1.22.0 커리어입니다 — 게임 버전 ' +
        CURRENT_ENGINE_VERSION +
        ' 커리어만 열 수 있습니다. 새 커리어를 시작하세요',
    );
  });

  it('an unknown engine version is refused as from a newer game', () => {
    // Neither current nor a released earlier version, whatever its number.
    const nextPatch = CURRENT_ENGINE_VERSION.split('.');
    nextPatch[2] = String(Number(nextPatch[2]) + 1);
    for (const unknown of [
      nextPatch.join('.'),
      '9.0.0',
      '0.9.0',
      '0.6.0',
      '5.0.0',
      '4.0.1',
      '1.9.9',
      '1.23.0',
      'x.y.z',
    ]) {
      expect(isEarlierEngine(unknown)).toBe(false);
      const stored = career(unknown);
      const before = structuredClone(stored);
      expect(() => upgradeWorldRules(stored, PIN)).toThrow(SaveCompatibilityError);
      expect(stored).toEqual(before);
    }
    expect(NEWER_GAME_MESSAGE).toContain('지원하지 않는 저장');
    expect(NEWER_GAME_MESSAGE).toContain(
      '게임 버전 ' + CURRENT_ENGINE_VERSION + '보다 새로운 게임',
    );
  });
});
