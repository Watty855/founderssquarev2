'use client'

import { useOverlayStore } from '@/lib/gameOverlayStore'
import { FinalTurnBanner } from '@/components/game/FinalTurnBanner'
import { MotivationalRoundBanner } from '@/components/game/MotivationalRoundBanner'

/** Store-subscribed board banners. Isolated so a notice cannot rebuild lots. */
export function BoardTableChrome() {
  const motivationalFlashRound = useOverlayStore((s) => s.motivationalFlashRound)
  const showFinalTurnBanner = useOverlayStore((s) => s.showFinalTurnBanner)
  const finalTurnBanner = useOverlayStore((s) => s.finalTurnBanner)
  const boardNotice = useOverlayStore((s) => s.boardNotice)

  return (
    <>
      {motivationalFlashRound != null ? (
        <div
          style={{
            gridColumn: '1 / -1',
            gridRow: '18 / 19',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 8px',
            zIndex: 41,
            pointerEvents: 'none',
          }}
        >
          <MotivationalRoundBanner playRoundNumber={motivationalFlashRound} />
        </div>
      ) : null}
      {showFinalTurnBanner && finalTurnBanner ? (
        <div
          style={{
            gridColumn: '1 / -1',
            gridRow: '16 / 19',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 6px',
            zIndex: 39,
            pointerEvents: 'none',
          }}
        >
          <FinalTurnBanner
            triggererName={finalTurnBanner.triggererName}
            currentPlayerName={finalTurnBanner.currentPlayerName}
            currentPlayerColor={finalTurnBanner.currentPlayerColor}
            turnsRemainingThisRound={finalTurnBanner.turnsRemainingThisRound}
          />
        </div>
      ) : null}
      {boardNotice && boardNotice.tone !== 'calamity' ? (
        <div
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-3 sm:p-6"
          aria-live="polite"
          role="status"
          style={{ gridColumn: '1 / -1', gridRow: '1 / -1' }}
        >
          <div className="fs-board-notice-panel max-w-[min(92vw,28rem)] rounded-xl border border-white/25 bg-black/80 px-4 py-3 text-center shadow-[0_0_40px_rgba(0,0,0,0.55)] backdrop-blur-md sm:rounded-2xl sm:px-6 sm:py-5">
            <p
              style={{
                fontSize: 'clamp(0.95rem, 2.2vw, 1.35rem)',
                fontWeight: 600,
                lineHeight: 1.2,
                letterSpacing: '0.01em',
                color: 'rgba(248,250,252,0.98)',
                margin: 0,
              }}
            >
              {boardNotice.title}
            </p>
            {boardNotice.detail ? (
              <p
                style={{
                  marginTop: 8,
                  fontSize: 'clamp(12px, 1.6vw, 14px)',
                  fontWeight: 500,
                  color: 'rgba(226,232,240,0.72)',
                  letterSpacing: '0.04em',
                  lineHeight: 1.45,
                }}
              >
                {boardNotice.detail}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
