'use client'

import { ArrowCounterClockwise } from '@phosphor-icons/react'
import { useOverlayStore } from '@/lib/gameOverlayStore'

type HeaderPlayControlsProps = {
  compact: boolean
  isSpectator: boolean
  currentPlayerIsAi: boolean
  canEndTurn: boolean
  onEndTurn: () => void
  onUnstick: () => void
  onNewGame: () => void
}

/** Header actions that disable during the opening pro-tip — GameApp must not subscribe. */
export function HeaderPlayControls({
  compact,
  isSpectator,
  currentPlayerIsAi,
  canEndTurn,
  onEndTurn,
  onUnstick,
  onNewGame,
}: HeaderPlayControlsProps) {
  const showOpeningProTip = useOverlayStore((s) => s.showOpeningProTip)
  const endDisabled = isSpectator || currentPlayerIsAi || showOpeningProTip || !canEndTurn
  const unstickDisabled = isSpectator || showOpeningProTip

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 12 }}>
      <button
        onClick={onEndTurn}
        disabled={endDisabled}
        className="btn-ps"
        style={{
          height: compact ? 30 : 34,
          padding: compact ? '0 12px' : '0 20px',
          borderRadius: 9999,
          border: '1px solid rgba(255,255,255,0.15)',
          backgroundColor: 'transparent',
          color: '#f0f0f5',
          fontSize: compact ? 11 : 12,
          fontWeight: 500,
          cursor: endDisabled ? 'not-allowed' : 'pointer',
          opacity: endDisabled ? 0.45 : 1,
        }}
      >
        End Turn
      </button>
      <button
        type="button"
        onClick={onUnstick}
        data-board-sync-skip-lock
        disabled={unstickDisabled}
        className="btn-ps"
        title="Clear a stuck Founderbot, confrontation roll, or frozen live founder without leaving the table"
        style={{
          height: compact ? 30 : 34,
          padding: compact ? '0 16px' : '0 16px',
          borderRadius: 9999,
          border: '1px solid rgba(251, 191, 36, 0.45)',
          backgroundColor: 'rgba(251, 191, 36, 0.12)',
          color: '#fde68a',
          fontSize: compact ? 11 : 12,
          fontWeight: 600,
          cursor: unstickDisabled ? 'not-allowed' : 'pointer',
          opacity: unstickDisabled ? 0.45 : 1,
        }}
      >
        Unstick
      </button>
      <button
        onClick={onNewGame}
        data-board-sync-skip-lock
        className="btn-ps"
        style={{
          height: compact ? 30 : 34,
          padding: compact ? '0 12px' : '0 20px',
          borderRadius: 9999,
          border: '1px solid rgba(255,255,255,0.15)',
          backgroundColor: 'transparent',
          color: '#f0f0f5',
          fontSize: compact ? 11 : 12,
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <ArrowCounterClockwise size={13} weight="bold" />
        {compact ? 'New' : 'New Game'}
      </button>
    </div>
  )
}
