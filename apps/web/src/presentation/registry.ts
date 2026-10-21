import { z } from 'zod';
import {
  packIdSchema,
  localeIdSchema,
  parsePresentation,
  PresentationValidationError,
  relativeResourceSchema,
  isResourceReference,
  type PackKind,
  type PackRegistry,
  type RegistryEntry,
} from './contracts';

export const PRESENTATION_PATHS = {
  locale: '/presentation/locales/index.json',
  theme: '/presentation/themes/index.json',
} as const;

const entryFields = {
  id: packIdSchema,
  label: z.string().trim().min(1),
  resource: relativeResourceSchema,
};
const entrySchemas = {
  locale: z.strictObject({ ...entryFields, id: localeIdSchema, direction: z.enum(['ltr', 'rtl']) }),
  theme: z.strictObject(entryFields),
};

export function validateRegistry<K extends PackKind>(value: unknown, kind: K): PackRegistry<K> {
  const registry = parsePresentation(
    z.strictObject({
      schemaVersion: z.literal(1),
      defaultId: packIdSchema,
      entries: z.array(entrySchemas[kind]).min(1),
    }),
    value,
    `${kind} registry`,
  );
  const ids = new Set<string>();
  for (const entry of registry.entries) {
    if (ids.has(entry.id))
      throw new PresentationValidationError(`Duplicate registry ID: ${entry.id}`);
    ids.add(entry.id);
  }
  if (!ids.has(registry.defaultId))
    throw new PresentationValidationError('Registry default is absent from entries');
  return registry as PackRegistry<K>;
}

export function resolvePackEntry<K extends PackKind>(
  registry: PackRegistry<K>,
  selectedId?: string | null,
): RegistryEntry<K> {
  const entry =
    registry.entries.find((candidate) => candidate.id === selectedId) ??
    registry.entries.find((candidate) => candidate.id === registry.defaultId);
  if (!entry) throw new PresentationValidationError('Registry default is absent from entries');
  return entry;
}

// A synthetic origin lets pure callers resolve deployment-root paths without a browser global.
const RESOLUTION_ORIGIN = 'https://presentation.invalid';
export function resolveResourceUrl(resource: string, declaringUrl: string): string {
  if (!isResourceReference(resource))
    throw new PresentationValidationError('Expected a local resource URL');
  const base = new URL(declaringUrl, RESOLUTION_ORIGIN);
  if (!['http:', 'https:'].includes(base.protocol))
    throw new PresentationValidationError('Expected an HTTP resource base');
  const resolved = new URL(resource, base);
  if (resolved.origin !== base.origin)
    throw new PresentationValidationError('Presentation resources must have the same origin');
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(declaringUrl)
    ? resolved.href
    : `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

export function resolveRegistryUrl(kind: PackKind, baseUrl = '/'): string {
  return resolveResourceUrl(PRESENTATION_PATHS[kind], baseUrl);
}
export function resolvePackUrl(entry: RegistryEntry, registryUrl: string): string {
  if (!isResourceReference(entry.resource, true))
    throw new PresentationValidationError('Expected a relative pack URL');
  return resolveResourceUrl(entry.resource, registryUrl);
}
