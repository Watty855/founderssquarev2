import { describe, expect, it } from 'vitest'
import { createInitialBoard } from '@/lib/boardData'
import { updatePlotAt } from '@/lib/boardIndex'
import { propertyCards } from '@/lib/cardData'
import { HIGH_DENSITY_HOUSING_STATS } from '@/lib/housingEconomics'
import {
  calculateFinalScores,
  sumInvestmentBookForPlayer,
  sumPlayerPropertyValue,
} from '@/lib/playerWealth'
import type { Player, Plot } from '@/lib/types'

function mkPlayer(id: number, over: Partial<Player> = {}): Player {
  return {
    id,
    name: `P${id}`,
    color: '#ef4444',
    money: 0,
    actionCards: [],
    propertyCards: [],
    ...over,
  }
}

function claim(
  plots: Plot[],
  col: string,
  row: number,
  ownerId: number,
  builtProperty: string,
  extra: Partial<Plot> = {}
): Plot[] {
  return updatePlotAt(plots, col, row, (p) => ({
    ...p,
    claimedBy: ownerId,
    builtProperty,
    ...extra,
  }))
}

describe('end-game wealth', () => {
  it('scores cash and built property, and ignores unplayed cards in hand', () => {
    let plots = createInitialBoard()
    plots = claim(plots, 'J', 6, 1, 'housing-city-1')
    const housing = propertyCards.find((c) => c.id === 'housing-city-1')
    expect(housing?.endGameValue).toBe(8)

    const player = mkPlayer(1, {
      money: 11,
      propertyCards: [{ cardId: 'housing-city-2', instanceId: 'h2', cardNumber: 1 }],
      actionCards: [{ cardId: 'investment', instanceId: 'inv1', cardNumber: 1 }],
    })
    const [score] = calculateFinalScores({ players: [player], plots })
    expect(score.cashInHand).toBe(11)
    expect(score.propertyValue).toBe(8)
    expect(score.totalScore).toBe(19)
    expect(score.propertiesOwned).toBe(1)
  })

  it('treats banked cards as cash only (exposed to Calamity), not as leftover hand value', () => {
    const plots = createInitialBoard()
    const player = mkPlayer(1, {
      money: 20,
      propertyCards: [],
      actionCards: [],
    })
    const [score] = calculateFinalScores({ players: [player], plots })
    expect(score.cashInHand).toBe(20)
    expect(score.propertyValue).toBe(0)
    expect(score.totalScore).toBe(20)
  })

  it('includes investment stripes in property value, not cash', () => {
    let plots = createInitialBoard()
    plots = claim(plots, 'J', 6, 2, 'housing-city-1')
    plots = updatePlotAt(plots, 'J', 6, (p) => ({
      ...p,
      investmentStripes: [
        { investorId: 1, contributionMillion: 4 },
        { investorId: 3, contributionMillion: 8 },
      ],
    }))

    const investor = mkPlayer(1, { money: 5 })
    const owner = mkPlayer(2, { money: 0 })
    const scores = calculateFinalScores({ players: [investor, owner], plots })
    const inv = scores.find((s) => s.player.id === 1)!
    const own = scores.find((s) => s.player.id === 2)!

    expect(sumInvestmentBookForPlayer(plots, 1)).toBe(4)
    expect(inv.cashInHand).toBe(5)
    expect(inv.propertyValue).toBe(4)
    expect(inv.totalScore).toBe(9)
    expect(own.propertyValue).toBe(8)
    expect(sumPlayerPropertyValue(plots, 2)).toBe(8)
  })

  it('uses high-density housing end-game value on built lots', () => {
    let plots = createInitialBoard()
    plots = claim(plots, 'J', 6, 1, 'housing-city-1', { housingHighDensity: true })
    const [score] = calculateFinalScores({ players: [mkPlayer(1)], plots })
    expect(score.propertyValue).toBe(HIGH_DENSITY_HOUSING_STATS.endGameValue)
  })
})
