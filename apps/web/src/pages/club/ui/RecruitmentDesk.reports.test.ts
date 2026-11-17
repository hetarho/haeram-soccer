import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { message, type SourceMessageId } from '../../../../../../packages/contracts/src/messages';
import type { FactorLine } from '../../../../../../packages/engine/src/sale-answer';
import { reservationReport, termsReport } from '../../../../../../packages/engine/src/transfers';
import { createLoadedLocale } from '../../../presentation/locale';
import { displayMessage, localizeText, setTextLocale } from '../../../presentation/text';

const pack = (id: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../../../public/presentation/locales/${id}.json`, import.meta.url),
      'utf8',
    ),
  );
const english = () =>
  setTextLocale(
    createLoadedLocale(
      {
        schemaVersion: 1,
        defaultId: 'ko-KR',
        entries: [
          { id: 'ko-KR', label: '한국어', direction: 'ltr', resource: 'ko-KR.json' },
          { id: 'en-GB', label: 'English', direction: 'ltr', resource: 'en-GB.json' },
        ],
      },
      pack('en-GB'),
      pack('ko-KR'),
    ),
  );
afterEach(() => setTextLocale());

const line = (
  message: SourceMessageId,
  params: Record<string, string | number> = {},
): FactorLine => ({ factor: message, delta: 0.1, message, params });
/** Every selling-club factor a bid of ours can meet, the ones with parameters included. */
const SALE: FactorLine[] = [
  line('market.sale.place.core'),
  line('copy.transfers.53f9e38caf'),
  line('market.sale.age', { age: 31 }),
  line('market.sale.prospect'),
  line('market.sale.cash', { rounds: 3 }),
  line('market.sale.sellDown'),
  line('market.sale.director', { name: 'Bob Smith', ability: 70 }),
  line('market.sale.deadline', { days: 1 }),
  line('market.sale.managerStyle'),
  line('market.sale.wages.far', { share: 72 }),
  line('market.sale.listed'),
];
/** Every factor a player's answer can name. */
const TERMS: FactorLine[] = [
  line('market.terms.wage.above', { percent: 150 }),
  line('market.terms.division', { divisions: 2 }),
  line('market.terms.reputation.lower', { ours: 30, his: 45 }),
  line('market.terms.leavingEurope'),
  line('market.terms.losesPlace'),
  line('market.terms.freeAgent'),
  line('market.terms.wouldStart'),
];
const hangul = /[가-힣]/;

describe('bid answer reports read in every locale (→ARCH-32, →CLUB-52/53)', () => {
  it('translates the reservation and each of its factors, whatever their number', () => {
    english();
    for (let n = 0; n <= SALE.length; n++) {
      const factors = SALE.slice(0, n),
        reason = reservationReport('£1.20M', 0.87, factors),
        report = message('market.answer.refused', { fee: '£900K', asking: '£1.40M', reason }),
        shown = localizeText(report);
      expect(shown, report).not.toMatch(hangul);
      for (const factor of factors)
        expect(shown).toContain(displayMessage(factor.message, factor.params));
    }
  });

  it('translates the player’s chance and each of his factors in every refusal report', () => {
    english();
    const reason = reservationReport('£1.20M', 0.87, SALE.slice(0, 4));
    for (let n = 0; n <= TERMS.length; n++) {
      const factors = TERMS.slice(0, n),
        terms = termsReport(0.42, factors);
      for (const report of [
        message('market.answer.player.detail', { fee: '£1M', wage: '£500', percent: 125, terms }),
        message('market.answer.player.detail.club', {
          fee: '£1M',
          reason,
          wage: '£500',
          percent: 125,
          terms,
        }),
        message('market.answer.free.detail', { wage: '£500', percent: 200, terms }),
      ]) {
        const shown = localizeText(report);
        expect(shown, report).not.toMatch(hangul);
        expect(shown).toContain('42%');
        for (const factor of factors)
          expect(shown).toContain(displayMessage(factor.message, factor.params));
      }
    }
  });

  it('keeps a player’s name as written in the titles that carry it', () => {
    english();
    const name = '자유계약 선수';
    expect(localizeText(message('market.answer.player.title', { name }))).toContain(name);
    expect(localizeText(message('market.answer.free.title', { name }))).toContain(name);
  });
});
