import type { World } from '../../../../packages/contracts/src/types';
import type { CareerInput } from '../../../../packages/engine/src/career.testkit';
import { operate, simulateSeason } from '../../../../packages/engine/src/index';
import { careerEnded } from '../../../../packages/contracts/src/owner';
import { lastSeasonTurnover } from '../../../../packages/engine/src/finance-read';
import { fanMoodChange } from '../../../../packages/engine/src/fan-mood-read';
import { FAN_MOOD } from '../../../../packages/engine/src/owner-config';
import { invalidDetail } from '../../../../packages/engine/src/script/failure';
import { cachedWorld } from '../../../../tests/fixtures/cached-world';
import { simulatedWorld } from '../../../../tests/fixtures/worlds';

export const CAREER: CareerInput = { country: 'ENG', seed: 'save-test' };
export const world = () => simulatedWorld(CAREER);

/** Prospective support for this explicit codec career, using genuine owner capital only. */
export function supportCodecOwner(w: World) {
  const owner = w.owner;
  if (!owner || !w.playerClub || careerEnded(w)) throw invalidDetail('codec-fixture:live-owner');
  if (owner.fanMood >= FAN_MOOD.max) return [];
  const turnover =
    lastSeasonTurnover(w) ??
    (owner.takeover.year === w.year ? owner.takeover.lastIncome : undefined);
  const positiveTurnover = turnover !== undefined && BigInt(turnover) > 0n;
  if (!positiveTurnover && owner.takeover.currency !== w.currency)
    throw invalidDetail('codec-fixture:capital-currency');
  const basis = positiveTurnover ? BigInt(turnover!) : BigInt(owner.takeover.price);
  if (basis <= 0n) throw invalidDetail('codec-fixture:capital-budget');
  const amount = (basis + 9n) / 10n;
  const moodGain = Math.round(fanMoodChange(w, FAN_MOOD.injection.max, 'stars') * 100);
  const moodGap = Math.round((FAN_MOOD.max - owner.fanMood) * 100);
  const count = Math.ceil(moodGap / moodGain);
  if (BigInt(owner.fortune) < amount * BigInt(count))
    throw invalidDetail('codec-fixture:affordable-capital');
  const receipts = [];
  for (let index = 0; index < count; index++) {
    if (careerEnded(w)) throw invalidDetail('codec-fixture:live-owner');
    const before = {
      fortune: owner.fortune,
      cash: w.cash,
      income: w.income,
      revision: w.revision,
      mood: owner.fanMood,
    };
    operate(w, { type: 'owner-inject', amount: amount.toString() });
    receipts.push({
      year: w.year,
      amount: amount.toString(),
      basis: basis.toString(),
      source: positiveTurnover ? 'turnover' : 'takeover-price',
      before,
      after: {
        fortune: owner.fortune,
        cash: w.cash,
        income: w.income,
        revision: w.revision,
        mood: owner.fanMood,
      },
    });
  }
  if (owner.fanMood !== FAN_MOOD.max) throw invalidDetail('codec-fixture:supported-owner');
  return receipts;
}

function buildTenRichSeasons() {
  const w = world();
  for (let season = 0; season < 10; season++) {
    w.cash = '999999999999999';
    supportCodecOwner(w);
    simulateSeason(w);
  }
  return w;
}
/**
 * `world()` after ten closed seasons with controlled cash and real owner support, for the save round trip. The
 * release gate builds it beside the tests (`scripts/warm-worlds.ts`). The builder is passed bound,
 * so its cache key is the same under vitest's and tsx's transforms, which print its source
 * differently; this module's source fingerprint already covers the builder.
 */
export const tenRichSeasons = () =>
  cachedWorld('ten rich seasons', buildTenRichSeasons.bind(undefined));
