import type { Command, World } from '../../contracts/src/types';
import { POLICY_INFO, policyOf } from './policy';
import { DIRECTION_INFO } from './direction';
import { nextWork, partLevel, startFacilityWork } from './facilities';
import { addEvent } from './events';
import { debit } from './transactions';

type InvestmentCommand = Extract<Command, {
  type: 'club-policy' | 'coaching-investment' | 'facility-upgrade';
}>;

/** Owner investment choices reuse the existing policy effects, spending and construction rules. */
export function investmentCommand(w: World, command: InvestmentCommand) {
  switch (command.type) {
    case 'club-policy': {
      const info = POLICY_INFO[command.key];
      const option = info?.levels.find((option) => option.level === command.level);
      if (!option) throw new Error('투자 단계를 확인해 주세요.');
      w.policy = { ...policyOf(w), [command.key]: command.level };
      addEvent(w, 'club-policy', `${info.label} · ${option.name}`, option.summary);
      return;
    }
    case 'coaching-investment': {
      const option = DIRECTION_INFO.coaches.options.find((option) => option.id === command.choice);
      if (!option) throw new Error('코치진 투자 수준을 확인해 주세요.');
      w.direction = { ...w.direction, coaches: option.id };
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
