import { describe, it, expect } from 'vitest';
import fixture from './portable-v1.json';
import { runFixture, type FixtureDefinition } from './run';
import { canonical } from '../../packages/contracts/src/index';
import { portableDifference } from './portable-difference';
describe('portable web and future Dart golden facts', () => {
  for (const definition of fixture.definitions as FixtureDefinition[])
    it(definition.name, () => {
      const received = canonical(runFixture(definition));
      const expected = canonical(definition.expected);
      expect(received, portableDifference(definition.name, expected, received)).toBe(expected);
    });
});
