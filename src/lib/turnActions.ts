import { drawFromDeckWithDiscardReshuffle } from './deckUtils'
import type { GameState } from './types'

export const MAX_TURN_ACTIONS = 3

export function turnLimitReached(turnActionsConsumed: number | undefined): boolean {
  return (turnActionsConsumed ?? 0) >= MAX_TURN_ACTIONS
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
