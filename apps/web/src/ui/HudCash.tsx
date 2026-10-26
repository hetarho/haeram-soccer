import { useState } from 'react';
import { useLocale } from '../presentation/react';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { AnimatedMoney } from './AnimatedMoney';
import { compactMoney, money } from './format';
import { RemedySheet } from './RemedySheet';
import { cashState } from './teamState';
import s from './App.module.css';

/**
 * Cash is the one resource every decision spends, so it stays pinned to the top right; tapping it
 * shows how long it lasts and the ways to raise or save money (→WEB-44).
 */
export function HudCash({ client }: { client?: GameClient }) {
  const { t } = useLocale();
  const w = useGameState((state) => state.view?.world);
  const [open, setOpen] = useState(false);
  if (!w) return null;
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const state = cashState(w);
  const exact = money(w.cash, own.country, w.year);
  return (
    <>
      <button
        className={`${s.hudCash} ${BigInt(w.cash) < 0n ? s.hudCashNegative : state.tone === 'warn' || state.tone === 'bad' ? s.hudCashWarn : ''}`}
        data-testid="hud-cash"
        title={exact}
        aria-label={t('shell.cashDetails', { amount: exact, status: state.status })}
        disabled={!client}
        onClick={(event) => {
          event.currentTarget.focus();
          setOpen(true);
        }}
      >
        <span>
          <small>{t('shell.cash')}</small>
          {/* The money notation on every viewport (→WEB-67); the exact amount is the title. */}
          <AnimatedMoney
            value={w.cash}
            format={(value) => compactMoney(value, own.country, w.year)}
            upClass={s.cashUp}
            downClass={s.cashDown}
          />
        </span>
      </button>
      {open && client && (
        <RemedySheet w={w} client={client} state="cash" onClose={() => setOpen(false)} />
      )}
    </>
  );
}
