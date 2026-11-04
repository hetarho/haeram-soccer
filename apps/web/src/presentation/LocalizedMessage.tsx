import { cloneElement, Fragment, isValidElement, type ReactNode } from 'react';
import { message, type SourceMessageId } from '../../../../packages/contracts/src/messages';
import { currentTextLocale, localizeValue, useTextLocale } from './text';
import { verbatimParameters } from '../../../../packages/contracts/src/message-parameters';

/** Whole sentences keep inline links/emphasis as reorderable translation parameters. */
export function LocalizedMessage({
  id,
  values = {},
}: {
  id: SourceMessageId;
  values?: Readonly<Record<string, ReactNode>>;
}) {
  useTextLocale();
  return richMessage(id, values);
}

/** Pure render helper for components already subscribed with useTextLocale. */
export function richMessage(
  id: SourceMessageId,
  values: Readonly<Record<string, ReactNode>> = {},
): ReactNode {
  const locale = currentTextLocale();
  const placeholders = Object.fromEntries(Object.keys(values).map((name) => [name, `{${name}}`]));
  const template = locale?.t(id, placeholders) ?? message(id, placeholders);
  if (!Object.keys(values).length) return template;
  return template
    .split(/(\{[A-Za-z_][A-Za-z0-9_]*\})/g)
    .filter(Boolean)
    .map((part, index) => {
      const name = part.slice(1, -1);
      const value = Object.hasOwn(values, name)
        ? verbatimParameters[id]?.includes(name)
          ? values[name]
          : localizeValue(values[name])
        : part;
      if (isValidElement(value)) return cloneElement(value, { key: index });
      if (Array.isArray(value)) return <Fragment key={index}>{value}</Fragment>;
      return value;
    });
}
