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
  it('requires discard after all 3 actions when hand exceeds 8', () => {
    const result = applyEndTurn(baseState())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.events.some((e) => e.type === 'discard_required')).toBe(true)
    expect(result.state.awaitingEndTurnActionDiscard).toBe(true)
    expect(result.state.currentPlayerIndex).toBe(0)
    expect(result.state.turnActionsConsumed).toBe(MAX_TURN_ACTIONS)
    expect(result.state.players[0].actionCards.length).toBe(9)
  })

  it('does not force discard when a stale end_turn hits a founder who just drew 2 at turn start', () => {
    // Bob begins the turn over the soft cap (start-of-turn draw 2) with 0 actions used.
    const bobTurn = baseState({
      players: [
        mkPlayer(1, 'Alice', 5, 'alice-conn'),
        mkPlayer(2, 'Bob', 10, 'bob-conn'),
      ],
      currentPlayerIndex: 1,
      turnActionsConsumed: 0,
      showNewCardsAnimation: true,
      newCardsDrawn: [mkAction(901), mkAction(902)],
    })
    const result = applyEndTurn(bobTurn)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.events).toEqual([])
    expect(result.state).toBe(bobTurn)
    expect(result.state.awaitingEndTurnActionDiscard).toBeFalsy()
    expect(result.state.players[1].actionCards.length).toBe(10)
    expect(result.state.turnActionsConsumed).toBe(0)
  })

  it('refuses early End Turn while over the soft cap before 3 actions are spent', () => {
    const midTurn = baseState({
      turnActionsConsumed: 1,
      awaitingEndTurnActionDiscard: undefined,
    })
    const result = applyEndTurn(midTurn)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('hand_cap_after_actions')
  })

  it('advances and draws 2 for the next founder without forcing their discard', () => {
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
    expect(result.state.turnActionsConsumed).toBe(0)

    // A second end_turn (stale auto-end) must not open discard on Bob.
    const stale = applyEndTurn(result.state)
    expect(stale.ok).toBe(true)
    if (!stale.ok) return
    expect(stale.events.some((e) => e.type === 'discard_required')).toBe(false)
    expect(stale.state.currentPlayerIndex).toBe(1)
    expect(stale.state.players[1].actionCards.length).toBe(9)
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

  it('rejects discard_action_cards before the 3-action budget is spent', () => {
    const midTurn = baseState({
      turnActionsConsumed: 2,
      awaitingEndTurnActionDiscard: undefined,
    })
    const drop = [midTurn.players[0].actionCards[0].instanceId]
    const after = applyGameAction(
      midTurn,
      { type: 'discard_action_cards', instanceIds: drop },
      { senderConnectionId: 'alice-conn' }
    )
    expect(after.ok).toBe(false)
    if (after.ok) return
    expect(after.code).toBe('discard_too_early')
  })
})
