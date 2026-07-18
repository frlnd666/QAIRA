import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AvatarFace, type MiawbelExpression } from './components/AvatarFace'
import { askGemini, fileToBase64 } from './lib/gemini'
import { sanitizeTextForSpeech, speak, warmupVoices } from './lib/tts'
import { useAudioRecorder } from './lib/useAudioRecorder'

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'
type AppMode = 'bercanda' | 'bermain' | 'belajar'
type InteractionMode = 'voice' | 'chat'
type ChatRole = 'user' | 'ai'

interface ChatMessage {
  id: string
  role: ChatRole
  text: string
}

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

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function App() {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [appMode, setAppMode] = useState<AppMode>('bercanda')
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('voice')
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

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatImage, setChatImage] = useState<File | null>(null)
  const [chatAudioBlob, setChatAudioBlob] = useState<Blob | null>(null)
  const [isChatBusy, setIsChatBusy] = useState(false)
  const [chatError, setChatError] = useState('')

  const {
    isRecording,
    recordError: recorderError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useAudioRecorder()

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const cancelSpeechRef = useRef<(() => void) | null>(null)
  const busyRef = useRef(false)
  const voiceStateRef = useRef<VoiceState>('idle')
  const petTimeoutRef = useRef<number | null>(null)
  const expressionResetTimeoutRef = useRef<number | null>(null)
  const chatExpressionTimeoutRef = useRef<number | null>(null)
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null)
  const settingsCloseButtonRef = useRef<HTMLButtonElement | null>(null)
  const chatHistoryEndRef = useRef<HTMLDivElement | null>(null)
  const chatImageInputRef = useRef<HTMLInputElement | null>(null)

  const recognitionSupported = useMemo(() => {
    return (
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    )
  }, [])

  const canRenderPortal = typeof document !== 'undefined'

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

      if (chatExpressionTimeoutRef.current !== null) {
        window.clearTimeout(chatExpressionTimeoutRef.current)
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

  useEffect(() => {
    chatHistoryEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chatHistory])

  useEffect(() => {
    return () => {
      cancelRecording()
    }
  }, [cancelRecording])

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

  function clearChatExpressionTimeout() {
    if (chatExpressionTimeoutRef.current !== null) {
      window.clearTimeout(chatExpressionTimeoutRef.current)
      chatExpressionTimeoutRef.current = null
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

      if (interactionMode === 'chat') {
        setExpression('idle')
        return
      }

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

    if (interactionMode === 'chat') {
      restoreExpressionAfterPet()
      return
    }

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

  function handleInteractionModeChange(mode: InteractionMode) {
    if (mode === interactionMode) return

    stopAllAudio()
    setIsPetting(false)
    setExpression('idle')
    setErrorText('')

    if (isRecording) {
      cancelRecording()
    }

    if (mode === 'voice') {
      setIdleState()
    } else {
      setStatusText('Mode teks aktif. Kirim pesan, gambar, atau rekaman suara.')
    }

    setInteractionMode(mode)
  }

  function buildModePrompt(rawText: string): string {
    if (appMode === 'bercanda') {
      return `Jawab dengan gaya hangat, lucu, ringan, dan ramah untuk anak. Pertanyaan pengguna: ${rawText}`
    }

    if (appMode === 'bermain') {
      return `Jawab dengan gaya playful, interaktif, imajinatif, dan menyenangkan untuk anak. Pertanyaan pengguna: ${rawText}`
    }

    return `Jawab dengan gaya edukatif, lembut, jelas, singkat, dan mudah dipahami anak. Pertanyaan pengguna: ${rawText}`
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
      const reply = await askGemini(buildModePrompt(cleanTranscript))
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
      const message = error instanceof Error ? error.message : 'Terjadi kesalahan.'

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

  function handleChatImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null

    if (file && !file.type.startsWith('image/')) {
      setChatError('File harus berupa gambar.')
      return
    }

    setChatError('')
    setChatImage(file)
  }

  function removeChatImage() {
    setChatImage(null)
    if (chatImageInputRef.current) {
      chatImageInputRef.current.value = ''
    }
  }

  function removeChatAudio() {
    setChatAudioBlob(null)
  }

  async function handleToggleRecordAudio() {
    setChatError('')

    if (isRecording) {
      const blob = await stopRecording()
      if (blob) {
        setChatAudioBlob(blob)
      }
      return
    }

    setChatAudioBlob(null)
    await startRecording()
  }

  function handleCancelRecording() {
    cancelRecording()
  }

  async function handleSendChat() {
    const cleanText = chatInput.trim()

    if (!cleanText && !chatImage && !chatAudioBlob) {
      return
    }

    if (isRecording) {
      setChatError('Selesaikan atau batalkan rekaman terlebih dahulu.')
      return
    }

    const userMessage: ChatMessage = {
      id: createId(),
      role: 'user',
      text: cleanText || '(Mengirim lampiran tanpa teks)',
    }

    setChatHistory((prev) => [...prev, userMessage])
    setChatInput('')
    setChatError('')
    setIsChatBusy(true)
    setExpression('thinking')

    const attachments: { mimeType: string; base64: string }[] = []

    try {
      if (chatImage) {
        const base64 = await fileToBase64(chatImage)
        attachments.push({ mimeType: chatImage.type || 'image/jpeg', base64 })
      }

      if (chatAudioBlob) {
        const mimeType = chatAudioBlob.type || 'audio/webm'
        const audioFile = new File([chatAudioBlob], 'rekaman-audio', { type: mimeType })
        const base64 = await fileToBase64(audioFile)
        attachments.push({ mimeType, base64 })
      }

      const promptText = cleanText
        ? buildModePrompt(cleanText)
        : buildModePrompt('Tolong tanggapi lampiran yang saya kirimkan ini.')

      const reply = await askGemini(promptText, attachments)

      setChatHistory((prev) => [...prev, { id: createId(), role: 'ai', text: reply }])
      setExpression('speaking')
      setStatusText('Sedang menjawab di mode teks...')

      clearChatExpressionTimeout()
      cancelSpeechRef.current = speak(
        sanitizeTextForSpeech(reply),
        (value) => setMouthOpen(value),
        () => {
          setMouthOpen(0)
          setExpression('happy')
          setStatusText('Selesai menjawab di mode teks.')

          chatExpressionTimeoutRef.current = window.setTimeout(() => {
            if (!isPetting) {
              setExpression('idle')
            }
          }, 1200)
        }
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Terjadi kesalahan.'
      setChatError(message)
      setChatHistory((prev) => [
        ...prev,
        { id: createId(), role: 'ai', text: `Maaf, terjadi kesalahan: ${message}` },
      ])
      setExpression('idle')
    } finally {
      setIsChatBusy(false)
      removeChatImage()
      removeChatAudio()
    }
  }

  function handleChatInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSendChat()
    }
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

  const disableChatSend =
    isChatBusy || isRecording || (!chatInput.trim() && !chatImage && !chatAudioBlob)

  const installModal =
    canRenderPortal && showInstallPrompt && !isInstalled
      ? createPortal(
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
          </div>,
          document.body
        )
      : null

  const settingsModal =
    canRenderPortal && isSettingsOpen
      ? createPortal(
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
                  QAIRA adalah asisten interaktif dengan avatar yang bisa diajak
                  bicara lewat suara maupun teks, termasuk mengirim gambar dan
                  rekaman audio.
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
          </div>,
          document.body
        )
      : null

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
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

            <div className="chat-mode-toggle" role="tablist" aria-label="Pilih cara berinteraksi">
              <button
                type="button"
                role="tab"
                aria-selected={interactionMode === 'voice'}
                className={`chat-mode-btn ${interactionMode === 'voice' ? 'is-active' : ''}`}
                onClick={() => handleInteractionModeChange('voice')}
              >
                Suara
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={interactionMode === 'chat'}
                className={`chat-mode-btn ${interactionMode === 'chat' ? 'is-active' : ''}`}
                onClick={() => handleInteractionModeChange('chat')}
              >
                Teks
              </button>
            </div>

            {interactionMode === 'voice' ? (
              <>
                <button
                  className={`mic-button is-${voiceState}`}
                  onClick={startListening}
                  disabled={disableMic}
                  aria-label={micButtonLabel}
                  type="button"
                >
                  <span className="mic-button-ring" />
                  <span className="mic-button-core">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path d="M19 11a7 7 0 0 1-14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M8 21h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>

                <div className="status-block">
                  <p className="status-text">{statusText}</p>

                  <p className="helper-text">
                    Mode aktif: <span>{appMode}</span>
                  </p>

                  {!recognitionSupported && (
                    <p className="helper-text">Browser ini tidak mendukung SpeechRecognition.</p>
                  )}

                  {lastHeard && (
                    <p className="helper-text">
                      Terdengar: <span>{lastHeard}</span>
                    </p>
                  )}

                  {errorText && <p className="error-text">{errorText}</p>}
                </div>
              </>
            ) : (
              <div className="chat-panel">
                <div className="chat-history">
                  {chatHistory.length === 0 && (
                    <p className="helper-text chat-empty-hint">
                      Belum ada percakapan. Kirim teks, gambar, atau rekaman suara.
                    </p>
                  )}

                  {chatHistory.map((message) => (
                    <div key={message.id} className={`chat-bubble chat-bubble-${message.role}`}>
                      {message.text}
                    </div>
                  ))}

                  <div ref={chatHistoryEndRef} />
                </div>

                <div className="chat-attachments">
                  <label className="chat-attach-btn" aria-label="Lampirkan gambar">
                    📷
                    <input
                      ref={chatImageInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={handleChatImageChange}
                      disabled={isChatBusy}
                    />
                  </label>

                  <button
                    type="button"
                    className={`chat-attach-btn ${isRecording ? 'is-recording' : ''}`}
                    onClick={handleToggleRecordAudio}
                    aria-label={isRecording ? 'Berhenti merekam' : 'Rekam audio'}
                    disabled={isChatBusy}
                  >
                    {isRecording ? '⏹️' : '🎤'}
                  </button>

                  {isRecording && (
                    <button
                      type="button"
                      className="chat-attach-cancel"
                      onClick={handleCancelRecording}
                      aria-label="Batalkan rekaman"
                    >
                      ✕
                    </button>
                  )}

                  {chatImage && !isRecording && (
                    <span className="chat-attach-name">
                      {chatImage.name}
                      <button
                        type="button"
                        className="chat-attach-remove"
                        onClick={removeChatImage}
                        aria-label="Hapus gambar"
                        disabled={isChatBusy}
                      >
                        ✕
                      </button>
                    </span>
                  )}

                  {chatAudioBlob && !isRecording && (
                    <span className="chat-attach-name">
                      Rekaman siap dikirim
                      <button
                        type="button"
                        className="chat-attach-remove"
                        onClick={removeChatAudio}
                        aria-label="Hapus rekaman audio"
                        disabled={isChatBusy}
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </div>

                <div className="chat-input-row">
                  <input
                    type="text"
                    className="chat-input"
                    placeholder="Tulis pesan..."
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    onKeyDown={handleChatInputKeyDown}
                    disabled={isChatBusy || isRecording}
                  />
                  <button
                    type="button"
                    className="chat-send-btn"
                    onClick={() => void handleSendChat()}
                    disabled={disableChatSend}
                  >
                    {isChatBusy ? 'Mengirim...' : 'Kirim'}
                  </button>
                </div>

                <div className="status-block">
                  <p className="helper-text">
                    Mode aktif: <span>{appMode}</span>
                  </p>

                  {recorderError && <p className="error-text">{recorderError}</p>}
                  {chatError && <p className="error-text">{chatError}</p>}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {installModal}
      {settingsModal}
    </>
  )
    }
