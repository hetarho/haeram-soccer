import { describe, expect, it } from 'vitest';
import { ROLE_IDS, type Attributes } from '../../../contracts/src/player';
import type { Incident, Manager, Player } from '../../../contracts/src/types';
import { bestRoleAt, FORMATIONS } from '../player';
import { matchdayRole, playerTendencies, TENDENCY_CONFIG } from './tendencies';

const holding: Attributes = {
  finishing: 40,
  dribbling: 50,
  crossing: 45,
  passing: 68,
  vision: 60,
  tackling: 74,
  positioning: 77,
  heading: 70,
  pace: 58,
  stamina: 72,
  strength: 70,
  reflexes: 12,
  handling: 10,
  distribution: 14,
  decisions: 66,
  composure: 62,
};
const creative: Attributes = {
  finishing: 72,
  dribbling: 80,
  crossing: 64,
  passing: 78,
  vision: 84,
  tackling: 38,
  positioning: 55,
  heading: 44,
  pace: 70,
  stamina: 63,
  strength: 50,
  reflexes: 9,
  handling: 11,
  distribution: 13,
  decisions: 74,
  composure: 71,
};
const anchor = { id: 't431-anchor', attrs: holding };
const ten = { id: 't431-ten', attrs: creative };
/** A hired manager with a school; the owner-facing fields are set apart from flexibility. */
const manager: Manager = {
  id: 'm-t431',
  name: 'Test Manager',
  philosophy: 'possession',
  ability: 70,
  youth: 60,
  flexibility: 70,
  pride: 50,
  trust: 50,
  conflicts: 0,
  wage: '1000',
  since: 1950,
  until: 1953,
  interim: false,
  style: 'positional',
};

describe('playerTendencies', () => {
  it('the same manager gives a trequartista more freedom than a centre-back', () => {
    const player = { id: 't431-same', attrs: creative };
    const free = playerTendencies(player, manager, 'trequartista').freedom;
    for (const role of ['stopper', 'coverDefender', 'ballPlayingDefender'] as const)
      expect(free).toBeGreaterThan(playerTendencies(player, manager, role).freedom);
  });

  it('a more flexible manager gives more freedom', () => {
    const rigid = playerTendencies(ten, { ...manager, flexibility: 20 }, 'mezzala').freedom;
    const flexible = playerTendencies(ten, { ...manager, flexibility: 85 }, 'mezzala').freedom;
    expect(flexible).toBeGreaterThan(rigid);
  });

  it('better 판단력 gives more freedom', () => {
    const poor = { id: 't431-reader', attrs: { ...creative, decisions: 35 } };
    const sharp = { id: 't431-reader', attrs: { ...creative, decisions: 85 } };
    expect(playerTendencies(sharp, manager, 'falseNine').freedom).toBeGreaterThan(
      playerTendencies(poor, manager, 'falseNine').freedom,
    );
  });

  it('freedom is flexibility × role creativity × 판단력 over the floor and span', () => {
    const player = { id: 't431-nine', attrs: { ...creative, decisions: 60 } };
    const { floor, span } = TENDENCY_CONFIG.freedom;
    // 80/100 × 1.0 × (0.5 + 60/200) = 0.64
    expect(
      playerTendencies(player, { ...manager, flexibility: 80 }, 'falseNine').freedom,
    ).toBeCloseTo(floor + span * 0.64, 12);
    expect(floor).toBe(0.1);
    expect(span).toBe(0.9);
  });

  it("a player's personality is stable across fixtures", () => {
    const first = playerTendencies(anchor, manager, 'anchor');
    // Another fixture: another manager, another role, the same player.
    const later = playerTendencies(anchor, { ...manager, flexibility: 30 }, 'regista');
    expect([later.discipline, later.pressing, later.anticipation]).toEqual([
      first.discipline,
      first.pressing,
      first.anticipation,
    ]);
    // Equal attributes still make different players (→PLAYER-26).
    const twin = playerTendencies({ id: 't431-twin', attrs: holding }, manager, 'anchor');
    expect(twin.discipline).not.toBe(first.discipline);
  });

  it("규율, 압박 성향 and 예측력 keep motionTraits' values", () => {
    // Pinned from `motionTraits` at the task's base (60072b02) for these players.
    const pinned = [
      [anchor, 0.757367032259237, 0.6555978142368608, 0.7098242613254115],
      [ten, 0.7512774406460113, 0.5979123829117046, 0.561331864327658],
      [
        { id: 't431-twin', attrs: holding },
        0.8453312379126436,
        0.5718993406571449,
        0.5224339734530077,
      ],
    ] as const;
    for (const [player, discipline, pressing, anticipation] of pinned) {
      const t = playerTendencies(player, manager, 'boxToBox');
      expect([t.discipline, t.pressing, t.anticipation]).toEqual([
        discipline,
        pressing,
        anticipation,
      ]);
    }
  });

  it('the owner has no input to freedom', () => {
    const asked: Manager = {
      ...manager,
      trust: 5,
      conflicts: 4,
      pending: 'press',
      lastRequest: 'press:demand',
      requestHistory: { at: '1951-3', keys: ['press:demand'], trustAwarded: false },
    };
    for (const role of ['trequartista', 'invertedFullBack', 'anchor'] as const)
      expect(playerTendencies(ten, asked, role)).toEqual(playerTendencies(ten, manager, role));
    // Nothing but the player, his manager and his role reaches it: no world, no owner setting.
    expect(playerTendencies.length).toBe(3);
  });

  it('a founding manager or an interim gives the neutral flexibility', () => {
    const neutral = playerTendencies(
      ten,
      { ...manager, flexibility: TENDENCY_CONFIG.neutralFlexibility },
      'shadowStriker',
    ).freedom;
    // The founding manager has no school (→STAFF-14).
    const founding = { ...manager, flexibility: 90, style: undefined };
    expect(playerTendencies(ten, founding, 'shadowStriker').freedom).toBe(neutral);
    expect(
      playerTendencies(ten, { ...manager, flexibility: 10, interim: true }, 'shadowStriker')
        .freedom,
    ).toBe(neutral);
    expect(TENDENCY_CONFIG.neutralFlexibility).toBe(50);
    // A club nobody owns passes its named manager, who has a school: his own flexibility counts.
    const named = { ...manager, style: 'counter' as const, flexibility: 90 };
    expect(playerTendencies(ten, named, 'shadowStriker').freedom).toBeGreaterThan(neutral);
  });

  it('every tendency stays in 0–1', () => {
    const extremes = [
      anchor,
      { id: 't431-top', attrs: Object.fromEntries(Object.keys(holding).map((k) => [k, 99])) },
      { id: 't431-bottom', attrs: Object.fromEntries(Object.keys(holding).map((k) => [k, 1])) },
    ] as { id: string; attrs: Attributes }[];
    for (const player of extremes)
      for (const flexibility of [0, 100])
        for (const role of ROLE_IDS)
          for (const value of Object.values(
            playerTendencies(player, { ...manager, flexibility }, role),
          )) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
          }
  });
});

describe('TENDENCY_CONFIG.roleCreativity', () => {
  const creativity: Record<string, number> = TENDENCY_CONFIG.roleCreativity;

  it('names every role of the catalog once, between 0.2 and 1.0', () => {
    expect(Object.keys(creativity).sort()).toEqual([...ROLE_IDS].sort());
    for (const value of Object.values(creativity)) {
      expect(value).toBeGreaterThanOrEqual(0.2);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('keeps centre-backs and holding midfielders at 0.2 and frees the trequartista and false nine', () => {
    for (const role of ['stopper', 'coverDefender', 'ballPlayingDefender', 'anchor', 'ballWinner'])
      expect(creativity[role]).toBe(0.2);
    expect(creativity.trequartista).toBe(1);
    expect(creativity.falseNine).toBe(1);
  });
});

describe('matchdayRole', () => {
  const squad = [...Array(13)].map((_, i) => ({
    id: `p${i}`,
    attrs: creative,
    position: i === 12 ? ('ST' as const) : ('CM' as const),
  })) satisfies Pick<Player, 'id' | 'attrs' | 'position'>[];
  const sub = (player: string, other: string, minute: number): Incident => ({
    minute,
    side: 1,
    kind: 'sub',
    player,
    other,
  });
  const record = {
    tactics: ['counter', 'possession'] as ['counter', 'possession'],
    incidents: [sub('p9', 'p11', 60), sub('p11', 'p12', 80)],
  };
  const slots = FORMATIONS.possession.slots;

  it("gives a starter his slot's role", () => {
    for (const index of [0, 5, 9, 10])
      expect(matchdayRole(record, squad, 1, index)).toBe(slots[index]!.role);
  });

  it('gives a substitute the role of the man he replaced, through a chain', () => {
    expect(matchdayRole(record, squad, 1, 11)).toBe(slots[9]!.role);
    expect(matchdayRole(record, squad, 1, 12)).toBe(slots[9]!.role);
  });

  it('gives an unused substitute his best role at his main position', () => {
    // On the other side nobody came on.
    expect(matchdayRole(record, squad, 0, 12)).toBe(bestRoleAt(creative, 'ST'));
  });
});
