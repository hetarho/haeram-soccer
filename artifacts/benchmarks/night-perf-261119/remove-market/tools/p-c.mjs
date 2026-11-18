// Cheap path (results identical): D2i4 + D1k + D4 + D5a.
import flag from './p-npcflag.mjs'; import d2 from './p-d2i4.mjs'; import d1k from './p-d1k.mjs'; import d4 from './p-d4.mjs'; import d5a from './p-d5a.mjs';
export default [...flag, ...d2.slice(flag.length), ...d1k.slice(flag.length), ...d4, ...d5a];
