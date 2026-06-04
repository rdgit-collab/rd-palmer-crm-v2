import { Component } from 'react'

const CHUNK_ERROR_RE = /failed to fetch dynamically imported module|importing a module script failed|loading chunk|chunkloaderror/i
const RELOAD_KEY_PREFIX = 'rdp:chunk-reload:'
const RELOAD_COOLDOWN_MS = 2 * 60 * 1000

function isChunkLoadError(error) {
  const message = String(error?.message || error || '')
  return CHUNK_ERROR_RE.test(message)
}

function reloadOnceForChunkError() {
  const key = `${RELOAD_KEY_PREFIX}${window.location.pathname}`
  const lastReload = Number(sessionStorage.getItem(key) || 0)
  if (Date.now() - lastReload < RELOAD_COOLDOWN_MS) return false
  sessionStorage.setItem(key, String(Date.now()))
  window.location.reload()
  return true
}

export default class ErrorBoundary extends Component {
  state = { error: null, info: null, recovering: false }

  static getDerivedStateFromError(error) {
    return { error, recovering: isChunkLoadError(error) }
  }

  componentDidCatch(error, info) {
    console.error('Page render error', error, info)
    this.setState({ info })
    if (isChunkLoadError(error)) {
      reloadOnceForChunkError()
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, info: null })
    }
  }

  render() {
    if (this.state.error) {
      if (this.state.recovering) {
        return (
          <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
            <div className="bg-white border border-red-100 shadow-sm max-w-lg w-full p-6 rounded-lg">
              <h1 className="text-lg font-semibold text-gray-900">Updating CRM</h1>
              <p className="text-sm text-gray-500 mt-2">
                The app is loading the newest version. If this message stays here, press refresh once.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700"
              >
                Refresh Page
              </button>
            </div>
          </div>
        )
      }

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="bg-white border border-red-100 shadow-sm max-w-lg w-full p-6 rounded-lg">
            <h1 className="text-lg font-semibold text-gray-900">This page could not load</h1>
            <p className="text-sm text-gray-500 mt-2">
              Please refresh the page. If it happens again, send this message to admin so we can trace the exact page.
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Page: {window.location.pathname}
            </p>
            <pre className="mt-4 bg-red-50 border border-red-100 text-red-700 text-xs p-3 rounded overflow-auto max-h-40">
              {this.state.error?.message || 'Unknown page error'}
            </pre>
            {this.state.info?.componentStack && (
              <pre className="mt-2 bg-gray-50 border border-gray-100 text-gray-600 text-xs p-3 rounded overflow-auto max-h-40 whitespace-pre-wrap">
                {this.state.info.componentStack}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-4 bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700"
            >
              Refresh Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
