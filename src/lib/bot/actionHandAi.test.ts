import { describe, expect, it } from 'vitest'
import type { Player } from '@/lib/types'
import {
  actionCardKeepScore,
  pickAiActionCardDiscardIds,
  pickAiActionCardsToBank,
} from '@/lib/bot/simpleAiTurn'

function mkPlayer(actionCards: Array<{ instanceId: string; cardId: string }>): Player {
  return {
    id: 2,
    name: 'Founderbot',
    color: '#0f0',
    money: 10,
    actionCards: actionCards.map((c, i) => ({
      instanceId: c.instanceId,
      cardId: c.cardId,
      cardNumber: i + 1,
    })),
    propertyCards: [],
    isAi: true,
  }
}

describe('AI action-hand discard / bank', () => {
  it('discards Draw 2 before Income when trimming to the soft cap', () => {
    const cp = mkPlayer([
      { instanceId: 'a1', cardId: 'income' },
      { instanceId: 'a2', cardId: 'draw-2-action-cards' },
      { instanceId: 'a3', cardId: 'investment' },
      { instanceId: 'a4', cardId: 'draw-2-action-cards' },
      { instanceId: 'a5', cardId: 'double-income' },
      { instanceId: 'a6', cardId: 'taxation' },
      { instanceId: 'a7', cardId: 'rezoning' },
      { instanceId: 'a8', cardId: 'crossing-the-line' },
      { instanceId: 'a9', cardId: 'roll-die' },
    ])
    const ids = pickAiActionCardDiscardIds(cp, 1)
    expect(ids).toHaveLength(1)
    expect(ids[0]).toMatch(/^a[24]$/) // one of the Draw 2s preferred over Income/Investment
    expect(actionCardKeepScore('draw-2-action-cards')).toBeLessThan(actionCardKeepScore('income'))
  })

  it('returns exactly discardCount ids and never more than the hand', () => {
    const cp = mkPlayer([
      { instanceId: 'x1', cardId: 'income' },
      { instanceId: 'x2', cardId: 'draw-2-action-cards' },
    ])
    expect(pickAiActionCardDiscardIds(cp, 5)).toHaveLength(2)
    expect(pickAiActionCardDiscardIds(cp, 0)).toEqual([])
  })

  it('banks low-keep cards for cash and never banks Income', () => {
    const cp = mkPlayer([
      { instanceId: 'b1', cardId: 'income' },
      { instanceId: 'b2', cardId: 'draw-2-action-cards' },
      { instanceId: 'b3', cardId: 'taxation' },
    ])
    const banked = pickAiActionCardsToBank(cp, 2)
    expect(banked).not.toContain('b1')
    expect(banked.length).toBeGreaterThan(0)
    expect(banked[0]).toBe('b2')
  })
})
