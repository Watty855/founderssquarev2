import { describe, expect, it } from 'vitest'
import { ACTION_WILD_CARD_ID, actionCards } from './cardData'
import { createActionDeck } from './deckUtils'
import {
  getActionWildEmulateCards,
  isValidActionWildEmulateId,
  playedActionId,
  resolveActionPlayId,
} from './actionWildCard'

describe('Action Wild Card', () => {
  it('puts 4 copies in the action deck, banks $6M, and none of Double Income', () => {
    const deck = createActionDeck()
    expect(deck.filter((c) => c.cardId === ACTION_WILD_CARD_ID)).toHaveLength(4)
    expect(deck.filter((c) => c.cardId === 'double-income')).toHaveLength(0)
    expect(actionCards.find((c) => c.id === ACTION_WILD_CARD_ID)?.bankValue).toBe(6)
  })

  it('may copy every hand-playable action except itself and Calamity', () => {
    const ids = getActionWildEmulateCards().map((c) => c.id)
    expect(ids).toContain('income')
    expect(ids).toContain('hostile-takeover')
    expect(ids).toContain('build-with-tax-dollars')
    expect(ids).not.toContain(ACTION_WILD_CARD_ID)
    expect(ids).not.toContain('calamity')
    expect(ids).not.toContain('double-income')
  })

  it('resolves play identity from the chosen emulate id', () => {
    expect(resolveActionPlayId('income')).toBe('income')
    expect(resolveActionPlayId(ACTION_WILD_CARD_ID, 'rezoning')).toBe('rezoning')
    expect(playedActionId(ACTION_WILD_CARD_ID, 'income')).toBe('income')
    expect(isValidActionWildEmulateId('calamity')).toBe(false)
    expect(resolveActionPlayId(ACTION_WILD_CARD_ID, 'calamity')).toBe(ACTION_WILD_CARD_ID)
  })
})
