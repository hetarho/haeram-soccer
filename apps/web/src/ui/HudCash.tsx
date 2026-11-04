import { useState } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { currency } from '../../../../packages/catalogs/src/index';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { AnimatedMoney } from './AnimatedMoney';
import { Dialog } from './Dialog';
import { ClubCashSummary } from './ClubCashSummary';
import { OwnerSheet } from './OwnerSheet';
import { compactMoney, money } from './format';
import { cashState } from './teamState';
import s from './App.module.css';
import o from './OwnerSheet.module.css';

export function CashSheet({ w, onClose }: { w: World; onClose: () => void }) {
  return (
    <Dialog label="운영 자금" onClose={onClose} actions={
      <button data-ui="primary" onClick={onClose}>확인</button>
    }>
      <ClubCashSummary w={w} />
    </Dialog>
  );
}

/** One HUD action shows club cash over business funds and opens their shared management dialog. */
export function HudCash({ client }: { client?: GameClient } = {}) {
  const w = useGameState((state) => state.view?.world);
  const [open, setOpen] = useState(false);
  if (!w) return null;
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const state = cashState(w);
  const exact = money(w.cash, own.country, w.year);
  const fortuneExact = w.owner ? money(w.owner.fortune, own.country, w.year) : undefined;
  const label = `구단 자금 ${exact}${fortuneExact ? ` · 사업자금 ${fortuneExact}` : ''} · 자금 관리`;
  const symbol = currency(own.country, w.year).symbol;
  const amount = (value: string) => {
    const text = compactMoney(value, own.country, w.year), at = text.indexOf(symbol);
    if (at < 0) return text;
    return <>{text.slice(0, at)}<span className={s.hudCurrency} data-ui="currency">{symbol}</span>{text.slice(at + symbol.length)}</>;
  };
  return (
    <>
      <button
        type="button"
        className={`${s.hudCash} ${o.combinedMoney} ${BigInt(w.cash) < 0n ? s.hudCashNegative : state.tone === 'warn' || state.tone === 'bad' ? s.hudCashWarn : ''}`}
        data-testid="hud-cash"
        data-ui="hud-money"
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.currentTarget.focus();
          setOpen(true);
        }}
      >
        <span className={o.clubBalance}>
          <small>구단 자금</small>
          <AnimatedMoney value={w.cash} format={amount} upClass={s.cashUp} downClass={s.cashDown} />
        </span>
        {w.owner && (
          <span className={o.businessBalance} data-negative={BigInt(w.owner.fortune) < 0n || undefined}>
            <AnimatedMoney value={w.owner.fortune} format={amount} className={o.businessAmount} upClass={s.cashUp} downClass={s.cashDown} />
          </span>
        )}
      </button>
      {open && (w.owner
        ? <OwnerSheet client={client} onClose={() => setOpen(false)} />
        : <CashSheet w={w} onClose={() => setOpen(false)} />)}
    </>
  );
}
