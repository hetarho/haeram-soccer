import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { World } from '../../../../../../packages/contracts/src/types';
import { message } from '../../../../../../packages/contracts/src/messages';
import { PlanPreview, planSteps, type DelegatePlan } from './DelegationPlan';

// Only the country and year used by these presentation-only money flows.
const w = { year: 1950, playerClub: 'own', clubs: [{ id: 'own', country: 'ENG' }] } as World;
function plan(key: DelegatePlan['key']): DelegatePlan {
  return {
    key,
    delegated: true,
    delegate: {
      post: 'director',
      postLabel: 'Director',
      name: 'Test director',
      temperament: 'balanced',
    },
    request: 3,
    level: 3,
    response: 'followed',
    revenue: '100000',
    share: key === 'academy' ? 160 : 0,
    budget: '30000',
    incomeBudget: '1600',
    projected: '90000',
    floor: '20000',
    reserved: '5000',
    spendable: '65000',
    fixedCosts: '40000',
    loss: '0',
    committed: '20000',
    over: false,
    left: '10000',
    ...(key === 'academy'
      ? { youth: { level: 3, cost: '15000', pay: '5000', payCap: '30000' } }
      : {}),
    stance: { signing: { upgrades: 1 }, bidExtra: 0, pending: 1 },
    choices: [],
  };
}

describe('the live cash-floor plan (→WEB-118, ECON-33)', () => {
  it.each(['recruitment', 'contracts', 'academy', 'sales', 'manager', 'staff'] as const)(
    'renders the %s plan without retired loss-duration or reserve explanations',
    (key) => {
      const html = renderToStaticMarkup(createElement(PlanPreview, { w, plan: plan(key) }));
      expect(html).toContain(`data-testid="delegation-plan-${key}"`);
      expect(html).not.toMatch(/적자 허용|시즌 버티|고정지출 .*년분을 남/);
      if (key !== 'manager' && key !== 'staff') {
        expect(html).toContain('하한 위 지출 여력');
        if (key === 'recruitment' || key === 'contracts')
          expect(html).toContain('이번 시즌 남은 기간과 다음 시즌까지');
        expect(html).toContain('이미 뺀 금액');
      }
    },
  );

  it.each(['recruitment', 'contracts', 'academy'] as const)(
    'shows income, live money, budget, committed cost and the remainder for %s',
    (key) => {
      const p = plan(key),
        steps = planSteps(w, p)!;
      expect(steps.map((s) => s.label)).toEqual([
        message('delegation.flow.revenue'),
        message('delegation.floor.available'),
        message(key === 'academy' ? 'delegation.flow.budget' : 'delegation.flow.wageRoom'),
        message(key === 'academy' ? 'delegation.floor.committed' : 'delegation.flow.wages'),
        message(
          key === 'academy'
            ? 'delegation.floor.left'
            : key === 'contracts'
              ? 'delegation.flow.raises'
              : 'delegation.flow.signings',
        ),
      ]);
      expect(steps.at(-1)?.tone).toBe('result');
      p.left = '0';
      expect(planSteps(w, p)?.at(-1)?.tone).toBe('empty');
      if (key === 'academy') {
        const html = renderToStaticMarkup(createElement(PlanPreview, { w, plan: p }));
        expect(html).toContain('각각 1.6%');
        expect(html).toContain('유스 디렉터 급여');
      }
    },
  );
});
