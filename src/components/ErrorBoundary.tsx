import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  declare props: Readonly<Props>;
  declare state: Readonly<State>;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-slate-950 text-white flex items-center justify-center p-6 antialiased select-none">
          <div className="max-w-md w-full bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
              <AlertTriangle className="w-7 h-7 animate-bounce" />
            </div>

            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-extrabold text-white">Application Encountered an Issue</h2>
              <p className="text-xs text-slate-400 font-medium">
                Something went wrong, but don't worry! Click below to restore your session safely.
              </p>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 px-4 rounded-xl bg-accent hover:opacity-90 text-[var(--theme-accent-contrast,#ffffff)] font-extrabold text-xs transition-all shadow-lg cursor-pointer border-0 flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
