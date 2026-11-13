import { worldMarketFixture } from '../../../../../../packages/engine/src/world-market.testkit';
import { describe, expect, it } from 'vitest';
import { careerWorld } from '../../../../../../packages/engine/src/career.testkit';
import { rating } from '../../../../../../packages/engine/src/world';
import { ownLeagueIds } from '../../league/@x/player';
import { squadRegistration } from './squadRegistration';
import {
  cashState,
  clubSituation,
  runwayText,
  squadAvailability,
  strengthPlace,
  teamStates,
} from './teamState';

const world = () => careerWorld({ country: 'ENG', seed: 'state' });

describe('team state', () => {
  it('is calm for a new club and keeps cash in the HUD', () => {
    const w = world();
    const states = teamStates(w);
    expect(states.map((state) => state.key)).toEqual([
      'strength',
      'fatigue',
      'morale',
      'manager',
      'squad',
    ]);
    expect(states.filter((state) => state.attention)).toEqual([]);
    expect(cashState(w).attention).toBe(false);
  });

  it('marks tired starters, a morale crisis and a wavering manager, offering nothing (→WEB-44)', () => {
    const w = world();
    for (const player of w.players) player.fatigue = 55;
    w.morale = 20;
    w.manager.trust = 30;
    const state = (key: string) => teamStates(w).find((item) => item.key === key)!;
    expect(state('fatigue')).toMatchObject({ tone: 'warn', attention: true });
    expect(state('morale')).toMatchObject({ tone: 'bad', attention: true });
    expect(state('manager')).toMatchObject({
      value: '30',
      status: '위기',
      tone: 'bad',
      attention: true,
    });
    w.manager.interim = true;
    expect(state('manager')).toMatchObject({ status: '대행 체제', attention: true });
    // States only read: no item carries a choice, a command or a destination.
    const facts = ['key', 'label', 'value', 'status', 'tone', 'attention'];
    for (const item of teamStates(w))
      expect(Object.keys(item).filter((key) => !facts.includes(key))).toEqual([]);
  });

  it('flags a deficit and a thin squad', () => {
    const w = world();
    w.cash = '-100';
    w.players.slice(0, 4).forEach((player) => (player.status = 'sold'));
    expect(cashState(w)).toMatchObject({ value: '적자', status: '적자', tone: 'bad' });
    expect(cashState(w).attention).toBe(true);
    expect(teamStates(w).find((state) => state.key === 'squad')).toMatchObject({
      status: '부족',
      attention: true,
    });
  });

  it('speaks of runway in weeks and months, not rounds', () => {
    expect(runwayText(9)).toBe('약 9주');
    expect(runwayText(65)).toBe('약 15개월');
    expect(runwayText(999)).toBe('1년 이상');
  });
});

describe('registration-aware squad state', () => {
  it.each([
    [20, 'good', '여유'],
    [19, 'warn', '부족'],
    [16, 'warn', '부족'],
    [15, 'bad', '부족'],
  ] as const)('shows %s players with %s tone', (count, tone, status) => {
    const w = world();
    for (const p of w.players.slice(count)) p.status = 'sold';
    expect(teamStates(w).find((s) => s.key === 'squad')).toMatchObject({
      value: `${count}/40`,
      tone,
      status,
    });
  });
  it('warns for three injuries and becomes critical with fewer than fourteen fit', () => {
    const w = world();
    for (const p of w.players.slice(0, 3))
      p.injury = { year: w.year, day: 100, label: 'synthetic injury' };
    expect(teamStates(w).find((s) => s.key === 'squad')!.tone).toBe('warn');
    for (const p of w.players.slice(16)) p.status = 'sold';
    expect(teamStates(w).find((s) => s.key === 'squad')!.tone).toBe('bad');
  });
  it('counts suspended players with the injured', () => {
    const w = world();
    const [hurt, banned, both] = w.players;
    hurt.injury = { year: w.year, day: 100, label: 'synthetic injury' };
    both.injury = { year: w.year, day: 100, label: 'synthetic injury' };
    w.discipline = {
      year: w.year,
      yellows: {},
      bans: [
        { player: banned.id, club: w.playerClub, matches: 1, scope: 'league', reason: 'yellows' },
        { player: both.id, club: w.playerClub, matches: 2, scope: 'domestic', reason: 'dissent' },
        // Another club's ban is not ours.
        { player: 'npc', club: 'other', matches: 3, scope: 'domestic', reason: 'violent' },
      ],
      out: [],
    };
    const squad = () => teamStates(w).find((s) => s.key === 'squad')!;
    // Three of twenty are out, one of them both injured and banned: a warning, not yet critical.
    expect(squad()).toMatchObject({ status: '부상 2 · 정지 2', tone: 'warn' });
    expect(squad().attention).toBe(true);
    // Fewer than fourteen available is critical, bans counted.
    for (const p of w.players.slice(3, 6)) p.status = 'sold';
    for (const p of w.players.slice(6, 10))
      w.discipline.bans.push({
        player: p.id,
        club: w.playerClub,
        matches: 1,
        scope: 'europe',
        reason: 'yellows',
      });
    expect(squad().tone).toBe('bad');
  });
  it('uses counted and exempt players for an observed modern rule and discloses fallback estimation', () => {
    const w = world();
    expect(squadRegistration(w).detail).toContain('등록 한도 40명 · 추정');
    w.year = 2011;
    w.clubs.find((c) => c.id === w.playerClub)!.tier = 0;
    for (const p of w.players) p.born = 1980;
    for (const p of w.players.slice(0, 4)) p.born = 1991;
    expect(teamStates(w).find((s) => s.key === 'squad')!.value).toBe('16/25 · 제외 4');
    expect(squadRegistration(w).detail).toContain('21세 이하 제외');
    expect(squadRegistration(w).detail).not.toContain('추정');
  });
});

describe('clubhouse current-club summary (→WEB-44)', () => {
  it('reads five facts from the world: strength, who can play, fatigue, 분위기 and the manager', () => {
    const w = world();
    const before = structuredClone(w);
    const facts = clubSituation(w);
    expect(facts.map((fact) => fact.label)).toEqual([
      '팀 전력',
      '출전 가능',
      '선발 피로',
      '분위기',
      '감독 입지',
    ]);
    const states = teamStates(w);
    const squad = w.players.filter((p) => p.status === 'active').length;
    expect(facts[0]).toMatchObject({ value: states[0].value, note: states[0].status });
    expect(facts[1]).toMatchObject({
      value: `${squad}/${squad}`,
      note: '부상 0 · 정지 0',
      tone: 'good',
    });
    expect(facts.find((fact) => fact.key === 'manager')!.note).toMatch(/굳건|안정|흔들림|위기/);
    // A calm new club carries no warning, and reading changes nothing.
    expect(facts.filter((fact) => fact.warning)).toEqual([]);
    expect(w).toEqual(before);
  });
  it('counts the injured and the suspended out of the whole first team and names warnings', () => {
    const w = world();
    const [hurt, banned, both] = w.players;
    for (const p of [hurt, both]) p.injury = { year: w.year, day: 100, label: 'synthetic injury' };
    w.discipline = {
      year: w.year,
      yellows: {},
      bans: [
        { player: banned.id, club: w.playerClub, matches: 1, scope: 'league', reason: 'yellows' },
        { player: both.id, club: w.playerClub, matches: 2, scope: 'domestic', reason: 'dissent' },
      ],
      out: [],
    };
    const total = w.players.filter((p) => p.status === 'active').length;
    expect(squadAvailability(w)).toEqual({
      total,
      available: total - 3,
      injured: 2,
      suspended: 2,
      out: 3,
    });
    const squad = () => clubSituation(w).find((fact) => fact.key === 'squad')!;
    // Three out is a warning (→CLUB-40): stated in words, not only by colour.
    expect(squad()).toMatchObject({
      value: `${total - 3}/${total}`,
      note: '부상 2 · 정지 2',
      tone: 'warn',
      warning: '주의',
    });
    // Under sixteen players is critical.
    for (const p of w.players.slice(15)) p.status = 'sold';
    expect(squad()).toMatchObject({ value: '12/15', tone: 'bad', warning: '위험' });
  });
  it('reads an interim manager as 대행 체제 and never badges strength', () => {
    const w = world();
    w.manager.interim = true;
    const facts = clubSituation(w);
    expect(facts.find((fact) => fact.key === 'manager')).toMatchObject({
      value: '대행',
      note: '대행 체제',
      warning: '주의',
    });
    expect(facts[0].warning).toBeUndefined();
  });
});

describe('team strength tile', () => {
  it('uses published rival ratings in a view without squads', () => {
    const w = worldMarketFixture();
    w.clubs[1] = { ...w.clubs[1]!, country: 'ENG', rating: 99 } as (typeof w.clubs)[number];
    w.clubs = w.clubs.slice(0, 2);
    const own = rating(w, w.clubs[0]!);
    expect(teamStates(w)[0]).toMatchObject({ value: String(own), status: '리그 2/2위' });
  });
  it('reads the starting XI average and its place in our division', () => {
    const w = world();
    const strength = teamStates(w)[0];
    const own = rating(
      w,
      w.clubs.find((club) => club.id === w.playerClub)!,
    );
    expect(strength).toMatchObject({ key: 'strength', label: '팀 전력', value: String(own) });
    expect(strength.status).toMatch(new RegExp(`^리그 \\d+/${ownLeagueIds(w).length}위$`));
    // A comparison, not a condition to repair: it never needs the owner, so no warning badge.
    expect(strength.attention).toBeUndefined();
  });
});

describe('team strength place (→WEB-44)', () => {
  it('lets equal ratings share a place', () => {
    expect(strengthPlace([40, 35, 35, 30], 35)).toMatchObject({ place: 2, of: 4 });
    expect(strengthPlace([40, 35, 35, 30], 40)).toMatchObject({ place: 1 });
  });

  it('reads the top third good and the bottom third a warning', () => {
    const field = (n: number) => Array.from({ length: n }, (_, i) => n - i);
    // 16 clubs: thirds of six — places 1–6 good, 7–10 ok, 11–16 warning.
    expect(strengthPlace(field(16), 11).tone).toBe('good');
    expect(strengthPlace(field(16), 10).tone).toBe('ok');
    expect(strengthPlace(field(16), 7).tone).toBe('ok');
    expect(strengthPlace(field(16), 6).tone).toBe('warn');
    // 20 clubs: thirds of seven.
    expect(strengthPlace(field(20), 14).tone).toBe('good');
    expect(strengthPlace(field(20), 13).tone).toBe('ok');
    expect(strengthPlace(field(20), 7).tone).toBe('warn');
    // 24 clubs: thirds of eight.
    expect(strengthPlace(field(24), 17).tone).toBe('good');
    expect(strengthPlace(field(24), 9).tone).toBe('ok');
    expect(strengthPlace(field(24), 8).tone).toBe('warn');
  });

  it('never warns a field too small to have a bottom third', () => {
    expect(strengthPlace([30], 30)).toEqual({ place: 1, of: 1, tone: 'good' });
    expect(strengthPlace([], 30)).toMatchObject({ place: 1, of: 1 });
    expect(strengthPlace([40, 30], 30).tone).toBe('ok');
  });
});
