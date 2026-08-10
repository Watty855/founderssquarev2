import { describe, expect, it } from 'vitest'
import { applyEndTurn } from '@/lib/gameEngine/applyEndTurn'
import { applyGameAction } from '@/lib/gameEngine/applyGameAction'
import type { GameState, Player } from '@/lib/types'
import { createInitialBoard } from '@/lib/boardData'
import { MAX_ACTION_HAND_SIZE, MAX_TURN_ACTIONS } from '@/lib/turnActions'
import type { CardInstance } from '@/lib/cardTypes'

function mkAction(i: number): CardInstance {
  return { instanceId: `a-${i}`, cardId: 'taxation', cardNumber: i }
}

function mkPlayer(id: number, name: string, actionCount: number, conn?: string): Player {
  return {
    id,
    name,
    color: '#fff',
    money: 20,
    actionCards: Array.from({ length: actionCount }, (_, i) => mkAction(id * 100 + i)),
    propertyCards: [],
    partySeatConnectionId: conn ?? null,
  }
}

function baseState(over: Partial<GameState> = {}): GameState {
  return {
    players: [mkPlayer(1, 'Alice', 9, 'alice-conn'), mkPlayer(2, 'Bob', 7, 'bob-conn')],
    plots: createInitialBoard(),
    currentPlayerIndex: 0,
    isSetupComplete: true,
    actionDeck: [mkAction(900), mkAction(901), mkAction(902), mkAction(903)],
    propertyDeck: [],
    actionDiscard: [],
    propertyDiscard: [],
    propertiesBuiltThisTurn: 0,
    actionsPlayedThisTurn: 0,
    turnActionsConsumed: MAX_TURN_ACTIONS,
    crossingTheLineActive: false,
    ...over,
  }
}

describe('applyEndTurn action-hand soft cap', () => {
  it('requires discard at end of turn when hand exceeds 8, without resetting the turn budget', () => {
    const result = applyEndTurn(baseState())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.events.some((e) => e.type === 'discard_required')).toBe(true)
    expect(result.state.awaitingEndTurnActionDiscard).toBe(true)
    expect(result.state.currentPlayerIndex).toBe(0)
    expect(result.state.turnActionsConsumed).toBe(MAX_TURN_ACTIONS)
    expect(result.state.players[0].actionCards.length).toBe(9)
  })

  it('advances and draws 2 for the next founder without forcing their discard mid-turn', () => {
    // Alice at exactly 8 — turn advances; Bob had 7 and draws 2 → 9.
    const state = baseState({
      players: [
        mkPlayer(1, 'Alice', MAX_ACTION_HAND_SIZE, 'alice-conn'),
        mkPlayer(2, 'Bob', 7, 'bob-conn'),
      ],
    })
    const result = applyEndTurn(state)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.events.some((e) => e.type === 'discard_required')).toBe(false)
    expect(result.events.some((e) => e.type === 'turn_changed')).toBe(true)
    expect(result.state.currentPlayerIndex).toBe(1)
    expect(result.state.players[1].actionCards.length).toBe(9)
    expect(result.state.awaitingEndTurnActionDiscard).toBeFalsy()
  })

  it('after discarding to 8, advances even if the next founder then exceeds 8 from draw 2', () => {
    const pending = applyEndTurn(baseState())
    expect(pending.ok).toBe(true)
    if (!pending.ok) return
    const drop = [pending.state.players[0].actionCards[0].instanceId]
    const after = applyGameAction(
      pending.state,
      { type: 'discard_action_cards', instanceIds: drop },
      { senderConnectionId: 'alice-conn' }
    )
    expect(after.ok).toBe(true)
    if (!after.ok) return
    expect(after.state.currentPlayerIndex).toBe(1)
    expect(after.state.players[1].actionCards.length).toBe(9)
    expect(after.events.some((e) => e.type === 'discard_required')).toBe(false)
    expect(after.state.awaitingEndTurnActionDiscard).toBeFalsy()
  })
})
