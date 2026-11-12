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
import { setDelegationRequest } from './delegation';
import { RESPONSIBILITY_NAMES, settingDelegate, settingPerson } from './delegation-info';

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
      | 'delegation-request';
  }
>;

/**
 * A dial or direction row a delegated person sets is his while the work is delegated: the owner's
 * change is refused naming whose it is — the person the UI lock names (→`DELEGATE_CONTROLS`,
 * `settingPerson`).
 */
function refuseDelegated(w: World, setting: Parameters<typeof settingDelegate>[1]) {
  const key = settingDelegate(w, setting);
  if (key)
    throw new Error(
      sourceMessage('delegation.error.delegated', {
        area: RESPONSIBILITY_NAMES[key],
        person: settingPerson(w, setting).postLabel,
      }),
    );
}
/** Owner investment choices reuse the existing policy effects, spending and construction rules. */
export function investmentCommand(w: World, command: InvestmentCommand) {
  switch (command.type) {
    case 'delegation-request':
      setDelegationRequest(w, command.responsibility, command.level);
      return;
    case 'club-direction': {
      const info = DIRECTION_INFO[command.key];
      const option = info?.options.find((option) => option.id === command.choice);
      if (!option) throw new Error(sourceMessage('copy.ops_investment.df68b713f9'));
      refuseDelegated(w, { direction: command.key });
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
      refuseDelegated(w, { policy: command.key });
      w.policy = { ...policyOf(w), [command.key]: command.level };
      addEvent(w, 'club-policy', `${info.label} · ${option.name}`, option.summary);
      return;
    }
    case 'coaching-investment': {
      const option = DIRECTION_INFO.coaches.options.find((option) => option.id === command.choice);
      if (!option) throw new Error(sourceMessage('copy.ops_investment.d4abced1b5'));
      refuseDelegated(w, { direction: 'coaches' });
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
