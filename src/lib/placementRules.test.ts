import { describe, expect, it } from 'vitest'
import { canPlaceProperty, getVacantCityLotsForRezoning, getValidPlotsForProperty } from '@/lib/placementRules'
import { createInitialBoard } from '@/lib/boardData'
import { propertyCards } from '@/lib/cardData'
import type { PropertyCard } from '@/lib/cardTypes'
import { buildPlotIndex, getPlotAt } from '@/lib/boardIndex'

describe('placementRules', () => {
  it('rejects builds on occupied city lots', () => {
    const plots = createInitialBoard()
    const index = buildPlotIndex(plots)
    const lot = getPlotAt(plots, 'B', 2, index)
    expect(lot).toBeTruthy()
    if (!lot) return
    const housing = propertyCards.find((c) => c.type === 'property') as PropertyCard
    lot.builtProperty = housing.id
    lot.claimedBy = 1
    expect(canPlaceProperty(housing, lot, plots, false)).toBe(false)
  })

  it('returns vacant rezoning lots that are not anchors', () => {
    const plots = createInitialBoard()
    const vacant = getVacantCityLotsForRezoning(plots)
    expect(vacant.length).toBeGreaterThan(0)
    expect(vacant.every((p) => !p.builtProperty && p.lotCategory !== 'AT')).toBe(true)
  })

  it('indexes board coordinates for O(1) lookup', () => {
    const plots = createInitialBoard()
    const index = buildPlotIndex(plots)
    expect(index.size).toBe(plots.length)
    const p = getPlotAt(plots, 'K', 11, index)
    expect(p?.col).toBe('K')
    expect(p?.row).toBe(11)
  })

  it('getValidPlotsForProperty only returns city lots matching the card', () => {
    const plots = createInitialBoard()
    const sample =
      (propertyCards.find((c) => c.type === 'property' && c.category !== 'civic') as PropertyCard) ??
      null
    if (!sample) return
    const valid = getValidPlotsForProperty(sample, plots, true)
    expect(valid.every((p) => p.type === 'city' && !p.builtProperty)).toBe(true)
  })
})
