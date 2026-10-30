/** Test-only browser worker: same production engine, explicit backend fault injection. */
import { createWorld, MATCH_MODEL_RELEASE } from '../../packages/engine/src/index';
import { buildGridSetup } from '../../packages/engine/src/grid/setup';
import { playGrid } from '../../packages/engine/src/grid/engine';

export type MovementProbeMode = 'native' | 'missing' | 'compile-error' | 'execution-error';
function valueKey(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') return 'number:' + (Object.is(value, -0) ? '-0' : String(value));
  if (typeof value === 'string') return 'string:' + JSON.stringify(value);
  if (typeof value === 'boolean' || typeof value === 'undefined')
    return typeof value + ':' + String(value);
  if (Array.isArray(value)) return '[' + value.map(valueKey).join(',') + ']';
  if (ArrayBuffer.isView(value))
    return (
      value.constructor.name +
      ':' +
      [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)]
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('')
    );
  return (
    '{' +
    Object.keys(value as object)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + valueKey((value as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}
self.onmessage = async (event: MessageEvent<{ mode: MovementProbeMode }>) => {
  try {
    const mode = event.data.mode,
      native = globalThis.WebAssembly;
    const capable = !!native && new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
    let compilations = 0,
      steps = 0;
    if (mode === 'missing') Reflect.set(globalThis, 'WebAssembly', undefined);
    else if (native) {
      const Module = new Proxy(native.Module, {
        construct(target, args) {
          compilations++;
          if (mode === 'compile-error') throw new Error('probe compile failure');
          return Reflect.construct(target, args);
        },
      });
      const Instance = new Proxy(native.Instance, {
        construct(target, args) {
          const instance = Reflect.construct(target, args) as WebAssembly.Instance;
          return {
            exports: {
              ...instance.exports,
              step: (...values: number[]) => {
                steps++;
                if (mode === 'execution-error' && steps === 2)
                  throw new Error('probe execution failure');
                return Reflect.apply(instance.exports.step as CallableFunction, undefined, values);
              },
            },
          };
        },
      });
      Reflect.set(native, 'Module', Module);
      Reflect.set(native, 'Instance', Instance);
    }
    const w = createWorld(
      {
        country: 'ENG',
        name: 'Browser Movement',
        color: '#234567',
        seed: 'browser-movement-parity',
        level: 'easy',
      },
      MATCH_MODEL_RELEASE,
    );
    const fixture = w.fixtures.find((f) => f.home === w.playerClub || f.away === w.playerClub)!;
    const result = playGrid(buildGridSetup(w, fixture, { observe: true, recordPlayers: true }));
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(valueKey(result)));
    const digest = [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, '0')).join('');
    self.postMessage({ digest, capable, compilations, steps });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
