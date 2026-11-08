import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useEffect, useState } from 'react';
import {
  KIT_ROLES,
  type KitRole,
  type MatchAppearance,
} from '../../../../../../packages/contracts/src/identity';
import type { Fixture, World } from '../../../../../../packages/contracts/src/types';
import { fixtureDate, nextOwnFixture } from '../../../../../../packages/engine/src/calendar';
import { identityOf } from '../../../../../../packages/engine/src/club-identity';
import { KIT_FIXTURE_CHANGED } from '../../../../../../packages/engine/src/identity-operations';
import { appearanceForFixture } from '../../../../../../packages/engine/src/match-appearance';
import type { GameClient } from '../../../runtime/client';
import { gameActionsBlocked, gameStore, useGameState } from '../../../runtime/store';
import { ownSeasonFixtures } from '../../../entities/league/lib/fixtures';
import { competitionLabel } from '../../../presentation/format';
import { KIT_ROLE_LABELS } from '../../../entities/match/lib/identityPreview';
import { KitPitchPreview } from './KitPitchPreview';
import { KitSwatch } from '../../../entities/match/ui/KitSwatch';
import { matchLook } from '../../../entities/match/lib/matchAppearance';
import { worldSelector } from '../../../shared/lib/liveState';
import s from './FixtureKitSelector.module.css';

/**
 * KIT-6/7/8, WEB-88: our shirt for the named next fixture, chosen in the kit section of the
 * next-match report (spec/ssot/KIT.md). Choosing a role only redraws the preview; the one
 * `match-kit` command names the fixture the preview showed.
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
  return sourceMessage('copy.FixtureKitSelector.ec1c277444', {
    p0: fixtureDate(w, fixture),
    p1: competitionLabel(w, fixture),
    p2: nameOf(w, fixture.home),
    p3: nameOf(w, fixture.away),
    p4: ownSideOf(w, fixture) === 0 ? sourceMessage('fixture.home') : sourceMessage('fixture.away'),
  });
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
  useTextLocale();
  // A settled or historical match is never offered: only the calendar's next own fixture is.
  if (!fixture)
    return (
      <p className={s.empty} data-testid="fixture-kit">
        {richMessage('copy.FixtureKitSelector.badccc60ca')}
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
    <details
      data-ui="disclosure"
      className={s.disclosure}
      data-testid="fixture-kit"
      data-fixture-id={fixture.id}
    >
      <summary data-testid="fixture-kit-summary">
        {richMessage('copy.FixtureKitSelector.3ea39017f3', {
          p0: KIT_ROLE_LABELS[stored ?? automatic],
          p1: ' ',
          p2: stored
            ? sourceMessage('copy.FixtureKitSelector.0c97333f3a')
            : sourceMessage('copy.ControllerBackgrounds.ca7eb2ef0a'),
        })}
      </summary>
      <section
        className={s.content}
        aria-label={displayMessage('copy.FixtureKitSelector.4b34e2bbc1')}
      >
        <p className={s.context} data-testid="fixture-kit-context">
          {localizeValue(fixtureKitContext(w, fixture))}
        </p>
        {localizeValue(
          notice && (
            <p data-surface="inset" className={s.notice}>
              {localizeValue(notice)}
            </p>
          ),
        )}
        <div
          className={s.pair}
          role="group"
          aria-label={displayMessage('copy.FixtureKitSelector.6dcf1da6a2')}
        >
          {localizeValue(
            preview.sides.map((side, i) => (
              <div key={side.club} className={s.side}>
                <KitSwatch
                  shirt={side.shirt}
                  kit={look.sides[i].kit}
                  label={displayMessage('copy.FixtureKitSelector.1ec292bad8', {
                    p0: names[i],
                    p1: KIT_ROLE_LABELS[side.role],
                  })}
                  size={40}
                  number={10}
                />
                <KitSwatch
                  shirt={look.sides[i].keeper}
                  kit={look.sides[i].keeperKit}
                  label={displayMessage('copy.FixtureKitSelector.0a5ed6b368', {
                    p0: names[i],
                    p1: side.goalkeeper,
                  })}
                  size={40}
                  number={1}
                />
                <span>
                  <b>{localizeValue(names[i])}</b>
                  <small>
                    {richMessage('copy.FixtureKitSelector.a6daecdefa', {
                      p0: i === 0 ? sourceMessage('fixture.home') : sourceMessage('fixture.away'),
                      p1: KIT_ROLE_LABELS[side.role],
                    })}
                  </small>
                </span>
              </div>
            )),
          )}
        </div>
        {localizeValue(
          look.sides[own].keeperFallback && (
            <p
              data-surface="inset"
              className={s.notice}
              role="status"
              data-testid="fixture-kit-keeper-fallback"
            >
              {richMessage('copy.FixtureKitSelector.521c536436', {
                p0: ' ',
                p1: look.sides[own].keeperKit.shirt.primary,
              })}
            </p>
          ),
        )}
        <p className={s.note} data-testid="fixture-kit-recommendation">
          {richMessage('copy.FixtureKitSelector.2feb98db48', {
            p0: KIT_ROLE_LABELS[automatic],
            p1: ' ',
            p2: KIT_ROLE_LABELS[recommended.sides[1 - own].role],
            p3: recommended.warnings.length
              ? sourceMessage('copy.FixtureKitSelector.e0faa38767')
              : '',
          })}
        </p>
        <p className={s.note} data-testid="fixture-kit-state">
          {localizeValue(
            stored
              ? sourceMessage('copy.FixtureKitSelector.2acdde0f7b', { p0: KIT_ROLE_LABELS[stored] })
              : sourceMessage('copy.FixtureKitSelector.b08bb29188', {
                  p0: KIT_ROLE_LABELS[automatic],
                }),
          )}
          {localizeValue(
            role && role !== stored
              ? sourceMessage('copy.FixtureKitSelector.9de5bb35cb', { p0: KIT_ROLE_LABELS[role] })
              : '',
          )}
        </p>
        <div
          className={s.roles}
          role="radiogroup"
          aria-label={displayMessage('copy.FixtureKitSelector.1c3b24a303')}
        >
          {localizeValue(
            KIT_ROLES.map((kit) => (
              <button
                key={kit}
                type="button"
                role="radio"
                aria-checked={role === kit}
                aria-label={displayMessage('copy.FixtureKitSelector.112c0e30ad', {
                  p0: KIT_ROLE_LABELS[kit],
                })}
                disabled={previewDisabled}
                onClick={() => onSelect(kit)}
              >
                <KitSwatch
                  shirt={kits[kit]}
                  label={displayMessage('copy.FixtureKitSelector.112c0e30ad', {
                    p0: KIT_ROLE_LABELS[kit],
                  })}
                  size={28}
                />
                <span>{localizeValue(KIT_ROLE_LABELS[kit])}</span>
                {localizeValue(
                  (kit === automatic || kit === stored) && (
                    <small>
                      {localizeValue(
                        kit === stored
                          ? sourceMessage('copy.FixtureKitSelector.0192aba23d')
                          : sourceMessage('copy.FixtureKitSelector.08c92b6f8d'),
                      )}
                    </small>
                  ),
                )}
              </button>
            )),
          )}
        </div>
        {localizeValue(
          role && preview.warnings.length > 0 && (
            <p className={s.warning} data-testid="fixture-kit-warning">
              {richMessage('copy.FixtureKitSelector.9dc9b64d8e', {
                p0: ' ',
                p1:
                  automatic !== role
                    ? sourceMessage('copy.FixtureKitSelector.f2d57da127', {
                        p0: KIT_ROLE_LABELS[automatic],
                      })
                    : sourceMessage('copy.FixtureKitSelector.51b9b7df5a'),
                p2: ' ',
              })}
            </p>
          ),
        )}
        <KitPitchPreview appearance={preview} labels={names} />
        {localizeValue(
          elsewhere && (
            <p className={s.note}>
              {richMessage('copy.FixtureKitSelector.69cf3056fc', {
                p0: fixtureKitContext(w, elsewhere),
                p1: KIT_ROLE_LABELS[w.kitChoice!.role],
              })}
            </p>
          ),
        )}
        <div className={s.actions}>
          <button
            data-ui="primary"
            type="button"
            className={s.confirm}
            disabled={disabled || !role || role === stored}
            onClick={onConfirm}
          >
            {richMessage('copy.FixtureKitSelector.18fe22fbff')}
          </button>
          <button type="button" disabled={disabled || (!stored && !role)} onClick={onAutomatic}>
            {richMessage('copy.FixtureKitSelector.e1c6eebb77')}
          </button>
        </div>
        {localizeValue(
          readonly && <p className={s.note}>{richMessage('copy.FixtureKitSelector.af6bd86117')}</p>,
        )}
        <p className={s.message} aria-live="polite" data-testid="fixture-kit-message">
          {localizeValue(message)}
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
 * WEB-88: mounted by the report's kit section once queued work has settled. It reads the world itself, so a
 * stored choice, a newly drawn tie or a played match shows at once; when the next fixture changes
 * under the preview, the draft starts again from that fixture instead of moving to it.
 */
export function FixtureKitSelector({ client, blocked }: { client: GameClient; blocked: boolean }) {
  useTextLocale();
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
          ? sourceMessage('copy.FixtureKitSelector.c3a5e60588', {
              p0: fixtureKitContext(w, fixture),
            })
          : sourceMessage('copy.FixtureKitSelector.089d177dda'),
        unapplied &&
          sourceMessage('copy.FixtureKitSelector.ae5e2a996c', {
            p0: KIT_ROLE_LABELS[unapplied],
            p1: fixture ? sourceMessage('copy.FixtureKitSelector.87e23ff683') : '',
          }),
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
            ? sourceMessage('copy.FixtureKitSelector.6635554a00', { p0: KIT_ROLE_LABELS[role] })
            : sourceMessage('copy.FixtureKitSelector.9b2579c2a5'),
        );
      } else
        setMessage(
          (client.state.error || sourceMessage('copy.FixtureKitSelector.09d73f9639')).replace(
            /^Error: /,
            '',
          ),
        );
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
