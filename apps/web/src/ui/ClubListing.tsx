import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClubListing as Listing } from '../../../../packages/contracts/src/owner';
import type { CountryCode } from '../../../../packages/contracts/src/types';
import { country } from '../../../../packages/catalogs/src/index';
import { TAKEOVER_DEBT } from '../../../../packages/engine/src/owner-config';
import { BUILD_PRESETS } from '../../../../packages/engine/src/preset-data';
import { CrestMark } from './ClubCrest';
import { Dialog } from './Dialog';
import { compactMoney, number, seasonName } from './format';
import { Money } from './Money';
import { PositionBadge } from './PositionBadge';
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
  type ClubSheetFacts,
  type ListingFilter,
  type ListingSort,
} from './startChoices';
import s from './ClubListing.module.css';

/** The fortune's money: the tiers are sized in pounds (→OWNER-3, ECON-35). */
const POUNDS: CountryCode = 'ENG';
const SORTS = [
  ['strength', '전력순'],
  ['price', '가격순'],
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
  /** Opens a club's squad, manager, stadium and history for its sheet. */
  loadClub?: (clubId: string) => Promise<ClubSheetFacts | undefined>;
  /** Takes the club over with the chosen direction; no preset is 기본 방향 (→WEB-15, ECON-22). */
  onTakeOver: (clubId: string, preset?: string) => void;
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
    <section className={s.listing} aria-label="인수할 구단" data-testid="club-listing">
      <div className={s.head} data-surface="sheet">
        <div className={s.title}>
          <h2>인수할 구단</h2>
          <small>
            {seasonName(year)} 시즌 · {listings.length}개 구단
          </small>
        </div>
        {fortune !== undefined && (
          <div className={s.fortune}>
            <small>구단주 자금</small>
            <Money value={fortune} code={POUNDS} year={year} />
          </div>
        )}
        <div className={s.filters}>
          <Select aria-label="국가" value={filter.country} onValueChange={pickCountry}>
            <option value="all">모든 국가</option>
            {countries.map((code) => (
              <option key={code} value={code}>
                {country(code).name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="리그"
            value={String(filter.division)}
            onValueChange={(value) =>
              setFilter((current) => ({
                ...current,
                division: value === 'all' ? 'all' : Number(value),
              }))
            }
          >
            <option value="all">모든 리그</option>
            {divisions.map((division) => (
              <option key={division} value={String(division)}>
                {divisionLabel(division)}
              </option>
            ))}
          </Select>
          <Segments
            label="정렬"
            options={SORTS}
            value={filter.sort}
            onChange={(sort) => setFilter((current) => ({ ...current, sort }))}
          />
          <label className={s.toggle}>
            <input
              type="checkbox"
              checked={filter.affordable}
              onChange={(event) =>
                setFilter((current) => ({ ...current, affordable: event.target.checked }))
              }
            />
            인수 가능만
          </label>
        </div>
      </div>
      {rows.length ? (
        <ul className={s.rows} aria-label={`구단 ${rows.length}개`}>
          {rows.map((listing) => {
            const ok = canAfford(listing, fortune);
            const place = `${country(listing.country).name} ${divisionLabel(listing.division)}`;
            return (
              <li key={listing.clubId}>
                <button
                  type="button"
                  className={s.row}
                  data-affordable={ok}
                  aria-label={`${listing.name} · ${place} · 전력 ${listing.strength} · 가격 ${amount(listing.price, listing.country)} · ${ok ? '인수 가능' : '자금 부족'}`}
                  onClick={() => setOpen(listing.clubId)}
                >
                  <span className={s.name}>
                    <b>{listing.name}</b>
                    <small>{place}</small>
                  </span>
                  <span className={s.price}>
                    <b>{amount(listing.price, listing.country)}</b>
                    <small className={s.afford}>{ok ? '인수 가능' : '자금 부족'}</small>
                  </span>
                  <span className={s.facts}>
                    <Fact label="전력" value={String(listing.strength)} />
                    <Fact label="현금" value={amount(listing.cash, listing.country)} />
                    <Fact label="부채" value={amount(listing.debt, listing.country)} />
                    <Fact label="지난 수입" value={amount(listing.lastIncome, listing.country)} />
                    <Fact label="인건비" value={amount(listing.lastWages, listing.country)} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={s.empty} data-surface="inset">
          이 조건에 맞는 구단이 없어요. 국가나 리그를 바꿔 보세요.
        </p>
      )}
      {selected && !confirming && (
        <ClubSheet
          listing={selected}
          fortune={fortune}
          year={year}
          blocked={busy || readonly}
          loadClub={loadClub}
          onClose={() => setOpen(undefined)}
          onReview={() => setConfirming(selected.clubId)}
        />
      )}
      {selected && confirming && (
        <TakeoverConfirm
          listing={selected}
          fortune={fortune}
          year={year}
          busy={busy}
          blocked={busy || readonly || !canAfford(selected, fortune)}
          onBack={() => setConfirming(undefined)}
          onConfirm={(preset) => onTakeOver(selected.clubId, preset)}
        />
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className={s.fact}>
      <small>{label}</small>
      <b>{value}</b>
    </span>
  );
}

/** The price against the fortune: what is left after paying, or what is missing. */
function Verdict({ listing, fortune, year }: { listing: Listing; fortune?: string; year: number }) {
  const ok = canAfford(listing, fortune);
  const left = fortune === undefined ? undefined : fortuneAfter(listing, fortune);
  return (
    <div className={s.verdict} data-surface="ticket" data-affordable={ok}>
      <span className={s.verdictPrice}>
        <small>인수 가격</small>
        <Money value={listing.price} code={listing.country} year={year} />
        {listing.country !== POUNDS && (
          <small>≈ {compactMoney(listing.pricePounds, POUNDS, year)}</small>
        )}
      </span>
      <b className={s.verdictLine}>
        {left === undefined
          ? ok
            ? '인수할 수 있어요'
            : '자금이 모자라요'
          : left >= 0n
            ? `인수 후 구단주 자금 ${compactMoney(String(left), POUNDS, year)}`
            : `자금이 ${compactMoney(String(-left), POUNDS, year)} 모자라요`}
      </b>
    </div>
  );
}

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
  // undefined while loading, null when the host has none to give.
  const [facts, setFacts] = useState<ClubSheetFacts | null>();
  const load = useRef(loadClub);
  load.current = loadClub;
  useEffect(() => {
    let live = true;
    setFacts(undefined);
    const read = load.current;
    if (!read) setFacts(null);
    else
      read(listing.clubId).then(
        (value) => live && setFacts(value ?? null),
        () => live && setFacts(null),
      );
    return () => {
      live = false;
    };
  }, [listing.clubId]);
  const ok = canAfford(listing, fortune);
  const amount = (value: string) => compactMoney(value, listing.country, year);
  const squad = facts ? [...facts.squad].sort((a, b) => b.ovr - a.ovr) : [];
  const average = squad.length
    ? Math.round(squad.reduce((sum, player) => sum + player.ovr, 0) / squad.length)
    : undefined;
  return (
    <Dialog
      label={listing.name}
      wide
      onClose={onClose}
      actions={
        <div className={s.actions}>
          <button type="button" onClick={onClose}>
            목록으로
          </button>
          <button type="button" data-ui="primary" disabled={blocked || !ok} onClick={onReview}>
            {ok ? '인수 검토 →' : '자금 부족'}
          </button>
        </div>
      }
    >
      <div className={s.sheet} data-testid="club-sheet">
        <header className={s.identity}>
          {facts?.crest && <CrestMark crest={facts.crest} size={40} />}
          <span>
            <small>
              {country(listing.country).name} {divisionLabel(listing.division)} · 전력{' '}
              {listing.strength}
            </small>
          </span>
        </header>
        <Verdict listing={listing} fortune={fortune} year={year} />
        <dl className={s.books}>
          <div>
            <dt>현금</dt>
            <dd>{amount(listing.cash)}</dd>
          </div>
          <div>
            <dt>부채</dt>
            <dd>{amount(listing.debt)}</dd>
          </div>
          <div>
            <dt>지난 시즌 수입</dt>
            <dd>{amount(listing.lastIncome)}</dd>
          </div>
          <div>
            <dt>지난 시즌 인건비</dt>
            <dd>{amount(listing.lastWages)}</dd>
          </div>
        </dl>
        {facts === undefined && (
          <p role="status" className={s.note}>
            구단 정보를 불러오는 중…
          </p>
        )}
        {facts === null && (
          <p className={s.note}>선수단과 역사는 인수 뒤 구단 화면에서 볼 수 있어요.</p>
        )}
        {facts && (
          <>
            <section className={s.section}>
              <h4>
                선수단{' '}
                <small>
                  {squad.length}명{average !== undefined ? ` · 평균 OVR ${average}` : ''}
                </small>
              </h4>
              <ul className={s.squad}>
                {squad.map((player) => (
                  <li key={player.id}>
                    <PositionBadge position={player.position} />
                    <span>{player.name}</span>
                    <small>{player.age}세</small>
                    <b>{player.ovr}</b>
                  </li>
                ))}
              </ul>
            </section>
            <section className={s.section}>
              <h4>
                감독{' '}
                <small>
                  {facts.manager
                    ? `${facts.manager.name} · ${facts.manager.age}세 · 능력 ${facts.manager.rating}`
                    : '공석'}
                </small>
              </h4>
              {facts.manager?.note && <p>{facts.manager.note}</p>}
            </section>
            <section className={s.section}>
              <h4>
                경기장{' '}
                <small>
                  {facts.stadium.name ? `${facts.stadium.name} · ` : ''}
                  {number(facts.stadium.seats)}석
                </small>
              </h4>
            </section>
            <section className={s.section}>
              <h4>
                역사{' '}
                <small>
                  리그 우승 {facts.history.league}회 · 컵 우승 {facts.history.cup}회 · 유럽{' '}
                  {facts.history.europe}회
                </small>
              </h4>
              {facts.history.seasons.length > 0 && (
                <ol className={s.seasons}>
                  {facts.history.seasons.map((season) => (
                    <li key={season.year}>
                      <span>{seasonName(season.year)}</span>
                      <span>{divisionLabel(season.division)}</span>
                      <b>{season.place}위</b>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>
    </Dialog>
  );
}

/** The takeover's confirmation with the club's direction (→WEB-15, ECON-22, ECON-38). */
function TakeoverConfirm({
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
  onConfirm: (preset?: string) => void;
}) {
  // 기본 방향 shows selected; a preset fills every row of the club's direction (→ECON-22).
  const [preset, setPreset] = useState('default');
  const chosen = BUILD_PRESETS.find((item) => item.id === preset);
  const amount = (value: string) => compactMoney(value, listing.country, year);
  const indebted = BigInt(listing.debt) > 0n;
  return (
    <Dialog
      label={`${listing.name} 인수`}
      onClose={onBack}
      actions={
        <div className={s.actions}>
          <button type="button" onClick={onBack}>
            ← 구단 정보
          </button>
          <button
            type="button"
            data-ui="primary"
            disabled={blocked}
            onClick={() => onConfirm(preset === 'default' ? undefined : preset)}
          >
            {busy ? '구단을 인수하는 중…' : '인수 확정'}
          </button>
        </div>
      }
    >
      <div className={s.sheet} data-testid="takeover-confirm">
        <Verdict listing={listing} fortune={fortune} year={year} />
        <ul className={s.terms}>
          <li>선수단·감독·시설·팬·역사를 지금 모습 그대로 넘겨받아요.</li>
          <li>구단 현금 {amount(listing.cash)}은 그대로 구단에 남아요.</li>
          <li>
            {indebted
              ? `부채 ${amount(listing.debt)}는 ${TAKEOVER_DEBT.seasons}시즌 동안 연 ${Math.round(TAKEOVER_DEBT.rate * 100)}%로 나눠 갚아요. 매 라운드 고정비로 나가요.`
              : '갚아야 할 부채가 없어요.'}
          </li>
        </ul>
        <label className={s.direction}>
          구단 방향
          <Select aria-label="구단 방향" value={preset} onValueChange={setPreset}>
            <option value="default" data-hint="모든 줄이 표준 · 인수 뒤에는 바꾸지 않아요">
              기본 방향
            </option>
            {BUILD_PRESETS.map((item) => (
              <option key={item.id} value={item.id} data-hint={`${item.model} · ${item.summary}`}>
                {item.label}
              </option>
            ))}
          </Select>
        </label>
        <p className={s.note}>
          {chosen ? `${chosen.model}. ${chosen.aim}.` : '모든 줄을 표준으로 시작해요.'} 구단은 이
          방향을 커리어 내내 지켜요.
        </p>
      </div>
    </Dialog>
  );
}
