import type { Plot } from '@/lib/types'

/** Stable coordinate key for board lookups (`"C,3"`). */
export function plotCoordKey(col: string, row: number): string {
  return `${col},${row}`
}

/** Build an O(1) index of plot array positions by coordinate. */
export function buildPlotIndex(plots: readonly Plot[]): Map<string, number> {
  const index = new Map<string, number>()
  for (let i = 0; i < plots.length; i++) {
    const p = plots[i]
    index.set(plotCoordKey(p.col, p.row), i)
  }
  return index
}

/** Resolve a plot by coordinate using an index, falling back to a linear scan. */
export function getPlotAt(
  plots: readonly Plot[],
  col: string,
  row: number,
  index?: Map<string, number> | null
): Plot | undefined {
  if (index) {
    const i = index.get(plotCoordKey(col, row))
    return i === undefined ? undefined : plots[i]
  }
  return plots.find((p) => p.row === row && p.col === col)
}

/** Resolve a plot array index by coordinate. */
export function getPlotIndexAt(
  plots: readonly Plot[],
  col: string,
  row: number,
  index?: Map<string, number> | null
): number {
  if (index) {
    return index.get(plotCoordKey(col, row)) ?? -1
  }
  return plots.findIndex((p) => p.row === row && p.col === col)
}

/**
 * Immutable plot update by coordinate. Returns the same `plots` reference when the
 * coordinate is missing or `updater` returns the identical plot object.
 */
export function updatePlotAt(
  plots: Plot[],
  col: string,
  row: number,
  updater: (plot: Plot) => Plot,
  index?: Map<string, number> | null
): Plot[] {
  const i = getPlotIndexAt(plots, col, row, index)
  if (i < 0) return plots
  const prev = plots[i]
  const next = updater(prev)
  if (next === prev) return plots
  const copy = plots.slice()
  copy[i] = next
  return copy
}

/** Set of coordinate keys for fast membership checks during board render. */
export function coordKeySet(
  coords: ReadonlyArray<{ row: number; col: string }> | undefined | null
): Set<string> {
  const set = new Set<string>()
  if (!coords) return set
  for (const c of coords) set.add(plotCoordKey(c.col, c.row))
  return set
}
