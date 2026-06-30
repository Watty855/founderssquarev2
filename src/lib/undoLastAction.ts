import { actionCards, propertyCards } from '@/lib/cardData'
import type { GameState } from '@/lib/types'

export type UndoLastAction = {
  label: string
  playerIndex: number
  snapshot: GameState
}

const DICE_DETERMINED_ACTION_CARD_IDS = new Set([
  ...actionCards.filter((card) => card.diceRequired).map((card) => card.id),
  'roll-die',
])

export function isDiceDeterminedActionCardId(cardId: string): boolean {
  return DICE_DETERMINED_ACTION_CARD_IDS.has(cardId)
}

function newActionDiscardsSince(before: GameState, after: GameState) {
  return after.actionDiscard.filter(
    (card) => !before.actionDiscard.some((prev) => prev.instanceId === card.instanceId)
  )
}

/** True when a turn-consuming patch spent a dice-gated action card or resolved Income. */
function consumedTurnUsedDiceAction(before: GameState, after: GameState): boolean {
  if (!before.incomeResolvedThisTurn && after.incomeResolvedThisTurn) {
    return true
  }

  return newActionDiscardsSince(before, after).some((card) =>
    isDiceDeterminedActionCardId(card.cardId)
  )
}

const EPHEMERAL_KEYS = ['undoLastAction', 'showNewCardsAnimation', 'newCardsDrawn'] as const

/** Clone game state for undo (omit ephemeral / undo meta fields). */
export function snapshotForUndo(state: GameState): GameState {
  const clone = structuredClone(state) as GameState
  for (const key of EPHEMERAL_KEYS) {
    delete (clone as unknown as Record<string, unknown>)[key]
  }
  return clone
}

function deriveUndoLabel(before: GameState, after: GameState): string {
  const built = after.lastBuiltProperty
  const hadBuilt = before.lastBuiltProperty
  if (
    built &&
    (!hadBuilt ||
      hadBuilt.row !== built.row ||
      hadBuilt.col !== built.col ||
      hadBuilt.propertyId !== built.propertyId)
  ) {
    const title =
      built.undoTitle ??
      propertyCards.find((c) => c.id === built.propertyId)?.name ??
      'Property'
    return `Build ${title} at ${built.col}${built.row}`
  }

  const newActionDiscards = after.actionDiscard.filter(
    (ac) => !before.actionDiscard.some((b) => b.instanceId === ac.instanceId)
  )
  if (newActionDiscards.length > 0) {
    const last = newActionDiscards[newActionDiscards.length - 1]
    const card = actionCards.find((c) => c.id === last.cardId)
    if (card) return `Play ${card.name}`
  }

  const newPropertyDiscards = after.propertyDiscard.filter(
    (pc) => !before.propertyDiscard.some((b) => b.instanceId === pc.instanceId)
  )
  if (
    newPropertyDiscards.length > 0 &&
    (after.turnActionsConsumed ?? 0) > (before.turnActionsConsumed ?? 0)
  ) {
    const last = newPropertyDiscards[newPropertyDiscards.length - 1]
    const card = propertyCards.find((c) => c.id === last.cardId)
    if (card) return `Bank ${card.name}`
  }

  return 'Last action'
}

/** After a turn-consuming patch, attach undo metadata when still the same founder's turn. */
export function attachUndoSnapshotIfTurnAction(before: GameState, after: GameState): GameState {
  if (after.gameEnded) return { ...after, undoLastAction: undefined }

  const consumedBefore = before.turnActionsConsumed ?? 0
  const consumedAfter = after.turnActionsConsumed ?? 0

  if (
    consumedAfter <= consumedBefore ||
    after.currentPlayerIndex !== before.currentPlayerIndex
  ) {
    return after
  }

  if (consumedTurnUsedDiceAction(before, after)) {
    return { ...after, undoLastAction: undefined }
  }

  return {
    ...after,
    undoLastAction: {
      label: deriveUndoLabel(before, after),
      playerIndex: before.currentPlayerIndex,
      snapshot: snapshotForUndo(before),
    },
  }
}

export function canUndoLastAction(
  state: GameState,
  opts: { handInteractionsActive: boolean; isSpectator: boolean }
): boolean {
  if (opts.isSpectator || !opts.handInteractionsActive) return false
  const undo = state.undoLastAction
  if (!undo) return false
  return undo.playerIndex === state.currentPlayerIndex
}

export function restoreUndoSnapshot(state: GameState): GameState {
  const undo = state.undoLastAction
  if (!undo || undo.playerIndex !== state.currentPlayerIndex) return state
  return {
    ...undo.snapshot,
    undoLastAction: undefined,
    showNewCardsAnimation: false,
    newCardsDrawn: undefined,
  }
}
