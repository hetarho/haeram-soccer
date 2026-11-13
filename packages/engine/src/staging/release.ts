// Under pressure the ball goes (natural-football, MATCH-12). A man on the ball whom an opponent
// he has not gone past reaches (within `RELEASE.reach` metres for `RELEASE.react` seconds) ends
// his hold there: the beat's recorded action follows at once (a pass to where its receiver can
// take it, the carry, the shot, or the recorded tackle). Only a press-resistant man, one whose
// `escape` (드리블 twice, 침착성 and 힘) reaches `RELEASE.escape`, keeps it while reached, shielding
// it (`holdMove`) for up to `RELEASE.shield` seconds. Who wins the ball stays the record's fact.
import { nearestOpponent } from './contest';
import type { StageState } from './world';

/**
 * Release rules, module constants rather than lab tunables (the lab catalog lists only the config
 * objects): metres at which an opponent has reached the man on the ball, the seconds he takes to
 * play it once reached, the `escape` (0–100) from which he is press-resistant and the seconds such
 * a man shields it before he plays it.
 */
export const RELEASE = { reach: 2.2, react: 0.4, escape: 78, shield: 2.5 };

/** Press resistance (0–100) from the attributes: 드리블 counts twice, then 침착성 and 힘. */
export const escapeOf = (attrs: {
  dribbling: number;
  composure: number;
  strength: number;
}): number => Math.round((2 * attrs.dribbling + attrs.composure + attrs.strength) / 4);

/** Whether player `index` keeps the ball under pressure (`RELEASE.escape`). */
export const pressResistant = (state: StageState, index: number): boolean =>
  (state.fixture.players[index].escape ?? 0) >= RELEASE.escape;

/**
 * A watch over one hold of `actor`: true from `RELEASE.react` seconds (`RELEASE.shield` for a
 * press-resistant man) after an opponent he has not gone past came within `RELEASE.reach` of him
 * and stayed there.
 */
export function pressedOff(state: StageState, actor: number): () => boolean {
  const wait = pressResistant(state, actor) ? RELEASE.shield : RELEASE.react;
  let since: number | undefined;
  let seen = -1;
  return () => {
    if (seen !== state.t) {
      seen = state.t;
      const man = nearestOpponent(state, actor, true);
      if (man.index < 0 || man.distance > RELEASE.reach) since = undefined;
      else since ??= state.t;
    }
    return since !== undefined && state.t - since >= wait - 1e-9;
  };
}

/** The hold of `hold` seconds that began at `start` is over, or `actor` has been reached (`pressedOff`). */
export function holdOver(
  state: StageState,
  actor: number,
  start: number,
  hold: number,
): () => boolean {
  const off = pressedOff(state, actor);
  return () => state.t - start >= hold - 1e-9 || off();
}
