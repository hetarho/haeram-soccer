import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useEffect, useId, useState, type CSSProperties } from 'react';
import { country } from '../../../../../../packages/catalogs/src/index';
import type { GenerationDigest } from '../../../../../../packages/contracts/src/types';
import { BALLON_DOR_CONFIG } from '../../../../../../packages/engine/src/ballon-dor';
import {
  OWNER_TRAIT_IDS,
  OWNER_TRAIT_LIMIT,
  TAKEOVER_DECADES,
  WEALTH_TIER_IDS,
  type ClubListing as Listing,
  type OwnerTrait,
  type StartChoice,
  type TakeoverDecade,
  type WealthTier,
} from '../../../../../../packages/contracts/src/owner';
import { OWNER_TIERS, OWNER_TRAITS } from '../../../../../../packages/engine/src/owner-config';
import { useLocale } from '../../../presentation/react';
import { ClubListing } from './ClubListing';
import { atDeadline } from '../lib/deadline';
import { seasonName } from '../../../presentation/format';
import {
  cardCloses,
  closeDue,
  clubListFollows,
  featMessages,
  GENERATION_CARD,
  NO_CARDS,
  receiveDigest,
  type CardSchedule,
  type GenerationCard,
} from '../lib/generationCards';
import {
  DECADE_LINES,
  decadeSeason,
  generationShare,
  seasonsBefore,
  takeoverYear,
  TIER_REACH,
  tierFortuneLine,
  tierNote,
  TRAIT_DIFFICULTY,
  TRAIT_EFFECTS,
  toggleTrait,
  traitDifficulty,
  WARTIME,
  WORLD_START,
  type ClubProfile,
} from '../../../entities/league';
import presentationStyle from '../../../shared/ui/styles/PresentationSettings.module.css';
import s from './StartFlow.module.css';

type Step = 'tier' | 'traits' | 'decade';
const STEPS = [
  ['tier', sourceMessage('shell.owner')],
  ['traits', sourceMessage('copy.StartFlow.1f014f03f3')],
  ['decade', sourceMessage('copy.StartFlow.0ba34ab95f')],
  ['club', sourceMessage('copy.StartFlow.314728aaf5')],
] as const;
/** The reference careers' start (→LEAGUE-13): a 1950 takeover by a 중견 사업가. */
const FIRST_CHOICE = { tier: 'midsize', decade: 1950 } as const;
const randomSeed = () => crypto.randomUUID().slice(0, 18);

export interface StartFlowProps {
  /** Generates the world for the choice (→WORLD-13); the host reports progress and the list. */
  onGenerate: (choice: StartChoice) => void;
  /** The season the generation has reached (→WEB-15, ARCH-28). */
  progress?: { season: number };
  /** The latest season's history while the world is generated (→WEB-115). */
  digest?: GenerationDigest;
  /** Every club on sale once the world stands at the takeover season (→ECON-37). */
  listings?: Listing[];
  /** The chosen tier's fortune in pounds, minor units (→OWNER-3). */
  fortune?: string;
  /** Takes the club over with standard operating defaults (→WEB-15). */
  onTakeOver: (clubId: string) => void;
  /** Opens a club's squad, manager, stadium and history for its sheet. */
  loadClub?: (clubId: string) => Promise<ClubProfile | undefined>;
  /** A generation failure; the flow offers a retry and its choices again. */
  error?: string;
  /** The game slot this career goes into (→WEB-62). */
  slot?: number;
  /** Back to the slot screen when another slot holds a game. */
  onBack?: () => void;
  busy?: boolean;
  readonly?: boolean;
  /** Choices to open with, such as a restored start; otherwise 중견 사업가, no trait, 1950. */
  initial?: Partial<StartChoice>;
}

/**
 * The new-game flow (→WEB-2, WEB-15): the owner's wealth tier, his traits with their count read as
 * difficulty, the takeover decade with the seed as an advanced setting, then the world's
 * generation and the takeover list. It renders from props only; the host makes every runtime call.
 */
export function StartFlow({
  onGenerate,
  progress,
  digest,
  listings,
  fortune,
  onTakeOver,
  loadClub,
  error,
  slot = 0,
  onBack,
  busy = false,
  readonly = false,
  initial,
}: StartFlowProps) {
  useTextLocale();
  const { t } = useLocale();
  const [choice, setChoice] = useState<StartChoice>(() => ({
    tier: initial?.tier ?? FIRST_CHOICE.tier,
    traits: initial?.traits ?? [],
    decade: initial?.decade ?? FIRST_CHOICE.decade,
    seed: initial?.seed ?? randomSeed(),
  }));
  const [step, setStep] = useState<Step>('tier');
  // A host that restores a start mid-generation passes its progress from the first render.
  const [generating, setGenerating] = useState(() => progress !== undefined);
  const cards = useGenerationCards(digest);
  // The club list follows once a feat card on screen, or the last season's waiting one, closes.
  const view = listings
    ? clubListFollows(cards, true)
      ? 'club'
      : 'progress'
    : generating
      ? 'progress'
      : step;
  const order = STEPS.findIndex(([id]) => id === (view === 'progress' ? 'club' : view));
  const update = (change: Partial<StartChoice>) =>
    setChoice((current) => ({ ...current, ...change }));
  const generate = () => {
    if (busy || readonly) return;
    setGenerating(true);
    onGenerate({ ...choice, seed: choice.seed.trim() || randomSeed() });
  };
  return (
    <section className={s.start} data-testid="start-flow" aria-label={displayMessage('slots.new')}>
      <header className={s.head}>
        <div className={`${s.slotBar} ${presentationStyle.startBar}`}>
          <span>{localizeValue(t('founding.slot', { slot: slot + 1 }))}</span>
          {localizeValue(
            onBack && (
              <button type="button" onClick={onBack}>
                {localizeValue(t('founding.backToSlots'))}
              </button>
            ),
          )}
        </div>
        <ol
          className={s.steps}
          data-surface="tile"
          aria-label={displayMessage('copy.StartFlow.a84cebe204')}
        >
          {localizeValue(
            STEPS.map(([id, label], index) => (
              <li
                key={id}
                aria-current={index === order ? 'step' : undefined}
                data-done={index < order || undefined}
              >
                <b>{localizeValue(String(index + 1).padStart(2, '0'))}</b> {localizeValue(label)}
              </li>
            )),
          )}
        </ol>
      </header>
      {localizeValue(
        view === 'tier' && <TierStep tier={choice.tier} onChange={(tier) => update({ tier })} />,
      )}
      {localizeValue(
        view === 'traits' && (
          <TraitStep traits={choice.traits} onChange={(traits) => update({ traits })} />
        ),
      )}
      {localizeValue(
        view === 'decade' && (
          <DecadeStep
            decade={choice.decade}
            seed={choice.seed}
            onDecade={(decade) => update({ decade })}
            onSeed={(seed) => update({ seed })}
          />
        ),
      )}
      {localizeValue(
        view === 'progress' && (
          <GenerationProgress
            choice={choice}
            season={progress?.season ?? digest?.season ?? WORLD_START}
            digest={digest}
            card={cards.shown}
            error={error}
            onRetry={generate}
            onChange={() => setGenerating(false)}
            blocked={busy || readonly}
          />
        ),
      )}
      {localizeValue(
        view === 'club' && listings && (
          <ClubListing
            listings={listings}
            fortune={fortune}
            year={takeoverYear(choice.decade)}
            busy={busy}
            readonly={readonly}
            loadClub={loadClub}
            onTakeOver={onTakeOver}
          />
        ),
      )}
      {localizeValue(
        (view === 'tier' || view === 'traits' || view === 'decade') && (
          <div className={s.actions} data-ui="launch">
            {localizeValue(
              view !== 'tier' && (
                <button
                  type="button"
                  data-ui="secondary"
                  onClick={() => setStep(view === 'decade' ? 'traits' : 'tier')}
                >
                  {richMessage('copy.StartFlow.fc21be907f')}
                </button>
              ),
            )}
            {localizeValue(
              view === 'decade' ? (
                <button
                  type="button"
                  data-ui="primary"
                  className={s.next}
                  disabled={busy || readonly}
                  onClick={generate}
                >
                  {localizeValue(
                    busy
                      ? sourceMessage('copy.StartFlow.2a7ec63891')
                      : sourceMessage('copy.StartFlow.d881a69ece'),
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  data-ui="primary"
                  className={s.next}
                  onClick={() => setStep(view === 'tier' ? 'traits' : 'decade')}
                >
                  {richMessage('copy.StartFlow.1a3067051d')}
                </button>
              ),
            )}
          </div>
        ),
      )}
    </section>
  );
}

/** Six tiers, richest first, each naming the clubs it reaches (→OWNER-3). */
export function TierStep({
  tier,
  onChange,
}: {
  tier: WealthTier;
  onChange: (tier: WealthTier) => void;
}) {
  useTextLocale();
  const title = useId();
  return (
    <div className={s.step}>
      <h2 id={title}>{richMessage('copy.StartFlow.578c92d349')}</h2>
      <div className={s.cards} role="group" aria-labelledby={title} data-testid="start-tiers">
        {localizeValue(
          WEALTH_TIER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={s.card}
              aria-pressed={tier === id}
              onClick={() => onChange(id)}
            >
              <b>{localizeValue(OWNER_TIERS[id].label)}</b>
              <span>{localizeValue(TIER_REACH[id])}</span>
              <small>{localizeValue(tierFortuneLine(id))}</small>
            </button>
          )),
        )}
      </div>
      <p className={s.consequence} aria-live="polite">
        {localizeValue(tierNote(tier))}
      </p>
    </div>
  );
}

/** Up to five of eight traits, the count read as difficulty from 하드 to 이지 (→OWNER-2/5). */
export function TraitStep({
  traits,
  onChange,
}: {
  traits: OwnerTrait[];
  onChange: (traits: OwnerTrait[]) => void;
}) {
  useTextLocale();
  const difficulty = traitDifficulty(traits.length);
  const full = traits.length >= OWNER_TRAIT_LIMIT;
  const title = useId();
  return (
    <div className={s.step}>
      <h2 id={title}>{richMessage('copy.StartFlow.0d3e8e0a01')}</h2>
      <div className={s.gauge} data-surface="inset" aria-live="polite" data-testid="trait-gauge">
        <span className={s.gaugeHead}>
          <span>
            {richMessage('copy.StartFlow.5cbabfce0c', {
              p0: <b>{localizeValue(difficulty.label)}</b>,
            })}
          </span>
          <small>
            {richMessage('copy.StartFlow.4ce8c4ff95', {
              p0: difficulty.count,
              p1: OWNER_TRAIT_LIMIT,
            })}
          </small>
        </span>
        <span className={s.meter} aria-hidden="true">
          <small>{localizeValue(TRAIT_DIFFICULTY[0])}</small>
          {localizeValue(
            TRAIT_DIFFICULTY.map((label, index) => (
              <i key={label} data-on={index <= difficulty.step || undefined} />
            )),
          )}
          <small>{localizeValue(TRAIT_DIFFICULTY.at(-1))}</small>
        </span>
      </div>
      <div
        className={`${s.cards} ${s.traits}`}
        role="group"
        aria-labelledby={title}
        data-testid="start-traits"
      >
        {localizeValue(
          OWNER_TRAIT_IDS.map((id) => {
            const picked = traits.includes(id);
            return (
              <button
                key={id}
                type="button"
                className={s.card}
                aria-pressed={picked}
                disabled={!picked && full}
                onClick={() => onChange(toggleTrait(traits, id))}
              >
                <b>{localizeValue(OWNER_TRAITS[id].label)}</b>
                <small>{localizeValue(TRAIT_EFFECTS[id])}</small>
              </button>
            );
          }),
        )}
      </div>
      <p className={s.consequence}>{richMessage('copy.StartFlow.6ab0ed7481')}</p>
    </div>
  );
}

/** Eight decades with their lines, and the seed as an advanced setting (→WEB-2, WEB-15). */
export function DecadeStep({
  decade,
  seed,
  onDecade,
  onSeed,
}: {
  decade: TakeoverDecade;
  seed: string;
  onDecade: (decade: TakeoverDecade) => void;
  onSeed: (seed: string) => void;
}) {
  useTextLocale();
  const before = seasonsBefore(takeoverYear(decade));
  const title = useId();
  return (
    <div className={s.step}>
      <h2 id={title}>{richMessage('copy.StartFlow.1fd1f26d79')}</h2>
      <div
        className={`${s.cards} ${s.decades}`}
        role="group"
        aria-labelledby={title}
        data-testid="start-decades"
      >
        {localizeValue(
          TAKEOVER_DECADES.map((id) => (
            <button
              key={id}
              type="button"
              className={s.card}
              aria-pressed={decade === id}
              onClick={() => onDecade(id)}
            >
              <b>{richMessage('copy.StartFlow.ef153d8864', { p0: id })}</b>
              <small>{localizeValue(DECADE_LINES[id])}</small>
            </button>
          )),
        )}
      </div>
      <p className={s.consequence} aria-live="polite">
        {localizeValue(decadeSeason(decade))} ·{localizeValue(' ')}
        {localizeValue(
          before
            ? sourceMessage('copy.StartFlow.3cec68ac0b', { p0: before })
            : sourceMessage('copy.StartFlow.af486d4f60'),
        )}
      </p>
      <details data-ui="disclosure" className={s.advanced}>
        <summary>{richMessage('copy.StartFlow.eb114fcbc7')}</summary>
        <div>
          <label>
            {richMessage('copy.StartFlow.5b793818cf', {
              p0: (
                <input
                  maxLength={80}
                  value={seed}
                  onChange={(event) => onSeed(event.target.value)}
                  autoComplete="off"
                />
              ),
            })}
          </label>
          <p>{richMessage('copy.StartFlow.a5a562ea98')}</p>
        </div>
      </details>
    </div>
  );
}

/**
 * The feat cards' schedule (→WEB-115): each digest arrives once, and a card on screen closes by
 * itself after `GENERATION_CARD.ms`. A new generation (no digest yet) starts afresh.
 */
function useGenerationCards(digest: GenerationDigest | undefined) {
  const [schedule, setSchedule] = useState<CardSchedule>(NO_CARDS);
  useEffect(() => {
    const now = performance.now();
    setSchedule((current) =>
      digest ? receiveDigest(closeDue(current, now), digest, now) : NO_CARDS,
    );
  }, [digest]);
  const closes = cardCloses(schedule);
  useEffect(() => {
    if (closes === undefined) return;
    return atDeadline(closes, () => setSchedule((current) => closeDue(current, performance.now())));
  }, [closes]);
  return schedule;
}

/** The European Cup's first season (→EURO-1), before which the history has no European winner. */
const EUROPE_FIRST = 1955;

/**
 * 세계를 생성중… with the season reached (→WEB-15, WORLD-13, ARCH-28) and, for a later decade,
 * the world's history as it is made (→WEB-115): the season just closed with its 발롱도르, the
 * Club Elo world top 10, the league champions and European winners, and a feat card over them.
 */
export function GenerationProgress({
  choice,
  season,
  digest,
  card,
  error,
  blocked = false,
  onRetry,
  onChange,
}: {
  choice: StartChoice;
  season: number;
  digest?: GenerationDigest;
  card?: GenerationCard;
  error?: string;
  blocked?: boolean;
  onRetry?: () => void;
  onChange?: () => void;
}) {
  useTextLocale();
  const year = takeoverYear(choice.decade);
  const share = Math.round(generationShare(season, choice.decade) * 100);
  const difficulty = traitDifficulty(choice.traits.length);
  return (
    <div className={s.progress} data-testid="world-generation">
      <div role="status" aria-live="polite" className={s.progressHead}>
        <h2>{richMessage('copy.StartFlow.957e604e90')}</h2>
        <p className={s.season}>
          {richMessage('copy.ClubOperations.515f2f2582', {
            p0: <b>{localizeValue(seasonName(Math.min(season, year)))}</b>,
          })}
        </p>
      </div>
      {localizeValue(year > WORLD_START && <GenerationHistory digest={digest} />)}
      <progress aria-label={displayMessage('copy.StartFlow.3ca84950b7')} max={100} value={share} />
      <p className={s.consequence}>
        {richMessage('copy.StartFlow.97a633734e', {
          p0: seasonName(WORLD_START),
          p1: seasonName(year),
          p2: share,
        })}
      </p>
      {localizeValue(
        year >= WARTIME.restart && (
          <p className={s.consequence}>
            {richMessage('copy.StartFlow.171d85ae96', {
              p0: seasonName(WARTIME.last + 1),
              p1: seasonName(WARTIME.restart - 1),
            })}
          </p>
        ),
      )}
      <dl className={s.summary} data-surface="inset">
        <div>
          <dt>{richMessage('shell.owner')}</dt>
          <dd>{localizeValue(OWNER_TIERS[choice.tier].label)}</dd>
        </div>
        <div>
          <dt>{richMessage('copy.StartFlow.1f014f03f3')}</dt>
          <dd>
            {richMessage('copy.StartFlow.ee02f6b60d', {
              p0: choice.traits.length,
              p1: difficulty.label,
            })}
          </dd>
        </div>
        <div>
          <dt>{richMessage('copy.StartFlow.0ba34ab95f')}</dt>
          <dd>{richMessage('copy.StartFlow.ef153d8864', { p0: choice.decade })}</dd>
        </div>
      </dl>
      {localizeValue(
        error && (
          <div className={s.failed} role="alert">
            <p>{localizeValue(error)}</p>
            <div className={s.actions}>
              {localizeValue(
                onChange && (
                  <button type="button" data-ui="secondary" onClick={onChange}>
                    {richMessage('copy.StartFlow.6f68c82242')}
                  </button>
                ),
              )}
              {localizeValue(
                onRetry && (
                  <button type="button" data-ui="primary" disabled={blocked} onClick={onRetry}>
                    {richMessage('copy.StartFlow.360952ad93')}
                  </button>
                ),
              )}
            </div>
          </div>
        ),
      )}
      {localizeValue(card && <FeatCard key={card.season} card={card} />)}
    </div>
  );
}

/** The latest season's facts, compact text rows that are no touch targets (→WEB-115). */
function GenerationHistory({ digest }: { digest?: GenerationDigest }) {
  useTextLocale();
  const { t } = useLocale();
  if (!digest)
    return (
      <p className={s.consequence} data-testid="generation-history">
        {localizeValue(t('start.history.waiting'))}
      </p>
    );
  return (
    <section
      className={s.history}
      data-testid="generation-history"
      aria-label={localizeValue(t('start.history.region'))}
    >
      <p className={s.historyHead}>
        <span>
          {localizeValue(t('start.history.closed', { season: seasonName(digest.closed) }))}
        </span>
        <span data-testid="generation-ballon-dor">
          <small>{localizeValue(t('start.history.ballonDor'))}</small>
          {localizeValue(' ')}
          {localizeValue(
            digest.ballonDor ? (
              <>
                <b>{digest.ballonDor.name}</b> · {digest.ballonDor.club.name}
              </>
            ) : (
              t('start.history.ballonDorBefore', { season: seasonName(BALLON_DOR_CONFIG.first) })
            ),
          )}
        </span>
      </p>
      <div className={s.lists} data-surface="inset">
        <section className={s.list} aria-label={localizeValue(t('start.history.elo'))}>
          <h3>{localizeValue(t('start.history.elo'))}</h3>
          <ol data-testid="generation-elo">
            {localizeValue(
              digest.elo.map((row) => (
                <li key={row.id}>
                  <span className={s.name}>{row.name}</span>
                  <small>{localizeValue(row.country)}</small>
                  <b>{localizeValue(row.elo)}</b>
                </li>
              )),
            )}
          </ol>
        </section>
        <section className={s.list} aria-label={localizeValue(t('start.history.champions'))}>
          <h3>{localizeValue(t('start.history.champions'))}</h3>
          <ul data-testid="generation-champions">
            {localizeValue(
              digest.champions.map((row) => (
                <li key={row.country}>
                  <small>{localizeValue(country(row.country).name)}</small>
                  <span className={s.name}>{row.club.name}</span>
                </li>
              )),
            )}
          </ul>
          <h3>{localizeValue(t('start.history.europe'))}</h3>
          {localizeValue(
            digest.europe.length ? (
              <ul className={s.europe} data-testid="generation-europe">
                {localizeValue(
                  digest.europe.map((row) => (
                    <li key={row.kind}>
                      <small>{localizeValue(row.name)}</small>
                      <span className={s.name}>{row.club.name}</span>
                    </li>
                  )),
                )}
              </ul>
            ) : (
              <p className={s.listNote}>
                {localizeValue(
                  t('start.history.europeBefore', { season: seasonName(EUROPE_FIRST) }),
                )}
              </p>
            ),
          )}
        </section>
      </div>
    </section>
  );
}

/** A great feat's card: no input, closing by itself (→WEB-115). */
function FeatCard({ card }: { card: GenerationCard }) {
  useTextLocale();
  const { t } = useLocale();
  const { title, line } = featMessages(card, seasonName);
  return (
    <div className={s.featLayer}>
      <div
        className={s.feat}
        role="status"
        aria-live="polite"
        data-testid="generation-feat"
        data-feat={card.feat.kind}
        style={{ '--feat-ms': `${GENERATION_CARD.ms}ms` } as CSSProperties}
      >
        <small>
          {localizeValue(t('start.feat.label'))} · {localizeValue(seasonName(card.closed))}
        </small>
        <b>{localizeValue(t(...title))}</b>
        <span>{localizeValue(t(...line))}</span>
      </div>
    </div>
  );
}
