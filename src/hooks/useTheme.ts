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
    light: ['#faf6ec', '#fffdf7', '#4d7c0f', '#b45309', '#b3261e'],
    dark: ['#191b15', '#232620', '#a3e635', '#fbbf24', '#f87171'],
  },
  {
    id: 'modern-bistro',
    name: 'Modern Bistro',
    tagline: 'High contrast & bold',
    light: ['#f7f7f5', '#ffffff', '#a4161a', '#8a5a00', '#0b0b0d'],
    dark: ['#0a0a0b', '#141417', '#ef4444', '#fbbf24', '#f8f8fa'],
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    tagline: 'Clean & airy',
    light: ['#ffffff', '#fafafa', '#18181b', '#a16207', '#be123c'],
    dark: ['#0e0e0f', '#171719', '#f4f4f5', '#fbbf24', '#fb7185'],
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
