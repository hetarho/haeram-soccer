import { useId, useState } from 'react';
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
} from '../../../../packages/contracts/src/owner';
import { OWNER_TIERS, OWNER_TRAITS } from '../../../../packages/engine/src/owner-config';
import { useLocale } from '../presentation/react';
import { ClubListing } from './ClubListing';
import { seasonName } from './format';
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
  type ClubSheetFacts,
} from './startChoices';
import presentationStyle from './PresentationSettings.module.css';
import s from './StartFlow.module.css';

type Step = 'tier' | 'traits' | 'decade';
const STEPS = [
  ['tier', '구단주'],
  ['traits', '특성'],
  ['decade', '시대'],
  ['club', '인수'],
] as const;
/** The reference careers' start (→LEAGUE-13): a 1950 takeover by a 중견 사업가. */
const FIRST_CHOICE = { tier: 'midsize', decade: 1950 } as const;
const randomSeed = () => crypto.randomUUID().slice(0, 18);

export interface StartFlowProps {
  /** Generates the world for the choice (→WORLD-13); the host reports progress and the list. */
  onGenerate: (choice: StartChoice) => void;
  /** The season the generation has reached (→WEB-15, ARCH-28). */
  progress?: { season: number };
  /** Every club on sale once the world stands at the takeover season (→ECON-37). */
  listings?: Listing[];
  /** The chosen tier's fortune in pounds, minor units (→OWNER-3). */
  fortune?: string;
  /** Takes the club over with the chosen direction; no preset is 기본 방향 (→WEB-15). */
  onTakeOver: (clubId: string, preset?: string) => void;
  /** Opens a club's squad, manager, stadium and history for its sheet. */
  loadClub?: (clubId: string) => Promise<ClubSheetFacts | undefined>;
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
  const view = listings ? 'club' : generating ? 'progress' : step;
  const order = STEPS.findIndex(([id]) => id === (view === 'progress' ? 'club' : view));
  const update = (change: Partial<StartChoice>) =>
    setChoice((current) => ({ ...current, ...change }));
  const generate = () => {
    if (busy || readonly) return;
    setGenerating(true);
    onGenerate({ ...choice, seed: choice.seed.trim() || randomSeed() });
  };
  return (
    <section className={s.start} data-testid="start-flow" aria-label="새 게임">
      <header className={s.head}>
        <div className={`${s.slotBar} ${presentationStyle.startBar}`}>
          <span>{t('founding.slot', { slot: slot + 1 })}</span>
          {onBack && (
            <button type="button" onClick={onBack}>
              {t('founding.backToSlots')}
            </button>
          )}
        </div>
        <ol className={s.steps} data-surface="tile" aria-label="새 게임 단계">
          {STEPS.map(([id, label], index) => (
            <li
              key={id}
              aria-current={index === order ? 'step' : undefined}
              data-done={index < order || undefined}
            >
              <b>{String(index + 1).padStart(2, '0')}</b> {label}
            </li>
          ))}
        </ol>
      </header>
      {view === 'tier' && <TierStep tier={choice.tier} onChange={(tier) => update({ tier })} />}
      {view === 'traits' && (
        <TraitStep traits={choice.traits} onChange={(traits) => update({ traits })} />
      )}
      {view === 'decade' && (
        <DecadeStep
          decade={choice.decade}
          seed={choice.seed}
          onDecade={(decade) => update({ decade })}
          onSeed={(seed) => update({ seed })}
        />
      )}
      {view === 'progress' && (
        <GenerationProgress
          choice={choice}
          season={progress?.season ?? WORLD_START}
          error={error}
          onRetry={generate}
          onChange={() => setGenerating(false)}
          blocked={busy || readonly}
        />
      )}
      {view === 'club' && listings && (
        <ClubListing
          listings={listings}
          fortune={fortune}
          year={takeoverYear(choice.decade)}
          busy={busy}
          readonly={readonly}
          loadClub={loadClub}
          onTakeOver={onTakeOver}
        />
      )}
      {(view === 'tier' || view === 'traits' || view === 'decade') && (
        <div className={s.actions} data-ui="launch">
          {view !== 'tier' && (
            <button
              type="button"
              data-ui="secondary"
              onClick={() => setStep(view === 'decade' ? 'traits' : 'tier')}
            >
              ← 이전
            </button>
          )}
          {view === 'decade' ? (
            <button
              type="button"
              data-ui="primary"
              className={s.next}
              disabled={busy || readonly}
              onClick={generate}
            >
              {busy ? '세계를 준비하는 중…' : '세계 생성 →'}
            </button>
          ) : (
            <button
              type="button"
              data-ui="primary"
              className={s.next}
              onClick={() => setStep(view === 'tier' ? 'traits' : 'decade')}
            >
              다음 →
            </button>
          )}
        </div>
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
  const title = useId();
  return (
    <div className={s.step}>
      <h2 id={title}>어떤 구단주인가요?</h2>
      <div className={s.cards} role="group" aria-labelledby={title} data-testid="start-tiers">
        {WEALTH_TIER_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={s.card}
            aria-pressed={tier === id}
            onClick={() => onChange(id)}
          >
            <b>{OWNER_TIERS[id].label}</b>
            <span>{TIER_REACH[id]}</span>
            <small>{tierFortuneLine(id)}</small>
          </button>
        ))}
      </div>
      <p className={s.consequence} aria-live="polite">
        {tierNote(tier)}
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
  const difficulty = traitDifficulty(traits.length);
  const full = traits.length >= OWNER_TRAIT_LIMIT;
  const title = useId();
  return (
    <div className={s.step}>
      <h2 id={title}>어떤 재능을 가졌나요?</h2>
      <div className={s.gauge} data-surface="inset" aria-live="polite" data-testid="trait-gauge">
        <span className={s.gaugeHead}>
          <span>
            난이도 <b>{difficulty.label}</b>
          </span>
          <small>
            특성 {difficulty.count}/{OWNER_TRAIT_LIMIT}
          </small>
        </span>
        <span className={s.meter} aria-hidden="true">
          <small>{TRAIT_DIFFICULTY[0]}</small>
          {TRAIT_DIFFICULTY.map((label, index) => (
            <i key={label} data-on={index <= difficulty.step || undefined} />
          ))}
          <small>{TRAIT_DIFFICULTY.at(-1)}</small>
        </span>
      </div>
      <div
        className={`${s.cards} ${s.traits}`}
        role="group"
        aria-labelledby={title}
        data-testid="start-traits"
      >
        {OWNER_TRAIT_IDS.map((id) => {
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
              <b>{OWNER_TRAITS[id].label}</b>
              <small>{TRAIT_EFFECTS[id]}</small>
            </button>
          );
        })}
      </div>
      <p className={s.consequence}>고른 특성은 커리어 내내 그대로예요.</p>
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
  const before = seasonsBefore(takeoverYear(decade));
  const title = useId();
  return (
    <div className={s.step}>
      <h2 id={title}>언제 구단을 사나요?</h2>
      <div
        className={`${s.cards} ${s.decades}`}
        role="group"
        aria-labelledby={title}
        data-testid="start-decades"
      >
        {TAKEOVER_DECADES.map((id) => (
          <button
            key={id}
            type="button"
            className={s.card}
            aria-pressed={decade === id}
            onClick={() => onDecade(id)}
          >
            <b>{id}년대</b>
            <small>{DECADE_LINES[id]}</small>
          </button>
        ))}
      </div>
      <p className={s.consequence} aria-live="polite">
        {decadeSeason(decade)} ·{' '}
        {before ? `그 전 ${before}시즌을 세계가 먼저 치러요` : '세계가 바로 시작돼요'}
      </p>
      <details data-ui="disclosure" className={s.advanced}>
        <summary>고급 설정</summary>
        <div>
          <label>
            세계 생성 시드
            <input
              maxLength={80}
              value={seed}
              onChange={(event) => onSeed(event.target.value)}
              autoComplete="off"
            />
          </label>
          <p>같은 시드와 시대는 같은 세계를 만들어요.</p>
        </div>
      </details>
    </div>
  );
}

/** 세계를 생성중… with the season reached (→WEB-15, WORLD-13, ARCH-28). */
export function GenerationProgress({
  choice,
  season,
  error,
  blocked = false,
  onRetry,
  onChange,
}: {
  choice: StartChoice;
  season: number;
  error?: string;
  blocked?: boolean;
  onRetry?: () => void;
  onChange?: () => void;
}) {
  const year = takeoverYear(choice.decade);
  const share = Math.round(generationShare(season, choice.decade) * 100);
  const difficulty = traitDifficulty(choice.traits.length);
  return (
    <div className={s.progress} data-testid="world-generation">
      <div role="status" aria-live="polite" className={s.progressHead}>
        <h2>세계를 생성중…</h2>
        <p className={s.season}>
          <b>{seasonName(Math.min(season, year))}</b> 시즌
        </p>
      </div>
      <progress aria-label="세계 생성 진행" max={100} value={share} />
      <p className={s.consequence}>
        {seasonName(WORLD_START)} 시즌부터 {seasonName(year)} 시즌 개막까지 · {share}%
      </p>
      {year >= WARTIME.restart && (
        <p className={s.consequence}>
          {seasonName(WARTIME.last + 1)}–{seasonName(WARTIME.restart - 1)} 시즌은 전쟁으로 열리지
          않아요.
        </p>
      )}
      <dl className={s.summary} data-surface="inset">
        <div>
          <dt>구단주</dt>
          <dd>{OWNER_TIERS[choice.tier].label}</dd>
        </div>
        <div>
          <dt>특성</dt>
          <dd>
            {choice.traits.length}개 · {difficulty.label}
          </dd>
        </div>
        <div>
          <dt>시대</dt>
          <dd>{choice.decade}년대</dd>
        </div>
      </dl>
      {error && (
        <div className={s.failed} role="alert">
          <p>{error}</p>
          <div className={s.actions}>
            {onChange && (
              <button type="button" data-ui="secondary" onClick={onChange}>
                선택 바꾸기
              </button>
            )}
            {onRetry && (
              <button type="button" data-ui="primary" disabled={blocked} onClick={onRetry}>
                다시 생성
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
