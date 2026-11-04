const visibleAttributes =
  /^(aria-label|aria-description|aria-valuetext|alt|title|placeholder|label|description)$/;
const letters = /\p{L}/u;
const korean = /[가-힣]/;

export const noHardcodedCopy = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      resource:
        'Put display copy in message resources and every registered locale pack. Use message/LocalizedMessage; see AGENTS.md.',
    },
  },
  create(context) {
    const report = (node) => context.report({ node, messageId: 'resource' });
    const typeOnly = (node) =>
      context.sourceCode
        .getAncestors(node)
        .some((parent) =>
          /^(TSLiteralType|TSTypeAnnotation|TSPropertySignature|TSTemplateLiteralType|TSTypeAliasDeclaration|TSInterfaceDeclaration)$/.test(
            parent.type,
          ),
        );
    const displayed = (node) => {
      let current = node;
      for (let parent = current.parent; parent; parent = current.parent) {
        if (parent.type === 'JSXAttribute') return visibleAttributes.test(parent.name.name);
        if (parent.type === 'JSXExpressionContainer') {
          const target = parent.parent;
          return (
            target.type === 'JSXElement' ||
            target.type === 'JSXFragment' ||
            (target.type === 'JSXAttribute' && visibleAttributes.test(target.name.name))
          );
        }
        if (
          (parent.type === 'ConditionalExpression' && parent.test !== current) ||
          (parent.type === 'LogicalExpression' && parent.right === current) ||
          (parent.type === 'BinaryExpression' && parent.operator === '+') ||
          parent.type === 'TemplateLiteral'
        ) {
          current = parent;
          continue;
        }
        return false;
      }
      return false;
    };
    return {
      Literal(node) {
        if (typeof node.value !== 'string' || typeOnly(node)) return;
        if (korean.test(node.value)) report(node);
        else if (displayed(node) && letters.test(node.value)) report(node);
      },
      TemplateElement(node) {
        const text = node.value.cooked ?? node.value.raw;
        if (!typeOnly(node) && (korean.test(text) || (displayed(node) && letters.test(text))))
          report(node);
      },
      JSXText(node) {
        if (letters.test(node.value)) report(node);
      },
    };
  },
};

export default { rules: { 'no-hardcoded-copy': noHardcodedCopy } };
