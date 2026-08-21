import type { GameState, PendingEndGameDeclaration, Plot } from '@/lib/types'
import type { GameEvent } from '@/lib/onlineGameActions'
import {
  END_GAME_ADJACENT_THRESHOLD,
  END_GAME_MAX_DEFER_TURNS,
  checkForTwelveAdjacentProperties,
  largestOwnedAdjacentCluster,
} from '@/lib/utils'

export function clearCouncilFreezeIfEndingPlayer(
  current: GameState,
  finishingPlayerIndex: number
): Partial<GameState> {
  const finisherId = current.players[finishingPlayerIndex]?.id
  if (finisherId != null && current.councilFreezeBlockBuildForPlayerId === finisherId) {
    return { councilFreezeBlockBuildForPlayerId: undefined }
  }
  return {}
}

function clearEligibilityPatch(): Partial<GameState> {
  return {
    endGameEligiblePlayerId: undefined,
    endGameDeferTurnsRemaining: undefined,
    endGameDeclarationOfferedThisTurn: undefined,
    pendingEndGameDeclaration: undefined,
  }
}

export function buildEndGameEligibilityPatch(
  current: GameState,
  newPlots: Plot[],
  triggerLocation: { row: number; col: string }
): Partial<GameState> {
  if (current.endGameTriggered || current.gameEnded) return {}
  if (current.pendingEndGameDeclaration) return {}

  const placed = newPlots.find((p) => p.row === triggerLocation.row && p.col === triggerLocation.col)
  const preferId = placed?.claimedBy
  const found = checkForTwelveAdjacentProperties(newPlots, preferId)

  if (!found) {
    if (current.endGameEligiblePlayerId == null) return {}
    const still = largestOwnedAdjacentCluster(newPlots, current.endGameEligiblePlayerId)
    if (still && still.plots.length >= END_GAME_ADJACENT_THRESHOLD) return {}
    return clearEligibilityPatch()
  }

  if (current.endGameEligiblePlayerId === found.triggeredByPlayerId) return {}

  if (current.endGameEligiblePlayerId != null) {
    const previous = largestOwnedAdjacentCluster(newPlots, current.endGameEligiblePlayerId)
    if (previous && previous.plots.length >= END_GAME_ADJACENT_THRESHOLD) return {}
  }

  const pending: PendingEndGameDeclaration = {
    playerId: found.triggeredByPlayerId,
    clusterSize: found.plots.length,
    plots: found.plots,
    phase: 'mid-turn',
    lastChance: false,
    consumesDefer: false,
    deferTurnsRemaining: END_GAME_MAX_DEFER_TURNS,
  }

  return {
    endGameEligiblePlayerId: found.triggeredByPlayerId,
    endGameDeferTurnsRemaining: END_GAME_MAX_DEFER_TURNS,
    endGameDeclarationOfferedThisTurn: true,
    pendingEndGameDeclaration: pending,
    endGameTriggerLocation: triggerLocation,
  }
}

/** @deprecated Use buildEndGameEligibilityPatch — kept so older call sites compile during the rename. */
export const buildEndGameTriggerPatch = buildEndGameEligibilityPatch

export function applyFinalRoundCountdown(current: GameState): {
  gameEnded?: true
  finalRoundTurnsRemaining?: number
} {
  if (current.finalRoundTurnsRemaining === undefined) return {}
  const next = current.finalRoundTurnsRemaining - 1
  if (next <= 0) return { gameEnded: true, finalRoundTurnsRemaining: 0 }
  return { finalRoundTurnsRemaining: next }
}

export function endGameOfferEvents(prev: GameState, next: GameState): GameEvent[] {
  const pending = next.pendingEndGameDeclaration
  if (pending && !prev.pendingEndGameDeclaration) {
    const playerName =
      next.players.find((p) => p.id === pending.playerId)?.name ?? 'A founder'
    return [
      {
        type: 'end_game_offer',
        playerName,
        clusterSize: pending.clusterSize,
        lastChance: pending.lastChance,
      },
    ]
  }
  return []
}

export function maybeOfferEndGameAtEndOfTurn(state: GameState): {
  state: GameState
  events: GameEvent[]
  intercepted: boolean
} {
  if (state.endGameTriggered || state.gameEnded) {
    return { state, events: [], intercepted: false }
  }
  if (state.pendingEndGameDeclaration) {
    return { state, events: [], intercepted: false }
  }

  const finisher = state.players[state.currentPlayerIndex]
  if (!finisher) return { state, events: [], intercepted: false }

  const cluster = largestOwnedAdjacentCluster(state.plots, finisher.id)
  const has12 = !!cluster && cluster.plots.length >= END_GAME_ADJACENT_THRESHOLD

  if (state.endGameEligiblePlayerId != null && state.endGameEligiblePlayerId !== finisher.id) {
    return { state, events: [], intercepted: false }
  }

  if (!has12) {
    if (state.endGameEligiblePlayerId === finisher.id) {
      return {
        state: { ...state, ...clearEligibilityPatch() },
        events: [],
        intercepted: false,
      }
    }
    return { state, events: [], intercepted: false }
  }

  const isFirstOffer = state.endGameEligiblePlayerId == null
  if (!isFirstOffer && state.endGameDeclarationOfferedThisTurn) {
    return { state, events: [], intercepted: false }
  }

  const remaining = isFirstOffer
    ? END_GAME_MAX_DEFER_TURNS
    : (state.endGameDeferTurnsRemaining ?? END_GAME_MAX_DEFER_TURNS)

  if (!isFirstOffer && remaining <= 0) {
    return {
      state: {
        ...state,
        pendingEndGameDeclaration: undefined,
        gameEnded: true,
        winningSequence: cluster.plots,
      },
      events: [{ type: 'game_over', reason: 'endgame-deadline' }],
      intercepted: true,
    }
  }

  const lastChance = !isFirstOffer && remaining <= 1
  const pending: PendingEndGameDeclaration = {
    playerId: finisher.id,
    clusterSize: cluster.plots.length,
    plots: cluster.plots,
    phase: 'end-of-turn',
    lastChance,
    consumesDefer: !isFirstOffer,
    deferTurnsRemaining: remaining,
  }

  const next: GameState = {
    ...state,
    endGameEligiblePlayerId: finisher.id,
    endGameDeferTurnsRemaining: remaining,
    endGameDeclarationOfferedThisTurn: true,
    pendingEndGameDeclaration: pending,
  }

  return {
    state: next,
    events: endGameOfferEvents(state, next),
    intercepted: true,
  }
}
