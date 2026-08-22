import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  PackageX,
  ShoppingCart,
  UtensilsCrossed,
} from 'lucide-react';
import { Page } from '@/components/Layout';
import { Icon } from '@/components/icons';
import { Badge, EmptyState, Meter, Stat } from '@/components/ui';
import {
  byId,
  useCategories,
  useGrocery,
  useItems,
  useSettings,
  useSpends,
  useStores,
} from '@/hooks/useData';
import { listTotal, outOfStockValue } from '@/domain/grocery';
import {
  daysLeftLabel,
  expiryStatus,
  restockQty,
  stockStatus,
  daysLeft,
} from '@/domain/stock';
import {
  endOfMonth,
  endOfWeek,
  mediumDate,
  money,
  percent,
  startOfMonth,
  startOfWeek,
  withinRange,
} from '@/domain/format';

export function Dashboard() {
  const items = useItems();
  const grocery = useGrocery();
  const spends = useSpends();
  const categories = useCategories();
  const stores = useStores();
  const settings = useSettings();

  const cats = byId(categories);
  const strs = byId(stores);

  const pantry = items.filter((i) => i.kind === 'pantry');

  const summary = useMemo(() => {
    let low = 0;
    let out = 0;
    let value = 0;
    for (const i of pantry) {
      const s = stockStatus(i);
      if (s === 'low') low++;
      if (s === 'out') out++;
      value += (i.price ?? 0) * i.qty;
    }
    return { low, out, value };
  }, [pantry]);

  const expiring = useMemo(
    () =>
      items
        .filter((i) => {
          const st = expiryStatus(i.expiry, settings.expiryWarnDays);
          return st === 'soon' || st === 'expired';
        })
        .sort((a, b) => (daysLeft(a.expiry) ?? 0) - (daysLeft(b.expiry) ?? 0))
        .slice(0, 8),
    [items, settings.expiryWarnDays],
  );

  const restockList = useMemo(
    () =>
      pantry
        .filter((i) => stockStatus(i) !== 'in')
        .sort((a, b) => stockStatus(a).localeCompare(stockStatus(b)) || a.name.localeCompare(b.name))
        .slice(0, 8),
    [pantry],
  );

  const { weekSpent, monthSpent } = useMemo(() => {
    const nowDate = new Date();
    const wf = startOfWeek(nowDate, settings.weekStartsOn);
    const wt = endOfWeek(nowDate, settings.weekStartsOn);
    const mf = startOfMonth(nowDate);
    const mt = endOfMonth(nowDate);
    return {
      weekSpent: spends.filter((s) => withinRange(s.date, wf, wt)).reduce((n, s) => n + s.amount, 0),
      monthSpent: spends.filter((s) => withinRange(s.date, mf, mt)).reduce((n, s) => n + s.amount, 0),
    };
  }, [spends, settings.weekStartsOn]);

  const toBuy = grocery.filter((g) => !g.checked);
  const mealPortions = items
    .filter((i) => i.kind === 'mealprep')
    .reduce((n, i) => n + i.qty * (i.portions ?? 1), 0);

  if (items.length === 0 && spends.length === 0) {
    return (
      <Page title="Dashboard" subtitle="Everything at a glance">
        <div className="card">
          <div className="card-body">
            <EmptyState
              icon={<PackageX size={22} />}
              title="Nothing tracked yet"
              message={
                <>
                  Add your first pantry item, or load the demo data from Settings to see how the
                  pieces fit together before committing your own.
                </>
              }
              action={
                <div className="row">
                  <Link to="/pantry" className="btn btn-primary btn-sm">
                    Add pantry items
                  </Link>
                  <Link to="/settings" className="btn btn-sm">
                    Load demo data
                  </Link>
                </div>
              }
            />
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page
      title="Dashboard"
      subtitle={
        settings.lastInventoryDate
          ? `Last stocktake ${mediumDate(settings.lastInventoryDate, settings.locale)}`
          : 'No stocktake recorded yet'
      }
    >
      <div className="stat-grid">
        <Stat
          label="Pantry value"
          value={money(summary.value, settings.locale, settings.currency)}
          hint={`${pantry.length} items on hand`}
        />
        <Stat
          label="Out of stock"
          value={summary.out}
          tone={summary.out ? 'danger' : 'ok'}
          hint={`${money(outOfStockValue(pantry), settings.locale, settings.currency)} to replace`}
          icon={<PackageX size={13} />}
        />
        <Stat
          label="Running low"
          value={summary.low}
          tone={summary.low ? 'warn' : 'ok'}
          icon={<AlertTriangle size={13} />}
        />
        <Stat
          label="On the list"
          value={toBuy.length}
          hint={`${money(listTotal(toBuy, true), settings.locale, settings.currency)} estimated`}
          icon={<ShoppingCart size={13} />}
        />
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-head">
            <h2>This week</h2>
            <Link to="/budget" className="small">
              Budget
            </Link>
          </div>
          <div className="card-body col" style={{ gap: 'var(--space-4)' }}>
            <div>
              <div className="row-between small" style={{ marginBottom: 6 }}>
                <span className="strong">
                  {money(weekSpent, settings.locale, settings.currency)} of{' '}
                  {money(settings.weeklyBudget, settings.locale, settings.currency)}
                </span>
                <span className="muted">{percent(weekSpent, settings.weeklyBudget)}%</span>
              </div>
              <Meter value={weekSpent} max={settings.weeklyBudget} />
            </div>
            <div>
              <div className="row-between small" style={{ marginBottom: 6 }}>
                <span className="strong">
                  {money(monthSpent, settings.locale, settings.currency)} of{' '}
                  {money(settings.monthlyBudget, settings.locale, settings.currency)}
                </span>
                <span className="muted">this month · {percent(monthSpent, settings.monthlyBudget)}%</span>
              </div>
              <Meter value={monthSpent} max={settings.monthlyBudget} />
            </div>
            <div className="row" style={{ gap: 'var(--space-4)' }}>
              <span className="small muted row" style={{ gap: 6 }}>
                <Banknote size={14} />
                {money(
                  Math.max(0, settings.weeklyBudget - weekSpent),
                  settings.locale,
                  settings.currency,
                )}{' '}
                left this week
              </span>
              <span className="small muted row" style={{ gap: 6 }}>
                <UtensilsCrossed size={14} />
                {mealPortions} portions in the freezer
              </span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>
              <span className="row" style={{ gap: 8 }}>
                <CalendarClock size={16} />
                Use these first
              </span>
            </h2>
            <Link to="/pantry" className="small">
              Pantry
            </Link>
          </div>
          <div className="card-body flush">
            {expiring.length === 0 ? (
              <div className="empty small">Nothing expiring in the next {settings.expiryWarnDays} days.</div>
            ) : (
              <table className="table">
                <tbody>
                  {expiring.map((i) => {
                    const st = expiryStatus(i.expiry, settings.expiryWarnDays);
                    return (
                      <tr key={i.id} data-expired={st === 'expired'}>
                        <td>
                          <span className="row" style={{ gap: 8 }}>
                            <Icon name={cats.get(i.categoryId)?.icon} size={14} />
                            <span className="item-name">{i.name}</span>
                          </span>
                        </td>
                        <td className="col-num muted small">
                          {i.qty} {i.unit !== 'ea' ? i.unit : ''}
                        </td>
                        <td className="col-tight">
                          <Badge tone={st === 'expired' ? 'danger' : 'warn'}>
                            {st === 'expired' ? 'Expired' : daysLeftLabel(i.expiry)}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Needs restocking</h2>
            <Link to="/grocery" className="small">
              Grocery list
            </Link>
          </div>
          <div className="card-body flush">
            {restockList.length === 0 ? (
              <div className="empty small">Everything is in stock.</div>
            ) : (
              <table className="table">
                <tbody>
                  {restockList.map((i) => {
                    const s = stockStatus(i);
                    return (
                      <tr key={i.id}>
                        <td>
                          <span className="item-name">{i.name}</span>
                          <div className="tiny faint">
                            buy {restockQty(i)} {i.unit !== 'ea' ? i.unit : ''} ·{' '}
                            {strs.get(i.storeId ?? '')?.name ?? 'any store'}
                          </div>
                        </td>
                        <td className="col-num small">
                          {i.price == null
                            ? '--'
                            : money(i.price * restockQty(i), settings.locale, settings.currency)}
                        </td>
                        <td className="col-tight">
                          <Badge tone={s === 'out' ? 'danger' : 'warn'}>
                            {s === 'out' ? 'Out' : 'Low'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .dash-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: var(--space-5);
          align-items: start;
        }
      `}</style>
    </Page>
  );
}
