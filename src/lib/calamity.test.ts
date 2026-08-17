import { describe, expect, it } from 'vitest'
import {
  applyCalamityRoll,
  beginCalamity,
  calamityAllowedThisRound,
  calamityLossMillion,
  calamityPostRollBannerDetail,
  CALAMITY_CARD_ID,
  CALAMITY_LOSS_PERCENT,
  CALAMITY_MIN_ROUNDS_BETWEEN,
  ingestActionDraw,
  pickCalamityVariant,
  splitCalamityDraws,
} from '@/lib/calamity'
import { applyEndTurn } from '@/lib/gameEngine/applyEndTurn'
import type { GameState, Player } from '@/lib/types'
import { createInitialBoard } from '@/lib/boardData'
import type { CardInstance } from '@/lib/cardTypes'

function mkAction(id: string, n: number): CardInstance {
  return { instanceId: `${id}-${n}`, cardId: id, cardNumber: n }
}

function mkPlayer(id: number, name: string, money: number, actions: CardInstance[] = []): Player {
  return {
    id,
    name,
    color: '#fff',
    money,
    actionCards: actions,
    propertyCards: [],
  }
}

function baseState(over: Partial<GameState> = {}): GameState {
  return {
    players: [mkPlayer(1, 'Alice', 20, [mkAction('taxation', 1)]), mkPlayer(2, 'Bob', 20)],
    plots: createInitialBoard(),
    currentPlayerIndex: 0,
    isSetupComplete: true,
    actionDeck: [mkAction('taxation', 90), mkAction('taxation', 91)],
    propertyDeck: [],
    actionDiscard: [],
    propertyDiscard: [],
    propertiesBuiltThisTurn: 0,
    actionsPlayedThisTurn: 0,
    turnActionsConsumed: 0,
    crossingTheLineActive: false,
    playRoundNumber: 1,
    ...over,
  }
}

describe('calamity stakes', () => {
  it('uses a 5% treasury step per pip', () => {
    expect(CALAMITY_LOSS_PERCENT[1]).toBe(5)
    expect(CALAMITY_LOSS_PERCENT[6]).toBe(30)
    expect(calamityLossMillion(20, 1)).toBe(1)
    expect(calamityLossMillion(20, 4)).toBe(4)
    expect(calamityLossMillion(20, 6)).toBe(6)
    expect(calamityLossMillion(3, 6)).toBe(0) // floor: 30% of 3 is 0
    expect(calamityLossMillion(0, 6)).toBe(0)
  })

  it('never takes more cash than the founder holds', () => {
    expect(calamityLossMillion(1, 6)).toBe(0)
    expect(calamityLossMillion(10, 6)).toBe(3)
  })
})

describe('calamity flavor', () => {
  it('avoids repeating a face’s variant until that face’s pool is exhausted', () => {
    const used: string[] = []
    const seen = new Set<string>()
    for (let i = 0; i < 4; i++) {
      const v = pickCalamityVariant(4, used, () => 0)
      expect(seen.has(v.key)).toBe(false)
      seen.add(v.key)
      used.push(v.key)
    }
    expect(seen.size).toBe(4)
    const repeat = pickCalamityVariant(4, used, () => 0)
    expect(seen.has(repeat.key)).toBe(true)
  })

  it('post-roll banner lists the die, percent of cash reserve lost, and the table cause', () => {
    const detail = calamityPostRollBannerDetail({
      face: 1,
      playerName: 'Alice',
      percent: 5,
      lossMillion: 1,
      variant: { key: '1-late-invoice', title: 'Late Invoice', flavor: 'A client pays 30 days late, squeezing your cash flow.' },
    })
    expect(detail).toContain('Rolled 1.')
    expect(detail).toContain('Late Invoice')
    expect(detail).toContain('5% of cash reserve lost.')
    expect(detail).toContain('A client pays 30 days late, squeezing your cash flow.')
    expect(detail).toContain('Alice loses $1M.')
  })
})

describe('calamity 6-round spacing', () => {
  it('allows the first Calamity of the game', () => {
    expect(calamityAllowedThisRound(baseState())).toBe(true)
    expect(calamityAllowedThisRound(baseState({ lastCalamityPlayRound: undefined, playRoundNumber: 1 }))).toBe(true)
  })

  it(`blocks until ${CALAMITY_MIN_ROUNDS_BETWEEN} rounds after the last fire`, () => {
    expect(calamityAllowedThisRound(baseState({ lastCalamityPlayRound: 1, playRoundNumber: 1 }))).toBe(false)
    expect(calamityAllowedThisRound(baseState({ lastCalamityPlayRound: 1, playRoundNumber: 6 }))).toBe(false)
    expect(calamityAllowedThisRound(baseState({ lastCalamityPlayRound: 1, playRoundNumber: 7 }))).toBe(true)
  })
})

describe('calamity draw intercept', () => {
  it('keeps normal cards and splits calamity out of the hand', () => {
    const drawn = [mkAction('income', 1), mkAction(CALAMITY_CARD_ID, 1), mkAction('taxation', 2)]
    const { kept, calamities } = splitCalamityDraws(drawn)
    expect(kept.map((c) => c.cardId)).toEqual(['income', 'taxation'])
    expect(calamities).toHaveLength(1)
    expect(calamities[0]?.cardId).toBe(CALAMITY_CARD_ID)
  })

  it('ingestActionDraw never puts Calamity in a hand and opens city-wide resolution', () => {
    const start = baseState()
    const drawn = [mkAction(CALAMITY_CARD_ID, 1), mkAction('income', 7)]
    const next = ingestActionDraw(start, 0, drawn, start.actionDeck, start.actionDiscard, 'append')
    expect(next.players[0].actionCards.some((c) => c.cardId === CALAMITY_CARD_ID)).toBe(false)
    expect(next.players[0].actionCards.some((c) => c.cardId === 'income')).toBe(true)
    expect(next.pendingCalamity?.drawnByPlayerId).toBe(1)
    expect(next.pendingCalamity?.rollOrderPlayerIds).toEqual([1, 2])
    expect(next.pendingCalamity?.currentRollIndex).toBe(0)
    expect(next.lastCalamityPlayRound).toBe(1)
    expect(next.pendingCalamity?.queuedInstances).toEqual([])
  })

  it('defers Calamity when the last fire was fewer than 6 rounds ago and draws a replacement', () => {
    const start = baseState({ lastCalamityPlayRound: 1, playRoundNumber: 4 })
    const drawn = [mkAction(CALAMITY_CARD_ID, 1), mkAction('income', 7)]
    const next = ingestActionDraw(start, 0, drawn, start.actionDeck, start.actionDiscard, 'append')
    expect(next.pendingCalamity).toBeUndefined()
    expect(next.lastCalamityPlayRound).toBe(1)
    expect(next.players[0].actionCards.some((c) => c.cardId === CALAMITY_CARD_ID)).toBe(false)
    expect(next.players[0].actionCards.some((c) => c.cardId === 'income')).toBe(true)
    expect(next.players[0].actionCards.some((c) => c.cardId === 'taxation')).toBe(true)
    expect(
      next.actionDeck.some((c) => c.cardId === CALAMITY_CARD_ID) ||
        next.actionDiscard.some((c) => c.cardId === CALAMITY_CARD_ID)
    ).toBe(true)
  })

  it('fires again once 6 rounds have passed', () => {
    const start = baseState({ lastCalamityPlayRound: 1, playRoundNumber: 7 })
    const drawn = [mkAction(CALAMITY_CARD_ID, 1), mkAction('income', 7)]
    const next = ingestActionDraw(start, 0, drawn, start.actionDeck, start.actionDiscard, 'append')
    expect(next.pendingCalamity?.instance.instanceId).toBe('calamity-1')
    expect(next.lastCalamityPlayRound).toBe(7)
  })

  it('fires only one Calamity from a double draw and buries the extra copy', () => {
    const start = baseState()
    const drawn = [mkAction(CALAMITY_CARD_ID, 1), mkAction(CALAMITY_CARD_ID, 2)]
    const next = ingestActionDraw(start, 0, drawn, start.actionDeck, start.actionDiscard, 'append')
    expect(next.pendingCalamity?.instance.instanceId).toBe('calamity-1')
    expect(next.pendingCalamity?.queuedInstances).toEqual([])
    expect(next.players[0].actionCards.some((c) => c.cardId === CALAMITY_CARD_ID)).toBe(false)
    expect(next.players[0].actionCards.some((c) => c.cardId === 'taxation')).toBe(true)
    expect(next.actionDeck.some((c) => c.instanceId === 'calamity-2')).toBe(true)
  })
})

describe('applyCalamityRoll', () => {
  it('charges the drawer first, then the next founder, then discards the card', () => {
    const start = beginCalamity(baseState({ players: [mkPlayer(1, 'Alice', 20), mkPlayer(2, 'Bob', 40)] }), 0, [
      mkAction(CALAMITY_CARD_ID, 1),
    ])
    const first = applyCalamityRoll(start, 2, '2-late-fee')
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.percent).toBe(10)
    expect(first.lossMillion).toBe(2)
    expect(first.state.players[0].money).toBe(18)
    expect(first.state.players[1].money).toBe(40)
    expect(first.cityWideComplete).toBe(false)

    const second = applyCalamityRoll(first.state, 6, '6-judgment')
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.percent).toBe(30)
    expect(second.lossMillion).toBe(12)
    expect(second.state.players[1].money).toBe(28)
    expect(second.cityWideComplete).toBe(true)
    expect(second.state.pendingCalamity).toBeUndefined()
    expect(second.state.actionDiscard.some((c) => c.cardId === CALAMITY_CARD_ID)).toBe(true)
  })

  it('buries leftover queued copies instead of starting a second city-wide round', () => {
    const start = beginCalamity(baseState(), 0, [mkAction(CALAMITY_CARD_ID, 1)])
    const queued = {
      ...start,
      pendingCalamity: start.pendingCalamity
        ? { ...start.pendingCalamity, queuedInstances: [mkAction(CALAMITY_CARD_ID, 2)] }
        : undefined,
    }
    const afterAlice = applyCalamityRoll(queued, 1, '1-late-invoice')
    expect(afterAlice.ok).toBe(true)
    if (!afterAlice.ok) return
    const afterBob = applyCalamityRoll(afterAlice.state, 1, '1-petty-theft')
    expect(afterBob.ok).toBe(true)
    if (!afterBob.ok) return
    expect(afterBob.cityWideComplete).toBe(true)
    expect(afterBob.state.pendingCalamity).toBeUndefined()
    expect(afterBob.state.actionDeck.some((c) => c.instanceId === 'calamity-2')).toBe(true)
  })
})

describe('applyEndTurn calamity draw', () => {
  it('plays Calamity immediately when it is the next founder’s start-of-turn draw', () => {
    const start = baseState({
      turnActionsConsumed: 3,
      actionDeck: [mkAction(CALAMITY_CARD_ID, 1), mkAction('income', 8)],
      players: [mkPlayer(1, 'Alice', 20, [mkAction('taxation', 1)]), mkPlayer(2, 'Bob', 20, [mkAction('taxation', 2)])],
    })
    const result = applyEndTurn(start, { expectedSeatIndex: 0 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.currentPlayerIndex).toBe(1)
    expect(result.state.players[1].actionCards.some((c) => c.cardId === CALAMITY_CARD_ID)).toBe(false)
    expect(result.state.pendingCalamity?.drawnByPlayerId).toBe(2)
    expect(result.state.pendingCalamity?.rollOrderPlayerIds[0]).toBe(2)
  })

  it('does not fire Calamity on a start-of-turn draw inside the 6-round gap', () => {
    const start = baseState({
      turnActionsConsumed: 3,
      lastCalamityPlayRound: 1,
      playRoundNumber: 1,
      actionDeck: [mkAction(CALAMITY_CARD_ID, 1), mkAction('income', 8)],
      players: [mkPlayer(1, 'Alice', 20, [mkAction('taxation', 1)]), mkPlayer(2, 'Bob', 20, [mkAction('taxation', 2)])],
    })
    const result = applyEndTurn(start, { expectedSeatIndex: 0 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.currentPlayerIndex).toBe(1)
    expect(result.state.pendingCalamity).toBeUndefined()
    expect(result.state.players[1].actionCards.some((c) => c.cardId === CALAMITY_CARD_ID)).toBe(false)
    expect(result.state.lastCalamityPlayRound).toBe(1)
  })
})
