import type { Command, World } from '../../contracts/src/types';
import { POLICY_INFO, policyOf } from './policy';
import { DIRECTION_DEFAULT, DIRECTION_INFO } from './direction';
import { BUILD_CARDS, BUILD_SLOT_INFO } from './build';
import { BUILD_OPTIONS } from '../../contracts/src/build';
import { TICKET_LEVELS } from './tickets';
import { nextWork, partLevel, startFacilityWork } from './facilities';
import { addEvent } from './events';
import { debit } from './transactions';
import { moneyLabel } from './finance';

type InvestmentCommand = Extract<
  Command,
  {
    type:
      | 'club-policy'
      | 'club-direction'
      | 'club-build'
      | 'club-ticket'
      | 'coaching-investment'
      | 'facility-upgrade'
      | 'decision-wage-limit'
      | 'decision-finance';
  }
>;

/** Owner investment choices reuse the existing policy effects, spending and construction rules. */
export function investmentCommand(w: World, command: InvestmentCommand) {
  switch (command.type) {
    case 'decision-wage-limit': {
      if (
        !['manager', 'staff', 'contracts', 'recruitment', 'academy'].includes(
          command.responsibility,
        ) ||
        (command.amount !== null && !/^\d{1,40}$/.test(command.amount))
      )
        throw new Error('연봉 한도를 확인해 주세요.');
      const budget = { ...w.decisionBudgets?.[command.responsibility] };
      if (command.amount === null) delete budget.maxAnnualWage;
      else budget.maxAnnualWage = BigInt(command.amount).toString();
      w.decisionBudgets = { ...w.decisionBudgets, [command.responsibility]: budget };
      addEvent(
        w,
        'decision-wage-limit',
        '업무별 연봉 한도 변경',
        command.amount === null
          ? '별도 금액 상한을 해제했습니다. 업무의 재정 기준은 계속 적용합니다.'
          : `1인당 연간 ${moneyLabel(w, command.amount)}까지 · 이후 자동 판단에 적용됩니다.`,
      );
      return;
    }
    case 'decision-finance': {
      const option = DIRECTION_INFO.finance.options.find((option) => option.id === command.choice);
      if (
        !['manager', 'staff', 'contracts', 'recruitment', 'sales', 'academy'].includes(
          command.responsibility,
        ) ||
        !option
      )
        throw new Error('업무별 재정 기준을 확인해 주세요.');
      w.decisionBudgets = {
        ...w.decisionBudgets,
        [command.responsibility]: {
          ...w.decisionBudgets?.[command.responsibility],
          finance: command.choice,
        },
      };
      addEvent(
        w,
        'decision-finance',
        `업무별 재정 기준 · ${option.name}`,
        '이 업무의 이후 자동 판단부터 적용됩니다.',
      );
      return;
    }
    case 'club-direction': {
      const info = DIRECTION_INFO[command.key];
      const option = info?.options.find((option) => option.id === command.choice);
      if (!option) throw new Error('의사결정 지침을 확인해 주세요.');
      const direction = { ...w.direction };
      if (option.id === DIRECTION_DEFAULT[command.key]) delete direction[command.key];
      else Object.assign(direction, { [command.key]: option.id });
      w.direction = direction;
      addEvent(w, 'club-direction', `${info.label} · ${option.name}`, option.summary);
      return;
    }
    case 'club-build': {
      const options: readonly string[] | undefined = BUILD_OPTIONS[command.slot];
      if (!options || (command.choice !== 'standard' && !options.includes(command.choice)))
        throw new Error('구단 운영 방식을 확인해 주세요.');
      const build = { ...w.build };
      if (command.choice === 'standard') delete build[command.slot];
      else Object.assign(build, { [command.slot]: command.choice });
      w.build = build;
      const option = (BUILD_CARDS[command.slot] as Record<string, { label: string }>)[
        command.choice
      ];
      addEvent(
        w,
        'club-build',
        `${BUILD_SLOT_INFO[command.slot].label} · ${option?.label ?? '표준'}`,
        '이후 판단과 정산부터 적용됩니다. 이미 맺은 계약은 유지됩니다.',
      );
      return;
    }
    case 'club-ticket': {
      const option = TICKET_LEVELS.find((option) => option.price === command.price);
      if (!option) throw new Error('티켓 가격을 확인해 주세요.');
      w.ticket = option.price;
      addEvent(w, 'club-ticket', `티켓 가격 · ${option.name}`, option.summary);
      return;
    }
    case 'club-policy': {
      const info = POLICY_INFO[command.key];
      const option = info?.levels.find((option) => option.level === command.level);
      if (!option) throw new Error('운영 기준을 확인해 주세요.');
      w.policy = { ...policyOf(w), [command.key]: command.level };
      addEvent(w, 'club-policy', `${info.label} · ${option.name}`, option.summary);
      return;
    }
    case 'coaching-investment': {
      const option = DIRECTION_INFO.coaches.options.find((option) => option.id === command.choice);
      if (!option) throw new Error('코치진 투자 수준을 확인해 주세요.');
      w.direction = {
        ...w.direction,
        coaches: command.choice === 'standard' ? undefined : command.choice,
      };
      addEvent(w, 'coaching-investment', `코치 채용 기준 · ${option.name}`, option.summary);
      return;
    }
    case 'facility-upgrade': {
      const next = nextWork(w, command.part);
      if (partLevel(w, command.part) !== command.from || next?.cost !== command.cost)
        throw new Error('공사 조건이 바뀌었어요. 현재 비용을 확인하고 다시 선택해 주세요.');
      startFacilityWork(w, command.part, (amount) => debit(w, amount));
      return;
    }
  }
}
