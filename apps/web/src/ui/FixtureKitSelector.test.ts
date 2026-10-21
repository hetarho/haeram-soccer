import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import { KIT_ROLES, type KitRole } from '../../../../packages/contracts/src/identity';
import type { Fixture, World } from '../../../../packages/contracts/src/types';
import { nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { identityOf } from '../../../../packages/engine/src/club-identity';
import { createWorld } from '../../../../packages/engine/src/index';
import { selectMatchKits } from '../../../../packages/engine/src/kit-selection';
import { appearanceForFixture } from '../../../../packages/engine/src/match-appearance';
import { operate } from '../../../../packages/engine/src/operations';
import {
  FixtureKitView,
  fixtureKitAppearance,
  fixtureKitContext,
  ownSideOf,
  storedKitRole,
  type FixtureKitViewProps,
} from './FixtureKitSelector';

/** A founding whose next fixture is at home; a later league fixture has us away. */
const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Kit Town',
    color: '#bf7956',
    seed: 'kit-prep-a',
    level: 'easy',
  });
const W = world();
const HOME = nextOwnFixture(W)!;
const AWAY = W.fixtures.find((f) => !f.score && f.away === W.playerClub)!;
const opponentOf = (f: Fixture) => (f.home === W.playerClub ? f.away : f.home);

describe('fixture kit preview (→KIT-6/7/8)', () => {
  it('forces our role on our actual side, at home and away, without changing the world', () => {
    expect(ownSideOf(W, HOME)).toBe(0);
    expect(ownSideOf(W, AWAY)).toBe(1);
    const before = canonical(W);
    const own = identityOf(W, W.playerClub);
    for (const fixture of [HOME, AWAY]) {
      const side = ownSideOf(W, fixture);
      for (const role of KIT_ROLES) {
        const preview = fixtureKitAppearance(W, fixture, role);
        const kits = selectMatchKits(identityOf(W, fixture.home), identityOf(W, fixture.away), {
          side,
          role,
        });
        expect(preview.sides[side]).toMatchObject({ club: W.playerClub, role });
        expect(preview.sides[side].shirt).toEqual(own.kits[role]);
        expect(preview.sides[1 - side].club).toBe(opponentOf(fixture));
        expect(preview.sides.map((s) => s.role)).toEqual(kits.roles);
        expect(preview.sides.map((s) => s.goalkeeper)).toEqual(kits.goalkeepers);
        expect(preview.warnings).toEqual(kits.warnings);
      }
    }
    expect(canonical(W)).toBe(before);
    expect('kitChoice' in W).toBe(false);
  });

  it('previews exactly what settlement records once the choice is committed', () => {
    for (const role of KIT_ROLES) {
      const w = world();
      const preview = fixtureKitAppearance(w, HOME, role);
      operate(w, { type: 'match-kit', fixtureId: HOME.id, role });
      expect(appearanceForFixture(w, nextOwnFixture(w)!)).toEqual(preview);
    }
  });

  it('recommends the unrestricted automatic pairing whatever is stored', () => {
    const automatic = fixtureKitAppearance(W, HOME, null);
    const unforced = selectMatchKits(identityOf(W, HOME.home), identityOf(W, HOME.away));
    expect(automatic.sides.map((s) => s.role)).toEqual(unforced.roles);
    expect(automatic).toEqual(appearanceForFixture(W, HOME));
    const w = world();
    const chosen = KIT_ROLES.find((r) => r !== automatic.sides[0].role)!;
    operate(w, { type: 'match-kit', fixtureId: HOME.id, role: chosen });
    expect(fixtureKitAppearance(w, HOME, null)).toEqual(automatic);
    expect(storedKitRole(w, HOME)).toBe(chosen);
    expect(storedKitRole(w, AWAY)).toBeNull();
    expect(storedKitRole(w, undefined)).toBeNull();
    expect(storedKitRole(W, HOME)).toBeNull();
  });

  it('names the fixture with its date, competition, both clubs and our venue', () => {
    const home = W.clubs.find((c) => c.id === HOME.away)!.name;
    expect(fixtureKitContext(W, HOME)).toMatch(new RegExp(`Kit Town 대 ${home} · 우리 홈 경기$`));
    expect(fixtureKitContext(W, AWAY)).toMatch(/ · 우리 원정 경기$/);
  });
});

const attr = (tag: string, name: string) => new RegExp(` ${name}="([^"]*)"`).exec(tag)?.[1];
/** Every button: its opening tag, accessible label, role and state. */
const buttons = (html: string) =>
  [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(([, tag, inner]) => ({
    label: attr(tag, 'aria-label') ?? inner.replace(/<[^>]*>/g, ''),
    role: attr(tag, 'role'),
    checked: attr(tag, 'aria-checked'),
    disabled: / disabled=""/.test(tag),
  }));
const render = (props: Partial<FixtureKitViewProps> & { w?: World }) =>
  renderToStaticMarkup(
    createElement(FixtureKitView, {
      w: W,
      fixture: HOME,
      role: null,
      disabled: false,
      readonly: false,
      notice: '',
      message: '',
      onSelect: () => {
        throw new Error('rendering never selects');
      },
      onConfirm: () => {
        throw new Error('rendering never commits');
      },
      onAutomatic: () => {
        throw new Error('rendering never commits');
      },
      ...props,
    }),
  );

describe('fixture kit selector markup (→WEB-88)', () => {
  it('offers no kit action without a next fixture', () => {
    const html = render({ fixture: undefined });
    expect(html).toContain('data-testid="fixture-kit"');
    expect(html).toContain('새 경기 일정이 나오면');
    expect(buttons(html)).toEqual([]);
    expect(html).not.toContain('role="radio"');
  });

  it('names the fixture and its automatic pairing, with every action disabled read-only', () => {
    const automatic = fixtureKitAppearance(W, HOME, null);
    const html = render({ readonly: true, disabled: true, role: 'away' });
    expect(html).toContain(`data-fixture-id="${HOME.id}"`);
    expect(html).toContain(fixtureKitContext(W, HOME));
    expect(html).toContain('읽기 전용 탭에서는 유니폼을 정할 수 없어요.');
    expect(html).toContain(
      `자동 추천: 우리 ${['홈', '어웨이', '세컨'][KIT_ROLES.indexOf(automatic.sides[0].role)]} 유니폼`,
    );
    const all = buttons(html);
    expect(all.map((b) => b.label)).toEqual([
      '우리 홈 유니폼',
      '우리 어웨이 유니폼',
      '우리 세컨 유니폼',
      '이 유니폼으로 정하기',
      '자동 선택으로 되돌리기',
    ]);
    expect(all.every((b) => b.disabled)).toBe(true);
    // Both sides' shirts and automatic keepers are shown before anything is committed.
    expect(html).toMatch(/aria-label="Kit Town (홈|어웨이|세컨) 유니폼: /);
    expect(html).toContain(`골키퍼 자동 색 ${automatic.sides[1].goalkeeper}`);
  });

  it('marks automatic selection with no role checked and a stored role as chosen', () => {
    const automatic = buttons(render({}));
    expect(automatic.filter((b) => b.role === 'radio').map((b) => b.checked)).toEqual([
      'false',
      'false',
      'false',
    ]);
    // Nothing drafted or stored: neither commit can do anything.
    expect(automatic.slice(3).map((b) => b.disabled)).toEqual([true, true]);
    const w = world();
    operate(w, { type: 'match-kit', fixtureId: HOME.id, role: 'third' });
    const stored = render({ w, role: 'third' });
    expect(stored).toContain('직접 고름');
    const chosen = buttons(stored);
    expect(chosen.find((b) => b.checked === 'true')?.label).toBe('우리 세컨 유니폼');
    // The stored role needs no new command; returning to automatic does.
    expect(chosen.slice(3).map((b) => b.disabled)).toEqual([true, false]);
  });

  it('warns about a clashing drafted role, recommends the automatic one and still allows it', () => {
    const w = world();
    const own = identityOf(w, w.playerClub);
    // A marked synthetic rival whose every shirt is our home shirt.
    const rival = w.clubs.find((c) => c.id === HOME.away)!;
    rival.identity = {
      ...identityOf(w, rival.id),
      kits: { home: own.kits.home, away: own.kits.home, third: own.kits.home },
    };
    const clash: KitRole = 'home';
    expect(fixtureKitAppearance(w, HOME, clash).warnings).toContain('teams');
    const automatic = fixtureKitAppearance(w, HOME, null).sides[0].role;
    expect(automatic).not.toBe(clash);
    const html = render({ w, role: clash });
    expect(html).toContain('data-testid="fixture-kit-warning"');
    expect(html).toContain(
      `더 잘 구분되는 ${automatic === 'away' ? '어웨이' : '세컨'} 유니폼을 추천해요.`,
    );
    expect(html).toContain('경고: 두 팀 유니폼이 비슷해 구분하기 어려워요.');
    const [confirm, reset] = buttons(html).slice(3);
    expect(confirm.disabled).toBe(false);
    expect(reset.disabled).toBe(false);
  });
});
