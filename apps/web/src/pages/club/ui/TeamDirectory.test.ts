import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import localeRegistryData from '../../../../public/presentation/locales/index.json';
import localeData from '../../../../public/presentation/locales/ko-KR.json';
import themeRegistryData from '../../../../public/presentation/themes/index.json';
import standardData from '../../../../public/presentation/themes/standard.json';
import { ATTRIBUTES, type Position } from '../../../../../../packages/contracts/src/player';
import type { Player, Staff, World } from '../../../../../../packages/contracts/src/types';
import type {
  PresentationController,
  PresentationSnapshot,
} from '../../../presentation/controller';
import { validateLocalePack, validateThemePack } from '../../../presentation/contracts';
import { createLoadedLocale } from '../../../presentation/locale';
import { PresentationProvider } from '../../../presentation/react';
import { validateRegistry } from '../../../presentation/registry';
import { createThemeResolver } from '../../../presentation/theme';
import type { ClientState, GameClient } from '../../../runtime/client';
import { TeamDirectory, TeamReturn } from './TeamDirectory';
import { useTaskMemory } from '../../../shared/routing/taskMemory';

const snapshot: PresentationSnapshot = {
  locale: createLoadedLocale(
    validateRegistry(localeRegistryData, 'locale'),
    validateLocalePack(localeData),
  ),
  theme: createThemeResolver(validateThemePack(standardData), {
    url: '/presentation/themes/standard.json',
  }),
  localeRegistry: validateRegistry(localeRegistryData, 'locale'),
  themeRegistry: validateRegistry(themeRegistryData, 'theme'),
  pending: false,
  sessionOnly: false,
};
const controller: PresentationController = {
  getSnapshot: () => snapshot,
  subscribe: () => () => {},
  initialize: vi.fn(),
  select: vi.fn(),
  retry: vi.fn(),
  registerNeed: () => () => {},
  dispose: vi.fn(),
};

/** Synthetic people only; the directory reads them and never commands the game. */
function player(id: string, name: string, position: Position, extra: Partial<Player> = {}) {
  return {
    id,
    name,
    position,
    positions: { [position]: 3 },
    born: 1930,
    attrs: Object.fromEntries(ATTRIBUTES.map((key) => [key, 60])),
    potential: 70,
    fatigue: 10,
    wage: '1200',
    until: 1953,
    status: 'active',
    ...extra,
  } as unknown as Player;
}
const w = {
  id: 'team-world',
  year: 1951,
  round: 2,
  calendar: { day: 10 },
  playerClub: 'us',
  clubs: [{ id: 'us', country: 'ENG', name: 'Haeram' }],
  players: [
    player('p1', '박공격', 'ST', { loanUntil: 1952 }),
    player('p2', '이수비', 'CB'),
    player('p3', '최골키', 'GK'),
    player('p4', '정떠남', 'CM', { status: 'sold' }),
  ],
  academy: { players: [player('y1', '한유망', 'LW', { born: 1935, potential: 81 })] },
  manager: {
    id: 'm1',
    name: '김감독',
    ability: 62,
    wage: '3000',
    until: 1952,
    interim: false,
    person: 'person-1',
  },
  staff: [
    { id: 's1', role: 'assistant', name: '조수석', ability: 55, wage: '0', until: 1951 } as Staff,
  ],
} as unknown as World;
const command = vi.fn();
const client = { command } as unknown as GameClient;
const state = { view: { world: w } } as unknown as ClientState;

function render(
  search: string,
  node: ReactElement = createElement(TeamDirectory, { state, client }),
) {
  vi.stubGlobal('location', {
    origin: 'https://game.test',
    pathname: '/team',
    search,
    hash: '',
  });
  useTaskMemory.getState().activate(w.id);
  return renderToStaticMarkup(createElement(PresentationProvider, { controller, children: node }));
}
const rows = (html: string) => [...html.matchAll(/<tr data-testid="team-(?:row|post)-([^"]+)"/g)];
afterEach(() => {
  vi.unstubAllGlobals();
  useTaskMemory.getState().activate('clean');
});

describe('팀 directory (→WEB-112/113)', () => {
  it('opens 1군 with its tabs in order and one compact row per actual player', () => {
    const html = render('?view=players');
    expect(html).toContain('role="tablist" aria-label="팀 명단"');
    expect([...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((match) => match[1])).toEqual([
      '1군',
      '유소년',
      '코치',
    ]);
    expect(html).toMatch(/id="team-tab-players"[^>]*aria-selected="true"/);
    expect(html).toContain('role="tabpanel" aria-labelledby="team-tab-players"');
    // Default order is by position: goalkeeper, defence, attack; the sold player is gone.
    expect(rows(html).map((match) => match[1])).toEqual(['p3', 'p2', 'p1']);
    expect(
      [...html.matchAll(/data-ui="position-badge" data-line="([A-Z]+)"/g)].map((m) => m[1]),
    ).toEqual(['GK', 'DF', 'FW']);
    expect(html).toContain('aria-label="박공격 선수 기록"');
    expect(html).toContain('21세 · 임대');
    expect(html).toContain('1952/53까지');
    expect(html).toContain('>1군 관리<');
    // No card per person and no illustration in the list.
    const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
    expect(html).not.toContain('<article');
    expect(table).not.toContain('<img');
    expect(table).not.toContain('<figure');
    expect(command).not.toHaveBeenCalled();
  });

  it('reads 유소년 from the academy only, its names opening the prospect review', () => {
    const html = render('?view=academy');
    expect(html).toMatch(/id="team-tab-academy"[^>]*aria-selected="true"/);
    expect(rows(html).map((match) => match[1])).toEqual(['y1']);
    expect(html).toContain('aria-label="한유망 유소년 검토"');
    expect(html).toContain('>유소년 관리<');
    // Older saves without recorded growth show a dash, not zero.
    expect(html).toContain('>—<');
  });

  it('lists the manager and every post in 코치, naming vacancies as posts', () => {
    const html = render('?view=coaches');
    expect(rows(html).map((match) => match[1])).toEqual([
      'manager',
      'director',
      'scout',
      'assistant',
      'attack',
      'defense',
      'goalkeeping',
      'fitness',
      'youth',
    ]);
    expect(html.match(/data-vacant="true"/g)).toHaveLength(7);
    expect(html.match(/>공석</g)).toHaveLength(7);
    expect(html).toContain('aria-label="김감독 인물 경력"');
    // A volunteer has no linked career and no pay.
    expect(html).not.toContain('aria-label="조수석 인물 경력"');
    expect(html).toContain('>무급<');
    expect(html).not.toContain('data-ui="position-badge"');
    expect(html).toContain('>코치진 관리<');
    expect(command).not.toHaveBeenCalled();
  });

  it('leads back from a detailed page to the Team tab that owns it', () => {
    const html = render('', createElement(TeamReturn, { page: 'staff' }));
    expect(html).toContain('data-ui="team-return"');
    expect(html).toContain('>← 팀 · 코치</button>');
  });
});
