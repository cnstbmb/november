import { InjectionToken } from '@angular/core';

export interface ViewSettingsPlatform {
  currentUrl(): string;
  replaceUrl(url: string): void;
  readStorage(key: string): string | null;
  writeStorage(key: string, value: string): void;
  copyText(value: string): Promise<void>;
  onHashChange(listener: () => void): () => void;
}

function browserPlatform(): ViewSettingsPlatform {
  const browserWindow = typeof window === 'undefined' ? null : window;

  return {
    currentUrl: () => browserWindow?.location.href ?? 'http://localhost/',
    replaceUrl: (url) => browserWindow?.history.replaceState(null, '', url),
    readStorage: (key) => {
      try {
        return browserWindow?.localStorage.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    writeStorage: (key, value) => {
      try {
        browserWindow?.localStorage.setItem(key, value);
      } catch {
        // Privacy mode and full storage must not make settings unusable.
      }
    },
    copyText: async (value) => {
      const clipboard = browserWindow?.navigator.clipboard;
      if (clipboard) {
        await clipboard.writeText(value);
        return;
      }

      const documentRef = browserWindow?.document;
      if (!documentRef) throw new Error('Clipboard is unavailable');
      const textarea = documentRef.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      documentRef.body.appendChild(textarea);
      textarea.select();
      const copied = documentRef.execCommand('copy');
      textarea.remove();
      if (!copied) throw new Error('Clipboard copy failed');
    },
    onHashChange: (listener) => {
      if (!browserWindow) return () => undefined;
      browserWindow.addEventListener('hashchange', listener);
      return () => browserWindow.removeEventListener('hashchange', listener);
    },
  };
}

export const VIEW_SETTINGS_PLATFORM = new InjectionToken<ViewSettingsPlatform>(
  'VIEW_SETTINGS_PLATFORM',
  { providedIn: 'root', factory: browserPlatform },
);
