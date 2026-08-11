import { drawFromDeckWithDiscardReshuffle } from './deckUtils'
import type { GameState } from './types'

export const MAX_TURN_ACTIONS = 3

/** Successful Rezoning spends an action slot and a build slot (two of the three turn actions). */
export const REZONING_SUCCESS_ACTION_COST = 2

/**
 * Soft action-hand cap. Players may hold more than this during a turn (start-of-turn
 * draw 2, or Draw 2 Action Cards). Excess is discarded only after the turn's 3 actions
 * are spent (1 build + 2 actions, or 3 actions) — never at the start-of-turn deal.
 */
export const MAX_ACTION_HAND_SIZE = 8

export function turnLimitReached(turnActionsConsumed: number | undefined): boolean {
  return (turnActionsConsumed ?? 0) >= MAX_TURN_ACTIONS
}

/** True when a Rezoning attempt can still finish as action + build within the turn budget. */
export function canAttemptRezoning(turnActionsConsumed: number | undefined): boolean {
  return (turnActionsConsumed ?? 0) + REZONING_SUCCESS_ACTION_COST <= MAX_TURN_ACTIONS
}

/**
 * True when the acting founder has spent all turn actions and the board has no
 * pending PvP defense — safe to advance to the next founder automatically.
 */
export function shouldAutoAdvanceTurn(state: GameState): boolean {
  if (state.gameEnded) return false
  if (state.awaitingEndTurnActionDiscard) return false
  if (!turnLimitReached(state.turnActionsConsumed)) return false
  if (state.pendingCouncilFreezeDefense != null) return false
  if (state.pendingRebuttalRoll != null) return false
  if (state.showNewCardsAnimation === true) return false
  return true
}

/** How many action cards must be discarded to end the turn at the hand cap. */
export function actionHandDiscardCount(handSize: number): number {
  return Math.max(0, handSize - MAX_ACTION_HAND_SIZE)
}

export type ReplenishResult = { state: GameState; drew: number }

/** If the current player has zero action cards, draw up to 5 from the deck (reshuffling the action discard into a new deck when empty). */
export function replenishCurrentPlayerActionHand(state: GameState, playerIndex: number): ReplenishResult {
  const p = state.players[playerIndex]
  if ((p.actionCards?.length ?? 0) > 0) return { state, drew: 0 }

  const need = 5
  const { drawn, deck, discard } = drawFromDeckWithDiscardReshuffle(
    [...state.actionDeck],
    [...state.actionDiscard],
    need
  )

  if (drawn.length === 0) return { state, drew: 0 }

  const players = state.players.map((pl, i) =>
    i === playerIndex ? { ...pl, actionCards: drawn } : pl
  )

  return {
    state: {
      ...state,
      players,
      actionDeck: deck,
      actionDiscard: discard,
      newCardsDrawn: drawn,
      showNewCardsAnimation: true,
    },
    drew: drawn.length,
  }
}
