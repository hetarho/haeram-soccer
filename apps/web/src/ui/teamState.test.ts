import { describe, expect, it } from 'vitest';
import { createWorld, operate } from '../../../../packages/engine/src/index';
import { policyOf } from '../../../../packages/engine/src/policy';
import { cashState, remedies, runwayText, teamStates, urgentState } from './teamState';

const world = () =>
  createWorld({
    country: 'ENG',
    name: 'State',
    color: '#24664f',
    seed: 'state',
    level: 'easy' as const,
  });

describe('team state', () => {
  it('is calm for a new club and keeps cash in the HUD', () => {
    const w = world();
    const states = teamStates(w);
    expect(states.map((state) => state.key)).toEqual(['fatigue', 'morale', 'manager', 'squad']);
    expect(urgentState(states, cashState(w))).toBeUndefined();
    expect(cashState(w).advice).toBeUndefined();
  });

  it('recommends recovery when the starters are tired', () => {
    const w = world();
    for (const player of w.players) player.fatigue = 55;
    // The owner forced youth training; left to his rule the assistant would rest them.
    w.trainingOrders = { assistant: { focus: 'hard', rounds: 4, forced: true } };
    const fatigue = teamStates(w).find((state) => state.key === 'fatigue')!;
    expect(fatigue.tone).toBe('warn');
    // Recovery training is the assistant's call: the remedy routes to 훈련 with his sheet open on
    // 회복 and changes nothing itself (→WEB-44, STAFF-19). Everyone is equally tired, so a rest
    // selection would change nothing: a rest day comes next.
    const [recovery, rest] = fatigue.advice!.actions;
    expect(recovery).toMatchObject({
      coach: { coach: 'assistant', focus: 'recovery' },
      page: 'training',
    });
    expect(recovery.command).toBeUndefined();
    expect(rest.command).toEqual({ type: 'care', kind: 'rest-day' });
    // Left to his rule the assistant already rests them, so the quick choices are requests.
    delete w.trainingOrders;
    const delegated = teamStates(w).find((state) => state.key === 'fatigue')!;
    expect(delegated.advice!.text).toContain('회복 훈련 중');
    expect(delegated.advice!.actions.map((action) => action.command)).toEqual([
      { type: 'care', kind: 'rest-day' },
      { type: 'care', kind: 'recovery' },
    ]);
  });

  it('offers priced choices for every state, chances for requests and why one is unavailable', () => {
    const w = world();
    for (const key of ['fatigue', 'morale', 'manager', 'cash', 'squad'] as const) {
      const choices = remedies(w, key);
      expect(choices.length, key).toBeGreaterThanOrEqual(3);
      expect(choices.length, key).toBeLessThanOrEqual(6);
      for (const choice of choices) {
        expect(choice.effect.length).toBeGreaterThan(0);
        if (!choice.unavailable)
          expect(
            !!(choice.command || choice.page || choice.prepare || choice.coach),
            choice.id,
          ).toBe(true);
        if (choice.chances)
          expect(choice.chances.reduce((sum, chance) => sum + chance.chance, 0)).toBe(100);
      }
    }
    const meeting = remedies(w, 'morale').find((choice) => choice.id === 'meeting')!;
    expect(meeting.by).toBe('감독');
    expect(meeting.chances!.length).toBe(3);
    expect(
      remedies(w, 'morale').some(
        (choice) => choice.label.includes('보너스') && !choice.label.includes('승리 수당'),
      ),
    ).toBe(false);
    operate(w, { type: 'care', kind: 'bonding' });
    const bonding = remedies(w, 'morale').find((choice) => choice.id === 'bonding')!;
    expect(bonding.unavailable).toBe('3라운드 뒤 다시 가능');
    expect(remedies(w, 'cash').find((choice) => choice.id === 'friendly')!.effect).toContain(
      '전원 피로 +8',
    );
  });

  it('puts a morale crisis first and asks the manager for a squad meeting', () => {
    const w = world();
    for (const player of w.players) player.fatigue = 45;
    w.morale = 20;
    const urgent = urgentState(teamStates(w), cashState(w))!;
    expect(urgent.key).toBe('morale');
    expect(urgent.advice!.actions[0].command).toEqual({ type: 'care', kind: 'meeting' });
  });

  it('shows the manager standing and offers public backing when it wavers', () => {
    const w = world();
    w.manager.trust = 30;
    const manager = teamStates(w).find((state) => state.key === 'manager')!;
    expect(manager).toMatchObject({ value: '30', status: '위기', tone: 'bad' });
    expect(manager.advice!.actions[0].command).toEqual({ type: 'care', kind: 'backing' });
    w.manager.interim = true;
    expect(teamStates(w).find((state) => state.key === 'manager')!.status).toBe('대행 체제');
  });

  it('flags a deficit and a thin squad with places to act', () => {
    const w = world();
    w.cash = '-100';
    w.players.slice(0, 4).forEach((player) => (player.status = 'sold'));
    const states = teamStates(w);
    expect(cashState(w).tone).toBe('bad');
    expect(urgentState(states, cashState(w))!.key).toBe('cash');
    // The costliest investment row, squad investment and the ticket price are board settings: each
    // remedy asks the operating board for one step and changes nothing by itself (→WEB-44, WEB-71).
    w.policy = { ...policyOf(w), localInvest: 2, globalMarketing: 3, support: 3 };
    w.ticket = 0.05;
    const cash = remedies(w, 'cash');
    const settings = cash.filter((choice) => choice.board);
    expect(settings.map((choice) => choice.id)).toEqual([
      'investment-down',
      'support-down',
      'ticket-up',
    ]);
    for (const choice of settings) {
      expect(choice.page, choice.id).toBe('business');
      expect(choice.command, choice.id).toBeUndefined();
    }
    expect(settings.map((choice) => choice.board)).toEqual([
      { policy: { key: 'globalMarketing', level: 2 } },
      { policy: { key: 'support', level: 2 } },
      { ticket: 0.08 },
    ]);
    // The squad investment remedy states what it saves on operating expenses.
    expect(settings[1].effect).toMatch(/운영 경비 연 .+ 절감/);
    expect(settings[1].effect).toContain('절약으로');
    // Squad investment at its lowest is not offered; the dearest ticket says why it cannot rise.
    w.policy = { ...policyOf(w), support: 1 };
    w.ticket = 0.12;
    expect(remedies(w, 'cash').some((choice) => choice.id === 'support-down')).toBe(false);
    expect(remedies(w, 'cash').find((choice) => choice.id === 'ticket-up')!.unavailable).toBe(
      '티켓 가격 상한',
    );
    expect(states.find((state) => state.key === 'squad')!.advice!.actions[0]).toMatchObject({
      page: 'people',
      tab: 'market',
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
    expect(squad().advice!.text).toContain('부상 2명 · 출장 정지 2명');
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
    expect(remedies(w, 'squad').find((r) => r.id === 'market')!.effect).toContain(
      '등록 한도 40명 · 추정',
    );
    w.year = 2011;
    w.clubs.find((c) => c.id === w.playerClub)!.tier = 0;
    for (const p of w.players) p.born = 1980;
    for (const p of w.players.slice(0, 4)) p.born = 1991;
    expect(teamStates(w).find((s) => s.key === 'squad')!.value).toBe('16/25 · 제외 4');
    expect(remedies(w, 'squad').find((r) => r.id === 'market')!.effect).toContain('21세 이하 제외');
    expect(remedies(w, 'squad').find((r) => r.id === 'market')!.effect).not.toContain('추정');
  });
});
