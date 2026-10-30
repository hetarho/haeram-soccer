/** Test-only browser worker: same production engine, explicit backend fault injection. */
import { createWorld, MATCH_MODEL_RELEASE } from '../../packages/engine/src/index';
import { buildGridSetup } from '../../packages/engine/src/grid/setup';
import { playGrid } from '../../packages/engine/src/grid/engine';
import { MOVEMENT_KERNEL_VALUES } from '../../packages/engine/src/grid/movement-kernel';

export type MovementProbeMode = 'native' | 'missing-wasm' | 'allocation-error' | 'execution-error';
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
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    throw new Error('Unsupported movement-probe output: ' + String(value));
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
      native = globalThis.Float64Array;
    let allocations = 0,
      reads = 0;
    if (mode === 'missing-wasm') Reflect.set(globalThis, 'WebAssembly', undefined);
    // Only the private movement slab is intercepted. Other engine arrays keep native behaviour.
    Reflect.set(
      globalThis,
      'Float64Array',
      new Proxy(native, {
        construct(target, args) {
          if (args.length !== 1 || args[0] !== MOVEMENT_KERNEL_VALUES)
            return Reflect.construct(target, args);
          allocations++;
          if (mode === 'allocation-error') throw new Error('probe allocation failure');
          return new Proxy(Reflect.construct(target, args) as Float64Array, {
            get(data, key) {
              if (key === '0') {
                reads++;
                // One finite-input read, then the first substep; fail inside the second substep.
                if (mode === 'execution-error' && reads === 3)
                  throw new Error('probe execution failure');
              }
              return Reflect.get(data, key, data);
            },
          });
        },
      }),
    );
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
    self.postMessage({ digest, allocations, reads });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
