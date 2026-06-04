import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const PRELOAD_RELOAD_KEY = 'rdp:preload-reload'
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  const lastReload = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY) || 0)
  if (Date.now() - lastReload < 2 * 60 * 1000) return
  sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(Date.now()))
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
