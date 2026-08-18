'use client'

import { memo } from 'react'
import { PlayerHand } from '@/components/game/PlayerHand'
import { useOverlayStore } from '@/lib/gameOverlayStore'
import { useGameTableStore } from '@/lib/gameTableStore'
import { usePlayUiStore } from '@/lib/playUiStore'
import { getGameHandlers } from '@/lib/gameHandlerBag'
import { setDiscardPropertyConfirmOpen, setTaxBuildMode } from '@/lib/playUiStore'
import { gameDockToast as toast } from '@/lib/fsGameToast'

function HandRailImpl() {
  const hiddenInstanceIds = useOverlayStore((s) => s.hiddenInstanceIds)
  const showOpeningProTip = useOverlayStore((s) => s.showOpeningProTip)
  const session = usePlayUiStore((s) => s.session)
  const placementMode = usePlayUiStore((s) => s.placementMode)
  const investmentSelectMode = usePlayUiStore((s) => s.investmentSelectMode)
  const discardPropertySelectMode = usePlayUiStore((s) => s.discardPropertySelectMode)
  const removeInvestorsSelectMode = usePlayUiStore((s) => s.removeInvestorsSelectMode)
  const takeoverSelectMode = usePlayUiStore((s) => s.takeoverSelectMode)
  const scandalSelectMode = usePlayUiStore((s) => s.scandalSelectMode)
  const rezoningPhase = usePlayUiStore((s) => s.rezoningMode.phase)
  const taxBuildMode = usePlayUiStore((s) => s.taxBuildMode)
  const currentPlayerIndex = useGameTableStore((s) => s.currentPlayerIndex)
  const players = useGameTableStore((s) => s.players)
  const plots = useGameTableStore((s) => s.plots)
  const crossingTheLineActive = useGameTableStore((s) => s.crossingTheLineActive)
  const showNewCardsAnimation = useGameTableStore((s) => s.showNewCardsAnimation)
  const newCardsDrawn = useGameTableStore((s) => s.newCardsDrawn)
  const propertyDeckLen = useGameTableStore((s) => s.propertyDeck.length)
  const actionDeckLen = useGameTableStore((s) => s.actionDeck.length)

  const handRailPlayer =
    (session.handRailPlayerId != null
      ? players.find((p) => p.id === session.handRailPlayerId)
      : undefined) ?? players[currentPlayerIndex]
  if (!handRailPlayer) return null

  const acting = players[currentPlayerIndex]
  const handInteractionsActive =
    !session.isSpectator &&
    !showOpeningProTip &&
    handRailPlayer.id === acting?.id &&
    acting?.isAi !== true

  const h = getGameHandlers()
  const { isCompactLayout, isLandscapeLayout } = session
  const className = isCompactLayout
    ? isLandscapeLayout
      ? 'flex-shrink-0 border-t border-white/10 px-2 py-1'
      : 'flex-shrink-0 border-t border-white/10 px-2 py-2'
    : 'flex-shrink-0 border-t border-white/10 px-8 py-5'

  return (
    <div
      className={className}
      style={{
        background: 'transparent',
        pointerEvents: showOpeningProTip ? 'none' : 'auto',
        opacity: showOpeningProTip ? 0.55 : 1,
        transition: 'opacity 200ms ease',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <PlayerHand
        player={handRailPlayer}
        opponents={players.filter((_, i) => i !== currentPlayerIndex)}
        handInteractionsActive={handInteractionsActive}
        compact={isCompactLayout}
        landscape={isLandscapeLayout}
        onPlayCards={(propertyInstanceId, actionInstanceIds, convertToCashInstanceIds, options) =>
          h.handlePlayCards(propertyInstanceId, actionInstanceIds, convertToCashInstanceIds, options)
        }
        onEndTurn={() => h.handleEndTurn()}
        placementMode={placementMode}
        investmentSelectMode={investmentSelectMode}
        discardPropertySelectMode={discardPropertySelectMode}
        onToggleDiscardProperty={(id) => h.handleToggleDiscardPropertySelection(id)}
        onOpenDiscardPropertyConfirm={() => setDiscardPropertyConfirmOpen(true)}
        onCancelDiscardProperty={() => h.handleCancelDiscardPropertySelect()}
        removeInvestorsSelectMode={removeInvestorsSelectMode}
        takeoverSelectMode={takeoverSelectMode}
        scandalSelectMode={scandalSelectMode}
        rezoningPhase={rezoningPhase}
        taxBuildPhase={taxBuildMode.phase}
        taxBuildActionInstanceId={
          taxBuildMode.phase === 'pick-property' ? taxBuildMode.actionInstanceId : undefined
        }
        onTaxBuildPropertySelect={(propertyInstanceId) => {
          if (taxBuildMode.phase !== 'pick-property') return
          h.handlePlayCards(propertyInstanceId, [], [], {
            useTaxBuild: true,
            taxBuildActionInstanceId: taxBuildMode.actionInstanceId,
            skipTaxBuildPrompt: true,
          })
        }}
        onCancelTaxBuild={() => {
          setTaxBuildMode({ phase: 'inactive' })
          toast.info('Build with Tax Dollars cancelled.')
        }}
        onRezoningPropertySelect={(id) => h.handleRezoningPropertyFromHand(id)}
        onRezoningHousingStandard={() => h.handleRezoningHousingDensity(false)}
        onRezoningHousingHighDensity={() => h.handleRezoningHousingDensity(true)}
        onCancelRezoning={() => h.handleCancelRezoning()}
        onCancelInvestment={() => h.handleCancelInvestmentSelect()}
        onCancelRemoveInvestors={() => h.handleCancelRemoveInvestorsSelect()}
        onCancelTakeover={() => h.handleCancelTakeoverSelect()}
        onCancelScandal={() => h.handleCancelScandalSelect()}
        onCancelPlacement={() => h.handleCancelPlacement()}
        showNewCardsAnimation={showNewCardsAnimation}
        newCardsDrawn={newCardsDrawn}
        hiddenInstanceIds={hiddenInstanceIds}
        propertyDeckHasCards={propertyDeckLen > 0}
        actionDeckHasCards={actionDeckLen > 0}
        plots={plots}
        crossingTheLineActive={crossingTheLineActive}
      />
    </div>
  )
}

export const HandRail = memo(HandRailImpl)
