import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CREST_EMBLEMS,
  CREST_PATTERNS,
  CREST_PRESETS,
  CREST_SHAPES,
  SHIRT_PATTERNS,
  type ClubIdentity,
  type CrestDesign,
} from '../../../../packages/contracts/src/identity';
import {
  CREST_EMBLEM_LABELS,
  CREST_PATTERN_LABELS,
  CREST_SHAPE_LABELS,
  ClubIdentityEditor,
  KIT_ROLE_LABELS,
} from './ClubIdentityEditor';
import { describeShirt, SHIRT_PATTERN_LABELS } from './kitPainting';

/** A two-colour identity whose three shirts all differ, as the editor receives it. */
const IDENTITY: ClubIdentity = Object.freeze({
  version: 1,
  colours: ['#d62828', '#FFFFFF'],
  crest: {
    shape: 'shield',
    pattern: 'stripes',
    emblem: 'star',
    primary: '#d62828',
    secondary: '#FFFFFF',
  },
  kits: {
    home: { pattern: 'stripes', primary: '#d62828', secondary: '#FFFFFF' },
    away: { pattern: 'plain', primary: '#f5e663', trim: '#0b1f44' },
    third: { pattern: 'hoops', primary: '#12493a', secondary: '#fcbf49', trim: '#a7b0ba' },
  },
} satisfies ClubIdentity);
const withCrest = (crest: CrestDesign): ClubIdentity => ({ ...IDENTITY, crest });

const render = (value: ClubIdentity, readonly?: boolean) =>
  renderToStaticMarkup(
    createElement(ClubIdentityEditor, {
      value,
      readonly,
      onChange: () => {
        throw new Error('rendering never changes the design');
      },
    }),
  );
const attr = (tag: string, name: string) => new RegExp(` ${name}="([^"]*)"`).exec(tag)?.[1];
/** Every button: its opening tag, accessible label and visible text. */
const buttons = (html: string) =>
  [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(([, tag, inner]) => ({
    tag,
    label: attr(tag, 'aria-label') ?? inner.replace(/<[^>]*>/g, ''),
    pressed: attr(tag, 'aria-pressed'),
    disabled: / disabled=""/.test(tag),
    inner,
  }));
const inputs = (html: string) => [...html.matchAll(/<input([^>]*)\/?>/g)].map(([, tag]) => tag);
/** A fieldset without nested fieldsets, from its legend to its end. */
function group(html: string, legend: string) {
  const start = html.indexOf(`<legend>${legend}</legend>`);
  expect(start, legend).toBeGreaterThanOrEqual(0);
  return html.slice(start, html.indexOf('</fieldset>', start));
}
const pressed = (html: string) => buttons(html).filter((b) => b.pressed === 'true');

describe('club identity editor markup (→KIT-2/4/5, WEB-86)', () => {
  it('offers six ready-made crests, 직접 꾸미기, three shirts and eight patterns', () => {
    const html = render(IDENTITY);
    const presets = buttons(group(html, '기본 엠블럼'));
    expect(presets.map((b) => b.label)).toEqual(
      CREST_PRESETS.map((p) => `${CREST_SHAPE_LABELS[p.shape]} · ${CREST_EMBLEM_LABELS[p.emblem]}`),
    );
    expect(presets.map((b) => b.pressed)).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
      'false',
    ]);
    const toggle = buttons(html).find((b) => b.label === '직접 꾸미기')!;
    expect(attr(toggle.tag, 'aria-expanded')).toBe('false');
    expect(html).not.toContain('<legend>모양</legend>');
    const roles = buttons(html).filter((b) => b.label.endsWith(' 유니폼'));
    expect(roles.map((b) => [b.label, b.pressed])).toEqual([
      ['홈 유니폼', 'true'],
      ['어웨이 유니폼', 'false'],
      ['세컨 유니폼', 'false'],
    ]);
    const patterns = buttons(group(html, '홈 유니폼 무늬'));
    expect(patterns.map((b) => b.label)).toEqual(
      SHIRT_PATTERNS.map((p) => SHIRT_PATTERN_LABELS[p]),
    );
    expect(pressed(group(html, '홈 유니폼 무늬')).map((b) => b.label)).toEqual(['세로 줄무늬']);
    expect(buttons(html).some((b) => b.label === '엠블럼 랜덤 선택')).toBe(true);
    expect(html).not.toContain('대표색 적용');
    // No shorts, socks, goalkeeper, upload or sponsor control, and no apply/cancel of its own.
    const controls = [
      ...buttons(html).map((b) => b.label),
      ...inputs(html).map((tag) => attr(tag, 'aria-label') ?? ''),
      ...[...html.matchAll(/<label[^>]*>(.*?)<\/label>/g)].map(([, text]) => text),
    ];
    for (const control of controls)
      expect(control).not.toMatch(/반바지|양말|골키퍼|업로드|스폰서|로고/);
    expect(inputs(html).some((tag) => attr(tag, 'type') === 'file')).toBe(false);
    expect(buttons(html).filter((b) => /^(적용|취소|저장)$/.test(b.label))).toEqual([]);
  });

  it('opens 직접 꾸미기 on a composed crest with every shape, field pattern and emblem', () => {
    const html = render(
      withCrest({ ...IDENTITY.crest, shape: 'badge', pattern: 'quarters', emblem: 'wheel' }),
    );
    expect(attr(buttons(html).find((b) => b.label === '직접 꾸미기')!.tag, 'aria-expanded')).toBe(
      'true',
    );
    expect(pressed(group(html, '기본 엠블럼'))).toEqual([]);
    const choices = [
      ['모양', CREST_SHAPES.map((x) => CREST_SHAPE_LABELS[x]), '팔각형'],
      ['바탕 무늬', CREST_PATTERNS.map((x) => CREST_PATTERN_LABELS[x]), '4분할'],
      ['엠블럼 모양', CREST_EMBLEMS.map((x) => CREST_EMBLEM_LABELS[x]), '바퀴'],
    ] as const;
    for (const [legend, labels, selected] of choices) {
      expect(buttons(group(html, legend)).map((b) => b.label)).toEqual(labels);
      expect(pressed(group(html, legend)).map((b) => b.label)).toEqual([selected]);
    }
    expect(choices.map(([, labels]) => labels.length)).toEqual([6, 10, 20]);
  });

  it('disables every change control when read-only and keeps the design visible', () => {
    const html = render(IDENTITY, true);
    expect(html).toContain('읽기 전용 탭이에요.');
    const all = buttons(html);
    for (const button of all) {
      const viewing =
        button.label.endsWith(' 유니폼') || attr(button.tag, 'aria-expanded') !== undefined;
      expect(button.disabled, button.label).toBe(!viewing);
    }
    for (const tag of inputs(html)) expect(tag).toContain(' disabled=""');
    // The writer's editor enables the same controls.
    const writable = render(IDENTITY);
    expect(writable).not.toContain('읽기 전용');
    expect(buttons(writable).filter((b) => b.disabled)).toEqual([]);
    expect(inputs(writable).filter((tag) => tag.includes(' disabled=""'))).toEqual([]);
  });

  it('labels the selected shirt with the controlled value’s own design', () => {
    const html = render(IDENTITY);
    const { home, away } = IDENTITY.kits;
    expect(html).toContain(`aria-label="홈 유니폼: ${describeShirt(home)}"`);
    for (const role of ['home', 'away', 'third'] as const)
      expect(html).toContain(
        `aria-label="${KIT_ROLE_LABELS[role]} 유니폼: ${describeShirt(IDENTITY.kits[role])}"`,
      );
    // Pattern choices show the alternate shirt colour when entering a new pattern.
    const plain = render({ ...IDENTITY, kits: { ...IDENTITY.kits, home: away } });
    const checks = {
      pattern: 'checks',
      primary: away.primary,
      secondary: away.primary,
      trim: away.trim,
    } as const;
    expect(group(plain, '홈 유니폼 무늬')).toContain(`aria-label="체크: ${describeShirt(checks)}"`);
  });

  it('shows exactly three named colours from shirt bases, including older palettes', () => {
    for (const colours of [
      ['#d62828'],
      ['#d62828', '#FFFFFF'],
      ['#d62828', '#FFFFFF', '#fcbf49'],
    ] as const) {
      const html = render({ ...IDENTITY, colours: [...colours] });
      const fields = inputs(group(html, '색상'));
      expect(fields.filter((tag) => attr(tag, 'type') === 'color')).toHaveLength(3);
      expect(
        fields
          .filter((tag) => attr(tag, 'type') === 'text')
          .map((tag) => [attr(tag, 'aria-label'), attr(tag, 'value')]),
      ).toEqual([
        ['홈 색 코드', IDENTITY.kits.home.primary],
        ['어웨이 색 코드', IDENTITY.kits.away.primary],
        ['세컨 색 코드', IDENTITY.kits.third.primary],
      ]);
      expect(inputs(html)).toHaveLength(6);
      expect(buttons(group(html, '색상'))).toEqual([]);
      expect(html).not.toMatch(/대표색|대표 주색|대표 보조색|테두리 추가|무늬색 추가/);
      expect(html).toContain('엠블럼은 홈·어웨이 색으로 배색돼요.');
      expect(html).toContain('바깥 테두리선은 모든 엠블럼에 같은 밝은 중립색으로 고정돼요.');
    }
  });
});
