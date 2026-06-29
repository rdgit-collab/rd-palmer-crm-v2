import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import { registerPwaServiceWorker } from './lib/pwa'

const PRELOAD_RELOAD_KEY = 'rdp:preload-reload'
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  const lastReload = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY) || 0)
  if (Date.now() - lastReload < 2 * 60 * 1000) return
  sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(Date.now()))
  window.location.reload()
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 10,
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)

registerPwaServiceWorker()
