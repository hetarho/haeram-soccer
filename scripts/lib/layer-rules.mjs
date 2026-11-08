/*
 * Feature-sliced layers of apps/web/src (→ARCH-3/4), highest first: app, pages, widgets, features,
 * entities, shared. A layer imports only the layers below it, slices of one layer never import each
 * other (an entity names another only through that entity's `@x/<consumer>.ts` file), and anything
 * outside a slice imports it through its index, except that a dynamic `import()` names the module
 * file so the lazy chunk stays split. runtime, adapters and presentation sit below every layer and
 * import none of them, which keeps the Worker free of React (→ARCH-6). Layer modules are built free
 * of import side effects, so a side-effect-only import inside a layer would vanish from the build.
 *
 * Every relative specifier is resolved from the importing file's own path, so a rule holds at any
 * folder depth and for every import shape: static, type-only, re-export, dynamic and `typeof import`.
 */
import { posix } from 'node:path';

const LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];
const SLICED = new Set(['pages', 'widgets', 'features', 'entities']);
const INFRASTRUCTURE = new Set(['runtime', 'adapters', 'presentation']);
const ROOT = '/apps/web/src/';
const INDEX = /^index(\.[cm]?[jt]sx?)?$/;
const MODULE = /\.[cm]?[jt]sx?$/;

/** Where a path relative to apps/web/src sits: its layer, slice and the path inside the slice. */
function place(path) {
  const parts = path.split('/');
  const layer = parts.length > 1 ? parts[0] : undefined;
  if (!SLICED.has(layer)) return { layer, rest: parts.slice(1) };
  return { layer, slice: parts[1], rest: parts.slice(2) };
}

const rank = (layer) => LAYERS.indexOf(layer);
const isIndex = (to) => to.rest.length === 0 || (to.rest.length === 1 && INDEX.test(to.rest[0]));
const ownCrossImport = (me, to) =>
  me.layer === 'entities' &&
  to.rest.length === 2 &&
  to.rest[0] === '@x' &&
  to.rest[1].replace(MODULE, '') === me.slice;

export const featureSlicedImports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      higher: 'A layer imports only the layers below it.',
      sibling: 'Slices of one layer do not import each other; move the shared part down a layer.',
      entity: "An entity names another only through that entity's `@x/{{consumer}}` file.",
      publicApi: 'Import a slice through its index (its public API).',
      lazyIndex:
        'A dynamic import() names the module file, not the slice index, so the lazy chunk stays split.',
      infrastructure:
        'runtime, adapters and presentation sit below every layer and import none of them.',
      sideEffect:
        'Layer modules are built free of import side effects, so a side-effect-only import would be dropped; import a name and use it.',
    },
  },
  create(context) {
    const file = `/${context.filename.split('\\').join('/')}`;
    const at = file.lastIndexOf(ROOT);
    if (at < 0) return {};
    const path = file.slice(at + ROOT.length);
    const me = place(path);
    const layered = LAYERS.includes(me.layer);

    /** `kind`: 'static' (import, export … from), 'dynamic' (import()) or 'type' (typeof import()). */
    const check = (node, specifier, kind) => {
      if (typeof specifier !== 'string' || !specifier.startsWith('.')) return;
      const target = posix.normalize(
        posix.join(posix.dirname(path), specifier.replace(/[?#].*$/, '')),
      );
      if (target.startsWith('../') || target === '..') return;
      const to = place(target);
      if (!LAYERS.includes(to.layer)) return;
      const report = (messageId, data) => context.report({ node, messageId, data });
      if (INFRASTRUCTURE.has(me.layer)) return report('infrastructure');
      if (layered) {
        if (rank(to.layer) < rank(me.layer)) return report('higher');
        if (to.layer === me.layer) {
          if (!SLICED.has(me.layer) || to.slice === me.slice || ownCrossImport(me, to)) return;
          return me.layer === 'entities'
            ? report('entity', { consumer: me.slice })
            : report('sibling');
        }
      }
      if (!SLICED.has(to.layer) || kind === 'type') return;
      if (!to.slice) return report('publicApi');
      if (kind === 'static' && !isIndex(to)) return report('publicApi');
      if (kind === 'dynamic' && isIndex(to)) return report('lazyIndex');
    };
    const literal = (node) =>
      node?.type === 'Literal'
        ? node.value
        : node?.type === 'TemplateLiteral' && node.expressions.length === 0
          ? node.quasis[0].value.cooked
          : undefined;

    return {
      ImportDeclaration(node) {
        if (layered && node.specifiers.length === 0 && node.importKind !== 'type')
          context.report({ node, messageId: 'sideEffect' });
        check(node.source, node.source.value, 'static');
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node.source, node.source.value, 'static');
      },
      ExportAllDeclaration(node) {
        check(node.source, node.source.value, 'static');
      },
      ImportExpression(node) {
        check(node.source, literal(node.source), 'dynamic');
      },
      TSImportType(node) {
        const argument =
          node.argument?.type === 'TSLiteralType' ? node.argument.literal : node.argument;
        check(node, literal(argument), 'type');
      },
    };
  },
};

export default { rules: { 'feature-sliced-imports': featureSlicedImports } };
