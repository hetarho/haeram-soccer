import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildInfluenceCatalog, validateInfluences } from '../../../../scripts/gameplay-influences';
import { factorCount, filterInfluences, influenceMarkdown } from './catalog';
import { INFLUENCE_GROUPS, PLAYER_ACTIONS } from './influences';
import { ConstantsInventory, FactorTree, OutcomeCard } from './ConstantsPage';

const outcomes = INFLUENCE_GROUPS.flatMap((group) => group.outcomes);
const find = (id: string) => outcomes.find((outcome) => outcome.id === id)!;

describe('implemented gameplay relationships', () => {
  it('separates player renewal thresholds, manager persuasion and the selling club bid probability', () => {
    expect(find('renewal-acceptance').decision).toBe('조건 판정');
    expect(find('renewal-acceptance').summary).toContain('추첨하지 않습니다');
    expect(find('renewal-acceptance').summary).toContain('협상 시작 때 확정');
    expect(find('renewal-acceptance').absent.join(' ')).toContain('우리 팀 평균 OVR');
    expect(find('bid-acceptance').decision).toBe('확률');
    expect(find('persuasion').decision).toBe('확률');
    expect(
      find('renewal-acceptance').factors.some((factor) =>
        factor.children?.some((child) => child.name === '시장 연봉'),
      ),
    ).toBe(true);
  });

  it('keeps direct actions, start choices, automatic state and unavailable old controls distinct', () => {
    expect(PLAYER_ACTIONS.find((action) => action.id === 'raise-wage')?.control).toBe('직접 선택');
    expect(PLAYER_ACTIONS.find((action) => action.id === 'start-choices')?.control).toBe(
      '시작 시 선택',
    );
    for (const id of ['tactics-lineup', 'training-control'])
      expect(PLAYER_ACTIONS.find((action) => action.id === id)?.control).toBe('현재 변경 불가');
    for (const id of ['direction-control', 'facility-work', 'decision-guidelines'])
      expect(PLAYER_ACTIONS.find((action) => action.id === id)?.control).toBe('직접 선택');
    expect(find('wage-demand').factors[0]!.control).toBe('자동 변화');
  });

  it('validates every source declaration, category and downstream/action target', () => {
    const catalog = buildInfluenceCatalog();
    expect(catalog.groups.map((group) => group.id)).toEqual([
      'contracts',
      'transfers',
      'matches',
      'development',
      'staff',
      'finances',
      'owner',
      'world',
    ]);
    expect(() => validateInfluences(catalog.groups, catalog.actions)).not.toThrow();
    expect(
      catalog.groups
        .flatMap((group) => group.outcomes.flatMap((outcome) => outcome.sources))
        .every((source) => source.line! > 0 && catalog.files.includes(source.file)),
    ).toBe(true);
    expect(catalog.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('refuses broken causal targets and duplicate outcomes instead of serving misleading links', () => {
    const groups = structuredClone(INFLUENCE_GROUPS);
    groups[0]!.outcomes[0]!.consequences.push({ outcome: 'not-implemented', effect: 'bad' });
    expect(() => validateInfluences(groups, PLAYER_ACTIONS)).toThrow('Unknown outcome');
    groups[0]!.outcomes[0]!.consequences.pop();
    groups[0]!.outcomes.push(groups[0]!.outcomes[0]!);
    expect(() => validateInfluences(groups, PLAYER_ACTIONS)).toThrow('Duplicate outcome');
  });
});

describe('causal hierarchy presentation', () => {
  it('finds deep factors while preserving their outcome, parent and siblings', () => {
    const filtered = filterInfluences(INFLUENCE_GROUPS, '에이전트', 'contracts');
    expect(filtered).toHaveLength(1);
    const renewal = filtered[0]!.outcomes.find((outcome) => outcome.id === 'renewal-acceptance')!;
    expect(renewal).toEqual(find('renewal-acceptance'));
    expect(filterInfluences(INFLUENCE_GROUPS, 'overall')).toEqual(
      filterInfluences(INFLUENCE_GROUPS, 'OVR'),
    );
    expect(filterInfluences(INFLUENCE_GROUPS, 'not-present')).toEqual([]);
    expect(
      filterInfluences(INFLUENCE_GROUPS, '제시 연봉을 올려 재계약하기', '', PLAYER_ACTIONS)
        .flatMap((group) => group.outcomes)
        .map((outcome) => outcome.id),
    ).toContain('renewal-acceptance');
  });

  it('renders nested numbered factors with practical effects and control availability', () => {
    const factors = find('renewal-acceptance').factors;
    const markup = renderToStaticMarkup(createElement(FactorTree, { factors }));
    expect(markup.match(/<ol/g)?.length).toBe(2);
    expect(markup).toContain('최소 수락 연봉');
    expect(markup).toContain('시장 연봉');
    expect(markup).toContain('직접 선택');
    expect(markup).toContain('자동 변화');
    expect(factorCount(factors)).toBe(8);
  });

  it('keeps evidence expandable, states absent relations and links consequential outcomes', () => {
    const markup = renderToStaticMarkup(
      createElement(OutcomeCard, {
        outcome: find('renewal-acceptance'),
        titles: new Map(outcomes.map((outcome) => [outcome.id, outcome.title])),
        onNavigate: () => {},
      }),
    );
    expect(markup).toContain('현재 연결되지 않는 요소');
    expect(markup).toContain('href="#operating-cost"');
    expect(markup).toMatch(/<details[^>]*><summary>구현 근거 확인/);
    expect(markup).toContain('offerContract');
    expect(markup).not.toContain('<input');
  });

  it('exports the complete readable hierarchy, action consequences and source evidence', () => {
    const catalog = buildInfluenceCatalog();
    const markdown = influenceMarkdown(catalog);
    expect(markdown).toContain('1. **선수의 재계약 수락 여부** [조건 판정]');
    expect(markdown).toContain('   2. **선수의 최소 수락 연봉**');
    expect(markdown).toContain('      1. **시장 연봉**');
    expect(markdown).toContain('\n12. **페널티킥·승부차기 성공**');
    expect(markdown).toContain('\n    1. **키커 마무리·침착성**');
    expect(markdown).toContain('## 행동부터 보기');
    expect(markdown).toContain('현재 없는 연결:');
    expect(markdown).toMatch(/contracts\.ts:\d+ \(offerContract\)/);
    for (const outcome of outcomes) expect(markdown).toContain(`**${outcome.title}**`);
  });

  it('offers all outcomes and a human-readable download on one page without raw constant rows', () => {
    const catalog = buildInfluenceCatalog();
    const markup = renderToStaticMarkup(createElement(ConstantsInventory, { catalog }));
    for (const text of [
      '게임플레이 영향 요소',
      '행동부터 보기',
      '선수의 재계약 수락 여부',
      '확률 추첨과 조건 판정을 구분',
      '정리된 목록 내려받기',
    ])
      expect(markup).toContain(text);
    expect(markup).toContain('href="/gameplay-influences.md"');
    expect(markup).not.toContain('<table');
    expect(markup).not.toContain('gameplay-constants.json');
  });
});
