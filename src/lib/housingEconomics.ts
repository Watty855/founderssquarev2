import type { Plot } from './types'
import type { PropertyCard } from './cardTypes'
import { plotsShareAnyDistrict } from './districts'

/** Stats when player builds housing with more than four stories (high density). */
export const HIGH_DENSITY_HOUSING_STATS = {
  buildCost: 18,
  buildIncome: 10,
  endGameValue: 18,
} as const

export function isHousingPropertyCard(card: PropertyCard): boolean {
  return card.name === 'Housing'
}

export function getHousingBuildCost(card: PropertyCard, highDensity: boolean): number {
  if (!isHousingPropertyCard(card)) return card.buildCost
  return highDensity ? HIGH_DENSITY_HOUSING_STATS.buildCost : card.buildCost
}

export function getPlotPropertyIncome(plot: Plot, card: PropertyCard | undefined): number {
  if (!card) return 0
  if (plot.housingHighDensity && isHousingPropertyCard(card)) return HIGH_DENSITY_HOUSING_STATS.buildIncome
  return card.buildIncome
}

export function getPlotPropertyEndValue(plot: Plot, card: PropertyCard | undefined): number {
  if (!card) return 0
  if (plot.housingHighDensity && isHousingPropertyCard(card)) return HIGH_DENSITY_HOUSING_STATS.endGameValue
  return card.endGameValue
}

/** High-density housing lots that share at least one zoning district with (row, col) (overlap corners count). */
export function countHighDensityHousingInSameDistrict(plots: Plot[], row: number, col: string): number {
  return plots.filter((p) => {
    if (p.type !== 'city' || !p.builtProperty || !p.housingHighDensity) return false
    if (!p.builtProperty.startsWith('housing')) return false
    return plotsShareAnyDistrict(row, col, p.row, p.col)
  }).length
}

/**
 * Modifier to defender-side influence when resolving takeover dice for a property on this lot.
 * Each high-density housing in the district applies −1.
 */
export function getBlockTakeoverDefenderInfluencePenalty(
  plots: Plot[],
  contestedRow: number,
  contestedCol: string
): number {
  return -countHighDensityHousingInSameDistrict(plots, contestedRow, contestedCol)
}
