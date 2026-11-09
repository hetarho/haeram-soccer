import english from '../../apps/web/public/presentation/locales/en-GB.json';
import {
  type MessageParameters,
  validateLocalePack,
} from '../../apps/web/src/presentation/contracts';
import { createTranslator } from '../../apps/web/src/presentation/locale';
import type { SourceMessageId } from '../../packages/contracts/src/messages';

/** Canonical CLI presentation is English, independent of browser or operating-system preferences. */
const pack = validateLocalePack(english);
const translate = createTranslator(pack, pack, {
  onDiagnostic(diagnostic) {
    throw new Error(diagnostic.message);
  },
});

export const toolMessage = (id: SourceMessageId, parameters?: MessageParameters) =>
  translate(id, parameters);
