import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowDown, ArrowUp, Search, X } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/* Modal                                                                       */
/* -------------------------------------------------------------------------- */

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'default',
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'narrow' | 'default' | 'wide';
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>(
      'input, select, textarea, button:not(.btn-ghost)',
    );
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop no-print"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${size === 'default' ? '' : size}`}
        role="dialog"
        aria-modal="true"
        ref={ref}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  danger = true,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="narrow"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                      */
/* -------------------------------------------------------------------------- */

type Toast = { id: number; text: string; tone: 'default' | 'ok' | 'danger' };
type ToastFn = (text: string, tone?: Toast['tone']) => void;

const ToastCtx = createContext<ToastFn>(() => {});

export function useToast(): ToastFn {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback<ToastFn>((text, tone = 'default') => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast" data-tone={t.tone}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/* Small building blocks                                                       */
/* -------------------------------------------------------------------------- */

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'ok' | 'warn' | 'danger' | 'neutral' | 'accent';
  children: ReactNode;
}) {
  return (
    <span className="badge" data-tone={tone}>
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'ok' | 'warn' | 'danger';
  icon?: ReactNode;
}) {
  return (
    <div className="stat" data-tone={tone}>
      <span className="label">
        {icon}
        {label}
      </span>
      <span className="value">{value}</span>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="icon">{icon}</span>
      <div>
        <div className="strong" style={{ color: 'var(--text)' }}>
          {title}
        </div>
        {message && (
          <div className="small" style={{ marginTop: 4, maxWidth: 380 }}>
            {message}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search">
      <Search size={15} />
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        type="search"
      />
    </div>
  );
}

export function Field({
  label,
  children,
  span,
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  span?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div className={`field ${span ? 'span-2' : ''}`}>
      <label>{label}</label>
      {children}
      {hint && <span className="tiny faint">{hint}</span>}
    </div>
  );
}

export function Meter({ value, max, tone }: { value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const auto = pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : 'ok';
  return (
    <div className="meter" data-tone={tone ?? auto}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = 'sm',
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="btn-group" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          className={`btn ${size === 'sm' ? 'btn-sm' : ''}`}
          aria-pressed={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sortable table headers                                                      */
/* -------------------------------------------------------------------------- */

export type SortDir = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

export function useSort<K extends string>(initial: K, initialDir: SortDir = 'asc') {
  const [sort, setSort] = useState<SortState<K>>({ key: initial, dir: initialDir });

  const toggle = useCallback((key: K) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }, []);

  return { sort, toggle };
}

export function SortHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align,
  width,
}: {
  label: ReactNode;
  sortKey: K;
  sort: SortState<K>;
  onSort: (k: K) => void;
  align?: 'right';
  width?: number | string;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className="sortable"
      style={{ textAlign: align, width }}
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="th-inner">
        {label}
        {active &&
          (sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </span>
    </th>
  );
}

/** Generic comparator driven by an accessor map. */
export function sortRows<T, K extends string>(
  rows: T[],
  sort: SortState<K>,
  accessors: Record<K, (row: T) => string | number | null | undefined>,
): T[] {
  const get = accessors[sort.key];
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    // Missing values always sort last, whichever direction we are going.
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
}

/* -------------------------------------------------------------------------- */
/* Misc hooks                                                                  */
/* -------------------------------------------------------------------------- */

/** Debounces a fast-changing value (search boxes). */
export function useDebounced<T>(value: T, ms = 180): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Case-insensitive substring match across several fields. */
export function useFilterText<T>(rows: T[], query: string, fields: (row: T) => string[]): T[] {
  const q = useDebounced(query).trim().toLowerCase();
  return useMemo(() => {
    if (!q) return rows;
    return rows.filter((r) =>
      fields(r).some((f) => f?.toLowerCase().includes(q)),
    );
    // `fields` is a stable inline accessor in every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q]);
}
