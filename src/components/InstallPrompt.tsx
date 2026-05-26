import { useEffect, useState } from 'react'

interface Props {
  onInstall: () => Promise<boolean>
  onDismiss: () => void
}

export function InstallPrompt({ onInstall, onDismiss }: Props) {
  const [visible, setVisible] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 400)
    return () => window.clearTimeout(timer)
  }, [])

  async function handleInstall() {
    setInstalling(true)
    await onInstall()
    setInstalling(false)
  }

  return (
    <div className={`install-overlay ${visible ? 'is-visible' : ''}`} role="dialog" aria-modal="true" aria-label="Install QAIRA">
      <div className="install-backdrop" onClick={onDismiss} aria-hidden="true" />
      <div className="install-sheet">
        <div className="install-icon" aria-hidden="true">
          <img
            src="/icons/icon-192.png"
            alt="QAIRA icon"
            width={72}
            height={72}
            loading="eager"
          />
        </div>

        <div className="install-copy">
          <h2 className="install-title">Pasang QAIRA</h2>
          <p className="install-desc">
            Instal QAIRA ke layar utama untuk pengalaman yang lebih cepat, tanpa browser, dan bisa diakses kapan saja.
          </p>
        </div>

        <div className="install-actions">
          <button
            type="button"
            className="install-btn install-btn-primary"
            onClick={handleInstall}
            disabled={installing}
          >
            {installing ? 'Menginstal...' : 'Pasang Sekarang'}
          </button>
          <button
            type="button"
            className="install-btn install-btn-ghost"
            onClick={onDismiss}
            disabled={installing}
          >
            Nanti Saja
          </button>
        </div>
      </div>
    </div>
  )
}