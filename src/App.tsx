import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ToastProvider } from '@/components/ui';
import { useApplyTheme } from '@/hooks/useTheme';
import { useSettings } from '@/hooks/useData';
import { Dashboard } from '@/pages/Dashboard';
import { Pantry } from '@/pages/Pantry';
import { GroceryList } from '@/pages/GroceryList';
import { OutOfStock } from '@/pages/OutOfStock';
import { HomeMade } from '@/pages/HomeMade';
import { MealPrep } from '@/pages/MealPrep';
import { Printables } from '@/pages/Printables';
import { Settings } from '@/pages/Settings';

/*
  Split out the three pages that drag in a large dependency of their own --
  recharts for the two chart pages, html5-qrcode for the scanner. Everything
  else is small enough that an extra request costs more than it saves.
*/
const PriceTracker = lazy(() =>
  import('@/pages/PriceTracker').then((m) => ({ default: m.PriceTracker })),
);
const Budget = lazy(() => import('@/pages/Budget').then((m) => ({ default: m.Budget })));
const Scan = lazy(() => import('@/pages/Scan').then((m) => ({ default: m.Scan })));
const Receipts = lazy(() => import('@/pages/Receipts').then((m) => ({ default: m.Receipts })));

function PageFallback() {
  return (
    <div className="content">
      <div className="empty muted small">Loading...</div>
    </div>
  );
}

export function App() {
  const settings = useSettings();
  useApplyTheme(settings);

  return (
    <ToastProvider>
      {/*
        HashRouter rather than BrowserRouter: this is a local-first app that may
        be opened straight off the filesystem or from a static host with no
        rewrite rules, and hash routing works in both without configuration.
      */}
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="pantry" element={<Pantry />} />
            <Route path="grocery" element={<GroceryList />} />
            <Route path="out-of-stock" element={<OutOfStock />} />
            <Route path="homemade" element={<HomeMade />} />
            <Route path="mealprep" element={<MealPrep />} />
            <Route path="print" element={<Printables />} />
            <Route path="settings" element={<Settings />} />

            <Route
              path="prices"
              element={
                <Suspense fallback={<PageFallback />}>
                  <PriceTracker />
                </Suspense>
              }
            />
            <Route
              path="budget"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Budget />
                </Suspense>
              }
            />
            <Route
              path="receipts"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Receipts />
                </Suspense>
              }
            />
            <Route
              path="scan"
              element={
                <Suspense fallback={<PageFallback />}>
                  <Scan />
                </Suspense>
              }
            />

            <Route path="*" element={<Dashboard />} />
          </Route>
        </Routes>
      </HashRouter>
    </ToastProvider>
  );
}
