import { describe, expect, it } from 'vitest'
import { createInitialBoard } from '@/lib/boardData'
import { selectLastBuiltToken, selectLotTurnStates } from '@/lib/selectLotTurnState'
import type { GameState, Player, Plot } from '@/lib/types'

function mkPlayer(id: number, color: string): Player {
  return {
    id,
    name: `P${id}`,
    color,
    money: 20,
    actionCards: [],
    propertyCards: [],
  }
}

function base(over: Partial<GameState> = {}): GameState {
  return {
    players: [mkPlayer(1, '#ef4444'), mkPlayer(2, '#3b82f6')],
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

function claim(plots: Plot[], col: string, row: number, playerId: number, built?: string): Plot[] {
  return plots.map((p) =>
    p.col === col && p.row === row ? { ...p, claimedBy: playerId, builtProperty: built } : p
  )
}

describe('selectLotTurnStates', () => {
  it('returns the empty singleton when no lots carry turn state', () => {
    const a = selectLotTurnStates(base())
    const b = selectLotTurnStates(base({ players: [mkPlayer(1, '#ef4444')] }))
    expect(a).toEqual([])
    expect(a).toBe(b)
  })

  it('reuses the same overlay array when only non-visual state changes', () => {
    const plots = claim(createInitialBoard(), 'F', 6, 1, 'housing')
    const gs = base({ plots })
    const first = selectLotTurnStates(gs)
    expect(first).toHaveLength(1)
    expect(first[0].key).toBe('F6')
    expect(first[0].claimColor).toBe('#ef4444')

    const moneyOnly = base({
      plots,
      players: [{ ...gs.players[0], money: 99 }, gs.players[1]],
    })
    const second = selectLotTurnStates(moneyOnly)
    expect(second).toBe(first)
    expect(second[0]).toBe(first[0])
  })

  it('rebuilds only the lot that changed when a second claim lands', () => {
    const one = claim(createInitialBoard(), 'F', 6, 1, 'housing')
    const first = selectLotTurnStates(base({ plots: one }))
    const two = claim(one, 'G', 6, 2, 'park')
    const second = selectLotTurnStates(base({ plots: two }))
    expect(second).toHaveLength(2)
    expect(second.find((s) => s.key === 'F6')).toBe(first[0])
    expect(second.find((s) => s.key === 'G6')?.claimColor).toBe('#3b82f6')
  })
})

describe('selectLastBuiltToken', () => {
  it('is stable across unrelated updates and clears after end of turn', () => {
    const plots = claim(createInitialBoard(), 'F', 6, 1, 'housing')
    const gs = base({
      plots,
      lastBuiltProperty: { row: 6, col: 'F', propertyId: 'housing', buildCost: 4 },
    })
    const a = selectLastBuiltToken(gs)
    const b = selectLastBuiltToken({ ...gs, turnActionsConsumed: 1 })
    expect(a).toEqual({ key: 'F6', color: '#ef4444' })
    expect(a).toBe(b)
    expect(selectLastBuiltToken(base({ plots }))).toBeNull()
  })
})
