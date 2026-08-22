import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, Check, ScanLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Page } from '@/components/Layout';
import { EmptyState, useToast } from '@/components/ui';
import { db, now } from '@/db/schema';
import { usePrintBatches, useSettings } from '@/hooks/useData';
import { syncAutoGrocery } from '@/domain/grocery';
import { mediumDate, toISODate } from '@/domain/format';
import { STOCK_LABEL, STOCK_TONE, round2, stockStatus } from '@/domain/stock';
import type { Item, PrintBatch } from '@/domain/types';
import { Badge } from '@/components/ui';

const READER_ID = 'qr-reader';

/**
 * Scanning a printed stocktake sheet back in.
 *
 * The QR code holds `pantry://count/<code>`. That resolves to a `PrintBatch`,
 * which knows exactly which rows were printed and in what order -- so the
 * numbered rows on the paper line up with the numbered fields on screen.
 *
 * Camera access is optional throughout: the sheet code can always be typed.
 */
export function Scan() {
  const batches = usePrintBatches();
  const settings = useSettings();
  const toast = useToast();

  const [batch, setBatch] = useState<PrintBatch | null>(null);
  const [rows, setRows] = useState<Item[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);

  /* --- Camera lifecycle ------------------------------------------------- */

  useEffect(() => {
    if (!scanning) return;

    let cancelled = false;
    const scanner = new Html5Qrcode(READER_ID, { verbose: false });
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => {
          if (cancelled) return;
          void handleCode(text);
          setScanning(false);
        },
        () => {
          // Per-frame decode misses are normal; nothing to do.
        },
      )
      .catch((err: unknown) => {
        if (cancelled) return;
        setCameraError(
          err instanceof Error ? err.message : 'Could not start the camera on this device.',
        );
        setScanning(false);
      });

    return () => {
      cancelled = true;
      // `stop` rejects if the scanner never actually started; that is fine.
      scanner
        .stop()
        .then(() => scanner.clear())
        .catch(() => {});
      scannerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  /* --- Resolving a code ------------------------------------------------- */

  const handleCode = async (raw: string) => {
    const code = extractCode(raw);
    if (!code) {
      toast('That code is not a Pantry Tracker sheet.', 'danger');
      return;
    }
    await loadBatch(code);
  };

  const loadBatch = async (code: string) => {
    const found = await db.printBatches.where('code').equals(code.toUpperCase().trim()).first();
    if (!found) {
      toast(`No sheet found with code ${code}.`, 'danger');
      return;
    }
    const items = await db.items.bulkGet(found.itemIds);
    const live = items.filter((i): i is Item => Boolean(i));
    setBatch(found);
    setRows(live);
    setCounts({});
    if (live.length < found.itemIds.length) {
      toast(`${found.itemIds.length - live.length} rows from that sheet no longer exist.`);
    }
  };

  /* --- Applying counts -------------------------------------------------- */

  const apply = async () => {
    const changes = rows
      .map((item) => ({ item, raw: counts[item.id] }))
      .filter((c) => c.raw != null && c.raw !== '' && Number(c.raw) !== c.item.qty);

    if (changes.length === 0) {
      toast('No counts were entered.', 'danger');
      return;
    }

    const stamp = now();
    await db.transaction('rw', [db.items, db.printBatches, db.settings], async () => {
      for (const { item, raw } of changes) {
        await db.items.update(item.id, {
          qty: Math.max(0, round2(Number(raw))),
          updatedAt: stamp,
          lastCountedAt: stamp,
        });
      }
      if (batch) await db.printBatches.update(batch.id, { appliedAt: stamp });
      await db.settings.update('settings', { lastInventoryDate: toISODate(new Date()) });
    });

    await syncAutoGrocery();
    toast(`Updated ${changes.length} item${changes.length === 1 ? '' : 's'}.`, 'ok');
    setBatch(null);
    setRows([]);
    setCounts({});
  };

  const changedCount = rows.filter(
    (i) => counts[i.id] != null && counts[i.id] !== '' && Number(counts[i.id]) !== i.qty,
  ).length;

  return (
    <Page
      title="Scan Sheet"
      subtitle="Enter the counts from a printed stocktake sheet"
      actions={
        <Link to="/print" className="btn btn-sm">
          <ScanLine size={15} />
          Print a sheet
        </Link>
      }
    >
      {!batch && (
        <div className="card">
          <div className="card-head">
            <h2>Find the sheet</h2>
          </div>
          <div className="card-body col" style={{ gap: 'var(--space-4)' }}>
            <div className="row wrap" style={{ gap: 'var(--space-3)' }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setCameraError(null);
                  setScanning((s) => !s);
                }}
              >
                {scanning ? <CameraOff size={16} /> : <Camera size={16} />}
                {scanning ? 'Stop camera' : 'Scan QR code'}
              </button>

              <span className="muted small">or type the code printed on the sheet</span>

              <div className="row" style={{ gap: 'var(--space-2)' }}>
                <input
                  className="input"
                  style={{ width: 160, textTransform: 'uppercase' }}
                  placeholder="PT-4F2A"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadBatch(manualCode)}
                />
                <button className="btn" onClick={() => loadBatch(manualCode)} disabled={!manualCode.trim()}>
                  Open
                </button>
              </div>
            </div>

            <div
              id={READER_ID}
              style={{
                display: scanning ? 'block' : 'none',
                maxWidth: 420,
                borderRadius: 'var(--radius)',
                overflow: 'hidden',
                border: '1px solid var(--border)',
              }}
            />

            {cameraError && (
              <div className="small" style={{ color: 'var(--danger)' }}>
                {cameraError} You can still type the sheet code above.
              </div>
            )}
          </div>
        </div>
      )}

      {!batch && batches.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Recent sheets</h2>
          </div>
          <div className="card-body flush">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>Code</th>
                    <th>Sheet</th>
                    <th className="col-num">Rows</th>
                    <th style={{ width: 150 }}>Printed</th>
                    <th style={{ width: 120 }}>Status</th>
                    <th className="col-tight" />
                  </tr>
                </thead>
                <tbody>
                  {batches.slice(0, 12).map((b) => (
                    <tr key={b.id}>
                      <td className="mono strong">{b.code}</td>
                      <td>{b.title}</td>
                      <td className="col-num">{b.itemIds.length}</td>
                      <td className="small muted">
                        {mediumDate(b.createdAt.slice(0, 10), settings.locale)}
                      </td>
                      <td>
                        <Badge tone={b.appliedAt ? 'ok' : 'neutral'}>
                          {b.appliedAt ? 'Entered' : 'Open'}
                        </Badge>
                      </td>
                      <td className="col-tight">
                        <button className="btn btn-sm" onClick={() => loadBatch(b.code)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!batch && batches.length === 0 && (
        <div className="card">
          <div className="card-body">
            <EmptyState
              icon={<ScanLine size={22} />}
              title="No sheets printed yet"
              message={
                <>
                  Print a stocktake sheet first — it comes with a QR code that brings its rows
                  straight back here. <Link to="/print">Go to Printables</Link>
                </>
              }
            />
          </div>
        </div>
      )}

      {batch && (
        <div className="card">
          <div className="card-head">
            <div>
              <h2>{batch.title}</h2>
              <div className="small muted">
                Sheet {batch.code} · printed {mediumDate(batch.createdAt.slice(0, 10), settings.locale)}
              </div>
            </div>
            <div className="toolbar">
              <button
                className="btn btn-sm"
                onClick={() => {
                  setBatch(null);
                  setRows([]);
                  setCounts({});
                }}
              >
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" onClick={apply} disabled={changedCount === 0}>
                <Check size={15} />
                Apply {changedCount} change{changedCount === 1 ? '' : 's'}
              </button>
            </div>
          </div>

          <div className="card-body flush">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Row</th>
                    <th>Item / Food</th>
                    <th className="col-num" style={{ width: 90 }}>
                      Was
                    </th>
                    <th style={{ width: 140 }}>New count</th>
                    <th style={{ width: 130 }}>Becomes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item, index) => {
                    const raw = counts[item.id] ?? '';
                    const next = raw === '' ? item.qty : Math.max(0, Number(raw));
                    const nextStatus = stockStatus({ qty: next, lowThreshold: item.lowThreshold });
                    const changed = raw !== '' && next !== item.qty;
                    return (
                      <tr key={item.id}>
                        <td className="mono faint">{String(index + 1).padStart(2, '0')}</td>
                        <td>
                          <span className="item-name">{item.name}</span>
                          <span className="tiny faint"> {item.unit !== 'ea' ? item.unit : ''}</span>
                        </td>
                        <td className="col-num muted">{item.qty}</td>
                        <td>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            placeholder="--"
                            value={raw}
                            style={{ width: 110, padding: '5px 8px' }}
                            onChange={(e) =>
                              setCounts((c) => ({ ...c, [item.id]: e.target.value }))
                            }
                            aria-label={`New count for ${item.name}`}
                          />
                        </td>
                        <td>
                          {changed ? (
                            <Badge tone={STOCK_TONE[nextStatus]}>{STOCK_LABEL[nextStatus]}</Badge>
                          ) : (
                            <span className="faint small">unchanged</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card-body small muted">
            Blank rows are left exactly as they are. Applying the counts also stamps today as your
            last inventory date and re-syncs the grocery list.
          </div>
        </div>
      )}
    </Page>
  );
}

/**
 * Accepts `pantry://count/PT-4F2A`, a bare `PT-4F2A`, or a URL with the code as
 * the last path segment -- QR readers vary in how much they hand back.
 */
function extractCode(raw: string): string | null {
  const trimmed = raw.trim();
  const m = /(?:pantry:\/\/count\/)?([A-Za-z0-9]{2,4}-[A-Za-z0-9]{2,8})$/.exec(trimmed);
  return m ? m[1].toUpperCase() : null;
}
