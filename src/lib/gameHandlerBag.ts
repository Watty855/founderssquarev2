'use client'

import type { PlayCardsOptions } from '@/components/game/PlayerHand'

export type GameHandlerBag = {
  handlePlayCards: (
    propertyInstanceId: string | null,
    actionInstanceIds: string[],
    convertToCashInstanceIds: string[],
    options?: PlayCardsOptions
  ) => void
  handleEndTurn: () => void
  handleUnstickPlay: () => void
  handlePlotClaim: (row: number, col: string) => void
  handlePropertyClick: (row: number, col: string) => void
  handleVacantLotHint: () => void
  handleCancelPlacement: () => void
  handleCancelRezoning: () => void
  handleCancelTakeoverSelect: () => void
  handleCancelScandalSelect: () => void
  handleCancelInvestmentSelect: () => void
  handleCancelRemoveInvestorsSelect: () => void
  handleCancelDiscardPropertySelect: () => void
  handleConfirmDiscardProperty: (
    selectedPropertyInstanceIds?: string[],
    actionInstanceIdOverride?: string
  ) => void
  handleToggleDiscardPropertySelection: (instanceId: string) => void
  handleRezoningPropertyFromHand: (propertyInstanceId: string) => void
  handleRezoningHousingDensity: (highDensity: boolean) => void
  handleAcceptCalamity: () => void
  handleIncomeComplete: (
    earnedIncome: number,
    doubleIncomeInstanceId?: string,
    incomeResolution?: 'property-roll' | 'bank-income-card',
    dieFace?: number
  ) => void
  handleIncomeCancel: () => void
  handleRollDieComplete: (result: number, extras?: { calamityVariantKey?: string }) => void
  handleRollDieCancel: () => void
  handleAttackerDieSettled: (natural: number) => void
  handleCouncilFreezeAttackerRollAgain: () => void
  handleCouncilFreezeFailDismiss: () => void
  handleCalamitySettled: (info: {
    face: number
    variant: { key: string; title: string; flavor: string }
  }) => void
  handleDiscardComplete: (discardedInstanceIds: string[]) => void
  handleActionCriteriaBank: () => void
  handleDoubleIncomeOrphanConfirmBank: () => void
  handleUndoLastAction: () => void
  handleUndoLastActionCancel: () => void
  abortTaxBuildPrompt: () => void
  setUndoActionDialogOpen: (open: boolean) => void
}

const noop = () => {}

const bag: GameHandlerBag = {
  handlePlayCards: noop,
  handleEndTurn: noop,
  handleUnstickPlay: noop,
  handlePlotClaim: noop,
  handlePropertyClick: noop,
  handleVacantLotHint: noop,
  handleCancelPlacement: noop,
  handleCancelRezoning: noop,
  handleCancelTakeoverSelect: noop,
  handleCancelScandalSelect: noop,
  handleCancelInvestmentSelect: noop,
  handleCancelRemoveInvestorsSelect: noop,
  handleCancelDiscardPropertySelect: noop,
  handleConfirmDiscardProperty: noop,
  handleToggleDiscardPropertySelection: noop,
  handleRezoningPropertyFromHand: noop,
  handleRezoningHousingDensity: noop,
  handleAcceptCalamity: noop,
  handleIncomeComplete: noop,
  handleIncomeCancel: noop,
  handleRollDieComplete: noop,
  handleRollDieCancel: noop,
  handleAttackerDieSettled: noop,
  handleCouncilFreezeAttackerRollAgain: noop,
  handleCouncilFreezeFailDismiss: noop,
  handleCalamitySettled: noop,
  handleDiscardComplete: noop,
  handleActionCriteriaBank: noop,
  handleDoubleIncomeOrphanConfirmBank: noop,
  handleUndoLastAction: noop,
  handleUndoLastActionCancel: noop,
  abortTaxBuildPrompt: noop,
  setUndoActionDialogOpen: noop,
}

export function setGameHandlerBag(next: Partial<GameHandlerBag>) {
  Object.assign(bag, next)
}

export function getGameHandlers(): GameHandlerBag {
  return bag
}
