import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class AdminPageBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State { return { error } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('HQ workspace render failure', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return <div className="flex h-full min-h-0 flex-1 flex-col">{this.props.children}</div>
    return <div role="alert" className="mx-auto mt-12 max-w-xl rounded-2xl border border-amber-400/20 bg-amber-400/[.04] p-6 text-center">
      <AlertTriangle className="mx-auto text-amber-300" size={28}/>
      <h1 className="mt-4 text-lg font-semibold text-white">This workspace needs to be reloaded</h1>
      <p className="mt-2 text-sm leading-6 text-slate-400">Your navigation and account are still available. Reload this section to recover its latest data.</p>
      <button type="button" onClick={() => this.setState({ error: null })} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-gold/30 bg-gold/10 px-4 py-2.5 text-sm font-semibold text-gold hover:bg-gold/15"><RotateCw size={15}/>Reload workspace</button>
    </div>
  }
}
