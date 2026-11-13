import { message as sourceMessage } from '../../contracts/src/messages';
import { registration, registrationRoom } from './registration';
import { movePerson } from './npc-continuity';
import { baseEffects } from './bases';
import type { Line, Player, Position, World, YouthFocus } from '../../contracts/src/types';
import { LINES } from '../../contracts/src/player';
import { currentDay, seasonDayOf } from './calendar';
import { activePlayers, clubOf, lineOfPlayer, overall } from './player-state';
import { addEvent } from './events';
import { joinClub, makePlayer, ownStarters } from './world';
import { clamp, compareIds, integer, random } from './primitives';
import { marketWage, signingClauses } from './contracts';
import { staffEffects, staffMember } from './staff';
import { pushInbox } from './inbox';
import { growAttributes, recordDevelopment } from './training';
import { moneyLabel } from './finance';
import { policyEffects, policyOf } from './policy';
import { buildEffects } from './build';
import { synergyEffects } from './synergy';
import { isDelegated } from './responsibilities';
import { debutRule, directionOf, directionOption, releaseRule } from './direction';
import { insolvencyStop } from './delegation';
import { academyFacilityTerms } from './facilities';
import { intakePotential } from './owner-traits';

/** First-team squad limit shared with signings. */
/** Prospects held at once; intakes stop while the academy is full. */
export const ACADEMY_LIMIT = 24;
/**
 * The youngest age a prospect signs his first professional contract (→CLUB-16): 17 in England,
 * 16 elsewhere.
 */
export function promotionAge(w: World) {
  return clubOf(w).country === 'ENG' ? 17 : 16;
}
/** Academy football ends with U-21: a prospect leaves at the close of the season he turns 21. */
export const ACADEMY_LEAVE_AGE = 21;
/** The academy's age groups by age in the season, younger ones growing faster (→CLUB-16). */
export const AGE_GROUPS = [
  { key: 'u17', label: 'U-17', ages: sourceMessage('copy.academy.999f207fb0'), growth: 1.2 },
  { key: 'u19', label: 'U-19', ages: sourceMessage('copy.academy.7af2cda5aa'), growth: 1 },
  { key: 'u21', label: 'U-21', ages: sourceMessage('copy.academy.778eff523e'), growth: 0.8 },
] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number]['key'];
export function ageGroupOf(w: Pick<World, 'year'>, player: Player): AgeGroup {
  const age = w.year - player.born;
  return age <= 16 ? 'u17' : age <= 18 ? 'u19' : 'u21';
}
/** The youth director's training focuses and what each does to each age group (→CLUB-31). */
export const YOUTH_FOCUS_INFO: Record<
  YouthFocus,
  { label: string; description: string; growth: Record<AgeGroup, number> }
> = {
  balanced: {
    label: sourceMessage('copy.stories.634269a095'),
    description: sourceMessage('copy.academy.f1b5914540'),
    growth: { u17: 1, u19: 1, u21: 1 },
  },
  fundamentals: {
    label: sourceMessage('copy.academy.41e116643b'),
    description: sourceMessage('copy.academy.ce37941800'),
    growth: { u17: 1.3, u19: 0.9, u21: 0.9 },
  },
  firstTeam: {
    label: sourceMessage('copy.academy.ba8ca7f9ea'),
    description: sourceMessage('copy.academy.077ddf5432'),
    growth: { u17: 0.9, u19: 1.15, u21: 1.25 },
  },
};
/** The positions intakes cycle through, so every line keeps coming (→CLUB-16). */
const INTAKE_POSITIONS: readonly Position[] = [
  'CB',
  'CM',
  'ST',
  'GK',
  'LB',
  'DM',
  'LW',
  'RB',
  'AM',
  'RW',
  'LM',
  'RM',
];
const hundredths = (value: number) => Math.round(value * 100) / 100;

export type AcademyReadiness = 'ready' | 'growing' | 'review';
export const ACADEMY_READINESS_LABEL: Record<AcademyReadiness, string> = {
  ready: sourceMessage('copy.academy.8798de2d6a'),
  growing: sourceMessage('copy.TrainingView.949d41b726'),
  review: sourceMessage('copy.academy.8bef3ea2ad'),
};
export interface AcademyProspect {
  player: Player;
  overall: number;
  potential: number;
  age: number;
  readiness: AcademyReadiness;
  label: string;
  group: AgeGroup;
}

/** Youth intake day, as in professional academies' spring intake. */
export function academyIntakeDay(w: World) {
  return seasonDayOf(w.year, 3, 15);
}
/** The intake's standard size, and the prospect a youth director of this ability adds. */
export const ACADEMY_INTAKE = { standard: 3, director: { ability: 70, extra: 1 } } as const;
/** Prospects that arrive at the next intake: 3, +1 with a strong youth director, +1 with academy facilities 2+. */
export function academyIntakeSize(w: World) {
  const director = staffMember(w, 'youth');
  return (
    ACADEMY_INTAKE.standard +
    (director && director.ability >= ACADEMY_INTAKE.director.ability
      ? ACADEMY_INTAKE.director.extra
      : 0) +
    academyFacilityTerms(w).intake +
    policyEffects(policyOf(w)).academyIntake +
    buildEffects(w).academyIntake +
    baseEffects(w).intake
  );
}
/**
 * Potential added to every prospect by academy investment, the club build, synergies, the bases
 * and 원석 감별사 (→OWNER-5).
 */
export function academyPotentialBonus(w: World) {
  return (
    policyEffects(policyOf(w)).academyPotential +
    buildEffects(w).academyPotential +
    synergyEffects(w).academyPotential +
    baseEffects(w).intakePotential +
    intakePotential(w)
  );
}
/** Runs once per season on the intake day. */
export function runAcademyIntake(w: World): void {
  if (currentDay(w) < academyIntakeDay(w) || w.academy?.intakeYear === w.year) return;
  // Older saves gain an academy on their first intake.
  const academy = (w.academy ||= { players: [] });
  academy.intakeYear = w.year;
  const count = Math.min(academyIntakeSize(w), Math.max(0, ACADEMY_LIMIT - academy.players.length));
  if (!count) {
    addEvent(
      w,
      'youth-intake',
      sourceMessage('copy.academy.450167248f'),
      sourceMessage('copy.academy.91b582add7', { p0: ACADEMY_LIMIT }),
    );
    return;
  }
  const code = clubOf(w).country,
    quality = staffEffects(w).academyQuality,
    bonus = academyPotentialBonus(w),
    prospects: Player[] = [];
  for (let i = 0; i < count; i++) {
    const r = random(`${w.seed}:academy-intake:${w.year}:${i}`);
    const position = INTAKE_POSITIONS[(w.year + i) % INTAKE_POSITIONS.length]!,
      age = integer(r, 15, 16),
      base = clamp(
        integer(r, 25, 36) + academyFacilityTerms(w).potential + Math.round(quality / 4),
        20,
        45,
      );
    const player = makePlayer(
      code,
      w.seed,
      `${w.playerClub}:academy:${w.year}:${i}`,
      w.year,
      base,
      position,
      age,
    );
    player.potential = Math.max(
      overall(player),
      clamp(base + integer(r, 22, 48) + quality + bonus, 40, 99),
    );
    // Academy prospects are unpaid until promoted.
    player.wage = '0';
    prospects.push(player);
  }
  academy.players.push(...prospects);
  for (const player of prospects) movePerson(w, player, w.playerClub, true);
  const best = [...prospects].sort(
    (a, b) => b.potential - a.potential || overall(b) - overall(a) || compareIds(a.id, b.id),
  )[0];
  const headline = sourceMessage('copy.academy.d59e6aa3c9', {
    p0: best.name,
    p1: best.position,
    p2: w.year - best.born,
    p3: overall(best),
    p4: Math.round(best.potential),
  });
  addEvent(
    w,
    'youth-intake',
    sourceMessage('copy.academy.972d06b13b', { p0: count }),
    sourceMessage('copy.academy.4f0b88514e', { p0: headline }),
  );
  pushInbox(w, {
    kind: 'youth-intake',
    title: sourceMessage('copy.academy.e5f882e314', { p0: count }),
    detail: sourceMessage('copy.academy.729d4236c2', { p0: headline }),
    attention: true,
    ref: best.id,
  });
}
/** Settled with each domestic round, alongside first-team training. */
export function developAcademy(w: World): void {
  const players = w.academy?.players;
  if (!players?.length) return;
  const growth = academyGrowth(w),
    focus = YOUTH_FOCUS_INFO[youthFocus(w)];
  for (const player of players) {
    const group = ageGroupOf(w, player),
      gap = Math.max(0, player.potential - overall(player)),
      gain = hundredths(
        Math.min(0.3, gap / 150) * growth * ageGroupGrowth(w, group) * focus.growth[group],
      );
    if (gain <= 0) continue;
    recordDevelopment(player, growAttributes(player, gain));
  }
}
/** An age group's growth factor, with U-21's lift under 데뷔 시점 늦게 (→CLUB-32). */
export function ageGroupGrowth(w: World, group: AgeGroup) {
  const base = AGE_GROUPS.find((one) => one.key === group)!.growth;
  return group === 'u21' ? base * debutRule(w).u21Growth : base;
}
/** The academy's growth factor before age group and focus: staff, academy facilities, investment, synergies. */
export function academyGrowth(w: World) {
  return (
    staffEffects(w).academyGrowth *
    academyFacilityTerms(w).growth *
    policyEffects(policyOf(w)).academyGrowth *
    synergyEffects(w).academyGrowth
  );
}
/** The OVR a prospect still lacks to be ready by the staff's measure; 0 once he is. */
function readyGapOf(w: World) {
  const active = activePlayers(w),
    level = firstTeamLevels(w),
    debut = debutRule(w);
  return (player: Player) => {
    const peers = active
        .filter((other) => lineOfPlayer(other) === lineOfPlayer(player))
        .map(overall),
      weakest = peers.length ? Math.min(...peers) : 0,
      bar = level[lineOfPlayer(player)] - debut.startersMargin;
    return Math.max(
      0,
      (debut.weakestMargin === undefined ? bar : Math.min(weakest - debut.weakestMargin, bar)) -
        overall(player),
    );
  };
}
/** The youth director's rule (→CLUB-31), with his reason in words. */
export function youthAdvice(w: World): { focus: YouthFocus; reason: string } {
  const prospects = academyPlayers(w),
    gap = readyGapOf(w);
  // 데뷔 시점 늦게 readies only U-21 for the first team (→CLUB-32).
  const late = directionOf(w, 'debut') === 'late';
  const near = prospects
    .filter((player) => ageGroupOf(w, player) !== 'u17')
    .filter((player) => !late || ageGroupOf(w, player) === 'u21')
    .map((player) => ({ player, gap: gap(player) }))
    .filter((entry) => entry.gap <= debutRule(w).gap)
    .sort((a, b) => a.gap - b.gap || compareIds(a.player.id, b.player.id))[0];
  if (near)
    return {
      focus: 'firstTeam',
      reason: near.gap
        ? sourceMessage('copy.academy.5138aaa1af', {
            p0: near.player.name,
            p1: Math.ceil(near.gap),
          })
        : sourceMessage('copy.academy.e969ffc42b', { p0: near.player.name }),
    };
  const young = prospects.filter((player) => ageGroupOf(w, player) === 'u17').length;
  if (young > prospects.length - young)
    return {
      focus: 'fundamentals',
      reason: sourceMessage('copy.academy.c2a2bb60cd', { p0: young }),
    };
  return { focus: 'balanced', reason: sourceMessage('copy.academy.6dcb706fdb') };
}
/** The academy's focus this round: the youth director's rule (→CLUB-31). */
export function youthFocus(w: World): YouthFocus {
  return youthAdvice(w).focus;
}

/** Average OVR of the automatic starters in each line, ignoring fatigue (→CLUB-32). */
function firstTeamLevels(w: World) {
  const starters = ownStarters(w);
  const all = starters.reduce((sum, player) => sum + overall(player), 0) / (starters.length || 1);
  const level = {} as Record<Line, number>;
  for (const line of LINES) {
    const inLine = starters.filter((player) => lineOfPlayer(player) === line);
    level[line] = inLine.length
      ? inLine.reduce((sum, player) => sum + overall(player), 0) / inLine.length
      : all;
  }
  return level;
}
/**
 * Ready by 데뷔 시점 (→CLUB-32): at the weakest first-teamer of his role (less its margin) or its
 * starters' level less its margin, from the promotion age and the row's earliest age. Up for
 * release by 육성 목표: from its age, potential below the weakest first-teamer or the starters'
 * level.
 */
function readinessOf(w: World) {
  const active = activePlayers(w),
    level = firstTeamLevels(w),
    debut = debutRule(w),
    release = releaseRule(w);
  return (player: Player): AcademyReadiness => {
    const age = w.year - player.born,
      rated = overall(player),
      peers = active.filter((other) => lineOfPlayer(other) === lineOfPlayer(player)).map(overall),
      weakest = peers.length ? Math.min(...peers) : 0;
    if (
      age >= Math.max(promotionAge(w), debut.fromAge) &&
      ((debut.weakestMargin !== undefined && rated >= weakest - debut.weakestMargin) ||
        rated >= level[lineOfPlayer(player)] - debut.startersMargin)
    )
      return 'ready';
    const bar = release.against === 'starters' ? level[lineOfPlayer(player)] : weakest;
    return age >= release.age && player.potential < bar ? 'review' : 'growing';
  };
}
/** Delegated staff keep a balanced squad: no promotion into an already full line. */
export const LINE_LIMIT: Record<Line, number> = { GK: 3, DF: 8, MF: 8, FW: 7 };
const lineRoom = (w: World, line: Line) =>
  activePlayers(w).filter((player) => lineOfPlayer(player) === line).length < LINE_LIMIT[line];
const prospectLine = (w: World, player: Player) =>
  sourceMessage('copy.academy.a0f3516562', {
    p0: player.name,
    p1: player.position,
    p2: w.year - player.born,
    p3: overall(player),
  });
function listed(w: World, players: Player[], limit = 4) {
  const shown = players.slice(0, limit).map((player) => prospectLine(w, player));
  return players.length > limit
    ? sourceMessage('copy.academy.838ab18828', { p0: shown.join(', '), p1: players.length - limit })
    : shown.join(', ');
}
const byStrength = (a: Player, b: Player) =>
  overall(b) - overall(a) || b.potential - a.potential || compareIds(a.id, b.id);

function takeProspect(w: World, id: string) {
  const player = w.academy?.players.find((prospect) => prospect.id === id);
  if (!w.academy || !player) throw new Error(sourceMessage('copy.academy.f9f1a326fd'));
  w.academy.players = w.academy.players.filter((prospect) => prospect !== player);
  return player;
}

export function promoteYouth(w: World, id: string): void {
  const prospect = academyPlayers(w).find((one) => one.id === id);
  if (!prospect) throw new Error(sourceMessage('copy.academy.f9f1a326fd'));
  if (w.year - prospect.born < promotionAge(w))
    throw new Error(sourceMessage('copy.teamState.56c3e9d63b', { p0: promotionAge(w) }));
  const room = registrationRoom(w, { ...prospect, graduate: true, joined: w.year });
  if (room) throw new Error(room);
  const player = takeProspect(w, id);
  // A first professional contract for three seasons, at his market wage (→CLUB-25), with its own
  // clauses (→CLUB-29).
  player.wage = marketWage(w, player);
  player.until = w.year + 3;
  player.clauses = signingClauses(w, player);
  player.status = 'active';
  player.fatigue = 0;
  player.graduate = true;
  joinClub(player, 'academy', w.year);
  w.players.push(player);
  movePerson(w, player, w.playerClub, true);
  addEvent(
    w,
    'youth-promotion',
    sourceMessage('copy.AcademyPanel.d1f97ef984', { p0: player.name }),
    sourceMessage('copy.academy.28297c9ad9', {
      p0: player.position,
      p1: w.year - player.born,
      p2: overall(player),
      p3: Math.round(player.potential),
      p4: moneyLabel(w, player.wage),
      p5: player.until,
    }),
  );
}
export function releaseYouth(w: World, id: string): void {
  const player = takeProspect(w, id);
  movePerson(w, player, undefined, true);
  addEvent(
    w,
    'youth-release',
    sourceMessage('copy.academy.d36962954f', { p0: player.name }),
    sourceMessage('copy.academy.4efa93e7cb', {
      p0: player.position,
      p1: w.year - player.born,
      p2: overall(player),
      p3: Math.round(player.potential),
    }),
  );
}
function staffReport(w: World, title: string, detail: string, ref?: string) {
  pushInbox(w, {
    kind: 'staff-report',
    title,
    detail: detail.slice(0, 400),
    attention: false,
    ...(ref ? { ref } : {}),
  });
}
/** Season boundary: academy ages, and delegated staff promote or release prospects. */
export function seasonAcademy(w: World): void {
  if (!w.academy?.players.length) return;
  // Academy football ends at 21 whoever decides; this also bounds the academy.
  for (const player of w.academy.players.filter(
    (prospect) => w.year - prospect.born >= ACADEMY_LEAVE_AGE,
  )) {
    releaseYouth(w, player.id);
    staffReport(
      w,
      sourceMessage('copy.academy.bf39f81a68', { p0: player.name }),
      sourceMessage('copy.academy.fe539ab44f', { p0: prospectLine(w, player) }),
      player.id,
    );
  }
  const readiness = readinessOf(w),
    prospects = [...w.academy.players].sort(byStrength),
    ready = prospects.filter((player) => readiness(player) === 'ready'),
    review = prospects.filter((player) => readiness(player) === 'review');
  w.academyReviews = [
    ...ready.map((p) => ({ id: p.id, year: w.year, kind: 'promote' as const })),
    ...review.map((p) => ({ id: p.id, year: w.year, kind: 'release' as const })),
  ];
  if (!isDelegated(w, 'academy')) {
    if (!ready.length && !review.length) return;
    const lines = [
      ...(ready.length ? [sourceMessage('copy.academy.c9188e940d', { p0: listed(w, ready) })] : []),
      ...(review.length
        ? [sourceMessage('copy.academy.ddb6b0a646', { p0: listed(w, review) })]
        : []),
    ];
    pushInbox(w, {
      kind: 'staff-report',
      title: sourceMessage('copy.academy.5d97905f68', { p0: ready.length, p1: review.length }),
      detail: sourceMessage('copy.academy.d5d93f42a4', { p0: lines.join(' / ') }).slice(0, 400),
      attention: true,
    });
    return;
  }
  const promoted = new Set<string>();
  // Every promotion adds a first-team wage: only the plain insolvency stop holds them back.
  const stop = ready.length
      ? insolvencyStop(
          w,
          0n,
          ready.reduce((all, player) => all + BigInt(player.wage), 0n),
          true,
          'academy',
        )
      : undefined,
    affordable = !stop;
  if (stop)
    staffReport(
      w,
      sourceMessage('copy.academy.daeb17db53', { p0: ready.length }),
      sourceMessage('delegation.promotion.stop', { reason: stop }),
    );
  for (const player of affordable ? ready : []) {
    if (registrationRoom(w, { ...player, graduate: true, joined: w.year })) continue;
    if (!lineRoom(w, lineOfPlayer(player))) continue;
    promoteYouth(w, player.id);
    promoted.add(player.id);
    staffReport(
      w,
      sourceMessage('copy.academy.721c7634e7', { p0: player.name }),
      sourceMessage('copy.academy.ba4c1787ee', {
        p0: prospectLine(w, player),
        p1: moneyLabel(w, player.wage),
        p2: player.until,
      }),
      player.id,
    );
  }
  for (const player of affordable ? ready : [])
    if (!promoted.has(player.id))
      staffReport(
        w,
        sourceMessage('copy.academy.0162002ab6', { p0: player.name }),
        sourceMessage('copy.academy.93d4fd6c34', { p0: prospectLine(w, player) }),
        player.id,
      );
  for (const player of review)
    if (!promoted.has(player.id)) {
      releaseYouth(w, player.id);
      staffReport(
        w,
        sourceMessage('copy.academy.cea0579e8f', { p0: player.name }),
        sourceMessage('copy.academy.960369de37', {
          p0: prospectLine(w, player),
          p1: Math.round(player.potential),
          p2: directionOption(w, 'youthGoal').name,
          p3: releaseRule(w).age,
          p4:
            releaseRule(w).against === 'starters'
              ? sourceMessage('copy.academy.da1dd04f0f')
              : sourceMessage('copy.DecisionRuleFacts.1fdaeae257'),
        }),
        player.id,
      );
    }
  // Every recommendation now has an actual staff outcome, including a recorded deferral.
  w.academyReviews = [];
}
export function academyPlayers(w: World): Player[] {
  return w.academy?.players || [];
}
/** Read model for the academy view; never changes the world. */
export function academySummary(w: World) {
  const readiness = readinessOf(w);
  const players: AcademyProspect[] = [...academyPlayers(w)].sort(byStrength).map((player) => {
    const state = readiness(player);
    return {
      player,
      overall: overall(player),
      potential: Math.round(player.potential),
      age: w.year - player.born,
      readiness: state,
      label: ACADEMY_READINESS_LABEL[state],
      group: ageGroupOf(w, player),
    };
  });
  const base = academyGrowth(w),
    focus = youthFocus(w),
    registrationState = registration(w);
  return {
    players,
    /**
     * Each age group with its prospects and growth factor this round: the academy's factor × the
     * group's × the youth focus's (→CLUB-16, CLUB-31).
     */
    groups: AGE_GROUPS.map((group) => ({
      ...group,
      factor:
        Math.round(
          base * ageGroupGrowth(w, group.key) * YOUTH_FOCUS_INFO[focus].growth[group.key] * 100,
        ) / 100,
      players: players.filter((prospect) => prospect.group === group.key),
    })),
    focus,
    promotionAge: promotionAge(w),
    /** First-team places left for promotions. */
    room: {
      total: Math.max(0, registrationState.ceiling - registrationState.total),
      counted: Math.max(0, registrationState.allowed - registrationState.counted),
    },
    capacity: ACADEMY_LIMIT,
    intakeDay: academyIntakeDay(w),
    intakeDone: w.academy?.intakeYear === w.year,
    nextIntakeSize: academyIntakeSize(w),
    delegated: isDelegated(w, 'academy'),
  };
}
