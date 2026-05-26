/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PERPLEXITY_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onstart: (() => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

interface SpeechRecognitionEvent extends Event {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string
        confidence: number
      }
      isFinal: boolean
      length: number
    }
    length: number
  }
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

interface Window {
  SpeechRecognition?: new () => SpeechRecognition
  webkitSpeechRecognition?: new () => SpeechRecognition
}