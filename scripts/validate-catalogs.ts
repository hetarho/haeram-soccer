import { createHash } from 'node:crypto';
import { canonical } from '../packages/contracts/src/index';
import { CATALOG_HASH, priceData } from '../packages/catalogs/src/index';
import { COUNTRIES, priceIndex, CATALOG_VERSION } from '../packages/catalogs/src/index';
for (const c of COUNTRIES) {
  if (c.groups.flat().some((n) => n < 10 || n > 30) || c.moves.length !== c.groups.length - 1)
    throw new Error(`Invalid country: ${c.code}`);
  for (let year = 1901; year <= 2030; year++)
    if (!(priceIndex(c.code, year).value > 0)) throw new Error(`Missing price ${c.code} ${year}`);
}
console.log(
  `${CATALOG_VERSION}: ${COUNTRIES.length} sourced profiles and 1901–2030 positive price coverage; normalization and estimates explicitly recorded.`,
);

if (
  createHash('sha256')
    .update(canonical({ countries: COUNTRIES, prices: priceData }))
    .digest('hex') !== CATALOG_HASH
)
  throw new Error('Catalog fingerprint is stale');
