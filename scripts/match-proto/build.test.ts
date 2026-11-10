import { beforeAll, describe, expect, it } from 'vitest';
import { bundleViewer, renderHtml } from './build.ts';
import { fakePlayback, frameOf } from './check/playback.testkit.ts';

let bundle = '';
beforeAll(async () => {
  bundle = await bundleViewer();
});

describe('viewer build', () => {
  it('renderHtml inlines the playback and the bundle and escapes "<" in the data', () => {
    const html = renderHtml('{"a":"</script><b>"}', 'f("</script>")');
    expect(html).toContain('window.__MATCH_PROTO__ = {"a":"\\u003c/script>\\u003cb>"};');
    expect(html).toContain('f("<\\/script>")');
    expect(html).toContain('<title>match-proto</title>');
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });

  it('the page has no Korean character and no prose element', () => {
    const playback = fakePlayback({ frames: [frameOf(0), frameOf(0.1)] });
    const html = renderHtml(JSON.stringify(playback), bundle);
    expect(html).not.toMatch(/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/);
    for (const banned of [/<p[\s>]/i, /<h[1-6]/i, /<label/i, /title=/i, /aria-label/i]) {
      expect(html).not.toMatch(banned);
    }
  });

  it('bundleViewer returns an IIFE that reads window.__MATCH_PROTO__', () => {
    expect(bundle).toMatch(/^("use strict";)?\(\(\)=>\{/);
    expect(bundle.trimEnd()).toMatch(/\}\)\(\);$/);
    expect(bundle).toContain('__MATCH_PROTO__');
    expect(bundle).not.toMatch(/^import |\bexport\b/m);
  });
});
