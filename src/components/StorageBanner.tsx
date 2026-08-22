import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ShieldCheck, X } from 'lucide-react';
import { getStorageInfo, requestPersistentStorage } from '@/domain/storage';
import { useItems, useSettings } from '@/hooks/useData';
import { db } from '@/db/schema';

const DISMISS_KEY = 'pantry-storage-warning-dismissed';
/** Days after which an un-backed-up database is worth nagging about. */
const BACKUP_STALE_DAYS = 14;

/**
 * A standing warning when the data in this browser is not safe.
 *
 * Two distinct risks, deliberately not merged into one vague message:
 *
 *   1. Storage is not persistent -- the browser may evict the database during
 *      routine cleanup. This is silent and unrecoverable, so it outranks
 *      everything else.
 *   2. There is real data and no recent backup. Persistence does not protect
 *      against clearing site data, a dead laptop, or switching browsers.
 */
export function StorageBanner() {
  const items = useItems();
  const settings = useSettings();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === '1',
  );
  /**
   * `declined` matters as much as `asking`.
   *
   * Browsers refuse `persist()` for sites they do not consider established,
   * and they refuse silently. Without tracking the refusal the button appears
   * to do nothing at all, which is exactly how it behaved on first release.
   */
  const [phase, setPhase] = useState<'idle' | 'asking' | 'declined'>('idle');

  useEffect(() => {
    let alive = true;
    getStorageInfo().then((info) => {
      if (alive) setPersisted(info.supported ? info.persisted : true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Nothing to protect yet: do not nag an empty app.
  if (items.length === 0 || persisted === null || dismissed) return null;

  const backupAgeDays = settings.lastBackupAt
    ? (Date.now() - new Date(settings.lastBackupAt).getTime()) / 86_400_000
    : Infinity;
  const backupStale = backupAgeDays > BACKUP_STALE_DAYS;

  if (persisted && !backupStale) return null;

  const critical = !persisted;

  return (
    <div
      className="card no-print"
      style={{
        borderColor: critical ? 'var(--danger)' : 'var(--warn)',
        background: critical ? 'var(--danger-soft)' : 'var(--warn-soft)',
        marginBottom: 'var(--space-4)',
      }}
      role="status"
    >
      <div
        className="card-body row"
        style={{ gap: 'var(--space-3)', alignItems: 'flex-start', borderBottom: 0 }}
      >
        <span style={{ color: critical ? 'var(--danger)' : 'var(--warn)', flex: 'none', marginTop: 2 }}>
          {critical ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
        </span>

        <div className="grow" style={{ color: critical ? 'var(--danger-soft-text)' : 'var(--warn-soft-text)' }}>
          {critical && phase === 'declined' ? (
            <>
              <div className="strong">The browser refused to make storage permanent.</div>
              <div className="small" style={{ marginTop: 2 }}>
                Browsers only grant that to sites they consider established, and refuse without
                explanation. Two things actually work:{' '}
                <strong>install this app</strong> (look for the install icon in the address bar),
                or <strong>bookmark it</strong> and keep using it. Until one of those sticks, an
                exported backup is your only real protection.
              </div>
            </>
          ) : critical ? (
            <>
              <div className="strong">This browser may delete your pantry without warning.</div>
              <div className="small" style={{ marginTop: 2 }}>
                Storage here is marked temporary, so the browser is allowed to clear it during
                routine cleanup. You can ask it to make storage permanent, though the browser is
                free to refuse.
              </div>
            </>
          ) : (
            <>
              <div className="strong">
                {settings.lastBackupAt
                  ? `Your last backup was ${Math.floor(backupAgeDays)} days ago.`
                  : 'You have never exported a backup.'}
              </div>
              <div className="small" style={{ marginTop: 2 }}>
                Your data lives only in this browser. Clearing site data, or losing this machine,
                loses the lot.
              </div>
            </>
          )}
        </div>

        <div className="row" style={{ gap: 'var(--space-2)', flex: 'none' }}>
          {critical && phase !== 'declined' ? (
            <button
              className="btn btn-sm btn-primary"
              disabled={phase === 'asking'}
              onClick={async () => {
                setPhase('asking');
                const ok = await requestPersistentStorage();
                setPersisted(ok);
                // A refusal must be visible, or the button reads as broken.
                setPhase(ok ? 'idle' : 'declined');
              }}
            >
              {phase === 'asking' ? 'Asking...' : 'Make storage permanent'}
            </button>
          ) : critical ? (
            <Link to="/settings" className="btn btn-sm btn-primary">
              Back up now
            </Link>
          ) : (
            <Link to="/settings" className="btn btn-sm">
              Back up now
            </Link>
          )}
          <button
            className="btn btn-sm btn-ghost btn-icon"
            aria-label="Dismiss"
            onClick={() => {
              sessionStorage.setItem(DISMISS_KEY, '1');
              setDismissed(true);
            }}
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Records that a backup was taken, so the reminder resets. */
export async function markBackedUp(): Promise<void> {
  await db.settings.update('settings', { lastBackupAt: new Date().toISOString() });
}
