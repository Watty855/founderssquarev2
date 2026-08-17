import { describe, expect, it } from 'vitest'
import { applyIncomeComplete } from '@/lib/gameEngine/applyIncomeComplete'
import type { GameState, Player } from '@/lib/types'
import { createInitialBoard } from '@/lib/boardData'
import { updatePlotAt } from '@/lib/boardIndex'

function mkPlayer(id: number, over: Partial<Player> = {}): Player {
  return {
    id,
    name: id === 0 ? 'Host' : 'Founderbot 1',
    color: '#0f0',
    money: 10,
    isAi: id !== 0,
    aiDifficulty: id !== 0 ? 'normal' : undefined,
    actionCards:
      id === 1
        ? [{ instanceId: 'inc-1', cardId: 'income', cardNumber: 1 }]
        : [],
    propertyCards: [],
    ...over,
  }
}

function baseState(): GameState {
  const plots = updatePlotAt(createInitialBoard(), 'B', 2, (p) => ({
    ...p,
    type: 'city',
    claimedBy: 1,
    builtProperty: 'church',
  }))
  return {
    players: [mkPlayer(0), mkPlayer(1)],
    plots,
    currentPlayerIndex: 1,
    isSetupComplete: true,
    actionDeck: [],
    propertyDeck: [],
    actionDiscard: [],
    propertyDiscard: [],
    propertiesBuiltThisTurn: 0,
    actionsPlayedThisTurn: 0,
    turnActionsConsumed: 0,
    crossingTheLineActive: false,
  }
}

describe('applyIncomeComplete', () => {
  it('collects once, spends the Income card, and blocks a second resolve', () => {
    const start = baseState()
    const first = applyIncomeComplete(start, {
      incomeInstanceId: 'inc-1',
      earnedIncome: 8,
      totalPropertyIncomeBase: 8,
      incomeResolution: 'property-roll',
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.state.incomeResolvedThisTurn).toBe(true)
    expect(first.state.players[1].money).toBe(18)
    // Empty hand is refilled from discard, so the same Income card may return —
    // a second resolve this turn must still be rejected.
    const second = applyIncomeComplete(first.state, {
      incomeInstanceId: first.state.players[1].actionCards.find((c) => c.cardId === 'income')?.instanceId ?? 'inc-1',
      earnedIncome: 8,
      totalPropertyIncomeBase: 8,
      incomeResolution: 'property-roll',
    })
    expect(second.ok).toBe(false)
    expect(first.state.players[1].money).toBe(18)
  })
})
