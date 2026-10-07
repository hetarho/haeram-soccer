import { describe, it, expect } from 'vitest';
import fixture from './portable-v1.json';
import { runFixture, type FixtureDefinition } from './run';
import { canonical } from '../../packages/contracts/src/index';
describe('portable web and future Dart golden facts', () => {
  for (const definition of fixture.definitions as FixtureDefinition[])
    it(definition.name, () =>
      expect(canonical(runFixture(definition))).toBe(canonical(definition.expected)),
    );
});
