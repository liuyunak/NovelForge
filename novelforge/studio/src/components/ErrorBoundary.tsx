import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  /** Key that, when changed, triggers automatic error reset on remount. */
  resetKey?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary — catches rendering errors in the component tree
 * and displays a fallback UI instead of a white screen.
 *
 * Usage:
 *   <ErrorBoundary resetKey={workspaceId}>
 *     <YourComponent />
 *   </ErrorBoundary>
 *
 * When `resetKey` changes (e.g., workspaceId changes), the boundary
 * auto-resets, allowing recovery from transient rendering errors.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  componentDidUpdate(prevProps: Props) {
    // Auto-reset when resetKey changes (e.g., navigating to a different workspace)
    if (this.state.hasError && this.props.resetKey !== prevProps.resetKey) {
      this.setState({ hasError: false, error: null })
    }
  }

  componentDidMount() {
    // Catch unhandled promise rejections that bubble up to window
    this._unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      console.error('[ErrorBoundary] Unhandled promise rejection:', event.reason)
    }
    window.addEventListener('unhandledrejection', this._unhandledRejectionHandler)
  }

  componentWillUnmount() {
    if (this._unhandledRejectionHandler) {
      window.removeEventListener('unhandledrejection', this._unhandledRejectionHandler)
    }
  }

  private _unhandledRejectionHandler?: (event: PromiseRejectionEvent) => void

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a1a] text-white p-8">
          <div className="max-w-md text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold mb-2">页面出现了意外错误</h1>
            <p className="text-gray-400 text-sm mb-4">
              {this.state.error?.message || '未知错误'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm transition"
              >
                重试
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition"
              >
                刷新页面
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
