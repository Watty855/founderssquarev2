import { describe, expect, it } from 'vitest'
import { applyEndTurn } from '@/lib/gameEngine/applyEndTurn'
import { applyIncomeComplete } from '@/lib/gameEngine/applyIncomeComplete'
import { createInitialBoard } from '@/lib/boardData'
import { updatePlotAt } from '@/lib/boardIndex'
import {
  applyFreezeAssetsForRound,
  canRollPropertyIncome,
  FREEZE_ASSETS_CARD_ID,
  FREEZE_ASSETS_LEGAL_ACTION,
  FREEZE_ASSETS_PLAY_COST,
  isFinalRoundIncomeLocked,
  isIncomeFreezeActive,
  isPlayerIncomeFrozen,
  omitFrozenRecipientAmounts,
  tickIncomeFreezeOnEndTurn,
} from '@/lib/freezeAssets'
import { actionCards } from '@/lib/cardData'
import type { GameState, Player } from '@/lib/types'

function mkPlayer(id: number, over: Partial<Player> = {}): Player {
  return {
    id,
    name: `P${id}`,
    color: '#fff',
    money: 20,
    actionCards: id === 1 ? [{ instanceId: 'inc-1', cardId: 'income', cardNumber: 1 }] : [],
    propertyCards: [],
    ...over,
  }
}

function baseState(over: Partial<GameState> = {}): GameState {
  const plots = updatePlotAt(createInitialBoard(), 'B', 2, (p) => ({
    ...p,
    claimedBy: 1,
    builtProperty: 'housing-city-1',
    investmentStripes: [{ investorId: 2, contributionMillion: 4 }],
  }))
  return {
    players: [mkPlayer(1), mkPlayer(2), mkPlayer(3)],
    plots,
    currentPlayerIndex: 0,
    isSetupComplete: true,
    actionDeck: Array.from({ length: 12 }, (_, i) => ({
      instanceId: `d${i}`,
      cardId: 'taxation',
      cardNumber: i + 1,
    })),
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

describe('Freeze Assets', () => {
  it('costs $8M to play and banks $5M as a legal action', () => {
    expect(FREEZE_ASSETS_PLAY_COST).toBe(8)
    const card = actionCards.find((c) => c.id === FREEZE_ASSETS_CARD_ID)
    expect(card?.bankValue).toBe(5)
    expect(card?.copies).toBe(4)
    expect(card?.diceRequired).toBe(false)
    expect(card?.category).toBe('legal')
    expect(card?.description).toBe(FREEZE_ASSETS_LEGAL_ACTION)
  })

  it('freezes every founder including the player who paid, for one seat per player', () => {
    const freeze = applyFreezeAssetsForRound([1, 2, 3])
    expect(freeze.incomeAssetsFrozenPlayerIds.sort()).toEqual([1, 2, 3])
    expect(freeze.incomeAssetsFrozenTurnsRemaining).toBe(3)
    const state = {
      incomeAssetsFrozenPlayerIds: freeze.incomeAssetsFrozenPlayerIds,
      incomeAssetsFrozenTurnsRemaining: freeze.incomeAssetsFrozenTurnsRemaining,
    }
    expect(isIncomeFreezeActive(state)).toBe(true)
    expect(isPlayerIncomeFrozen(state, 1)).toBe(true)
    expect(isPlayerIncomeFrozen(state, 2)).toBe(true)
  })

  it('blocks property-income rolls for the caster while frozen, but banking still works', () => {
    const freeze = applyFreezeAssetsForRound([1, 2, 3])
    const frozen = baseState(freeze)
    expect(canRollPropertyIncome(frozen, 1)).toBe(false)
    const rolled = applyIncomeComplete(frozen, {
      incomeInstanceId: 'inc-1',
      earnedIncome: 8,
      totalPropertyIncomeBase: 8,
      incomeResolution: 'property-roll',
    })
    expect(rolled.ok).toBe(false)
    if (!rolled.ok) expect(rolled.code).toBe('income_frozen')

    const banked = applyIncomeComplete(frozen, {
      incomeInstanceId: 'inc-1',
      earnedIncome: 4,
      totalPropertyIncomeBase: 8,
      incomeResolution: 'bank-income-card',
    })
    expect(banked.ok).toBe(true)
    if (!banked.ok) return
    expect(banked.state.players[0].money).toBe(24)
  })

  it('lifts after one complete round of seat advances', () => {
    const freeze = applyFreezeAssetsForRound([1, 2, 3])
    let state = baseState({
      ...freeze,
      turnActionsConsumed: 3,
    })
    for (let i = 0; i < 2; i++) {
      const ended = applyEndTurn({ ...state, turnActionsConsumed: 3 })
      expect(ended.ok).toBe(true)
      if (!ended.ok) return
      state = ended.state
      expect(isIncomeFreezeActive(state)).toBe(true)
    }
    const last = applyEndTurn({ ...state, turnActionsConsumed: 3 })
    expect(last.ok).toBe(true)
    if (!last.ok) return
    expect(isIncomeFreezeActive(last.state)).toBe(false)
    expect(last.state.incomeAssetsFrozenPlayerIds).toEqual([])
  })

  it('ticks remaining down on end turn', () => {
    const after = tickIncomeFreezeOnEndTurn({
      incomeAssetsFrozenPlayerIds: [1, 2, 3],
      incomeAssetsFrozenTurnsRemaining: 1,
    })
    expect(after.incomeAssetsFrozenTurnsRemaining).toBeUndefined()
    expect(after.incomeAssetsFrozenPlayerIds).toEqual([])
  })

  it('locks property-income rolls after the endgame is declared', () => {
    const final = baseState({ endGameTriggered: true, finalRoundTurnsRemaining: 4 })
    expect(isFinalRoundIncomeLocked(final)).toBe(true)
    expect(canRollPropertyIncome(final, 1)).toBe(false)
    const rolled = applyIncomeComplete(final, {
      incomeInstanceId: 'inc-1',
      earnedIncome: 8,
      totalPropertyIncomeBase: 8,
      incomeResolution: 'property-roll',
    })
    expect(rolled.ok).toBe(false)
    if (!rolled.ok) expect(rolled.code).toBe('final_round_income_lock')
  })

  it('omits frozen recipients from payout maps', () => {
    expect(
      omitFrozenRecipientAmounts(
        { 2: 4, 3: 1 },
        { incomeAssetsFrozenTurnsRemaining: 2, incomeAssetsFrozenPlayerIds: [1, 2, 3] }
      )
    ).toEqual({})
  })
})
