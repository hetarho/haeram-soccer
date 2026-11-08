import { describe, expect, it } from 'vitest';
import { designFormAfter, FRESH_DESIGN_FORM, type DesignForm } from './ClubDesignView';

const finished: DesignForm = {
  step: 'confirm',
  colours: ['#1d3f8f', '#f0c419', null],
  studio: 'star',
};

describe('club design request form (→WEB-108)', () => {
  it.each(['design-commission', 'adopt-design', 'discard-designs'] as const)(
    'starts again on the first page once %s succeeds',
    (command) => {
      expect(designFormAfter(finished, command)).toEqual({
        step: 'home',
        colours: [],
        studio: 'studio',
      });
    },
  );

  it('keeps no finished step for a later world without the commission', () => {
    // An imported file of the same game drops the commission while the view stays mounted.
    const after = designFormAfter(finished, 'design-commission');
    expect(after.step).not.toBe('confirm');
    expect(after.colours).toHaveLength(0);
  });

  it('keeps the drafts page across a redraw', () => {
    expect(designFormAfter(finished, 'redraw-designs')).toBe(finished);
  });

  it('opens fresh on the applied design', () => {
    expect(FRESH_DESIGN_FORM).toEqual({ step: 'home', colours: [], studio: 'studio' });
  });
});
