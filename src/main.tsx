import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { registerSW } from 'virtual:pwa-register'

const updateSW = registerSW({
  onOfflineReady() {
    console.log('App siap offline')
  },
  onNeedRefresh() {
    const ok = window.confirm('Versi baru tersedia. Muat ulang sekarang?')
    if (ok) updateSW(true)
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)