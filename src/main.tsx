import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ensureSeeded } from './db/seed';
import { syncAutoGrocery } from './domain/grocery';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/print.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing from index.html');

// Reference data has to exist before the first render, or the item form has
// nothing to put in its category and location dropdowns.
//
// The grocery sync runs on boot as well as after every item change: data can
// reach the database without going through the UI (a restored backup, a demo
// load, another tab), and the list has to reflect that the moment you open it.
ensureSeeded()
  .then(() => syncAutoGrocery())
  .catch((err) => console.error('Startup failed:', err))
  .finally(() => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
