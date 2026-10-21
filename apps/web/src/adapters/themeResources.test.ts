import { afterEach, describe, expect, it, vi } from 'vitest';
import pixelData from '../../public/presentation/themes/pixel.json';
import { validateThemePack } from '../presentation/contracts';
import { createThemeResolver } from '../presentation/theme';
import {
  createBrowserThemePorts,
  installThemeResources,
  ThemeInstallationError,
  type StagedThemeResource,
  type ThemeInstallationPorts,
} from './themeResources';

function theme(id = 'pixel') {
  const pack = validateThemePack(structuredClone(pixelData));
  pack.id = id;
  pack.tokens.palette.bg = id === 'pixel' ? '#111415' : '#fafafa';
  return createThemeResolver(pack, { url: `/presentation/themes/${id}.json` });
}

function memoryPorts() {
  const active = new Set<string>(['unowned']);
  const resources: { id: string; disposed: boolean }[] = [];
  const events: string[] = [];
  let serial = 0;
  const make = (kind: string): StagedThemeResource => {
    const record = { id: `${kind}:${serial++}`, disposed: false };
    resources.push(record);
    events.push(`stage:${record.id}`);
    return {
      activate() {
        events.push(`activate:${record.id}`);
        active.add(record.id);
      },
      dispose() {
        record.disposed = true;
        active.delete(record.id);
      },
    };
  };
  const tokens = new Map<string, string>();
  const ports: ThemeInstallationPorts = {
    stageFont: async (font) => make(`font:${font.family}:${font.weight}`),
    stageStylesheet: async (url) => make(`css:${url}`),
    installTokens(resolver) {
      const id = `tokens:${serial++}`;
      tokens.set(id, resolver.token('bg'));
      events.push(`tokens:${resolver.id}`);
      return {
        dispose: () => {
          tokens.delete(id);
        },
      };
    },
  };
  return { ports, active, resources, tokens, events };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('theme resource installation', () => {
  it('retains the usable theme on a failed resource', async () => {
    const memory = memoryPorts();
    const previous = await installThemeResources(theme(), { ports: memory.ports });
    const originalActive = [...memory.active];
    const candidateStart = memory.resources.length;
    const failedPorts: ThemeInstallationPorts = {
      ...memory.ports,
      stageFont: async (font) => {
        if (font.weight === '600 900') throw new Error('Missing font');
        return memory.ports.stageFont(font);
      },
    };
    await expect(
      installThemeResources(theme('unseen'), {
        ports: failedPorts,
        previous: previous!,
      }),
    ).rejects.toMatchObject({ retryable: true, cause: expect.any(Error) });
    expect([...memory.active]).toEqual(originalActive);
    expect([...memory.tokens.values()]).toEqual(['#111415']);
    expect(memory.resources.slice(candidateStart).every((resource) => resource.disposed)).toBe(
      true,
    );
    previous!.dispose();
  });

  it('releases replaced styles and font resources', async () => {
    const memory = memoryPorts();
    const previous = await installThemeResources(theme(), { ports: memory.ports });
    const oldResources = [...memory.resources];
    const next = await installThemeResources(theme('unseen'), {
      ports: memory.ports,
      previous: previous!,
    });
    expect(oldResources.every((resource) => resource.disposed)).toBe(true);
    expect([...memory.tokens.values()]).toEqual(['#fafafa']);
    expect(memory.active.has('unowned')).toBe(true);
    next!.dispose();
    next!.dispose();
    expect([...memory.active]).toEqual(['unowned']);
    expect(memory.tokens.size).toBe(0);
    expect(memory.resources.every((resource) => resource.disposed)).toBe(true);
  });

  it('checks currency immediately before activation and disposes stale staged resources', async () => {
    const memory = memoryPorts();
    const gate = deferred();
    let current = true;
    const waitingPorts: ThemeInstallationPorts = {
      ...memory.ports,
      stageStylesheet: async (url) => {
        await gate.promise;
        return memory.ports.stageStylesheet(url);
      },
    };
    const request = installThemeResources(theme(), {
      ports: waitingPorts,
      isCurrent: () => {
        memory.events.push('current');
        return current;
      },
    });
    await Promise.resolve();
    expect(memory.events.some((event) => event.startsWith('activate:'))).toBe(false);
    current = false;
    gate.resolve();
    expect(await request).toBeNull();
    expect(memory.events.at(-1)).toBe('current');
    expect([...memory.active]).toEqual(['unowned']);
    expect(memory.tokens.size).toBe(0);
    expect(memory.resources.every((resource) => resource.disposed)).toBe(true);

    current = true;
    await installThemeResources(theme(), {
      ports: memory.ports,
      isCurrent: () => {
        memory.events.push('current');
        return current;
      },
    });
    const checked = memory.events.lastIndexOf('current');
    expect(memory.events[checked + 1]).toMatch(/^activate:/);
  });

  it('rolls back a synchronous activation failure without releasing the previous theme', async () => {
    const memory = memoryPorts();
    const previous = await installThemeResources(theme(), { ports: memory.ports });
    const original = [...memory.active];
    await expect(
      installThemeResources(theme('unseen'), {
        previous: previous!,
        ports: {
          ...memory.ports,
          installTokens: () => {
            throw new Error('Style unavailable');
          },
        },
      }),
    ).rejects.toBeInstanceOf(ThemeInstallationError);
    expect([...memory.active]).toEqual(original);
    expect([...memory.tokens.values()]).toEqual(['#111415']);
    previous!.dispose();
  });

  it('cleans successful staging after a stylesheet or synchronous port failure', async () => {
    for (const synchronous of [false, true]) {
      const memory = memoryPorts();
      const stageStylesheet = () => {
        if (synchronous) throw new Error('Synchronous port failure');
        return Promise.reject(new Error('Missing CSS'));
      };
      await expect(
        installThemeResources(theme(), {
          ports: { ...memory.ports, stageStylesheet },
        }),
      ).rejects.toBeInstanceOf(ThemeInstallationError);
      expect(memory.resources.length).toBeGreaterThan(0);
      expect(memory.resources.every((resource) => resource.disposed)).toBe(true);
      expect([...memory.active]).toEqual(['unowned']);
    }
  });

  it('loads only selected fonts and optional CSS without preloading facility images', async () => {
    const resolver = theme();
    const memory = memoryPorts();
    const stageFont = vi.fn(memory.ports.stageFont);
    const stageStylesheet = vi.fn(memory.ports.stageStylesheet);
    const installed = await installThemeResources(resolver, {
      ports: { ...memory.ports, stageFont, stageStylesheet },
    });
    expect(stageFont.mock.calls.map(([font]) => font)).toEqual(resolver.fonts);
    expect(stageStylesheet).toHaveBeenCalledExactlyOnceWith('/presentation/themes/pixel.css');
    expect(memory.events.every((event) => !event.includes('/art/'))).toBe(true);
    installed!.dispose();
  });
});

afterEach(() => vi.unstubAllGlobals());

it('browser ports remove only the fonts and styles they own', async () => {
  class FakeFontFace {
    constructor(
      readonly family: string,
      readonly source: string,
      readonly descriptors: FontFaceDescriptors,
    ) {}
    async load() {
      return this;
    }
  }
  vi.stubGlobal('FontFace', FakeFontFace);
  const foreignFont = {};
  const fonts = new Set<unknown>([foreignFont]);
  const nodes = new Set<object>();
  const properties = new Map<string, string>();
  const document = {
    fonts,
    head: {
      append: (node: object) => {
        nodes.add(node);
      },
    },
    createElement: () => ({
      dataset: {},
      sheet: {
        cssRules: [
          { style: { setProperty: (key: string, value: string) => properties.set(key, value) } },
        ],
      },
      remove() {
        nodes.delete(this);
      },
    }),
  } as unknown as Document;
  const ports = createBrowserThemePorts(document);
  const resolver = theme();
  const candidate = await ports.stageFont(resolver.fonts[0]);
  expect(fonts.size).toBe(1);
  candidate.activate();
  expect(fonts.size).toBe(2);
  const style = ports.installTokens(resolver);
  expect(properties.get('--bg')).toBe('#111415');
  expect(properties.get('--display')).toContain('Haeram Presentation Display');
  expect(properties.get('color-scheme')).toBe('dark');
  candidate.dispose();
  style.dispose();
  expect([...fonts]).toEqual([foreignFont]);
  expect(nodes.size).toBe(0);
});
