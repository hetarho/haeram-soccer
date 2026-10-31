import { createHash } from 'node:crypto';
import { canonical } from '../../packages/contracts/src/index';
import {
  CREST_PALETTE,
  CREST_PRESETS,
  KIT_ROLES,
  SHIRT_PATTERNS,
  type ClubIdentity,
  type IdentityColours,
  type KitRole,
  type ShirtDesign,
  type ShirtPattern,
} from '../../packages/contracts/src/identity';
import type { Fixture, World } from '../../packages/contracts/src/types';
import { clubOf, identityOf, nextOwnFixture, operate } from '../../packages/engine/src/index';
import { selectMatchKits } from '../../packages/engine/src/kit-selection';

/**
 * T255: the marked synthetic cosmetic workload of the active-management century (KIT-9/6/12/13).
 * At each season's start the owner applies a complete own design through the real `club-identity`
 * command, cycling the 24-colour crest palette, the fourteen shirt patterns and the six ready-made
 * crest compositions by season number alone; before the final active checkpoint the owner chooses
 * a shirt for the real next own fixture through the real `match-kit` command. Every command is
 * checked as it runs: recorded appearances stay exactly as they were, the design applied last is
 * the one the matches since then wore, and the facts the cosmetic command may not touch (date,
 * cash, records) stay put. Nothing here draws randomness or reads the clock.
 */

const colour = (index: number) => CREST_PALETTE[index % CREST_PALETTE.length];

/** A shirt of `pattern`: plain shows no secondary, every other pattern requires it (KIT-4). */
function shirt(pattern: ShirtPattern, primary: string, secondary: string, trim?: string) {
  const design: ShirtDesign = { pattern, primary };
  if (pattern !== 'plain') design.secondary = secondary;
  if (trim) design.trim = trim;
  return design;
}

/**
 * Season `n`'s complete own design. Pure and deterministic: one, two then three representative
 * colours in turn; the crest composition `n` of six; home, away and third on patterns `n`, `n + 3`
 * and `n + 5` of fourteen (always three different ones) in palette colours, each with a trim one
 * season in three. Consecutive seasons always differ, every 24 seasons cover the whole palette, all
 * fourteen patterns on every role and all six compositions, and the designs repeat every 168.
 */
export function seasonIdentity(n: number): ClubIdentity {
  const main = colour(n),
    second = colour(n + 7),
    accent = colour(n + 13);
  const count = 1 + (n % 3);
  const colours = [main, second, accent].slice(0, count) as IdentityColours;
  const crest: ClubIdentity['crest'] = {
    ...CREST_PRESETS[n % CREST_PRESETS.length],
    primary: main,
  };
  if (count > 1) crest.secondary = second;
  if (count > 2) crest.accent = accent;
  const pattern = (offset: number) => SHIRT_PATTERNS[(n + offset) % SHIRT_PATTERNS.length];
  return {
    version: 1,
    colours,
    crest,
    kits: {
      home: shirt(pattern(0), main, second, n % 3 === 0 ? accent : undefined),
      away: shirt(
        pattern(3),
        colour(n + 11),
        colour(n + 17),
        n % 3 === 1 ? colour(n + 5) : undefined,
      ),
      third: shirt(
        pattern(5),
        colour(n + 3),
        colour(n + 19),
        n % 3 === 2 ? colour(n + 9) : undefined,
      ),
    },
  };
}

/** Every own record's appearance in canonical form, in record order; '' where none was recorded. */
export function recordedAppearances(w: World) {
  return w.ownMatches.map((match) => (match.appearance ? canonical(match.appearance) : ''));
}

/** Throws unless the records of `before` still hold exactly the same appearances (SAVE-22). */
export function assertAppearancesUnchanged(w: World, before: readonly string[], context: string) {
  if (w.ownMatches.length !== before.length)
    throw new Error(`Own match records changed during ${context}`);
  before.forEach((snapshot, index) => {
    const match = w.ownMatches[index];
    if ((match.appearance ? canonical(match.appearance) : '') !== snapshot)
      throw new Error(`Recorded appearance of ${match.id} changed during ${context}`);
  });
}

/** Recorded, missing and distinct own-match appearances: the snapshots the codec must keep. */
export function appearanceSummary(w: World) {
  const snapshots = recordedAppearances(w);
  return {
    records: snapshots.length,
    recorded: snapshots.filter(Boolean).length,
    absent: snapshots.filter((snapshot) => !snapshot).length,
    distinct: new Set(snapshots.filter(Boolean)).size,
  };
}

/** The facts a cosmetic command must leave alone, cheap enough to compare at every command. */
function untouchedStamp(w: World) {
  return canonical({
    year: w.year,
    round: w.round,
    calendar: w.calendar,
    cash: w.cash,
    income: w.income,
    expense: w.expense,
    tactic: w.tactic,
    lineup: w.lineup,
    players: w.players.length,
    fixtures: w.fixtures.length,
    history: w.history.length,
    ownMatches: w.ownMatches.length,
    events: w.events.length,
    inbox: w.inbox?.length ?? 0,
    receipts: w.receiptIds,
  });
}

const ownSide = (w: World, fixture: Pick<Fixture, 'home'>) =>
  fixture.home === w.playerClub ? 0 : 1;

/** The pending own-shirt choice the workload stored, with what it must look like once worn. */
export interface WorkloadKitChoice {
  fixtureId: string;
  role: KitRole;
  /** The role automatic selection would have given our side; the choice always differs. */
  automatic: KitRole;
  kind: Fixture['kind'];
  year: number;
  round: number;
  /** Our side in that fixture: 0 at home, 1 away. */
  ownSide: 0 | 1;
  /** The saved design of the chosen role when it was chosen. */
  shirt: ShirtDesign;
}

export interface IdentityWorkloadEvidence {
  /** Applied designs, one per season start. */
  edits: number;
  firstSeason?: number;
  lastSeason?: number;
  /** Distinct crest-palette colours in the applied designs, of `paletteSize`. */
  paletteColours: number;
  paletteSize: number;
  /** Distinct shirt patterns worn by the saved designs, in catalogue order. */
  shirtPatterns: ShirtPattern[];
  /** Distinct ready-made crest compositions applied, of `crestCompositionCount`. */
  crestCompositions: number;
  crestCompositionCount: number;
  /** Applied designs by their number of representative colours. */
  representativeColourCounts: Record<'1' | '2' | '3', number>;
  /** SHA-256 of the canonical applied designs in order. */
  designsSha256: string;
  /** Before/after comparisons of every recorded appearance, one per command. */
  appearanceChecks: number;
  /** Recorded appearances compared over all those checks. */
  appearancesCompared: number;
  /** Own records verified to wear the crest and saved shirt applied before them. */
  recordsWearingAppliedDesign: number;
  kitChoices: WorkloadKitChoice[];
}

/**
 * What a workload has applied and counted, as JSON: a benchmark that runs its century in several
 * processes (T308) hands it from one to the next, and `identityWorkload(state)` carries on exactly
 * where the first left off.
 */
export interface IdentityWorkloadState {
  seasons: number[];
  applied?: { identity: ClubIdentity; from: number };
  choices: WorkloadKitChoice[];
  appearanceChecks: number;
  appearancesCompared: number;
  recordsWearingAppliedDesign: number;
}

/**
 * A workload for one career: `edit` at each season's start, `chooseKit` before the checkpoint that
 * must carry a pending choice, `evidence` for the report. Its only state is what it applied, so
 * two workloads driven alike over equal worlds leave equal worlds and equal evidence; `state` and
 * `identityWorkload(state)` continue one in another process.
 */
export function identityWorkload(resume?: IdentityWorkloadState) {
  const designs: string[] = [];
  const seasons: number[] = [];
  const palette = new Set<string>();
  const patterns = new Set<ShirtPattern>();
  const compositions = new Set<number>();
  const counts = { '1': 0, '2': 0, '3': 0 };
  const choices: WorkloadKitChoice[] = structuredClone(resume?.choices ?? []);
  let applied: { identity: ClubIdentity; from: number } | undefined = resume?.applied
    ? structuredClone(resume.applied)
    : undefined;
  let appearanceChecks = resume?.appearanceChecks ?? 0,
    appearancesCompared = resume?.appearancesCompared ?? 0,
    recordsWearingAppliedDesign = resume?.recordsWearingAppliedDesign ?? 0;

  /** Season `n`'s design counted as applied. */
  function note(identity: ClubIdentity, n: number) {
    designs.push(canonical(identity));
    seasons.push(n);
    for (const value of [
      ...identity.colours,
      ...Object.values(identity.kits).flatMap(shirtColours),
    ])
      palette.add(value);
    for (const role of KIT_ROLES) patterns.add(identity.kits[role].pattern);
    compositions.add(n % CREST_PRESETS.length);
    counts[String(identity.colours.length) as '1' | '2' | '3']++;
  }
  for (const n of resume?.seasons ?? []) note(seasonIdentity(n), n);

  /** The own records settled since the last edit wear its crest and one of its saved shirts. */
  function verifyApplied(w: World) {
    if (!applied) return;
    const crest = canonical(applied.identity.crest);
    for (const match of w.ownMatches.slice(applied.from)) {
      const side = match.appearance?.sides[ownSide(w, match)];
      if (
        !side ||
        side.club !== w.playerClub ||
        canonical(side.crest) !== crest ||
        canonical(side.shirt) !== canonical(applied.identity.kits[side.role])
      )
        throw new Error(`Own match ${match.id} does not wear the design applied before it`);
      recordsWearingAppliedDesign++;
    }
  }

  /** Runs one cosmetic command and checks that it left recorded and sporting facts alone. */
  function command(w: World, run: () => void, context: string) {
    const before = recordedAppearances(w),
      stamp = untouchedStamp(w),
      revision = w.revision;
    run();
    assertAppearancesUnchanged(w, before, context);
    if (untouchedStamp(w) !== stamp) throw new Error(`${context} changed non-cosmetic facts`);
    if (w.revision !== revision + 1) throw new Error(`${context} did not count one revision`);
    appearanceChecks++;
    appearancesCompared += before.length;
  }

  return {
    /** Applies season `n`'s design through the `club-identity` command (KIT-9). */
    edit(w: World, n: number) {
      verifyApplied(w);
      const identity = seasonIdentity(n);
      const previous = canonical(clubOf(w).identity);
      if (previous === canonical(identity))
        throw new Error(`Season ${n} identity workload would not change the own design`);
      const others = canonical(
        w.clubs.filter((club) => club.id !== w.playerClub).map((club) => club.identity),
      );
      command(w, () => operate(w, { type: 'club-identity', identity }), `season ${n} design edit`);
      const own = clubOf(w);
      if (canonical(own.identity) !== canonical(identity) || own.color !== identity.colours[0])
        throw new Error(`Season ${n} design was not applied to the own club`);
      if (
        canonical(w.clubs.filter((club) => club.id !== w.playerClub).map((c) => c.identity)) !==
        others
      )
        throw new Error(`Season ${n} design edit reassigned another club's identity`);
      applied = { identity: structuredClone(identity), from: w.ownMatches.length };
      note(identity, n);
    },
    /**
     * Stores, through the `match-kit` command, a role for the real next own fixture that automatic
     * selection would not give us, so wearing it is visible in the settled record (KIT-6).
     */
    chooseKit(w: World): WorkloadKitChoice {
      verifyApplied(w);
      const fixture = nextOwnFixture(w);
      if (!fixture) throw new Error('Identity workload found no next own fixture');
      const side = ownSide(w, fixture);
      const automatic = selectMatchKits(identityOf(w, fixture.home), identityOf(w, fixture.away))
        .roles[side];
      const role = KIT_ROLES.find((candidate) => candidate !== automatic)!;
      const identities = canonical(w.clubs.map((club) => club.identity));
      command(
        w,
        () => operate(w, { type: 'match-kit', fixtureId: fixture.id, role }),
        'next-fixture shirt choice',
      );
      if (canonical(w.kitChoice) !== canonical({ fixtureId: fixture.id, role }))
        throw new Error('Next-fixture shirt choice was not stored');
      if (canonical(w.clubs.map((club) => club.identity)) !== identities)
        throw new Error('Next-fixture shirt choice edited a saved design');
      const choice: WorkloadKitChoice = {
        fixtureId: fixture.id,
        role,
        automatic,
        kind: fixture.kind,
        year: w.year,
        round: w.round,
        ownSide: side,
        shirt: structuredClone(clubOf(w).identity!.kits[role]),
      };
      choices.push(choice);
      return structuredClone(choice);
    },
    /** What it has applied and counted so far, to continue in another process. */
    state(): IdentityWorkloadState {
      return structuredClone({
        seasons,
        ...(applied ? { applied } : {}),
        choices,
        appearanceChecks,
        appearancesCompared,
        recordsWearingAppliedDesign,
      });
    },
    evidence(): IdentityWorkloadEvidence {
      return {
        edits: designs.length,
        firstSeason: seasons[0],
        lastSeason: seasons.at(-1),
        paletteColours: CREST_PALETTE.filter((value) => palette.has(value)).length,
        paletteSize: CREST_PALETTE.length,
        shirtPatterns: SHIRT_PATTERNS.filter((pattern) => patterns.has(pattern)),
        crestCompositions: compositions.size,
        crestCompositionCount: CREST_PRESETS.length,
        representativeColourCounts: { ...counts },
        designsSha256: createHash('sha256').update(designs.join('\n')).digest('hex'),
        appearanceChecks,
        appearancesCompared,
        recordsWearingAppliedDesign,
        kitChoices: structuredClone(choices),
      };
    },
  };
}

function shirtColours(design: ShirtDesign) {
  return [design.primary, design.secondary, design.trim].filter((value) => value !== undefined);
}

export type IdentityWorkload = ReturnType<typeof identityWorkload>;

/** A decoded checkpoint still holds the same pending choice for the same next own fixture. */
export function assertPendingChoice(w: World, choice: WorkloadKitChoice) {
  if (canonical(w.kitChoice) !== canonical({ fixtureId: choice.fixtureId, role: choice.role }))
    throw new Error('Pending shirt choice was not kept');
  if (nextOwnFixture(w)?.id !== choice.fixtureId)
    throw new Error('Pending shirt choice no longer names the next own fixture');
  if (w.ownMatches.some((match) => match.id === choice.fixtureId))
    throw new Error('Pending shirt choice names a settled match');
}

/**
 * Once the named fixture settled: its record wears the chosen role and saved shirt on our side,
 * and the choice is used up rather than carried to another match (KIT-6, KIT-12).
 */
export function assertConsumedChoice(w: World, choice: WorkloadKitChoice) {
  if (w.kitChoice !== undefined) throw new Error('Shirt choice outlived its fixture');
  const record = w.ownMatches.find((match) => match.id === choice.fixtureId);
  const side = record?.appearance?.sides[choice.ownSide];
  if (
    !side ||
    side.club !== w.playerClub ||
    side.role !== choice.role ||
    canonical(side.shirt) !== canonical(choice.shirt)
  )
    throw new Error('Settled fixture did not wear the chosen shirt');
}
