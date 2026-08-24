import { useEffect } from 'react';
import { db } from '@/db/schema';
import type { ModeSetting, Settings, ThemeName } from '@/domain/types';

export const THEMES: {
  id: ThemeName;
  name: string;
  tagline: string;
  /** Preview swatches: [bg, surface, accent, ok, danger] for light and dark. */
  light: string[];
  dark: string[];
}[] = [
  {
    id: 'farmers-market',
    name: 'Farmers Market',
    tagline: 'Organic & fresh',
    light: ['#fefae0', '#fffef5', '#606c38', '#bc6c25', '#b22222'],
    dark: ['#191c12', '#23271a', '#8faf8f', '#f4c430', '#e2725b'],
  },
  {
    id: 'modern-bistro',
    name: 'Modern Bistro',
    tagline: 'High contrast & bold',
    light: ['#f3f4f2', '#ffffff', '#2c3e50', '#bc6c25', '#b22222'],
    dark: ['#0e131a', '#18202b', '#e2725b', '#f4c430', '#e05252'],
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    tagline: 'Clean & airy',
    light: ['#ffffff', '#f7f8fa', '#5f6b85', '#bc6c25', '#b22222'],
    dark: ['#101215', '#191c21', '#8e9aaf', '#f4c430', '#e2725b'],
  },
];

/** Resolves the `system` setting against the OS preference. */
export function resolveMode(mode: ModeSetting): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Applies `data-theme` / `data-mode` to <html>, and keeps them in step with the
 * OS while the mode setting is `system`.
 */
export function useApplyTheme(settings: Settings): void {
  const { theme, mode } = settings;

  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      const resolved = resolveMode(mode);
      root.dataset.theme = theme;
      root.dataset.mode = resolved;
      root.style.colorScheme = resolved;

      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute(
          'content',
          getComputedStyle(root).getPropertyValue('--bg').trim() || '#ffffff',
        );
      }
    };

    apply();

    if (mode !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme, mode]);
}

export async function setTheme(theme: ThemeName): Promise<void> {
  await db.settings.update('settings', { theme });
}

export async function setMode(mode: ModeSetting): Promise<void> {
  await db.settings.update('settings', { mode });
}
