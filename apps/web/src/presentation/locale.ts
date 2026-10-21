import {
  getMessageParameters,
  PresentationValidationError,
  selectPluralTemplate,
  validateLocalePack,
  type LocalePack,
  type LocaleRegistryEntry,
  type MessageParameters,
  type PackRegistry,
  type TextDirection,
} from './contracts';
import { validateRegistry } from './registry';

export interface LocaleDiagnostic {
  readonly code: 'missing-message' | 'missing-parameter' | 'invalid-plural-parameter';
  readonly locale: string;
  readonly messageId: string;
  readonly parameter?: string;
  readonly message: string;
}
export interface TranslatorOptions {
  onDiagnostic?: (diagnostic: LocaleDiagnostic) => void;
}
export type Translator = (id: string, parameters?: MessageParameters) => string;

function developmentDiagnostic(diagnostic: LocaleDiagnostic) {
  if (import.meta.env.DEV) console.warn(`[presentation:locale] ${diagnostic.message}`, diagnostic);
}

/** Inputs have been validated and copied, so callers cannot change an active translator. */
function translatorFor(
  pack: LocalePack,
  defaultPack: LocalePack,
  options: TranslatorOptions,
): Translator {
  const report = options.onDiagnostic ?? developmentDiagnostic;
  return (messageId, parameters = {}) => {
    const reportMissing = (parameter: string) =>
      report({
        code: 'missing-parameter',
        locale: pack.id,
        messageId,
        parameter,
        message: `Missing parameter "${parameter}" for message "${messageId}" (${pack.id}).`,
      });
    let message = Object.hasOwn(pack.messages, messageId) ? pack.messages[messageId] : undefined;
    let messageLocale = pack.id;
    if (message === undefined) {
      messageLocale = defaultPack.id;
      message = Object.hasOwn(defaultPack.messages, messageId)
        ? defaultPack.messages[messageId]
        : undefined;
      report({
        code: 'missing-message',
        locale: pack.id,
        messageId,
        message: `Missing message "${messageId}" (${pack.id}); using ${message === undefined ? 'its ID' : `the registered default (${defaultPack.id})`}.`,
      });
    }
    if (message === undefined) return `[${messageId}]`;
    for (const parameter of getMessageParameters(message))
      if (!Object.hasOwn(parameters, parameter)) reportMissing(parameter);

    let template: string;
    if (typeof message === 'string') template = message;
    else {
      const count = Object.hasOwn(parameters, message.plural)
        ? parameters[message.plural]
        : undefined;
      if (
        Object.hasOwn(parameters, message.plural) &&
        (typeof count !== 'number' || !Number.isFinite(count))
      )
        report({
          code: 'invalid-plural-parameter',
          locale: pack.id,
          messageId,
          parameter: message.plural,
          message: `Plural parameter "${message.plural}" for message "${messageId}" (${pack.id}) must be a finite number.`,
        });
      template =
        typeof count === 'number' && Number.isFinite(count)
          ? selectPluralTemplate(message, messageLocale, count)
          : message.forms.other;
    }
    // A callback replaces once: braces, "$&" and markup inside values stay ordinary text.
    return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (placeholder, name: string) =>
      Object.hasOwn(parameters, name) ? String(parameters[name]) : placeholder,
    );
  };
}

export function createTranslator(
  pack: LocalePack,
  defaultPack: LocalePack = pack,
  options: TranslatorOptions = {},
): Translator {
  const baseline = validateLocalePack(defaultPack);
  return translatorFor(validateLocalePack(pack, baseline), baseline, options);
}

export type LocaleDateOptions = Omit<Intl.DateTimeFormatOptions, 'timeZone' | 'calendar'>;
export interface LocaleFormatters {
  readonly locale: string;
  /** Existing display-count rounding, including Math.round's negative-half behavior. */
  readonly number: (value: number | bigint) => string;
  /** Callers retain ownership of precision, truncation and historical currency units. */
  readonly decimal: (value: number | bigint, options?: Intl.NumberFormatOptions) => string;
  readonly numberParts: (
    value: number | bigint,
    options?: Intl.NumberFormatOptions,
  ) => Intl.NumberFormatPart[];
  /** The caller supplies a UTC game-calendar instant, never a device-local date. */
  readonly gameDate: (value: Date | number, options?: LocaleDateOptions) => string;
}

export function createLocaleFormatters(locale: string): LocaleFormatters {
  const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat(locale);
  const gameDate = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
    calendar: 'gregory',
  });
  return Object.freeze({
    locale,
    number: (value: number | bigint) =>
      integer.format(typeof value === 'number' ? Math.round(value) : value),
    decimal: (value: number | bigint, options?: Intl.NumberFormatOptions) =>
      (options ? new Intl.NumberFormat(locale, options) : decimal).format(value),
    numberParts: (value: number | bigint, options?: Intl.NumberFormatOptions) =>
      (options ? new Intl.NumberFormat(locale, options) : decimal).formatToParts(value),
    gameDate: (value: Date | number, options?: LocaleDateOptions) =>
      (options
        ? new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC', calendar: 'gregory' })
        : gameDate
      ).format(value),
  });
}

type Immutable<T> = T extends object ? { readonly [Key in keyof T]: Immutable<T[Key]> } : T;
export interface LoadedLocale {
  readonly id: string;
  readonly label: string;
  readonly direction: TextDirection;
  readonly entry: Readonly<LocaleRegistryEntry>;
  readonly pack: Immutable<LocalePack>;
  readonly defaultPack: Immutable<LocalePack>;
  readonly t: Translator;
  readonly formatters: LocaleFormatters;
}

function freezePack(pack: LocalePack): Immutable<LocalePack> {
  for (const message of Object.values(pack.messages))
    if (typeof message !== 'string') {
      Object.freeze(message.forms);
      Object.freeze(message);
    }
  Object.freeze(pack.messages);
  return Object.freeze(pack);
}

/** Registry metadata is the only identity, self-name and text-direction authority. */
export function createLoadedLocale(
  registry: PackRegistry<'locale'>,
  pack: LocalePack,
  defaultPack: LocalePack = pack,
  options: TranslatorOptions = {},
): LoadedLocale {
  const checkedRegistry = validateRegistry(registry, 'locale');
  const baseline = validateLocalePack(defaultPack);
  if (baseline.id !== checkedRegistry.defaultId)
    throw new PresentationValidationError('Locale baseline differs from the registered default');
  const selected = validateLocalePack(pack, baseline);
  const entry = checkedRegistry.entries.find((candidate) => candidate.id === selected.id);
  if (!entry) throw new PresentationValidationError('Locale pack is absent from its registry');
  return Object.freeze({
    id: entry.id,
    label: entry.label,
    direction: entry.direction,
    entry: Object.freeze(entry),
    pack: freezePack(selected),
    defaultPack: freezePack(baseline),
    t: translatorFor(selected, baseline, options),
    formatters: createLocaleFormatters(entry.id),
  });
}
