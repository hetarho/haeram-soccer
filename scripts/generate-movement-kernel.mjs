/** A small assembler for the finite-state movement phase. No relaxed math or external compiler. */
import { readFileSync, writeFileSync } from 'node:fs';
import { format } from 'prettier';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const u = (x) => {
  const a = [];
  do {
    let b = x & 127;
    x >>>= 7;
    if (x) b |= 128;
    a.push(b);
  } while (x);
  return a;
};
const sec = (id, a) => [id, ...u(a.length), ...a],
  str = (s) => [s.length, ...Buffer.from(s)];
const f64 = (x) => {
  const b = Buffer.alloc(8);
  b.writeDoubleLE(x);
  return [0x44, ...b];
};
const bin = (op, a, b) => [...a, ...b, op],
  un = (op, a) => [...a, op];
const add = (a, b) => bin(0xa0, a, b),
  sub = (a, b) => bin(0xa1, a, b),
  mul = (a, b) => bin(0xa2, a, b),
  div = (a, b) => bin(0xa3, a, b);
const min = (a, b) => bin(0xa4, a, b),
  max = (a, b) => bin(0xa5, a, b),
  eq = (a, b) => bin(0x61, a, b),
  gt = (a, b) => bin(0x64, a, b),
  ge = (a, b) => bin(0x66, a, b),
  le = (a, b) => bin(0x65, a, b),
  lt = (a, b) => bin(0x63, a, b);
const and = (a, b) => bin(0x71, a, b),
  sqrt = (a) => un(0x9f, a),
  abs = (a) => un(0x99, a);
const iff = (c, a, b = []) => [...c, 0x04, 0x40, ...a, ...(b.length ? [0x05, ...b] : []), 0x0b];
const choose = (c, a, b) => [...c, 0x04, 0x7c, ...a, 0x05, ...b, 0x0b];
function fn(params, locals) {
  const names = [...params, ...locals].map((x) => x[0]);
  return {
    get: (n) => [0x20, ...u(names.indexOf(n))],
    set: (n, v) => [...v, 0x21, ...u(names.indexOf(n))],
    body: (ops) => [...u(locals.length), ...locals.flatMap(([, t]) => [1, t]), ...ops, 0x0b],
  };
}
const F = 0x7c,
  I = 0x7f;
const H = fn(
  [
    ['x', F],
    ['y', F],
  ],
  [
    ['a', F],
    ['b', F],
    ['m', F],
    ['p', F],
    ['q', F],
  ],
);
const h = H.get;
const hypot = H.body([
  ...H.set('a', abs(h('x'))),
  ...H.set('b', abs(h('y'))),
  ...H.set('m', choose(gt(h('a'), h('b')), h('a'), h('b'))),
  ...iff(eq(h('m'), f64(0)), [...f64(0), 0x0f]),
  ...H.set('p', div(h('a'), h('m'))),
  ...H.set('q', div(h('b'), h('m'))),
  ...mul(sqrt(add(mul(h('p'), h('p')), mul(h('q'), h('q')))), h('m')),
]);
const params = [
  ['ptr', I],
  ...['h', 't', 'c', 's', 'acc', 'brake', 'arrive', 'length', 'width', 'step'].map((n) => [n, F]),
];
const M = fn(
  params,
  [
    'x',
    'y',
    'vx',
    'vy',
    'tx',
    'ty',
    'dx',
    'dy',
    'dist',
    'speed',
    'ux',
    'uy',
    'hx',
    'hy',
    'cx',
    'cy',
    'ss',
    'facing',
    'stop',
    'want',
    'next',
    'aligned',
  ].map((n) => [n, F]),
);
const g = M.get,
  put = M.set,
  load = (offset) => [...g('ptr'), 0x2b, 3, ...u(offset * 8)],
  store = (offset, v) => [...g('ptr'), ...v, 0x39, 3, ...u(offset * 8)];
const hypotCall = (a, b) => [...a, ...b, 0x10, 0];
const flush = () => [
  ...store(0, g('x')),
  ...store(1, g('y')),
  ...store(2, g('vx')),
  ...store(3, g('vy')),
];
const move = M.body([
  ...put('x', load(0)),
  ...put('y', load(1)),
  ...put('vx', load(2)),
  ...put('vy', load(3)),
  ...put('tx', choose(lt(add(g('t'), f64(1e-9)), load(9)), load(6), load(4))),
  ...put('ty', choose(lt(add(g('t'), f64(1e-9)), load(9)), load(7), load(5))),
  ...iff(
    and(
      and(eq(g('vx'), f64(0)), eq(g('vy'), f64(0))),
      and(eq(g('x'), g('tx')), eq(g('y'), g('ty'))),
    ),
    [0x0f],
  ),
  ...put('dx', sub(g('tx'), g('x'))),
  ...put('dy', sub(g('ty'), g('y'))),
  ...put('dist', hypotCall(g('dx'), g('dy'))),
  ...put(
    'speed',
    choose(and(eq(g('vx'), f64(0)), eq(g('vy'), f64(0))), f64(0), hypotCall(g('vx'), g('vy'))),
  ),
  ...iff(
    and(le(g('dist'), g('arrive')), le(g('speed'), add(mul(g('brake'), g('step')), f64(1e-9)))),
    [
      ...put('x', g('tx')),
      ...put('y', g('ty')),
      ...put('vx', f64(0)),
      ...put('vy', f64(0)),
      ...flush(),
      0x0f,
    ],
  ),
  ...put(
    'ux',
    choose(
      gt(g('dist'), f64(0)),
      div(g('dx'), g('dist')),
      choose(gt(g('speed'), f64(0)), div(g('vx'), g('speed')), f64(1)),
    ),
  ),
  ...put(
    'uy',
    choose(
      gt(g('dist'), f64(0)),
      div(g('dy'), g('dist')),
      choose(gt(g('speed'), f64(0)), div(g('vy'), g('speed')), f64(0)),
    ),
  ),
  ...put('hx', g('ux')),
  ...put('hy', g('uy')),
  ...put('aligned', f64(1)),
  ...iff(gt(g('speed'), f64(1e-9)), [
    ...put('cx', div(g('vx'), g('speed'))),
    ...put('cy', div(g('vy'), g('speed'))),
    ...iff(lt(add(mul(g('cx'), g('ux')), mul(g('cy'), g('uy'))), g('c')), [
      ...put('aligned', f64(0)),
      ...put(
        'ss',
        mul(
          choose(ge(sub(mul(g('cx'), g('uy')), mul(g('cy'), g('ux'))), f64(0)), f64(1), f64(-1)),
          g('s'),
        ),
      ),
      ...put('hx', sub(mul(g('cx'), g('c')), mul(g('cy'), g('ss')))),
      ...put('hy', add(mul(g('cx'), g('ss')), mul(g('cy'), g('c')))),
    ]),
  ]),
  ...put(
    'facing',
    choose(
      gt(g('aligned'), f64(0)),
      f64(1),
      max(f64(0), add(mul(g('hx'), g('ux')), mul(g('hy'), g('uy')))),
    ),
  ),
  ...put(
    'stop',
    mul(
      g('brake'),
      sub(
        sqrt(add(div(mul(g('h'), g('h')), f64(4)), div(mul(f64(2), g('dist')), g('brake')))),
        div(g('h'), f64(2)),
      ),
    ),
  ),
  ...put('want', mul(min(load(8), g('stop')), g('facing'))),
  ...put(
    'next',
    choose(
      gt(g('want'), g('speed')),
      min(g('want'), add(g('speed'), mul(g('acc'), g('h')))),
      max(g('want'), sub(g('speed'), mul(g('brake'), g('h')))),
    ),
  ),
  ...put('vx', mul(g('hx'), g('next'))),
  ...put('vy', mul(g('hy'), g('next'))),
  ...iff(
    and(
      and(gt(g('dist'), f64(0)), gt(g('aligned'), f64(0))),
      ge(mul(g('next'), g('h')), g('dist')),
    ),
    [...put('x', g('tx')), ...put('y', g('ty'))],
    [
      ...put('x', max(f64(0), min(g('length'), add(g('x'), mul(g('vx'), g('h')))))),
      ...put('y', max(f64(0), min(g('width'), add(g('y'), mul(g('vy'), g('h')))))),
    ],
  ),
  ...flush(),
]);
const S = fn([['count', I], ...params.slice(1)], [['i', I]]),
  s = S.get;
const loop = S.body([
  0x41,
  0,
  0x21,
  11,
  0x02,
  0x40,
  0x03,
  0x40,
  ...s('i'),
  ...s('count'),
  0x4f,
  0x0d,
  1,
  ...s('i'),
  0x41,
  80,
  0,
  0x6c, // signed LEB 80 is 0xd0,0x00, patched below
  ...params.slice(1).flatMap(([n]) => s(n)),
  0x10,
  1,
  ...s('i'),
  0x41,
  1,
  0x6a,
  0x21,
  11,
  0x0c,
  0,
  0x0b,
  0x0b,
]);
// i32.const uses signed LEB: +80 = d0 00, rather than the unsigned single byte 50.
for (let i = 0; i < loop.length - 4; i++)
  if (loop[i] === 0x41 && loop[i + 1] === 80 && loop[i + 2] === 0 && loop[i + 3] === 0x6c)
    loop[i + 1] = 0xd0;
const type = (p, r) => [0x60, ...u(p.length), ...p, ...u(r.length), ...r];
const bytes = new Uint8Array([
  0,
  97,
  115,
  109,
  1,
  0,
  0,
  0,
  ...sec(1, [
    3,
    ...type([F, F], [F]),
    ...type(
      params.map(([, t]) => t),
      [],
    ),
    ...type([I, ...params.slice(1).map(([, t]) => t)], []),
  ]),
  ...sec(3, [3, 0, 1, 2]),
  ...sec(5, [1, 0, 1]),
  ...sec(7, [2, ...str('step'), 0, 2, ...str('memory'), 2, 0]),
  ...sec(10, [
    3,
    ...u(hypot.length),
    ...hypot,
    ...u(move.length),
    ...move,
    ...u(loop.length),
    ...loop,
  ]),
]);
if (!WebAssembly.validate(bytes)) new WebAssembly.Module(bytes);
const output = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../packages/engine/src/grid/movement-kernel.generated.ts',
);
const source = await format(
  `// Generated by scripts/generate-movement-kernel.mjs. Edit the generator, not these bytes.
export const MOVEMENT_KERNEL_STRIDE = 10;
export const MOVEMENT_KERNEL_BYTES = new Uint8Array(${JSON.stringify([...bytes])});
`,
  { parser: 'typescript' },
);
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== source) throw new Error('Movement kernel bytes are stale');
} else writeFileSync(output, source);
console.log(
  `Movement kernel ${bytes.length} bytes: ${process.argv.includes('--check') ? 'current' : 'generated'}`,
);
