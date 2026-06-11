import { Plot } from './types'

export type District =
  | 'Riverfront'
  | 'Mountain Cove'
  | 'Railway District'
  | 'Farmland'
  | 'City Center'

export interface DistrictBounds {
  name: District
  contains: (row: number, col: string) => boolean
}

const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U']

function isInRange(col: string, row: number, colStart: string, rowStart: number, colEnd: string, rowEnd: number): boolean {
  const colIdx = COLUMNS.indexOf(col)
  const colStartIdx = COLUMNS.indexOf(colStart)
  const colEndIdx = COLUMNS.indexOf(colEnd)

  return colIdx >= colStartIdx && colIdx <= colEndIdx && row >= rowStart && row <= rowEnd
}

/**
 * Zoning rectangles (lots can lie in several districts at corner overlaps).
 * Bounds are inclusive on column and row indices.
 */
export const DISTRICTS: DistrictBounds[] = [
  {
    name: 'City Center',
    contains: (row: number, col: string) => isInRange(col, row, 'F', 6, 'P', 16),
  },
  {
    name: 'Mountain Cove',
    contains: (row: number, col: string) => isInRange(col, row, 'B', 2, 'T', 4),
  },
  {
    name: 'Farmland',
    contains: (row: number, col: string) => isInRange(col, row, 'B', 18, 'T', 20),
  },
  {
    name: 'Riverfront',
    contains: (row: number, col: string) => isInRange(col, row, 'B', 2, 'D', 20),
  },
  {
    name: 'Railway District',
    contains: (row: number, col: string) => isInRange(col, row, 'R', 2, 'T', 20),
  },
]

/** All districts whose rectangle contains this city lot (overlap zones appear in multiple). */
export function getPlotDistricts(row: number, col: string): District[] {
  const out: District[] = []
  for (const district of DISTRICTS) {
    if (district.contains(row, col)) out.push(district.name)
  }
  return out
}

/**
 * First matching district (legacy). Prefer `getPlotDistricts` when overlap matters.
 */
export function getPlotDistrict(row: number, col: string): District | null {
  const all = getPlotDistricts(row, col)
  return all.length > 0 ? all[0]! : null
}

export function isPlotInDistrict(plot: Plot, district: District): boolean {
  return getPlotDistricts(plot.row, plot.col).includes(district)
}

/** True when two lots share at least one named district (for high-density / takeover “same district” rules on overlaps). */
export function plotsShareAnyDistrict(aRow: number, aCol: string, bRow: number, bCol: string): boolean {
  const a = getPlotDistricts(aRow, aCol)
  if (a.length === 0) return false
  const bset = new Set(getPlotDistricts(bRow, bCol))
  return a.some((d) => bset.has(d))
}
