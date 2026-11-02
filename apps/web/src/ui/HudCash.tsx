import { useState } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { currency } from '../../../../packages/catalogs/src/index';
import { useLocale } from '../presentation/react';
import { useGameState } from '../runtime/store';
import { AnimatedMoney } from './AnimatedMoney';
import { Card } from './Card';
import { Dialog } from './Dialog';
import { DeskStats } from './OfficeDesk';
import { compactMoney, money } from './format';
import { cashState, fixedCosts } from './teamState';
import s from './App.module.css';

/**
 * What the cash means (→WEB-44): the balance, the fixed costs it pays and how long it lasts at
 * them, in weeks when short and months otherwise. It only explains; it offers no remedy.
 */
export function CashSheet({ w, onClose }: { w: World; onClose: () => void }) {
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const format = (value: string) => compactMoney(value, own.country, w.year);
  const state = cashState(w);
  const costs = fixedCosts(w);
  return (
    <Dialog
      label="운영 자금"
      onClose={onClose}
      actions={
        <button data-ui="primary" onClick={onClose}>
          확인
        </button>
      }
    >
      <Card
        as="section"
        surface="ticket"
        aria-label="지금 상태"
        meta={`${state.label} ${state.value} · ${state.status}${state.attention ? ' · 주의' : ''}`}
      >
        <p>
          {BigInt(w.cash) < 0n
            ? '운영 자금이 적자예요. 급여와 운영비는 그대로 계속 나가요.'
            : `급여·시설 유지·운영 경비 기준으로 ${state.value}분 자금이 있어요. 입장 수입·후원·상금처럼 앞으로 들어올 돈은 빼고 셈해요.`}
        </p>
      </Card>
      <DeskStats
        label="자금 현황"
        stats={[
          { label: '보유 현금', value: format(w.cash), note: money(w.cash, own.country, w.year) },
          { label: '다음 라운드 고정 지출', value: format(costs.nextRound) },
          { label: state.label, value: state.value, note: state.status },
        ]}
      />
      <DeskStats
        label="연간 고정비"
        stats={[
          ...costs.kinds.map(([label, amount]) => ({ label, value: format(amount) })),
          { label: '연간 합계', value: format(costs.annual) },
        ]}
      />
    </Dialog>
  );
}

/**
 * Cash is the one resource every decision spends, so it stays pinned to the top right; tapping it
 * explains the balance, the fixed costs and how long it lasts (→WEB-44).
 */
export function HudCash() {
  const { t } = useLocale();
  const w = useGameState((state) => state.view?.world);
  const [open, setOpen] = useState(false);
  if (!w) return null;
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const state = cashState(w);
  const exact = money(w.cash, own.country, w.year);
  const symbol = currency(own.country, w.year).symbol;
  // The currency symbol keeps its weight at a much smaller size than the amount.
  const amount = (value: string) => {
    const text = compactMoney(value, own.country, w.year),
      at = text.indexOf(symbol);
    if (at < 0) return text;
    return (
      <>
        {text.slice(0, at)}
        <span className={s.hudCurrency} data-ui="currency">
          {symbol}
        </span>
        {text.slice(at + symbol.length)}
      </>
    );
  };
  return (
    <>
      <button
        className={`${s.hudCash} ${BigInt(w.cash) < 0n ? s.hudCashNegative : state.tone === 'warn' || state.tone === 'bad' ? s.hudCashWarn : ''}`}
        data-testid="hud-cash"
        title={exact}
        aria-label={t('shell.cashDetails', { amount: exact, status: state.status })}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.currentTarget.focus();
          setOpen(true);
        }}
      >
        <span>
          <small>{t('shell.cash')}</small>
          {/* The money notation on every viewport (→WEB-67); the exact amount is the title. */}
          <AnimatedMoney value={w.cash} format={amount} upClass={s.cashUp} downClass={s.cashDown} />
        </span>
      </button>
      {open && <CashSheet w={w} onClose={() => setOpen(false)} />}
    </>
  );
}
