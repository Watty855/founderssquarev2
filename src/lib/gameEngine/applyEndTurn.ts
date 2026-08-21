import type { GameState } from '@/lib/types'
import { drawCards, drawFromDeckWithDiscardReshuffle } from '@/lib/deckUtils'
import { nextPlayRoundNumber } from '@/lib/playRound'
import {
  MAX_ACTION_HAND_SIZE,
  MAX_TURN_ACTIONS,
  actionHandDiscardCount,
  replenishCurrentPlayerActionHand,
  turnLimitReached,
} from '@/lib/turnActions'
import type { ApplyGameActionResult, GameEvent } from '@/lib/onlineGameActions'
import {
  applyFinalRoundCountdown,
  clearCouncilFreezeIfEndingPlayer,
  maybeOfferEndGameAtEndOfTurn,
} from '@/lib/gameEngine/statePatches'
import { ingestActionDraw } from '@/lib/calamity'

function silentReplenish(state: GameState, playerIndex: number): GameState {
  const { state: nextState } = replenishCurrentPlayerActionHand(state, playerIndex)
  return nextState
}

export interface ApplyEndTurnOptions {
  /**
   * Seat index the caller believes is ending its turn. When it no longer matches
   * `currentPlayerIndex` the end_turn is stale (seat already advanced) and is
   * ignored. When it matches, the end turn is a verified, deliberate request —
   * an over-cap hand goes to the end-turn discard phase at ANY consumed count
   * instead of being silently swallowed (the swallow deadlocked founders — and
   * looped Founderbots forever — who held >8 cards with nothing left to play).
   */
  expectedSeatIndex?: number
}

/** Pure end-turn transition (no UI toasts). */
export function applyEndTurn(
  state: GameState,
  opts?: ApplyEndTurnOptions
): ApplyGameActionResult {
  const currentPlayer = state.players[state.currentPlayerIndex]
  if (!currentPlayer) return { ok: false, error: 'No active player.', code: 'no_player' }

  const seatVerified = opts?.expectedSeatIndex != null
  if (seatVerified && opts.expectedSeatIndex !== state.currentPlayerIndex) {
    // Stale end_turn — the seat already advanced. Never touch the next founder.
    return { ok: true, state, events: [] }
  }

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
  const numToDiscard = actionHandDiscardCount(totalActionCards)

  const updatedPlayers = state.players.map((p, idx) =>
    idx === state.currentPlayerIndex
      ? { ...p, actionCards: updatedActionCards, propertyCards: updatedPropertyCards }
      : p
  )

  const events: GameEvent[] = []
  const budgetSpent = turnLimitReached(state.turnActionsConsumed)
  const alreadyAwaitingDiscard = state.awaitingEndTurnActionDiscard === true
  const consumed = state.turnActionsConsumed ?? 0

  // Soft hand cap: excess is allowed for the whole turn — including the start-of-turn
  // draw 2 and mid-turn Draw 2 Action Cards. Discard-to-cap runs only after the
  // founder has spent all 3 turn actions, is already in the end-turn discard phase,
  // or deliberately ends the turn early (seat-verified caller).
  //
  // Unverified callers keep the conservative behavior: a stale end_turn after the
  // seat already advanced is the classic freeze — the new founder has just been
  // dealt 2 cards (hand often > 8) with 0 actions used, and must not be forced to
  // discard. Verified callers instead pass into the discard phase, because
  // swallowing their end_turn deadlocks humans and loops Founderbots forever.
  if (totalActionCards > MAX_ACTION_HAND_SIZE) {
    if (!budgetSpent && !alreadyAwaitingDiscard && !seatVerified) {
      if (consumed === 0) {
        return { ok: true, state, events: [] }
      }
      return {
        ok: false,
        error: `You may hold more than ${MAX_ACTION_HAND_SIZE} action cards until you finish all ${MAX_TURN_ACTIONS} actions this turn. Discard happens at end of turn.`,
        code: 'hand_cap_after_actions',
      }
    }

    events.push({ type: 'discard_required', numToDiscard })
    return {
      ok: true,
      state: {
        ...state,
        players: updatedPlayers,
        actionDeck: updatedActionDeck,
        propertyDeck: updatedPropertyDeck,
        propertyDiscard: updatedPropertyDiscard,
        turnActionsConsumed: Math.max(consumed, MAX_TURN_ACTIONS),
        awaitingEndTurnActionDiscard: true,
        undoLastAction: undefined,
        showNewCardsAnimation: false,
        newCardsDrawn: undefined,
      },
      events,
    }
  }

  if (state.pendingEndGameDeclaration) {
    return {
      ok: false,
      error: 'Declare the endgame or continue play before ending your turn.',
      code: 'endgame_pending',
    }
  }

  const offer = maybeOfferEndGameAtEndOfTurn(state)
  if (offer.intercepted) {
    return { ok: true, state: offer.state, events: offer.events }
  }
  const stateAfterOffer = offer.state

  const newState: GameState = {
    ...stateAfterOffer,
    players: updatedPlayers,
    actionDeck: updatedActionDeck,
    propertyDeck: updatedPropertyDeck,
    propertyDiscard: updatedPropertyDiscard,
    propertiesBuiltThisTurn: 0,
    actionsPlayedThisTurn: 0,
    turnActionsConsumed: 0,
    incomeResolvedThisTurn: false,
    awaitingEndTurnActionDiscard: undefined,
    crossingTheLineActive: false,
    playedPropertyCardThisTurn: undefined,
    undoLastAction: undefined,
    endGameDeclarationOfferedThisTurn: undefined,
  }

  const finalRoundPatch = applyFinalRoundCountdown(state)
  if (finalRoundPatch.gameEnded) {
    events.push({ type: 'game_over', reason: 'final-round' })
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

  // Start-of-turn draw 2 may put the next founder over MAX_ACTION_HAND_SIZE — that is
  // intentional. They keep the excess until *their* turn ends. Calamity cards
  // never enter the hand; ingestActionDraw plays them city-wide when the 7-round
  // gap has elapsed, otherwise they are buried and replaced.

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
    currentPlayerIndex: nextPlayerIndex,
    playRoundNumber,
    lastBuiltProperty: undefined,
  }

  const withDraw = ingestActionDraw(
    advanced,
    nextPlayerIndex,
    newActionCards,
    nextActionDeck,
    nextActionDiscard,
    'append'
  )

  return { ok: true, state: silentReplenish(withDraw, nextPlayerIndex), events }
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
