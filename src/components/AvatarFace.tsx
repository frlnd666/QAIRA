import { useEffect, useMemo, useState } from 'react'

export type MiawbelExpression =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'happy'
  | 'sleep'
  | 'excited'
  | 'surprised'
  | 'wink'

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

  return Math.sin((t / 1000) * Math.PI * 2) * 10
}

function useBlink(expression: MiawbelExpression) {
  const [blinking, setBlinking] = useState(false)

  useEffect(() => {
    if (expression === 'sleep') {
      setBlinking(true)
      return
    }

    if (
      expression !== 'idle' &&
      expression !== 'listening' &&
      expression !== 'speaking' &&
      expression !== 'wink'
    ) {
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
        await new Promise((r) =>
          setTimeout(r, 1800 + Math.random() * 2500)
        )
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
      setP((Math.sin((ms / period) * 2 * Math.PI) + 1) / 2)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [period])

  return p
}

function Eye({
  cx,
  cy,
  blinking,
  excited,
  happy,
  surprised,
  isWinkEye,
}: {
  cx: number
  cy: number
  blinking: boolean
  excited: boolean
  happy: boolean
  surprised: boolean
  isWinkEye?: boolean
}) {
  if (blinking || happy) {
    return (
      <path
        d={`M ${cx - 26} ${cy} Q ${cx} ${cy - 10} ${cx + 26} ${cy}`}
        stroke="#111"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />
    )
  }

  if (isWinkEye) {
    return (
      <path
        d={`M ${cx - 26} ${cy + 4} Q ${cx} ${cy - 18} ${cx + 26} ${cy + 4}`}
        stroke="#111"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />
    )
  }

  if (surprised) {
    return (
      <>
        <circle cx={cx} cy={cy} r="42" fill="#000" />
        <circle cx={cx - 10} cy={cy - 14} r="18" fill="#fff" />
        <circle cx={cx + 10} cy={cy + 6} r="8" fill="#fff" />
      </>
    )
  }

  if (excited) {
    return (
      <>
        <circle cx={cx} cy={cy} r="38" fill="#000" />
        <path
          d={`M ${cx} ${cy - 28} L ${cx + 8} ${cy - 8} L ${cx + 28} ${cy} L ${cx + 8} ${cy + 8} L ${cx} ${cy + 28} L ${cx - 8} ${cy + 8} L ${cx - 28} ${cy} L ${cx - 8} ${cy - 8} Z`}
          fill="#fff"
          opacity="0.92"
        />
      </>
    )
  }

  return (
    <>
      <circle cx={cx} cy={cy} r="38" fill="#000" />
      <circle cx={cx - 12} cy={cy - 14} r="16" fill="#fff" />
      <circle cx={cx + 10} cy={cy + 2} r="8" fill="#fff" />
      <circle cx={cx + 4} cy={cy + 18} r="10" fill="#fff" />
    </>
  )
}

export function AvatarFace({ expression, mouthOpen }: Props) {
  const floatOffset = useFloatOffset()
  const speakingPulse = usePulse(180)
  const wave1 = usePulse(350)
  const wave2 = usePulse(300)
  const think = usePulse(1200)
  const sleep = usePulse(2000)
  const sparkle = usePulse(4000)
  const blinking = useBlink(expression)

  const cheekOpacity = useMemo(() => {
    switch (expression) {
      case 'happy':
        return 0.5
      case 'excited':
        return 0.6
      case 'speaking':
        return 0.42
      case 'sleep':
        return 0.22
      default:
        return 0.34
    }
  }, [expression])

  const mouthHeight =
    expression === 'speaking'
      ? 34 + (0.3 + 2.5 * speakingPulse) * 10
      : mouthOpen > 0
      ? 32 + mouthOpen * 8
      : 34

  const happy = expression === 'happy'
  const excited = expression === 'excited'

  return (
    <div
      className="avatar-stage"
      style={{ transform: `translateY(${floatOffset}px)` }}
    >
      <div className="avatar-card avatar-kawaii avatar-round">
        <svg
          className="avatar-svg"
          viewBox="0 0 360 360"
          role="img"
          aria-label="Avatar wajah kawaii bulat berdasarkan gambar referensi"
        >
          <defs>
            <clipPath id="avatarCircleClip">
              <circle cx="180" cy="180" r="172" />
            </clipPath>
          </defs>

          <circle cx="180" cy="180" r="176" fill="#ffffff" />
          <g clipPath="url(#avatarCircleClip)">
            <circle cx="180" cy="180" r="172" fill="#f3f3f3" />

            {expression === 'listening' && (
              <>
                <rect x="20" y={145 - wave1 * 22} width="8" height={20 + wave1 * 44} rx="4" fill="#ff8da1" />
                <rect x="34" y={152 - wave2 * 18} width="8" height={16 + wave2 * 36} rx="4" fill="#8ecae6" />
                <rect x="318" y={145 - wave1 * 22} width="8" height={20 + wave1 * 44} rx="4" fill="#ff8da1" />
                <rect x="332" y={152 - wave2 * 18} width="8" height={16 + wave2 * 36} rx="4" fill="#8ecae6" />
              </>
            )}

            {expression === 'thinking' && (
              <>
                <circle cx="150" cy={68 - think * 10} r="5" fill="#ff8da1" opacity={0.4 + think * 0.6} />
                <circle cx="180" cy={56 - think * 14} r="8" fill="#ff8da1" opacity={0.4 + think * 0.6} />
                <circle cx="210" cy={68 - think * 10} r="5" fill="#ff8da1" opacity={0.4 + think * 0.6} />
              </>
            )}

            {expression === 'sleep' && (
              <text
                x="274"
                y={94 - sleep * 24}
                fontSize="34"
                fill="#c18cff"
                opacity={1 - sleep}
                fontFamily="sans-serif"
                fontWeight="700"
              >
                Z
              </text>
            )}

            {expression === 'excited' && (
              <>
                <polygon
                  points="58,92 64,106 78,112 64,118 58,132 52,118 38,112 52,106"
                  fill="#ffd166"
                  transform={`rotate(${sparkle * 360} 58 112)`}
                />
                <polygon
                  points="302,92 308,106 322,112 308,118 302,132 296,118 282,112 296,106"
                  fill="#ffd166"
                  transform={`rotate(${-sparkle * 360} 302 112)`}
                />
              </>
            )}

            <Eye
  cx={102}
  cy={118}
  blinking={blinking}
  happy={happy}
  excited={excited}
  surprised={expression === 'surprised'}
  isWinkEye={false}
/>
<Eye
  cx={258}
  cy={118}
  blinking={blinking}
  happy={happy}
  excited={excited}
  surprised={expression === 'surprised'}
  isWinkEye={expression === 'wink'}
/>

            <ellipse cx="62" cy="192" rx="25" ry="12" fill="#f3a8b2" opacity={cheekOpacity} />
            <ellipse cx="298" cy="192" rx="25" ry="12" fill="#f3a8b2" opacity={cheekOpacity} />

            {expression === 'sleep' ? (
              <circle cx="180" cy="248" r="10" stroke="#222" strokeWidth="4" fill="none" />
            ) : expression === 'thinking' ? (
              <path
                d="M120 246 Q 150 234 180 246 Q 210 258 240 246"
                stroke="#222"
                strokeWidth="5"
                strokeLinecap="round"
                fill="none"
              />
            ) : expression === 'listening' ? (
              <ellipse
                cx="180"
                cy="244"
                rx="15"
                ry="22"
                stroke="#222"
                strokeWidth="4"
                fill="none"
              />
            ) : (
              <>
                <path
                  d="M100 220 L 260 220"
                  stroke="#222"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <path
                  d={`M100 220 Q 180 ${220 + mouthHeight} 260 220`}
                  fill="#f8c8cf"
                  stroke="#222"
                  strokeWidth="4"
                />
                <path
                  d={`M128 251 Q 180 ${228 + mouthHeight} 232 251 Q 180 ${
                    258 + mouthHeight * 0.1
                  } 128 251`}
                  fill="#ff5b67"
                  opacity="0.95"
                />
              </>
            )}
          </g>

          <circle cx="180" cy="180" r="172" fill="none" stroke="#d9d9d9" strokeWidth="4" />
        </svg>
      </div>
    </div>
  )
}