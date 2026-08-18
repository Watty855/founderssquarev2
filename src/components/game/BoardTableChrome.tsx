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
      {boardNotice ? (
        <div
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-3 sm:p-6"
          aria-live="polite"
          role="status"
          style={{ gridColumn: '1 / -1', gridRow: '1 / -1' }}
        >
          <div
            className={
              boardNotice.tone === 'calamity'
                ? 'fs-board-notice-panel max-w-[min(94vw,32rem)] rounded-xl border px-5 py-5 text-center sm:rounded-2xl sm:px-8 sm:py-7'
                : 'fs-board-notice-panel max-w-[min(92vw,28rem)] rounded-xl border border-white/25 bg-black/80 px-4 py-3 text-center shadow-[0_0_40px_rgba(0,0,0,0.55)] backdrop-blur-md sm:rounded-2xl sm:px-6 sm:py-5'
            }
            style={
              boardNotice.tone === 'calamity'
                ? {
                    background: 'linear-gradient(180deg, #dc2626 0%, #991b1b 42%, #7f1d1d 100%)',
                    borderColor: 'rgba(254, 202, 202, 0.55)',
                    boxShadow:
                      '0 0 0 1px rgba(127, 29, 29, 0.9), 0 0 72px rgba(185, 28, 28, 0.72), 0 24px 48px rgba(0,0,0,0.55)',
                  }
                : undefined
            }
          >
            <p
              style={{
                fontSize:
                  boardNotice.tone === 'calamity'
                    ? 'clamp(1.35rem, 3.4vw, 2.1rem)'
                    : 'clamp(0.95rem, 2.2vw, 1.35rem)',
                fontWeight: boardNotice.tone === 'calamity' ? 800 : 600,
                lineHeight: 1.2,
                letterSpacing: boardNotice.tone === 'calamity' ? '0.18em' : '0.01em',
                textTransform: boardNotice.tone === 'calamity' ? 'uppercase' : undefined,
                color: 'rgba(248,250,252,0.98)',
                margin: 0,
              }}
            >
              {boardNotice.title}
            </p>
            {boardNotice.detail ? (
              <p
                style={{
                  marginTop: boardNotice.tone === 'calamity' ? 14 : 8,
                  fontSize:
                    boardNotice.tone === 'calamity'
                      ? 'clamp(13px, 1.8vw, 16px)'
                      : 'clamp(12px, 1.6vw, 14px)',
                  fontWeight: boardNotice.tone === 'calamity' ? 600 : 500,
                  color:
                    boardNotice.tone === 'calamity'
                      ? 'rgba(254, 226, 226, 0.95)'
                      : 'rgba(226,232,240,0.72)',
                  letterSpacing: boardNotice.tone === 'calamity' ? '0.01em' : '0.04em',
                  whiteSpace: boardNotice.tone === 'calamity' ? 'pre-line' : undefined,
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
