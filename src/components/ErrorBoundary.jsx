import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Page render error', error, info)
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="bg-white border border-red-100 shadow-sm max-w-lg w-full p-6 rounded-lg">
            <h1 className="text-lg font-semibold text-gray-900">This page could not load</h1>
            <p className="text-sm text-gray-500 mt-2">
              Please refresh the page. If it happens again, send this message to admin so we can trace the exact page.
            </p>
            <pre className="mt-4 bg-red-50 border border-red-100 text-red-700 text-xs p-3 rounded overflow-auto max-h-40">
              {this.state.error?.message || 'Unknown page error'}
            </pre>
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
