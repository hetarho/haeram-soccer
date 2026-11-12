/**
 * How the 단장 turns the owner's request into his own plan: a revenue-linked budget, the way a
 * well-run club plans. He projects this season's income (`seasonRevenue`) and gives each work its
 * share of it — never a share of the cash in the bank. Squad cost (the players' wages and the
 * season's transfer fees) may take the share the request asks for (`SQUAD_SHARE`); what the wages
 * already take is committed, the rest is the season's transfer money, and a share of this season's
 * player sales goes back into signings. Youth money (the academy investment and the youth director's
 * pay) is a share of the same income. The request is not an order: his temperament decides how much
 * of it he follows, and he says why. The plan sets the numbers the engine uses — the checks of every
 * delegated decision, the signing search (`spendingStance`) and the settings he sets himself
 * (`DELEGATE_CONTROLS`) — and is made when the owner delegates or sends a request, when a season
 * starts, when a transfer window opens and when the income projection or this season's sales move
 * a lot (`replanIfMoved`). Apart from the plan, one plain stop keeps any delegated spend from
 * running the club out of cash (`insolvencyStop`).
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
import { lastSeasonTurnover } from './finance-read';
import { financeProjection, seasonRevenue } from './projection';
import { POLICY_INFO, policyEffects, policyOf } from './policy';
import { quote } from './quotes';
import { clubOf } from './player-state';
import { isDelegated } from './responsibilities';
import { DIRECTION_DEFAULT, DIRECTION_INFO, directionOf } from './direction';
import {
  ACADEMY_AIM,
  actedLevel,
  BUDGET_RESPONSIBILITIES,
  delegateOf,
  personOf,
  REINVEST_SHARE,
  RESPONSIBILITY_NAMES,
  requestLabel,
  requestOf,
  SAFETY_ROUNDS,
  SELL_LINE,
  SELL_STEP,
  sharePercent,
  SQUAD_SHARE,
  TEMPERAMENT_INFO,
  YOUTH_SHARE,
  type Delegate,
} from './delegation-info';
import { addEvent } from './events';
import { pushInbox } from './inbox';

/** The rules of a delegated decision that do not read money, from the level its person acts on. */
export interface SpendingStance {
  /** The wage bill's shares of income (percent) above which the staff sell harder (→CLUB-18). */
  sellAbove: readonly [number, number];
  /** The chief scout's upgrades (→CLUB-33): a margin over a starter (none: no upgrades), a cap. */
  signing: { margin?: number; upgrades: number };
  /** Points the 단장's bids add to the asking share (→CLUB-41). */
  bidExtra: number;
}
const UPGRADES: readonly SpendingStance['signing'][] = [
  { upgrades: 0 },
  { upgrades: 0 },
  { margin: 5, upgrades: 1 },
  { margin: 3, upgrades: 2 },
  { margin: 2, upgrades: 3 },
];
function stanceOf(level: SpendRequest): SpendingStance {
  const line = SELL_LINE[level];
  return {
    sellAbove: [sharePercent(line), sharePercent(line + SELL_STEP)],
    signing: UPGRADES[level - 1],
    bidExtra: level === 5 ? 10 : 0,
  };
}
/** The rules a delegated decision of `key` follows now. */
export function spendingStance(w: World, key: BudgetResponsibility): SpendingStance {
  return stanceOf(actedLevel(requestOf(w, key), delegateOf(w).temperament));
}

/** How the person answered the request. */
export type PlanResponse = 'followed' | 'tempered' | 'raised';
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
  /** This season's income he plans on (→`planRevenue`), and last season's for the trend. */
  revenue: string;
  lastRevenue?: string;
  /**
   * The work's share of that income, in basis points, and the share in money: squad cost for
   * signings and renewals, youth money for the academy, the wage line past which he sells harder
   * for sales; none for the manager's and the staff's posts, whose pay the settings he sets decide.
   */
  share: number;
  budget: string;
  /**
   * What the share already pays a year: the players' wages; the academy investment and the youth
   * director's pay; the manager's or the staff's wages for their posts.
   */
  committed: string;
  /** The committed money is past the share. */
  over: boolean;
  /** This season's player sales, the share of them (percent) he reinvests, and that money. */
  sales: string;
  reinvestShare: number;
  reinvest: string;
  /** This season's transfer fees, the 단장's open bids included. */
  spent: string;
  /**
   * What is left to spend: the share less what it already pays (never below zero), with the
   * reinvested sales and less this season's fees for signings; the room for raises for renewals.
   */
  left: string;
  /**
   * Youth money's split: the academy level it pays, that level's yearly cost, the youth director's
   * pay now and the most a new one may be paid (the whole share).
   */
  youth?: { level: PolicyLevel; cost: string; pay: string; payCap: string };
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
/** This season's player sales: fees received and leavers' compensation (the books' 선수 매각). */
export function seasonSales(w: World) {
  let sales = 0n;
  for (let i = w.events.length - 1; i >= 0; i--) {
    const event = w.events[i];
    if (event.year < w.year) break;
    if (
      event.year === w.year &&
      event.amount &&
      event.currency === w.currency &&
      (event.kind === 'transfer-out' || event.kind === 'free-transfer-compensation')
    )
      sales += BigInt(event.amount);
  }
  return sales;
}
/** The season's income the plans rest on: the one he planned on this season, else the projection. */
export function planRevenue(w: World): string {
  const plan = w.budgetPlan;
  return plan && plan.year === w.year ? plan.revenue : seasonRevenue(w);
}
const part = (amount: bigint, basisPoints: number) => (amount * BigInt(basisPoints)) / 10000n;
const above = (a: bigint, b: bigint) => (a > b ? a - b : 0n);

function academyCost(w: World, level: PolicyLevel) {
  const units = policyEffects({ ...policyOf(w), academy: level }).academyUnits;
  return units ? BigInt(quote(clubOf(w).country, w.year, units * SEASON_ROUNDS)) : 0n;
}
/**
 * Youth money's split: the youth director's pay comes first, and the academy runs at the level the
 * request aims at (→`ACADEMY_AIM`), or the highest the rest of the share pays for.
 */
function youthSplit(w: World, budget: bigint, level: SpendRequest) {
  const pay = BigInt(personOf(w, 'youth').member?.wage ?? '0'),
    room = budget - pay;
  let academy: PolicyLevel = 1;
  for (let step = ACADEMY_AIM[level]; step > 1; step--)
    if (academyCost(w, step as PolicyLevel) <= room) {
      academy = step as PolicyLevel;
      break;
    }
  return { level: academy, cost: academyCost(w, academy), pay, payCap: budget };
}
/**
 * The most a delegated staff search may pay a youth director (→`youthSplit`) while the academy's
 * money is delegated; undefined while the owner holds it.
 */
export function youthPayCap(w: World): bigint | undefined {
  if (!isDelegated(w, 'academy')) return undefined;
  return BigInt(delegatePlan(w, 'academy').youth!.payCap);
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

/**
 * The settings set for `key`: by the 단장 from the level he acts on and his plan's money, and for
 * the academy's football rows by the youth director from his own trait and temperament.
 */
function choicesFor(
  w: World,
  key: BudgetResponsibility,
  level: SpendRequest,
  delegate: Delegate,
  plan: Pick<DelegatePlan, 'over' | 'youth'>,
): PlanChoice[] {
  switch (key) {
    case 'academy': {
      const coach = personOf(w, 'youth');
      return [
        policyChoice('academy', plan.youth!.level),
        directionChoice(
          'youthGoal',
          coach.member?.trait === 'developer' ? 'firstTeam' : 'standard',
        ),
        directionChoice(
          'debut',
          coach.temperament === 'bold'
            ? 'early'
            : coach.temperament === 'cautious'
              ? 'ready'
              : 'standard',
        ),
      ];
    }
    case 'recruitment':
      return [
        policyChoice('recruitment', level),
        directionChoice(
          'recruitmentSupport',
          delegate.temperament === 'cautious'
            ? 'director'
            : delegate.temperament === 'bold'
              ? 'manager'
              : 'balanced',
        ),
      ];
    case 'contracts':
      return [
        directionChoice(
          'renewal',
          plan.over || level === 1
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
        directionChoice('manager', level <= 2 ? 'cheap' : level === 5 ? 'proven' : 'standard'),
        directionChoice('school', 'any'),
      ];
    case 'staff':
      return [
        directionChoice('coaches', level <= 2 ? 'cheap' : level === 5 ? 'elite' : 'standard'),
      ];
    case 'sales':
      return [];
  }
}

/**
 * The plan the 단장 holds for `key` now, or would hold if asked `request` instead. A plan is read
 * whether or not the work is delegated, so the delegation page can show it before.
 */
export function delegatePlan(
  w: World,
  key: BudgetResponsibility,
  request: SpendRequest = requestOf(w, key),
  /** The season's income when the caller already read it (`planRevenue(w)`). */
  income: string = planRevenue(w),
): DelegatePlan {
  const delegate = delegateOf(w),
    level = actedLevel(request, delegate.temperament),
    revenue = BigInt(income),
    costs = operatingCosts(w),
    wages = BigInt(costs.playerWages);
  let share = 0,
    committed = 0n,
    reinvestShare = 0,
    sales = 0n,
    spent = 0n,
    youth: DelegatePlan['youth'];
  switch (key) {
    case 'recruitment':
    case 'contracts':
      share = SQUAD_SHARE[level];
      committed = wages;
      break;
    case 'sales':
      share = SELL_LINE[level];
      committed = wages;
      break;
    case 'academy': {
      share = YOUTH_SHARE[level];
      const split = youthSplit(w, part(revenue, share), level);
      youth = {
        level: split.level,
        cost: split.cost.toString(),
        pay: split.pay.toString(),
        payCap: split.payCap.toString(),
      };
      committed = split.cost + split.pay;
      break;
    }
    case 'manager':
      committed = BigInt(costs.managerWage);
      break;
    case 'staff':
      committed = BigInt(costs.staffWages);
      break;
  }
  const budget = part(revenue, share),
    over = share > 0 && committed > budget;
  let left = key === 'sales' || share === 0 ? 0n : above(budget, committed);
  if (key === 'recruitment') {
    reinvestShare = REINVEST_SHARE[level];
    sales = seasonSales(w);
    spent = signingSpend(w);
    left = above(left + (sales * BigInt(reinvestShare)) / 100n, spent);
  }
  const plan = { over, youth };
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
    response: level < request ? 'tempered' : level > request ? 'raised' : 'followed',
    revenue: revenue.toString(),
    lastRevenue: lastSeasonTurnover(w),
    share,
    budget: budget.toString(),
    committed: committed.toString(),
    over,
    sales: sales.toString(),
    reinvestShare,
    reinvest: ((sales * BigInt(reinvestShare)) / 100n).toString(),
    spent: spent.toString(),
    left: left.toString(),
    youth,
    stance: stanceOf(level),
    choices: choicesFor(w, key, level, delegate, plan),
  };
}

/** The wage bill's share of the planned income, in basis points (0 without income). */
export function wageShareOf(w: World, wages = BigInt(operatingCosts(w).playerWages)) {
  const revenue = BigInt(planRevenue(w));
  return revenue > 0n ? Number((wages * 10000n) / revenue) : wages > 0n ? 99999 : 0;
}
/**
 * How hard the wage bill presses the delegated staff to sell (→CLUB-18): 2 past the sales plan's
 * second line, 1 past its first, else 0, with the wage bill's share of income now in percent.
 */
export function wagePressure(w: World) {
  const now = wageShareOf(w),
    line = SELL_LINE[actedLevel(requestOf(w, 'sales'), delegateOf(w).temperament)];
  return {
    level: now > line + SELL_STEP ? 2 : now > line ? 1 : 0,
    share: sharePercent(now),
  };
}

/**
 * The plain stop against running out of cash, whatever the plan says (→ECON-24): a delegated spend
 * of `spend` now that adds `wage` a year must leave a month of fixed costs in cash and, unless
 * `quick`, the season's cash projection above zero. The reason when it stops, else undefined.
 */
export function insolvencyStop(w: World, spend: bigint, wage: bigint, quick = false) {
  const perRound = (BigInt(operatingCosts(w).annual) + wage) / BigInt(SEASON_ROUNDS),
    floor = perRound * BigInt(SAFETY_ROUNDS);
  if (BigInt(w.cash) - spend < floor)
    return sourceMessage('delegation.stop.cash', {
      weeks: SAFETY_ROUNDS,
      floor: moneyLabel(w, floor.toString()),
    });
  if (quick) return undefined;
  const played = Math.min(w.round, SEASON_ROUNDS),
    end =
      BigInt(financeProjection(w).seasonEnd.low) -
      spend -
      (wage * BigInt(SEASON_ROUNDS - played)) / BigInt(SEASON_ROUNDS);
  if (end < 0n)
    return sourceMessage('delegation.stop.seasonEnd', { projected: moneyLabel(w, end.toString()) });
  return undefined;
}

/** The plan in words: how he heard the request, the income he plans on and the work's money. */
export function planLines(w: World, plan: DelegatePlan): string[] {
  const money = (amount: string) => moneyLabel(w, amount),
    level = requestLabel(plan.key, plan.level),
    share = sharePercent(plan.share),
    lines = [
      plan.response === 'followed'
        ? sourceMessage('delegation.response.followed', { level })
        : sourceMessage(
            plan.response === 'tempered'
              ? 'delegation.response.tempered'
              : 'delegation.response.raised',
            { temperament: TEMPERAMENT_INFO[plan.delegate.temperament].label, level },
          ),
    ];
  if (plan.share > 0)
    lines.push(
      plan.lastRevenue
        ? sourceMessage('delegation.plan.revenueTrend', {
            revenue: money(plan.revenue),
            last: money(plan.lastRevenue),
          })
        : sourceMessage('delegation.plan.revenue', { revenue: money(plan.revenue) }),
    );
  switch (plan.key) {
    case 'recruitment':
      lines.push(
        sourceMessage('delegation.plan.squad', {
          share,
          budget: money(plan.budget),
          committed: money(plan.committed),
        }),
        sourceMessage('delegation.plan.reinvest', {
          share: plan.reinvestShare,
          sales: money(plan.sales),
          amount: money(plan.reinvest),
        }),
        sourceMessage('delegation.plan.signingLeft', {
          spent: money(plan.spent),
          left: money(plan.left),
        }),
      );
      break;
    case 'contracts':
      lines.push(
        sourceMessage('delegation.plan.wageCap', {
          share,
          budget: money(plan.budget),
          committed: money(plan.committed),
          left: money(plan.left),
        }),
      );
      break;
    case 'academy':
      lines.push(
        sourceMessage('delegation.plan.youth', {
          share,
          budget: money(plan.budget),
          pay: money(plan.youth!.pay),
          level: POLICY_INFO.academy.levels[plan.youth!.level - 1].name,
          cost: money(plan.youth!.cost),
        }),
      );
      break;
    case 'sales':
      lines.push(
        sourceMessage('delegation.plan.sellLine', {
          first: plan.stance.sellAbove[0],
          second: plan.stance.sellAbove[1],
          now: sharePercent(wageShareOf(w, BigInt(plan.committed))),
        }),
      );
      break;
  }
  return lines;
}

/** "단장 판단 · 넉넉히": the plan behind a delegated decision, for its report. */
export function planLabel(w: World, key: BudgetResponsibility) {
  const delegate = delegateOf(w);
  return sourceMessage('delegation.planLabel', {
    post: delegate.postLabel,
    level: requestLabel(key, actedLevel(requestOf(w, key), delegate.temperament)),
  });
}

/**
 * When the 단장 plans: delegated or asked anew, a season's start, a transfer window's opening, and
 * when the season's income projection (`revenue`) or its player sales (`sale`) moved a lot.
 */
export type PlanMoment = 'delegated' | 'request' | 'season' | 'window' | 'revenue' | 'sale';

/**
 * Every delegated work among `keys` is planned: the season's income is fixed for the plans until
 * the next moment, the settings set are written where the engine reads them, each change recorded
 * as a club event, and the 단장 reports when the owner just asked, when something changed, for
 * signings as a window opens, and for the money works when he re-planned on a moved income.
 */
export function applyDelegatePlans(
  w: World,
  moment: PlanMoment,
  keys: readonly BudgetResponsibility[] = BUDGET_RESPONSIBILITIES,
) {
  const delegated = keys.filter((key) => isDelegated(w, key));
  if (!delegated.length) return;
  const before = w.budgetPlan?.year === w.year ? w.budgetPlan : undefined;
  w.budgetPlan = { year: w.year, revenue: seasonRevenue(w), sales: seasonSales(w).toString() };
  const replanned =
    moment === 'revenue'
      ? sourceMessage('delegation.report.revenue', {
          before: moneyLabel(w, before?.revenue ?? '0'),
          after: moneyLabel(w, w.budgetPlan.revenue),
        })
      : moment === 'sale'
        ? sourceMessage('delegation.report.sale', {
            sales: moneyLabel(
              w,
              (BigInt(w.budgetPlan.sales) - BigInt(before?.sales ?? '0')).toString(),
            ),
          })
        : undefined;
  const revenue = w.budgetPlan.revenue;
  for (const key of delegated) {
    const plan = delegatePlan(w, key, undefined, revenue),
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
    const money = key === 'recruitment' || key === 'academy' || key === 'contracts';
    if (
      moment === 'delegated' ||
      moment === 'request' ||
      changed.length > 0 ||
      (moment === 'window' && key === 'recruitment') ||
      (replanned !== undefined && money)
    )
      pushInbox(w, {
        kind: 'staff-report',
        title,
        detail: [
          ...(replanned ? [replanned] : []),
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

/** The projection moved by a tenth of the planned income, or sales brought in a twentieth. */
const MOVED_TENTHS = 10n;
const SOLD_TWENTIETHS = 20n;
/**
 * After a round settles, the 단장 plans again when this season's income projection has moved by a
 * tenth since his plan (a cup run, a fall down the table) or player sales of a twentieth of the
 * income came in since it. Without a plan for this season (a career saved before plans were kept)
 * he makes one, as at a season's start.
 */
export function replanIfMoved(w: World) {
  if (!BUDGET_RESPONSIBILITIES.some((key) => isDelegated(w, key))) return;
  const plan = w.budgetPlan;
  if (!plan || plan.year !== w.year) {
    applyDelegatePlans(w, 'season');
    return;
  }
  const before = BigInt(plan.revenue),
    now = BigInt(seasonRevenue(w)),
    moved = now > before ? now - before : before - now,
    sold = seasonSales(w) - BigInt(plan.sales);
  if (before > 0n ? moved * MOVED_TENTHS >= before : now > 0n) applyDelegatePlans(w, 'revenue');
  else if (sold > 0n && sold * SOLD_TWENTIETHS >= before) applyDelegatePlans(w, 'sale');
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
