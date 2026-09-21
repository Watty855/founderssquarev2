import { describe, expect, it } from 'vitest'
import { attachUndoSnapshotIfTurnAction } from '@/lib/undoLastAction'
import { createInitialBoard } from '@/lib/boardData'
import type { GameState, Player } from '@/lib/types'
import type { CardInstance } from '@/lib/cardTypes'

function mkPlayer(over: Partial<Player> = {}): Player {
  return {
    id: 1,
    name: 'Alice',
    color: '#ef4444',
    money: 20,
    actionCards: [],
    propertyCards: [],
    ...over,
  }
}

function base(over: Partial<GameState> = {}): GameState {
  return {
    players: [mkPlayer()],
    plots: createInitialBoard(),
    currentPlayerIndex: 0,
    isSetupComplete: true,
    actionDeck: [],
    propertyDeck: [],
    actionDiscard: [],
    propertyDiscard: [],
    propertiesBuiltThisTurn: 0,
    actionsPlayedThisTurn: 0,
    turnActionsConsumed: 0,
    crossingTheLineActive: false,
    ...over,
  }
}

function card(id: string, n = 1): CardInstance {
  return { instanceId: `${id}-${n}`, cardId: id, cardNumber: n }
}

describe('undo after dice-determined actions', () => {
  it('does not attach undo after Income is resolved', () => {
    const before = base({ turnActionsConsumed: 0 })
    const after = base({
      turnActionsConsumed: 1,
      incomeResolvedThisTurn: true,
      actionDiscard: [card('income')],
    })
    const next = attachUndoSnapshotIfTurnAction(before, after)
    expect(next.undoLastAction).toBeUndefined()
  })

  it('does not attach undo after a rezoning build that spent the dice card', () => {
    const before = base({ turnActionsConsumed: 0 })
    const after = base({
      turnActionsConsumed: 2,
      actionDiscard: [card('rezoning')],
      lastBuiltProperty: { row: 6, col: 'F', propertyId: 'housing', buildCost: 4 },
    })
    const next = attachUndoSnapshotIfTurnAction(before, after)
    expect(next.undoLastAction).toBeUndefined()
  })

  it('does not attach undo after Hostile Takeover is discarded from a roll', () => {
    const before = base({ turnActionsConsumed: 0 })
    const after = base({
      turnActionsConsumed: 1,
      actionDiscard: [card('hostile-takeover')],
    })
    const next = attachUndoSnapshotIfTurnAction(before, after)
    expect(next.undoLastAction).toBeUndefined()
  })

  it('attaches undo after Freeze Assets so the $8M fee and freeze list restore', () => {
    const before = base({
      turnActionsConsumed: 0,
      incomeAssetsFrozenPlayerIds: [],
      players: [mkPlayer({ money: 20, actionCards: [card('freeze-assets')] })],
    })
    const after = base({
      turnActionsConsumed: 1,
      incomeAssetsFrozenPlayerIds: [1, 2, 3],
      incomeAssetsFrozenTurnsRemaining: 3,
      actionDiscard: [card('freeze-assets')],
      players: [mkPlayer({ money: 12, actionCards: [] })],
    })
    const next = attachUndoSnapshotIfTurnAction(before, after)
    expect(next.undoLastAction).toBeDefined()
    expect(next.undoLastAction?.label).toBe('Play Freeze Assets')
    expect(next.undoLastAction?.snapshot.players[0].money).toBe(20)
    expect(next.undoLastAction?.snapshot.incomeAssetsFrozenPlayerIds).toEqual([])
  })

  it('still attaches undo for a normal build with no dice card', () => {
    const before = base({ turnActionsConsumed: 0 })
    const after = base({
      turnActionsConsumed: 1,
      lastBuiltProperty: { row: 6, col: 'F', propertyId: 'housing', buildCost: 4 },
    })
    const next = attachUndoSnapshotIfTurnAction(before, after)
    expect(next.undoLastAction).toBeDefined()
    expect(next.undoLastAction?.label).toContain('Build')
  })
})
