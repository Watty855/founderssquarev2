import { buildingData } from './boardLotData'
import type { PropertyCard } from './cardTypes'
import { getCardLotLetter, type LotCategoryLetter } from './lotCategory'
import type { Plot } from './types'

export type BuildCelebrationOpts = {
  housingHighDensity?: boolean
}

export type BuildCelebrationNotice = {
  lotName: string
  suffix: string
}

const CATEGORY_SUFFIX: Partial<Record<LotCategoryLetter, string>> = {
  C: ' assembled!',
  E: ' crafted to add to the surrounding area!',
  T: ' constructed!',
  P: ' established to add to property value!',
  M: ' fashioned!',
  H: ' developed!',
  I: ' manufactured to strengthen infrastructure!',
  D: ' organized!',
  S: ' assembled!',
  O: ' engineered!',
  F: ' cultivated!',
}

/** Named lot label from the physical board (e.g. Firehouse 01, D & D Diner). */
export function getPlotLotDisplayName(col: string, row: number, plotBuilding?: string | null): string {
  const key = `${col}${row}`
  return buildingData[key] ?? plotBuilding?.replace(/\s*\n+\s*/g, ' ').trim() ?? 'Lot'
}

function resolveLotCategoryLetter(
  plot: Pick<Plot, 'lotCategory'>,
  card: PropertyCard
): LotCategoryLetter | null {
  if (plot.lotCategory && plot.lotCategory !== 'AT') return plot.lotCategory
  return getCardLotLetter(card)
}

/**
 * Lot-specific build banner — bold lot name + category phrase (anchors use separate titles).
 */
export function getBuildCelebrationNotice(
  plot: Pick<Plot, 'col' | 'row' | 'building' | 'lotCategory'>,
  card: PropertyCard,
  opts: BuildCelebrationOpts = {}
): BuildCelebrationNotice | null {
  if (card.type === 'anchor') return null

  const lotName = getPlotLotDisplayName(plot.col, plot.row, plot.building)

  if (opts.housingHighDensity) {
    return { lotName, suffix: ' High density housing erected!' }
  }

  const letter = resolveLotCategoryLetter(plot, card)
  if (!letter) return null

  const suffix = CATEGORY_SUFFIX[letter]
  if (!suffix) return null

  return { lotName, suffix }
}
