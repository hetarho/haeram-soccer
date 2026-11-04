import ts from 'typescript';

/** Source prose without comment markers; shared by generated rule inventories. */
function clean(raw: string): string {
  return raw
    .replace(/^\/\*\*?|\*\/$/g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*(\*|\/\/)\s?/, '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

export function leadingComment(text: string, node: ts.Node): string {
  return (ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [])
    .map((range) => clean(text.slice(range.pos, range.end)))
    .join(' ');
}

export function trailingComment(text: string, node: ts.Node): string {
  const end = text[node.getEnd()] === ',' ? node.getEnd() + 1 : node.getEnd();
  return (ts.getTrailingCommentRanges(text, end) ?? [])
    .map((range) => clean(text.slice(range.pos, range.end)))
    .join(' ');
}
