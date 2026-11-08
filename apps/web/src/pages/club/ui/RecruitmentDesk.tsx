import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { squadRegistration } from '../../../entities/player';
import { RecruitmentCommitments } from './MediationReview';
import { PlayerLink } from '../../../entities/player';
import { useTaskState } from '../../../shared/routing/taskMemory';
import { Select } from '../../../shared/ui/Select';
import { PixelIcon } from '../../../shared/ui/PixelIcon';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  Line,
  Position,
  TransferBid,
  World,
  WorldMarketTarget,
} from '../../../../../../packages/contracts/src/types';
import { LINES, POSITIONS } from '../../../../../../packages/contracts/src/player';
import {
  lineOf,
  POSITION_LABEL,
  ROLE_LABEL,
  TRAIT_LABEL,
} from '../../../../../../packages/engine/src/player';
import { releaseCost } from '../../../../../../packages/engine/src/staff-info';
import { positionsLabel } from '../../../entities/player';
import { bestRoles, PlayerProfile } from '../../../entities/player';
import { playerCallLine, runwayText } from '../../../entities/player';
import type { ScoutVerdict } from '../../../../../../packages/engine/src/scout-verdict';
import { bidBoard } from '../../../../../../packages/engine/src/transfers';
import { transferWindow } from '../../../../../../packages/engine/src/transfer-window';
import { bidKind, freeSigning, visibleBids } from '../lib/bids';
import { activePlayers, clubOf, overall } from '../../../../../../packages/engine/src/player-state';
import { recruitmentLineNeed } from '../../../../../../packages/engine/src/recruitment';
import type { ClientState, GameClient } from '../../../runtime/client';
import { gameActionsBlocked, useGameState } from '../../../runtime/store';
import { Dialog } from '../../../shared/ui/Dialog';
import { compactMoney } from '../../../presentation/format';
import { Money } from '../../../shared/ui/Money';
import { OvrBadge } from '../../../entities/player';
import { PositionBadge } from '../../../entities/player';
import { OfferAnswers } from './ClubStaff';
import { CandidateSource, RecruitmentNeeds, ScoutShortlist } from './ScoutShortlist';
import { candidateOrigin } from '../lib/shortlist';
import { DirectionFacts } from './DirectionFacts';
import { clubDivision } from '../../../entities/league';
import {
  DEFAULT_MARKET_QUERY,
  changeMarketQuery,
  marketLeagueKey,
  marketLeagues,
  signedFreeAgentTarget,
  toggleMarketComparison,
  useMarketDetail,
  useMarketPage,
  type MarketDetail,
  type MarketQuery,
} from '../lib/worldMarket';
import { PlayerCompare, type CompareSide } from './PlayerCompare';
import s from './RecruitmentDesk.module.css';

type Candidate = MarketDetail;
/**
 * A market row as one side of a comparison (→WEB-43). The market lists our own players too; one
 * of ours has no market terms (→WEB-109), so no fee, loan or cash after a signing shows for him.
 */
export function candidateSide(
  candidate: Candidate,
  label: string,
  onOpen?: () => void,
): CompareSide {
  return {
    label,
    player: candidate.offer.player,
    own: candidate.offer.own,
    terms: candidate.offer.own
      ? undefined
      : {
          fee: candidate.offer.fee,
          loanFee: candidate.offer.loanFee,
          freeAgent: candidate.offer.freeAgent,
          cashAfter: candidate.buy.cashAfter,
          annualAfter: candidate.buy.annualAfter,
        },
    action: onOpen && (
      <button onClick={onOpen}>{richMessage('copy.RecruitmentDesk.b786dd4b77')}</button>
    ),
  };
}
const lineNames: Record<Line, string> = {
  GK: sourceMessage('position.family.GK'),
  DF: sourceMessage('copy.RecruitmentDesk.48e2d845b6'),
  MF: sourceMessage('copy.RecruitmentDesk.7d50bd87b5'),
  FW: sourceMessage('copy.RecruitmentDesk.736f1ff574'),
};
/** An OVR range end as typed: blank clears it, anything else is held to 0–100. */
const ovrBound = (value: string) =>
  value.trim() === '' ? undefined : Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
const BID_STATUS: Record<TransferBid['status'], string> = {
  pending: sourceMessage('copy.RecruitmentDesk.2ce739d0d5'),
  accepted: sourceMessage('copy.RecruitmentDesk.831defcf7a'),
  rejected: sourceMessage('copy.RecruitmentDesk.f2501555ed'),
  countered: sourceMessage('copy.RecruitmentDesk.e0dd146d38'),
  expired: sourceMessage('copy.RecruitmentDesk.0001ef80c8'),
  completed: sourceMessage('copy.RecruitmentDesk.4e5ea77f47'),
};
const delta = (value: number) => (value > 0 ? `+${value}` : value < 0 ? String(value) : '±0');
// Colour only marks direction: a rise in red, a fall in blue.
const tone = (value: number) => (value > 0 ? 'rise' : value < 0 ? 'fall' : undefined);

/** The scout's verdict (→CLUB-47): grade, the slot it reads and the facts the gap does not say. */
function VerdictCard({ verdict }: { verdict: ScoutVerdict }) {
  useTextLocale();
  return (
    <section
      className={s.verdict}
      data-surface="detail"
      data-grade={verdict.grade}
      data-testid="scout-verdict"
      aria-label={displayMessage('copy.RecruitmentDesk.d567fb3ec5')}
    >
      <b className={s.grade}>{localizeValue(verdict.grade)}</b>
      <div className={s.verdictText}>
        <small>{richMessage('copy.RecruitmentDesk.d567fb3ec5')}</small>
        <strong>{localizeValue(verdict.label)}</strong>
        <span>
          {richMessage('copy.RecruitmentDesk.b91f168751', {
            p0: verdict.slot.position,
            p1: verdict.slot.value,
            p2: verdict.starter.name,
            p3: ' ',
            p4: verdict.starter.value,
            p5: <em data-tone={tone(verdict.gap)}>({localizeValue(delta(verdict.gap))})</em>,
          })}
        </span>
      </div>
      {localizeValue(
        verdict.pros.length > 0 && (
          <ul
            className={s.reasons}
            data-reason="for"
            aria-label={displayMessage('copy.RecruitmentDesk.359027c169')}
          >
            {localizeValue(
              verdict.pros.map((reason) => <li key={reason}>{localizeValue(reason)}</li>),
            )}
          </ul>
        ),
      )}
      {localizeValue(
        verdict.cons.length > 0 && (
          <ul
            className={s.reasons}
            data-reason="against"
            aria-label={displayMessage('copy.RecruitmentDesk.a204c3bdd3')}
          >
            {localizeValue(
              verdict.cons.map((reason) => <li key={reason}>{localizeValue(reason)}</li>),
            )}
          </ul>
        ),
      )}
    </section>
  );
}

/** A detail section whose heading carries its answer, so a closed section still reads (→WEB-109). */
function Section({
  title,
  answer,
  open,
  children,
}: {
  title: string;
  answer: ReactNode;
  open?: boolean;
  children: ReactNode;
}) {
  useTextLocale();
  return (
    <details className={s.section} open={open}>
      <summary>
        <span>{localizeValue(title)}</span>
        <b>{localizeValue(answer)}</b>
      </summary>
      {localizeValue(children)}
    </details>
  );
}

/**
 * A candidate read as a scout report (→WEB-109): head, verdict, then 우리 팀에서 · 비용 · 능력·성향,
 * each fact once, with the transaction bar at the foot. The bid sheet repeats only the head and
 * verdict.
 */
function CandidateCard({
  w,
  candidate,
  blocked,
  selected,
  onCompare,
  onCompareOwn,
  onRecruit,
  onBid,
  pending,
  bid = false,
}: {
  w: World;
  candidate: Candidate;
  blocked: boolean;
  selected: boolean;
  onCompare: () => void;
  /** Opens this candidate beside a player of ours. */
  onCompareOwn?: () => void;
  onRecruit: (loan: boolean) => void;
  onBid: () => void;
  pending?: TransferBid;
  bid?: boolean;
}) {
  useTextLocale();
  const { offer, buy, loan, verdict } = candidate,
    player = offer.player,
    club = clubOf(w);
  const cash = (value: string) => <Money value={value} code={club.country} year={w.year} />;
  const short = (value: string) => compactMoney(value, club.country, w.year);
  const window = transferWindow(w);
  const growth = Math.max(0, Math.round(player.potential) - overall(player));
  const best = bestRoles(player, 1)[0];
  const origin = offer.own
    ? sourceMessage('copy.RecruitmentDesk.ea4236ffcd')
    : offer.recommended
      ? sourceMessage('copy.RecruitmentDesk.741ff4233f')
      : sourceMessage('copy.RecruitmentDesk.32024b055b');
  const free = BigInt(offer.fee) === 0n;
  // Signed and with us: his first-team training as the assistant sets it (→CLUB-13).
  const joined = bid
    ? undefined
    : w.players.find((person) => person.id === player.id && person.status === 'active');
  const joinedCall = joined && playerCallLine(w, joined);
  return (
    <article
      className={s.card}
      data-testid={`candidate-${player.id}`}
      data-candidate-id={player.id}
      data-line={lineOf(player.position)}
    >
      <header className={s.cardHead}>
        {/* OVR keeps its rarity colour; the position wears its family's, as in the list. */}
        <OvrBadge value={overall(player)} large />
        <div>
          <h3>{player.name}</h3>
          <span className={s.cardMeta}>
            <PositionBadge position={player.position} />
            <span>
              {richMessage('copy.RecruitmentDesk.dd2fe56eba', {
                p0: POSITION_LABEL[player.position],
                p1: w.year - player.born,
                p2: ' ',
                p3: Math.round(player.potential),
                p4: growth > 0 && <em data-tone="rise"> +{localizeValue(growth)}</em>,
              })}
            </span>
          </span>
          <small className={s.positions} data-testid="candidate-positions">
            {localizeValue(positionsLabel(player.positions))}
          </small>
          <small className={s.origin} data-testid="candidate-source">
            <CandidateSource w={w} origin={candidateOrigin(offer)} division fee={!offer.own} /> ·{' '}
            {localizeValue(origin)}
          </small>
        </div>
      </header>
      {localizeValue(
        !bid && (
          <div className={s.compareActions}>
            <button aria-pressed={selected} onClick={onCompare}>
              {richMessage('copy.RecruitmentDesk.22c135bc3d', {
                p0: <PixelIcon name={selected ? 'check' : 'switch'} size={16} />,
              })}
            </button>
            {localizeValue(
              onCompareOwn && !offer.own && (
                <button onClick={onCompareOwn}>
                  {richMessage('copy.RecruitmentDesk.21e5af41ca', {
                    p0: <PixelIcon name="people" size={16} />,
                  })}
                </button>
              ),
            )}
          </div>
        ),
      )}
      {localizeValue(verdict && <VerdictCard verdict={verdict} />)}
      {localizeValue(
        !bid && offer.available && (
          <Section
            title={displayMessage('copy.RecruitmentDesk.fa575a045b')}
            answer={
              <>
                {richMessage('copy.RecruitmentDesk.754d3d37ee', {
                  p0: buy.slot.position,
                  p1: ' ',
                  p2: (
                    <em data-tone={tone(buy.strengthDelta)}>
                      {localizeValue(delta(buy.strengthDelta))}
                    </em>
                  ),
                })}
              </>
            }
            open
          >
            <dl className={s.facts} aria-label={displayMessage('copy.RecruitmentDesk.31c031a646')}>
              <div data-testid="candidate-slot" className={s.wide}>
                <dt>
                  {richMessage('copy.RecruitmentDesk.728817823b', {
                    p0: buy.slot.position,
                    p1: ROLE_LABEL[buy.slot.role],
                  })}
                </dt>
                <dd>
                  {richMessage('copy.RecruitmentDesk.bba3142a34', {
                    p0: buy.slot.arrival,
                    p1: buy.slot.settled,
                  })}
                </dd>
              </div>
              <div>
                <dt>{richMessage('copy.RecruitmentDesk.57a08ec84d')}</dt>
                <dd>
                  {localizeValue(buy.beforeStrength)} → {localizeValue(buy.afterStrength)}
                  {localizeValue(' ')}
                  <small data-tone={tone(buy.strengthDelta)}>
                    ({localizeValue(delta(buy.strengthDelta))})
                  </small>
                </dd>
              </div>
              <div>
                <dt>{richMessage('copy.RecruitmentDesk.df39d1a8b3')}</dt>
                <dd>
                  {localizeValue(buy.beforeFit)} → {localizeValue(buy.afterFit)}
                  {localizeValue(' ')}
                  <small data-tone={tone(buy.fitDelta)}>
                    ({localizeValue(delta(buy.fitDelta))})
                  </small>
                </dd>
              </div>
            </dl>
            <p className={s.note}>
              {richMessage('copy.RecruitmentDesk.cf149d7b13', {
                p0: offer.foreign
                  ? sourceMessage('copy.RecruitmentDesk.bfba4a684e')
                  : sourceMessage('copy.RecruitmentDesk.de8142588f'),
                p1: ' ',
                p2: buy.willStart
                  ? sourceMessage('copy.RecruitmentDesk.fa88c3b24a')
                  : sourceMessage('copy.RecruitmentDesk.8248a57393'),
              })}
            </p>
          </Section>
        ),
      )}
      {localizeValue(
        !bid && !offer.own && (
          <Section
            title={displayMessage('copy.RecruitmentDesk.24423dd67b')}
            answer={sourceMessage('copy.RecruitmentDesk.cc02bdebd0', {
              p0: free
                ? sourceMessage('copy.RecruitmentDesk.6a7f3133c2')
                : sourceMessage('copy.RecruitmentDesk.73bc6c6e24', { p0: short(offer.fee) }),
              p1: short(player.wage),
            })}
            open
          >
            <dl className={s.facts}>
              <div>
                <dt>{richMessage('copy.EventCenter.e2d73c6cf3')}</dt>
                <dd>{localizeValue(cash(offer.fee))}</dd>
              </div>
              <div>
                <dt>{richMessage('copy.PlayerCompare.e0e9003294')}</dt>
                <dd>{localizeValue(cash(offer.loanFee))}</dd>
              </div>
              <div>
                <dt>{richMessage('team.column.wage')}</dt>
                <dd>{localizeValue(cash(player.wage))}</dd>
              </div>
              <div>
                <dt>{richMessage('copy.RecruitmentDesk.c549ab659c')}</dt>
                <dd>
                  {richMessage('copy.RecruitmentDesk.e1a38071ed', {
                    p0: player.until,
                    p1: w.year + 1,
                  })}
                </dd>
              </div>
              {localizeValue(
                offer.available && (
                  <>
                    <div>
                      <dt>{richMessage('copy.PlayerCompare.8933209ede')}</dt>
                      <dd>
                        {localizeValue(cash(buy.cashAfter))}
                        {localizeValue(' ')}
                        <small className={s.sub}>
                          {richMessage('copy.RecruitmentDesk.5e0a2459f7', {
                            p0: runwayText(buy.runwayRounds),
                          })}
                        </small>
                      </dd>
                    </div>
                    <div>
                      <dt>{richMessage('copy.RecruitmentDesk.dfe24d38ff')}</dt>
                      <dd>
                        {localizeValue(cash(loan.cashAfter))}
                        {localizeValue(' ')}
                        <small className={s.sub}>
                          {richMessage('copy.RecruitmentDesk.5e0a2459f7', {
                            p0: runwayText(loan.runwayRounds),
                          })}
                        </small>
                      </dd>
                    </div>
                  </>
                ),
              )}
            </dl>
            {localizeValue(
              (offer.available || free) && (
                <p className={s.note}>
                  {localizeValue(free && sourceMessage('copy.RecruitmentDesk.e2ce5be708'))}
                  {localizeValue(
                    offer.available && (
                      <>
                        {richMessage('copy.RecruitmentDesk.1dfae53abc', {
                          p0: cash(buy.annualAfter),
                        })}
                      </>
                    ),
                  )}
                </p>
              ),
            )}
          </Section>
        ),
      )}
      {localizeValue(
        !bid && (
          <Section
            title={displayMessage('copy.RecruitmentDesk.456a19ba24')}
            answer={`${best ? `${ROLE_LABEL[best.role]} ${best.ovr} · ` : ''}${
              player.traits.length
                ? player.traits.map((trait) => TRAIT_LABEL[trait]).join('·')
                : sourceMessage('copy.ClubStaff.7cff642737')
            }`}
          >
            <PlayerProfile w={w} player={player} own={offer.own} compact />
          </Section>
        ),
      )}
      {localizeValue(
        !bid &&
          (pending ? (
            <p className={s.pending} data-surface="detail" data-testid="pending-bid">
              {localizeValue(
                pending.status === 'countered' ? (
                  <>
                    {richMessage('copy.RecruitmentDesk.df14100077', {
                      p0: cash(pending.counterFee || pending.fee),
                    })}
                  </>
                ) : (
                  <>
                    {richMessage('copy.RecruitmentDesk.e0d3c704cd', {
                      p0: cash(pending.fee),
                      p1: ' ',
                      p2: Math.max(0, pending.due - (w.calendar?.day ?? 0)),
                    })}
                  </>
                ),
              )}
            </p>
          ) : (
            <div className={s.transactions}>
              <div>
                {localizeValue(
                  offer.freeAgent ? (
                    <button
                      data-ui="primary"
                      className={s.primary}
                      disabled={blocked || !buy.eligible || !buy.affordable}
                      onClick={() => onRecruit(false)}
                    >
                      {localizeValue(
                        offer.available
                          ? sourceMessage('copy.MediationReview.2c47bc166e')
                          : sourceMessage('copy.RecruitmentDesk.7d02fe352e'),
                      )}
                    </button>
                  ) : (
                    <button
                      data-ui="primary"
                      className={s.primary}
                      disabled={blocked || !offer.available || !window.open || !buy.eligible}
                      onClick={onBid}
                    >
                      {localizeValue(
                        offer.available
                          ? sourceMessage('copy.RecruitmentDesk.3a697d0f9c')
                          : sourceMessage('copy.RecruitmentDesk.7d02fe352e'),
                      )}
                    </button>
                  ),
                )}
                {localizeValue(
                  offer.available && !offer.freeAgent && !window.open ? (
                    <small data-tone="block">{localizeValue(window.label)}</small>
                  ) : (
                    (!buy.eligible || !buy.affordable) && (
                      <small data-tone="block">{localizeValue(buy.reason)}</small>
                    )
                  ),
                )}
              </div>
              <div>
                <button
                  data-ui="secondary"
                  disabled={
                    offer.freeAgent || blocked || !window.open || !loan.eligible || !loan.affordable
                  }
                  onClick={() => onRecruit(true)}
                >
                  {richMessage('copy.RecruitmentDesk.3927e24ca2')}
                </button>
                {localizeValue(
                  offer.freeAgent ? (
                    <small>{richMessage('copy.RecruitmentDesk.cd560b565b')}</small>
                  ) : !loan.eligible || !loan.affordable ? (
                    <small data-tone="block">{localizeValue(loan.reason)}</small>
                  ) : (
                    offer.available && (
                      <small>{richMessage('copy.RecruitmentDesk.42b7db7fec')}</small>
                    )
                  ),
                )}
              </div>
            </div>
          )),
      )}
      {localizeValue(
        joined && joinedCall && (
          <div className={s.joined} aria-label={displayMessage('copy.RecruitmentDesk.de2966c4d5')}>
            <PlayerLink id={joined.id} name={joined.name} />
            <small data-testid="joined-training">
              {richMessage('copy.AcademyPanel.110b08796f', {
                p0: joinedCall.focus,
                p1: joinedCall.by,
              })}
            </small>
          </div>
        ),
      )}
    </article>
  );
}

/** The oldest age the market's 유소년 view shows: the academy's U-21 (→CLUB-31). */
const YOUTH_MARKET_AGE = 20;
export function RecruitmentDesk({
  state,
  client,
  youth = false,
}: {
  state: ClientState;
  client: GameClient;
  /** The 유소년 view: the same market held to academy ages, with filters of its own. */
  youth?: boolean;
}) {
  useTextLocale();
  const w = state.view!.world,
    club = clubOf(w);
  const [query, setQuery] = useTaskState<MarketQuery>(
    w.id,
    youth ? 'youth-market-query' : 'world-market-query',
    DEFAULT_MARKET_QUERY,
  );
  const changeQuery = (patch: Partial<MarketQuery>) =>
    setQuery((current) => changeMarketQuery(current, patch));
  const [comparison, setComparison] = useTaskState<WorldMarketTarget[]>(
    w.id,
    'world-market-comparison',
    [],
  );
  const [comparing, setComparing] = useTaskState(w.id, 'market-comparing', false);
  // A candidate beside a player of ours; `player` is the owner's pick, else the best fit.
  const [ownCompare, setOwnCompare] = useTaskState<
    { target: WorldMarketTarget; player?: string } | undefined
  >(w.id, 'market-own-compare', undefined);
  const [message, setMessage] = useState<{ world: string; text: string }>();
  const [bidding, setBidding] = useTaskState<
    { target: WorldMarketTarget; asking: string } | undefined
  >(w.id, 'world-market-bidding', undefined);
  const activeBid = useRef(bidding);
  activeBid.current = bidding;
  useEffect(() => {
    activeBid.current = bidding;
    return () => {
      activeBid.current = undefined;
    };
  }, [bidding]);
  const [viewing, setViewing] = useTaskState<WorldMarketTarget | undefined>(
    w.id,
    'world-market-viewing',
    undefined,
  );
  const [panel, setPanel] = useTaskState<'filters' | 'info' | 'negotiations' | undefined>(
    w.id,
    'market-panel',
    undefined,
  );
  const [step, setStep] = useTaskState(w.id, 'market-step', 1);
  const [expanded, setExpanded] = useTaskState(w.id, 'market-expanded', false);
  const registered = squadRegistration(w);
  const blocked = useGameState(gameActionsBlocked) || !!w.critical;
  const recommended = recruitmentLineNeed(w);
  // Always by OVR (youth by potential), highest first; a saved order or the fit filter drops.
  const market = useMarketPage(client, w.id, w.revision, {
    ...query,
    sort: youth ? 'potential' : 'ovr',
    direction: 'desc',
    fit: undefined,
    ageMax: youth ? YOUTH_MARKET_AGE : undefined,
  });
  const page = market.value;
  const selectedComparison = comparison.filter((target) => target.world === w.id).slice(0, 2);
  const detail = useMarketDetail(client, w.id, w.revision, viewing);
  const comparisonA = useMarketDetail(
    client,
    w.id,
    w.revision,
    comparing ? selectedComparison[0] : undefined,
  );
  const comparisonB = useMarketDetail(
    client,
    w.id,
    w.revision,
    comparing ? selectedComparison[1] : undefined,
  );
  const ownCandidate = useMarketDetail(
    client,
    w.id,
    w.revision,
    ownCompare?.target.world === w.id ? ownCompare.target : undefined,
  );
  const asking = BigInt(bidding?.asking ?? '0');
  const steps = [80n, 100n, 115n, 130n];
  const fee = ((asking * steps[step]) / 100n).toString();
  const bidDetail = useMarketDetail(client, w.id, w.revision, bidding?.target, fee);
  const outlook = bidDetail.value?.bid;
  const leagues = marketLeagues(w.clubs);
  const leagueKey = query.league ? marketLeagueKey(query.league) : '';
  const teams = w.clubs.filter((team) => !leagueKey || marketLeagueKey(team) === leagueKey);
  const filtered = !!(
    query.name ||
    query.recommendedOnly ||
    query.league ||
    query.team ||
    query.position ||
    query.line ||
    query.ovrMin !== undefined ||
    query.ovrMax !== undefined
  );
  const toggle = (target: WorldMarketTarget) =>
    setComparison((current) => toggleMarketComparison(current, target));
  const currentWorld = () => client.state.view?.world.id === w.id;
  const currentActionsBlocked = () =>
    blocked || gameActionsBlocked(client.state) || !!client.state.view?.world.critical;
  const recruit = async (candidate: Candidate, loan: boolean) => {
    const preview = loan ? candidate.loan : candidate.buy;
    if (
      currentActionsBlocked() ||
      candidate.world !== w.id ||
      candidate.offer.own ||
      (loan && candidate.offer.freeAgent) ||
      !preview.eligible ||
      !preview.affordable ||
      !currentWorld() ||
      candidate.revision !== client.state.view?.world.revision
    )
      return;
    const reply = await client.command(
      candidate.offer.freeAgent
        ? { type: 'recruit', target: candidate.offer.target, loan: false }
        : {
            type: 'bid',
            target: candidate.offer.target,
            fee: loan ? candidate.offer.loanFee : candidate.offer.fee,
            loan,
          },
      { background: true },
    );
    if (!currentWorld()) return;
    if (reply?.ok && candidate.offer.freeAgent) {
      // He has left the pool for our squad: open cards read him with us, signed (→CLUB-49).
      const signed = candidate.offer.target;
      setViewing((current) => signedFreeAgentTarget(current, signed, w.playerClub));
      setComparison((current) =>
        current.map((target) => signedFreeAgentTarget(target, signed, w.playerClub)),
      );
    }
    setMessage({
      world: w.id,
      text: reply?.ok
        ? candidate.offer.freeAgent
          ? sourceMessage('copy.RecruitmentDesk.8464bd95f6', { p0: candidate.offer.player.name })
          : sourceMessage('copy.RecruitmentDesk.bd7db3e5dd', { p0: candidate.offer.player.name })
        : client.state.error || sourceMessage('copy.RecruitmentDesk.1018b7ec8c'),
    });
  };
  const bids = w.bids || [];
  const pendingFor = (id: string) =>
    bids.find(
      (bid) =>
        bid.direction === 'out' &&
        bid.playerId === id &&
        (bid.status === 'pending' || bid.status === 'countered'),
    );
  const window = transferWindow(w);
  const format = (value: string) => <Money value={value} code={club.country} year={w.year} />,
    // Inside a control that already answers the tap: the notation, the exact amount as its title.
    plain = (value: string) => <Money value={value} code={club.country} year={w.year} plain />,
    text = (value: string) => compactMoney(value, club.country, w.year);
  const render = (candidate: Candidate, current: boolean, bid = false) => (
    <CandidateCard
      key={candidate.offer.player.id}
      w={w}
      candidate={candidate}
      bid={bid}
      blocked={blocked || !current || candidate.revision !== w.revision || candidate.offer.own}
      selected={selectedComparison.some((target) => target.playerId === candidate.offer.player.id)}
      onCompare={() => toggle(candidate.offer.target)}
      onCompareOwn={() => setOwnCompare({ target: candidate.offer.target })}
      onRecruit={(loan) => {
        if (current) void recruit(candidate, loan);
      }}
      onBid={() => {
        setComparing(false);
        setViewing(undefined);
        setMessage(undefined);
        setStep(1);
        setBidding({ target: candidate.offer.target, asking: candidate.offer.fee });
      }}
      pending={pendingFor(candidate.offer.player.id)}
    />
  );
  /** Our active players for a candidate: his slot's position first, then by OVR. */
  const ownOptions = (candidate: Candidate) => {
    const position = candidate.buy.slot.position;
    return activePlayers(w)
      .filter((p) => p.id !== candidate.offer.player.id)
      .sort(
        (a, b) =>
          Number(b.position === position) - Number(a.position === position) ||
          Number(lineOf(b.position) === lineOf(position)) -
            Number(lineOf(a.position) === lineOf(position)) ||
          overall(b) - overall(a),
      );
  };
  const board = bidBoard(w),
    shownBids = visibleBids(board, expanded);
  const outgoing = bids.filter(
    (bid) => bid.direction === 'out' && (bid.status === 'pending' || bid.status === 'countered'),
  );
  return (
    <section
      className={s.desk}
      data-ui="recruitment-desk"
      data-surface="sheet"
      aria-label={localizeValue(
        youth
          ? sourceMessage('copy.RecruitmentDesk.014f26cc56')
          : sourceMessage('copy.RecruitmentDesk.e204ec970b'),
      )}
    >
      <header className={s.toolbar}>
        <div className={s.heading}>
          <span className={s.deskMark} aria-hidden="true">
            <PixelIcon name="people" size={26} />
          </span>
          <h3>
            {localizeValue(
              youth
                ? sourceMessage('copy.RecruitmentDesk.16ed116c39', { p0: YOUTH_MARKET_AGE })
                : sourceMessage('copy.ClubSettingControl.2051d3609a'),
            )}
            {localizeValue(' ')}
            <span>
              {localizeValue(
                page
                  ? sourceMessage('copy.RecruitmentDesk.719894d3b5', { p0: page.total })
                  : sourceMessage('copy.RecruitmentDesk.32e78197fb'),
              )}
            </span>
          </h3>
        </div>
        <div
          className={`${s.window} ${window.open ? s.windowOpen : ''}`}
          data-testid="transfer-window"
        >
          <span aria-hidden="true" className={s.windowDot} />
          <span>{localizeValue(window.label)}</span>
        </div>
        <div className={s.tools}>
          {localizeValue(
            selectedComparison.length > 0 && (
              <button
                data-ui="secondary"
                type="button"
                aria-label={displayMessage('copy.RecruitmentDesk.7a9058897a', {
                  p0: selectedComparison.length,
                })}
                disabled={selectedComparison.length !== 2}
                onClick={() => setComparing(true)}
              >
                {richMessage('copy.RecruitmentDesk.faace7439f', { p0: selectedComparison.length })}
              </button>
            ),
          )}
          <button
            data-ui="secondary"
            type="button"
            aria-label={displayMessage('copy.RecruitmentDesk.d5ee7340ff')}
            aria-haspopup="dialog"
            aria-expanded={panel === 'filters'}
            onClick={() => setPanel('filters')}
          >
            {richMessage('copy.RecruitmentDesk.001ec16a5c', {
              p0: <PixelIcon name="filter" size={16} />,
              p1: filtered && (
                <i
                  className={s.activeDot}
                  aria-label={displayMessage('copy.RecruitmentDesk.0619d3235c')}
                />
              ),
            })}
          </button>
          <button
            data-ui="tertiary"
            type="button"
            aria-label={displayMessage('copy.RecruitmentDesk.0ac014a930', {
              p0: outgoing.length,
              p1: board.some(({ actionable }) => actionable)
                ? sourceMessage('copy.RecruitmentDesk.a912604402')
                : '',
            })}
            aria-haspopup="dialog"
            aria-expanded={panel === 'negotiations'}
            onClick={() => setPanel('negotiations')}
          >
            {richMessage('copy.RecruitmentDesk.b716043537', {
              p0: <PixelIcon name="switch" size={16} />,
              p1: bids.length > 0 && (
                <span className={s.count}>
                  {localizeValue(
                    board.filter(({ actionable }) => actionable).length || outgoing.length,
                  )}
                </span>
              ),
            })}
          </button>
          <button
            data-ui="tertiary"
            type="button"
            className={s.infoTrigger}
            aria-label={displayMessage('copy.RecruitmentDesk.a93c2ff6d9')}
            aria-haspopup="dialog"
            aria-expanded={panel === 'info'}
            onClick={() => setPanel('info')}
          >
            {richMessage('copy.RecruitmentDesk.ae684d1827', {
              p0: <PixelIcon name="news" size={18} />,
            })}
          </button>
        </div>
      </header>
      {localizeValue(
        message?.world === w.id && (
          <p data-surface="inset" className={s.message} role="status">
            {localizeValue(message.text)}
          </p>
        ),
      )}
      <label className={s.search}>
        <span>{richMessage('copy.RecruitmentDesk.a491b824b3')}</span>
        <input
          type="search"
          value={query.name ?? ''}
          maxLength={160}
          onChange={(event) => changeQuery({ name: event.target.value })}
        />
      </label>
      {localizeValue(
        market.error && (
          <p data-surface="inset" role="alert" className={s.warning}>
            {localizeValue(market.error)}
            {localizeValue(' ')}
            <button data-ui="tertiary" onClick={market.retry}>
              {richMessage('copy.RecruitmentDesk.98b83912a3')}
            </button>
          </p>
        ),
      )}
      {localizeValue(
        !page && !market.error && (
          <p role="status">{richMessage('copy.RecruitmentDesk.aaf4c19e26')}</p>
        ),
      )}
      <table
        className={s.candidateTable}
        aria-label={displayMessage('copy.RecruitmentDesk.34d2b2b239')}
      >
        <colgroup>
          <col />
          <col className={s.ratingColumn} />
          <col className={s.potentialColumn} />
          <col className={s.feeColumn} />
          <col className={s.wageColumn} />
          <col className={s.compareColumn} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">{richMessage('team.column.player')}</th>
            <th scope="col" className={s.ratingColumn}>
              {richMessage('team.column.ovr')}
            </th>
            <th scope="col" className={s.potentialColumn}>
              {richMessage('team.column.potential')}
            </th>
            <th scope="col" className={s.feeColumn}>
              {richMessage('copy.EventCenter.e2d73c6cf3')}
            </th>
            <th scope="col" className={s.wageColumn}>
              {richMessage('team.column.wage')}
            </th>
            <th scope="col" className={s.compareColumn}>
              {richMessage('copy.RecruitmentDesk.c0154c812a')}
            </th>
          </tr>
        </thead>
        <tbody>
          {localizeValue(
            page?.items.map((offer) => {
              const player = offer.player;
              const pending = pendingFor(player.id);
              return (
                <tr
                  key={player.id}
                  data-testid={`market-candidate-${player.id}`}
                  data-candidate-id={player.id}
                  data-line={lineOf(player.position)}
                  data-selected={
                    selectedComparison.some((target) => target.playerId === player.id) || undefined
                  }
                  onClick={(event) => {
                    if ((event.target as Element).closest('button, input, a')) return;
                    setViewing(offer.target);
                  }}
                >
                  <td>
                    <button
                      data-ui="link"
                      type="button"
                      className={s.playerName}
                      aria-label={displayMessage('copy.RecruitmentDesk.96683230cc', {
                        p0: player.name,
                      })}
                      onClick={() => setViewing(offer.target)}
                    >
                      <span className={s.playerIdentity}>
                        <PositionBadge position={player.position} />
                        <span className={s.playerText}>
                          <b>{player.name}</b>
                          <small>
                            {richMessage('copy.RecruitmentDesk.f802b6ce0c', {
                              p0: w.year - player.born,
                              p1: offer.own
                                ? sourceMessage('copy.PlayerComparison.4c74be1201')
                                : !offer.available
                                  ? sourceMessage('copy.RecruitmentDesk.36443794ec')
                                  : pending
                                    ? sourceMessage('copy.RecruitmentDesk.da919cc8fa')
                                    : '',
                              p2: offer.recommended
                                ? sourceMessage('copy.RecruitmentDesk.73d246427f')
                                : '',
                            })}
                          </small>
                        </span>
                      </span>
                    </button>
                    {/* Where he is (→CLUB-50), outside the button so his club is a link. */}
                    <small className={s.rowSource} data-testid="market-source">
                      <CandidateSource w={w} origin={candidateOrigin(offer)} division fee={false} />
                    </small>
                  </td>
                  <td>
                    <OvrBadge value={overall(player)} />
                  </td>
                  <td>
                    <span className={s.potentialValue}>
                      <b>{localizeValue(Math.round(player.potential))}</b>
                      <span className={s.potentialTrack} aria-hidden="true">
                        <i style={{ width: `${Math.max(0, Math.min(100, player.potential))}%` }} />
                      </span>
                    </span>
                  </td>
                  <td className={s.feeValue}>
                    {localizeValue(
                      offer.freeAgent ? (
                        <span className={s.freeTag}>
                          {richMessage('copy.RecruitmentDesk.12672e0ef0', {
                            p0: <PixelIcon name="check" size={12} />,
                          })}
                        </span>
                      ) : (
                        <span className={s.moneyValue}>{localizeValue(plain(offer.fee))}</span>
                      ),
                    )}
                  </td>
                  <td className={s.wageColumn}>
                    <span className={s.wageValue}>{localizeValue(plain(player.wage))}</span>
                  </td>
                  <td>
                    <button
                      data-ui="link"
                      type="button"
                      className={s.compareToggle}
                      aria-label={displayMessage('copy.RecruitmentDesk.242a41561d', {
                        p0: player.name,
                      })}
                      aria-pressed={selectedComparison.some(
                        (target) => target.playerId === player.id,
                      )}
                      onClick={() => toggle(offer.target)}
                    >
                      <span className={s.compareMark} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            }),
          )}
          {localizeValue(
            page?.total === 0 && (
              <tr>
                <td colSpan={6} className={s.empty}>
                  {localizeValue(
                    filtered
                      ? sourceMessage('copy.RecruitmentDesk.66cea87275')
                      : sourceMessage('copy.RecruitmentDesk.dc972cb7d7'),
                  )}
                  <button data-ui="tertiary" onClick={() => setQuery(DEFAULT_MARKET_QUERY)}>
                    {richMessage('copy.RecruitmentDesk.ac59eacff1')}
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      {localizeValue(
        page && (
          <nav
            className={s.pagination}
            aria-label={displayMessage('copy.RecruitmentDesk.c10f520b72')}
          >
            <button
              data-ui="tertiary"
              disabled={page.page === 0}
              onClick={() => changeQuery({ page: page.page - 1 })}
            >
              {richMessage('copy.RecruitmentDesk.aebeacd0de', {
                p0: <PixelIcon name="chevronLeft" size={14} />,
              })}
            </button>
            <span role="status">
              {richMessage('copy.RecruitmentDesk.7917b17646', {
                p0: page.total,
                p1: page.page + 1,
                p2: ' ',
                p3: Math.max(1, Math.ceil(page.total / page.pageSize)),
                p4: page.items.length,
              })}
            </span>
            <button
              data-ui="tertiary"
              disabled={(page.page + 1) * page.pageSize >= page.total}
              onClick={() => changeQuery({ page: page.page + 1 })}
            >
              {richMessage('copy.RecruitmentDesk.8ba4759b10', {
                p0: <PixelIcon name="chevronRight" size={14} />,
              })}
            </button>
          </nav>
        ),
      )}
      {localizeValue(
        panel === 'filters' && (
          <Dialog
            label={displayMessage('copy.RecruitmentDesk.d5ee7340ff')}
            onClose={() => setPanel(undefined)}
            actions={
              <div className={s.bidActions}>
                <button
                  data-ui="tertiary"
                  type="button"
                  onClick={() => {
                    setQuery(DEFAULT_MARKET_QUERY);
                  }}
                >
                  {richMessage('copy.LabPage.893f3d9463')}
                </button>
                <button
                  data-ui="primary"
                  type="button"
                  className={s.primary}
                  onClick={() => setPanel(undefined)}
                >
                  {localizeValue(
                    page
                      ? sourceMessage('copy.RecruitmentDesk.15028b84c8', { p0: page.total })
                      : sourceMessage('copy.ClubListing.f9a249aaf3'),
                  )}
                </button>
              </div>
            }
          >
            <p className={s.note}>
              {richMessage('copy.RecruitmentDesk.570875f0a1', {
                p0: query.recommendedOnly ? sourceMessage('copy.RecruitmentDesk.63fc71f9a3') : '',
              })}
            </p>
            <div className={s.filters}>
              {/* One position choice: a whole line or one position, the weak line marked. */}
              <label className={s.wideFilter}>
                {richMessage('copy.RecruitmentDesk.c0f856ef83', {
                  p0: (
                    <Select
                      aria-label={displayMessage('copy.RecruitmentDesk.527b85552f')}
                      value={query.position ?? (query.line ? `line:${query.line}` : 'all')}
                      onValueChange={(value) =>
                        changeQuery(
                          value.startsWith('line:')
                            ? { line: value.slice(5) as Line }
                            : { position: value === 'all' ? undefined : (value as Position) },
                        )
                      }
                    >
                      <option value="all">{richMessage('copy.RecruitmentDesk.9666d1996a')}</option>
                      {localizeValue(
                        LINES.map((line) => {
                          const mark =
                            line === recommended
                              ? sourceMessage('copy.RecruitmentDesk.b8ad204536')
                              : '';
                          const positions = POSITIONS.filter(
                            (position) => lineOf(position) === line,
                          );
                          return line === 'GK' ? (
                            <option key={line} value={`line:${line}`}>
                              {richMessage('copy.RecruitmentDesk.f69b3f9a53', {
                                p0: localizeValue(POSITION_LABEL.GK),
                                p1: localizeValue(mark),
                              })}
                            </option>
                          ) : (
                            <optgroup key={line} label={localizeValue(lineNames[line])}>
                              <option value={`line:${line}`}>
                                {richMessage('copy.RecruitmentDesk.a04bf47a89', {
                                  p0: lineNames[line],
                                  p1: mark,
                                })}
                              </option>
                              {localizeValue(
                                positions.map((position) => (
                                  <option key={position} value={position}>
                                    {localizeValue(position)} ·{' '}
                                    {localizeValue(POSITION_LABEL[position])}
                                  </option>
                                )),
                              )}
                            </optgroup>
                          );
                        }),
                      )}
                    </Select>
                  ),
                })}
              </label>
              <fieldset className={s.ovrRange}>
                <legend>{richMessage('copy.RecruitmentDesk.17fd08e4f4')}</legend>
                <label>
                  {richMessage('copy.RecruitmentDesk.81a5d56d6d', {
                    p0: (
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={99}
                        placeholder={displayMessage('copy.RecruitmentDesk.01eebd5349')}
                        aria-label={displayMessage('copy.RecruitmentDesk.c3db29d75b')}
                        value={query.ovrMin ?? ''}
                        onChange={(event) => changeQuery({ ovrMin: ovrBound(event.target.value) })}
                      />
                    ),
                  })}
                </label>
                <label>
                  {richMessage('copy.RecruitmentDesk.d0e833cdde', {
                    p0: (
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={99}
                        placeholder={displayMessage('copy.RecruitmentDesk.ee3b70e7b0')}
                        aria-label={displayMessage('copy.RecruitmentDesk.d5cdbaabed')}
                        value={query.ovrMax ?? ''}
                        onChange={(event) => changeQuery({ ovrMax: ovrBound(event.target.value) })}
                      />
                    ),
                  })}
                </label>
              </fieldset>
              <label>
                {richMessage('copy.RecruitmentDesk.5940572f7b', {
                  p0: (
                    <Select
                      aria-label={displayMessage('copy.RecruitmentDesk.f147a893b5')}
                      value={leagueKey || 'all'}
                      onValueChange={(value) =>
                        changeQuery({ league: leagues.find(([key]) => key === value)?.[1] })
                      }
                    >
                      <option value="all">{richMessage('copy.ClubListing.86f46d158a')}</option>
                      {localizeValue(
                        leagues.map(([key]) => {
                          const team = w.clubs.find((team) => marketLeagueKey(team) === key)!;
                          return (
                            <option key={key} value={key}>
                              {localizeValue(team.country)} · {localizeValue(clubDivision(w, team))}
                            </option>
                          );
                        }),
                      )}
                    </Select>
                  ),
                })}
              </label>
              <label>
                {richMessage('copy.RecruitmentDesk.0fb68fb1bc', {
                  p0: (
                    <Select
                      aria-label={displayMessage('copy.RecruitmentDesk.88c2223418')}
                      value={query.team ?? 'all'}
                      onValueChange={(value) =>
                        changeQuery({ team: value === 'all' ? undefined : value })
                      }
                    >
                      <option value="all">{richMessage('copy.RecruitmentDesk.bfd80f2a83')}</option>
                      {localizeValue(
                        teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        )),
                      )}
                    </Select>
                  ),
                })}
              </label>
              <button
                data-ui={query.recommendedOnly ? 'secondary' : 'tertiary'}
                className={s.wideFilter}
                aria-pressed={!!query.recommendedOnly}
                onClick={() => changeQuery({ recommendedOnly: !query.recommendedOnly })}
              >
                {richMessage('copy.RecruitmentDesk.3daa639da2')}
              </button>
            </div>
            <p className={s.note}>{richMessage('copy.RecruitmentDesk.32c81cccaa')}</p>
          </Dialog>
        ),
      )}
      {localizeValue(
        panel === 'negotiations' && (
          <Dialog
            label={displayMessage('copy.EventCenter.89993bb226')}
            onClose={() => setPanel(undefined)}
          >
            {localizeValue(
              board.length > 0 && (
                <section
                  data-surface="sheet"
                  className={s.negotiations}
                  aria-label={displayMessage('copy.RecruitmentDesk.02c80345a8')}
                >
                  <h3>{richMessage('copy.EventCenter.89993bb226')}</h3>
                  {localizeValue(
                    shownBids.map(({ bid, player, club: other, actionable, dueLabel }) => (
                      <div
                        data-surface="sheet"
                        key={bid.id}
                        className={s.negotiation}
                        data-status={bid.status}
                      >
                        <span>
                          <b>
                            {localizeValue(bidKind(bid))} ·{' '}
                            {localizeValue(player?.name || sourceMessage('team.column.player'))}
                            {/* A player who asked to leave (→CLUB-27) is the one the owner may want to sell. */}
                            {localizeValue(
                              bid.direction === 'in' && player?.transferRequest
                                ? sourceMessage('copy.RecruitmentDesk.accf71c0c9')
                                : '',
                            )}
                          </b>
                          <small>
                            {localizeValue(
                              bid.direction === 'in' && other ? `${other.name} · ` : '',
                            )}
                            {localizeValue(
                              freeSigning(bid) ? (
                                sourceMessage('copy.RecruitmentDesk.6bf42e22d3')
                              ) : bid.status === 'countered' ? (
                                <>
                                  {richMessage('copy.EventCenter.14e1931a6f', {
                                    p0: format(bid.counterFee || bid.fee),
                                  })}
                                </>
                              ) : (
                                format(bid.fee)
                              ),
                            )}
                            {localizeValue(' ')}· {localizeValue(BID_STATUS[bid.status])}
                            {localizeValue(
                              (bid.status === 'pending' || bid.status === 'countered') &&
                                sourceMessage('copy.RecruitmentDesk.4c0051f0ab', { p0: dueLabel }),
                            )}
                            {localizeValue(
                              bid.staff &&
                                bid.status === 'countered' &&
                                sourceMessage('copy.RecruitmentDesk.8f88e63ddf'),
                            )}
                            {localizeValue(
                              bid.direction === 'in' &&
                                w.staff?.some((member) => member.person === bid.playerId) && (
                                  <>
                                    {richMessage('copy.RecruitmentDesk.d9de0d7ef1', {
                                      p0: ' ',
                                      p1: ' ',
                                      p2: format(
                                        releaseCost(
                                          w,
                                          w.staff.find((member) => member.person === bid.playerId),
                                        ),
                                      ),
                                    })}
                                  </>
                                ),
                            )}
                          </small>
                        </span>
                        {localizeValue(
                          actionable && (
                            <span className={s.negotiationActions}>
                              <button
                                data-ui="primary"
                                className={s.primary}
                                disabled={blocked}
                                onClick={() =>
                                  void client.command({
                                    type: 'respond-bid',
                                    id: bid.id,
                                    accept: true,
                                  })
                                }
                              >
                                {localizeValue(
                                  bid.direction === 'in'
                                    ? sourceMessage('copy.RecruitmentDesk.45b54f8961')
                                    : sourceMessage('copy.RecruitmentDesk.831defcf7a'),
                                )}
                              </button>
                              <button
                                data-ui="tertiary"
                                disabled={blocked}
                                onClick={() =>
                                  void client.command({
                                    type: 'respond-bid',
                                    id: bid.id,
                                    accept: false,
                                  })
                                }
                              >
                                {richMessage('copy.EventCenter.cc6314d04d')}
                              </button>
                            </span>
                          ),
                        )}
                      </div>
                    )),
                  )}
                  {localizeValue(
                    shownBids.length < board.length && (
                      <button data-ui="tertiary" type="button" onClick={() => setExpanded(true)}>
                        {richMessage('copy.RecruitmentDesk.0fe43297f5', { p0: board.length })}
                      </button>
                    ),
                  )}
                </section>
              ),
            )}
            {localizeValue(
              board.length === 0 && (
                <p className={s.empty}>{richMessage('copy.RecruitmentDesk.49fe8df85c')}</p>
              ),
            )}
          </Dialog>
        ),
      )}
      {localizeValue(
        panel === 'info' && (
          <Dialog
            label={displayMessage('copy.RecruitmentDesk.5cde1820c8')}
            onClose={() => setPanel(undefined)}
          >
            <p className={s.note}>
              {localizeValue(
                window.open
                  ? sourceMessage('copy.RecruitmentDesk.ef9888c1aa')
                  : sourceMessage('copy.RecruitmentDesk.fcdba43502'),
              )}
            </p>
            <RecruitmentNeeds
              w={w}
              offers={state.view!.transfers}
              onRole={(line) => {
                changeQuery({ line });
                setPanel(undefined);
              }}
            />
            {/* The 영입 area of the club's direction as founded (→ECON-25); it only reads. */}
            <DirectionFacts w={w} rows={['scouting', 'recruitment', 'recruitmentSupport']} />
            <div data-surface="sheet" className={s.summary}>
              <span>
                {richMessage('copy.RecruitmentDesk.f59c136d52', {
                  p0: <b>{localizeValue(registered.value)}</b>,
                  p1: <small>{localizeValue(registered.detail)}</small>,
                })}
              </span>
              <span>
                {richMessage('copy.RecruitmentDesk.1d0aa93ee7', {
                  p0: (
                    <b>{richMessage('copy.ClubOperations.7e77eaa28b', { p0: outgoing.length })}</b>
                  ),
                })}
              </span>
            </div>
            {localizeValue(
              registered.full && (
                <p data-surface="inset" className={s.warning}>
                  {richMessage('copy.RecruitmentDesk.4c53cab1e4', { p0: registered.value })}
                </p>
              ),
            )}
            <RecruitmentCommitments w={w} client={client} />
            <ScoutShortlist
              w={w}
              offers={state.view!.transfers}
              disabled={false}
              onOpen={(index) => {
                const offer = state.view!.transfers[index];
                if (!offer) return;
                setPanel(undefined);
                setViewing(
                  offer.source.kind === 'club'
                    ? {
                        world: w.id,
                        kind: 'club',
                        clubId: offer.source.club,
                        playerId: offer.player.id,
                      }
                    : { world: w.id, kind: 'offer', playerId: offer.player.id },
                );
              }}
            />
            <OfferAnswers w={w} />
          </Dialog>
        ),
      )}
      {localizeValue(
        comparing && (
          <Dialog
            label={displayMessage('copy.RecruitmentDesk.8cb4f0b5a1')}
            onClose={() => setComparing(false)}
            wide
            actions={
              <div className={s.close}>
                <button onClick={() => setComparing(false)}>
                  {richMessage('copy.RecruitmentDesk.11df61c0b2')}
                </button>
              </div>
            }
          >
            {localizeValue(
              comparisonA.value && comparisonB.value ? (
                <PlayerCompare
                  w={w}
                  label={displayMessage('copy.RecruitmentDesk.585b075af5')}
                  sides={
                    [comparisonA.value, comparisonB.value].map((candidate, index) =>
                      candidateSide(
                        candidate,
                        sourceMessage('copy.RecruitmentDesk.9cd3b1aad6', { p0: index ? 'B' : 'A' }),
                        () => {
                          setComparing(false);
                          setViewing(candidate.offer.target);
                        },
                      ),
                    ) as [CompareSide, CompareSide]
                  }
                />
              ) : (
                [comparisonA, comparisonB].map((reading, index) =>
                  reading.value ? null : (
                    <div key={selectedComparison[index]?.playerId ?? index}>
                      <p role="status">
                        {localizeValue(
                          reading.error ?? sourceMessage('copy.RecruitmentDesk.c8de6825d0'),
                        )}
                      </p>
                      {localizeValue(
                        reading.error && (
                          <button data-ui="tertiary" onClick={reading.retry}>
                            {richMessage('copy.RecruitmentDesk.6cd5c3642f')}
                          </button>
                        ),
                      )}
                    </div>
                  ),
                )
              ),
            )}
          </Dialog>
        ),
      )}
      {localizeValue(
        ownCompare && (
          <Dialog
            label={displayMessage('copy.RecruitmentDesk.f86a889a44')}
            onClose={() => setOwnCompare(undefined)}
            wide
            actions={
              <div className={s.close}>
                <button onClick={() => setOwnCompare(undefined)}>
                  {richMessage('copy.PlayerComparison.ba98764c52')}
                </button>
              </div>
            }
          >
            {localizeValue(
              ownCandidate.value ? (
                (() => {
                  const candidate = ownCandidate.value;
                  const ours = ownOptions(candidate);
                  const mine = ours.find((p) => p.id === ownCompare.player) ?? ours[0];
                  return mine ? (
                    <>
                      <label className={s.ownPick}>
                        <span>{richMessage('copy.RecruitmentDesk.2bbfdaee48')}</span>
                        <Select
                          aria-label={displayMessage('copy.RecruitmentDesk.2bbfdaee48')}
                          value={mine.id}
                          onValueChange={(id) => setOwnCompare({ ...ownCompare, player: id })}
                        >
                          {localizeValue(
                            ours.map((p) => (
                              <option key={p.id} value={p.id}>
                                {richMessage('copy.RecruitmentDesk.36a4a9d024', {
                                  p0: localizeValue(p.position),
                                  p1: p.name,
                                  p2: localizeValue(overall(p)),
                                })}
                              </option>
                            )),
                          )}
                        </Select>
                      </label>
                      <PlayerCompare
                        w={w}
                        label={displayMessage('copy.RecruitmentDesk.3b1d8dd121')}
                        sides={[
                          candidateSide(
                            candidate,
                            sourceMessage('copy.ClubSettingControl.2051d3609a'),
                          ),
                          {
                            label: sourceMessage('copy.EventCenter.45d9ddc729'),
                            player: mine,
                            own: true,
                          },
                        ]}
                      />
                    </>
                  ) : (
                    <p role="status">{richMessage('copy.RecruitmentDesk.ca6bc7caf7')}</p>
                  );
                })()
              ) : (
                <>
                  <p role="status">
                    {localizeValue(
                      ownCandidate.error ?? sourceMessage('copy.RecruitmentDesk.965c4d30c9'),
                    )}
                  </p>
                  {localizeValue(
                    ownCandidate.error && (
                      <button data-ui="tertiary" onClick={ownCandidate.retry}>
                        {richMessage('copy.RecruitmentDesk.6cd5c3642f')}
                      </button>
                    ),
                  )}
                </>
              ),
            )}
          </Dialog>
        ),
      )}
      {localizeValue(
        bidding && (
          <Dialog
            label={displayMessage('copy.RecruitmentDesk.3a697d0f9c')}
            onClose={() => setBidding(undefined)}
            actions={
              <div className={s.bidActions}>
                <button data-ui="tertiary" onClick={() => setBidding(undefined)}>
                  {richMessage('common.cancel')}
                </button>
                <button
                  data-ui="primary"
                  className={s.primary}
                  disabled={
                    blocked ||
                    !bidDetail.current ||
                    !outlook ||
                    !bidDetail.value?.buy.eligible ||
                    bidDetail.value?.offer.own ||
                    bidDetail.value?.revision !== w.revision ||
                    !!pendingFor(bidding.target.playerId) ||
                    !window.open ||
                    BigInt(fee) > BigInt(w.cash) ||
                    BigInt(fee) < 1n
                  }
                  onClick={async () => {
                    if (
                      !bidDetail.value ||
                      !bidDetail.current ||
                      !outlook ||
                      !bidDetail.value.buy.eligible ||
                      bidDetail.value.offer.own ||
                      !currentWorld() ||
                      bidDetail.value.revision !== client.state.view?.world.revision ||
                      currentActionsBlocked() ||
                      BigInt(fee) > BigInt(w.cash) ||
                      BigInt(fee) < 1n ||
                      !window.open ||
                      pendingFor(bidding.target.playerId)
                    )
                      return;
                    const reply = await client.command(
                      { type: 'bid', target: bidding.target, fee },
                      { background: true },
                    );
                    if (!currentWorld() || activeBid.current !== bidding) return;
                    setMessage({
                      world: w.id,
                      text: reply?.ok
                        ? sourceMessage('copy.RecruitmentDesk.3ac2ba2778', {
                            p0: bidDetail.value.offer.player.name,
                            p1: text(fee),
                          })
                        : client.state.error || sourceMessage('copy.RecruitmentDesk.f7f37b0236'),
                    });
                    if (reply?.ok) setBidding(undefined);
                  }}
                >
                  {richMessage('copy.RecruitmentDesk.a917b94665', { p0: plain(fee) })}
                </button>
              </div>
            }
          >
            {localizeValue(
              message?.world === w.id && (
                <p data-surface="inset" className={s.message} role="status">
                  {localizeValue(message.text)}
                </p>
              ),
            )}
            {localizeValue(
              bidDetail.value ? (
                render(bidDetail.value, bidDetail.current, true)
              ) : (
                <p role="status">
                  {localizeValue(
                    bidDetail.error ?? sourceMessage('copy.RecruitmentDesk.178444b551'),
                  )}
                </p>
              ),
            )}
            {localizeValue(
              bidDetail.error && (
                <button data-ui="tertiary" onClick={bidDetail.retry}>
                  {richMessage('copy.RecruitmentDesk.3f6edcf334')}
                </button>
              ),
            )}
            <p className={s.note}>
              {richMessage('copy.RecruitmentDesk.2145596719', {
                p0: format(outlook?.asking || bidding.asking),
              })}
            </p>
            <div
              className={s.bidSteps}
              role="radiogroup"
              aria-label={displayMessage('copy.RecruitmentDesk.8cfe8b46e7')}
            >
              {localizeValue(
                steps.map((percent, i) => (
                  <button
                    key={String(percent)}
                    role="radio"
                    data-ui={step === i ? 'secondary' : 'tertiary'}
                    aria-checked={step === i}
                    className={step === i ? s.bidPicked : undefined}
                    onClick={() => setStep(i)}
                  >
                    <b>{localizeValue(String(percent))}%</b>
                    <small>{localizeValue(plain(((asking * percent) / 100n).toString()))}</small>
                  </button>
                )),
              )}
            </div>
            <dl className={s.costs}>
              <div>
                <dt>{richMessage('copy.RecruitmentDesk.9873423ded')}</dt>
                <dd>
                  {localizeValue(
                    outlook
                      ? sourceMessage('copy.RecruitmentDesk.7d605cafab', {
                          p0: outlook.label,
                          p1: Math.round(outlook.chance * 100),
                        })
                      : sourceMessage('copy.RecruitmentDesk.414f13ede8'),
                  )}
                </dd>
              </div>
              <div>
                <dt>{richMessage('copy.RecruitmentDesk.14d30523d4')}</dt>
                <dd>{localizeValue(format((BigInt(w.cash) - BigInt(fee)).toString()))}</dd>
              </div>
            </dl>
            {localizeValue(
              BigInt(fee) > BigInt(w.cash) && (
                <p data-surface="inset" className={s.warning}>
                  {richMessage('copy.RecruitmentDesk.b1a864c839')}
                </p>
              ),
            )}
          </Dialog>
        ),
      )}
      {localizeValue(
        viewing && (
          <Dialog
            label={displayMessage('copy.RecruitmentDesk.4618a3f213')}
            onClose={() => setViewing(undefined)}
          >
            {localizeValue(
              message?.world === w.id && (
                <p data-surface="inset" className={s.message} role="status">
                  {localizeValue(message.text)}
                </p>
              ),
            )}
            {localizeValue(
              detail.value ? (
                render(detail.value, detail.current)
              ) : (
                <p role="status">
                  {localizeValue(detail.error ?? sourceMessage('copy.RecruitmentDesk.965c4d30c9'))}
                </p>
              ),
            )}
            {localizeValue(
              detail.error && (
                <button data-ui="tertiary" onClick={detail.retry}>
                  {richMessage('copy.RecruitmentDesk.6cd5c3642f')}
                </button>
              ),
            )}
          </Dialog>
        ),
      )}
    </section>
  );
}
