import { useRef, useState } from 'react';
import {
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Monitor,
  Moon,
  Plus,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import { Page } from '@/components/Layout';
import { Icon } from '@/components/icons';
import { ConfirmDialog, Field, SegmentedControl, useToast } from '@/components/ui';
import { db, uid } from '@/db/schema';
import { loadDemoData, resetAll } from '@/db/seed';
import { useCategories, useItems, useLocations, useSettings, useStores } from '@/hooks/useData';
import { THEMES, setMode, setTheme } from '@/hooks/useTheme';
import { buildPantryCsv, buildWorkbook, download } from '@/export/workbook';
import { exportBackup, importBackup } from '@/export/backup';
import { isValidCurrency, isValidLocale } from '@/domain/format';
import { APP_VERSION, CHANGELOG_URL, REPO_URL } from '@/domain/meta';
import type { ModeSetting } from '@/domain/types';

export function Settings() {
  const settings = useSettings();
  const items = useItems();
  const categories = useCategories();
  const locations = useLocations();
  const stores = useStores();
  const toast = useToast();

  const importRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const update = async (changes: Partial<typeof settings>) => {
    await db.settings.update('settings', changes);
  };

  const doExport = async (kind: 'xlsx' | 'csv' | 'json') => {
    setBusy(kind);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === 'xlsx') {
        download(await buildWorkbook(settings), `pantry-tracker-${stamp}.xlsx`);
      } else if (kind === 'csv') {
        download(await buildPantryCsv(settings), `pantry-${stamp}.csv`);
      } else {
        download(await exportBackup(), `pantry-tracker-backup-${stamp}.json`);
      }
      toast('Export ready.', 'ok');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed.', 'danger');
    } finally {
      setBusy(null);
    }
  };

  const doImport = async (file: File) => {
    setBusy('import');
    try {
      const { rows } = await importBackup(file);
      toast(`Restored ${rows} rows.`, 'ok');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed.', 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page title="Settings" subtitle="Themes, budgets, reference data and backups">
      {/* ---------------------------------------------------------------- */}
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Appearance</h2>
            <div className="small muted">Three themes, each tested in light and dark.</div>
          </div>
          <SegmentedControl<ModeSetting>
            value={settings.mode}
            onChange={setMode}
            options={[
              { value: 'light', label: <Sun size={14} />, title: 'Light' },
              { value: 'dark', label: <Moon size={14} />, title: 'Dark' },
              { value: 'system', label: <Monitor size={14} />, title: 'Match system' },
            ]}
          />
        </div>
        <div className="card-body">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            {THEMES.map((t) => (
              <button
                key={t.id}
                className="theme-card"
                aria-pressed={settings.theme === t.id}
                onClick={() => setTheme(t.id)}
              >
                <div>
                  <div className="strong">{t.name}</div>
                  <div className="small muted">{t.tagline}</div>
                </div>
                <div className="col" style={{ gap: 6 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="tiny faint" style={{ width: 32 }}>
                      Light
                    </span>
                    <span className="theme-swatches">
                      {t.light.map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="tiny faint" style={{ width: 32 }}>
                      Dark
                    </span>
                    <span className="theme-swatches">
                      {t.dark.map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="card">
        <div className="card-head">
          <h2>Budget & formatting</h2>
        </div>
        <div className="card-body">
          <div className="form-grid">
            <Field label="Weekly budget">
              <input
                className="input"
                type="number"
                min="0"
                step="1"
                value={settings.weeklyBudget}
                onChange={(e) => update({ weeklyBudget: Number(e.target.value) })}
              />
            </Field>
            <Field label="Monthly budget">
              <input
                className="input"
                type="number"
                min="0"
                step="1"
                value={settings.monthlyBudget}
                onChange={(e) => update({ monthlyBudget: Number(e.target.value) })}
              />
            </Field>
            <ValidatedField
              label="Currency"
              hint="ISO code, e.g. AUD, GBP, USD"
              value={settings.currency}
              validate={isValidCurrency}
              normalise={(v) => v.toUpperCase().slice(0, 3)}
              invalidMessage="Not a currency code."
              onCommit={(currency) => update({ currency })}
            />
            <ValidatedField
              label="Locale"
              hint="Controls date and number formatting, e.g. en-AU"
              value={settings.locale}
              validate={isValidLocale}
              invalidMessage="Not a valid language tag."
              onCommit={(locale) => update({ locale })}
            />
            <Field label="Week starts on">
              <select
                className="select"
                value={settings.weekStartsOn}
                onChange={(e) => update({ weekStartsOn: Number(e.target.value) })}
              >
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
                  (d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Expiry warning" hint="Days ahead to flag as expiring soon">
              <input
                className="input"
                type="number"
                min="0"
                step="1"
                value={settings.expiryWarnDays}
                onChange={(e) => update({ expiryWarnDays: Number(e.target.value) })}
              />
            </Field>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <ReferenceLists />

      {/* ---------------------------------------------------------------- */}
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Export</h2>
            <div className="small muted">
              The workbook mirrors the pantry, grocery and out-of-stock tables, colour code
              included. It opens in Excel and uploads to Google Sheets as-is.
            </div>
          </div>
        </div>
        <div className="card-body">
          <div className="toolbar">
            <button className="btn" disabled={busy === 'xlsx'} onClick={() => doExport('xlsx')}>
              <FileSpreadsheet size={16} />
              {busy === 'xlsx' ? 'Building...' : 'Excel workbook (.xlsx)'}
            </button>
            <button className="btn" disabled={busy === 'csv'} onClick={() => doExport('csv')}>
              <FileText size={16} />
              Pantry CSV
            </button>
            <button className="btn" disabled={busy === 'json'} onClick={() => doExport('json')}>
              <Download size={16} />
              Full backup (.json)
            </button>
            <button className="btn" disabled={busy === 'import'} onClick={() => importRef.current?.click()}>
              <Upload size={16} />
              Restore backup
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) doImport(file);
                e.target.value = '';
              }}
            />
          </div>
          <p className="small muted" style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
            Restoring replaces everything currently in the app. Your data lives only in this
            browser, so keep a backup somewhere safe.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="card">
        <div className="card-head">
          <h2>Data</h2>
          <span className="small muted">{items.length} items stored</span>
        </div>
        <div className="card-body">
          <div className="toolbar">
            <button
              className="btn"
              disabled={busy === 'demo'}
              onClick={async () => {
                setBusy('demo');
                await loadDemoData();
                setBusy(null);
                toast('Demo data loaded.', 'ok');
              }}
            >
              <Plus size={16} />
              Load demo data
            </button>
            <button className="btn btn-danger" onClick={() => setConfirmReset(true)}>
              <Trash2 size={16} />
              Delete everything
            </button>
          </div>
        </div>
      </section>

      {confirmReset && (
        <ConfirmDialog
          title="Delete everything"
          message="This removes every item, list, receipt and price record from this browser. It cannot be undone -- export a backup first if you are not sure."
          confirmLabel="Delete it all"
          onClose={() => setConfirmReset(false)}
          onConfirm={async () => {
            await resetAll();
            toast('All data deleted.');
          }}
        />
      )}

      <div className="small faint row wrap" style={{ gap: 'var(--space-2)' }}>
        <span>
          Pantry Tracker v{APP_VERSION} · everything is stored locally in this browser ·{' '}
          {categories.length} categories, {locations.length} locations, {stores.length} stores
        </span>
        <span aria-hidden>·</span>
        <a href={CHANGELOG_URL} target="_blank" rel="noreferrer noopener" className="row" style={{ gap: 4 }}>
          Changelog
          <ExternalLink size={12} />
        </a>
        <span aria-hidden>·</span>
        <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className="row" style={{ gap: 4 }}>
          Source
          <ExternalLink size={12} />
        </a>
      </div>
    </Page>
  );
}

/* -------------------------------------------------------------------------- */
/* A text setting that must stay valid                                        */
/* -------------------------------------------------------------------------- */

/**
 * Currency and locale are fed straight to `Intl`, which throws on anything
 * malformed. Committing every keystroke means "en-AU" is briefly "e", "en",
 * "en-" -- and a value like "en-CAD" would stick permanently.
 *
 * So the field keeps its own draft while you type, shows whether the draft is
 * usable, and only writes through when it is. What is stored is always valid.
 */
function ValidatedField({
  label,
  hint,
  value,
  validate,
  normalise,
  invalidMessage,
  onCommit,
}: {
  label: string;
  hint: string;
  value: string;
  validate: (v: string) => boolean;
  normalise?: (v: string) => string;
  invalidMessage: string;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const valid = validate(shown);

  const commit = (raw: string) => {
    const next = normalise ? normalise(raw) : raw;
    if (validate(next)) {
      onCommit(next);
      setDraft(null);
    } else {
      setDraft(next);
    }
  };

  return (
    <div className="field">
      <label>{label}</label>
      <input
        className="input"
        value={shown}
        aria-invalid={!valid}
        style={valid ? undefined : { borderColor: 'var(--danger)' }}
        onChange={(e) => {
          const next = normalise ? normalise(e.target.value) : e.target.value;
          setDraft(next);
          // Write through as soon as it becomes valid, so the app updates live.
          if (validate(next)) {
            onCommit(next);
            setDraft(null);
          }
        }}
        onBlur={(e) => commit(e.target.value)}
      />
      <span className="tiny" style={{ color: valid ? 'var(--text-faint)' : 'var(--danger)' }}>
        {valid
          ? hint
          : validate(value)
            ? // The draft is bad but the saved value is fine -- nothing broke.
              `${invalidMessage} Still using "${value}".`
            : // The saved value itself is unusable; say what happens instead.
              `${invalidMessage} Falling back to your browser default until this is fixed.`}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Categories, locations and stores                                           */
/* -------------------------------------------------------------------------- */

function ReferenceLists() {
  const categories = useCategories();
  const locations = useLocations();
  const stores = useStores();
  const toast = useToast();

  const [newCategory, setNewCategory] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newStore, setNewStore] = useState('');

  const nextOrder = (rows: { sortOrder: number }[]) =>
    rows.length ? Math.max(...rows.map((r) => r.sortOrder)) + 10 : 10;

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Categories, locations & stores</h2>
          <div className="small muted">
            Grocery lists group by store, then by that store's aisle order.
          </div>
        </div>
      </div>
      <div className="card-body">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 'var(--space-5)',
          }}
        >
          <div className="col">
            <h3>Categories</h3>
            <div className="col" style={{ gap: 4 }}>
              {categories.map((c) => (
                <div key={c.id} className="row-between">
                  <span className="row small" style={{ gap: 8 }}>
                    <Icon name={c.icon} size={15} />
                    {c.name}
                    <span className="tiny faint">{c.department}</span>
                  </span>
                  <button
                    className="btn btn-ghost btn-icon"
                    aria-label={`Delete ${c.name}`}
                    onClick={async () => {
                      const used = await db.items.where('categoryId').equals(c.id).count();
                      if (used > 0) {
                        toast(`${c.name} is used by ${used} items.`, 'danger');
                        return;
                      }
                      await db.categories.delete(c.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 'var(--space-2)' }}>
              <input
                className="input"
                placeholder="New category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== 'Enter' || !newCategory.trim()) return;
                  await db.categories.add({
                    id: uid(),
                    name: newCategory.trim(),
                    department: 'Ambient',
                    sortOrder: nextOrder(categories),
                    icon: 'tag',
                  });
                  setNewCategory('');
                }}
              />
            </div>
          </div>

          <div className="col">
            <h3>Locations</h3>
            <div className="col" style={{ gap: 4 }}>
              {locations.map((l) => (
                <div key={l.id} className="row-between">
                  <span className="row small" style={{ gap: 8 }}>
                    <Icon name={l.icon} size={15} />
                    {l.name}
                  </span>
                  <button
                    className="btn btn-ghost btn-icon"
                    aria-label={`Delete ${l.name}`}
                    onClick={async () => {
                      const used = await db.items.where('locationId').equals(l.id).count();
                      if (used > 0) {
                        toast(`${l.name} holds ${used} items.`, 'danger');
                        return;
                      }
                      await db.locations.delete(l.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 'var(--space-2)' }}>
              <input
                className="input"
                placeholder="New location"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== 'Enter' || !newLocation.trim()) return;
                  await db.locations.add({
                    id: uid(),
                    name: newLocation.trim(),
                    sortOrder: nextOrder(locations),
                    icon: 'box',
                  });
                  setNewLocation('');
                }}
              />
            </div>
          </div>

          <div className="col">
            <h3>Stores</h3>
            <div className="col" style={{ gap: 4 }}>
              {stores.map((s) => (
                <div key={s.id} className="row-between">
                  <span className="row small" style={{ gap: 8 }}>
                    <span
                      className="dot"
                      style={{ background: s.colour ?? 'var(--text-faint)' }}
                    />
                    {s.name}
                    {s.aisleOrder.length > 0 && (
                      <span className="tiny faint">{s.aisleOrder.length} aisles</span>
                    )}
                  </span>
                  <button
                    className="btn btn-ghost btn-icon"
                    aria-label={`Delete ${s.name}`}
                    onClick={() => db.stores.delete(s.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 'var(--space-2)' }}>
              <input
                className="input"
                placeholder="New store"
                value={newStore}
                onChange={(e) => setNewStore(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== 'Enter' || !newStore.trim()) return;
                  await db.stores.add({
                    id: uid(),
                    name: newStore.trim(),
                    sortOrder: nextOrder(stores),
                    aisleOrder: [],
                  });
                  setNewStore('');
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
