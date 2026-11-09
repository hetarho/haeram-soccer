import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import type { World } from '../../../../../../packages/contracts/src/types';
import { Card } from '../../../shared/ui/Card';
import { DeskStats } from './OfficeDesk';
import { money } from '../../../presentation/format';
import { Money } from '../../../shared/ui/Money';
import { cashState, fixedCosts, seasonBooks } from '../../player/@x/office';
import o from '../../../shared/ui/styles/OwnerSheet.module.css';

/**
 * This season's income, spending and result first, then club cash, fixed costs and runway, shared
 * by the unified money dialog and legacy cash view.
 */
export function ClubCashSummary({ w }: { w: World }) {
  useTextLocale();
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const format = (value: string) => <Money value={value} code={own.country} year={w.year} />;
  const state = cashState(w);
  const costs = fixedCosts(w);
  const books = seasonBooks(w);
  const result = BigInt(books.result);
  return (
    <>
      <DeskStats
        label={displayMessage('copy.ClubCashSummary.27b011448c')}
        stats={[
          {
            label: sourceMessage('copy.ClubCashSummary.f438ea44a0'),
            value: format(books.income),
            note: sourceMessage('copy.ClubCashSummary.6552e756bd'),
          },
          {
            label: sourceMessage('copy.ClubCashSummary.a616282dcf'),
            value: format(books.expense),
            note: sourceMessage('copy.ClubCashSummary.6552e756bd'),
          },
          {
            label: sourceMessage('copy.ClubCashSummary.967f1e3a31'),
            value: (
              <span
                className={result > 0n ? o.up : result < 0n ? o.down : undefined}
                data-testid="season-result"
              >
                {localizeValue(result > 0n ? '+' : '')}
                {localizeValue(format(books.result))}
              </span>
            ),
            note:
              result > 0n
                ? sourceMessage('copy.ClubCashSummary.02ca249417')
                : result < 0n
                  ? sourceMessage('copy.ClubCashSummary.c68052ebe3')
                  : sourceMessage('copy.ClubCashSummary.1bc1f8cde0'),
          },
        ]}
      />
      <Card
        as="section"
        surface="ticket"
        aria-label={displayMessage('copy.ClubCashSummary.dbc41a3dd9')}
        meta={`${state.label} ${state.value} · ${state.status}${state.attention ? sourceMessage('copy.ClubCashSummary.8c8946ae4c') : ''}`}
      >
        <p>
          {localizeValue(
            BigInt(w.cash) < 0n
              ? sourceMessage('copy.ClubCashSummary.1a886a01ce')
              : sourceMessage('copy.ClubCashSummary.92f0d1bf5f', { p0: state.value }),
          )}
        </p>
      </Card>
      <DeskStats
        label={displayMessage('copy.ClubCashSummary.00a2861721')}
        stats={[
          {
            label: sourceMessage('copy.ClubCashSummary.861779d896'),
            value: format(w.cash),
            note: money(w.cash, own.country, w.year),
          },
          {
            label: sourceMessage('copy.ClubCashSummary.9ab3a675ca'),
            value: format(costs.nextRound),
          },
          { label: state.label, value: state.value, note: state.status },
        ]}
      />
      <DeskStats
        label={displayMessage('copy.ClubCashSummary.382afa688e')}
        stats={[
          ...costs.kinds.map(([label, amount]) => ({ label, value: format(amount) })),
          { label: sourceMessage('copy.ClubCashSummary.c186eb9e27'), value: format(costs.annual) },
        ]}
      />
    </>
  );
}
