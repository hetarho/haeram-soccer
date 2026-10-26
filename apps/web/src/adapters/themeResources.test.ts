import { afterEach, describe, expect, it, vi } from 'vitest';
import pixelData from '../../public/presentation/themes/pixel.json';
import { validateThemePack } from '../presentation/contracts';
import { createThemeResolver } from '../presentation/theme';
import {
  createBrowserThemePorts,
  installThemeResources,
  prepareThemeResources,
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
  const resources: { id: string; disposed: boolean; disposeCalls: number }[] = [];
  const events: string[] = [];
  let serial = 0;
  const make = (kind: string): StagedThemeResource => {
    const record = { id: `${kind}:${serial++}`, disposed: false, disposeCalls: 0 };
    resources.push(record);
    events.push(`stage:${record.id}`);
    return {
      activate() {
        events.push(`activate:${record.id}`);
        active.add(record.id);
      },
      dispose() {
        record.disposed = true;
        record.disposeCalls++;
        active.delete(record.id);
      },
    };
  };
  const tokens = new Map<string, string>();
  const ports: ThemeInstallationPorts = {
    stageFont: async (font) => make(`font:${font.family}:${font.weight}`),
    stageStylesheet: async (url) => make(`css:${url}`),
    stageImage: async (url) => make(`image:${url}`),
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
  it('prepares without activation and disposes abandoned staging exactly once', async () => {
    const memory = memoryPorts();
    const previous = await installThemeResources(theme(), { ports: memory.ports });
    const originalActive = [...memory.active];
    const candidateStart = memory.resources.length;
    const prepared = await prepareThemeResources(theme('next'), {
      ports: memory.ports,
      requiredImages: ['/art/scenes/heritage/stadium-0.webp'],
    });
    expect([...memory.active]).toEqual(originalActive);
    expect([...memory.tokens.values()]).toEqual(['#111415']);
    expect(memory.resources.slice(candidateStart).every((resource) => !resource.disposed)).toBe(
      true,
    );
    prepared.dispose();
    prepared.dispose();
    expect(
      memory.resources.slice(candidateStart).every((resource) => resource.disposeCalls === 1),
    ).toBe(true);
    expect([...memory.active]).toEqual(originalActive);
    expect(() => prepared.commit({ previous: previous! })).toThrow(ThemeInstallationError);
    previous!.dispose();
  });

  it('rejects currency invalidated by a preparation completion observer before commit', async () => {
    const memory = memoryPorts();
    const previous = await installThemeResources(theme(), { ports: memory.ports });
    const originalActive = [...memory.active];
    const candidateStart = memory.resources.length;
    let current = true;
    const request = prepareThemeResources(theme('next'), { ports: memory.ports });
    void request.then(() => {
      current = false;
    });
    const prepared = await request;
    expect(current).toBe(false);
    expect(prepared.commit({ previous: previous!, isCurrent: () => current })).toBeNull();
    expect([...memory.active]).toEqual(originalActive);
    expect([...memory.tokens.values()]).toEqual(['#111415']);
    expect(
      memory.resources.slice(candidateStart).every((resource) => resource.disposeCalls === 1),
    ).toBe(true);
    expect(() => prepared.commit()).toThrow(ThemeInstallationError);
    previous!.dispose();
  });

  it('commits and transfers ownership synchronously for selection publication', async () => {
    const memory = memoryPorts();
    const previous = await installThemeResources(theme(), { ports: memory.ports });
    const oldResources = [...memory.resources];
    const prepared = await prepareThemeResources(theme('next'), { ports: memory.ports });
    queueMicrotask(() => memory.events.push('microtask'));
    const installed = prepared.commit({
      previous: previous!,
      isCurrent: () => {
        memory.events.push('current');
        return true;
      },
    });
    memory.events.push('publish');
    expect(installed).not.toBeInstanceOf(Promise);
    expect(memory.events.at(-1)).toBe('publish');
    expect(memory.events[memory.events.lastIndexOf('current') + 1]).toMatch(/^activate:/);
    expect(oldResources.every((resource) => resource.disposeCalls === 1)).toBe(true);
    expect([...memory.tokens.values()]).toEqual(['#fafafa']);
    const installedActive = [...memory.active];
    prepared.dispose();
    expect(() => prepared.commit()).toThrow(ThemeInstallationError);
    expect([...memory.active]).toEqual(installedActive);
    await Promise.resolve();
    expect(memory.events.at(-1)).toBe('microtask');
    installed!.dispose();
    installed!.dispose();
    expect(memory.resources.every((resource) => resource.disposeCalls === 1)).toBe(true);
    expect([...memory.active]).toEqual(['unowned']);
  });

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

  it('loads selected fonts, image icons and optional CSS without preloading facility scenes', async () => {
    const resolver = theme();
    const memory = memoryPorts();
    const stageFont = vi.fn(memory.ports.stageFont);
    const stageStylesheet = vi.fn(memory.ports.stageStylesheet);
    const stageImage = vi.fn(memory.ports.stageImage);
    const installed = await installThemeResources(resolver, {
      ports: { ...memory.ports, stageFont, stageStylesheet, stageImage },
    });
    expect(stageFont.mock.calls.map(([font]) => font)).toEqual(resolver.fonts);
    expect(stageStylesheet).toHaveBeenCalledExactlyOnceWith('/presentation/themes/pixel.css');
    expect(stageImage.mock.calls.map(([url]) => url)).toEqual(resolver.iconImages);
    installed!.dispose();
  });

  it('retains the usable theme when a currently needed image icon or scene fails', async () => {
    for (const missing of ['icon', 'scene']) {
      const memory = memoryPorts();
      const previous = await installThemeResources(theme(), { ports: memory.ports });
      const originalActive = [...memory.active];
      const candidateStart = memory.resources.length;
      const pack = validateThemePack(structuredClone(pixelData));
      pack.id = 'image-test';
      pack.icons.home = { default: { type: 'image', resource: 'missing-nav.webp' } };
      pack.images.facility.overrides = { 'heritage.stadium.0': 'missing-stadium.webp' };
      const candidate = createThemeResolver(pack, { url: '/packs/image-test/theme.json' });
      const icon = candidate.icon('home');
      if (icon.type !== 'image') throw new Error('Expected an image icon');
      const scene = candidate.facility({ era: 'heritage', kind: 'stadium', stage: 0 });
      const failedUrl = missing === 'icon' ? icon.resource : scene.src;
      const stageImage = vi.fn(async (url: string) => {
        if (url === failedUrl) throw new Error('Missing required image');
        return memory.ports.stageImage(url);
      });
      await expect(
        installThemeResources(candidate, {
          ports: { ...memory.ports, stageImage },
          previous: previous!,
          requiredImages: missing === 'scene' ? [scene.src, scene.src] : undefined,
        }),
      ).rejects.toBeInstanceOf(ThemeInstallationError);
      expect(stageImage.mock.calls.map(([url]) => url)).toEqual(
        missing === 'scene' ? [...candidate.iconImages, scene.src] : candidate.iconImages,
      );
      expect([...memory.active]).toEqual(originalActive);
      expect([...memory.tokens.values()]).toEqual(['#111415']);
      expect(memory.resources.slice(candidateStart).every((resource) => resource.disposed)).toBe(
        true,
      );
      previous!.dispose();
    }
  });

  it('derives every declared image icon and variant without a role or pack-ID list', async () => {
    const memory = memoryPorts();
    const pack = validateThemePack(structuredClone(pixelData));
    pack.id = 'unseen-images';
    pack.icons['extra.status'] = {
      default: { type: 'image', resource: 'status.svg' },
      variants: {
        quiet: { type: 'image', resource: 'status-quiet.svg' },
      },
    };
    pack.icons.home = { default: { type: 'image', resource: 'status.svg' } };
    const candidate = createThemeResolver(pack, { url: '/packs/unseen/theme.json' });
    const stageImage = vi.fn(memory.ports.stageImage);
    const installed = await installThemeResources(candidate, {
      ports: { ...memory.ports, stageImage },
    });
    expect(stageImage.mock.calls.map(([url]) => url)).toEqual([
      '/packs/unseen/status.svg',
      ...theme().iconImages,
      '/packs/unseen/status-quiet.svg',
    ]);
    installed!.dispose();
  });

  it('disposes late image staging when the candidate becomes stale', async () => {
    const memory = memoryPorts();
    const gate = deferred();
    let current = true;
    const stageImage = vi.fn(async (url: string) => {
      await gate.promise;
      return memory.ports.stageImage(url);
    });
    const request = installThemeResources(theme(), {
      ports: { ...memory.ports, stageImage },
      isCurrent: () => current,
      requiredImages: ['/art/scenes/heritage/stadium-0.webp'],
    });
    await Promise.resolve();
    current = false;
    gate.resolve();
    expect(await request).toBeNull();
    expect(memory.events.some((event) => event.startsWith('activate:'))).toBe(false);
    expect(memory.resources.every((resource) => resource.disposed)).toBe(true);
    expect([...memory.active]).toEqual(['unowned']);
  });

  it('preflights icon images and supplied mounted scenes and releases them on replacement', async () => {
    const memory = memoryPorts();
    const stageImage = vi.fn(memory.ports.stageImage);
    const ports = { ...memory.ports, stageImage };
    const previousTheme = theme();
    const nextTheme = theme('next');
    const previous = await installThemeResources(previousTheme, {
      ports,
      requiredImages: ['/art/scenes/heritage/stadium-0.webp'],
    });
    const oldImages = memory.resources.filter((resource) => resource.id.startsWith('image:'));
    const next = await installThemeResources(nextTheme, {
      ports,
      previous: previous!,
      requiredImages: ['/art/scenes/terraces/training-2.webp'],
    });
    expect(stageImage.mock.calls.map(([url]) => url)).toEqual([
      ...previousTheme.iconImages,
      '/art/scenes/heritage/stadium-0.webp',
      ...nextTheme.iconImages,
      '/art/scenes/terraces/training-2.webp',
    ]);
    expect(oldImages.every((resource) => resource.disposed)).toBe(true);
    next!.dispose();
    expect(memory.resources.every((resource) => resource.disposed)).toBe(true);
  });
});

afterEach(() => vi.unstubAllGlobals());

function fontBrowser(load: (source: string) => Promise<void>) {
  const faces: { family: string; source: string; descriptors: FontFaceDescriptors }[] = [];
  class FakeFontFace {
    constructor(
      readonly family: string,
      readonly source: string,
      readonly descriptors: FontFaceDescriptors,
    ) {
      faces.push(this);
    }
    async load() {
      await load(this.source);
      return this;
    }
  }
  vi.stubGlobal('FontFace', FakeFontFace);
  const foreign = {};
  const fonts = new Set<unknown>([foreign]);
  return {
    faces,
    fonts,
    foreign,
    ports: createBrowserThemePorts({ fonts } as unknown as Document),
  };
}

it('browser font staging stops after primary success without requesting alternatives', async () => {
  const browser = fontBrowser(async () => {});
  const font = theme().fonts[0];
  expect(font.fallbacks?.length).toBeGreaterThan(0);
  const staged = await browser.ports.stageFont(font);
  expect(browser.faces).toHaveLength(1);
  expect(browser.faces[0].source).toContain('.woff2');
  expect([...browser.fonts]).toEqual([browser.foreign]);
  staged.dispose();
  expect([...browser.fonts]).toEqual([browser.foreign]);
});

it('loads separate detached faces serially and owns only the first successful representation', async () => {
  const gate = deferred();
  const browser = fontBrowser(async (source) => {
    if (source.includes('primary')) await gate.promise;
    if (!source.includes('last')) throw new Error('Unsupported representation');
  });
  const request = browser.ports.stageFont({
    family: 'Stable Alias',
    weight: '600 900',
    style: 'italic',
    display: 'block',
    resource: '/primary.woff2',
    format: 'woff2',
    fallbacks: [
      { resource: '/second.woff', format: 'woff' },
      { resource: '/last.ttf', format: 'truetype' },
    ],
  });
  expect(browser.faces).toHaveLength(1);
  expect([...browser.fonts]).toEqual([browser.foreign]);
  gate.resolve();
  const staged = await request;
  expect(browser.faces.map((face) => face.source)).toEqual([
    'url("/primary.woff2") format("woff2")',
    'url("/second.woff") format("woff")',
    'url("/last.ttf") format("truetype")',
  ]);
  for (const face of browser.faces)
    expect(face).toMatchObject({
      family: 'Stable Alias',
      descriptors: { weight: '600 900', style: 'italic', display: 'block' },
    });
  expect([...browser.fonts]).toEqual([browser.foreign]);
  staged.activate();
  expect([...browser.fonts]).toEqual([browser.foreign, browser.faces[2]]);
  staged.dispose();
  expect([...browser.fonts]).toEqual([browser.foreign]);
});

it('rejects a required face when all representations fail and retains the installed theme', async () => {
  const memory = memoryPorts();
  const previous = await installThemeResources(theme(), { ports: memory.ports });
  const originalActive = [...memory.active];
  const candidateStart = memory.resources.length;
  const browser = fontBrowser(async () => {
    throw new Error('Font unavailable');
  });
  const candidate = theme('next');
  await expect(
    prepareThemeResources(candidate, {
      ports: { ...memory.ports, stageFont: browser.ports.stageFont },
    }),
  ).rejects.toMatchObject({
    retryable: true,
    cause: expect.any(AggregateError),
  });
  expect(browser.faces.length).toBe(
    candidate.fonts.reduce((count, face) => count + 1 + (face.fallbacks?.length ?? 0), 0),
  );
  expect([...browser.fonts]).toEqual([browser.foreign]);
  expect([...memory.active]).toEqual(originalActive);
  expect([...memory.tokens.values()]).toEqual(['#111415']);
  expect(memory.resources.slice(candidateStart).every((resource) => resource.disposed)).toBe(true);
  previous!.dispose();
});

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

it('browser image staging decodes detached candidates and cleans up on failure or disposal', async () => {
  let failDecode = false;
  const images: {
    src?: string;
    decoding?: string;
    decode: ReturnType<typeof vi.fn>;
    removeAttribute: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  }[] = [];
  const document = {
    createElement: (kind: string) => {
      expect(kind).toBe('img');
      const image = {
        decode: vi.fn(async () => {
          if (failDecode) throw new Error('Missing image');
        }),
        removeAttribute: vi.fn(),
        remove: vi.fn(),
      };
      images.push(image);
      return image;
    },
  } as unknown as Document;
  const ports = createBrowserThemePorts(document);
  const staged = await ports.stageImage('/images/current.webp');
  expect(images[0].src).toBe('/images/current.webp');
  expect(images[0].decoding).toBe('async');
  expect(images[0].decode).toHaveBeenCalledOnce();
  expect(images[0].removeAttribute).not.toHaveBeenCalled();
  staged.activate();
  staged.dispose();
  expect(images[0].removeAttribute).toHaveBeenCalledWith('src');
  expect(images[0].remove).toHaveBeenCalledOnce();
  failDecode = true;
  await expect(ports.stageImage('/images/broken.webp')).rejects.toThrow('Missing image');
  expect(images[1].removeAttribute).toHaveBeenCalledWith('src');
  expect(images[1].remove).toHaveBeenCalledOnce();
});
