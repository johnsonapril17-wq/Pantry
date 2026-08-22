/**
 * Storage durability.
 *
 * IndexedDB is "best-effort" by default: the browser may evict the whole
 * origin under storage pressure, during cleanup, or when the user clears site
 * data -- silently, with no warning and no recovery. For an app whose only copy
 * of your data is this database, that is not acceptable.
 *
 * `navigator.storage.persist()` upgrades the origin to "persistent", which
 * means the browser will not evict it automatically; only a deliberate clear by
 * the user removes it. Chrome grants this without a prompt once the site looks
 * legitimately used (bookmarked, high engagement, installed). It can refuse, so
 * the result is reported rather than assumed.
 */

export interface StorageInfo {
  /** True when the browser has promised not to evict this origin. */
  persisted: boolean;
  /** False when the browser does not implement the Storage API at all. */
  supported: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return { persisted: false, supported: false, usageBytes: null, quotaBytes: null };
  }

  let persisted = false;
  try {
    persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
  } catch {
    persisted = false;
  }

  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  try {
    if (navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      usageBytes = est.usage ?? null;
      quotaBytes = est.quota ?? null;
    }
  } catch {
    /* estimate is a nicety; its absence is not an error. */
  }

  return { persisted, supported: true, usageBytes, quotaBytes };
}

/**
 * Asks the browser to make this origin's storage durable.
 *
 * Safe to call on every boot: if permission is already granted this resolves
 * immediately without prompting. Returns whether storage is durable afterwards.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;

  try {
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
