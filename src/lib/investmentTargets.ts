import { propertyCards } from './cardData'
import type { PropertyCard } from '@/lib/cardTypes'
import { getOrthogonalCityNeighborsIncludingStreetSpan } from './boardAdjacency'
import { Plot, COLUMNS } from '@/lib/types'

/**
 * Investment stripes only pay on Income rolls for these property types.
 * Park, Museum, generic Civic Center lots, City Hall, Courthouse, and Police are excluded.
 */
export function propertySupportsInvestmentIncome(card: PropertyCard | undefined): boolean {
  if (!card || card.type === 'anchor') return false
  // Museum-lot Arts & Entertainment cards keep the aura mechanic and stay excluded.
  if (card.name === 'Park' || card.name === 'Civic Center' || card.id.startsWith('museum-')) return false
  if (
    card.id === 'city-hall' ||
    card.id === 'courthouse' ||
    card.id === 'police' ||
    card.id === 'civic-center'
  ) {
    return false
  }
  return true
}

export function plotSupportsInvestmentIncome(builtPropertyId: string | undefined): boolean {
  if (!builtPropertyId) return false
  const card = propertyCards.find((c) => c.id === builtPropertyId) as PropertyCard | undefined
  return propertySupportsInvestmentIncome(card)
}

const STREET_ROWS_SORTED = [5, 9, 13, 17] as const
const STREET_COL_INDICES = [4, 8, 12, 16] as const // E, I, M, Q

export type CityBlockBounds = { minRow: number; maxRow: number; minColI: number; maxColI: number }

/** Interior city cell: returns null for streets, borders, cathedral, empty non-building lots. */
export function getCityBlockBounds(row: number, col: string): CityBlockBounds | null {
  const ci = COLUMNS.indexOf(col)
  if (ci <= 0 || ci >= COLUMNS.length - 1) return null
  if ((STREET_COL_INDICES as readonly number[]).includes(ci)) return null
  if (row <= 1 || row >= 21 || (STREET_ROWS_SORTED as readonly number[]).includes(row)) return null

  let minRow = 2
  for (const sr of STREET_ROWS_SORTED) {
    if (sr < row) minRow = sr + 1
  }
  let maxRow = 20
  for (const sr of STREET_ROWS_SORTED) {
    if (sr > row) {
      maxRow = sr - 1
      break
    }
  }

  let minColI = 1
  for (const si of STREET_COL_INDICES) {
    if (si < ci) minColI = si + 1
  }
  let maxColI = 19
  for (const si of STREET_COL_INDICES) {
    if (si > ci) {
      maxColI = si - 1
      break
    }
  }

  return { minRow, maxRow, minColI, maxColI }
}

function plotInBlockBounds(p: Plot, b: CityBlockBounds): boolean {
  if (p.type !== 'city') return false
  const ci = COLUMNS.indexOf(p.col)
  if (ci < 0) return false
  return p.row >= b.minRow && p.row <= b.maxRow && ci >= b.minColI && ci <= b.maxColI
}

/** True if `plot` lies in the same city block as the interior cell `(blockRow, blockCol)`. */
export function isPlotInCityBlock(plot: Plot, blockRow: number, blockCol: string): boolean {
  const b = getCityBlockBounds(blockRow, blockCol)
  if (!b) return false
  return plotInBlockBounds(plot, b)
}

function plotAt(plots: Plot[], row: number, col: string): Plot | undefined {
  return plots.find((p) => p.row === row && p.col === col)
}

/**
 * Lots another player has built where you may play Investment / Double Investment:
 * same city block as any of your built properties, or orthogonally adjacent (including across one street).
 */
export function getInvestablePlots(plots: Plot[], investorId: number): Plot[] {
  const myBuilt = plots.filter(
    (p) =>
      p.type === 'city' &&
      p.claimedBy === investorId &&
      p.builtProperty !== undefined &&
      p.builtProperty !== ''
  )
  if (myBuilt.length === 0) return []

  const key = (r: number, c: string) => `${r}:${c}`
  const out = new Map<string, Plot>()

  const consider = (p: Plot | undefined) => {
    if (!p || p.type !== 'city') return
    if (!p.builtProperty) return
    if (!plotSupportsInvestmentIncome(p.builtProperty)) return
    if (p.claimedBy === undefined || p.claimedBy === investorId) return
    out.set(key(p.row, p.col), p)
  }

  for (const mine of myBuilt) {
    const b = getCityBlockBounds(mine.row, mine.col)
    if (b) {
      for (const p of plots) {
        if (plotInBlockBounds(p, b)) consider(p)
      }
    }
    for (const neighbor of getOrthogonalCityNeighborsIncludingStreetSpan(mine.row, mine.col)) {
      consider(plotAt(plots, neighbor.row, neighbor.col))
    }
  }

  return [...out.values()]
}

/** Hostile Takeover uses the same targeting as Investment: same city block or orthogonal (across a street allowed). */
export function getTakeoverTargetPlots(plots: Plot[], attackerId: number): Plot[] {
  return getInvestablePlots(plots, attackerId)
}
