import { Component, type ErrorInfo, type ReactNode } from 'react';
import { TriangleAlert, RefreshCw, Home } from 'lucide-react';
import { buttonClasses } from './buttonStyles';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time crashes anywhere below it and shows a recovery screen
 * instead of a blank white page. Mount it with `key={pathname}` so that
 * navigating to another route clears the error and retries rendering.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div role="alert" className="min-h-screen w-full flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-brand-200 rounded-xl shadow-medium p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-xl bg-amber-50 flex items-center justify-center border border-amber-200">
            <TriangleAlert className="w-8 h-8 text-amber-600" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-brand-900 tracking-tight mb-2">Something went wrong</h1>
          <p className="text-sm text-brand-600 leading-relaxed mb-6">
            This page hit an unexpected error. Reloading usually fixes it, and your saved grants and profile are safe.
          </p>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => window.location.reload()} className={buttonClasses('primary', 'md', 'w-full')}>
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Reload page
            </button>
            <a href="/" className={buttonClasses('secondary', 'md', 'w-full')}>
              <Home className="w-4 h-4" aria-hidden="true" />
              Go to home page
            </a>
          </div>
          {import.meta.env.DEV && (
            <pre className="mt-6 max-h-40 overflow-auto rounded-lg bg-brand-50 border border-brand-200 p-3 text-left text-xs text-red-700 whitespace-pre-wrap">
              {error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
