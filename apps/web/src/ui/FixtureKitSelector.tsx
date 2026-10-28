import { useEffect, useState } from 'react';
import {
  KIT_ROLES,
  type KitRole,
  type MatchAppearance,
} from '../../../../packages/contracts/src/identity';
import type { Fixture, World } from '../../../../packages/contracts/src/types';
import { fixtureDate, nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { identityOf } from '../../../../packages/engine/src/club-identity';
import { KIT_FIXTURE_CHANGED } from '../../../../packages/engine/src/identity-operations';
import { appearanceForFixture } from '../../../../packages/engine/src/match-appearance';
import type { GameClient } from '../runtime/client';
import { gameActionsBlocked, gameStore, useGameState } from '../runtime/store';
import { ownSeasonFixtures } from './fixtures';
import { competitionLabel } from './format';
import { KIT_ROLE_LABELS } from './identityPreview';
import { KitPitchPreview } from './KitPitchPreview';
import { KitSwatch } from './KitSwatch';
import { matchLook } from './matchAppearance';
import { worldSelector } from './liveState';
import s from './FixtureKitSelector.module.css';

/**
 * KIT-6/7/8, WEB-88: our shirt for the named next fixture, chosen in preparation
 * (spec/ssot/KIT.md). Choosing a role only redraws the preview; the one
 * `match-kit` command names the fixture the preview showed, and the selector never touches tactic
 * or lineup drafts.
 */

/** Our side in `fixture`: 0 at home, 1 away. */
export const ownSideOf = (w: Pick<World, 'playerClub'>, fixture: Fixture): 0 | 1 =>
  fixture.home === w.playerClub ? 0 : 1;

/** The role the owner chose for `fixture`, or `null` while it is left to automatic selection. */
export const storedKitRole = (w: Pick<World, 'kitChoice'>, fixture: Fixture | undefined) =>
  fixture && w.kitChoice?.fixtureId === fixture.id ? w.kitChoice.role : null;

/**
 * What `fixture` would be recorded wearing with our role forced to `role` on our actual side, or
 * with automatic selection for `null` (the unrestricted recommendation, whatever is stored). It is
 * the same `appearanceForFixture` settlement captures, so the preview is the recorded appearance;
 * the world itself is not changed.
 */
export function fixtureKitAppearance(
  w: World,
  fixture: Fixture,
  role: KitRole | null,
): MatchAppearance {
  return appearanceForFixture(
    { ...w, kitChoice: role ? { fixtureId: fixture.id, role } : undefined },
    fixture,
  );
}

const nameOf = (w: World, id: string) => w.clubs.find((club) => club.id === id)?.name ?? id;
/** The fixture as preparation names it: date, competition, both clubs and our venue. */
export function fixtureKitContext(w: World, fixture: Fixture) {
  return `${fixtureDate(w, fixture)} · ${competitionLabel(w, fixture)} · ${nameOf(w, fixture.home)} 대 ${nameOf(w, fixture.away)} · 우리 ${ownSideOf(w, fixture) === 0 ? '홈' : '원정'} 경기`;
}

export interface FixtureKitViewProps {
  w: World;
  fixture: Fixture | undefined;
  /** The role in the preview; `null` shows automatic selection. */
  role: KitRole | null;
  /** No choice can be committed: a command in flight, an error, a critical alert or read-only. */
  disabled: boolean;
  /** Local kit previews remain available while calendar play locks commitment. */
  previewDisabled?: boolean;
  readonly: boolean;
  /** Why the preview started again, after the next fixture changed under it. */
  notice: string;
  /** The last commit's outcome or error. */
  message: string;
  onSelect(role: KitRole): void;
  onConfirm(): void;
  onAutomatic(): void;
}

/** The selector's content for one world and draft; the container owns the draft and commands. */
export function FixtureKitView({
  w,
  fixture,
  role,
  disabled,
  previewDisabled = disabled,
  readonly,
  notice,
  message,
  onSelect,
  onConfirm,
  onAutomatic,
}: FixtureKitViewProps) {
  // A settled or historical match is never offered: only the calendar's next own fixture is.
  if (!fixture)
    return (
      <p className={s.empty} data-testid="fixture-kit">
        다음 경기 유니폼은 새 경기 일정이 나오면 고를 수 있어요. 그때까지는 자동으로 골라요.
      </p>
    );
  const own = ownSideOf(w, fixture);
  const stored = storedKitRole(w, fixture);
  // Our saved designs, exactly as the selector reads them; a choice never repaints one.
  const { kits } = identityOf(w, w.playerClub);
  const names: [string, string] = [nameOf(w, fixture.home), nameOf(w, fixture.away)];
  const recommended = fixtureKitAppearance(w, fixture, null);
  const automatic = recommended.sides[own].role;
  const preview = role ? fixtureKitAppearance(w, fixture, role) : recommended;
  const look = matchLook({ home: fixture.home, away: fixture.away, appearance: preview });
  const elsewhere =
    w.kitChoice && w.kitChoice.fixtureId !== fixture.id
      ? ownSeasonFixtures(w).find((f) => f.id === w.kitChoice!.fixtureId)
      : undefined;
  return (
    <details className={s.disclosure} data-testid="fixture-kit" data-fixture-id={fixture.id}>
      <summary data-testid="fixture-kit-summary">
        다음 경기 유니폼 · 우리 {KIT_ROLE_LABELS[stored ?? automatic]} ·{' '}
        {stored ? '직접 고름' : '자동'}
      </summary>
      <section className={s.content} aria-label="다음 경기 유니폼 선택">
        <p className={s.context} data-testid="fixture-kit-context">
          {fixtureKitContext(w, fixture)}
        </p>
        {notice && <p className={s.notice}>{notice}</p>}
        <div className={s.pair} role="group" aria-label="미리보기 속 두 팀 유니폼과 골키퍼">
          {preview.sides.map((side, i) => (
            <div key={side.club} className={s.side}>
              <KitSwatch
                shirt={side.shirt}
                kit={look.sides[i].kit}
                label={`${names[i]} ${KIT_ROLE_LABELS[side.role]} 유니폼`}
                size={40}
                number={10}
              />
              <KitSwatch
                shirt={look.sides[i].keeper}
                kit={look.sides[i].keeperKit}
                label={`${names[i]} 골키퍼 착용 색 ${side.goalkeeper}`}
                size={40}
                number={1}
              />
              <span>
                <b>{names[i]}</b>
                <small>
                  {i === 0 ? '홈' : '원정'} · {KIT_ROLE_LABELS[side.role]} 유니폼
                </small>
              </span>
            </div>
          ))}
        </div>
        {look.sides[own].keeperFallback && (
          <p className={s.notice} role="status" data-testid="fixture-kit-keeper-fallback">
            우리 골키퍼 유니폼이 이번 경기의 다른 유니폼과 비슷해요. 이번 경기만 자동 색{' '}
            {look.sides[own].keeperKit.shirt.primary}으로 대체해요. 저장한 골키퍼 디자인은
            그대로예요.
          </p>
        )}
        <p className={s.note} data-testid="fixture-kit-recommendation">
          자동 추천: 우리 {KIT_ROLE_LABELS[automatic]} 유니폼 · 상대{' '}
          {KIT_ROLE_LABELS[recommended.sides[1 - own].role]} 유니폼
          {recommended.warnings.length
            ? '. 저장된 조합이 모두 비슷해 가장 잘 구분되는 조합을 골랐어요.'
            : ''}
        </p>
        <p className={s.note} data-testid="fixture-kit-state">
          {stored
            ? `정해 둔 유니폼: ${KIT_ROLE_LABELS[stored]}. 이 경기에만 입고, 다음 경기부터 다시 자동으로 골라요.`
            : `지금은 자동 선택이에요 (${KIT_ROLE_LABELS[automatic]} 유니폼).`}
          {role && role !== stored
            ? ` 미리보기: ${KIT_ROLE_LABELS[role]} 유니폼 · 아직 정하지 않았어요.`
            : ''}
        </p>
        <div className={s.roles} role="radiogroup" aria-label="이 경기 우리 유니폼">
          {KIT_ROLES.map((kit) => (
            <button
              key={kit}
              type="button"
              role="radio"
              aria-checked={role === kit}
              aria-label={`우리 ${KIT_ROLE_LABELS[kit]} 유니폼`}
              disabled={previewDisabled}
              onClick={() => onSelect(kit)}
            >
              <KitSwatch
                shirt={kits[kit]}
                label={`우리 ${KIT_ROLE_LABELS[kit]} 유니폼`}
                size={28}
              />
              <span>{KIT_ROLE_LABELS[kit]}</span>
              {(kit === automatic || kit === stored) && (
                <small>{kit === stored ? '정해 둠' : '자동 추천'}</small>
              )}
            </button>
          ))}
        </div>
        {role && preview.warnings.length > 0 && (
          <p className={s.warning} data-testid="fixture-kit-warning">
            이 조합은 구분하기 어려울 수 있어요.{' '}
            {automatic !== role
              ? `더 잘 구분되는 ${KIT_ROLE_LABELS[automatic]} 유니폼을 추천해요.`
              : '더 잘 구분되는 저장 유니폼이 없어요.'}{' '}
            그래도 이 유니폼으로 정할 수 있어요.
          </p>
        )}
        <KitPitchPreview appearance={preview} labels={names} />
        {elsewhere && (
          <p className={s.note}>
            {fixtureKitContext(w, elsewhere)}에 {KIT_ROLE_LABELS[w.kitChoice!.role]} 유니폼을 정해
            뒀어요. 이 경기 유니폼을 정하면 그 선택은 자동으로 돌아가요.
          </p>
        )}
        <div className={s.actions}>
          <button
            data-ui="primary"
            type="button"
            className={s.confirm}
            disabled={disabled || !role || role === stored}
            onClick={onConfirm}
          >
            이 유니폼으로 정하기
          </button>
          <button type="button" disabled={disabled || (!stored && !role)} onClick={onAutomatic}>
            자동 선택으로 되돌리기
          </button>
        </div>
        {readonly && <p className={s.note}>읽기 전용 탭에서는 유니폼을 정할 수 없어요.</p>}
        <p className={s.message} aria-live="polite" data-testid="fixture-kit-message">
          {message}
        </p>
      </section>
    </details>
  );
}

const selectKitWorld = worldSelector([
  'kitChoice',
  'fixtures',
  'cups',
  'europe',
  'clubs',
  'playerClub',
  'year',
  'round',
]);

/**
 * WEB-88: mounted by preparation once queued work has settled. It reads the world itself, so a
 * stored choice, a newly drawn tie or a played match shows at once; when the next fixture changes
 * under the preview, the draft starts again from that fixture instead of moving to it.
 */
export function FixtureKitSelector({ client, blocked }: { client: GameClient; blocked: boolean }) {
  const w = useGameState(selectKitWorld);
  const actionBlocked = useGameState(gameActionsBlocked);
  const previewBlocked = useGameState((state) => gameActionsBlocked(state, { preview: true }));
  const readonly = useGameState((state) => state.readonly);
  const fixture = w ? nextOwnFixture(w) : undefined;
  // The previewed fixture and role; `pending` while the role differs from what is stored for it.
  const [draft, setDraft] = useState(() => ({
    fixtureId: fixture?.id,
    role: w ? storedKitRole(w, fixture) : null,
    pending: false,
  }));
  const [notice, setNotice] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const stale = draft.fixtureId !== fixture?.id;
  const unapplied = draft.pending ? draft.role : null;
  useEffect(() => {
    if (!stale || !w) return;
    setDraft({ fixtureId: fixture?.id, role: storedKitRole(w, fixture), pending: false });
    setNotice(
      [
        fixture
          ? `다음 경기가 바뀌었어요: ${fixtureKitContext(w, fixture)}.`
          : '다음 경기 일정이 없어요.',
        unapplied &&
          `고르던 ${KIT_ROLE_LABELS[unapplied]} 유니폼은 적용하지 않았어요.${fixture ? ' 이 경기 기준으로 다시 골라 주세요.' : ''}`,
      ]
        .filter(Boolean)
        .join(' '),
    );
  }, [stale, w, fixture, unapplied]);
  if (!w) return null;

  const submit = async (role: KitRole | null) => {
    if (!fixture || stale || sending || blocked || actionBlocked) return;
    // The fixture the preview showed, never whichever one is next when the command runs.
    const fixtureId = fixture.id;
    setSending(true);
    setMessage('');
    try {
      await client.whenIdle();
      const current = gameStore.getSnapshot().view?.world;
      if (!current || nextOwnFixture(current)?.id !== fixtureId) {
        setMessage(KIT_FIXTURE_CHANGED);
        return;
      }
      const reply = await client.command(
        { type: 'match-kit', fixtureId, role },
        { background: true },
      );
      if (reply?.ok) {
        setDraft({ fixtureId, role, pending: false });
        setNotice('');
        setMessage(
          role
            ? `${KIT_ROLE_LABELS[role]} 유니폼으로 정했어요. 이 경기에만 입어요.`
            : '자동 선택으로 되돌렸어요. 두 팀이 가장 잘 구분되는 유니폼을 입어요.',
        );
      } else
        setMessage((client.state.error || '유니폼을 정하지 못했어요.').replace(/^Error: /, ''));
    } finally {
      setSending(false);
    }
  };
  const role = stale ? storedKitRole(w, fixture) : draft.role;
  return (
    <FixtureKitView
      w={w}
      fixture={fixture}
      role={role}
      disabled={blocked || actionBlocked || sending || stale}
      previewDisabled={previewBlocked || sending || stale || !!w.critical}
      readonly={readonly}
      notice={notice}
      message={message}
      onSelect={(kit) => {
        setNotice('');
        setMessage('');
        setDraft({ fixtureId: fixture?.id, role: kit, pending: kit !== storedKitRole(w, fixture) });
      }}
      onConfirm={() => void submit(role)}
      onAutomatic={() => {
        // A stored choice needs the command; an unconfirmed preview only returns to automatic.
        if (storedKitRole(w, fixture)) void submit(null);
        else {
          setMessage('');
          setDraft({ fixtureId: fixture?.id, role: null, pending: false });
        }
      }}
    />
  );
}
