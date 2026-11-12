/**
 * How a delegated person turns the owner's request into his own plan. The request says how much
 * to spend (→`SpendRequest`); the person hears it through his temperament and spends only cash
 * above his cutoff — the rounds of fixed costs he never touches — so a cautious 단장 asked to spend
 * freely holds back, and with no cash above the cutoff nobody spends. The plan sets the numbers the
 * engine uses: the spending checks of every delegated decision (`spendingStance`), the season's
 * signing budget and the settings the person sets himself (`DELEGATE_CONTROLS`), written at the
 * moments he plans — when the owner delegates or sends a request, when a season starts and when a
 * transfer window opens.
 */
import { message as sourceMessage } from '../../contracts/src/messages';
import type {
  BudgetResponsibility,
  DirectionKey,
  PolicyKey,
  PolicyLevel,
  SpendRequest,
  World,
} from '../../contracts/src/types';
import { SEASON_ROUNDS } from './calendar';
import { moneyLabel, operatingCosts } from './finance';
import { POLICY_INFO, policyEffects, policyOf } from './policy';
import { quote } from './quotes';
import { clubOf } from './player-state';
import { isDelegated } from './responsibilities';
import { DIRECTION_DEFAULT, DIRECTION_INFO, directionOf } from './direction';
import {
  actedLevel,
  BUDGET_RESPONSIBILITIES,
  BUDGET_STEP,
  delegateOf,
  RESPONSIBILITY_NAMES,
  requestLabel,
  requestOf,
  TEMPERAMENT_INFO,
  type Delegate,
} from './delegation-info';
import { addEvent } from './events';
import { pushInbox } from './inbox';

/** The money rules of a delegated decision, from its person's plan. */
export interface SpendingStance {
  /** Rounds of fixed costs kept after any spend: the person's cutoff. */
  runway: number;
  /** The yearly wage bill's ceiling against the last 12 months' revenue (→CLUB-26). */
  wageShare: number;
  /** Runways in rounds below which the staff sell harder: −20 and −10 points (→CLUB-18). */
  sellSteps: readonly [number, number];
  /** The chief scout's upgrades (→CLUB-33): a margin over a starter (none: no upgrades), a cap. */
  signing: { margin?: number; upgrades: number };
  /** Points the 단장's bids add to the asking share (→CLUB-41). */
  bidExtra: number;
}
const WAGE_SHARE = [0.55, 0.6, 0.65, 0.7, 0.75] as const;
const UPGRADES: readonly SpendingStance['signing'][] = [
  { upgrades: 0 },
  { upgrades: 0 },
  { margin: 5, upgrades: 1 },
  { margin: 3, upgrades: 2 },
  { margin: 2, upgrades: 3 },
];
/** How the sales request moves the runways at which the staff sell harder. */
const SELL_FACTOR = [2, 1.5, 1, 0.75, 0.5] as const;
/** The academy investment each acted level aims at; a bold youth coach goes to the top at 5. */
const ACADEMY_TARGET: readonly PolicyLevel[] = [1, 1, 2, 3, 4];

/** The rounds a person keeps and the level he acts on, without reading the club's money. */
function stanceOf(level: SpendRequest, reserveRounds: number): SpendingStance {
  const factor = SELL_FACTOR[level - 1];
  return {
    runway: reserveRounds,
    wageShare: WAGE_SHARE[level - 1],
    sellSteps: [Math.round(reserveRounds * factor), Math.round(reserveRounds * 2.5 * factor)],
    signing: UPGRADES[level - 1],
    bidExtra: level === 5 ? 10 : 0,
  };
}
/** The money rules a delegated decision of `key` follows now (→ECON-33's successor). */
export function spendingStance(w: World, key: BudgetResponsibility): SpendingStance {
  const delegate = delegateOf(w, key);
  return stanceOf(
    actedLevel(requestOf(w, key), delegate.temperament),
    TEMPERAMENT_INFO[delegate.temperament].reserveRounds,
  );
}

/** How the person answered the request. */
export type PlanResponse = 'followed' | 'tempered' | 'raised' | 'noMoney';
/** A club setting the person sets, with its row's name and the option's, for reports and pages. */
export type PlanChoice = { label: string; value: string } & (
  | { kind: 'policy'; key: PolicyKey; level: PolicyLevel }
  | { kind: 'direction'; key: DirectionKey; option: string }
);
export interface DelegatePlan {
  key: BudgetResponsibility;
  delegated: boolean;
  delegate: Omit<Delegate, 'member'>;
  request: SpendRequest;
  /** The level he acts on. */
  level: SpendRequest;
  response: PlanResponse;
  cash: string;
  /** The year's fixed costs he measures his cutoff by (→ECON-12). */
  annualFixed: string;
  /** Cash he keeps: his cutoff. */
  reserve: string;
  /** Cash above the cutoff, never negative. */
  spare: string;
  /**
   * The season's money for the work: the transfer fees of signings, or the academy's yearly
   * investment; `spent` is what this season's signings already took, `left` what remains.
   */
  budget: string;
  spent: string;
  left: string;
  stance: SpendingStance;
  choices: PlanChoice[];
}

/** This season's transfer fees: completed signings and the 단장's open bids. */
export function signingSpend(w: World) {
  let spent = 0n;
  for (let i = w.events.length - 1; i >= 0; i--) {
    const event = w.events[i];
    if (event.year < w.year) break;
    if (event.year === w.year && event.kind === 'transfer-in' && event.amount)
      if (event.currency === w.currency) spent += BigInt(event.amount);
  }
  for (const bid of w.bids ?? [])
    if (
      bid.direction === 'out' &&
      bid.staff &&
      bid.year === w.year &&
      (bid.status === 'pending' || bid.status === 'countered')
    )
      spent += BigInt(bid.fee);
  return spent;
}

const share = (amount: bigint, level: SpendRequest) =>
  amount > 0n ? (amount * BigInt(BUDGET_STEP * level)) / 100n : 0n;

function academyCost(w: World, level: PolicyLevel) {
  const units = policyEffects({ ...policyOf(w), academy: level }).academyUnits;
  return units ? BigInt(quote(clubOf(w).country, w.year, units * SEASON_ROUNDS)) : 0n;
}

function policyChoice(key: PolicyKey, level: PolicyLevel): PlanChoice {
  return {
    kind: 'policy',
    key,
    level,
    label: POLICY_INFO[key].label,
    value: POLICY_INFO[key].levels[level - 1].name,
  };
}
function directionChoice(key: DirectionKey, option: string): PlanChoice {
  return {
    kind: 'direction',
    key,
    option,
    label: DIRECTION_INFO[key].label,
    value: DIRECTION_INFO[key].options.find((one) => one.id === option)!.name,
  };
}

/** The settings the person sets for `key`, from the level he acts on and the club's money. */
function choicesFor(
  w: World,
  key: BudgetResponsibility,
  level: SpendRequest,
  delegate: Delegate,
  broke: boolean,
  budget: bigint,
): PlanChoice[] {
  const { temperament } = delegate;
  switch (key) {
    case 'academy': {
      const target = temperament === 'bold' && level === 5 ? 5 : ACADEMY_TARGET[level - 1];
      let academy: PolicyLevel = 1;
      if (!broke)
        for (let step = target; step > 1; step--)
          if (academyCost(w, step as PolicyLevel) <= budget) {
            academy = step as PolicyLevel;
            break;
          }
      const goal =
        delegate.member?.trait === 'developer'
          ? 'firstTeam'
          : broke
            ? 'sell'
            : level === 1
              ? 'minimal'
              : 'standard';
      const debut =
        temperament === 'bold' ? 'early' : temperament === 'cautious' ? 'ready' : 'standard';
      return [
        policyChoice('academy', academy),
        directionChoice('youthGoal', goal),
        directionChoice('debut', debut),
      ];
    }
    case 'recruitment':
      return [
        policyChoice('recruitment', level),
        directionChoice(
          'recruitmentSupport',
          temperament === 'cautious' ? 'director' : temperament === 'bold' ? 'manager' : 'balanced',
        ),
      ];
    case 'contracts':
      return [
        directionChoice(
          'renewal',
          broke || level === 1
            ? 'frugal'
            : level === 2
              ? 'coreOnly'
              : level === 5
                ? 'keepAll'
                : 'standard',
        ),
      ];
    case 'manager':
      return [
        directionChoice(
          'manager',
          broke || level <= 2 ? 'cheap' : level === 5 ? 'proven' : 'standard',
        ),
        directionChoice('school', 'any'),
      ];
    case 'staff':
      return [
        directionChoice(
          'coaches',
          broke || level <= 2 ? 'cheap' : level === 5 ? 'elite' : 'standard',
        ),
      ];
    case 'sales':
      return [];
  }
}

/**
 * The plan the person holds for `key` now, or would hold if asked `request` instead. A plan is
 * read whether or not the work is delegated, so the delegation page can show it before.
 */
export function delegatePlan(
  w: World,
  key: BudgetResponsibility,
  request: SpendRequest = requestOf(w, key),
  /** The year's fixed costs when the caller already read them (`operatingCosts(w).annual`). */
  annual: string = operatingCosts(w).annual,
): DelegatePlan {
  const delegate = delegateOf(w, key),
    info = TEMPERAMENT_INFO[delegate.temperament],
    level = actedLevel(request, delegate.temperament),
    annualFixed = BigInt(annual),
    reserve = (annualFixed * BigInt(info.reserveRounds)) / BigInt(SEASON_ROUNDS),
    cash = BigInt(w.cash),
    spare = cash > reserve ? cash - reserve : 0n,
    broke = spare === 0n;
  let budget = share(spare, level),
    spent = 0n;
  if (key === 'recruitment') {
    // The season's signing budget is measured on the cash before this season's signings, so
    // each fee comes out of one budget rather than shrinking the next one's base.
    spent = signingSpend(w);
    budget = share(cash + spent - reserve, level);
  }
  const left = budget > spent ? budget - spent : 0n;
  return {
    key,
    delegated: isDelegated(w, key),
    delegate: {
      post: delegate.post,
      postLabel: delegate.postLabel,
      name: delegate.name,
      temperament: delegate.temperament,
    },
    request,
    level,
    response: broke
      ? 'noMoney'
      : level < request
        ? 'tempered'
        : level > request
          ? 'raised'
          : 'followed',
    cash: cash.toString(),
    annualFixed: annualFixed.toString(),
    reserve: reserve.toString(),
    spare: spare.toString(),
    budget: budget.toString(),
    spent: spent.toString(),
    left: left.toString(),
    stance: stanceOf(level, info.reserveRounds),
    choices: choicesFor(w, key, level, delegate, broke, budget),
  };
}

/** The plan in words: how he heard the request, what he keeps and what he will spend. */
export function planLines(w: World, plan: DelegatePlan): string[] {
  const temperament = TEMPERAMENT_INFO[plan.delegate.temperament].label,
    level = requestLabel(plan.key, plan.level),
    lines = [
      plan.response === 'noMoney'
        ? sourceMessage(
            plan.key === 'sales'
              ? 'delegation.response.salesNoMoney'
              : 'delegation.response.noMoney',
            { cash: moneyLabel(w, plan.cash), reserve: moneyLabel(w, plan.reserve) },
          )
        : plan.response === 'followed'
          ? sourceMessage('delegation.response.followed', { level })
          : sourceMessage(
              plan.response === 'tempered'
                ? 'delegation.response.tempered'
                : 'delegation.response.raised',
              { temperament, level },
            ),
      sourceMessage('delegation.plan.reserve', {
        reserve: moneyLabel(w, plan.reserve),
        weeks: plan.stance.runway,
      }),
    ];
  if (plan.key === 'recruitment')
    lines.push(
      sourceMessage('delegation.plan.signingBudget', {
        budget: moneyLabel(w, plan.budget),
        spent: moneyLabel(w, plan.spent),
        left: moneyLabel(w, plan.left),
      }),
    );
  if (plan.key === 'contracts' || plan.key === 'recruitment')
    lines.push(
      sourceMessage('delegation.plan.wageShare', {
        share: Math.round(plan.stance.wageShare * 100),
      }),
    );
  if (plan.key === 'sales')
    lines.push(
      sourceMessage('delegation.plan.sellSteps', {
        first: plan.stance.sellSteps[0],
        second: plan.stance.sellSteps[1],
      }),
    );
  return lines;
}

/** "단장 판단 · 넉넉히": the plan behind a delegated decision, for its report. */
export function planLabel(w: World, key: BudgetResponsibility) {
  const delegate = delegateOf(w, key);
  return sourceMessage('delegation.planLabel', {
    post: delegate.postLabel,
    level: requestLabel(key, actedLevel(requestOf(w, key), delegate.temperament)),
  });
}

/** When a person plans: delegated or asked anew, a season's start, a transfer window's opening. */
export type PlanMoment = 'delegated' | 'request' | 'season' | 'window';

/**
 * Every delegated person among `keys` plans: the settings he sets are written where the engine
 * reads them, each change recorded as a club event, and he reports his plan when the owner just
 * asked, when something changed, or for signings as a window opens.
 */
export function applyDelegatePlans(
  w: World,
  moment: PlanMoment,
  keys: readonly BudgetResponsibility[] = BUDGET_RESPONSIBILITIES,
) {
  for (const key of keys) {
    if (!isDelegated(w, key)) continue;
    const plan = delegatePlan(w, key),
      changed: string[] = [];
    for (const choice of plan.choices) {
      if (choice.kind === 'policy') {
        if (policyOf(w)[choice.key] === choice.level) continue;
        w.policy = { ...policyOf(w), [choice.key]: choice.level };
      } else {
        if (directionOf(w, choice.key) === choice.option) continue;
        const direction = { ...w.direction };
        if (choice.option === DIRECTION_DEFAULT[choice.key]) delete direction[choice.key];
        else Object.assign(direction, { [choice.key]: choice.option });
        w.direction = direction;
      }
      changed.push(
        sourceMessage('delegation.change', { label: choice.label, value: choice.value }),
      );
    }
    const title = sourceMessage('delegation.report.title', {
      post: plan.delegate.postLabel,
      name: plan.delegate.name,
      area: RESPONSIBILITY_NAMES[key],
    });
    if (changed.length) addEvent(w, 'delegate-plan', title, changed.join(' · '));
    if (
      moment === 'delegated' ||
      moment === 'request' ||
      changed.length > 0 ||
      (moment === 'window' && key === 'recruitment')
    )
      pushInbox(w, {
        kind: 'staff-report',
        title,
        detail: [
          sourceMessage('delegation.report.request', {
            request: requestLabel(key, plan.request),
          }),
          ...planLines(w, plan),
          ...changed,
        ]
          .join(' · ')
          .slice(0, 400),
        attention: false,
      });
  }
}

/** The owner's request to a delegated person (→`delegation-request`). */
export function setDelegationRequest(w: World, key: BudgetResponsibility, level: SpendRequest) {
  if (!BUDGET_RESPONSIBILITIES.includes(key) || ![1, 2, 3, 4, 5].includes(level))
    throw new Error(sourceMessage('delegation.error.request'));
  const requests = { ...w.delegationRequests };
  if (level === 3) delete requests[key];
  else requests[key] = level;
  if (Object.keys(requests).length) w.delegationRequests = requests;
  else delete w.delegationRequests;
  addEvent(
    w,
    'delegation-request',
    sourceMessage('delegation.event.request', {
      area: RESPONSIBILITY_NAMES[key],
      request: requestLabel(key, level),
    }),
    sourceMessage('delegation.event.requestDetail'),
  );
  applyDelegatePlans(w, 'request', [key]);
}
