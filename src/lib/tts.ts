type MouthCallback = (value: number) => void

function collapseSpaces(text: string) {
  let result = text

  while (result.indexOf('  ') !== -1) {
    result = result.split('  ').join(' ')
  }

  result = result.split(' ,').join(',')
  result = result.split(' .').join('.')
  result = result.split(' !').join('!')
  result = result.split(' ?').join('?')
  result = result.split(' :').join(':')
  result = result.split(' ;').join(';')

  return result.trim()
}

function stripUrlLikeText(text: string) {
  let result = text

  while (result.indexOf('http://') !== -1) {
    const start = result.indexOf('http://')
    let end = result.indexOf(' ', start)
    if (end === -1) end = result.length
    result = result.slice(0, start) + ' ' + result.slice(end)
  }

  while (result.indexOf('https://') !== -1) {
    const start = result.indexOf('https://')
    let end = result.indexOf(' ', start)
    if (end === -1) end = result.length
    result = result.slice(0, start) + ' ' + result.slice(end)
  }

  return result
}

function normalizePunctuation(text: string) {
  let result = text

  result = result.split('…').join('.')
  result = result.split(',.').join('.')
  result = result.split('.,').join('.')

  while (result.indexOf(',,') !== -1) {
    result = result.split(',,').join(',')
  }

  while (result.indexOf('..') !== -1) {
    result = result.split('..').join('.')
  }

  while (result.indexOf('!!') !== -1) {
    result = result.split('!!').join('!')
  }

  while (result.indexOf('??') !== -1) {
    result = result.split('??').join('?')
  }

  return result
}

export function sanitizeTextForSpeech(input: string) {
  let text = input || ''

  text = text.split(String.fromCharCode(10)).join(' ')
  text = text.split(String.fromCharCode(13)).join(' ')

  text = stripUrlLikeText(text)

  text = text.split('**').join(' ')
  text = text.split('__').join(' ')
  text = text.split('~~').join(' ')
  text = text.split('```').join(' ')
  text = text.split('`').join(' ')
  text = text.split('#').join(' ')
  text = text.split('*').join(' ')
  text = text.split('_').join(' ')
  text = text.split('@').join(' ')
  text = text.split('[').join(' ')
  text = text.split(']').join(' ')
  text = text.split('(').join(' ')
  text = text.split(')').join(' ')
  text = text.split('{').join(' ')
  text = text.split('}').join(' ')
  text = text.split('<').join(' ')
  text = text.split('>').join(' ')
  text = text.split('|').join(' ')
  text = text.split('^').join(' ')
  text = text.split('~').join(' ')
  text = text.split('\\').join(' ')
  text = text.split('/').join(' ')
  text = text.split('=').join(' ')
  text = text.split('+').join(' ')
  text = text.split('•').join(' ')
  text = text.split('▪').join(' ')
  text = text.split('◦').join(' ')
  text = text.split(' - ').join(', ')
  text = text.split(' – ').join(', ')
  text = text.split(' — ').join(', ')

  text = normalizePunctuation(text)
  text = collapseSpaces(text)

  return text
}

function getAllVoices() {
  return window.speechSynthesis.getVoices()
}

function scoreVoice(voice: SpeechSynthesisVoice) {
  const name = (voice.name || '').toLowerCase()
  const lang = (voice.lang || '').toLowerCase()

  let score = 0

  if (lang === 'id-id') score += 120
  if (lang.startsWith('id')) score += 90
  if (name.includes('indonesia')) score += 60
  if (name.includes('indonesian')) score += 60
  if (name.includes('google')) score += 20
  if (name.includes('female')) score += 10
  if (name.includes('woman')) score += 10
  if (name.includes('natural')) score += 10
  if (voice.localService) score += 5
  if (voice.default) score += 3

  return score
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = getAllVoices()
  if (!voices || !voices.length) return null

  const ranked = [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))
  const selected = ranked

  if (!selected) return null
  if (typeof selected.name !== 'string') return null
  if (typeof selected.lang !== 'string') return null

  return selected
}

export function warmupVoices() {
  const synth = window.speechSynthesis
  synth.getVoices()

  if ('onvoiceschanged' in synth) {
    synth.onvoiceschanged = () => {
      synth.getVoices()
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getMouthValueFromChunk(chunk: string) {
  const clean = chunk.toLowerCase().trim()
  if (!clean) return 0.18

  const vowels = ['a', 'i', 'u', 'e', 'o']
  let vowelCount = 0

  for (let i = 0; i < clean.length; i += 1) {
    if (vowels.includes(clean[i])) {
      vowelCount += 1
    }
  }

  const ratio = vowelCount / clean.length

  if (clean.endsWith('.') || clean.endsWith('!') || clean.endsWith('?')) {
    return 0.2
  }

  if (clean.indexOf(',') !== -1) {
    return 0.28
  }

  return clamp(0.24 + ratio * 1.15, 0.22, 1)
}

export function speak(
  rawText: string,
  onMouth: MouthCallback,
  onDone?: () => void
) {
  const text = sanitizeTextForSpeech(rawText)

  if (!text) {
    onDone?.()
    return () => {}
  }

  const synth = window.speechSynthesis
  const utterance = new SpeechSynthesisUtterance(text)
  const voice = pickVoice()

  utterance.lang = 'id-ID'

  if (voice) {
    try {
      utterance.voice = voice
      utterance.lang = voice.lang || 'id-ID'
    } catch {
      utterance.lang = 'id-ID'
    }
  }

  utterance.rate = 1.06
  utterance.pitch = 1.65
  utterance.volume = 1

  let raf = 0
  let active = true
  let phase = 0
  let boundaryDriven = false
  let lastBoundaryAt = 0

  const idleMouth = () => {
    onMouth(0)
  }

  const animateFallbackMouth = () => {
    if (!active) return

    const now = performance.now()
    const gap = now - lastBoundaryAt

    if (boundaryDriven && gap < 140) {
      raf = requestAnimationFrame(animateFallbackMouth)
      return
    }

    phase += 0.14
    const base = Math.sin(phase) * 0.5 + 0.5
    const jitter = Math.random() * 0.18
    const value = clamp(base * 0.72 + jitter, 0.14, 0.92)

    onMouth(value)
    raf = requestAnimationFrame(animateFallbackMouth)
  }

  utterance.onstart = () => {
    active = true
    phase = 0
    boundaryDriven = false
    lastBoundaryAt = 0
    animateFallbackMouth()
  }

  utterance.onboundary = (event: SpeechSynthesisEvent) => {
    boundaryDriven = true
    lastBoundaryAt = performance.now()

    const start = typeof event.charIndex === 'number' ? event.charIndex : 0
    const next = text.slice(start, start + 12)
    const mouth = getMouthValueFromChunk(next)

    onMouth(mouth)

    window.setTimeout(() => {
      if (!active) return
      onMouth(clamp(mouth * 0.42, 0.1, 0.4))
    }, 70)
  }

  utterance.onpause = () => {
    idleMouth()
  }

  utterance.onend = () => {
    active = false
    cancelAnimationFrame(raf)
    idleMouth()
    onDone?.()
  }

  utterance.onerror = () => {
    active = false
    cancelAnimationFrame(raf)
    idleMouth()
    onDone?.()
  }

  synth.cancel()
  synth.speak(utterance)

  return () => {
    active = false
    cancelAnimationFrame(raf)
    idleMouth()
    synth.cancel()
  }
}