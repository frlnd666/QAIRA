#!/usr/bin/env bash
set -e

# Assumptions:
# - Run from the React project root.
# - The app already has the 2D avatar fallback patch applied.
# - We only add expression state + animation behavior, no extra features.
#
# Success criteria:
# 1. Avatar accepts expression state.
# 2. Speaking/listening/thinking/happy/sleep/excited visual cues render.
# 3. Existing Perplexity + Web Speech flow keeps working.

if [ ! -f package.json ] || [ ! -d src ]; then
  echo "❌ Jalankan dari root project React."
  exit 1
fi

mkdir -p src/components

cat > src/components/AvatarFace.tsx <<'EOF'
import { useEffect, useMemo, useState } from 'react'

export type MiawbelExpression = 'idle' | 'listening' | 'thinking' | 'speaking' | 'happy' | 'sleep' | 'excited'

type Props = {
  expression: MiawbelExpression
  mouthOpen: number
}

function useFloatOffset() {
  const [t, setT] = useState(0)
  useEffect(() => {
    let raf = 0
    const loop = (ms: number) => {
      setT(ms)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return Math.sin(t / 1000 * Math.PI * 2) * 12
}

function useBlink(expression: MiawbelExpression) {
  const [blinking, setBlinking] = useState(false)
  useEffect(() => {
    if (expression === 'sleep') {
      setBlinking(true)
      return
    }
    if (expression !== 'idle' && expression !== 'listening' && expression !== 'speaking') {
      setBlinking(false)
      return
    }

    let cancelled = false
    const loop = async () => {
      while (!cancelled) {
        if (Math.random() > 0.6) {
          setBlinking(true)
          await new Promise((r) => setTimeout(r, 140))
          setBlinking(false)
        }
        await new Promise((r) => setTimeout(r, 1800 + Math.random() * 2500))
      }
    }
    loop()
    return () => { cancelled = true }
  }, [expression])
  return blinking
}

function usePulse(period: number) {
  const [p, setP] = useState(0)
  useEffect(() => {
    let raf = 0
    const loop = (ms: number) => {
      setP((Math.sin(ms / period * 2 * Math.PI) + 1) / 2)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [period])
  return p
}

export function AvatarFace({ expression, mouthOpen }: Props) {
  const floatOffset = useFloatOffset()
  const blinking = useBlink(expression)
  const speakingPulse = usePulse(180)
  const wave1 = usePulse(350)
  const wave2 = usePulse(300)
  const think = usePulse(1200)
  const sleep = usePulse(2000)
  const excited = usePulse(4000)

  const cheekScale = useMemo(() => {
    switch (expression) {
      case 'speaking': return 1.2
      case 'happy': return 1.3
      case 'excited': return 1.4
      case 'sleep': return 0.85
      default: return 1
    }
  }, [expression])

  const mouthPulse = expression === 'speaking' ? (0.3 + 2.5 * speakingPulse) : mouthOpen

  return (
    <div className="avatar-stage" style={{ transform: `translateY(${floatOffset}px)` }}>
      <div className="avatar-card">
        <svg className="avatar-svg" viewBox="0 0 320 420" role="img" aria-label="Avatar perempuan berbicara">
          <defs>
            <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1d3557" />
              <stop offset="100%" stopColor="#0b1320" />
            </linearGradient>
            <linearGradient id="hair" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2b1d0e" />
              <stop offset="100%" stopColor="#120c06" />
            </linearGradient>
          </defs>

          <rect width="320" height="420" rx="32" fill="url(#bg)" />

          {expression === 'listening' && (
            <>
              <rect x="34" y={186 - wave1 * 18} width="6" height={wave1 * 36} rx="3" fill="#ff8da1" opacity="0.85" />
              <rect x="48" y={186 - wave2 * 18} width="6" height={wave2 * 36} rx="3" fill="#8ecae6" opacity="0.85" />
              <rect x="266" y={186 - wave1 * 18} width="6" height={wave1 * 36} rx="3" fill="#ff8da1" opacity="0.85" />
              <rect x="280" y={186 - wave2 * 18} width="6" height={wave2 * 36} rx="3" fill="#8ecae6" opacity="0.85" />
            </>
          )}

          {expression === 'thinking' && (
            <>
              <circle cx="122" cy={82 - think * 8} r="5" fill="#ff8da1" opacity={0.35 + think * 0.65} />
              <circle cx="160" cy={76 - think * 10} r="7" fill="#ff8da1" opacity={0.35 + think * 0.65} />
              <circle cx="198" cy={82 - think * 8} r="5" fill="#ff8da1" opacity={0.35 + think * 0.65} />
            </>
          )}

          {expression === 'sleep' && (
            <text x="245" y={120 - sleep * 22} fontSize="36" fill="#d8b4fe" opacity={1 - sleep} fontFamily="sans-serif">Z</text>
          )}

          {expression === 'excited' && (
            <>
              <polygon points="70,105 76,120 92,124 76,128 70,143 64,128 48,124 64,120" fill="#ffd166" transform={`rotate(${excited * 360} 70 124)`} />
              <polygon points="250,105 256,120 272,124 256,128 250,143 244,128 228,124 244,120" fill="#ffd166" transform={`rotate(${-excited * 360} 250 124)`} />
            </>
          )}

          <circle cx="160" cy="170" r="92" fill="#f2c7a5" />
          <path d="M68 154c8-78 56-122 120-122 58 0 102 37 115 112-18-16-40-28-67-31-37-3-79 4-118 18-20 7-35 16-50 23Z" fill="url(#hair)" />
          <ellipse cx="160" cy="305" rx="86" ry="70" fill="#8b5e83" />

          <path d={`M108 ${138 + cheekScale * 1.5} Q122 ${132 - cheekScale} 136 ${138 + cheekScale * 1.5}`} stroke="#2d1a12" strokeWidth="6" strokeLinecap="round" fill="none" />
          <path d={`M184 ${138 + cheekScale * 1.5} Q198 ${132 - cheekScale} 212 ${138 + cheekScale * 1.5}`} stroke="#2d1a12" strokeWidth="6" strokeLinecap="round" fill="none" />

          {blinking ? (
            <>
              <line x1="112" y1="164" x2="132" y2="164" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" />
              <line x1="188" y1="164" x2="208" y2="164" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" />
            </>
          ) : expression === 'excited' ? (
            <>
              <path d="M112 156 L122 166 L132 156 L122 146 Z" fill="#1a1a1a" />
              <path d="M188 156 L198 166 L208 156 L198 146 Z" fill="#1a1a1a" />
            </>
          ) : expression === 'happy' ? (
            <>
              <path d="M110 168 Q122 150 134 168" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" fill="none" />
              <path d="M186 168 Q198 150 210 168" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" fill="none" />
            </>
          ) : (
            <>
              <circle cx="122" cy="164" r="10" fill="#1a1a1a" />
              <circle cx="198" cy="164" r="10" fill="#1a1a1a" />
              <circle cx="118" cy="160" r="3" fill="#fff" />
              <circle cx="194" cy="160" r="3" fill="#fff" />
            </>
          )}

          <ellipse cx="118" cy="214" rx="18" ry="10" fill="#ef8f9c" opacity={0.2 + cheekScale * 0.15} />
          <ellipse cx="202" cy="214" rx="18" ry="10" fill="#ef8f9c" opacity={0.2 + cheekScale * 0.15} />

          {expression === 'happy' || expression === 'excited' ? (
            <path d="M128 250 Q160 280 192 250" stroke="#7a1e2c" strokeWidth="8" strokeLinecap="round" fill="none" />
          ) : expression === 'sleep' ? (
            <circle cx="160" cy="258" r="7" stroke="#7a1e2c" strokeWidth="4" fill="none" />
          ) : expression === 'thinking' ? (
            <path d="M135 256 Q160 244 185 256" stroke="#7a1e2c" strokeWidth="5" strokeLinecap="round" fill="none" />
          ) : expression === 'listening' ? (
            <ellipse cx="160" cy="258" rx="10" ry="16" fill="none" stroke="#7a1e2c" strokeWidth="4" />
          ) : expression === 'speaking' ? (
            <>
              <ellipse cx="160" cy="258" rx={18 - mouthPulse * 2} ry={10 + mouthPulse * 8} fill="#7a1e2c" />
              <ellipse cx="160" cy={261 + mouthPulse} rx={14 - mouthPulse} ry={7 + mouthPulse * 4} fill="#d45c74" opacity="0.8" />
            </>
          ) : (
            <path d="M144 258 Q160 250 176 258" stroke="#7a1e2c" strokeWidth="4" strokeLinecap="round" fill="none" />
          )}

          <path d="M118 348 Q160 332 202 348" stroke="#c9d6ea" strokeWidth="8" strokeLinecap="round" fill="none" />
        </svg>
      </div>
    </div>
  )
}
EOF

cat > src/App.tsx <<'EOF'
import { useRef, useState } from 'react'
import { AvatarFace, type MiawbelExpression } from './components/AvatarFace'
import { askPerplexity } from './lib/perplexity'
import { speak } from './lib/tts'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('Halo Ara! Perkenalkan dirimu.')
  const [loading, setLoading] = useState(false)
  const [mouthOpen, setMouthOpen] = useState(0)
  const [expression, setExpression] = useState<MiawbelExpression>('idle')
  const cancelSpeech = useRef<(() => void) | null>(null)

  async function handleSend() {
    const prompt = input.trim()
    if (!prompt || loading) return

    cancelSpeech.current?.()
    setLoading(true)
    setExpression('thinking')
    setMessages((prev) => [...prev, { role: 'user', content: prompt }])
    setInput('')

    try {
      const reply = await askPerplexity(prompt)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
      setExpression('speaking')

      cancelSpeech.current = speak(
        reply,
        (value) => setMouthOpen(value),
        () => {
          setMouthOpen(0)
          setExpression('happy')
          window.setTimeout(() => setExpression('idle'), 1200)
        }
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan.'
      setMessages((prev) => [...prev, { role: 'assistant', content: `⚠️ ${msg}` }])
      setExpression('idle')
    } finally {
      setLoading(false)
    }
  }

  const handleFocus = () => {
    if (!loading && expression !== 'speaking') setExpression('listening')
  }

  const handleBlur = () => {
    if (!loading && expression !== 'speaking') setExpression('idle')
  }

  return (
    <div className="app-shell">
      <section className="viewer-panel viewer-panel-2d">
        <AvatarFace expression={expression} mouthOpen={mouthOpen} />
      </section>

      <section className="chat-panel">
        <div>
          <h1>Ara · Avatar Chatbot</h1>
          <p>Perplexity API · Web Speech · ekspresi ala Miawbel</p>
        </div>

        <div className="chat-log">
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>{m.content}</div>
          ))}
          {loading && <div className="bubble assistant">⏳ Sedang berpikir...</div>}
        </div>

        <div className="composer">
          <textarea
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Tulis pesan... (Enter untuk kirim)"
          />
          <button onClick={handleSend} disabled={loading}>
            {loading ? 'Memproses...' : 'Kirim'}
          </button>
        </div>
      </section>
    </div>
  )
}
EOF

chmod +x "$0" 2>/dev/null || true

echo "✅ Patch ekspresi berhasil diterapkan."
echo "Verifikasi:"
echo "1. npm run dev"
echo "2. Fokus textarea → expression listening"
echo "3. Kirim pesan → thinking lalu speaking"
echo "4. Setelah speech selesai → happy lalu idle"
EOF
