import { message, type SourceMessageId } from '../../../../packages/contracts/src/messages';
import descriptions from './tunables.ko.json';

export const TUNABLE_DESCRIPTIONS = descriptions as {
  groups: Record<string, SourceMessageId>;
  leaves: Record<string, { control: SourceMessageId; message: SourceMessageId; unit?: string }>;
};

/** A translated noun parameter inside one complete sentence; paths themselves remain code names. */
export function tunableDescription(
  path: string,
  render: (id: SourceMessageId, parameters?: Record<string, string | number>) => string = message,
): string {
  const description = TUNABLE_DESCRIPTIONS.leaves[path];
  if (!description) return '';
  return render(description.message, {
    control: render(description.control),
    ...(description.unit && { unit: description.unit }),
  });
}
