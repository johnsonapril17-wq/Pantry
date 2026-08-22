import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, Moon, Package, Sun } from 'lucide-react';
import { Icon } from './icons';
import { useGrocery, useItems, useSettings } from '@/hooks/useData';
import { resolveMode, setMode } from '@/hooks/useTheme';
import { stockStatus } from '@/domain/stock';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Badge count; `tone` colours it when the number is worth noticing. */
  count?: number;
  tone?: 'danger' | 'warn';
}

/** Lets `Page` (rendered inside the outlet) open the mobile drawer. */
const DrawerCtx = createContext<() => void>(() => {});

export function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const items = useItems();
  const grocery = useGrocery();

  // Close the drawer on navigation (mobile).
  useEffect(() => setOpen(false), [location.pathname]);

  const outCount = items.filter((i) => i.kind === 'pantry' && stockStatus(i) === 'out').length;
  const lowCount = items.filter((i) => i.kind === 'pantry' && stockStatus(i) === 'low').length;
  const toBuy = grocery.filter((g) => !g.checked).length;

  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: 'Kitchen',
      items: [
        { to: '/', label: 'Dashboard', icon: 'dashboard' },
        {
          to: '/pantry',
          label: 'Pantry',
          icon: 'pantry',
          count: items.filter((i) => i.kind === 'pantry').length,
        },
        { to: '/homemade', label: 'Home Made', icon: 'homemade' },
        { to: '/mealprep', label: 'Meal Prep', icon: 'mealprep' },
      ],
    },
    {
      label: 'Shopping',
      items: [
        { to: '/grocery', label: 'Grocery List', icon: 'grocery', count: toBuy || undefined },
        {
          to: '/out-of-stock',
          label: 'Out of Stock',
          icon: 'outofstock',
          count: outCount || undefined,
          tone: 'danger',
        },
        { to: '/prices', label: 'Price Tracker', icon: 'price' },
      ],
    },
    {
      label: 'Money',
      items: [
        { to: '/budget', label: 'Budget', icon: 'budget' },
        { to: '/receipts', label: 'Receipts', icon: 'receipts' },
      ],
    },
    {
      label: 'Stocktake',
      items: [
        { to: '/print', label: 'Printables', icon: 'print' },
        { to: '/scan', label: 'Scan Sheet', icon: 'scan' },
      ],
    },
  ];

  return (
    <div className="app">
      {open && <div className="scrim no-print" onClick={() => setOpen(false)} />}

      <aside className="sidebar no-print" data-open={open}>
        <div className="sidebar-brand">
          <span className="mark">
            <Package size={18} />
          </span>
          <span className="grow">
            <div className="name">Pantry Tracker</div>
            <div className="tiny faint">
              {lowCount > 0 ? `${lowCount} running low` : 'All stocked'}
            </div>
          </span>
        </div>

        <nav className="nav">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="nav-group-label">{g.label}</div>
              {g.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  <Icon name={item.icon} size={17} />
                  <span className="grow truncate">{item.label}</span>
                  {item.count != null && (
                    <span className="count" data-tone={item.tone}>
                      {item.count}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Icon name="settings" size={17} />
            <span className="grow">Settings</span>
          </NavLink>
        </div>
      </aside>

      <div className="main">
        <DrawerCtx.Provider value={() => setOpen(true)}>
          <Outlet />
        </DrawerCtx.Provider>
      </div>
    </div>
  );
}

/**
 * Page chrome. Every page renders one of these so the title, subtitle and
 * action area sit in exactly the same place throughout the app.
 */
export function Page({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const settings = useSettings();
  const mode = resolveMode(settings.mode);
  const openDrawer = useContext(DrawerCtx);

  return (
    <>
      <header className="topbar no-print">
        <button
          className="btn btn-ghost btn-icon menu-btn"
          onClick={openDrawer}
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>

        <div className="titles grow">
          <h1>{title}</h1>
          {subtitle && <div className="sub truncate">{subtitle}</div>}
        </div>

        <div className="toolbar">
          {actions}
          <button
            className="btn btn-ghost btn-icon"
            title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle dark mode"
            onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
          >
            {mode === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      <div className="content">{children}</div>
    </>
  );
}
