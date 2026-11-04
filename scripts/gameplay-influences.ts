/** Resolve curated causal explanations against source declarations without executing the game. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { INFLUENCE_GROUPS, PLAYER_ACTIONS } from '../apps/web/src/constants/influences.ts';
import type {
  GameplayCatalog,
  InfluenceGroup,
  PlayerAction,
} from '../apps/web/src/constants/catalog.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function validateInfluences(groups: InfluenceGroup[], actions: PlayerAction[]): void {
  const ids = new Set<string>();
  for (const group of groups) {
    if (ids.has(group.id)) throw new Error(`Duplicate group: ${group.id}`);
    ids.add(group.id);
  }
  const outcomes = groups.flatMap((group) => group.outcomes);
  const targets = new Set<string>();
  for (const outcome of outcomes) {
    if (targets.has(outcome.id) || ids.has(outcome.id))
      throw new Error(`Duplicate outcome: ${outcome.id}`);
    targets.add(outcome.id);
    if (!outcome.factors.length || !outcome.sources.length)
      throw new Error(`Missing factors/evidence: ${outcome.id}`);
  }
  const actionIds = new Set<string>();
  for (const action of actions) {
    if (actionIds.has(action.id)) throw new Error(`Duplicate action: ${action.id}`);
    actionIds.add(action.id);
    if (!action.effects.length) throw new Error(`Missing action effects: ${action.id}`);
  }
  for (const link of [
    ...outcomes.flatMap((outcome) => outcome.consequences),
    ...actions.flatMap((action) => action.effects),
  ]) {
    if (!targets.has(link.outcome)) throw new Error(`Unknown outcome: ${link.outcome}`);
  }
}

export function buildInfluenceCatalog(root = ROOT): GameplayCatalog {
  validateInfluences(INFLUENCE_GROUPS, PLAYER_ACTIONS);
  const files = [
    ...new Set(
      INFLUENCE_GROUPS.flatMap((group) =>
        group.outcomes.flatMap((outcome) => outcome.sources.map((source) => source.file)),
      ),
    ),
  ].sort();
  const symbols = new Map<string, Map<string, number>>();
  const fingerprint = createHash('sha256').update(
    JSON.stringify({ groups: INFLUENCE_GROUPS, actions: PLAYER_ACTIONS }),
  );
  for (const file of files) {
    const text = readFileSync(resolve(root, file), 'utf8');
    fingerprint.update(file).update('\0').update(text);
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const declarations = new Map<string, number>();
    const add = (name: string, node: ts.Node) =>
      declarations.set(name, sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
    for (const statement of sf.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name)
        add(statement.name.text, statement);
      if (ts.isVariableStatement(statement))
        for (const declaration of statement.declarationList.declarations)
          if (ts.isIdentifier(declaration.name)) add(declaration.name.text, statement);
    }
    symbols.set(file, declarations);
  }
  const missing: string[] = [];
  const groups = INFLUENCE_GROUPS.map((group) => ({
    ...group,
    outcomes: group.outcomes.map((outcome) => ({
      ...outcome,
      sources: outcome.sources.map((source) => {
        const line = symbols.get(source.file)?.get(source.symbol);
        if (line === undefined) missing.push(`${source.file}#${source.symbol}`);
        return { ...source, line };
      }),
    })),
  }));
  if (missing.length)
    throw new Error(`Unresolved gameplay evidence:\n${[...new Set(missing)].join('\n')}`);
  return { groups, actions: PLAYER_ACTIONS, files, fingerprint: fingerprint.digest('hex') };
}
