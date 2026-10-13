import { createHash } from 'node:crypto';
import { canonical } from '../packages/contracts/src/index';
import { CATALOG_HASH, priceData, footballData } from '../packages/catalogs/src/index';
import { COUNTRIES, priceIndex, CATALOG_VERSION } from '../packages/catalogs/src/index';
import { SPONSOR_SLOTS, footballIndex, sponsorSlotOpens } from '../packages/catalogs/src/index';
import { broadcastingIndex } from '../packages/catalogs/src/index';
const sources: Record<string, string> = footballData.sources;
const table: Record<string, { share: number; real: number[] }> = footballData.index;
const eras = footballData.eras;
const { from, base, coverage } = footballData;
for (const [key, text] of Object.entries(sources))
  if (!text.includes('https://')) throw new Error(`Catalog source without a reference: ${key}`);
if (eras.length === 0 || eras[eras.length - 1].to !== coverage)
  throw new Error('The last football era must end at the catalog coverage year');
if (base <= from || base > eras[0].to)
  throw new Error('The football base year must sit inside the first, flat era');
eras.forEach((era, index) => {
  const previous = index === 0 ? from : eras[index - 1].to;
  if (era.to <= previous) throw new Error(`Football eras out of order at ${era.to}`);
  if (!era.note) throw new Error(`Football era ${era.to} has no note`);
  if (era.sources.length === 0) throw new Error(`Football era ${era.to} has no source`);
  for (const key of era.sources)
    if (!sources[key]) throw new Error(`Football era ${era.to} cites unknown ${key}`);
});
// The broadcasting index (→ECON-31): its own eras over the same coverage, anchors that never fall.
const broadcasting = footballData.broadcasting;
if (
  broadcasting.eras.length === 0 ||
  broadcasting.eras[broadcasting.eras.length - 1].to !== coverage
)
  throw new Error('The last broadcasting era must end at the catalog coverage year');
broadcasting.eras.forEach((era, index) => {
  const previous = index === 0 ? from : broadcasting.eras[index - 1].to;
  if (era.to <= previous) throw new Error(`Broadcasting eras out of order at ${era.to}`);
  if (!era.note) throw new Error(`Broadcasting era ${era.to} has no note`);
  if (era.sources.length === 0) throw new Error(`Broadcasting era ${era.to} has no source`);
  for (const key of era.sources)
    if (!sources[key]) throw new Error(`Broadcasting era ${era.to} cites unknown ${key}`);
});
const broadcastingTable: Record<string, { real: number[] }> = broadcasting.index;
for (const c of COUNTRIES) {
  const row = broadcastingTable[c.code];
  if (!row || row.real.length !== broadcasting.eras.length)
    throw new Error(`Broadcasting index ${c.code} does not cover every era`);
  row.real.forEach((value, index) => {
    if (!(value > 0) || (index > 0 && value < row.real[index - 1]))
      throw new Error(`Broadcasting index ${c.code} falls at ${broadcasting.eras[index].to}`);
  });
  for (let year = from; year <= 2030; year++) {
    const point = broadcastingIndex(c.code, year);
    if (!Number.isFinite(point.value) || !(point.value > 0))
      throw new Error(`Missing broadcasting index ${c.code} ${year}`);
    if (!point.source.includes('https://'))
      throw new Error(`Broadcasting index ${c.code} ${year} has no source`);
    if (year > coverage && point.status !== 'projected')
      throw new Error(
        `Broadcasting index ${c.code} ${year} is past coverage and must be projected`,
      );
    if (year <= coverage && point.status === 'observed')
      throw new Error(`Broadcasting index ${c.code} ${year} may not be called an observation`);
  }
}
for (const c of COUNTRIES) {
  if (c.groups.flat().some((n) => n < 10 || n > 30) || c.moves.length !== c.groups.length - 1)
    throw new Error(`Invalid country: ${c.code}`);
  for (let year = 1901; year <= 2030; year++)
    if (!(priceIndex(c.code, year).value > 0)) throw new Error(`Missing price ${c.code} ${year}`);
  const row = table[c.code];
  if (!row || row.real.length !== eras.length)
    throw new Error(`Football index ${c.code} does not cover every era`);
  if (!(row.share > 0) || row.share > 1)
    throw new Error(`Football share ${c.code} is not a share of England's real growth`);
  row.real.forEach((value, index) => {
    const share = 1 + row.share * (table.ENG.real[index] - 1);
    if (Math.abs(value - share) > 1e-9)
      throw new Error(`Football index ${c.code} ${eras[index].to} is not its declared share`);
  });
  if (footballIndex(c.code, base).real !== 1)
    throw new Error(`Football index ${c.code} is not 1 in real terms at the base year ${base}`);
  let real = 0;
  for (let year = from; year <= 2030; year++) {
    const point = footballIndex(c.code, year);
    if (!Number.isFinite(point.value) || !(point.value > 0))
      throw new Error(`Missing football index ${c.code} ${year}`);
    if (point.real < real - 1e-9)
      throw new Error(`Football index ${c.code} falls in real terms at ${year}`);
    if (!point.source.includes('https://'))
      throw new Error(`Football index ${c.code} ${year} has no source`);
    if (year > coverage && point.status !== 'projected')
      throw new Error(`Football index ${c.code} ${year} is past coverage and must be projected`);
    if (year <= coverage && point.status === 'observed')
      throw new Error(`Football index ${c.code} ${year} may not be called an observation`);
    real = point.real;
  }
  let opens = from - 1;
  for (const slot of SPONSOR_SLOTS) {
    const era = sponsorSlotOpens(c.code, slot);
    if (era.year < from || era.year > coverage)
      throw new Error(`Sponsor slot ${c.code} ${slot} opens outside the catalog`);
    if (era.year < opens) throw new Error(`Sponsor slots ${c.code} open out of order at ${slot}`);
    if (era.status === 'projected')
      throw new Error(`Sponsor slot ${c.code} ${slot} may not be projected`);
    if (!era.source.includes('https://'))
      throw new Error(`Sponsor slot ${c.code} ${slot} has no source`);
    opens = era.year;
  }
}
console.log(
  `${CATALOG_VERSION}: ${COUNTRIES.length} sourced profiles, 1901–2030 positive price, football index (${eras.length} attributed eras) and broadcasting index (${broadcasting.eras.length} attributed eras) coverage, ${SPONSOR_SLOTS.length} sponsor slots per country; normalization and estimates explicitly recorded.`,
);

if (
  createHash('sha256')
    .update(canonical({ countries: COUNTRIES, prices: priceData, football: footballData }))
    .digest('hex') !== CATALOG_HASH
)
  throw new Error('Catalog fingerprint is stale: run tsx scripts/fingerprint-catalog.ts --write');
