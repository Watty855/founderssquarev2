'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

const BANNERS = [
  'Become the founder of a great city!',
  'Help create a community, build structures, leverage influence, and manage the ebb and flow of city life.',
  'The goal is to accumulate the highest monetary value through property ownership and cash reserves.',
  'Be prepared for strategic card play, risk-taking, and the luck of the die to determine the fate of your urban empire!',
] as const

const HOLD_MS = 4000
const FADE_MS = 500

/** Matches build-completion `boardNotice` title in GameApp exactly. */
const bannerTextStyle: CSSProperties = {
  fontSize: 'clamp(1.35rem, 2.8vw, 2rem)',
  fontWeight: 600,
  lineHeight: 1.35,
  letterSpacing: '0.01em',
  color: 'rgba(248,250,252,0.98)',
  margin: 0,
  textShadow:
    '0 0 1px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.85), 0 -1px 1px rgba(0,0,0,0.5)',
}

interface GameOpeningSequenceProps {
  onProceed: () => void
}

export function GameOpeningSequence({ onProceed }: GameOpeningSequenceProps) {
  const [lineIndex, setLineIndex] = useState(0)
  const [textOpacity, setTextOpacity] = useState(1)
  const [showProceed, setShowProceed] = useState(false)
  const [proceedOpacity, setProceedOpacity] = useState(0)

  const onProceedRef = useRef(onProceed)
  onProceedRef.current = onProceed

  const finish = useCallback(() => {
    onProceedRef.current()
  }, [])

  useEffect(() => {
    if (showProceed) return

    let fadeTimer: number | undefined
    const holdTimer = window.setTimeout(() => {
      setTextOpacity(0)
      fadeTimer = window.setTimeout(() => {
        if (lineIndex >= BANNERS.length - 1) {
          setShowProceed(true)
          return
        }
        setLineIndex((i) => i + 1)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setTextOpacity(1))
        })
      }, FADE_MS)
    }, HOLD_MS)

    return () => {
      window.clearTimeout(holdTimer)
      if (fadeTimer !== undefined) window.clearTimeout(fadeTimer)
    }
  }, [lineIndex, showProceed])

  useEffect(() => {
    if (!showProceed) {
      setProceedOpacity(0)
      return
    }
    const t = window.setTimeout(() => setProceedOpacity(1), FADE_MS * 0.35)
    return () => clearTimeout(t)
  }, [showProceed])

  return (
    <div
      className="absolute inset-0 z-[36] flex items-center justify-center bg-black/30 p-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fs-intro-heading"
      aria-describedby="fs-intro-story"
    >
      <button
        type="button"
        onClick={finish}
        className="absolute right-4 top-4 z-10 rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/70 transition hover:border-white/25 hover:bg-black/55 hover:text-white"
      >
        Skip
      </button>

      <div
        id="fs-intro-story"
        className="fs-board-notice-panel flex max-h-[min(72vh,560px)] w-full max-w-xl flex-col rounded-2xl border border-white/25 bg-black/55 px-8 py-8 shadow-[0_0_60px_rgba(0,0,0,0.55)] backdrop-blur-md sm:px-10 sm:py-9"
      >
        <h2 id="fs-intro-heading" className="sr-only">
          Welcome to Founders Square
        </h2>

        <div className="flex min-h-[min(40vh,260px)] flex-1 flex-col items-center justify-center">
          {!showProceed ? (
            <p
              key={lineIndex}
              style={{
                ...bannerTextStyle,
                opacity: textOpacity,
                transition: `opacity ${FADE_MS}ms ease-in-out`,
                maxWidth: '100%',
              }}
              className="text-center"
            >
              {BANNERS[lineIndex]}
            </p>
          ) : null}
        </div>

        <div
          className="mt-6 flex shrink-0 flex-col items-center justify-end border-t border-white/10 pt-5"
          style={{
            opacity: proceedOpacity,
            transition: `opacity ${FADE_MS}ms ease-in-out`,
          }}
        >
          {showProceed ? (
            <button
              type="button"
              onClick={finish}
              className="rounded-full border border-sky-400/35 bg-sky-500/20 px-8 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-sky-100/95 transition hover:border-sky-400/50 hover:bg-sky-500/30"
            >
              Proceed with game
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
