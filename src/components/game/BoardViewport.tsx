'use client'

import { memo, useCallback, useMemo } from 'react'
import { GameBoard } from '@/components/game/GameBoard'
import { BoardPinchZoom } from '@/components/game/BoardPinchZoom'
import { useOverlayStore } from '@/lib/gameOverlayStore'
import { useGameTableStore } from '@/lib/gameTableStore'
import { usePlayUiStore } from '@/lib/playUiStore'
import { selectBoardPlayerColors, selectNamedRegions } from '@/lib/boardSelectors'
import { selectBoardPlacement } from '@/lib/selectBoardPlacement'
import { getGameHandlers } from '@/lib/gameHandlerBag'
import { getGameTableSnapshot } from '@/lib/gameTableStore'
import { getPlayUiSnapshot } from '@/lib/playUiStore'

type BoardViewportProps = {
  compact: boolean
  landscape: boolean
}

function OpeningProTipBlocker() {
  const show = useOverlayStore((s) => s.showOpeningProTip)
  if (!show) return null
  return <div aria-hidden className="absolute inset-0 z-[40]" style={{ pointerEvents: 'auto' }} />
}

function BoardLift({ children }: { children: React.ReactNode }) {
  const show = useOverlayStore((s) => s.showOpeningProTip)
  return (
    <div
      className="relative w-full h-full min-h-0 flex items-center justify-center"
      style={{ zIndex: show ? 45 : undefined }}
    >
      {children}
    </div>
  )
}

function BoardViewportImpl({ compact, landscape }: BoardViewportProps) {
  const plots = useGameTableStore((s) => s.plots)
  const winningSequence = useGameTableStore((s) => s.winningSequence)
  const gameEnded = useGameTableStore((s) => s.gameEnded === true)
  const crossingTheLineActive = useGameTableStore((s) => s.crossingTheLineActive)
  const currentPlayerIndex = useGameTableStore((s) => s.currentPlayerIndex)
  const players = useGameTableStore(selectBoardPlayerColors)
  const named = useGameTableStore(selectNamedRegions)
  const placement = usePlayUiStore((s) => s.placementMode)
  const takeover = usePlayUiStore((s) => s.takeoverSelectMode)
  const scandal = usePlayUiStore((s) => s.scandalSelectMode)
  const investment = usePlayUiStore((s) => s.investmentSelectMode)
  const removeInvestors = usePlayUiStore((s) => s.removeInvestorsSelectMode)
  const rezoningPhase = usePlayUiStore((s) => s.rezoningMode.phase)

  const placementMode = useMemo(
    () => selectBoardPlacement(getGameTableSnapshot(), getPlayUiSnapshot()),
    [
      plots,
      crossingTheLineActive,
      currentPlayerIndex,
      placement,
      takeover,
      scandal,
      investment,
      removeInvestors,
      rezoningPhase,
    ]
  )

  const onPlotClaim = useCallback((row: number, col: string) => {
    getGameHandlers().handlePlotClaim(row, col)
  }, [])
  const onPropertyClick = useCallback((row: number, col: string) => {
    getGameHandlers().handlePropertyClick(row, col)
  }, [])
  const onVacantLotHint = useCallback(() => {
    getGameHandlers().handleVacantLotHint()
  }, [])

  return (
    <BoardPinchZoom enabled={compact} className="relative h-full w-full min-h-0 min-w-0">
      <div
        className={
          compact
            ? landscape
              ? 'relative h-full w-full flex items-center justify-center overflow-hidden px-1 pt-0.5'
              : 'relative h-full w-full flex items-center justify-center overflow-hidden px-1 pt-1'
            : 'relative flex-1 h-full w-full flex items-center justify-center overflow-hidden px-3 pt-2 min-h-0'
        }
      >
        <OpeningProTipBlocker />
        <BoardLift>
          <GameBoard
            compact={compact}
            plots={plots}
            players={players}
            onPlotClaim={onPlotClaim}
            winningSequence={winningSequence}
            onPropertyClick={onPropertyClick}
            placementMode={placementMode}
            namedSquares={named.squares}
            namedStreets={named.streets}
            showNamedRegions={gameEnded}
            onVacantLotHint={onVacantLotHint}
          />
        </BoardLift>
      </div>
    </BoardPinchZoom>
  )
}

export const BoardViewport = memo(BoardViewportImpl)
