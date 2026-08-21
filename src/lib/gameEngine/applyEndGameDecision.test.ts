import { describe, expect, it } from 'vitest'
import { applyEndTurn } from '@/lib/gameEngine/applyEndTurn'
import { applyEndGameDecision } from '@/lib/gameEngine/applyEndGameDecision'
import { buildEndGameEligibilityPatch } from '@/lib/gameEngine/statePatches'
import { applyGameAction } from '@/lib/gameEngine/applyGameAction'
import type { GameState, Player } from '@/lib/types'
import { createInitialBoard } from '@/lib/boardData'
import { updatePlotAt } from '@/lib/boardIndex'
import { MAX_TURN_ACTIONS } from '@/lib/turnActions'
import { END_GAME_MAX_DEFER_TURNS } from '@/lib/utils'

function mkPlayer(id: number, name: string, conn?: string): Player {
  return {
    id,
    name,
    color: '#fff',
    money: 20,
    actionCards: [],
    propertyCards: [],
    partySeatConnectionId: conn ?? null,
  }
}

function buildFor(state: GameState, ownerId: number, row: number, col: string): GameState {
  return {
    ...state,
    plots: updatePlotAt(state.plots, col, row, (plot) => ({
      ...plot,
      claimedBy: ownerId,
      builtProperty: plot.isAnchor ? 'church' : 'housing',
    })),
  }
}

/** 12 adjacent lots for player 1: 3×3 block B2–D4 + F2 G2 H2 across street E. */
function withTwelveAdjacent(state: GameState, ownerId = 1): GameState {
  let next = state
  for (const row of [2, 3, 4]) {
    for (const col of ['B', 'C', 'D']) next = buildFor(next, ownerId, row, col)
  }
  for (const col of ['F', 'G', 'H']) next = buildFor(next, ownerId, 2, col)
  return next
}

function baseState(over: Partial<GameState> = {}): GameState {
  return {
    players: [mkPlayer(1, 'Alice', 'alice-conn'), mkPlayer(2, 'Bob', 'bob-conn')],
    plots: createInitialBoard(),
    currentPlayerIndex: 0,
    isSetupComplete: true,
    actionDeck: [],
    propertyDeck: [],
    actionDiscard: [],
    propertyDiscard: [],
    propertiesBuiltThisTurn: 0,
    actionsPlayedThisTurn: 0,
    turnActionsConsumed: 1,
    crossingTheLineActive: false,
    ...over,
  }
}

describe('endgame declaration', () => {
  it('offers a mid-turn prompt instead of starting the Final Round', () => {
    const withLots = withTwelveAdjacent(baseState())
    const patch = buildEndGameEligibilityPatch(baseState(), withLots.plots, { row: 2, col: 'H' })
    expect(patch.pendingEndGameDeclaration?.playerId).toBe(1)
    expect(patch.pendingEndGameDeclaration?.clusterSize).toBeGreaterThanOrEqual(12)
    expect(patch.endGameTriggered).toBeUndefined()
    expect(patch.endGameDeferTurnsRemaining).toBe(END_GAME_MAX_DEFER_TURNS)
  })

  it('declaring starts the Final Round so every founder including the declarer gets one more turn', () => {
    const withLots = withTwelveAdjacent(baseState())
    const patch = buildEndGameEligibilityPatch(baseState(), withLots.plots, { row: 2, col: 'H' })
    const pending = { ...withLots, ...patch } as GameState
    const result = applyEndGameDecision(pending, true)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.endGameTriggered).toBe(true)
    expect(result.state.pendingEndGameDeclaration).toBeUndefined()
    expect(result.state.finalRoundTurnsRemaining).toBe(pending.players.length + 1)
  })

  it('continuing mid-turn leaves play open with 4 additional turns remaining', () => {
    const withLots = withTwelveAdjacent(baseState())
    const patch = buildEndGameEligibilityPatch(baseState(), withLots.plots, { row: 2, col: 'H' })
    const pending = { ...withLots, ...patch } as GameState
    const result = applyEndGameDecision(pending, false)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.endGameTriggered).toBeFalsy()
    expect(result.state.gameEnded).toBeFalsy()
    expect(result.state.pendingEndGameDeclaration).toBeUndefined()
    expect(result.state.endGameDeferTurnsRemaining).toBe(END_GAME_MAX_DEFER_TURNS)
    expect(result.state.currentPlayerIndex).toBe(0)
  })

  it('end of a later turn re-offers the declaration before advancing', () => {
    const withLots = withTwelveAdjacent(
      baseState({
        endGameEligiblePlayerId: 1,
        endGameDeferTurnsRemaining: 4,
        turnActionsConsumed: MAX_TURN_ACTIONS,
      })
    )
    const ended = applyEndTurn(withLots)
    expect(ended.ok).toBe(true)
    if (!ended.ok) return
    expect(ended.state.pendingEndGameDeclaration?.phase).toBe('end-of-turn')
    expect(ended.state.pendingEndGameDeclaration?.consumesDefer).toBe(true)
    expect(ended.state.currentPlayerIndex).toBe(0)
    expect(ended.events.some((e) => e.type === 'end_game_offer')).toBe(true)
  })

  it('continuing an end-of-turn offer spends one defer and advances the seat', () => {
    const withLots = withTwelveAdjacent(
      baseState({
        endGameEligiblePlayerId: 1,
        endGameDeferTurnsRemaining: 4,
        turnActionsConsumed: MAX_TURN_ACTIONS,
      })
    )
    const offered = applyEndTurn(withLots)
    expect(offered.ok).toBe(true)
    if (!offered.ok) return
    const continued = applyEndGameDecision(offered.state, false)
    expect(continued.ok).toBe(true)
    if (!continued.ok) return
    expect(continued.state.endGameDeferTurnsRemaining).toBe(3)
    expect(continued.state.currentPlayerIndex).toBe(1)
    expect(continued.state.pendingEndGameDeclaration).toBeUndefined()
  })

  it('the fourth additional turn continue ends the game immediately', () => {
    const withLots = withTwelveAdjacent(
      baseState({
        endGameEligiblePlayerId: 1,
        endGameDeferTurnsRemaining: 1,
        turnActionsConsumed: MAX_TURN_ACTIONS,
      })
    )
    const offered = applyEndTurn(withLots)
    expect(offered.ok).toBe(true)
    if (!offered.ok) return
    expect(offered.state.pendingEndGameDeclaration?.lastChance).toBe(true)
    const continued = applyEndGameDecision(offered.state, false)
    expect(continued.ok).toBe(true)
    if (!continued.ok) return
    expect(continued.state.gameEnded).toBe(true)
    expect(continued.state.endGameTriggered).toBeFalsy()
    expect(continued.events.some((e) => e.type === 'game_over' && e.reason === 'endgame-deadline')).toBe(
      true
    )
  })

  it('declaring on the last chance still grants one more round each', () => {
    const withLots = withTwelveAdjacent(
      baseState({
        endGameEligiblePlayerId: 1,
        endGameDeferTurnsRemaining: 1,
        turnActionsConsumed: MAX_TURN_ACTIONS,
      })
    )
    const offered = applyEndTurn(withLots)
    expect(offered.ok).toBe(true)
    if (!offered.ok) return
    const declared = applyEndGameDecision(offered.state, true)
    expect(declared.ok).toBe(true)
    if (!declared.ok) return
    expect(declared.state.endGameTriggered).toBe(true)
    expect(declared.state.gameEnded).toBeFalsy()
    expect(declared.state.currentPlayerIndex).toBe(1)
  })

  it('online end_game_decision is rejected for the other founder', () => {
    const withLots = withTwelveAdjacent(baseState())
    const patch = buildEndGameEligibilityPatch(baseState(), withLots.plots, { row: 2, col: 'H' })
    const pending = { ...withLots, ...patch } as GameState
    const result = applyGameAction(pending, { type: 'end_game_decision', declare: true }, {
      senderConnectionId: 'bob-conn',
    })
    expect(result.ok).toBe(false)
  })
})
