import { describe, expect, it } from 'vitest';
import { retarget } from './motion';

describe('retarget', () => {
  const renamed = new Map([['crest-_r_f_', 'crest-_r_f_-leaving-1']]);
  it('follows renamed ids in url() and fragment references', () => {
    expect(retarget('url(#crest-_r_f_)', renamed)).toBe('url(#crest-_r_f_-leaving-1)');
    expect(retarget('url("#crest-_r_f_")', renamed)).toBe('url("#crest-_r_f_-leaving-1")');
    expect(retarget('fill: url(#crest-_r_f_); mask: url(#other)', renamed)).toBe(
      'fill: url(#crest-_r_f_-leaving-1); mask: url(#other)',
    );
    expect(retarget('#crest-_r_f_', renamed)).toBe('#crest-_r_f_-leaving-1');
  });
  it('leaves colours and references to other ids alone', () => {
    expect(retarget('#fff', renamed)).toBe('#fff');
    expect(retarget('url(#other)', renamed)).toBe('url(#other)');
    expect(retarget('crest-_r_f_', renamed)).toBe('crest-_r_f_');
  });
});
