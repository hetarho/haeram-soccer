import { useEffect, useRef, useState } from 'react';

/** A read's state: loading, its answer, or the reason it failed. */
export type Read<T> =
  { status: 'loading' } | { status: 'ready'; value: T } | { status: 'failed'; error: string };

const LOADING = { status: 'loading' } as const;

/**
 * Reads `load` once per `key` (a worker read, typically) and drops an answer that arrives after
 * the key changed or the component left. `keep` shows the last answer while a newer key loads, so
 * a refresh replaces it in place; without it a new key reads as loading. No key reads nothing.
 */
export function useRead<T>(
  key: string | undefined,
  load: () => Promise<T>,
  { keep = false }: { keep?: boolean } = {},
): Read<T> {
  const [held, setHeld] = useState<{ key: string; read: Read<T> }>();
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    if (key === undefined) return;
    let live = true;
    loader.current().then(
      (value) => live && setHeld({ key, read: { status: 'ready', value } }),
      (error: unknown) =>
        live &&
        setHeld({
          key,
          read: { status: 'failed', error: error instanceof Error ? error.message : String(error) },
        }),
    );
    return () => {
      live = false;
    };
  }, [key]);
  if (!held) return LOADING;
  if (held.key === key) return held.read;
  return keep && held.read.status === 'ready' ? held.read : LOADING;
}
