import { message as sourceMessage } from '../../contracts/src/messages';
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
        throw new Error(sourceMessage('copy.ops_investment.d842dfec12'));
      const budget = { ...w.decisionBudgets?.[command.responsibility] };
      if (command.amount === null) delete budget.maxAnnualWage;
      else budget.maxAnnualWage = BigInt(command.amount).toString();
      w.decisionBudgets = { ...w.decisionBudgets, [command.responsibility]: budget };
      addEvent(
        w,
        'decision-wage-limit',
        sourceMessage('copy.ops_investment.a31454ca6a'),
        command.amount === null
          ? sourceMessage('copy.ops_investment.170ee849fd')
          : sourceMessage('copy.ops_investment.8ca1afcae5', { p0: moneyLabel(w, command.amount) }),
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
        throw new Error(sourceMessage('copy.ops_investment.dea4aaa7cf'));
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
        sourceMessage('copy.ops_investment.0b8db57c91', { p0: option.name }),
        sourceMessage('copy.ops_investment.6369d4732a'),
      );
      return;
    }
    case 'club-direction': {
      const info = DIRECTION_INFO[command.key];
      const option = info?.options.find((option) => option.id === command.choice);
      if (!option) throw new Error(sourceMessage('copy.ops_investment.df68b713f9'));
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
        throw new Error(sourceMessage('copy.ops_investment.86079834c3'));
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
        `${BUILD_SLOT_INFO[command.slot].label} · ${option?.label ?? sourceMessage('copy.ClubSettingControl.54af05f0bf')}`,
        sourceMessage('copy.ops_investment.66a03772b9'),
      );
      return;
    }
    case 'club-ticket': {
      const option = TICKET_LEVELS.find((option) => option.price === command.price);
      if (!option) throw new Error(sourceMessage('copy.ops_investment.7b59cee267'));
      w.ticket = option.price;
      addEvent(
        w,
        'club-ticket',
        sourceMessage('copy.ops_investment.cbaea17419', { p0: option.name }),
        option.summary,
      );
      return;
    }
    case 'club-policy': {
      const info = POLICY_INFO[command.key];
      const option = info?.levels.find((option) => option.level === command.level);
      if (!option) throw new Error(sourceMessage('copy.ops_investment.ab8a2c2261'));
      w.policy = { ...policyOf(w), [command.key]: command.level };
      addEvent(w, 'club-policy', `${info.label} · ${option.name}`, option.summary);
      return;
    }
    case 'coaching-investment': {
      const option = DIRECTION_INFO.coaches.options.find((option) => option.id === command.choice);
      if (!option) throw new Error(sourceMessage('copy.ops_investment.d4abced1b5'));
      w.direction = {
        ...w.direction,
        coaches: command.choice === 'standard' ? undefined : command.choice,
      };
      addEvent(
        w,
        'coaching-investment',
        sourceMessage('copy.ops_investment.4bd80a1eee', { p0: option.name }),
        option.summary,
      );
      return;
    }
    case 'facility-upgrade': {
      const next = nextWork(w, command.part);
      if (partLevel(w, command.part) !== command.from || next?.cost !== command.cost)
        throw new Error(sourceMessage('copy.ops_investment.04e1831360'));
      startFacilityWork(w, command.part, (amount) => debit(w, amount));
      return;
    }
  }
}
