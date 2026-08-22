import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, History } from 'lucide-react';
import type { ItemTemplate } from '@/hooks/useItemTemplates';
import { money } from '@/domain/format';

/**
 * Name field for the item form: a dropdown of everything entered before, that
 * you can also just type a new name into.
 *
 * A plain `<select>` would be wrong -- it would make adding a genuinely new
 * product impossible. A native `<datalist>` allows both but only reveals its
 * options once you start typing, which defeats the point of browsing what you
 * have bought before. Hence a real combobox.
 */
export function ItemPicker({
  value,
  templates,
  onChange,
  onPick,
  onSubmit,
  categoryName,
  locationName,
  locale,
  currency,
  placeholder,
}: {
  value: string;
  templates: ItemTemplate[];
  /** Free typing -- a new product. */
  onChange: (name: string) => void;
  /** A previous product was chosen; refill the rest of the form. */
  onPick: (template: ItemTemplate) => void;
  onSubmit?: () => void;
  categoryName: (id: string) => string;
  locationName: (id: string) => string;
  locale: string;
  currency: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const query = value.trim().toLowerCase();
  const matches = useMemo(() => {
    const list = query
      ? templates.filter((t) => t.name.toLowerCase().includes(query))
      : templates;
    return list.slice(0, 40);
  }, [templates, query]);

  // An exact hit means the form is already showing this product's details.
  const exact = templates.find((t) => t.name.toLowerCase() === query);

  useEffect(() => setHighlight(0), [query, open]);

  // Close when focus or a click leaves the control entirely.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the highlighted row in view during keyboard navigation.
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const choose = (t: ItemTemplate) => {
    onPick(t);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && matches[highlight]) {
        e.preventDefault();
        choose(matches[highlight]);
      } else {
        onSubmit?.();
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          className="input"
          value={value}
          autoFocus
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="item-picker-list"
          style={{ paddingRight: 34 }}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => templates.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {templates.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label={open ? 'Hide previous items' : 'Show previous items'}
            tabIndex={-1}
            style={{
              position: 'absolute',
              right: 3,
              top: '50%',
              transform: 'translateY(-50%)',
              padding: 4,
            }}
            onClick={() => setOpen((o) => !o)}
          >
            <ChevronDown
              size={15}
              style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 140ms' }}
            />
          </button>
        )}
      </div>

      {exact && (
        <div className="tiny" style={{ marginTop: 4, color: 'var(--accent-soft-text)' }}>
          <Check size={11} style={{ verticalAlign: -1 }} /> Details filled in from last time
          {exact.inStockNow && ' — you already have this one in stock'}
        </div>
      )}

      {open && matches.length > 0 && (
        <ul
          id="item-picker-list"
          ref={listRef}
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 30,
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: 260,
            overflowY: 'auto',
            margin: 0,
            padding: 4,
            listStyle: 'none',
            background: 'var(--surface)',
            border: 'var(--border-w) solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-2)',
          }}
        >
          <li
            className="tiny faint"
            style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <History size={11} />
            {query ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : 'Previously entered'}
          </li>

          {matches.map((t, i) => (
            <li
              key={t.name}
              role="option"
              aria-selected={i === highlight}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                // mousedown, not click: the input's blur would close the list first.
                e.preventDefault();
                choose(t);
              }}
              style={{
                padding: '6px 8px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                background: i === highlight ? 'var(--accent-soft)' : undefined,
                color: i === highlight ? 'var(--accent-soft-text)' : undefined,
              }}
            >
              <div className="row-between" style={{ gap: 8 }}>
                <span className="strong small truncate">{t.name}</span>
                <span className="tiny num nowrap" style={{ opacity: 0.8 }}>
                  {t.price != null ? money(t.price, locale, currency) : ''}
                </span>
              </div>
              <div className="tiny truncate" style={{ opacity: 0.7 }}>
                {[
                  categoryName(t.categoryId),
                  locationName(t.locationId),
                  t.unit !== 'ea' ? t.unit : null,
                  t.shelfLifeDays ? `keeps ~${t.shelfLifeDays}d` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
