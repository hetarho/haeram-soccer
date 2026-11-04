import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
export type Control = '직접 선택' | '시작 시 선택' | '자동 변화' | '현재 변경 불가';
export type Decision = '조건 판정' | '확률' | '계산' | '자동 처리' | '복합 판정' | '정보·표시';
export interface Factor {
  name: string;
  effect: string;
  control?: Control;
  children?: Factor[];
}
export interface SourceRef {
  file: string;
  symbol: string;
  line?: number;
}
export interface Consequence {
  outcome: string;
  effect: string;
}
export interface Outcome {
  id: string;
  title: string;
  decision: Decision;
  summary: string;
  factors: Factor[];
  sources: SourceRef[];
  consequences: Consequence[];
  absent: string[];
}
export interface InfluenceGroup {
  id: string;
  title: string;
  description: string;
  outcomes: Outcome[];
}
export interface PlayerAction {
  id: string;
  title: string;
  control: Control;
  effects: Consequence[];
}
export interface GameplayCatalog {
  groups: InfluenceGroup[];
  actions: PlayerAction[];
  files: string[];
  fingerprint: string;
}

export function factorCount(factors: readonly Factor[]): number {
  return factors.reduce((count, factor) => count + 1 + factorCount(factor.children ?? []), 0);
}
function factorText(factors: readonly Factor[]): string {
  return factors
    .map(
      (factor) =>
        `${factor.name} ${factor.effect} ${factor.control ?? ''} ${factorText(factor.children ?? [])}`,
    )
    .join(' ');
}
/** A matching child keeps its full causal hierarchy and context visible. */
export function filterInfluences(
  groups: readonly InfluenceGroup[],
  query: string,
  category = '',
  actions: readonly PlayerAction[] = [],
): InfluenceGroup[] {
  const terms = query
    .trim()
    .toLowerCase()
    .replace(/overall/g, 'ovr')
    .split(/\s+/)
    .filter(Boolean);
  return groups
    .filter((group) => !category || group.id === category)
    .map((group) => ({
      ...group,
      outcomes: group.outcomes.filter((outcome) => {
        const text = [
          group.title,
          outcome.title,
          outcome.summary,
          outcome.decision,
          factorText(outcome.factors),
          ...outcome.absent,
          ...actions
            .filter((action) => action.effects.some((effect) => effect.outcome === outcome.id))
            .map(
              (action) =>
                `${action.title} ${action.control} ${action.effects.map((effect) => effect.effect).join(' ')}`,
            ),
          ...outcome.consequences.map((link) => link.effect),
        ]
          .join(' ')
          .toLowerCase()
          .replace(/overall/g, 'ovr');
        return terms.every((term) => text.includes(term));
      }),
    }))
    .filter((group) => group.outcomes.length > 0);
}
/** Human-readable export with the same numbered hierarchy as the page. */
export function influenceMarkdown(catalog: GameplayCatalog): string {
  const lines = [
    sourceMessage('copy.catalog.2dd876b61a'),
    '',
    sourceMessage('copy.catalog.b539b1eec9'),
    '',
  ];
  const titles = new Map(
    catalog.groups.flatMap((group) => group.outcomes.map((outcome) => [outcome.id, outcome.title])),
  );
  const factors = (items: Factor[], indent: number) => {
    items.forEach((item, index) => {
      lines.push(
        `${' '.repeat(indent)}${index + 1}. **${item.name}**${item.control ? ` [${item.control}]` : ''}: ${item.effect}`,
      );
      factors(item.children ?? [], indent + String(index + 1).length + 2);
    });
  };
  for (const group of catalog.groups) {
    lines.push(`## ${group.title}`, '', group.description, '');
    group.outcomes.forEach((outcome, index) => {
      const indent = String(index + 1).length + 2;
      const pad = ' '.repeat(indent);
      lines.push(
        `${index + 1}. **${outcome.title}** [${outcome.decision}]`,
        `${pad}${outcome.summary}`,
        '',
      );
      factors(outcome.factors, indent);
      lines.push('');
      if (outcome.consequences.length)
        lines.push(
          sourceMessage('copy.catalog.2b1b88773d', {
            p0: pad,
            p1: outcome.consequences
              .map((link) => `${link.effect} → ${titles.get(link.outcome)}`)
              .join(' / '),
          }),
        );
      if (outcome.absent.length)
        lines.push(
          sourceMessage('copy.catalog.7ed1601971', { p0: pad, p1: outcome.absent.join(' / ') }),
        );
      lines.push(
        sourceMessage('copy.catalog.02c1f38ec2', {
          p0: pad,
          p1: outcome.sources
            .map((source) => `${source.file}:${source.line ?? '?'} (${source.symbol})`)
            .join(', '),
        }),
        '',
      );
    });
  }
  lines.push(sourceMessage('copy.catalog.129b656496'), '');
  catalog.actions.forEach((action, index) =>
    lines.push(
      `${index + 1}. **${action.title}** [${action.control}]: ${action.effects.map((effect) => `${effect.effect} → ${titles.get(effect.outcome)}`).join(' / ')}`,
    ),
  );
  return lines.join('\n') + '\n';
}
