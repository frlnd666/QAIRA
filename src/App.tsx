import { useEffect, useMemo, useRef, useState } from 'react'
import { AvatarFace, type MiawbelExpression } from './components/AvatarFace'
import { askPerplexity } from './lib/perplexity'
import { sanitizeTextForSpeech, speak, warmupVoices } from './lib/tts'

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'
type AppMode = 'bercanda' | 'bermain' | 'belajar'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>
}

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognition
    SpeechRecognition?: new () => SpeechRecognition
  }
}

export default function App() {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [appMode, setAppMode] = useState<AppMode>('bercanda')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const [expression, setExpression] = useState<MiawbelExpression>('idle')
  const [mouthOpen, setMouthOpen] = useState(0)
  const [statusText, setStatusText] = useState('Tekan mikrofon untuk mulai bicara')
  const [lastHeard, setLastHeard] = useState('')
  const [errorText, setErrorText] = useState('')
  const [isPetting, setIsPetting] = useState(false)

  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [canInstallPWA, setCanInstallPWA] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIosManualInstall, setIsIosManualInstall] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const cancelSpeechRef = useRef<(() => void) | null>(null)
  const busyRef = useRef(false)
  const voiceStateRef = useRef<VoiceState>('idle')
  const petTimeoutRef = useRef<number | null>(null)
  const expressionResetTimeoutRef = useRef<number | null>(null)
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null)
  const settingsCloseButtonRef = useRef<HTMLButtonElement | null>(null)

  const recognitionSupported = useMemo(() => {
    return (
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    )
  }, [])

  useEffect(() => {
    warmupVoices()

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true

    setIsInstalled(standalone)

    const ua = window.navigator.userAgent.toLowerCase()
    const isIos =
      /iphone|ipad|ipod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    if (isIos && !standalone) {
      setIsIosManualInstall(true)
      setShowInstallPrompt(true)
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      deferredPromptRef.current = event as BeforeInstallPromptEvent
      setCanInstallPWA(true)

      if (!standalone) {
        setShowInstallPrompt(true)
      }
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setCanInstallPWA(false)
      setShowInstallPrompt(false)
      setIsIosManualInstall(false)
      deferredPromptRef.current = null
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      recognitionRef.current?.stop()
      cancelSpeechRef.current?.()
      window.speechSynthesis.cancel()

      if (petTimeoutRef.current !== null) {
        window.clearTimeout(petTimeoutRef.current)
      }

      if (expressionResetTimeoutRef.current !== null) {
        window.clearTimeout(expressionResetTimeoutRef.current)
      }

      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  useEffect(() => {
    voiceStateRef.current = voiceState
  }, [voiceState])

  useEffect(() => {
    if (!isSettingsOpen) return

    settingsCloseButtonRef.current?.focus()

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSettingsOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isSettingsOpen])

  function clearPetTimeout() {
    if (petTimeoutRef.current !== null) {
      window.clearTimeout(petTimeoutRef.current)
      petTimeoutRef.current = null
    }
  }

  function clearExpressionResetTimeout() {
    if (expressionResetTimeoutRef.current !== null) {
      window.clearTimeout(expressionResetTimeoutRef.current)
      expressionResetTimeoutRef.current = null
    }
  }

  function getIdleStatusText() {
    if (appMode === 'bercanda') return 'Mode bercanda aktif. Tekan mikrofon untuk mulai bicara'
    if (appMode === 'bermain') return 'Mode bermain aktif. Ayo ngobrol dan seru-seruan'
    return 'Mode belajar aktif. Tekan mikrofon untuk mulai bertanya'
  }

  function stopAllAudio() {
    recognitionRef.current?.stop()
    cancelSpeechRef.current?.()
    window.speechSynthesis.cancel()
    setMouthOpen(0)
  }

  function setIdleState(customText?: string) {
    busyRef.current = false
    setVoiceState('idle')
    setExpression('idle')
    setMouthOpen(0)
    setStatusText(customText ?? getIdleStatusText())
  }

  function restoreExpressionAfterPet() {
    clearPetTimeout()

    petTimeoutRef.current = window.setTimeout(() => {
      setIsPetting(false)

      if (voiceStateRef.current === 'idle') {
        setExpression('idle')
        setStatusText(getIdleStatusText())
      } else if (voiceStateRef.current === 'listening') {
        setExpression('listening')
        setStatusText('Saya mendengarkan...')
      } else if (voiceStateRef.current === 'thinking') {
        setExpression('thinking')
        setStatusText('Sedang berpikir...')
      } else if (voiceStateRef.current === 'speaking') {
        setExpression('speaking')
        setStatusText('Sedang menjawab...')
      } else if (voiceStateRef.current === 'error') {
        setExpression('idle')
        setStatusText('Terjadi kesalahan. Coba lagi.')
      }
    }, 850)
  }

  function triggerPetReaction() {
    clearPetTimeout()

    const reactions: MiawbelExpression[] = ['happy', 'wink', 'excited']
    const reaction = reactions[Math.floor(Math.random() * reactions.length)]

    setIsPetting(true)
    setExpression(reaction)

    if (voiceStateRef.current === 'idle') {
      setStatusText('Hihi, kok dielus~')
    } else if (voiceStateRef.current === 'listening') {
      setStatusText('Hehe, aku lagi dengerin nih~')
    } else if (voiceStateRef.current === 'thinking') {
      setStatusText('Ih, sabar yaa, aku lagi mikir~')
    } else if (voiceStateRef.current === 'speaking') {
      setStatusText('Hehe, jangan ganggu dulu dong~')
    } else if (voiceStateRef.current === 'error') {
      setStatusText('Aduh, tadi sempat error...')
    }

    restoreExpressionAfterPet()
  }

  function handleAvatarPressStart() {
    triggerPetReaction()
  }

  function handleAvatarPressEnd() {
    restoreExpressionAfterPet()
  }

  function handleModeChange(mode: AppMode) {
    setAppMode(mode)
    setStatusText(
      mode === 'bercanda'
        ? 'Mode bercanda dipilih. Yuk ngobrol santai~'
        : mode === 'bermain'
        ? 'Mode bermain dipilih. Ayo seru-seruan bareng~'
        : 'Mode belajar dipilih. Siap untuk tanya jawab yang lebih fokus.'
    )
  }

  async function handleInstallNow() {
    if (isInstalled) {
      setShowInstallPrompt(false)
      return
    }

    if (!deferredPromptRef.current) {
      return
    }

    try {
      setIsInstalling(true)
      await deferredPromptRef.current.prompt()
      const choice = await deferredPromptRef.current.userChoice

      if (choice.outcome === 'accepted') {
        setShowInstallPrompt(false)
        setCanInstallPWA(false)
        deferredPromptRef.current = null
      }
    } catch (error) {
      console.error('Gagal memunculkan prompt install:', error)
    } finally {
      setIsInstalling(false)
    }
  }

  async function handleTranscript(transcript: string) {
    const cleanTranscript = transcript.trim()

    if (!cleanTranscript) {
      setIdleState()
      return
    }

    busyRef.current = true
    setLastHeard(cleanTranscript)
    setErrorText('')
    setVoiceState('thinking')
    setExpression(Math.random() > 0.5 ? 'thinking' : 'surprised')
    setStatusText('Sedang berpikir...')

    try {
      const modePrompt =
        appMode === 'bercanda'
          ? `Jawab dengan gaya hangat, lucu, ringan, dan ramah untuk anak. Pertanyaan pengguna: ${cleanTranscript}`
          : appMode === 'bermain'
          ? `Jawab dengan gaya playful, interaktif, imajinatif, dan menyenangkan untuk anak. Pertanyaan pengguna: ${cleanTranscript}`
          : `Jawab dengan gaya edukatif, lembut, jelas, singkat, dan mudah dipahami anak. Pertanyaan pengguna: ${cleanTranscript}`

      const reply = await askPerplexity(modePrompt)
      const spokenReply = sanitizeTextForSpeech(reply)

      setVoiceState('speaking')
      setExpression('speaking')
      setStatusText('Sedang menjawab...')

      cancelSpeechRef.current = speak(
        spokenReply,
        (value) => setMouthOpen(value),
        () => {
          setMouthOpen(0)
          setExpression(Math.random() > 0.6 ? 'excited' : 'happy')
          setVoiceState('idle')
          setStatusText('Selesai. Tekan mikrofon untuk bicara lagi.')

          clearExpressionResetTimeout()
          expressionResetTimeoutRef.current = window.setTimeout(() => {
            if (!isPetting) {
              setExpression('idle')
            }
            busyRef.current = false
            setStatusText(getIdleStatusText())
          }, 1200)
        }
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Terjadi kesalahan.'

      setErrorText(message)
      setVoiceState('error')
      setExpression('idle')
      setStatusText('Terjadi kesalahan. Coba lagi.')
      setMouthOpen(0)
      busyRef.current = false
    }
  }

  function startListening() {
    if (busyRef.current) return

    clearExpressionResetTimeout()
    clearPetTimeout()

    setIsPetting(false)
    setErrorText('')
    setLastHeard('')
    stopAllAudio()

    const RecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!RecognitionCtor) {
      setVoiceState('error')
      setStatusText('Browser tidak mendukung voice recognition.')
      setErrorText('SpeechRecognition tidak tersedia di browser ini.')
      return
    }

    const recognition = new RecognitionCtor()
    recognitionRef.current = recognition
    recognition.lang = 'id-ID'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setVoiceState('listening')
      setExpression('listening')
      setStatusText('Saya mendengarkan...')
    }

    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? ''
      await handleTranscript(transcript)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const message =
        event.error === 'not-allowed'
          ? 'Izin mikrofon ditolak.'
          : event.error === 'no-speech'
          ? 'Tidak ada suara yang terdeteksi.'
          : event.error === 'audio-capture'
          ? 'Mikrofon tidak tersedia.'
          : `Voice recognition error: ${event.error}`

      setErrorText(message)
      setVoiceState('error')
      setExpression('idle')
      setStatusText('Voice input gagal. Coba lagi.')
      setMouthOpen(0)
      busyRef.current = false
    }

    recognition.onend = () => {
      if (busyRef.current) return

      if (voiceStateRef.current === 'listening') {
        setIdleState()
      }
    }

    recognition.start()
  }

  const micButtonLabel =
    voiceState === 'listening'
      ? 'Mendengarkan'
      : voiceState === 'thinking'
      ? 'Berpikir'
      : voiceState === 'speaking'
      ? 'Berbicara'
      : 'Mulai Bicara'

  const disableMic =
    !recognitionSupported ||
    voiceState === 'thinking' ||
    voiceState === 'speaking' ||
    isInstalling

  return (
    <>
      <main className="app-shell voice-only-shell">
        {!isSettingsOpen && (
          <button
            type="button"
            className="settings-fab"
            aria-label="Buka pengaturan"
            aria-haspopup="dialog"
            aria-expanded={isSettingsOpen}
            onClick={() => setIsSettingsOpen(true)}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12 8.75A3.25 3.25 0 1 0 12 15.25A3.25 3.25 0 1 0 12 8.75Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.2 1.2 0 0 1 0 1.7l-1.2 1.2a1.2 1.2 0 0 1-1.7 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1.2 1.2 0 0 1-1.2 1.2h-1.7A1.2 1.2 0 0 1 10 20v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.2 1.2 0 0 1-1.7 0l-1.2-1.2a1.2 1.2 0 0 1 0-1.7l.1-.1A1 1 0 0 0 5 15.1a1 1 0 0 0-.9-.6H4a1.2 1.2 0 0 1-1.2-1.2v-1.7A1.2 1.2 0 0 1 4 10.4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1.2 1.2 0 0 1 0-1.7l1.2-1.2a1.2 1.2 0 0 1 1.7 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1.2 1.2 0 0 1 1.2-1.2h1.7A1.2 1.2 0 0 1 14.4 4v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.2 1.2 0 0 1 1.7 0l1.2 1.2a1.2 1.2 0 0 1 0 1.7l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1.2 1.2 0 0 1 1.2 1.2v1.7a1.2 1.2 0 0 1-1.2 1.2h-.2a1 1 0 0 0-.9.6Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}

        <section className="viewer-panel viewer-panel-2d">
          <button
            type="button"
            className={`avatar-touch-zone ${isPetting ? 'is-petting' : ''}`}
            onPointerDown={handleAvatarPressStart}
            onPointerUp={handleAvatarPressEnd}
            onPointerCancel={handleAvatarPressEnd}
            onPointerLeave={handleAvatarPressEnd}
            aria-label="Sentuh avatar"
          >
            <AvatarFace expression={expression} mouthOpen={mouthOpen} />
          </button>
        </section>

        <section className="voice-panel">
          <div className="voice-panel-inner">
            <div className="brand-block">
              <h1>QAIRA</h1>
              <p>Asisten Pribadi Arabella</p>
            </div>

            

            <button
              className={`mic-button is-${voiceState}`}
              onClick={startListening}
              disabled={disableMic}
              aria-label={micButtonLabel}
              type="button"
            >
              <span className="mic-button-ring" />
              <span className="mic-button-core">
                <svg
                  width="34"
                  height="34"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M19 11a7 7 0 0 1-14 0"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M12 18v3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M8 21h8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </button>

            <div className="status-block">
              <p className="status-text">{statusText}</p>

              <p className="helper-text">
                Mode aktif: <span>{appMode}</span>
              </p>

              {!recognitionSupported && (
                <p className="helper-text">
                  Browser ini tidak mendukung SpeechRecognition.
                </p>
              )}

              {lastHeard && (
                <p className="helper-text">
                  Terdengar: <span>{lastHeard}</span>
                </p>
              )}

              {errorText && <p className="error-text">{errorText}</p>}
            </div>
          </div>
        </section>
      </main>

      {showInstallPrompt && !isInstalled && (
        <div
          className="install-overlay is-visible"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-qaira-title"
        >
          <div
            className="install-backdrop"
            onClick={() => !isInstalling && setShowInstallPrompt(false)}
            aria-hidden="true"
          />

          <div className="install-sheet">
            <div className="install-copy">
              <h2 id="install-qaira-title" className="install-title">
                Pasang QAIRA
              </h2>

              {isIosManualInstall ? (
                <p className="install-desc">
                  Untuk memasang QAIRA di iPhone atau iPad, buka di Safari, tekan
                  tombol Share, lalu pilih Add to Home Screen.
                </p>
              ) : canInstallPWA ? (
                <p className="install-desc">
                  Instal QAIRA ke layar utama agar lebih cepat dibuka dan terasa
                  seperti aplikasi ponsel.
                </p>
              ) : (
                <p className="install-desc">
                  QAIRA siap dipasang setelah browser memberikan izin prompt
                  instalasi. Jika tombol install belum muncul, gunakan aplikasi
                  beberapa saat lalu muat ulang halaman ini.
                </p>
              )}
            </div>

            <div className="install-actions">
              {!isIosManualInstall && canInstallPWA && (
                <button
                  type="button"
                  className="install-btn install-btn-primary"
                  onClick={handleInstallNow}
                  disabled={isInstalling}
                >
                  {isInstalling ? 'Memproses...' : 'Pasang Sekarang'}
                </button>
              )}

              {isIosManualInstall && (
                <button
                  type="button"
                  className="install-btn install-btn-primary"
                  onClick={() => setShowInstallPrompt(false)}
                >
                  Saya Mengerti
                </button>
              )}

              <button
                type="button"
                className="install-btn install-btn-ghost"
                onClick={() => setShowInstallPrompt(false)}
                disabled={isInstalling}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div
          className="settings-overlay is-visible"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
        >
          <div
            className="settings-backdrop"
            aria-hidden="true"
            onClick={() => setIsSettingsOpen(false)}
          />

          <div className="settings-sheet">
            <div className="settings-header">
              <div>
                <p className="settings-kicker">Pengaturan</p>
                <h2 id="settings-title" className="settings-title">
                  Menu QAIRA
                </h2>
              </div>

              <button
                ref={settingsCloseButtonRef}
                type="button"
                className="settings-close"
                aria-label="Tutup pengaturan"
                onClick={() => setIsSettingsOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="settings-section">
              <h3 className="settings-section-title">Pilih mode</h3>

              <div
                className="mode-group"
                role="radiogroup"
                aria-labelledby="mode-group-label"
              >
                <p id="mode-group-label" className="sr-only">
                  Pilih mode interaksi QAIRA
                </p>

                {(['bercanda', 'bermain', 'belajar'] as const).map((mode) => {
                  const checked = appMode === mode

                  return (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      className={`mode-option ${checked ? 'is-active' : ''}`}
                      onClick={() => handleModeChange(mode)}
                    >
                      <span className="mode-option-dot" aria-hidden="true" />
                      <span className="mode-option-copy">
                        <strong>
                          {mode === 'bercanda'
                            ? 'Mode bercanda'
                            : mode === 'bermain'
                            ? 'Mode bermain'
                            : 'Mode belajar'}
                        </strong>
                        <small>
                          {mode === 'bercanda'
                            ? 'Jawaban lebih santai, hangat, dan penuh canda.'
                            : mode === 'bermain'
                            ? 'Cocok untuk interaksi seru, imajinatif, dan ringan.'
                            : 'Fokus pada jawaban yang lebih edukatif dan terarah.'}
                        </small>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="settings-section">
              <h3 className="settings-section-title">Info aplikasi</h3>
              <p className="settings-info-text">
                QAIRA adalah asisten suara interaktif dengan avatar yang dirancang
                agar terasa hangat, ramah, dan dekat saat digunakan sehari-hari.
              </p>
            </div>

            <div className="settings-footer">
              <p className="settings-footer-love">
                QAIRA dibuat oleh seorang Ayah untuk Putri tercintanya Arabella
                Qaireen
              </p>
              <p className="settings-footer-meta">QAIRA Asisten • 2026</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
