import { message as sourceMessage } from '../../contracts/src/messages';
import type { DesignStudio } from '../../contracts/src/identity';
import type { World } from '../../contracts/src/types';
import { clubOf } from './player-state';
import { quote } from './quotes';

/**
 * What each designer charges and delivers, read by the club-design view without the commission's
 * orchestration (→ARCH-4).
 */

/** Each designer's fee in 1901 money and how many drafts it delivers. */
export const DESIGNERS: Readonly<
  Record<DesignStudio, { label: string; units: number; drafts: number }>
> = {
  local: { label: sourceMessage('copy.design_fees.727b9a2c49'), units: 10, drafts: 2 },
  studio: { label: sourceMessage('copy.design_fees.85e039ddff'), units: 30, drafts: 3 },
  star: { label: sourceMessage('copy.design_fees.8dc748bb76'), units: 80, drafts: 4 },
};

/** What a designer charges this club now. */
export function designFee(w: World, studio: DesignStudio) {
  return quote(clubOf(w).country, w.year, DESIGNERS[studio].units);
}
/** Redrawing the delivered drafts costs half the designer's fee. */
export function redrawFee(w: World, studio: DesignStudio) {
  return (BigInt(designFee(w, studio)) / 2n).toString();
}
