/**
 * Project identity, in one place.
 *
 * `APP_VERSION` is injected from package.json at build time (see the `define`
 * block in vite.config.ts) so the version shown in the app cannot drift away
 * from the version that was actually released.
 */

export const APP_VERSION: string = __APP_VERSION__;

export const REPO_URL = 'https://github.com/johnsonapril17-wq/Pantry';

export const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;
