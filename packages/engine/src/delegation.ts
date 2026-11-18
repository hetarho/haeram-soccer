/** Live season-end cash floors for delegated decisions (→ECON-33). */
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
import { financeProjection, seasonRevenue, type FinanceProjection } from './projection';
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
  RECRUITMENT_LOOKS,
  RESPONSIBILITY_NAMES,
  requestLabel,
  requestOf,
  safetyRounds,
  sharePercent,
  TEMPERAMENT_INFO,
  YOUTH_SHARE,
  type Delegate,
} from './delegation-info';
import { DISTRESS, forcedSales } from './distress';
import { addEvent } from './events';
import { pushInbox } from './inbox';

/** The rules of a delegated decision that do not read money, from the level its person acts on. */
export interface SpendingStance {
  /**
   * The 단장's upgrades (→CLUB-33): a margin over a starter (none: no upgrades), a cap a window, the
   * squad less its listed players they stop above (none: the registration limit), whether he
   * lists surplus players to make room, whether he measures the squad against the money bar and
   * whether the slots below that bar raise the window's cap.
   */
  signing: {
    margin?: number;
    upgrades: number;
    room?: number;
    makeRoom?: boolean;
    bar?: boolean;
    barCap?: boolean;
  };
  /** Points the 단장's bids add to the asking share (→CLUB-41). */
  bidExtra: number;
  /** The bids he keeps pending at most with recruitment delegated (→CLUB-33). */
  pending: number;
}
const UPGRADES: readonly SpendingStance['signing'][] = [
  { upgrades: 0 },
  { upgrades: 0 },
  { margin: 5, upgrades: 1, room: 24 },
  { margin: 3, upgrades: 2, room: 28, makeRoom: true, bar: true, barCap: true },
  { margin: 2, upgrades: 3, makeRoom: true, bar: true, barCap: true },
];
function stanceOf(level: SpendRequest): SpendingStance {
  return {
    signing: UPGRADES[level - 1],
    bidExtra: level === 5 ? 10 : 0,
    pending: RECRUITMENT_LOOKS.pendingByStep[level - 1]!,
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
  /** The youth share of income and capital in basis points; 0 for every other work. */
  share: number;
  /** Current wage bill plus affordable added annual wages, or the youth budget. */
  budget: string;
  incomeBudget: string;
  /** Live middle season-end cash projection, before open fee reservations. */
  projected: string;
  /** Cash required at season end by the step acted on. */
  floor: string;
  /** Open delegated fees, reserved once. */
  reserved: string;
  /** Projection above the floor, less reserved fees; never negative. */
  spendable: string;
  fixedCosts: string;
  /** Annual fixed costs less planned income, never below zero. */
  loss: string;
  /**
   * What the work already pays a year: the players' wages; the academy investment and the youth
   * director's pay; the manager's or the staff's wages for their posts.
   */
  committed: string;
  /**
   * The work's money falls short: the floor test fails at the current wage bill (→ECON-33), or
   * the academy's pay and investment exceed the youth money.
   */
  over: boolean;
  /**
   * What is left: for signings the fee the floor test lets through at the current wage bill; for
   * renewals the largest raise it lets through; the youth money left.
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

/** Cash committed to live delegated bids, including bids carried across a season boundary. */
function pendingFees(w: World): bigint {
  return (w.bids ?? []).reduce(
    (total, bid) =>
      total +
      (bid.direction === 'out' &&
      bid.staff &&
      (bid.status === 'pending' || bid.status === 'countered')
        ? BigInt(bid.fee)
        : 0n),
    0n,
  );
}
/** A fee paid once now and annual wages added from today. */
export interface Commitment {
  fee?: bigint;
  wage?: bigint;
}
export interface FloorCheck {
  ok: boolean;
  loss: bigint;
  floor: bigint;
  projected: bigint;
}
/** Current-cost floor; temperament changes the step, never adds another reserve. */
export function cashFloor(level: SpendRequest, cash: bigint, annual: bigint): bigint {
  switch (level) {
    case 1: return cash;
    case 2: return annual;
    case 3: return annual / 2n;
    case 4: return 0n;
    case 5: return -(annual * BigInt(Math.round(DISTRESS.warning * 1000))) / 1000n;
  }
}
interface FloorBase {
  level: SpendRequest;
  projected: bigint;
  floor: bigint;
  annual: bigint;
  income: bigint;
  remaining: number;
}
function floorCheck(base: FloorBase, fee: bigint, wage: bigint): FloorCheck {
  const loss = above(base.annual + wage, base.income),
    projected = base.projected - fee - wage * BigInt(base.remaining) / BigInt(SEASON_ROUNDS) - wage;
  return { ok: projected >= base.floor && (base.level !== 1 || loss === 0n),
    loss, floor: base.floor, projected };
}
function floorBase(w: World, plan: Pick<DelegatePlan, 'level' | 'revenue'>, projection: FinanceProjection): FloorBase {
  const annual = BigInt(operatingCosts(w).annual);
  return { level: plan.level, annual, income: BigInt(plan.revenue),
    projected: middleCash(projection) - pendingFees(w),
    floor: cashFloor(plan.level, BigInt(w.cash), annual),
    remaining: SEASON_ROUNDS - Math.min(w.round, SEASON_ROUNDS) };
}
const middleCash = (projection: FinanceProjection) =>
  (BigInt(projection.seasonEnd.low) + BigInt(projection.seasonEnd.high)) / 2n;
/** Same live floor test for bids, raises and their previews; existing wages are already projected. */
export function floorTest(w: World, plan: Pick<DelegatePlan, 'level' | 'revenue'>,
  { fee = 0n, wage = 0n }: Commitment = {}, projection = financeProjection(w)): FloorCheck {
  return floorCheck(floorBase(w, plan, projection), fee, wage);
}
/** Largest annual raise, including the prorated current season and one full next season. */
function wageRoom(base: FloorBase): bigint {
  if (!floorCheck(base, 0n, 0n).ok) return 0n;
  let low = 0n, high = 1n;
  while (floorCheck(base, 0n, high).ok) high *= 2n;
  while (high - low > 1n) {
    const mid = (low + high) / 2n;
    if (floorCheck(base, 0n, mid).ok) low = mid;
    else high = mid;
  }
  return low;
}
/** Persisted outside prunable prose and plan snapshots; reads never emit a warning. */
export function warnCashFloor(w: World, projection = financeProjection(w)) {
  if (w.delegationWarningSeason === w.year ||
      !BUDGET_RESPONSIBILITIES.some(key => isDelegated(w, key))) return;
  const annual = BigInt(operatingCosts(w).annual),
    line = cashFloor(5, BigInt(w.cash), annual),
    projected = middleCash(projection) - pendingFees(w);
  if (projected > line + (annual * BigInt(Math.round(DISTRESS.warning * 1000))) / 1000n) return;
  w.delegationWarningSeason = w.year;
  pushInbox(w, { kind: 'finance', title: sourceMessage('delegation.floor.warningTitle'),
    detail: sourceMessage('delegation.floor.warning', {
      projected: moneyLabel(w, projected.toString()), floor: moneyLabel(w, line.toString()) }), attention: false });
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
 * The plan the 단장 holds for `key` now, or would hold if asked `request` instead, on `income` when
 * the caller already read it (`planRevenue(w)`). A plan is read whether or not the work is
 * delegated, so the delegation page can show it before.
 */
export function delegatePlan(
  w: World,
  key: BudgetResponsibility,
  request: SpendRequest = requestOf(w, key),
  income: string = planRevenue(w),
  projection = financeProjection(w),
): DelegatePlan {
  const delegate = delegateOf(w),
    level = actedLevel(request, delegate.temperament),
    revenue = BigInt(income),
    costs = operatingCosts(w),
    annual = BigInt(costs.annual),
    wages = BigInt(costs.playerWages),
    base = floorBase(w, { level, revenue: income }, projection),
    now = floorCheck(base, 0n, 0n),
    spendable = above(base.projected, base.floor),
    loss = now.loss,
    room = key === 'recruitment' || key === 'contracts' || key === 'sales' ? wageRoom(base) : 0n,
    feeRoom = now.ok ? spendable : 0n;
  let share = 0,
    budget = 0n,
    incomeBudget = 0n,
    committed = 0n,
    over = false,
    left = 0n,
    youth: DelegatePlan['youth'];
  switch (key) {
    case 'recruitment':
    case 'contracts':
    case 'sales':
      // Current wages plus the additional annual wages the live floor carries.
      budget = wages + room;
      committed = wages;
      over = !now.ok;
      left = key === 'recruitment' ? feeRoom : key === 'contracts' ? room : 0n;
      break;
    case 'academy': {
      share = YOUTH_SHARE[level];
      incomeBudget = part(revenue, share);
      budget = incomeBudget + part(spendable, share);
      const split = youthSplit(w, budget, level);
      youth = {
        level: split.level,
        cost: split.cost.toString(),
        pay: split.pay.toString(),
        payCap: split.payCap.toString(),
      };
      committed = split.cost + split.pay;
      over = committed > budget;
      left = above(budget, committed);
      break;
    }
    case 'manager':
      committed = BigInt(costs.managerWage);
      break;
    case 'staff':
      committed = BigInt(costs.staffWages);
      break;
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
    incomeBudget: incomeBudget.toString(),
    projected: middleCash(projection).toString(),
    floor: base.floor.toString(),
    reserved: pendingFees(w).toString(),
    spendable: spendable.toString(),
    fixedCosts: annual.toString(),
    loss: loss.toString(),
    committed: committed.toString(),
    over,
    left: left.toString(),
    youth,
    stance: stanceOf(level),
    choices: choicesFor(w, key, level, delegate, plan),
  };
}

/** Sell harder below the cash floor or in any financial distress (→ECON-33). */
export function wagePressure(w: World) {
  const plan = delegatePlan(w, 'sales');
  return { level: (forcedSales(w.distress) ? 2 : plan.over || w.distress?.stage ? 1 : 0) as 0 | 1 | 2 };
}

/**
 * The plain stop against running out of cash, whatever the plan says (→ECON-24): a delegated spend
 * of `spend` now that adds `wage` a year keeps the decision's cash buffer (zero for bold/freely) and, unless
 * `quick`, the season's cash projection above zero. The reason when it stops, else undefined.
 */
export function insolvencyStop(
  w: World,
  spend: bigint,
  wage: bigint,
  quick = false,
  key: BudgetResponsibility = 'recruitment',
  projection?: FinanceProjection,
) {
  const perRound = (BigInt(operatingCosts(w).annual) + wage) / BigInt(SEASON_ROUNDS),
    weeks = safetyRounds(w, key),
    floor = perRound * BigInt(weeks);
  if (BigInt(w.cash) - pendingFees(w) - spend < floor)
    return sourceMessage('delegation.stop.cash', {
      weeks,
      floor: moneyLabel(w, floor.toString()),
    });
  if (quick) return undefined;
  const played = Math.min(w.round, SEASON_ROUNDS),
    end =
      BigInt((projection ?? financeProjection(w)).seasonEnd.low) -
      pendingFees(w) -
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
  if (plan.key === 'manager' || plan.key === 'staff') return lines;
  lines.push(
    plan.lastRevenue
      ? sourceMessage('delegation.plan.revenueTrend', {
          revenue: money(plan.revenue),
          last: money(plan.lastRevenue),
        })
      : sourceMessage('delegation.plan.revenue', { revenue: money(plan.revenue) }),
  );
  if (plan.key === 'academy') {
    lines.push(
      sourceMessage('delegation.floor.summary', { projected: money(plan.projected), floor: money(plan.floor), spendable: money(plan.spendable) }),
      sourceMessage('delegation.plan.youth', {
        share,
        budget: money(plan.incomeBudget),
        pay: money(plan.youth!.pay),
        level: POLICY_INFO.academy.levels[plan.youth!.level - 1].name,
        cost: money(plan.youth!.cost),
      }),
    );
    return lines;
  }
  lines.push(
    sourceMessage('delegation.plan.loss', {
      fixed: money(plan.fixedCosts),
      wages: money(plan.committed),
      loss: money(plan.loss),
    }),
    sourceMessage('delegation.floor.summary', { projected: money(plan.projected), floor: money(plan.floor), spendable: money(plan.spendable) }),
  );
  switch (plan.key) {
    case 'recruitment':
      lines.push(
        sourceMessage('delegation.plan.signingRoom', {
          budget: money(plan.budget),
          left: money(plan.left),
        }),
      );
      break;
    case 'contracts':
      lines.push(
        sourceMessage('delegation.plan.raiseRoom', {
          budget: money(plan.budget),
          committed: money(plan.committed),
        }),
      );
      break;
    case 'sales':
      lines.push(
        sourceMessage(
          plan.over ? 'delegation.plan.salesPressedIncome' : 'delegation.plan.salesCalmIncome',
        ),
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
  warnCashFloor(w);
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
