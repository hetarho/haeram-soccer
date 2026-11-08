import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { openStaff } from '../../../shared/routing/state';
import type { Line, ScoutOffer, World } from '../../../../../../packages/contracts/src/types';
import { nextShortlistDraw } from '../../../../../../packages/engine/src/signings';
import { seasonDayLabel } from '../../../../../../packages/engine/src/calendar';
import { staffMember } from '../../../../../../packages/engine/src/staff-info';
import { clubOf, overall } from '../../../../../../packages/engine/src/player-state';
import { ClubLink } from '../../../entities/club';
import { clubDivision } from '../../../entities/league';
import { Money } from '../../../shared/ui/Money';
import { OvrBadge } from '../../../entities/player';
import {
  type CandidateOrigin,
  REQUEST_WHY,
  requestName,
  requestStakes,
  LINE_NAMES,
  shortlistRows,
} from '../lib/shortlist';
import s from './ScoutShortlist.module.css';

/**
 * Where a candidate is (→CLUB-50): 자유계약 · 이적료 없음, or his club as a link with its asking
 * fee, marked 해외 when he was found abroad (→CLUB-51). `division` names the club's division after
 * it; `fee` off leaves the fee to a column of its own.
 */
export function CandidateSource({
  w,
  origin,
  division = false,
  fee = true,
}: {
  w: World;
  origin: CandidateOrigin;
  division?: boolean;
  fee?: boolean;
}) {
  useTextLocale();
  const club = clubOf(w);
  const at = origin.kind === 'club' ? w.clubs.find((c) => c.id === origin.club) : undefined;
  const link = origin.kind === 'club' && <ClubLink w={w} id={origin.club} crest={12} />;
  const named =
    division && at ? (
      <>
        {localizeValue(link)} · {localizeValue(clubDivision(w, at))}
      </>
    ) : (
      link
    );
  return (
    <span className={s.source} data-source={origin.kind}>
      {localizeValue(
        origin.kind === 'free'
          ? richMessage('market.source.free')
          : fee
            ? richMessage('market.source.club', {
                club: named,
                fee: <Money value={origin.fee} code={club.country} year={w.year} plain />,
              })
            : named,
      )}
      {localizeValue(
        origin.abroad && <i className={s.abroad}>{richMessage('market.source.abroad')}</i>,
      )}
    </span>
  );
}

/**
 * 스카우트 명단 at the end of 이적시장 (→WEB-43, →CLUB-33): the chief scout's candidates by role
 * with the day they were drawn and the next draw, each with where he is (→CLUB-50), the manager's
 * requests with his picks marked 감독 지목, and what an unmet request costs while a window is
 * open. A tap opens the candidate as the market list would.
 */
export function ScoutShortlist({
  w,
  offers,
  disabled,
  onOpen,
}: {
  w: World;
  offers: readonly ScoutOffer[];
  disabled: boolean;
  onOpen: (index: number) => void;
}) {
  useTextLocale();
  const rows = shortlistRows(w, offers),
    club = clubOf(w),
    scout = staffMember(w, 'scout'),
    next = nextShortlistDraw(w),
    nextYear = next.year === w.year;
  const cash = (value: string) => <Money value={value} code={club.country} year={w.year} plain />;
  return (
    <section
      data-surface="sheet"
      className={s.shortlist}
      aria-label={displayMessage('copy.ScoutShortlist.bf10a7311b')}
    >
      <header>
        <h3>{richMessage('copy.ScoutShortlist.bf10a7311b')}</h3>
        <small>
          {localizeValue(
            scout
              ? sourceMessage('copy.ScoutShortlist.18add3466e', { p0: scout.name })
              : sourceMessage('copy.ScoutShortlist.2f4b1316d3'),
          )}
          {localizeValue(
            w.shortlist && w.shortlist.year === w.year
              ? sourceMessage('copy.ScoutShortlist.39a6db778e', {
                  p0: seasonDayLabel(w.shortlist.year, w.shortlist.day),
                })
              : '',
          )}
          {displayMessage('copy.ScoutShortlist.a3a602aa53')}
          {localizeValue(
            nextYear
              ? seasonDayLabel(next.year, next.day)
              : sourceMessage('copy.ScoutShortlist.caa454450d'),
          )}
        </small>
      </header>
      {localizeValue(
        rows.some((row) => row.entries.length) ? (
          rows.map(
            (row) =>
              row.entries.length > 0 && (
                <div
                  key={row.line}
                  className={s.role}
                  role="group"
                  aria-label={localizeValue(LINE_NAMES[row.line])}
                >
                  <h4>
                    {localizeValue(LINE_NAMES[row.line])}
                    {localizeValue(
                      row.request && (
                        <em>
                          {richMessage('copy.ScoutShortlist.7961c88918', {
                            p0: REQUEST_WHY[row.request.kind],
                          })}
                        </em>
                      ),
                    )}
                  </h4>
                  {localizeValue(
                    row.entries.map(({ index, offer, origin, pick }) => (
                      <div key={offer.player.id} className={s.entry}>
                        <button
                          data-ui="navigation"
                          data-surface="detail"
                          type="button"
                          className={pick ? `${s.open} ${s.picked}` : s.open}
                          disabled={disabled}
                          data-testid={`shortlist-${offer.player.id}`}
                          onClick={() => onOpen(index)}
                        >
                          <OvrBadge value={overall(offer.player)} role={offer.player.position} />
                          <span className={s.who}>
                            <b>
                              {offer.player.name}
                              {localizeValue(
                                pick && (
                                  <i className={s.pickTag}>
                                    {richMessage('copy.ScoutShortlist.5e6082ac28')}
                                  </i>
                                ),
                              )}
                            </b>
                            <small>
                              {richMessage('copy.ScoutShortlist.1489be8297', {
                                p0: offer.player.position,
                                p1: LINE_NAMES[row.line],
                                p2: ' ',
                                p3: Math.round(offer.player.potential),
                                p4: w.year - offer.player.born,
                              })}
                            </small>
                          </span>
                          <span className={s.money}>
                            <small>
                              {richMessage('copy.ScoutShortlist.572ddadbfc', {
                                p0: cash(offer.player.wage),
                              })}
                            </small>
                          </span>
                        </button>
                        <small className={s.entrySource}>
                          <CandidateSource w={w} origin={origin} />
                        </small>
                      </div>
                    )),
                  )}
                </div>
              ),
          )
        ) : (
          <p className={s.empty}>{richMessage('copy.ScoutShortlist.eac5ec9bcd')}</p>
        ),
      )}
    </section>
  );
}

export function RecruitmentNeeds({
  w,
  offers,
  onRole,
}: {
  w: World;
  offers: readonly ScoutOffer[];
  onRole: (line: Line) => void;
}) {
  useTextLocale();
  const rows = shortlistRows(w, offers),
    requests = rows.flatMap((row) => (row.request ? [{ ...row, request: row.request }] : [])),
    stakes = requestStakes(w),
    scout = staffMember(w, 'scout'),
    pickName = (id?: string) => offers.find((offer) => offer.player.id === id)?.player.name;
  return (
    <section
      data-surface="sheet"
      className={s.shortlist}
      aria-label={displayMessage('copy.ScoutShortlist.b6a1733ed8')}
    >
      <header>
        <h3>{richMessage('copy.ScoutShortlist.052d96e3c0')}</h3>
        <button data-ui="tertiary" type="button" onClick={() => openStaff('scout')}>
          {richMessage('copy.ScoutShortlist.ae9b819a3b', {
            p0: scout?.name ?? sourceMessage('team.vacant'),
          })}
        </button>
      </header>
      <div
        data-surface="sheet"
        className={s.requests}
        aria-label={displayMessage('copy.MediationReview.22d1aca95a')}
        role="group"
      >
        <b>{richMessage('copy.MediationReview.22d1aca95a')}</b>
        {localizeValue(
          requests.length ? (
            <ul>
              {localizeValue(
                requests.map(({ line, request }) => (
                  <li key={line} data-kind={request.kind}>
                    <button data-ui="tertiary" type="button" onClick={() => onRole(line)}>
                      {richMessage('copy.ScoutShortlist.3a23db62b1', {
                        p0: REQUEST_WHY[request.kind],
                      })}
                    </button>
                    <span>
                      {localizeValue(
                        request.position
                          ? sourceMessage('copy.ScoutShortlist.28670cb5ca', {
                              p0: requestName(request),
                            })
                          : LINE_NAMES[line],
                      )}
                      {localizeValue(
                        request.pick && (
                          <small>
                            {richMessage('copy.ScoutShortlist.b4fae5344f', {
                              p0: pickName(request.pick),
                            })}
                          </small>
                        ),
                      )}
                    </span>
                  </li>
                )),
              )}
            </ul>
          ) : (
            <small>
              {localizeValue(
                w.manager.interim
                  ? sourceMessage('copy.ScoutShortlist.24ef651b35')
                  : sourceMessage('copy.ScoutShortlist.ab35cca4b5'),
              )}
            </small>
          ),
        )}
        {localizeValue(
          stakes && (
            <p className={s.stakes} data-testid="request-stakes">
              {localizeValue(stakes)}
            </p>
          ),
        )}
      </div>
    </section>
  );
}
