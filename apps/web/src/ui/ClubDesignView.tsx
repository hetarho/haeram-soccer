import { useState } from 'react';
import {
  CREST_PALETTE,
  DESIGN_STUDIOS,
  KIT_ROLES,
  type ClubIdentity,
  type DesignStudio,
  type IdentityColours,
} from '../../../../packages/contracts/src/identity';
import { identityOf } from '../../../../packages/engine/src/club-identity';
import { DESIGNERS, designFee, redrawFee } from '../../../../packages/engine/src/design-fees';
import type { ClientState, GameClient } from '../runtime/client';
import { gameActionsBlocked, useGameState } from '../runtime/store';
import { CrestMark } from './ClubCrest';
import { KitSwatch } from './KitSwatch';
import { Money } from './Money';
import { Segments } from './Segments';
import s from './ClubDesignView.module.css';

/**
 * 구단주 사무실 › 구단 디자인: the current design, then a change request one step at a time — the
 * main, sub and point colours, then the designer — and the drafts it sends. Adopting one or
 * throwing them all away returns to the first page.
 */

const KIT_LABEL = { home: '홈', away: '원정', third: '서드' } as const;
/** Each colour step: its name, what it paints, and whether it may be left out. */
const SLOTS = [
  ['메인', '엠블럼 바탕과 홈 유니폼에 쓰여요.'],
  ['보조', '무늬와 원정 유니폼에 쓰여요.'],
  ['포인트', '선과 장식에 쓰여요.'],
] as const;
type Step = 'home' | 0 | 1 | 2 | 'confirm';
/** A colour step's answer: a colour, `null` for 없음, or nothing yet. */
type ColourPick = string | null | undefined;

/** A design at a glance: the crest and the three shirts. */
function DesignCard({ identity, size = 48 }: { identity: ClubIdentity; size?: number }) {
  return (
    <div className={s.design}>
      <CrestMark crest={identity.crest} size={size} label="엠블럼" />
      <div className={s.kits}>
        {KIT_ROLES.map((role) => (
          <figure key={role}>
            <KitSwatch
              shirt={identity.kits[role]}
              label={`${KIT_LABEL[role]} 유니폼`}
              size={size}
            />
            <figcaption>{KIT_LABEL[role]}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/** The colours chosen so far, each named. */
function Chosen({ colours }: { colours: readonly ColourPick[] }) {
  return (
    <ul className={s.chosen} aria-label="고른 색">
      {SLOTS.map(([label], index) => (
        <li key={label}>
          <span
            className={s.chip}
            style={{ background: colours[index] ?? undefined }}
            data-empty={!colours[index] || undefined}
          />
          {label}
        </li>
      ))}
    </ul>
  );
}

/** One colour slot's palette; the optional ones start with 없음. */
function Palette({
  index,
  value,
  taken,
  disabled,
  onPick,
}: {
  index: number;
  value: ColourPick;
  taken: readonly string[];
  disabled: boolean;
  onPick: (colour: string | null) => void;
}) {
  return (
    <div className={s.palette} role="group" aria-label={`${SLOTS[index]![0]} 색`}>
      {index > 0 && (
        <button
          type="button"
          className={s.none}
          aria-pressed={value === null}
          disabled={disabled}
          onClick={() => onPick(null)}
        >
          없음
        </button>
      )}
      {CREST_PALETTE.map((colour) => (
        <button
          key={colour}
          type="button"
          className={s.swatch}
          aria-label={colour}
          aria-pressed={value === colour}
          disabled={disabled || (value !== colour && taken.includes(colour))}
          onClick={() => onPick(colour)}
        >
          <span className={s.fill} style={{ background: colour }} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

export function ClubDesignView({ state, client }: { state: ClientState; client: GameClient }) {
  const w = state.view!.world;
  const code = w.clubs.find((club) => club.id === w.playerClub)!.country;
  const applied = identityOf(w, w.playerClub);
  const readonly = useGameState((current) => current.readonly);
  const blocked = useGameState(gameActionsBlocked);
  const [step, setStep] = useState<Step>('home');
  const [colours, setColours] = useState<ColourPick[]>([]);
  const [studio, setStudio] = useState<DesignStudio>('studio');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const commission = w.designCommission;
  const busy = readonly || blocked || pending;

  const send = async (command: Parameters<GameClient['command']>[0], after?: Step) => {
    setPending(true);
    setError(undefined);
    const reply = await client.command(command);
    setPending(false);
    if (!reply?.ok) setError(client.state.error ?? '요청을 처리하지 못했어요.');
    else if (after !== undefined) setStep(after);
  };

  // Delivered drafts wait here until one is adopted or all are thrown away.
  if (commission) {
    const redraw = redrawFee(w, commission.studio);
    return (
      <section className={s.view} aria-label="구단 디자인">
        <div data-surface="panel" className={s.panel} aria-label="받은 시안">
          <h3>받은 시안</h3>
          <p className={s.note}>
            {DESIGNERS[commission.studio].label}가 보낸 시안이에요. 고르면 바로 구단 디자인이
            바뀌고, 아직 치르지 않은 경기부터 입어요.
          </p>
          <Chosen colours={commission.colours} />
          <ol className={s.drafts}>
            {commission.drafts.map((draft, index) => (
              <li key={index} className={s.draft}>
                <b>시안 {index + 1}</b>
                <DesignCard identity={draft} />
                <button
                  type="button"
                  data-ui="primary"
                  disabled={busy}
                  onClick={() => void send({ type: 'adopt-design', draft: index }, 'home')}
                >
                  이 시안으로 결정
                </button>
              </li>
            ))}
          </ol>
          <div className={s.nav}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void send({ type: 'discard-designs' }, 'home')}
            >
              전부 버리기
            </button>
            <button
              type="button"
              disabled={busy || BigInt(w.cash) < BigInt(redraw)}
              onClick={() => void send({ type: 'redraw-designs' })}
            >
              재설정 · 반값 <Money value={redraw} code={code} year={w.year} plain />
            </button>
          </div>
          {error && (
            <p className={s.warn} role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
    );
  }

  if (step === 'home')
    return (
      <section className={s.view} aria-label="구단 디자인">
        <div data-surface="panel" className={s.panel}>
          <h3>지금 디자인</h3>
          <DesignCard identity={applied} size={64} />
          <p className={s.note}>
            색만 정해서 디자이너에게 맡기면, 엠블럼과 유니폼을 시안 몇 개로 그려 와요.
          </p>
          <button
            type="button"
            data-ui="primary"
            className={s.request}
            disabled={readonly}
            onClick={() => {
              setColours([]);
              setError(undefined);
              setStep(0);
            }}
          >
            변경 의뢰
          </button>
          {readonly && <p className={s.note}>읽기 전용 상태에서는 의뢰할 수 없어요.</p>}
        </div>
      </section>
    );

  // 포인트 needs a 보조 before it, so without one that step is skipped both ways.
  const total = colours[1] === null ? 3 : 4;
  const position = step === 'confirm' ? total : step + 1;
  const back = (): Step =>
    step === 'confirm' ? (colours[1] ? 2 : 1) : step === 0 ? 'home' : ((step - 1) as Step);
  const next = (): Step =>
    step === 2 || (step === 1 && colours[1] === null)
      ? 'confirm'
      : (((step as number) + 1) as Step);
  const header = (
    <div className={s.stepHead}>
      <span className={s.count}>
        {position} / {total}
      </span>
      <Chosen colours={colours} />
    </div>
  );

  if (step === 'confirm') {
    const fee = designFee(w, studio);
    const short = BigInt(w.cash) < BigInt(fee);
    const chosen = colours.filter((colour) => typeof colour === 'string') as IdentityColours;
    return (
      <section className={s.view} aria-label="구단 디자인">
        <div data-surface="panel" className={s.panel}>
          {header}
          <h3>디자이너</h3>
          <Segments
            label="디자이너"
            options={DESIGN_STUDIOS.map((id) => [id, DESIGNERS[id].label] as const)}
            value={studio}
            onChange={setStudio}
          />
          <p className={s.terms}>
            의뢰비 <Money value={fee} code={code} year={w.year} /> · 시안{' '}
            <b>{DESIGNERS[studio].drafts}개</b>
          </p>
          <p className={s.ask}>이대로 요청할까요?</p>
          {short && <p className={s.warn}>운영 자금이 의뢰비보다 적어요.</p>}
          {error && (
            <p className={s.warn} role="alert">
              {error}
            </p>
          )}
          <div className={s.nav}>
            <button type="button" disabled={pending} onClick={() => setStep(back())}>
              아니요
            </button>
            <button
              type="button"
              data-ui="primary"
              disabled={busy || short}
              onClick={() => void send({ type: 'design-commission', studio, colours: chosen })}
            >
              {pending ? '요청하는 중…' : '예'}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const [label, hint] = SLOTS[step]!;
  return (
    <section className={s.view} aria-label="구단 디자인">
      <div data-surface="panel" className={s.panel}>
        {header}
        <h3>{label} 색을 골라 주세요</h3>
        <p className={s.note}>
          {hint}
          {step > 0 && ' 없어도 돼요.'}
        </p>
        <Palette
          index={step}
          value={colours[step]}
          taken={colours.filter(
            (colour, at): colour is string => typeof colour === 'string' && at !== step,
          )}
          disabled={busy}
          onPick={(colour) =>
            setColours((current) => {
              const picked = [...current];
              picked[step] = colour;
              // Colours fill from the front: 보조 없음 takes the 포인트 with it.
              if (step === 1 && colour === null) picked[2] = undefined;
              return picked;
            })
          }
        />
        <div className={s.nav}>
          <button type="button" onClick={() => setStep(back())}>
            {step === 0 ? '취소' : '이전'}
          </button>
          <button
            type="button"
            data-ui="primary"
            disabled={colours[step] === undefined}
            onClick={() => setStep(next())}
          >
            다음
          </button>
        </div>
      </div>
    </section>
  );
}
