import { worldMarketOffer } from './world-market';
import { registrationRoom } from './registration';
import type { Command, Player, World } from '../../contracts/src/types';
import { addEvent } from './events';
import { recordTransfer } from './transfer-records';
import { fanMoodTransfer } from './fan-mood';
import { declineContract, offerContract, signingClauses } from './contracts';
import { moneyLabel } from './finance';
import { promoteYouth, releaseYouth } from './academy';
import { placeBid, respondBid, setTransferStance } from './transfers';
import { assertTransferWindow } from './transfer-window';
import { noteSigning } from './signings';
import { debit } from './transactions';
import { takeFreeAgent } from './free-agents';
import { transferOffers } from './scout-search';

/** Bids, offers, stances, the academy and contract talks. */
export type SquadCommand = Extract<
  Command,
  {
    type:
      | 'bid'
      | 'respond-bid'
      | 'recruit'
      | 'transfer-stance'
      | 'promote-youth'
      | 'release-youth'
      | 'contract-offer'
      | 'contract-decline';
  }
>;

/**
 * A free agent signs at once (→CLUB-4, →CLUB-49): he leaves the pool and joins on the offer's
 * terms with his signing's clauses (→CLUB-29); a former player of ours returns to his own row
 * with his career. The caller has checked registration and the window.
 */
export function signFreeAgent(w: World, offer: { player: Player }): Player {
  if (!takeFreeAgent(w, offer.player.id)) throw new Error('이미 계약했거나 없는 선수입니다.');
  const p = structuredClone(offer.player);
  p.clauses = signingClauses(w, p);
  const prior = w.players.findIndex((row) => row.id === p.id);
  if (prior >= 0) {
    p.career = [...w.players[prior]!.career];
    if (w.players[prior]!.graduate) p.graduate = true;
    w.players[prior] = p;
  } else w.players.push(p);
  noteSigning(w, p);
  return p;
}
export function squadCommand(w: World, cmd: SquadCommand) {
  switch (cmd.type) {
    case 'contract-offer':
      offerContract(w, cmd.player, cmd.wage, cmd.term);
      break;
    case 'contract-decline':
      declineContract(w, cmd.player);
      break;
    case 'promote-youth':
      promoteYouth(w, cmd.id);
      break;
    case 'release-youth':
      releaseYouth(w, cmd.id);
      break;
    case 'bid': {
      const target = cmd.target ?? cmd.candidate;
      if (target === undefined || (cmd.target && cmd.candidate !== undefined))
        throw new Error('영입 대상을 확인하세요.');
      placeBid(w, target, cmd.fee, cmd.loan);
      break;
    }
    case 'respond-bid':
      respondBid(w, cmd.id, cmd.accept);
      break;
    case 'recruit': {
      if ((cmd.candidate === undefined) === (cmd.target === undefined))
        throw new Error('영입 대상을 확인하세요.');
      const o = cmd.target ? worldMarketOffer(w, cmd.target) : transferOffers(w)[cmd.candidate!];
      if (!o?.available) throw new Error('이미 계약했거나 없는 선수입니다.');
      // Another club's player joins only through a negotiated bid, at his asking fee (→CLUB-4).
      if (!o.freeAgent) {
        placeBid(w, cmd.target ?? cmd.candidate!, cmd.loan ? o.loanFee : o.fee, cmd.loan);
        break;
      }
      if (cmd.loan) throw new Error('자유계약 선수는 임대하지 않고 바로 영입해요.');
      const room = registrationRoom(w, { ...o.player, joined: w.year });
      if (room) throw new Error(room);
      assertTransferWindow(w, true);
      // No fee, yet a club already in debt signs nobody, as the preview says.
      debit(w, o.fee);
      const p = signFreeAgent(w, o);
      // A free agent costs nothing and keeps no fee fact (→HIST-20).
      const fact = recordTransfer(w, { direction: 'in', loan: false, player: p, fee: '0' });
      if (fact) fanMoodTransfer(w, fact);
      addEvent(
        w,
        'transfer-in',
        `${p.name} 영입`,
        `${p.position} · ${w.year - p.born}세 · 연봉 ${moneyLabel(w, p.wage)} · 계약 ${p.until}년 · 자유계약`,
        '0',
      );
      break;
    }
    case 'transfer-stance':
      setTransferStance(w, cmd.id, cmd.stance);
      break;
  }
}
