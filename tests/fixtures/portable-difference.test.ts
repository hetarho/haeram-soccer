import { describe, expect, it } from 'vitest';
import { canonical } from '../../packages/contracts/src/index';
import { portableDifference } from './portable-difference';

const diagnostic = (expected: unknown, received: unknown) =>
  portableDifference('small-fixture', canonical(expected), canonical(received));

describe('portable canonical difference diagnostics', () => {
  it('names the captured cash-string difference and scenario without changing the equality oracle', () => {
    const expected = canonical({ cash: '995333402' });
    const received = canonical({ cash: '970129584' });
    expect(portableDifference('modern-european-season', expected, received)).toBe(
      '"modern-european-season": first difference at $.cash; expected "995333402"; received "970129584"',
    );
    expect(received).not.toBe(expected);
  });

  it('finds the first nested difference in canonical key order', () => {
    expect(diagnostic({ z: 1, a: { score: 2 } }, { z: 3, a: { score: 4 } })).toBe(
      '"small-fixture": first difference at $.a.score; expected 2; received 4; differing facts (2): $.a.score, $.z',
    );
    expect(diagnostic({ '2': 0, '10': 0 }, { '2': 1, '10': 1 })).toContain('$["10"]');
  });

  it("lists every differing top-level fact's first path, so books and matches read apart", () => {
    const expected = { cash: '1', events: [1], matches: [{ score: [1, 0] }, { score: [2, 2] }] };
    const received = { cash: '2', events: [1], matches: [{ score: [1, 0] }, { score: [2, 3] }] };
    expect(diagnostic(expected, received)).toBe(
      '"small-fixture": first difference at $.cash; expected "1"; received "2"; differing facts (2): $.cash, $.matches[1].score[1]',
    );
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`f${i}`, i]));
    const shifted = Object.fromEntries(
      Object.entries(many).map(([key, value]) => [key, value + 1]),
    );
    const message = diagnostic(many, shifted)!;
    expect(message).toContain('differing facts (40): $.f0, $.f1, ');
    expect(message.endsWith(', …')).toBe(true);
    expect(message.length).toBeLessThanOrEqual(720 + 460);
  });

  it('walks arrays by index and reports nested fields', () => {
    expect(diagnostic({ matches: [{ score: [1, 2] }] }, { matches: [{ score: [1, 3] }] })).toBe(
      '"small-fixture": first difference at $.matches[0].score[1]; expected 2; received 3',
    );
    expect(diagnostic([2, 1], [1, 2])).toContain('at $[0]; expected 2; received 1');
  });

  it.each([
    [{}, { cash: null }, '$.cash; expected <missing>; received null'],
    [{ cash: null }, {}, '$.cash; expected null; received <missing>'],
    [[1], [1, null], '$[1]; expected <missing>; received null'],
    [[1, 2], [1], '$[1]; expected 2; received <missing>'],
    [{}, { constructor: 'fact' }, '$.constructor; expected <missing>; received "fact"'],
  ])(
    'distinguishes a missing key or array entry from a present value (%j / %j)',
    (a, b, detail) => {
      expect(diagnostic(a, b)).toBe(`"small-fixture": first difference at ${detail}`);
    },
  );

  it('quotes keys that are not JSON-path identifiers', () => {
    expect(diagnostic({ 'club.name': { 'a"b': 1 } }, { 'club.name': { 'a"b': 2 } })).toBe(
      '"small-fixture": first difference at $["club.name"]["a\\"b"]; expected 1; received 2',
    );
  });

  it.each([
    [1, 2, 'expected 1; received 2'],
    [false, true, 'expected false; received true'],
    [null, 0, 'expected null; received 0'],
    ['1', 1, 'expected "1"; received 1'],
    [[], {}, 'expected []; received {}'],
  ])('reports primitive and container-type differences at the root (%j / %j)', (a, b, detail) => {
    expect(diagnostic(a, b)).toBe(`"small-fixture": first difference at $; ${detail}`);
  });

  it.each(
    [null, true, 5, '995333402', [], {}, { values: [null, { cash: '0' }] }].map((value) => [value]),
  )('returns no diagnostic for equal values (%j)', (value) =>
    expect(diagnostic(value, structuredClone(value))).toBeUndefined(),
  );

  it('uses parsed canonical values, so omitted undefined properties add no diagnostic', () => {
    expect(diagnostic({ present: 1, omitted: undefined }, { present: 1 })).toBeUndefined();
    expect(diagnostic({ z: 1, a: 2 }, { a: 2, z: 1 })).toBeUndefined();
  });

  it('does not treat matching parsed values as proof of exact string equality', () => {
    expect(portableDifference('representation', '1', '1.0')).toBe(
      '"representation": canonical strings differ at $ (parsed values match); expected "1"; received "1.0"',
    );
  });

  it('bounds scenario, path and value previews even for a large differing subtree', () => {
    const key = 'k'.repeat(500);
    const expected = { [key]: { text: 'x'.repeat(2000) } };
    const received = { [key]: null };
    const message = portableDifference('s'.repeat(500), canonical(expected), canonical(received))!;
    expect(message.length).toBeLessThanOrEqual(720);
    expect(message).toContain('first difference at $.');
    expect(message).toContain('…; expected {"text":"');
    expect(message).toContain('…; received null');
    expect(diagnostic('x'.repeat(2000), 'y'.repeat(2000))!.length).toBeLessThanOrEqual(720);
  });
});
