import type { World } from '../../../../packages/contracts/src/types';
import { nextShortlistDraw } from '../../../../packages/engine/src/signings';
import { seasonDayLabel } from '../../../../packages/engine/src/calendar';
import { staffMember } from '../../../../packages/engine/src/staff';
import { clubOf, overall } from '../../../../packages/engine/src/world';
import type { TransferOffer } from '../../../../packages/engine/src/recruitment';
import { Money } from './Money';
import { OvrBadge } from './OvrBadge';
import { REQUEST_WHY, requestStakes, LINE_NAMES, shortlistRows } from './shortlist';
import s from './ScoutShortlist.module.css';

/**
 * 스카우트 명단 at the end of 이적시장 (→WEB-43, →CLUB-33): the chief scout's candidates by role
 * with the day they were drawn and the next draw, the manager's requests with his picks marked
 * 감독 지목, and what an unmet request costs while a window is open. A tap opens the candidate as
 * the market list would.
 */
export function ScoutShortlist({
  w,
  offers,
  disabled,
  onOpen,
}: {
  w: World;
  offers: readonly TransferOffer[];
  disabled: boolean;
  onOpen: (index: number) => void;
}) {
  const rows = shortlistRows(w, offers),
    club = clubOf(w),
    scout = staffMember(w, 'scout'),
    next = nextShortlistDraw(w),
    stakes = requestStakes(w),
    requests = rows.flatMap((row) => (row.request ? [{ ...row, request: row.request }] : [])),
    pickName = (id?: string) => offers.find((offer) => offer.player.id === id)?.player.name;
  const cash = (value: string) => <Money value={value} code={club.country} year={w.year} plain />;
  return (
    <section className={s.shortlist} aria-label="스카우트 명단">
      <header>
        <h3>스카우트 명단</h3>
        <small>
          {scout ? `수석 스카우트 ${scout.name}` : '수석 스카우트 공석'}
          {w.shortlist && w.shortlist.year === w.year
            ? ` · ${seasonDayLabel(w.shortlist.year, w.shortlist.day)} 작성`
            : ''}
          {' · 다음 '}
          {next.year === w.year ? seasonDayLabel(next.year, next.day) : '다음 시즌 개막일'}
        </small>
      </header>
      <div className={s.requests} aria-label="감독 요청" role="group">
        <b>감독 요청</b>
        {requests.length ? (
          <ul>
            {requests.map(({ line, request }) => (
              <li key={line} data-kind={request.kind}>
                <span className={s.why}>{REQUEST_WHY[request.kind]}</span>
                <span>
                  {LINE_NAMES[line]}
                  {request.pick && <small> · 감독 지목 {pickName(request.pick)}</small>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <small>
            {w.manager.interim
              ? '임시 감독은 영입을 요청하지 않아요.'
              : '지금은 감독이 요청한 자리가 없어요.'}
          </small>
        )}
        {stakes && (
          <p className={s.stakes} data-testid="request-stakes">
            {stakes}
          </p>
        )}
      </div>
      {rows.some((row) => row.entries.length) ? (
        rows.map(
          (row) =>
            row.entries.length > 0 && (
              <div key={row.line} className={s.role} role="group" aria-label={LINE_NAMES[row.line]}>
                <h4>
                  {LINE_NAMES[row.line]}
                  {row.request && <em>감독 요청 · {REQUEST_WHY[row.request.kind]}</em>}
                </h4>
                {row.entries.map(({ index, offer, pick }) => (
                  <button
                    key={offer.player.id}
                    type="button"
                    className={pick ? s.picked : undefined}
                    disabled={disabled}
                    data-testid={`shortlist-${offer.player.id}`}
                    onClick={() => onOpen(index)}
                  >
                    <OvrBadge value={overall(offer.player)} role={offer.player.position} />
                    <span className={s.who}>
                      <b>
                        {offer.player.name}
                        {pick && <i className={s.pickTag}>감독 지목</i>}
                      </b>
                      <small>
                        POT {Math.round(offer.player.potential)} · {w.year - offer.player.born}세
                      </small>
                    </span>
                    <span className={s.money}>
                      <b>{offer.freeAgent ? '자유계약' : cash(offer.fee)}</b>
                      <small>연봉 {cash(offer.player.wage)}</small>
                    </span>
                  </button>
                ))}
              </div>
            ),
        )
      ) : (
        <p className={s.empty}>명단에 남은 후보가 없어요. 다음 작성 때 다시 채워요.</p>
      )}
    </section>
  );
}
