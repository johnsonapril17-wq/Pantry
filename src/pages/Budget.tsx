import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Banknote, Plus, Trash2 } from 'lucide-react';
import { Page } from '@/components/Layout';
import { EmptyState, Field, Meter, Modal, SegmentedControl, Stat, useToast } from '@/components/ui';
import { db, now, uid } from '@/db/schema';
import { byId, useSettings, useSpends, useStores } from '@/hooks/useData';
import {
  addDays,
  endOfMonth,
  endOfWeek,
  money,
  monthLabel,
  percent,
  rangeLabel,
  shortDate,
  startOfMonth,
  startOfWeek,
  toISODate,
  withinRange,
} from '@/domain/format';

type Period = 'week' | 'month';

/**
 * "Track weekly budget/spending" and "Monthly budget/spending" (notes, photo 02).
 *
 * A `Spend` row is the unit of money out. Checking out a grocery list creates
 * one, entering a receipt creates one, and you can add one by hand here.
 */
export function Budget() {
  const spends = useSpends();
  const stores = useStores();
  const settings = useSettings();
  const toast = useToast();

  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState(false);

  const strs = byId(stores);

  const { from, to } = useMemo(() => {
    const base = new Date();
    if (period === 'week') {
      const start = addDays(startOfWeek(base, settings.weekStartsOn), offset * 7);
      return { from: start, to: endOfWeek(start, settings.weekStartsOn) };
    }
    const start = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    return { from: startOfMonth(start), to: endOfMonth(start) };
  }, [period, offset, settings.weekStartsOn]);

  const inPeriod = useMemo(
    () => spends.filter((s) => withinRange(s.date, from, to)),
    [spends, from, to],
  );

  const spent = inPeriod.reduce((sum, s) => sum + s.amount, 0);
  const budget = period === 'week' ? settings.weeklyBudget : settings.monthlyBudget;
  const left = budget - spent;
  const pct = percent(spent, budget);

  /** Last 12 periods, oldest first -- the history chart. */
  const history = useMemo(() => {
    const out: { label: string; spent: number; budget: number; over: boolean }[] = [];
    const base = new Date();
    for (let i = 11; i >= 0; i--) {
      let f: Date;
      let t: Date;
      let label: string;
      if (period === 'week') {
        f = addDays(startOfWeek(base, settings.weekStartsOn), -i * 7);
        t = endOfWeek(f, settings.weekStartsOn);
        label = shortDate(toISODate(f), settings.locale);
      } else {
        const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
        f = startOfMonth(d);
        t = endOfMonth(d);
        label = monthLabel(toISODate(f), settings.locale);
      }
      const total = spends
        .filter((s) => withinRange(s.date, f, t))
        .reduce((sum, s) => sum + s.amount, 0);
      out.push({ label, spent: Math.round(total * 100) / 100, budget, over: total > budget });
    }
    return out;
  }, [spends, period, budget, settings.weekStartsOn, settings.locale]);

  /** Where the money went, this period. */
  const byStore = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of inPeriod) {
      const key = s.storeId ?? '';
      map.set(key, (map.get(key) ?? 0) + s.amount);
    }
    return [...map.entries()]
      .map(([id, amount]) => ({ name: strs.get(id)?.name ?? 'Other', amount }))
      .sort((a, b) => b.amount - a.amount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inPeriod, stores]);

  const periodName = period === 'week' ? 'week' : 'month';

  return (
    <Page
      title="Budget"
      subtitle={rangeLabel(from, to, settings.locale)}
      actions={
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} />
          Add spend
        </button>
      }
    >
      <div className="row-between wrap">
        <SegmentedControl<Period>
          value={period}
          onChange={(p) => {
            setPeriod(p);
            setOffset(0);
          }}
          options={[
            { value: 'week', label: 'Weekly' },
            { value: 'month', label: 'Monthly' },
          ]}
        />
        <div className="btn-group">
          <button className="btn btn-sm" onClick={() => setOffset((o) => o - 1)}>
            Previous
          </button>
          <button className="btn btn-sm" onClick={() => setOffset(0)} disabled={offset === 0}>
            {period === 'week' ? 'This week' : 'This month'}
          </button>
          <button className="btn btn-sm" onClick={() => setOffset((o) => o + 1)} disabled={offset >= 0}>
            Next
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <Stat
          label={`Spent this ${periodName}`}
          value={money(spent, settings.locale, settings.currency)}
          hint={`${inPeriod.length} transaction${inPeriod.length === 1 ? '' : 's'}`}
          tone={spent > budget ? 'danger' : undefined}
        />
        <Stat
          label={period === 'week' ? 'Weekly budget' : 'Monthly budget'}
          value={money(budget, settings.locale, settings.currency)}
          hint="Change it in Settings"
        />
        <Stat
          label={left >= 0 ? 'Left to spend' : 'Over budget'}
          value={money(Math.abs(left), settings.locale, settings.currency)}
          tone={left >= 0 ? 'ok' : 'danger'}
          hint={`${pct}% of budget used`}
        />
        <Stat
          label="Average per shop"
          value={money(inPeriod.length ? spent / inPeriod.length : 0, settings.locale, settings.currency)}
        />
      </div>

      <div className="card">
        <div className="card-body">
          <div className="row-between" style={{ marginBottom: 8 }}>
            <span className="small strong">
              {money(spent, settings.locale, settings.currency)} of{' '}
              {money(budget, settings.locale, settings.currency)}
            </span>
            <span className="small muted">{pct}%</span>
          </div>
          <Meter value={spent} max={budget} />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Last 12 {periodName}s</h2>
          <span className="small muted">Bars above the line are over budget</span>
        </div>
        <div className="card-body" style={{ height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={history} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="var(--text-faint)"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
              />
              <YAxis
                stroke="var(--text-faint)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={54}
                tickFormatter={(v) => money(v, settings.locale, settings.currency)}
              />
              <Tooltip
                cursor={{ fill: 'var(--surface-2)' }}
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text)',
                  fontSize: 12,
                }}
                formatter={(v: number) => money(v, settings.locale, settings.currency)}
              />
              <Bar dataKey="spent" radius={[3, 3, 0, 0]}>
                {history.map((h, i) => (
                  <Cell key={i} fill={h.over ? 'var(--danger)' : 'var(--accent)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 340px) 1fr',
          gap: 'var(--space-5)',
          alignItems: 'start',
        }}
        className="budget-layout"
      >
        <div className="card">
          <div className="card-head">
            <h2>By store</h2>
          </div>
          <div className="card-body flush">
            {byStore.length === 0 ? (
              <div className="empty small">Nothing recorded this {periodName}.</div>
            ) : (
              <table className="table">
                <tbody>
                  {byStore.map((s) => (
                    <tr key={s.name}>
                      <td>{s.name}</td>
                      <td className="col-num strong">
                        {money(s.amount, settings.locale, settings.currency)}
                      </td>
                      <td style={{ width: 90 }}>
                        <Meter value={s.amount} max={spent} tone="ok" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Transactions</h2>
            <span className="small muted">{rangeLabel(from, to, settings.locale)}</span>
          </div>
          <div className="card-body flush">
            {inPeriod.length === 0 ? (
              <EmptyState
                icon={<Banknote size={22} />}
                title={`Nothing spent this ${periodName}`}
                message="Checking out a grocery list or entering a receipt records the spend automatically."
                action={
                  <button className="btn btn-sm" onClick={() => setAdding(true)}>
                    <Plus size={15} /> Add spend
                  </button>
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Date</th>
                      <th>Note</th>
                      <th>Store</th>
                      <th className="col-num">Amount</th>
                      <th className="col-tight" />
                    </tr>
                  </thead>
                  <tbody>
                    {inPeriod.map((s) => (
                      <tr key={s.id}>
                        <td className="nowrap">{shortDate(s.date, settings.locale)}</td>
                        <td>{s.note || <span className="faint">--</span>}</td>
                        <td className="small muted">{strs.get(s.storeId ?? '')?.name ?? '--'}</td>
                        <td className="col-num strong">
                          {money(s.amount, settings.locale, settings.currency)}
                        </td>
                        <td className="col-tight">
                          <button
                            className="btn btn-ghost btn-icon"
                            onClick={async () => {
                              await db.spends.delete(s.id);
                              toast('Transaction removed.');
                            }}
                            aria-label="Delete transaction"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {adding && <AddSpendModal onClose={() => setAdding(false)} />}

      <style>{`
        @media (max-width: 1000px) {
          .budget-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </Page>
  );
}

function AddSpendModal({ onClose }: { onClose: () => void }) {
  const stores = useStores();
  const toast = useToast();

  const [date, setDate] = useState(toISODate(new Date()));
  const [amount, setAmount] = useState('');
  const [storeId, setStoreId] = useState('');
  const [note, setNote] = useState('');

  const save = async () => {
    if (amount === '' || Number(amount) <= 0) {
      toast('Enter an amount.', 'danger');
      return;
    }
    await db.spends.add({
      id: uid(),
      date,
      amount: Number(amount),
      storeId: storeId || undefined,
      note: note.trim() || undefined,
      createdAt: now(),
    });
    toast('Spend recorded.', 'ok');
    onClose();
  };

  return (
    <Modal
      title="Add spend"
      onClose={onClose}
      size="narrow"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Add
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 'var(--space-3)' }}>
        <Field label="Amount">
          <input
            className="input"
            autoFocus
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Store">
          <select className="select" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Not recorded</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note">
          <input
            className="input"
            value={note}
            placeholder="e.g. Weekly shop"
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
