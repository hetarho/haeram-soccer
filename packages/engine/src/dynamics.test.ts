import { describe, expect, it } from 'vitest';
import { evolveClubs, EVOLUTION, levelOf } from './dynamics';
import { npcBooksFixture } from './npc-books.testkit';
import { random } from './primitives';
import { stature } from './world';

describe('scripted representative summers', () => {
  it('leaves a playable club strength, project and debt untouched, even on event draws', () => {
    const { w, c } = npcBooksFixture();
    c.project = 10;
    c.books = { seasons: [], cash: '0', debt: '1000' };
    const before = structuredClone(c);
    evolveClubs(w, new Map(w.clubs.map((club) => [club.id, club.tier])));
    expect(c).toEqual(before);
    expect(levelOf(w, c)).toBe(c.strength);
    expect(w.inbox ?? []).toEqual([]);
  });

  it('keeps only the promotion/relegation cohesion cost for a playable club', () => {
    const { w, c } = npcBooksFixture();
    c.cohesion = 0.8;
    c.tier = 1;
    const strength = c.strength;
    evolveClubs(w, new Map([[c.id, 0]]));
    expect(c.cohesion).toBe(0.7);
    expect(c.strength).toBe(strength);
  });

  it('keeps the representative target, fade, luck and event formula', () => {
    const { w } = npcBooksFixture();
    const c = w.clubs[2]!;
    c.project = 10;
    const project = Math.round(10 * EVOLUTION.project.fade * 10) / 10;
    const p = random(`${w.seed}:project:${w.year}:${c.id}`);
    expect(p()).toBeGreaterThanOrEqual(EVOLUTION.project.chance);
    const r = random(`${w.seed}:evolve:${w.year}:${c.id}`);
    let next = c.strength + (68 + stature(w.seed, c.id) + project - c.strength) * EVOLUTION.reversion +
      (r() + r() + r() - 1.5) * EVOLUTION.luck;
    const event = r();
    if (event < EVOLUTION.takeover.chance)
      next += EVOLUTION.takeover.min + r() * (EVOLUTION.takeover.max - EVOLUTION.takeover.min);
    else if (event < EVOLUTION.takeover.chance + EVOLUTION.crisis.chance)
      next -= EVOLUTION.crisis.min + r() * (EVOLUTION.crisis.max - EVOLUTION.crisis.min);
    evolveClubs(w, new Map());
    expect(c.project).toBe(project);
    expect(c.strength).toBe(Math.round(Math.max(EVOLUTION.floor, Math.min(EVOLUTION.ceiling, next))));
  });
});
