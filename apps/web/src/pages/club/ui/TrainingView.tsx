import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { developmentDestination } from '../../../shared/routing/personnelNavigation';
import { useTaskState } from '../../../shared/routing/taskMemory';
import { FacilityOverview } from './FacilityOverview';
import type { TrainingFocus, World } from '../../../../../../packages/contracts/src/types';
import {
  activeTrainingFocus,
  developmentOutlook,
  focusFor,
  trainingFocusInfo,
  type DevelopmentFactor,
  type DevelopmentHome,
} from '../../../../../../packages/engine/src/training';
import {
  AUTO_HARD_FATIGUE,
  AUTO_HARD_MORALE,
  AUTO_PLAYER_RECOVERY,
  AUTO_RECOVERY_FATIGUE,
} from '../../../../../../packages/engine/src/staff-info';
import { settleRate } from '../../../../../../packages/engine/src/adaptation';
import { TRAINING_INJURY } from '../../../../../../packages/engine/src/careers';
import { HARD_STREAK } from '../../../../../../packages/engine/src/morale';
import {
  activePlayers,
  ownMultiplier,
  overall,
} from '../../../../../../packages/engine/src/player-state';
import {
  ADAPTATION_NEUTRAL,
  MATCH_GAIN,
  TRAINING_GAIN,
  ATTRIBUTE_LABEL,
} from '../../../../../../packages/engine/src/player';
import type { ClientState, GameClient } from '../../../runtime/client';
import { PlaceActivities } from './PlaceActivities';
import { PlayerLink } from '../../../entities/player';
import { openHome, openStaff, type TrainingTab } from '../../../shared/routing/state';
import { callLine, playerCallLine } from '../../../entities/player/lib/teamState';
import { multiplierLabel } from '../../../entities/player/ui/PlayerProfile';
import { ATTRIBUTES } from '../../../../../../packages/contracts/src/player';
import s from './TrainingView.module.css';

type Props = { state: ClientState; client: GameClient };
type Outlook = ReturnType<typeof developmentOutlook>;

const FOCUSES: readonly [TrainingFocus, string][] = [
  ['balanced', sourceMessage('copy.stories.634269a095')],
  ['recovery', sourceMessage('copy.TrainingView.de755cc2f7')],
  ['hard', sourceMessage('copy.TrainingView.80b3f4a762')],
];
const focusName = (focus: TrainingFocus) => FOCUSES.find(([id]) => id === focus)![1];
/** A multiplier as ×1.12: two decimals at most, trailing zeros dropped. */
const times = (value: number) => `×${Math.round(value * 100) / 100}`;
/** What a focus does each settled round (→CLUB-11), its recovery with the standing bonuses. */
function focusEffect(focus: TrainingFocus, recoveryBonus: number) {
  const info = trainingFocusInfo[focus];
  return {
    recovery: sourceMessage('copy.TrainingView.bc9d799266', {
      p0: Math.max(0, info.recovery + recoveryBonus),
    }),
    growth: info.developmentMultiplier
      ? sourceMessage('copy.TrainingView.2cc20f3f5b', { p0: times(info.developmentMultiplier) })
      : sourceMessage('copy.TrainingView.10c120503d'),
  };
}

/** 훈련 or 유소년: the coaches' training read where it happens (→WEB-70). */
export function TrainingView({ state, client, view }: Props & { view: TrainingTab }) {
  useTextLocale();
  return view === 'training' ? (
    <FirstTeamTraining state={state} />
  ) : (
    <AcademyTraining state={state} client={client} />
  );
}

/** First-team training and academy can compose independently without copying their actions. */
export function FirstTeamTraining({ state }: { state: ClientState }) {
  useTextLocale();
  const w = state.view!.world;
  const outlook = developmentOutlook(w);
  return (
    <>
      <FacilityOverview
        w={w}
        kind="training"
        title={localizeValue(
          w.trainingGround
            ? sourceMessage('copy.TrainingView.534b619186', { p0: w.trainingGround })
            : sourceMessage('facility.training.base'),
        )}
      >
        {richMessage('copy.TrainingView.c6035b28b3', {
          p0: focusName(outlook.focus.focus),
          p1: ' ',
          p2:
            w.staff?.find((person) => person.role === 'assistant')?.name ??
            sourceMessage('team.vacant'),
        })}
      </FacilityOverview>
      <div className={`${s.stack} ${s.pair}`}>
        <TrainingFocusPanel w={w} outlook={outlook} />
        <DevelopmentDrivers outlook={outlook} />
        <PlayerTraining w={w} />
      </div>
    </>
  );
}
export function AcademyTraining({ state, client }: Props) {
  useTextLocale();
  const w = state.view!.world;
  return (
    <>
      <FacilityOverview w={w} kind="academy" title={displayMessage('copy.AcademyPanel.0c8e8ca5aa')}>
        {richMessage('copy.TrainingView.c0a5e26446', {
          p0: w.academyFacility
            ? sourceMessage('copy.TrainingView.db2b64b5cd', { p0: w.academyFacility })
            : sourceMessage('facility.academy.base'),
          p1:
            w.staff?.find((person) => person.role === 'youth')?.name ??
            sourceMessage('team.vacant'),
        })}
      </FacilityOverview>
      <PlaceActivities state={state} client={client} />
    </>
  );
}

/** A focus's settling per round, before 적응력 and the school (→PLAYER-12). */
const adaptationGain = (focus: TrainingFocus) =>
  sourceMessage('copy.TrainingView.2a5f529912', { p0: TRAINING_GAIN[focus].toFixed(3) });
const injuryChance = sourceMessage('copy.TrainingView.2a03c0a7e3', {
  p0: (TRAINING_INJURY * 100).toFixed(1),
});

/**
 * The first team's focus in force (→CLUB-13), read only: the assistant sets it by his rule each
 * settled round, and why; each focus's growth, recovery, adaptation and costs; and his rules.
 */
function TrainingFocusPanel({ w, outlook: { focus } }: { w: World; outlook: Outlook }) {
  useTextLocale();
  const call = callLine(w, 'assistant');
  return (
    <section
      data-surface="panel"
      className={s.card}
      id="training-focus"
      aria-label={displayMessage('copy.TrainingView.5c1363ff75')}
    >
      <header className={s.head}>
        <h3>{richMessage('copy.TrainingView.5c1363ff75')}</h3>
        <span data-testid="training-focus">
          {richMessage('copy.AcademyPanel.80d73fa296', { p0: focusName(focus.focus), p1: call.by })}
        </span>
      </header>
      <p data-surface="tile" className={s.advice} data-testid="training-advice">
        {localizeValue(call.reason)}
      </p>
      <p className={s.actor}>
        {richMessage('copy.TrainingView.823df5a6d6', {
          p0: ' ',
          p1: (
            <button type="button" onClick={() => openStaff('assistant')}>
              {richMessage('copy.TrainingView.30a2d064bc', {
                p0:
                  w.staff?.find((person) => person.role === 'assistant')?.name ??
                  sourceMessage('team.vacant'),
              })}
            </button>
          ),
        })}
      </p>
      <details data-ui="disclosure" className={s.reference}>
        <summary>{richMessage('copy.TrainingView.19e1c7b7a4')}</summary>
        <ul className={s.focuses} aria-label={displayMessage('copy.TrainingView.3ed4ca5943')}>
          {localizeValue(
            FOCUSES.map(([id, label]) => {
              const effect = focusEffect(id, focus.recoveryBonus);
              return (
                <li key={id} aria-current={focus.focus === id || undefined}>
                  <b>{localizeValue(label)}</b>
                  <span>
                    <small>{localizeValue(effect.recovery)}</small>
                    <small>{localizeValue(effect.growth)}</small>
                    <small>{localizeValue(adaptationGain(id))}</small>
                    {localizeValue(
                      id === 'hard' && (
                        <small className={s.cost}>
                          {richMessage('copy.TrainingView.0770468979', {
                            p0: injuryChance,
                            p1: HARD_STREAK.from,
                            p2: HARD_STREAK.cost,
                          })}
                        </small>
                      ),
                    )}
                  </span>
                </li>
              );
            }),
          )}
        </ul>
        <p className={s.note}>
          {richMessage('copy.TrainingView.1fc1c05b89', {
            p0: ' ',
            p1: ADAPTATION_NEUTRAL.toFixed(2),
            p2:
              focus.recoveryBonus !== 0 &&
              sourceMessage('copy.TrainingView.0b68bbf8d9', {
                p0: focus.recoveryBonus > 0 ? '+' : '',
                p1: focus.recoveryBonus,
              }),
          })}
        </p>
        <div data-surface="sheet" className={s.delegate}>
          <p>{richMessage('copy.TrainingView.a006e4ecd7')}</p>
          <ul className={s.rule}>
            <li>
              <b>{richMessage('copy.TrainingView.de755cc2f7')}</b>
              <span>
                {richMessage('copy.TrainingView.85cf0adbed', { p0: AUTO_RECOVERY_FATIGUE })}
              </span>
            </li>
            <li>
              <b>{richMessage('copy.TrainingView.80b3f4a762')}</b>
              <span>
                {richMessage('copy.TrainingView.b31386da00', {
                  p0: AUTO_HARD_FATIGUE,
                  p1: AUTO_HARD_MORALE,
                })}
              </span>
            </li>
            <li>
              <b>{richMessage('copy.stories.634269a095')}</b>
              <span>{richMessage('copy.TrainingView.2323550a0b')}</span>
            </li>
            <li>
              <b>{richMessage('copy.TrainingView.902805a1f3')}</b>
              <span>
                {richMessage('copy.TrainingView.5db98587e0', { p0: AUTO_PLAYER_RECOVERY })}
              </span>
            </li>
          </ul>
        </div>
      </details>
    </section>
  );
}

/**
 * 선수별 육성 (→CLUB-11, CLUB-13), read only: how many the assistant's player rule takes off the
 * squad's focus, then every first-team player with his focus this round and his growth.
 */
function PlayerTraining({ w }: { w: World }) {
  useTextLocale();
  const [filter, setFilter] = useTaskState<'all' | 'attention' | 'growth'>(
    w.id,
    'development-filter',
    'all',
  );
  const squadFocus = activeTrainingFocus(w);
  const all = [...activePlayers(w)].sort(
    (a, b) => b.fatigue - a.fatigue || a.adaptation - b.adaptation,
  );
  const squad = all.filter((player) =>
    filter === 'attention'
      ? player.fatigue >= AUTO_PLAYER_RECOVERY ||
        player.adaptation < ADAPTATION_NEUTRAL ||
        player.unsettled !== undefined
      : filter === 'growth'
        ? w.year - player.born < 27 && player.potential > overall(player)
        : true,
  );
  const own = all.filter((player) => playerCallLine(w, player, squadFocus).own).length;
  return (
    <section
      data-surface="panel"
      className={`${s.card} ${s.wide}`}
      aria-label={displayMessage('copy.TrainingView.faff9d54ec')}
    >
      <header className={s.head}>
        <h3>{richMessage('copy.TrainingView.faff9d54ec')}</h3>
        <span data-testid="own-focus-count">
          {richMessage('copy.TrainingView.5b0ffa8a24', { p0: own })}
        </span>
      </header>
      <div
        className={s.filters}
        role="group"
        aria-label={displayMessage('copy.TrainingView.b8bc816abf')}
      >
        {localizeValue(
          (
            [
              ['all', sourceMessage('copy.DecisionRuleFacts.a4b69faf0c')],
              ['attention', sourceMessage('copy.TrainingView.f467de7326')],
              ['growth', sourceMessage('copy.TrainingView.949d41b726')],
            ] as const
          ).map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {localizeValue(label)}
            </button>
          )),
        )}
      </div>
      <ul className={s.players} data-testid="adaptation-list">
        {localizeValue(
          squad.map((player) => {
            const call = playerCallLine(w, player, squadFocus);
            return (
              <li key={player.id} data-own={call.own || undefined}>
                <span className={s.playerName}>
                  <PlayerLink id={player.id} name={player.name} />
                  <small>
                    {richMessage('copy.TrainingView.f81e309de6', {
                      p0: player.position,
                      p1: w.year - player.born,
                      p2: Math.round(player.fatigue),
                    })}
                  </small>
                  <small>
                    {richMessage('copy.TrainingView.8629bfd0b4', {
                      p0: overall(player),
                      p1: Math.round(player.potential),
                      p2: (player.developed || 0).toFixed(2),
                    })}
                  </small>
                </span>
                <span className={s.playerFocus} data-testid={`player-focus-${player.id}`}>
                  <b>{localizeValue(focusName(focusFor(w, player, squadFocus)))}</b>
                  <small>{localizeValue(call.by)}</small>
                  <small>
                    {richMessage('copy.TrainingView.e1c9cc5c5c', {
                      p0: player.adaptation.toFixed(2),
                      p1: multiplierLabel(ownMultiplier(player)),
                    })}
                  </small>
                  <small>
                    {richMessage('copy.TrainingView.242d832347', {
                      p0: Number(settleRate(w, player).toFixed(2)),
                      p1:
                        player.unsettled !== undefined &&
                        sourceMessage('copy.TrainingView.36f0fb2c5c'),
                    })}
                  </small>
                </span>
              </li>
            );
          }),
        )}
      </ul>
      {localizeValue(
        !squad.length && (
          <p className={s.note}>
            {localizeValue(
              filter === 'attention'
                ? sourceMessage('copy.TrainingView.2451607b78')
                : sourceMessage('copy.Rich.eb8b7c3ab1'),
            )}
          </p>
        ),
      )}
      <details data-ui="disclosure" className={s.reference}>
        <summary>{richMessage('copy.TrainingView.698366b615')}</summary>
        <p className={s.note}>
          {richMessage('copy.TrainingView.63b26d8463', {
            p0: ADAPTATION_NEUTRAL.toFixed(2),
            p1: MATCH_GAIN.start.toFixed(3),
            p2: TRAINING_GAIN.recovery.toFixed(3),
            p3: TRAINING_GAIN.hard.toFixed(3),
          })}
        </p>
      </details>
    </section>
  );
}

/** Factors that share a label read as one row: its values and where it is set. */
interface DriverRow {
  label: string;
  detail: string;
  home: DevelopmentHome;
  terms: DevelopmentFactor[];
}
const homeName: Record<DevelopmentHome, string> = {
  'training/training': sourceMessage('copy.TrainingView.6e539568cb'),
  'business/strategy': sourceMessage('copy.TrainingView.9e820c8111'),
  'people/manager': sourceMessage('staff.role.manager'),
  'people/coaches': sourceMessage('copy.ClubStaff.64c4586f7b'),
  'business/facility': sourceMessage('copy.BusinessWorkbench.af2559470c'),
};
const toneOf = (value: number) => (value > 1 ? 'up' : value < 1 ? 'down' : 'flat');
/** Terms that change something; a row whose terms all multiply by 1 shows its first one. */
const shownTerms = (terms: DevelopmentFactor[]) => {
  const changing = terms.filter((term) => term.value !== 1);
  return changing.length ? changing : terms.slice(0, 1);
};
const termText = (term: DevelopmentFactor) =>
  `${term.applies === 'u21' ? sourceMessage('copy.TrainingView.84430e12dd') : ''}${times(term.value)}`;

/**
 * Opens where a term is set or read (→WEB-71): the focus above, on this tab; the direction's
 * investment and cards in 재정·투자, where they read as founded (→WEB-14).
 */
function openDriver(home: DevelopmentHome) {
  if (home === 'training/training') {
    document
      .getElementById('training-focus')
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return;
  }
  openHome(developmentDestination(home));
}

/**
 * What drives development now (→WEB-70): every term a settled round multiplies a young player's
 * growth by, with its value, each opening the place it is set.
 */
function DevelopmentDrivers({ outlook: { factors, skills } }: { outlook: Outlook }) {
  useTextLocale();
  const rows: DriverRow[] = [];
  for (const factor of factors) {
    const row = rows.find((existing) => existing.label === factor.label);
    if (row) row.terms.push(factor);
    else
      rows.push({ label: factor.label, detail: factor.detail, home: factor.home, terms: [factor] });
  }
  const total = (young: boolean) =>
    factors
      .filter((factor) => young || factor.applies === 'all')
      .reduce((product, factor) => product * factor.value, 1);
  const coaching = ATTRIBUTES.filter((skill) => skills[skill] !== 1).map(
    (skill) => `${ATTRIBUTE_LABEL[skill]} ${times(skills[skill])}`,
  );
  return (
    <section
      data-surface="panel"
      className={s.card}
      aria-label={displayMessage('copy.TrainingView.0695c862cf')}
    >
      <header className={s.head}>
        <h3>{richMessage('copy.TrainingView.0695c862cf')}</h3>
        <span>{richMessage('copy.TrainingView.df1486974e')}</span>
      </header>
      <p className={s.total} data-testid="development-total">
        <b>{localizeValue(times(total(true)))}</b>
        <small>{richMessage('copy.TrainingView.8c4ec87c57', { p0: times(total(false)) })}</small>
      </p>
      <details data-ui="disclosure" className={s.reference}>
        <summary>{richMessage('copy.TrainingView.bfdca47ca9')}</summary>
        <p className={s.note}>{richMessage('copy.TrainingView.8f3f3fb78d')}</p>
        <ul className={s.drivers}>
          {localizeValue(
            rows.map((row) => {
              const shown = shownTerms(row.terms);
              return (
                <li key={row.label}>
                  <button
                    type="button"
                    aria-label={displayMessage('copy.TrainingView.3fe8916d0e', {
                      p0: row.label,
                      p1: shown.map(termText).join(' · '),
                      p2: homeName[row.home],
                    })}
                    onClick={() => openDriver(row.home)}
                  >
                    <span className={s.driverText}>
                      <b>{localizeValue(row.label)}</b>
                      <small>
                        {localizeValue(row.detail)}
                        {localizeValue(
                          row.home === 'people/coaches' &&
                            ` · ${coaching.length ? coaching.join(' · ') : sourceMessage('copy.TrainingView.1f43be7794')}`,
                        )}
                      </small>
                    </span>
                    <span className={s.driverValues}>
                      {localizeValue(
                        shown.map((term) => (
                          <span key={term.key} data-tone={toneOf(term.value)}>
                            {localizeValue(termText(term))}
                          </span>
                        )),
                      )}
                    </span>
                    <span className={s.chevron} aria-hidden="true">
                      ›
                    </span>
                  </button>
                </li>
              );
            }),
          )}
        </ul>
      </details>
    </section>
  );
}
