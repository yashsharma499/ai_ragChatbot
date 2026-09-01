import { Component } from "react";
import Icon from "./ui/Icon";

/**
 * Without this, any render-time exception blanks the whole page to white with
 * nothing but a console message — the worst possible failure during a demo.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled UI error:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020617] p-6">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/60 p-8 text-center shadow-2xl">
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10">
            <Icon name="warning" className="h-7 w-7 text-rose-400" />
          </span>

          <h1 className="text-lg font-bold text-white">This page hit an error</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Something in the interface stopped unexpectedly. Reloading usually
            clears it.
          </p>

          <pre className="mt-4 max-h-32 overflow-auto rounded-lg border border-white/5 bg-slate-950/60 p-3 text-left text-[11px] leading-relaxed text-slate-500">
            {String(this.state.error?.message || this.state.error)}
          </pre>

          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
