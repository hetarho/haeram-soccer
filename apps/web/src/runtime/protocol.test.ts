import { describe, expect, it } from 'vitest';
import { BUILD_PRESETS } from '../../../../packages/engine/src/build';
import { createIdentityDraft } from '../../../../packages/engine/src/club-identity';
import { DIRECTION_INFO, DIRECTION_KEYS } from '../../../../packages/engine/src/direction';
import { requestSchema } from './protocol';

const request = (body: unknown) => ({
  protocol: 1,
  session: 's',
  requestId: 'r',
  expectedRevision: 0,
  generation: 1,
  parentGeneration: 0,
  body,
});

describe('the worker protocol (→ECON-25, WEB-15)', () => {
  it('accepts a command for every direction row and option the board can draft', () => {
    for (const key of DIRECTION_KEYS)
      for (const option of DIRECTION_INFO[key].options)
        expect(
          requestSchema.safeParse(
            request({ type: 'command', command: { type: 'direction', key, option: option.id } }),
          ).success,
          `${key}:${option.id}`,
        ).toBe(true);
    expect(
      requestSchema.safeParse(
        request({ type: 'command', command: { type: 'direction', key: 'mood', option: 'x' } }),
      ).success,
    ).toBe(false);
  });

  it('founds with any preset as the direction, or none', () => {
    const found = (preset?: string) =>
      requestSchema.safeParse(
        request({
          type: 'found',
          input: {
            country: 'ENG',
            name: 'Club',
            color: '#224466',
            seed: 'seed',
            level: 'easy' as const,
            ...(preset !== undefined ? { preset } : {}),
          },
        }),
      ).success;
    expect(found()).toBe(true);
    for (const preset of BUILD_PRESETS) expect(found(preset.id)).toBe(true);
    expect(found('')).toBe(false);
  });
});

it('accepts only a complete own-club design and no club target (→KIT-9)', () => {
  const identity = createIdentityDraft({ country: 'ENG', seed: 'design', color: '#3A7bC2' });
  const accepts = (command: unknown) =>
    requestSchema.safeParse(request({ type: 'command', command })).success;
  const body = { type: 'command', command: { type: 'club-identity', identity } };
  expect(requestSchema.parse(request(body)).body).toEqual(body);
  for (const target of [{ club: 'ENG:rival' }, { clubId: 'ENG:rival' }, { target: 'ENG:rival' }])
    expect(accepts({ type: 'club-identity', identity, ...target }), JSON.stringify(target)).toBe(
      false,
    );
  for (const colour of ['red', '#12345', '#1234567', '#12345g', 'url(#x)'])
    for (const malformed of [
      { ...identity, colours: [colour] },
      { ...identity, crest: { ...identity.crest, primary: colour } },
      { ...identity, kits: { ...identity.kits, away: { pattern: 'plain', primary: colour } } },
    ])
      expect(accepts({ type: 'club-identity', identity: malformed }), colour).toBe(false);
  expect(accepts({ type: 'club-identity', identity: { ...identity, version: 2 } })).toBe(false);
  expect(accepts({ type: 'club-identity' })).toBe(false);
});

it('preserves stable retained-coach identities beyond the original candidate slots', () => {
  const body = {
    type: 'command',
    command: {
      type: 'hire-staff',
      role: 'assistant',
      candidate: 42,
      candidateId: 'person:retained',
      term: 2,
    },
  };
  expect(requestSchema.parse(request(body)).body).toEqual(body);
});

it('validates the two combined playing-coach command boundaries', () => {
  for (const command of [
    { type: 'propose-playing-coach', player: 'person:one', years: 2, term: 3 },
    { type: 'answer-playing-coach', player: 'person:one', accept: true },
  ])
    expect(requestSchema.parse(request({ type: 'command', command })).body).toEqual({
      type: 'command',
      command,
    });
  expect(
    requestSchema.safeParse(
      request({
        type: 'command',
        command: { type: 'propose-playing-coach', player: 'person:one', years: 3, term: 3 },
      }),
    ).success,
  ).toBe(false);
});
