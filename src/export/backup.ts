import { db } from '@/db/schema';

/**
 * JSON backup and restore.
 *
 * Because everything lives in this browser's IndexedDB, this file *is* the
 * user's copy of their data. Receipt photos are base64-encoded inline so a
 * backup is a single self-contained file.
 */

const FORMAT = 'pantry-tracker-backup';
const VERSION = 1;

interface BackupFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function exportBackup(): Promise<Blob> {
  const tables: Record<string, unknown[]> = {};

  for (const table of db.tables) {
    const rows = await table.toArray();
    tables[table.name] =
      table.name === 'receipts' ? await Promise.all(rows.map(encodeReceipt)) : rows;
  }

  const payload: BackupFile = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  };

  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

export async function importBackup(file: File): Promise<{ tables: number; rows: number }> {
  const text = await file.text();
  const parsed = JSON.parse(text) as BackupFile;

  if (parsed.format !== FORMAT) {
    throw new Error('That file is not a Pantry Tracker backup.');
  }
  if (parsed.version > VERSION) {
    throw new Error(
      `That backup was made by a newer version of the app (v${parsed.version}). Update first.`,
    );
  }

  let rowCount = 0;
  let tableCount = 0;

  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      const rows = parsed.tables[table.name];
      if (!Array.isArray(rows)) continue;

      await table.clear();
      const decoded =
        table.name === 'receipts'
          ? rows.map((r) => decodeReceipt(r as EncodedReceipt))
          : rows;
      await table.bulkAdd(decoded as never[]);

      tableCount++;
      rowCount += decoded.length;
    }
  });

  return { tables: tableCount, rows: rowCount };
}

/* -------------------------------------------------------------------------- */
/* Receipt photos: Blob <-> base64                                            */
/* -------------------------------------------------------------------------- */

type EncodedReceipt = Record<string, unknown> & {
  image?: { __blob: string; type: string };
};

async function encodeReceipt(receipt: Record<string, unknown>): Promise<EncodedReceipt> {
  const image = receipt.image;
  if (!(image instanceof Blob)) return receipt as EncodedReceipt;

  const buffer = await image.arrayBuffer();
  return {
    ...receipt,
    image: { __blob: base64FromBuffer(buffer), type: image.type },
  };
}

function decodeReceipt(receipt: EncodedReceipt): Record<string, unknown> {
  const image = receipt.image;
  if (!image || typeof image !== 'object' || !('__blob' in image)) return receipt;

  return { ...receipt, image: blobFromBase64(image.__blob, image.type) };
}

function base64FromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // Chunked to stay well under the argument-count limit on large photos.
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function blobFromBase64(b64: string, type: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
