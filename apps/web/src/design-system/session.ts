export const previewRequest: { story?: string } = {};

/** Each workbench document has its own settings/library storage, including the preview iframe. */
export function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(String(key), String(value));
    },
  };
}

export function isolatePreviewSession(themeId: string | null, storyId?: string | null) {
  previewRequest.story = storyId ?? undefined;
  const local = memoryStorage();
  if (themeId) local.setItem('haeram-soccor:presentation', JSON.stringify({ themeId }));
  Object.defineProperty(window, 'localStorage', { value: local, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: memoryStorage(), configurable: true });
  // LAN HTTP lacks randomUUID in some browsers; these IDs belong only to ephemeral samples.
  if (!crypto.randomUUID)
    Object.defineProperty(crypto, 'randomUUID', {
      value: () => {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      },
      configurable: true,
    });
}

/** Keep source/link copying usable from a plain HTTP LAN address too. */
export async function copyPreviewText(text: string) {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* Try the document-based copy available on LAN HTTP. */
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.style.cssText = 'position:fixed;opacity:0;left:-9999px';
  const previous = document.activeElement;
  document.body.append(field);
  field.select();
  try {
    if (!document.execCommand('copy')) throw new Error('복사하지 못했어요.');
  } finally {
    field.remove();
    if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
  }
}
