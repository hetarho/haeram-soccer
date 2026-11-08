import { message as sourceMessage } from '../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../presentation/text';
import { richMessage } from '../../presentation/LocalizedMessage';
import { useState } from 'react';
import type { World } from '../../../../../packages/contracts/src/types';
import { currency } from '../../../../../packages/catalogs/src/index';
import type { GameClient } from '../../runtime/client';
import { useGameState } from '../../runtime/store';
import { AnimatedMoney } from './AnimatedMoney';
import { Dialog } from '../../shared/ui/Dialog';
import { ClubCashSummary } from '../../entities/office';
import { OwnerSheet } from '../../entities/office';
import { compactMoney, money } from '../../presentation/format';
import { cashState } from '../../entities/player';
import s from '../../shared/ui/styles/App.module.css';
import o from '../../shared/ui/styles/OwnerSheet.module.css';

export function CashSheet({ w, onClose }: { w: World; onClose: () => void }) {
  useTextLocale();
  return (
    <Dialog
      label={displayMessage('shell.cash')}
      onClose={onClose}
      actions={
        <button data-ui="primary" onClick={onClose}>
          {richMessage('copy.stories.1aacb54c49')}
        </button>
      }
    >
      <ClubCashSummary w={w} />
    </Dialog>
  );
}

/** One HUD action shows club cash over business funds and opens their shared management dialog. */
export function HudCash({ client }: { client?: GameClient } = {}) {
  useTextLocale();
  const w = useGameState((state) => state.view?.world);
  const [open, setOpen] = useState(false);
  if (!w) return null;
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const state = cashState(w);
  const exact = money(w.cash, own.country, w.year);
  const fortuneExact = w.owner ? money(w.owner.fortune, own.country, w.year) : undefined;
  const label = sourceMessage('copy.HudCash.d6cbac6325', {
    p0: exact,
    p1: fortuneExact ? sourceMessage('copy.HudCash.5262848bba', { p0: fortuneExact }) : '',
  });
  const symbol = currency(own.country, w.year).symbol;
  const amount = (value: string) => {
    const text = compactMoney(value, own.country, w.year),
      at = text.indexOf(symbol);
    if (at < 0) return text;
    return (
      <>
        {localizeValue(text.slice(0, at))}
        <span className={s.hudCurrency} data-ui="currency">
          {localizeValue(symbol)}
        </span>
        {localizeValue(text.slice(at + symbol.length))}
      </>
    );
  };
  return (
    <>
      <button
        type="button"
        className={`${s.hudCash} ${o.combinedMoney} ${BigInt(w.cash) < 0n ? s.hudCashNegative : state.tone === 'warn' || state.tone === 'bad' ? s.hudCashWarn : ''}`}
        data-testid="hud-cash"
        data-ui="hud-money"
        title={localizeValue(label)}
        aria-label={localizeValue(label)}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.currentTarget.focus();
          setOpen(true);
        }}
      >
        <span className={o.clubBalance}>
          <small>{richMessage('copy.HudCash.5008c66043')}</small>
          <AnimatedMoney value={w.cash} format={amount} upClass={s.cashUp} downClass={s.cashDown} />
        </span>
        {localizeValue(
          w.owner && (
            <span
              className={o.businessBalance}
              data-negative={BigInt(w.owner.fortune) < 0n || undefined}
            >
              <AnimatedMoney
                value={w.owner.fortune}
                format={amount}
                className={o.businessAmount}
                upClass={s.cashUp}
                downClass={s.cashDown}
              />
            </span>
          ),
        )}
      </button>
      {localizeValue(
        open &&
          (w.owner ? (
            <OwnerSheet client={client} onClose={() => setOpen(false)} />
          ) : (
            <CashSheet w={w} onClose={() => setOpen(false)} />
          )),
      )}
    </>
  );
}
