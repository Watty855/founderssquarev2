import type { GameState } from '@/lib/types'
import { drawCards, drawFromDeckWithDiscardReshuffle } from '@/lib/deckUtils'
import { nextPlayRoundNumber } from '@/lib/playRound'
import { replenishCurrentPlayerActionHand } from '@/lib/turnActions'
import type { ApplyGameActionResult, GameEvent } from '@/lib/onlineGameActions'
import {
  applyFinalRoundCountdown,
  clearCouncilFreezeIfEndingPlayer,
} from '@/lib/gameEngine/statePatches'

function silentReplenish(state: GameState, playerIndex: number): GameState {
  const { state: nextState } = replenishCurrentPlayerActionHand(state, playerIndex)
  return nextState
}

/** Pure end-turn transition (no UI toasts). */
export function applyEndTurn(state: GameState): ApplyGameActionResult {
  const currentPlayer = state.players[state.currentPlayerIndex]
  if (!currentPlayer) return { ok: false, error: 'No active player.', code: 'no_player' }

  let updatedActionCards = [...(currentPlayer.actionCards || [])]
  let updatedPropertyCards = [...(currentPlayer.propertyCards || [])]
  let updatedActionDeck = [...state.actionDeck]
  let updatedPropertyDeck = [...state.propertyDeck]
  let updatedPropertyDiscard = [...state.propertyDiscard]

  if (state.playedPropertyCardThisTurn) {
    const playedPropertyInstance = updatedPropertyCards.find(
      (c) => c.instanceId === state.playedPropertyCardThisTurn
    )
    if (playedPropertyInstance) {
      updatedPropertyCards = updatedPropertyCards.filter(
        (c) => c.instanceId !== state.playedPropertyCardThisTurn
      )
      updatedPropertyDiscard.push(playedPropertyInstance)
    }
  }

  const propertyCardsToDraw = Math.max(0, 5 - updatedPropertyCards.length)
  if (propertyCardsToDraw > 0) {
    const { drawn, remaining } = drawCards(updatedPropertyDeck, propertyCardsToDraw)
    updatedPropertyCards = [...updatedPropertyCards, ...drawn]
    updatedPropertyDeck = remaining
  }

  const totalActionCards = updatedActionCards.length

  const updatedPlayers = state.players.map((p, idx) =>
    idx === state.currentPlayerIndex
      ? { ...p, actionCards: updatedActionCards, propertyCards: updatedPropertyCards }
      : p
  )

  const newState: GameState = {
    ...state,
    players: updatedPlayers,
    actionDeck: updatedActionDeck,
    propertyDeck: updatedPropertyDeck,
    propertyDiscard: updatedPropertyDiscard,
    propertiesBuiltThisTurn: 0,
    actionsPlayedThisTurn: 0,
    turnActionsConsumed: 0,
    incomeResolvedThisTurn: false,
    crossingTheLineActive: false,
    playedPropertyCardThisTurn: undefined,
  }

  const events: GameEvent[] = []

  if (totalActionCards > 8) {
    events.push({ type: 'discard_required', numToDiscard: totalActionCards - 8 })
    return { ok: true, state: newState, events }
  }

  const finalRoundPatch = applyFinalRoundCountdown(state)
  if (finalRoundPatch.gameEnded) {
    events.push({ type: 'game_over' })
    return {
      ok: true,
      state: {
        ...newState,
        ...clearCouncilFreezeIfEndingPlayer(state, state.currentPlayerIndex),
        ...finalRoundPatch,
        lastBuiltProperty: undefined,
      },
      events,
    }
  }

  const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length
  const nextPlayer = state.players[nextPlayerIndex]
  const playRoundNumber = nextPlayRoundNumber(state, nextPlayerIndex)

  const {
    drawn: newActionCards,
    deck: nextActionDeck,
    discard: nextActionDiscard,
  } = drawFromDeckWithDiscardReshuffle(updatedActionDeck, state.actionDiscard, 2)

  const nextPlayerUpdated = {
    ...nextPlayer,
    actionCards: [...nextPlayer.actionCards, ...newActionCards],
  }

  const playersWithNewCards = newState.players.map((p, idx) =>
    idx === nextPlayerIndex ? nextPlayerUpdated : p
  )

  const inFinalRound = finalRoundPatch.finalRoundTurnsRemaining !== undefined
  events.push({
    type: 'turn_changed',
    playerName: nextPlayer.name,
    finalRound: inFinalRound,
  })

  const advanced: GameState = {
    ...newState,
    ...clearCouncilFreezeIfEndingPlayer(state, state.currentPlayerIndex),
    ...finalRoundPatch,
    players: playersWithNewCards,
    actionDeck: nextActionDeck,
    actionDiscard: nextActionDiscard,
    currentPlayerIndex: nextPlayerIndex,
    playRoundNumber,
    newCardsDrawn: newActionCards,
    showNewCardsAnimation: true,
    lastBuiltProperty: undefined,
  }

  return { ok: true, state: silentReplenish(advanced, nextPlayerIndex), events }
}

export function applyAnimationFlagsClear(state: GameState): ApplyGameActionResult {
  return {
    ok: true,
    state: {
      ...state,
      showNewCardsAnimation: false,
      newCardsDrawn: undefined,
    },
    events: [],
  }
}
