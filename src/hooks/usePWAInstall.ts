import { useEffect, useRef, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePWAInstall() {
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true

    if (isStandalone) {
      setIsInstalled(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      deferredPrompt.current = e as BeforeInstallPromptEvent
      setCanInstall(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setCanInstall(false)
      deferredPrompt.current = null
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  async function triggerInstall() {
    if (!deferredPrompt.current) return false

    await deferredPrompt.current.prompt()
    const { outcome } = await deferredPrompt.current.userChoice

    if (outcome === 'accepted') {
      setCanInstall(false)
      deferredPrompt.current = null
    }

    return outcome === 'accepted'
  }

  return { canInstall, isInstalled, triggerInstall }
}