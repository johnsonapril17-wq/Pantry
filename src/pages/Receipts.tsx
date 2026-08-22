import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ImageOff, Plus, Trash2, Upload } from 'lucide-react';
import { Page } from '@/components/Layout';
import { ConfirmDialog, EmptyState, Field, Modal, Stat, useToast } from '@/components/ui';
import { db, now, uid } from '@/db/schema';
import { byId, useReceipts, useSettings, useStores } from '@/hooks/useData';
import { mediumDate, money, toISODate } from '@/domain/format';
import type { Receipt } from '@/domain/types';

/**
 * "Photo to upload / enter receipts" (notes, photo 02).
 *
 * The photo is stored as a Blob in IndexedDB -- it never leaves the machine.
 * Object URLs are created on demand and revoked on unmount so a long session
 * browsing receipts does not leak memory.
 */
export function Receipts() {
  const receipts = useReceipts();
  const stores = useStores();
  const settings = useSettings();
  const toast = useToast();

  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<Receipt | null>(null);
  const [deleting, setDeleting] = useState<Receipt | null>(null);

  const strs = byId(stores);

  const thisMonth = useMemo(() => {
    const d = new Date();
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return receipts.filter((r) => r.date.startsWith(prefix));
  }, [receipts]);

  const monthTotal = thisMonth.reduce((s, r) => s + r.total, 0);
  const allTotal = receipts.reduce((s, r) => s + r.total, 0);

  return (
    <Page
      title="Receipts"
      subtitle={`${receipts.length} stored · photos stay on this device`}
      actions={
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} />
          Add receipt
        </button>
      }
    >
      <div className="stat-grid">
        <Stat label="This month" value={money(monthTotal, settings.locale, settings.currency)} hint={`${thisMonth.length} receipts`} />
        <Stat label="All time" value={money(allTotal, settings.locale, settings.currency)} hint={`${receipts.length} receipts`} />
        <Stat
          label="With a photo"
          value={receipts.filter((r) => r.image).length}
          hint="Tap a card to view"
        />
        <Stat
          label="Average"
          value={money(receipts.length ? allTotal / receipts.length : 0, settings.locale, settings.currency)}
        />
      </div>

      {receipts.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <EmptyState
              icon={<Camera size={22} />}
              title="No receipts yet"
              message="Photograph a receipt or key the total in by hand. Either way it is logged against your weekly and monthly budget."
              action={
                <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
                  <Plus size={15} /> Add receipt
                </button>
              }
            />
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          {receipts.map((r) => (
            <ReceiptCard
              key={r.id}
              receipt={r}
              storeName={strs.get(r.storeId ?? '')?.name}
              currency={settings.currency}
              locale={settings.locale}
              onOpen={() => setViewing(r)}
              onDelete={() => setDeleting(r)}
            />
          ))}
        </div>
      )}

      {adding && <ReceiptForm onClose={() => setAdding(false)} />}

      {viewing && <ReceiptViewer receipt={viewing} onClose={() => setViewing(null)} />}

      {deleting && (
        <ConfirmDialog
          title="Delete receipt"
          message="Delete this receipt and its photo? The matching budget entry is removed too."
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await db.transaction('rw', [db.receipts, db.spends], async () => {
              await db.receipts.delete(deleting.id);
              const linked = await db.spends.where('receiptId').equals(deleting.id).toArray();
              await db.spends.bulkDelete(linked.map((s) => s.id));
            });
            toast('Receipt deleted.');
          }}
        />
      )}
    </Page>
  );
}

/* -------------------------------------------------------------------------- */

function ReceiptCard({
  receipt,
  storeName,
  currency,
  locale,
  onOpen,
  onDelete,
}: {
  receipt: Receipt;
  storeName?: string;
  currency: string;
  locale: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const url = useBlobUrl(receipt.image);

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <button
        onClick={onOpen}
        style={{
          display: 'block',
          width: '100%',
          height: 150,
          border: 0,
          padding: 0,
          background: 'var(--surface-2)',
          cursor: 'pointer',
        }}
        aria-label="View receipt"
      >
        {url ? (
          <img
            src={url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <span className="row" style={{ height: '100%', justifyContent: 'center', color: 'var(--text-faint)' }}>
            <ImageOff size={22} />
          </span>
        )}
      </button>

      <div className="card-body" style={{ padding: 'var(--space-3)' }}>
        <div className="row-between">
          <span className="strong num">{money(receipt.total, locale, currency)}</span>
          <button className="btn btn-ghost btn-icon" onClick={onDelete} aria-label="Delete receipt">
            <Trash2 size={13} />
          </button>
        </div>
        <div className="tiny muted truncate">{storeName ?? 'No store'}</div>
        <div className="tiny faint">{mediumDate(receipt.date, locale)}</div>
        {receipt.notes && <div className="tiny faint truncate">{receipt.notes}</div>}
      </div>
    </div>
  );
}

function ReceiptViewer({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  const url = useBlobUrl(receipt.image);
  const settings = useSettings();
  const stores = useStores();
  const strs = byId(stores);

  return (
    <Modal
      title={`${money(receipt.total, settings.locale, settings.currency)} · ${mediumDate(receipt.date, settings.locale)}`}
      onClose={onClose}
      size="wide"
      footer={
        <button className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="small muted" style={{ marginBottom: 'var(--space-3)' }}>
        {strs.get(receipt.storeId ?? '')?.name ?? 'No store recorded'}
        {receipt.notes ? ` · ${receipt.notes}` : ''}
      </div>
      {url ? (
        <img
          src={url}
          alt="Receipt"
          style={{
            width: '100%',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            display: 'block',
          }}
        />
      ) : (
        <EmptyState icon={<ImageOff size={22} />} title="No photo on this receipt" />
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function ReceiptForm({ onClose }: { onClose: () => void }) {
  const stores = useStores();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(toISODate(new Date()));
  const [total, setTotal] = useState('');
  const [storeId, setStoreId] = useState('');
  const [notes, setNotes] = useState('');
  const [logSpend, setLogSpend] = useState(true);

  const preview = useBlobUrl(file ?? undefined);

  const save = async () => {
    if (total === '' || Number(total) <= 0) {
      toast('Enter the receipt total.', 'danger');
      return;
    }

    const receiptId = uid();
    const stamp = now();

    await db.transaction('rw', [db.receipts, db.spends], async () => {
      await db.receipts.add({
        id: receiptId,
        storeId: storeId || undefined,
        date,
        total: Number(total),
        image: file ?? undefined,
        imageName: file?.name,
        notes: notes.trim() || undefined,
        createdAt: stamp,
      });

      if (logSpend) {
        await db.spends.add({
          id: uid(),
          date,
          amount: Number(total),
          storeId: storeId || undefined,
          receiptId,
          note: notes.trim() || 'Receipt',
          createdAt: stamp,
        });
      }
    });

    toast('Receipt saved.', 'ok');
    onClose();
  };

  return (
    <Modal
      title="Add receipt"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save receipt
          </button>
        </>
      }
    >
      <button
        className="btn btn-block"
        style={{ height: preview ? 'auto' : 120, padding: preview ? 6 : undefined }}
        onClick={() => fileRef.current?.click()}
      >
        {preview ? (
          <img
            src={preview}
            alt="Receipt preview"
            style={{ maxHeight: 260, width: '100%', objectFit: 'contain', borderRadius: 'var(--radius-sm)' }}
          />
        ) : (
          <span className="col" style={{ alignItems: 'center', gap: 6 }}>
            <Upload size={20} />
            <span>Take a photo or choose a file</span>
            <span className="tiny faint">Stored on this device only</span>
          </span>
        )}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <div className="form-grid" style={{ marginTop: 'var(--space-4)' }}>
        <Field label="Total">
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Store" span>
          <select className="select" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Not recorded</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes" span>
          <input
            className="input"
            value={notes}
            placeholder="e.g. Weekly shop + party supplies"
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>

      <hr className="divider" />

      <label className="row" style={{ cursor: 'pointer' }}>
        <input
          type="checkbox"
          className="checkbox"
          checked={logSpend}
          onChange={(e) => setLogSpend(e.target.checked)}
        />
        <span className="small">Count this towards the weekly and monthly budget</span>
      </label>
    </Modal>
  );
}

/** Creates an object URL for a Blob and revokes it when it changes or unmounts. */
function useBlobUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);

  return url;
}
