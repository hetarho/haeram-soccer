import { currency, currencyById } from '../../catalogs/src/index';
import type { CareerEmployment } from '../../contracts/src/types';
import { ratio } from './primitives';

/**
 * A stored annual wage in buyer money only when explicit fixed denomination changes suffice
 * (→ECON-4/5/6, STAFF-28). Employment dates are not salary valuation dates. General nominal FX
 * and unknown provenance retain the existing amount until a rate policy is defined (review F18).
 */
export function employmentWageInBuyerCurrency(
  job: Pick<CareerEmployment, 'wage' | 'currency'>,
  employerCountry: string | undefined,
  year: number,
  buyerCurrency: string,
): string | undefined {
  if (!job.wage || !job.currency || job.currency === buyerCurrency || !employerCountry)
    return job.wage;
  const before = currencyById(employerCountry, job.currency, year);
  if (!before) return job.wage;
  const after = currency(employerCountry, year);
  if (after.code !== buyerCurrency) return job.wage;
  return ratio(
    job.wage,
    after.num * before.den * BigInt(after.units),
    after.den * before.num * BigInt(before.units),
  );
}
