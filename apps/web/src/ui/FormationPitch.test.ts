import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const rule = (file: string, selector: string) => {
  const css = readFileSync(new URL(file, import.meta.url), 'utf8');
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `${file} ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
};

describe('formation pitch slots', () => {
  it('stay on their spot while pressed', () => {
    // Every pressed button drops its transform. A slot centred by transform jumped half its size
    // on mousedown, so Firefox sent the mouseup and the click to the pitch and the slot never
    // opened (CI 41524887826); the independent translate property survives the press.
    expect(rule('./App.module.css', ':global(button:active:not(:disabled))')).toMatch(
      /transform: none;/,
    );
    const slot = rule('./FormationPitch.module.css', '.slot');
    expect(slot).toMatch(/\btranslate: -50% -50%;/);
    expect(slot).not.toMatch(/\btransform:/);
  });
});
