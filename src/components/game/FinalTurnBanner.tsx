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
      className="pointer-events-none z-40 flex w-full min-w-0 max-w-full justify-center px-2 py-1 sm:px-4 sm:py-2"
    >
      <style>{`
        @keyframes fsFinalTurnPulse {
          0%, 100% {
            box-shadow:
              0 0 0 1px rgba(255, 255, 255, 0.18),
              0 0 20px -4px rgba(248, 113, 113, 0.45),
              0 0 40px -10px rgba(248, 113, 113, 0.28),
              inset 0 0 0 1px rgba(255, 255, 255, 0.05);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(255, 255, 255, 0.25),
              0 0 36px -2px rgba(248, 113, 113, 0.7),
              0 0 64px -8px rgba(248, 113, 113, 0.4),
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
          width: 'min(92vw, 28rem)',
          maxWidth: 520,
          padding: '10px 14px',
          borderRadius: 14,
          backgroundColor: 'rgba(15, 7, 7, 0.92)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          animation: 'fsFinalTurnPulse 2.4s ease-in-out infinite, fsFinalTurnSlideIn 320ms ease-out',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            backgroundColor: '#f87171',
            boxShadow: '0 0 12px #f87171, 0 0 4px #fff',
            animation: 'fsFinalTurnDot 1.2s ease-in-out infinite',
            flexShrink: 0,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
          <p
            style={{
              margin: 0,
              fontSize: 'clamp(9px, 1.4vw, 11px)',
              fontWeight: 800,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#fca5a5',
            }}
          >
            Final Round triggered by {triggererName}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 'clamp(14px, 2.4vw, 18px)',
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
            paddingLeft: 10,
            borderLeft: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <span
            style={{
              fontSize: 'clamp(18px, 3vw, 22px)',
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
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.14em',
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
