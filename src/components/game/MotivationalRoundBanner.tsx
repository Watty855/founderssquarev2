'use client'

import { useMemo } from 'react'
import { MOTIVATIONAL_BANNER_PHRASES } from '@/lib/motivationalBannerPhrases'

/** Matches build-completion center notice title in GameApp (`boardNotice`). */
const BANNER_TITLE_FS = 'clamp(0.85rem, 2vw, 1.25rem)' as const

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Phases fill color from green → yellow → red from round 2 across `COLOR_PHASE_SPAN` table rounds. */
const COLOR_PHASE_SPAN = 34

function motivationalPhaseT(playRoundNumber: number): number {
  return Math.min(1, Math.max(0, (playRoundNumber - 2) / COLOR_PHASE_SPAN))
}

function motivationalBannerRgb(playRoundNumber: number): string {
  const green = { r: 34, g: 197, b: 94 }
  const yellow = { r: 234, g: 179, b: 8 }
  const red = { r: 239, g: 68, b: 68 }
  const t = motivationalPhaseT(playRoundNumber)
  if (t <= 0.5) {
    const u = t / 0.5
    return `rgb(${lerp(green.r, yellow.r, u)}, ${lerp(green.g, yellow.g, u)}, ${lerp(green.b, yellow.b, u)})`
  }
  const u = (t - 0.5) / 0.5
  return `rgb(${lerp(yellow.r, red.r, u)}, ${lerp(yellow.g, red.g, u)}, ${lerp(yellow.b, red.b, u)})`
}

/**
 * One phrase per even-round flash, advancing in order (round 2 → first, 4 → second, …) so all 34 rotate
 * before repeating.
 */
function phraseIndexForEvenRound(playRoundNumber: number, length: number): number {
  if (length <= 0) return 0
  if (playRoundNumber < 2 || playRoundNumber % 2 !== 0) return 0
  const evenOrdinal = playRoundNumber / 2
  return (evenOrdinal - 1) % length
}

interface MotivationalRoundBannerProps {
  /** Current full-table round (from game state). */
  playRoundNumber: number
}

export function MotivationalRoundBanner({ playRoundNumber }: MotivationalRoundBannerProps) {
  const n = MOTIVATIONAL_BANNER_PHRASES.length
  const phraseIndex = useMemo(
    () => phraseIndexForEvenRound(playRoundNumber, n),
    [playRoundNumber, n]
  )
  const text = MOTIVATIONAL_BANNER_PHRASES[phraseIndex] ?? MOTIVATIONAL_BANNER_PHRASES[0]
  const fill = motivationalBannerRgb(playRoundNumber)
  const phaseT = motivationalPhaseT(playRoundNumber)
  const phaseGlow =
    phaseT < 0.35
      ? `0 0 20px ${fill}cc, 0 0 40px ${fill}55`
      : phaseT < 0.7
        ? `0 0 16px ${fill}aa, 0 0 28px ${fill}44`
        : `0 0 12px ${fill}88, 0 0 22px ${fill}33`

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none flex w-full min-w-0 max-w-[min(92%,1100px)] flex-col items-center justify-center px-1 sm:px-2"
    >
      <div
        className="max-w-[min(92vw,36rem)] rounded-lg border border-white/20 px-3 py-2 text-center shadow-lg sm:rounded-xl sm:px-5 sm:py-3"
        style={{
          backgroundColor: 'rgba(8, 10, 16, 0.88)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: BANNER_TITLE_FS,
            fontWeight: 700,
            lineHeight: 1.35,
            letterSpacing: '0.02em',
            color: fill,
            WebkitTextStroke: '0.65px rgba(0,0,0,0.92)',
            paintOrder: 'stroke fill',
            textShadow: [
              '0 0 2px #000',
              '0 0 5px rgba(0,0,0,0.95)',
              '1px 1px 0 #000',
              '-1px -1px 0 #000',
              '1px -1px 0 #000',
              '-1px 1px 0 #000',
              phaseGlow,
            ].join(', '),
          }}
        >
          {text}
        </p>
      </div>
    </div>
  )
}
