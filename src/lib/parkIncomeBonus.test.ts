import { describe, expect, it } from 'vitest'
import { createInitialBoard } from '@/lib/boardData'
import { getParkIncomeBonusForPlayer } from '@/lib/utils'
import { propertyCards } from '@/lib/cardData'
import type { Plot } from '@/lib/types'
import { updatePlotAt } from '@/lib/boardIndex'

function claim(
  plots: Plot[],
  row: number,
  col: string,
  ownerId: number,
  builtProperty: string
): Plot[] {
  return updatePlotAt(plots, col, row, (p) => ({
    ...p,
    claimedBy: ownerId,
    builtProperty,
  }))
}

describe('Food, Grocery, and Park card influence', () => {
  it('prints 0 influence on Food (dining and grocery) and Park cards', () => {
    const food = propertyCards.filter((c) => c.name === 'Food')
    const parks = propertyCards.filter((c) => c.name === 'Park')
    expect(food.length).toBeGreaterThan(0)
    expect(parks.length).toBeGreaterThan(0)
    expect(food.every((c) => c.influence === 0)).toBe(true)
    expect(parks.every((c) => c.influence === 0)).toBe(true)
  })
})

describe('Park income bonus', () => {
  // K4 is a Park lot in the J2–L4 city block (between streets I/M and rows 2–4).
  it('adds +$1M to surrounding income lots on the same city block, not the Park itself', () => {
    let plots = createInitialBoard()
    plots = claim(plots, 4, 'K', 1, 'park-city-1')
    plots = claim(plots, 2, 'J', 1, 'food-city-1')
    plots = claim(plots, 4, 'L', 1, 'housing-city-1')
    expect(getParkIncomeBonusForPlayer(1, plots).bonus).toBe(2)
    expect(getParkIncomeBonusForPlayer(1, plots).sourceLabels).toEqual(['K4'])
  })

  it('buffs rival income lots on the same block, but not the Park or lots in another block', () => {
    let plots = createInitialBoard()
    plots = claim(plots, 4, 'K', 1, 'park-city-1')
    plots = claim(plots, 2, 'J', 1, 'food-city-1')
    plots = claim(plots, 4, 'L', 2, 'housing-city-1')
    plots = claim(plots, 18, 'B', 1, 'food-farm-1')
    expect(getParkIncomeBonusForPlayer(1, plots).bonus).toBe(1)
    expect(getParkIncomeBonusForPlayer(2, plots).bonus).toBe(1)
    expect(getParkIncomeBonusForPlayer(2, plots).sourceLabels).toEqual(['K4'])
  })

  it('grants no bonus when the owner has only the Park on that block', () => {
    let plots = createInitialBoard()
    plots = claim(plots, 4, 'K', 1, 'park-city-1')
    expect(getParkIncomeBonusForPlayer(1, plots).bonus).toBe(0)
    expect(getParkIncomeBonusForPlayer(1, plots).sourceLabels).toEqual([])
  })
})
