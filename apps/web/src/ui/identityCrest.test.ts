import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ClubIdentity, CrestDesign } from '../../../../packages/contracts/src/identity';
import type { World } from '../../../../packages/contracts/src/types';
import { createWorld } from '../../../../packages/engine/src/index';
import { GameIndexStore } from '../adapters/games';
import { summarize } from '../runtime/slots';
import { ClubCrest, CrestMark } from './ClubCrest';
import { ClubLink } from './ClubLink';
import { seriesColours } from './MatchCharts';
import s from './ClubCrest.module.css';

const markup = (crest: CrestDesign, label?: string) =>
  renderToStaticMarkup(createElement(CrestMark, { crest, size: 40, label }));
/** Markup without module class names, which depend on the CSS build. */
const geometry = (html: string) => html.replace(/ class="[^"]*"/g, '');
/** The colours actually painted: every fill and stroke outside the mask, which only cuts holes. */
const painted = (html: string) =>
  new Set(
    [...html.replace(/<mask[^>]*>.*?<\/mask>/g, '').matchAll(/ (?:fill|stroke)="([^"]*)"/g)].map(
      ([, value]) => value,
    ),
  );
const masks = (html: string) => [...html.matchAll(/<mask[^>]*>(.*?)<\/mask>/g)].map(([, m]) => m);

const STRIPES = 'M6 0H11V48H6Z M16 0H21V48H16Z M26 0H31V48H26Z';
const STAR = 'M6 0.5L7.6 4.3L11.7 4.6L8.6 7.2L9.6 11.2L6 9L2.4 11.2L3.4 7.2L0.3 4.6L4.4 4.3Z';
const red: CrestDesign = {
  shape: 'shield',
  pattern: 'stripes',
  emblem: 'star',
  primary: '#d62828',
};

describe('crest marks with one to three colours (→KIT-2/4)', () => {
  it('draws two-colour crests exactly as before', () => {
    // Recorded from the two-colour renderer before optional colours existed.
    const crest = { ...red, emblem: 'ball', secondary: '#ffffff' } as const;
    expect(geometry(renderToStaticMarkup(createElement(CrestMark, { crest })))).toBe(
      '<svg width="20" height="24" viewBox="0 0 40 48" aria-hidden="true" focusable="false"><defs><clipPath id="crest-_R_0_"><path d="M4 4H36V22C36 34 28 41 20 45C12 41 4 34 4 22Z"></path></clipPath></defs><g clip-path="url(#crest-_R_0_)"><rect width="40" height="48" fill="#d62828"></rect><path d="M6 0H11V48H6Z M16 0H21V48H16Z M26 0H31V48H26Z" fill="#ffffff"></path></g><path d="M4 4H36V22C36 34 28 41 20 45C12 41 4 34 4 22Z" fill="none" stroke-width="2.4" stroke-linejoin="round"></path><circle cx="20" cy="25" r="8.6" fill="#d62828" stroke="#ffffff" stroke-width="1.8"></circle><path transform="translate(14 19)" d="M6 0.5A5.5 5.5 0 1 1 5.99 0.5ZM6 2A4 4 0 1 0 6.01 2Z M6 3.6L8.3 5.3L7.4 8H4.6L3.7 5.3Z" fill="#ffffff" fill-rule="evenodd"></path></svg>',
    );
    expect(
      geometry(
        markup({ ...crest, shape: 'diamond', pattern: 'checks', emblem: 'star' }, '레드 FC'),
      ),
    ).toBe(
      '<svg width="40" height="48" viewBox="0 0 40 48" role="img" aria-label="레드 FC" focusable="false"><defs><clipPath id="crest-_R_0_"><path d="M20 3L37 24L20 45L3 24Z"></path></clipPath></defs><g clip-path="url(#crest-_R_0_)"><rect width="40" height="48" fill="#d62828"></rect><path d="M0 0H8V8H0Z M16 0H24V8H16Z M32 0H40V8H32Z M8 8H16V16H8Z M24 8H32V16H24Z M0 16H8V24H0Z M16 16H24V24H16Z M32 16H40V24H32Z M8 24H16V32H8Z M24 24H32V32H24Z M0 32H8V40H0Z M16 32H24V40H16Z M32 32H40V40H32Z M8 40H16V48H8Z M24 40H32V48H24Z" fill="#ffffff"></path></g><path d="M20 3L37 24L20 45L3 24Z" fill="none" stroke-width="2.4" stroke-linejoin="round"></path><circle cx="20" cy="25" r="8.6" fill="#d62828" stroke="#ffffff" stroke-width="1.8"></circle><path transform="translate(14 19)" d="M6 0.5L7.6 4.3L11.7 4.6L8.6 7.2L9.6 11.2L6 9L2.4 11.2L3.4 7.2L0.3 4.6L4.4 4.3Z" fill="#ffffff" fill-rule="nonzero"></path></svg>',
    );
  });

  it('cuts a one-colour crest’s pattern, ring and emblem out as negative space', () => {
    const html = markup(red);
    // Only the chosen primary is painted; no secondary field hides behind the shape.
    expect(painted(html)).toEqual(new Set(['#d62828', 'none']));
    const [holes] = masks(html);
    expect(masks(html)).toHaveLength(1);
    expect(holes).toContain(`<path d="${STRIPES}" fill="#000"></path>`);
    expect(holes).toContain('stroke="#000" stroke-width="1.8"');
    expect(holes).toContain(`d="${STAR}" fill="#000"`);
    const id = /<mask id="([^"]+)"/.exec(html)![1];
    expect(html).toContain(`<g mask="url(#${id})">`);
    // The fixed neutral outline still frames the shape.
    expect(html).toContain(`class="${s.outline}"`);
    // A plain field has no pattern hole, only the ring and emblem.
    const plain = masks(markup({ ...red, pattern: 'plain' }))[0];
    expect(plain).not.toContain(STRIPES);
    expect(plain).toContain(`d="${STAR}" fill="#000"`);
  });

  it('gives the optional third colour to the emblem', () => {
    const html = markup({ ...red, secondary: '#ffffff', accent: '#fcbf49' });
    expect(masks(html)).toEqual([]);
    expect(html).toContain(`<path d="${STRIPES}" fill="#ffffff"></path>`);
    expect(html).toContain('fill="#d62828" stroke="#ffffff" stroke-width="1.8"');
    expect(html).toContain(`d="${STAR}" fill="#fcbf49"`);
    expect(painted(html)).toEqual(new Set(['#d62828', '#ffffff', '#fcbf49', 'none']));
    // An accent without a secondary paints the emblem over a field still cut by negative space.
    const accented = markup({ ...red, accent: '#fcbf49' });
    expect(painted(accented)).toEqual(new Set(['#d62828', '#fcbf49', 'none']));
    expect(accented).toContain(`d="${STAR}" fill="#fcbf49"`);
    expect(masks(accented)[0]).toContain(STRIPES);
    expect(masks(accented)[0]).not.toContain(STAR);
  });

  it('keeps clip and mask IDs unique and the label semantics', () => {
    const html = renderToStaticMarkup(
      createElement(
        'div',
        null,
        createElement(CrestMark, { crest: red }),
        createElement(CrestMark, { crest: red, label: '레드 FC' }),
      ),
    );
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(([, id]) => id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(html).toContain(`url(#${id})`);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('role="img" aria-label="레드 FC"');
  });
});

describe('current crests wherever the own club is named (→WEB-49)', () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Crest Club',
    color: '#24664f',
    seed: 'identity-crest',
    level: 'normal' as const,
  });
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const rival = w.clubs.find((club) => club.id !== w.playerClub)!;
  const next: ClubIdentity = {
    ...own.identity!,
    colours: ['#6a0dad', '#f5e663', '#ffffff'],
    crest: {
      shape: 'crown',
      pattern: 'hoops',
      emblem: 'bird',
      primary: '#6a0dad',
      accent: '#f5e663',
    },
  };
  /** The HUD and team sheet draw ClubCrest; standings and fixtures draw it inside ClubLink. */
  const views = (world: World, id: string) => ({
    hud: renderToStaticMarkup(createElement(ClubCrest, { w: world, id, size: 40 })),
    link: renderToStaticMarkup(createElement(ClubLink, { w: world, id, crest: 40 })),
  });
  /** Each tree numbers its own IDs. */
  const same = (html: string) => geometry(html).replace(/crest-[A-Za-z0-9_]+/g, 'crest-ID');
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    };
  };
  /** A slot card after writing and reading the slot index, as the slot screen sees it. */
  const card = (world: World) => {
    const store = new GameIndexStore(memory());
    const summary = summarize(world);
    store.write({
      owner: store.read().owner,
      active: 0,
      slots: [{ id: 'g', worldId: world.id, summary, playedAt: '' }, null, null],
    });
    return { summary, read: store.read().slots[0]!.summary.crest };
  };

  it('agrees in the HUD, club links and slot summary on the applied crest', () => {
    const { hud, link } = views(w, own.id);
    expect(same(hud)).toBe(same(markup(own.identity!.crest)));
    expect(same(link)).toContain(same(hud));
    const { summary, read } = card(w);
    expect(summary.crest).toEqual(own.identity!.crest);
    expect(summary.crest).not.toBe(own.identity!.crest);
    expect(read).toEqual(own.identity!.crest);
  });

  it('follows a new own identity object in every view and leaves the rival as it was', () => {
    const rivalBefore = views(w, rival.id);
    // A published view after an applied edit carries a new identity object (→KIT-9/12).
    const after: World = {
      ...w,
      clubs: w.clubs.map((club) =>
        club === own ? { ...club, color: '#6a0dad', identity: next } : club,
      ),
    };
    const { hud, link } = views(after, own.id);
    expect(same(hud)).toBe(same(markup(next.crest)));
    expect(same(link)).toContain(same(hud));
    expect(hud).toContain(`fill="#f5e663"`);
    const { summary, read } = card(after);
    expect(summary.crest).toEqual(next.crest);
    expect(read).toEqual(next.crest);
    expect(read).not.toHaveProperty('secondary');
    expect(views(after, rival.id)).toEqual(rivalBefore);
    // The same club object given a new identity in place is not hidden by any earlier lookup.
    const inPlace = structuredClone(w);
    views(inPlace, own.id);
    inPlace.clubs.find((club) => club.id === own.id)!.identity = structuredClone(next);
    expect(same(views(inPlace, own.id).hud)).toBe(same(markup(next.crest)));
    expect(card(inPlace).read).toEqual(next.crest);
  });
});

describe('chart lines beside optional crest colours', () => {
  const crest = (secondary?: string, accent?: string): CrestDesign => ({
    ...red,
    primary: '#1f4fd1',
    ...(secondary ? { secondary } : {}),
    ...(accent ? { accent } : {}),
  });

  it('falls back to the away crest’s own colours, then to fixed lines', () => {
    // Distinct kits keep their own lines.
    expect(seriesColours(['#d62828', '#ffffff'], crest('#121212'))).toEqual(['#d62828', '#ffffff']);
    // Alike kits: the away secondary, else its accent, else the warm line.
    const [, secondary] = seriesColours(['#1f4fd1', '#1f4fd1'], crest('#ffffff'));
    expect(secondary).toBe('#ffffff');
    const [, accent] = seriesColours(['#1f4fd1', '#1f4fd1'], crest(undefined, '#ffffff'));
    expect(accent).toBe('#ffffff');
    expect(seriesColours(['#1f4fd1', '#1f4fd1'], crest())[1]).toBe('#ff9257');
    // A warm home side leaves the neutral ivory line for a one-colour away crest.
    expect(seriesColours(['#ff9257', '#ff9257'], crest())).toEqual(['#ff9257', '#f6f1e1']);
  });
});
