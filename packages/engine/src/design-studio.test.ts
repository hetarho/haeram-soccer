import { describe, expect, it } from 'vitest';
import type { IdentityColours } from '../../contracts/src/identity';
import type { Founding } from '../../contracts/src/types';
import { identityOf } from './club-identity';
import { DESIGNERS, designFee, redrawFee } from './design-studio';
import { createWorld } from './founding';
import { operate } from './operations';

const FOUNDING: Founding = {
  country: 'ENG',
  name: 'Design Studio',
  color: '#223344',
  seed: 'design-studio',
  level: 'normal',
};
const COLOURS: IdentityColours = ['#0b1f44', '#ffd166', '#d62828'];

describe('designer commission', () => {
  it("charges the designer's fee and delivers its drafts in the owner's colours", () => {
    const w = createWorld(FOUNDING);
    const cash = BigInt(w.cash),
      fee = BigInt(designFee(w, 'studio'));
    operate(w, { type: 'design-commission', studio: 'studio', colours: COLOURS });
    expect(BigInt(w.cash)).toBe(cash - fee);
    expect(w.designCommission?.drafts).toHaveLength(DESIGNERS.studio.drafts);
    for (const draft of w.designCommission!.drafts) expect(draft.colours).toEqual(COLOURS);
    // A dearer designer delivers more drafts.
    expect(DESIGNERS.star.drafts).toBeGreaterThan(DESIGNERS.local.drafts);
  });

  it('adopting a draft applies it and ends the commission; discarding keeps the fee spent', () => {
    const w = createWorld(FOUNDING);
    operate(w, { type: 'design-commission', studio: 'local', colours: COLOURS });
    const chosen = structuredClone(w.designCommission!.drafts[1]!);
    operate(w, { type: 'adopt-design', draft: 1 });
    expect(identityOf(w, w.playerClub).colours).toEqual(chosen.colours);
    expect(identityOf(w, w.playerClub).kits).toEqual(chosen.kits);
    expect(w.designCommission).toBeUndefined();

    operate(w, { type: 'design-commission', studio: 'local', colours: COLOURS });
    const spent = w.cash;
    operate(w, { type: 'discard-designs' });
    expect(w.designCommission).toBeUndefined();
    expect(w.cash).toBe(spent);
    expect(() => operate(w, { type: 'adopt-design', draft: 0 })).toThrow();
  });

  it('redraws the same designer and colours at half the fee', () => {
    const w = createWorld(FOUNDING);
    operate(w, { type: 'design-commission', studio: 'star', colours: COLOURS });
    const cash = BigInt(w.cash);
    operate(w, { type: 'redraw-designs' });
    expect(BigInt(w.cash)).toBe(cash - BigInt(redrawFee(w, 'star')));
    expect(BigInt(redrawFee(w, 'star')) * 2n).toBeLessThanOrEqual(BigInt(designFee(w, 'star')));
    expect(w.designCommission).toMatchObject({ studio: 'star', colours: COLOURS });
    expect(w.designCommission?.drafts).toHaveLength(DESIGNERS.star.drafts);
  });
});
