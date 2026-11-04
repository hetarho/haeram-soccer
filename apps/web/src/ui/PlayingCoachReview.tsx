import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import type { Player, World } from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import { gameActionsBlocked, useGameState } from '../runtime/store';
import { STAFF_INFO } from '../../../../packages/engine/src/staff-info';
import { DecisionOwner } from './DecisionOwner';
import { Money } from './Money';
import s from './PlayerProfile.module.css';

/**
 * Staff's combined playing-coach proposal waiting in the 결재함 (→STAFF-32): one answer covers both
 * contracts; the engine owns the quote and its eligibility.
 */
export function PlayingCoachReview({
  w,
  player,
  client,
}: {
  w: World;
  player: Player;
  client: GameClient;
}) {
  useTextLocale();
  const disabled = useGameState(gameActionsBlocked);
  const readonly = useGameState((state) => state.readonly);
  const proposal = w.playingCoachProposals?.[player.id];
  if (proposal?.status !== 'pending') return null;
  const money = (value: string) => (
    <Money value={value} code={w.clubs.find((c) => c.id === w.playerClub)!.country} year={w.year} />
  );
  const short = BigInt(w.cash) < BigInt(proposal.upfront);
  const answer = (accept: boolean) =>
    void client.command({ type: 'answer-playing-coach', player: player.id, accept });
  return (
    <section
      data-surface="sheet"
      className={s.career}
      aria-label={displayMessage('copy.PlayingCoachReview.3260ab02e8')}
    >
      <h3>{richMessage('copy.PlayingCoachReview.00abd151ca')}</h3>
      {localizeValue(
        disabled && (
          <p role="status">
            {localizeValue(
              readonly
                ? sourceMessage('copy.PlayingCoachReview.671bbc4d59')
                : sourceMessage('copy.MediationReview.dde347e328'),
            )}
          </p>
        ),
      )}
      <DecisionOwner
        w={w}
        decision="contracts"
        auto={sourceMessage('copy.PlayingCoachReview.2078ac9f75')}
        owner={sourceMessage('copy.PlayingCoachReview.4644705b60')}
      />
      <DecisionOwner
        w={w}
        decision="staff"
        auto={sourceMessage('copy.PlayingCoachReview.e45634a4e3')}
        owner={sourceMessage('copy.PlayingCoachReview.0fc73dbc42')}
      />
      <p>
        {richMessage('copy.PlayingCoachReview.506820d06f', {
          p0: STAFF_INFO[proposal.role].label,
          p1: proposal.years,
          p2: proposal.term,
        })}
      </p>
      <dl>
        <dt>{richMessage('copy.MediationReview.b9d465b29e')}</dt>
        <dd>{localizeValue(money(proposal.playerWage))}</dd>
        <dt>{richMessage('copy.PlayingCoachReview.29ef287e6c')}</dt>
        <dd>{localizeValue(money(proposal.coachWage))}</dd>
        <dt>{richMessage('copy.PlayingCoachReview.8c257bf0f3')}</dt>
        <dd>{localizeValue(money(proposal.totalWage))}</dd>
        <dt>{richMessage('copy.MediationReview.d881c8d4c4')}</dt>
        <dd>
          {richMessage('copy.PlayingCoachReview.a01062ab8b', {
            p0: money(proposal.upfront),
            p1: money(proposal.fee),
            p2: ' ',
            p3: money(proposal.replacement),
          })}
        </dd>
      </dl>
      <p>{richMessage('copy.PlayingCoachReview.77a86536c2')}</p>
      {localizeValue(
        short && <p role="alert">{richMessage('copy.PlayingCoachReview.aebaa02cee')}</p>,
      )}
      <button disabled={disabled || short} onClick={() => answer(true)}>
        {richMessage('copy.PlayingCoachReview.8b40555ce9')}
      </button>
      <button disabled={disabled} onClick={() => answer(false)}>
        {richMessage('copy.PlayingCoachReview.61bf83bc44')}
      </button>
    </section>
  );
}
