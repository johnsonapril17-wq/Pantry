import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Without this, any render error unmounts the whole tree and the user gets a
 * blank white page with nothing to go on. Catching it here turns that into a
 * readable message plus the two things that actually recover the app.
 *
 * Deliberately dependency-free and inline-styled: it has to render even when
 * the failure is in the stylesheet, the router or the database layer.
 */
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the full stack in the console for anyone with devtools open.
    console.error('Unhandled render error:', error, info.componentStack);
    this.setState({ info });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const storageBlocked = /indexeddb|database|dexie|quota|not allowed/i.test(
      `${error.name} ${error.message}`,
    );

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          fontFamily: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif',
          background: '#fff',
          color: '#111',
        }}
      >
        <div style={{ maxWidth: 640, width: '100%' }}>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Something broke on this screen</h1>

          <p style={{ margin: '0 0 16px', color: '#555', lineHeight: 1.5 }}>
            {storageBlocked ? (
              <>
                The app could not reach its local database. This usually means the browser is
                blocking storage &mdash; a private/incognito window, or site data disabled for
                localhost. Pantry Tracker keeps everything in IndexedDB, so it cannot run without
                it.
              </>
            ) : (
              <>The rest of your data is safe; this is a display error, not a data loss.</>
            )}
          </p>

          <pre
            style={{
              background: '#f5f5f5',
              border: '1px solid #e0e0e0',
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
              lineHeight: 1.5,
              overflow: 'auto',
              maxHeight: 260,
              margin: '0 0 16px',
              whiteSpace: 'pre-wrap',
            }}
          >
            {error.name}: {error.message}
            {info?.componentStack ? `\n${info.componentStack.trim()}` : ''}
          </pre>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                this.setState({ error: null, info: null });
                window.location.hash = '#/';
              }}
              style={btn(true)}
            >
              Back to dashboard
            </button>
            <button onClick={() => window.location.reload()} style={btn(false)}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

function btn(primary: boolean): React.CSSProperties {
  return {
    padding: '9px 16px',
    borderRadius: 8,
    border: `1px solid ${primary ? '#3f6212' : '#d0d0d0'}`,
    background: primary ? '#3f6212' : '#fff',
    color: primary ? '#fff' : '#111',
    fontSize: 14,
    fontWeight: 550,
    cursor: 'pointer',
  };
}
