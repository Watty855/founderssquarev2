import { COLUMNS } from './types'

/** Horizontal street rows (dead zones — not buildable, but may sit between adjacent city lots). */
export const STREET_ROWS = new Set<number>([5, 9, 13, 17])

/** Vertical street columns E, I, M, Q (column indices). */
export const STREET_COL_INDICES = new Set<number>([4, 8, 12, 16])

export function isCityBuildingCell(row: number, col: string): boolean {
  if (row < 2 || row > 20) return false
  if (STREET_ROWS.has(row)) return false
  const ci = COLUMNS.indexOf(col)
  if (ci <= 0 || ci >= COLUMNS.length - 1) return false
  if (STREET_COL_INDICES.has(ci)) return false
  return true
}

/**
 * City lots reachable from `(row, col)` for Investment / Hostile Takeover targeting:
 * - immediately orthogonally adjacent, or
 * - two steps away in the same row or column with exactly one street cell between (street-spanning).
 *
 * Streets are dead zones; they do not block orthogonal reach across a single street line.
 */
export function getOrthogonalCityNeighborsIncludingStreetSpan(
  row: number,
  col: string
): Array<{ row: number; col: string }> {
  const ci = COLUMNS.indexOf(col)
  const out: Array<{ row: number; col: string }> = []

  const pushIfCity = (r: number, c: string) => {
    if (!isCityBuildingCell(r, c)) return
    out.push({ row: r, col: c })
  }

  pushIfCity(row - 1, col)
  pushIfCity(row + 1, col)
  if (ci > 0) pushIfCity(row, COLUMNS[ci - 1])
  if (ci < COLUMNS.length - 1) pushIfCity(row, COLUMNS[ci + 1])

  for (const dr of [-2, 2] as const) {
    const midRow = row + dr / 2
    if (!STREET_ROWS.has(midRow)) continue
    pushIfCity(row + dr, col)
  }

  for (const dc of [-2, 2] as const) {
    const midCi = ci + dc / 2
    if (!STREET_COL_INDICES.has(midCi)) continue
    const targetCi = ci + dc
    if (targetCi < 0 || targetCi >= COLUMNS.length) continue
    pushIfCity(row, COLUMNS[targetCi])
  }

  return out
}
