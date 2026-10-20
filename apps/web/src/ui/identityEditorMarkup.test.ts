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
      ['원정 유니폼', 'false'],
      ['서드 유니폼', 'false'],
    ]);
    const patterns = buttons(group(html, '홈 유니폼 무늬'));
    expect(patterns.map((b) => b.label)).toEqual(
      SHIRT_PATTERNS.map((p) => SHIRT_PATTERN_LABELS[p]),
    );
    expect(pressed(group(html, '홈 유니폼 무늬')).map((b) => b.label)).toEqual(['세로 줄무늬']);
    expect(buttons(html).some((b) => b.label === '대표색 적용')).toBe(true);
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

  it('discloses a one-colour crest and offers no hidden editable colour', () => {
    const one = render(
      withCrest({ shape: 'round', pattern: 'hoops', emblem: 'ball', primary: '#6A0DAD' }),
    );
    const colours = group(one, '엠블럼 색');
    // Only the field colour is editable; the empty regions are explicit additions.
    expect(inputs(colours).map((tag) => attr(tag, 'value'))).toEqual(['#6a0dad', '#6A0DAD']);
    expect(buttons(colours).map((b) => b.label)).toEqual(['무늬색 추가', '엠블럼색 추가']);
    expect(colours).not.toContain('<b>무늬색</b>');
    expect(one).toContain('한 가지 색 엠블럼이에요. 무늬·원 테두리·엠블럼 자리는 비워 두어');
    expect(one).toContain('바깥 테두리선은 모든 엠블럼에 같은 밝은 중립색으로 고정돼요.');
    // The large preview paints only the chosen primary outside the mask that cuts its holes.
    const preview = /<svg[^>]*aria-label="엠블럼 미리보기[^"]*"[^>]*>.*?<\/svg>/.exec(one)![0];
    const painted = new Set(
      [
        ...preview.replace(/<mask[^>]*>.*?<\/mask>/g, '').matchAll(/ (?:fill|stroke)="([^"]*)"/g),
      ].map(([, value]) => value),
    );
    expect(painted).toEqual(new Set(['#6A0DAD', 'none']));
    // With an accent the emblem keeps its colour and only the pattern and ring stay empty.
    const accented = render(
      withCrest({
        shape: 'round',
        pattern: 'hoops',
        emblem: 'ball',
        primary: '#6A0DAD',
        accent: '#fcbf49',
      }),
    );
    expect(accented).toContain('무늬·원 테두리 자리는 비워 두어');
    expect(buttons(group(accented, '엠블럼 색')).map((b) => b.label)).toEqual([
      '엠블럼색 빼기',
      '무늬색 추가',
    ]);
    // Two colours: both regions are fields and nothing is called one-colour.
    const two = render(IDENTITY);
    expect(two).not.toContain('한 가지 색 엠블럼');
    expect(inputs(group(two, '엠블럼 색')).map((tag) => attr(tag, 'value'))).toEqual([
      '#d62828',
      '#d62828',
      '#ffffff',
      '#FFFFFF',
    ]);
  });

  it('names every region the crest’s secondary paints, and only those', () => {
    const hint = (crest: CrestDesign) =>
      /<b>무늬색<\/b><small id="[^"]*">([^<]*)<\/small>/.exec(
        group(render(withCrest(crest)), '엠블럼 색'),
      )?.[1];
    const actions = (crest: CrestDesign) =>
      buttons(group(render(withCrest(crest)), '엠블럼 색')).map((b) => b.label);
    // Without an accent the secondary also paints the emblem (CrestMark: accent ?? secondary).
    expect(hint(IDENTITY.crest)).toBe('바탕 무늬(세로 줄무늬) · 원 테두리 · 엠블럼(별)');
    expect(actions(IDENTITY.crest)).toEqual(['무늬색 빼기', '엠블럼색 따로 정하기']);
    // A plain field has no pattern for it to paint.
    const plain: CrestDesign = { ...IDENTITY.crest, pattern: 'plain', emblem: 'ball' };
    expect(hint(plain)).toBe('원 테두리 · 엠블럼(공)');
    // With an accent the emblem has its own field, and the secondary keeps the pattern and ring.
    const accented: CrestDesign = { ...IDENTITY.crest, accent: '#fcbf49' };
    expect(hint(accented)).toBe('바탕 무늬(세로 줄무늬) · 원 테두리');
    expect(group(render(withCrest(accented)), '엠블럼 색')).toContain('<b>엠블럼색</b><small id');
    expect(hint({ ...plain, accent: '#fcbf49' })).toBe('원 테두리');
    // A one-colour plain field leaves only the ring and emblem empty.
    expect(
      render(withCrest({ shape: 'round', pattern: 'plain', emblem: 'ball', primary: '#6A0DAD' })),
    ).toContain(
      '한 가지 색 엠블럼이에요. 원 테두리·엠블럼 자리는 비워 두어 뒤 배경이 비쳐 보여요.',
    );
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
    expect(inputs(group(html, '홈 유니폼 색')).map((tag) => attr(tag, 'value'))).toEqual([
      '#d62828',
      '#d62828',
      '#ffffff',
      '#FFFFFF',
    ]);
    // The writer's editor enables the same controls.
    const writable = render(IDENTITY);
    expect(writable).not.toContain('읽기 전용');
    expect(buttons(writable).filter((b) => b.disabled)).toEqual([]);
    expect(inputs(writable).filter((tag) => tag.includes(' disabled=""'))).toEqual([]);
  });

  it('labels the selected shirt with the controlled value’s own design', () => {
    const html = render(IDENTITY);
    const { home, away, third } = IDENTITY.kits;
    expect(html).toContain(`aria-label="홈 유니폼: ${describeShirt(home)}"`);
    for (const role of ['home', 'away', 'third'] as const)
      expect(html).toContain(
        `aria-label="${KIT_ROLE_LABELS[role]} 유니폼: ${describeShirt(IDENTITY.kits[role])}"`,
      );
    const colours = group(html, '홈 유니폼 색');
    expect(colours).toContain('<b>주색</b>');
    expect(colours).toContain('<b>보조색</b>');
    expect(colours).not.toContain('<b>테두리</b>');
    expect(buttons(colours).map((b) => b.label)).toEqual(['테두리 추가', '대표색 적용']);
    for (const other of [away.trim, third.secondary, third.trim])
      expect(colours.toLowerCase()).not.toContain(other!.toLowerCase());
    // A plain shirt has no secondary region; its optional trim is removable.
    const plain = render({ ...IDENTITY, kits: { ...IDENTITY.kits, home: away } });
    const plainColours = group(plain, '홈 유니폼 색');
    expect(plainColours).not.toContain('<b>보조색</b>');
    expect(plainColours).toContain('<b>테두리</b>');
    expect(buttons(plainColours).map((b) => b.label)).toEqual(['테두리 빼기', '대표색 적용']);
    expect(pressed(group(plain, '홈 유니폼 무늬')).map((b) => b.label)).toEqual(['단색']);
    // Each pattern choice pictures the shirt it would make, its secondary named explicitly.
    const checks = {
      pattern: 'checks',
      primary: away.primary,
      secondary: '#FFFFFF',
      trim: away.trim,
    } as const;
    expect(group(plain, '홈 유니폼 무늬')).toContain(`aria-label="체크: ${describeShirt(checks)}"`);
  });

  it('shows one to three representative colours with explicit add and remove', () => {
    const fields = (value: ClubIdentity) =>
      [...group(render(value), '대표색').matchAll(/<b>(대표 [^<]+)<\/b>/g)].map(
        ([, label]) => label,
      );
    const actions = (value: ClubIdentity) =>
      buttons(group(render(value), '대표색')).map((b) => b.label);
    expect(fields(IDENTITY)).toEqual(['대표 주색', '대표 보조색']);
    expect(actions(IDENTITY)).toEqual(['대표 보조색 빼기', '대표 강조색 추가']);
    const three: ClubIdentity = { ...IDENTITY, colours: ['#d62828', '#FFFFFF', '#fcbf49'] };
    expect(fields(three)).toEqual(['대표 주색', '대표 보조색', '대표 강조색']);
    expect(actions(three)).toEqual(['대표 보조색 빼기', '대표 강조색 빼기']);
    const one: ClubIdentity = { ...IDENTITY, colours: ['#d62828'] };
    expect(fields(one)).toEqual(['대표 주색']);
    expect(actions(one)).toEqual(['대표 보조색 추가']);
  });
});
