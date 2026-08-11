import { describe, expect, it } from 'vitest'
import { createInitialBoard } from '@/lib/boardData'
import {
  getAnchorInfluenceForAction,
  getBlockPresenceInfluenceBonus,
  getStreetOppositeInfluenceBonus,
  getUnionIncomeBonusForOwner,
  getUnionIncomePenaltyForPlayer,
} from '@/lib/utils'
import { canPlaceProperty } from '@/lib/placementRules'
import { propertyCards } from '@/lib/cardData'
import type { PropertyCard } from '@/lib/cardTypes'
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

const unionCard = propertyCards.find((c) => c.id === 'union') as PropertyCard

describe('Union placement and influence scopes', () => {
  it('labels former Union lots as Anchor Tenet', () => {
    const board = createInitialBoard()
    for (const key of [
      { col: 'C', row: 11 },
      { col: 'K', row: 3 },
      { col: 'S', row: 11 },
      { col: 'K', row: 19 },
    ]) {
      const plot = board.find((p) => p.col === key.col && p.row === key.row)
      expect(plot?.building).toBe('Anchor Tenet')
      expect(plot?.isAnchor).toBe(true)
      expect(plot?.lotCategory).toBe('AT')
    }
  })

  it('allows Union on any vacant Anchor Tenet lot', () => {
    const board = createInitialBoard()
    const g7 = board.find((p) => p.col === 'G' && p.row === 7)!
    const k19 = board.find((p) => p.col === 'K' && p.row === 19)!
    expect(canPlaceProperty(unionCard, g7, board)).toBe(true)
    expect(canPlaceProperty(unionCard, k19, board)).toBe(true)
  })

  it('scopes Union income to the Union’s city block (not the whole district)', () => {
    // K19 Union: B18 is Farmland district but a different city block — no income bonus.
    let plots = createInitialBoard()
    plots = claim(plots, 19, 'K', 1, 'union')
    plots = claim(plots, 18, 'B', 1, 'retail-farmland')
    expect(getUnionIncomeBonusForOwner(1, plots).bonus).toBe(0)

    // Same block as K19 (J18–L20): J18 shares the Farmland AT block around K19.
    plots = claim(plots, 18, 'J', 1, 'retail-farmland')
    expect(getUnionIncomeBonusForOwner(1, plots).bonus).toBeGreaterThanOrEqual(1)

    plots = claim(plots, 20, 'J', 2, 'retail-farmland')
    expect(getUnionIncomePenaltyForPlayer(2, plots).penalty).toBeGreaterThanOrEqual(1)
  })

  it('keeps Union action influence district-scoped and stacking', () => {
    let plots = createInitialBoard()
    plots = claim(plots, 7, 'G', 1, 'church')
    plots = claim(plots, 15, 'G', 1, 'church')
    plots = claim(plots, 19, 'K', 1, 'union')

    const result = getAnchorInfluenceForAction(1, plots, 'takeover', 18, 'B')
    expect(result.labels.filter((l) => l.startsWith('Church')).length).toBe(2)
    expect(result.labels.filter((l) => l.startsWith('Union')).length).toBe(1)
  })
})

describe('community pressure influence', () => {
  it('grants +1 for 5+ owned properties in the target city block', () => {
    let plots = createInitialBoard()
    const cells: Array<[number, string]> = [
      [6, 'F'],
      [6, 'G'],
      [6, 'H'],
      [7, 'F'],
      [8, 'F'],
    ]
    for (const [row, col] of cells) {
      plots = claim(plots, row, col, 1, 'retail-city-center')
    }
    expect(getBlockPresenceInfluenceBonus(1, plots, 6, 'H').bonus).toBe(1)
    expect(
      getAnchorInfluenceForAction(1, plots, 'takeover', 6, 'H').labels.some((l) =>
        l.includes('block presence')
      )
    ).toBe(true)
  })

  it('grants +1 when targeting a lot opposite six sequential lots along a street', () => {
    let plots = createInitialBoard()
    for (const col of ['B', 'C', 'D', 'F', 'G', 'H'] as const) {
      plots = claim(plots, 4, col, 1, 'retail-city-center')
    }
    expect(getStreetOppositeInfluenceBonus(1, plots, 6, 'B').bonus).toBe(1)
    expect(getStreetOppositeInfluenceBonus(1, plots, 6, 'T').bonus).toBe(0)
  })
})
