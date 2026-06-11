'use client'

/**
 * Final Round strip: positioned on the board by GameBoard (`finalRoundBanner`) in the lower-mid grid
 * (rows ~16–18). Non-blocking — pointer-events disabled, gentle pulse so it does not compete with
 * required-action banners.
 */
interface FinalTurnBannerProps {
  /** Whose move triggered the final round. */
  triggererName: string
  /** Display name of the player whose turn is currently active. */
  currentPlayerName: string
  /** Color of the active player (used as the accent stripe). */
  currentPlayerColor: string
  /** Number of final turns left to play, INCLUDING the current player's turn. Display drives
   *  "Final Turn" copy when the value is 1, otherwise "X turns until game over". */
  turnsRemainingThisRound: number
}

export function FinalTurnBanner({
  triggererName,
  currentPlayerName,
  currentPlayerColor,
  turnsRemainingThisRound,
}: FinalTurnBannerProps) {
  const isVeryLastTurn = turnsRemainingThisRound <= 1
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none z-40 flex w-full min-w-0 max-w-full justify-center px-4 py-2 sm:px-6"
    >
      <style>{`
        @keyframes fsFinalTurnPulse {
          0%, 100% {
            box-shadow:
              0 0 0 1px rgba(255, 255, 255, 0.18),
              0 0 32px -4px rgba(248, 113, 113, 0.55),
              0 0 80px -10px rgba(248, 113, 113, 0.35),
              inset 0 0 0 1px rgba(255, 255, 255, 0.05);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(255, 255, 255, 0.25),
              0 0 60px -2px rgba(248, 113, 113, 0.85),
              0 0 120px -8px rgba(248, 113, 113, 0.55),
              inset 0 0 0 1px rgba(255, 255, 255, 0.08);
          }
        }
        @keyframes fsFinalTurnSlideIn {
          from { opacity: 0; transform: translateY(-12px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fsFinalTurnDot {
          0%, 100% { transform: scale(1);   opacity: 0.6; }
          50%      { transform: scale(1.5); opacity: 1; }
        }
      `}</style>
      <div
        style={{
          minWidth: 420,
          maxWidth: 720,
          padding: '14px 26px',
          borderRadius: 18,
          backgroundColor: 'rgba(15, 7, 7, 0.92)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          animation: 'fsFinalTurnPulse 2.4s ease-in-out infinite, fsFinalTurnSlideIn 320ms ease-out',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 12,
            height: 12,
            borderRadius: 999,
            backgroundColor: '#f87171',
            boxShadow: '0 0 12px #f87171, 0 0 4px #fff',
            animation: 'fsFinalTurnDot 1.2s ease-in-out infinite',
            flexShrink: 0,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: '#fca5a5',
            }}
          >
            Final Round triggered by {triggererName}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '0.02em',
              color: '#fff5f5',
              lineHeight: 1.15,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {isVeryLastTurn ? 'Final Turn' : 'Final Round'}
            <span
              style={{
                color: currentPlayerColor,
                fontWeight: 700,
                marginLeft: 10,
                textShadow: `0 0 10px ${currentPlayerColor}, 0 0 22px ${currentPlayerColor}`,
              }}
            >
              · {currentPlayerName}
            </span>
          </p>
        </div>
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 2,
            paddingLeft: 12,
            borderLeft: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <span
            style={{
              fontSize: 26,
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              color: '#fff5f5',
              lineHeight: 1,
              textShadow: '0 0 10px rgba(248,113,113,0.65)',
            }}
          >
            {turnsRemainingThisRound}
          </span>
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'rgba(252, 165, 165, 0.85)',
            }}
          >
            {turnsRemainingThisRound === 1 ? 'turn left' : 'turns left'}
          </span>
        </div>
      </div>
    </div>
  )
}
