export { SQUAD_TARGET } from './squad-size';
import type { Line, Position, World } from '../../contracts/src/types';
import { academyPlayers, promoteYouth, promotionAge } from './academy';
import { clubOf, makePlayer, overall, joinClub, refillPosition } from './world';
import { divisionStrength } from './season';
import { lineOf, POSITION_LABEL } from './player';
import { compareIds } from './primitives';
import { currentDay } from './calendar';
import { marketWage, signingClauses } from './contracts';
import { movePerson } from './npc-continuity';
import { registrationRoom } from './registration';
import { pushInbox } from './inbox';
export type CallUpSource = 'close' | 'replacement' | 'short';
const REASON: Record<CallUpSource, string> = {
  close: '시즌 마감 보충',
  replacement: '대체 영입 실패',
  short: '선수단 20명 미만',
};
/** Exceptional top-up ignores ordinary readiness and cash floor, but never registration. */
export function callUpFor(w: World, line: Line, source: CallUpSource) {
  const pool = academyPlayers(w)
    .filter((p) => w.year - p.born >= promotionAge(w))
    .sort((a, b) => overall(b) - overall(a) || b.potential - a.potential || compareIds(a.id, b.id));
  let player = pool.find((p) => lineOf(p.position) === line) ?? pool[0];
  if (player) {
    if (registrationRoom(w, { ...player, graduate: true, joined: w.year })) return undefined;
    promoteYouth(w, player.id);
  } else {
    const own = clubOf(w),
      prefix =
        source === 'close'
          ? `${own.id}:youth:${w.year}:`
          : `${own.id}:callup:${w.year}:${currentDay(w)}:`;
    let serial = 0;
    while (w.players.some((p) => p.id === `${prefix}${serial}`) || w.people?.[`${prefix}${serial}`])
      serial++;
    const suggested = refillPosition(w),
      position: Position =
        lineOf(suggested) === line
          ? suggested
          : ({ GK: 'GK', DF: 'CB', MF: 'CM', FW: 'ST' } as const)[line];
    player = makePlayer(
      own.country,
      w.seed,
      `${prefix}${serial}`,
      w.year,
      Math.max(20, Math.round(divisionStrength(w)) - 5),
      position,
      18,
      own.tier,
    );
    player.graduate = true;
    if (registrationRoom(w, { ...player, joined: w.year })) return undefined;
    player.wage = marketWage(w, player);
    player.until = w.year + 3;
    player.clauses = signingClauses(w, player);
    joinClub(player, 'academy', w.year);
    w.players.push(player);
    movePerson(w, player, w.playerClub, true);
  }
  pushInbox(w, {
    kind: 'staff-report',
    title: `유스 디렉터 콜업 · ${player.name} · ${POSITION_LABEL[player.position]}`,
    detail: `${REASON[source]} · 실제 1군 계약과 등록을 완료했어요.`,
    attention: false,
    ref: player.id,
  });
  return player;
}
