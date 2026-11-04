import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { useMemo, useState } from 'react';
import type { ClubListing as Listing } from '../../../../packages/contracts/src/owner';
import type { CountryCode } from '../../../../packages/contracts/src/types';
import { country } from '../../../../packages/catalogs/src/index';
import { TAKEOVER_DEBT } from '../../../../packages/engine/src/owner-config';
import { useRead } from '../shared/lib';
import { ClubDetail } from '../widgets/club-detail';
import { CrestMark } from './ClubCrest';
import { Dialog } from './Dialog';
import { compactMoney, seasonName } from './format';
import { Money } from './Money';
import { Segments } from './Segments';
import { Select } from './Select';
import {
  canAfford,
  defaultFilter,
  divisionLabel,
  filterListings,
  fortuneAfter,
  listingCountries,
  listingDivisions,
  type ClubProfile,
  type ListingFilter,
  type ListingSort,
} from './startChoices';
import s from './ClubListing.module.css';

/** The fortune's money: the tiers are sized in pounds (→OWNER-3, ECON-35). */
const POUNDS: CountryCode = 'ENG';
const SORTS = [
  ['strength', sourceMessage('copy.ClubListing.4c4fc7dc0b')],
  ['price', sourceMessage('copy.ClubListing.09154a57cb')],
] as const satisfies readonly (readonly [ListingSort, string])[];

export interface ClubListingProps {
  /** Every club of the playable countries in the takeover season (→WEB-15, ECON-37). */
  listings: Listing[];
  /** The owner's fortune in pounds, minor units (→OWNER-3); absent, each listing's own flag. */
  fortune?: string;
  /** The takeover season the amounts are valued in. */
  year: number;
  busy?: boolean;
  readonly?: boolean;
  /** Reads a club's profile (squad, 코치진, stadium, history) for its detail. */
  loadClub?: (clubId: string) => Promise<ClubProfile | undefined>;
  /** Takes the club over with standard operating defaults (→WEB-15, ECON-22). */
  onTakeOver: (clubId: string) => void;
}

/**
 * The takeover list (→WEB-15): every club with its price, cash, debt, last season's income and
 * wage bill, strength, division and whether the owner can afford it, filtered by country and
 * division. A row opens the club's sheet; its 인수 검토 opens the confirmation with the direction.
 */
export function ClubListing({
  listings,
  fortune,
  year,
  busy = false,
  readonly = false,
  loadClub,
  onTakeOver,
}: ClubListingProps) {
  useTextLocale();
  const [filter, setFilter] = useState<ListingFilter>(() => defaultFilter(listings, fortune));
  const [open, setOpen] = useState<string>();
  const [confirming, setConfirming] = useState<string>();
  const countries = listingCountries(listings);
  const divisions = listingDivisions(listings, filter.country);
  const rows = useMemo(
    () => filterListings(listings, filter, fortune),
    [listings, filter, fortune],
  );
  const amount = (value: string, code: string) => compactMoney(value, code, year);
  const selected = listings.find((listing) => listing.clubId === (confirming ?? open));
  const pickCountry = (value: string) => {
    const next = value as ListingFilter['country'];
    const kept = listingDivisions(listings, next);
    setFilter((current) => ({
      ...current,
      country: next,
      division:
        current.division === 'all' || kept.includes(current.division)
          ? current.division
          : (kept[0] ?? 'all'),
    }));
  };
  return (
    <section
      className={s.listing}
      aria-label={displayMessage('copy.ClubListing.38b9fd4e66')}
      data-testid="club-listing"
    >
      <div className={s.head} data-surface="sheet">
        <div className={s.title}>
          <h2>{richMessage('copy.ClubListing.38b9fd4e66')}</h2>
          <small>
            {richMessage('copy.ClubListing.b313673d6c', {
              p0: seasonName(year),
              p1: listings.length,
            })}
          </small>
        </div>
        {localizeValue(
          fortune !== undefined && (
            <div className={s.fortune}>
              <small>{richMessage('shell.fortune')}</small>
              <Money value={fortune} code={POUNDS} year={year} />
            </div>
          ),
        )}
        <div className={s.filters}>
          <Select
            aria-label={displayMessage('copy.ClubListing.10a6c77fd1')}
            value={filter.country}
            onValueChange={pickCountry}
          >
            <option value="all">{richMessage('copy.ClubListing.2d069c5639')}</option>
            {localizeValue(
              countries.map((code) => (
                <option key={code} value={code}>
                  {localizeValue(country(code).name)}
                </option>
              )),
            )}
          </Select>
          <Select
            aria-label={displayMessage('navigation.league')}
            value={String(filter.division)}
            onValueChange={(value) =>
              setFilter((current) => ({
                ...current,
                division: value === 'all' ? 'all' : Number(value),
              }))
            }
          >
            <option value="all">{richMessage('copy.ClubListing.86f46d158a')}</option>
            {localizeValue(
              divisions.map((division) => (
                <option key={division} value={String(division)}>
                  {localizeValue(divisionLabel(division))}
                </option>
              )),
            )}
          </Select>
          <Segments
            label={displayMessage('team.sort')}
            options={SORTS}
            value={filter.sort}
            onChange={(sort) => setFilter((current) => ({ ...current, sort }))}
          />
          <label className={s.toggle}>
            {richMessage('copy.ClubListing.e444599420', {
              p0: (
                <input
                  type="checkbox"
                  checked={filter.affordable}
                  onChange={(event) =>
                    setFilter((current) => ({ ...current, affordable: event.target.checked }))
                  }
                />
              ),
            })}
          </label>
        </div>
      </div>
      {localizeValue(
        rows.length ? (
          <ul
            className={s.rows}
            aria-label={displayMessage('copy.ClubListing.618ab114cc', { p0: rows.length })}
          >
            {localizeValue(
              rows.map((listing) => {
                const ok = canAfford(listing, fortune);
                const place = `${country(listing.country).name} ${divisionLabel(listing.division)}`;
                return (
                  <li key={listing.clubId}>
                    <button
                      type="button"
                      className={s.row}
                      data-affordable={ok}
                      aria-label={displayMessage('copy.ClubListing.cde558a376', {
                        p0: listing.name,
                        p1: place,
                        p2: listing.strength,
                        p3: amount(listing.price, listing.country),
                        p4: ok
                          ? sourceMessage('copy.ClubListing.cf55f5b05d')
                          : sourceMessage('copy.ClubListing.92f1ffe7cb'),
                      })}
                      onClick={() => setOpen(listing.clubId)}
                    >
                      <span className={s.name}>
                        <b>{listing.name}</b>
                        <small>{localizeValue(place)}</small>
                      </span>
                      <span className={s.price}>
                        <b>{localizeValue(amount(listing.price, listing.country))}</b>
                        <small className={s.afford}>
                          {localizeValue(
                            ok
                              ? sourceMessage('copy.ClubListing.cf55f5b05d')
                              : sourceMessage('copy.ClubListing.92f1ffe7cb'),
                          )}
                        </small>
                      </span>
                      <span className={s.facts}>
                        <Fact
                          label={displayMessage('copy.ClubListing.6403c770c8')}
                          value={String(listing.strength)}
                        />
                        <Fact
                          label={displayMessage('copy.ClubListing.95b487c612')}
                          value={amount(listing.cash, listing.country)}
                        />
                        <Fact
                          label={displayMessage('copy.ClubListing.4cd483a22d')}
                          value={amount(listing.debt, listing.country)}
                        />
                        <Fact
                          label={displayMessage('copy.ClubListing.8d46987834')}
                          value={amount(listing.lastIncome, listing.country)}
                        />
                        <Fact
                          label={displayMessage('copy.ClubListing.84920b8ffe')}
                          value={amount(listing.lastWages, listing.country)}
                        />
                      </span>
                    </button>
                  </li>
                );
              }),
            )}
          </ul>
        ) : (
          <p className={s.empty} data-surface="inset">
            {richMessage('copy.ClubListing.a8a7ae5385')}
          </p>
        ),
      )}
      {localizeValue(
        selected && !confirming && (
          <ClubSheet
            listing={selected}
            fortune={fortune}
            year={year}
            blocked={busy || readonly}
            loadClub={loadClub}
            onClose={() => setOpen(undefined)}
            onReview={() => setConfirming(selected.clubId)}
          />
        ),
      )}
      {localizeValue(
        selected && confirming && (
          <TakeoverConfirm
            listing={selected}
            fortune={fortune}
            year={year}
            busy={busy}
            blocked={busy || readonly || !canAfford(selected, fortune)}
            onBack={() => setConfirming(undefined)}
            onConfirm={() => onTakeOver(selected.clubId)}
          />
        ),
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  useTextLocale();
  return (
    <span className={s.fact}>
      <small>{localizeValue(label)}</small>
      <b>{localizeValue(value)}</b>
    </span>
  );
}

/** The price against the fortune: what is left after paying, or what is missing. */
function Verdict({ listing, fortune, year }: { listing: Listing; fortune?: string; year: number }) {
  useTextLocale();
  const ok = canAfford(listing, fortune);
  const left = fortune === undefined ? undefined : fortuneAfter(listing, fortune);
  return (
    <div className={s.verdict} data-surface="ticket" data-affordable={ok}>
      <span className={s.verdictPrice}>
        <small>{richMessage('copy.ClubListing.9ea74f0089')}</small>
        <Money value={listing.price} code={listing.country} year={year} />
        {localizeValue(
          listing.country !== POUNDS && (
            <small>≈ {localizeValue(compactMoney(listing.pricePounds, POUNDS, year))}</small>
          ),
        )}
      </span>
      <b className={s.verdictLine}>
        {localizeValue(
          left === undefined
            ? ok
              ? sourceMessage('copy.ClubListing.16c3ce21ff')
              : sourceMessage('copy.ClubListing.c2b34058de')
            : left >= 0n
              ? sourceMessage('copy.ClubListing.12b05bdfaa', {
                  p0: compactMoney(String(left), POUNDS, year),
                })
              : sourceMessage('copy.ClubListing.595ef119f2', {
                  p0: compactMoney(String(-left), POUNDS, year),
                }),
        )}
      </b>
    </div>
  );
}

/**
 * A listed club's detail before buying (→WEB-15): the shared club detail, its 개요 the price
 * against the fortune and the books, with the way to the takeover's confirmation.
 */
function ClubSheet({
  listing,
  fortune,
  year,
  blocked,
  loadClub,
  onClose,
  onReview,
}: {
  listing: Listing;
  fortune?: string;
  year: number;
  blocked: boolean;
  loadClub?: ClubListingProps['loadClub'];
  onClose: () => void;
  onReview: () => void;
}) {
  useTextLocale();
  const read = useRead(listing.clubId, async () => {
    const profile = await loadClub?.(listing.clubId);
    if (!profile) throw new Error(sourceMessage('copy.ClubListing.d86509575d'));
    return profile;
  });
  const ok = canAfford(listing, fortune);
  const amount = (value: string) => compactMoney(value, listing.country, year);
  return (
    <ClubDetail
      name={listing.name}
      crest={
        read.status === 'ready' &&
        read.value.crest && <CrestMark crest={read.value.crest} size={40} />
      }
      lines={
        <small>
          {richMessage('copy.ClubListing.e6b9f13737', {
            p0: country(listing.country).name,
            p1: divisionLabel(listing.division),
            p2: ' ',
            p3: listing.strength,
          })}
        </small>
      }
      overview={
        <>
          <Verdict listing={listing} fortune={fortune} year={year} />
          <dl className={s.books}>
            <div>
              <dt>{richMessage('copy.ClubListing.95b487c612')}</dt>
              <dd>{localizeValue(amount(listing.cash))}</dd>
            </div>
            <div>
              <dt>{richMessage('copy.ClubListing.4cd483a22d')}</dt>
              <dd>{localizeValue(amount(listing.debt))}</dd>
            </div>
            <div>
              <dt>{richMessage('copy.ClubListing.0c1a81d3f4')}</dt>
              <dd>{localizeValue(amount(listing.lastIncome))}</dd>
            </div>
            <div>
              <dt>{richMessage('copy.ClubListing.466104cbaf')}</dt>
              <dd>{localizeValue(amount(listing.lastWages))}</dd>
            </div>
          </dl>
        </>
      }
      profile={read}
      onClose={onClose}
      testId="club-sheet"
      actions={
        <div className={s.actions}>
          <button type="button" onClick={onClose}>
            {richMessage('copy.ClubListing.f9a249aaf3')}
          </button>
          <button type="button" data-ui="primary" disabled={blocked || !ok} onClick={onReview}>
            {localizeValue(
              ok
                ? sourceMessage('copy.ClubListing.380a26d74c')
                : sourceMessage('copy.ClubListing.92f1ffe7cb'),
            )}
          </button>
        </div>
      }
    />
  );
}

/** The takeover's confirmation with its price, cash and debt (→WEB-15, ECON-22, ECON-38). */
export function TakeoverConfirm({
  listing,
  fortune,
  year,
  busy,
  blocked,
  onBack,
  onConfirm,
}: {
  listing: Listing;
  fortune?: string;
  year: number;
  busy: boolean;
  blocked: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  useTextLocale();
  const amount = (value: string) => compactMoney(value, listing.country, year);
  const indebted = BigInt(listing.debt) > 0n;
  return (
    <Dialog
      label={displayMessage('copy.ClubListing.33630b76b9', { p0: listing.name })}
      onClose={onBack}
      actions={
        <div className={s.actions}>
          <button type="button" onClick={onBack}>
            {richMessage('copy.ClubListing.b8c3900474')}
          </button>
          <button type="button" data-ui="primary" disabled={blocked} onClick={onConfirm}>
            {localizeValue(
              busy
                ? sourceMessage('copy.ClubListing.19e59e83bd')
                : sourceMessage('copy.ClubListing.41533555df'),
            )}
          </button>
        </div>
      }
    >
      <div className={s.sheet} data-testid="takeover-confirm">
        <Verdict listing={listing} fortune={fortune} year={year} />
        <ul className={s.terms}>
          <li>{richMessage('copy.ClubListing.2e070c3f6c')}</li>
          <li>{richMessage('copy.ClubListing.a480ceb849', { p0: amount(listing.cash) })}</li>
          <li>
            {localizeValue(
              indebted
                ? sourceMessage('copy.ClubListing.c12ded6862', {
                    p0: amount(listing.debt),
                    p1: TAKEOVER_DEBT.seasons,
                    p2: Math.round(TAKEOVER_DEBT.rate * 100),
                  })
                : sourceMessage('copy.ClubListing.ab4263cdef'),
            )}
          </li>
        </ul>
      </div>
    </Dialog>
  );
}
