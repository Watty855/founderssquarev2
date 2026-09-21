import { COLUMNS } from './types'
import { buildingData, civicVariantByCell, lotCategoryData } from './boardLotData'
import { CHURCH_BLOCK_CELLS } from './boardData'
import type { LotCategoryLetter } from './lotCategory'
import type { CivicVariantId } from './types'

/**
 * Computed board coordinate table.
 *
 * The track (streets, lot shells, church court) is static geometry: its cell
 * positions are precomputed here as CSS-grid line indices so nothing on the
 * board ever has to re-measure layout. Turn state (ownership, buildings,
 * highlights) renders as separate layers stacked over the track, each layer
 * placing its few elements with coordinates read from this table.
 *
 * Engine grid: 21 column tracks (A–U) x 21 row tracks (1–21).
 *   - Columns A / U and rows 1 / 21 are the outer bleed band (free canvas).
 *   - Columns E, I, M, Q and rows 5, 9, 13, 17 are the static streets
 *     (board-design spreadsheet letters D, H, L, P — offset one column).
 *   - J10–L12 is the static church block (board-design I10–K12); the
 *     cathedral sits at K11. It doubles as the inner-court free canvas.
 */

export const STREET_COLS = ['E', 'I', 'M', 'Q'] as const
export const STREET_ROWS = [5, 9, 13, 17] as const
export const STREET_COL_SET: ReadonlySet<string> = new Set(STREET_COLS)
export const STREET_ROW_SET: ReadonlySet<number> = new Set(STREET_ROWS)

export const FIRST_CITY_ROW = 2
export const LAST_CITY_ROW = 20
export const FIRST_CITY_COL = 'B'
export const LAST_CITY_COL = 'T'

export const STREET_TRACK_PX = 4

/** CSS grid line index (1-based) for a column letter. */
export function gridColOf(col: string): number {
  return COLUMNS.indexOf(col) + 1
}

/** CSS grid line index (1-based) for a row number — rows map 1:1. */
export function gridRowOf(row: number): number {
  return row
}

export type CellCoord = {
  key: string
  col: string
  row: number
  /** Precomputed CSS grid placement — `gridColumn: c / c+1`, `gridRow: r / r+1`. */
  gridColumn: number
  gridRow: number
}

/** Coordinate table for every track cell, keyed `"E7"`. */
export const CELL_COORD: ReadonlyMap<string, CellCoord> = (() => {
  const m = new Map<string, CellCoord>()
  for (const col of COLUMNS) {
    for (let row = 1; row <= 21; row++) {
      const key = `${col}${row}`
      m.set(key, { key, col, row, gridColumn: gridColOf(col), gridRow: gridRowOf(row) })
    }
  }
  return m
})()

export function cellCoord(col: string, row: number): CellCoord {
  return CELL_COORD.get(`${col}${row}`)!
}

/** Static description of one printed city lot — never changes during play. */
export type StaticLotSpec = CellCoord & {
  building: string
  lotCategory?: LotCategoryLetter
  civicVariantId?: CivicVariantId
  isAnchor: boolean
}

/** All printed city lots (216), in row-major order. Built once at module load. */
export const STATIC_LOTS: readonly StaticLotSpec[] = (() => {
  const lots: StaticLotSpec[] = []
  for (let row = FIRST_CITY_ROW; row <= LAST_CITY_ROW; row++) {
    if (STREET_ROW_SET.has(row)) continue
    for (const col of COLUMNS) {
      const key = `${col}${row}`
      if (STREET_COL_SET.has(col)) continue
      if (col === 'A' || col === 'U') continue
      if (CHURCH_BLOCK_CELLS.has(key) || key === 'K11') continue
      const building = buildingData[key]
      if (!building) continue
      const lotCategory = lotCategoryData[key]
      lots.push({
        ...cellCoord(col, row),
        building,
        lotCategory,
        civicVariantId: civicVariantByCell[key],
        isAnchor: lotCategory === 'AT' || building === 'Anchor Tenet' || building === 'Anchor',
      })
    }
  }
  return lots
})()

export const STATIC_LOT_BY_KEY: ReadonlyMap<string, StaticLotSpec> = new Map(
  STATIC_LOTS.map((l) => [l.key, l])
)

/** One full-length static street strip (the track lattice is 8 strips, not ~150 cells). */
export type StreetStrip = {
  key: string
  orientation: 'vertical' | 'horizontal'
  gridColumn: string
  gridRow: string
}

export const STREET_STRIPS: readonly StreetStrip[] = [
  ...STREET_COLS.map((col): StreetStrip => ({
    key: `street-col-${col}`,
    orientation: 'vertical',
    gridColumn: `${gridColOf(col)} / ${gridColOf(col) + 1}`,
    gridRow: `${FIRST_CITY_ROW} / ${LAST_CITY_ROW + 1}`,
  })),
  ...STREET_ROWS.map((row): StreetStrip => ({
    key: `street-row-${row}`,
    orientation: 'horizontal',
    gridColumn: `${gridColOf(FIRST_CITY_COL)} / ${gridColOf(LAST_CITY_COL) + 1}`,
    gridRow: `${row} / ${row + 1}`,
  })),
]

/**
 * Named free-canvas regions — everything outside the static track.
 * Art-direct these independently of game logic (see BoardRegions.tsx).
 * Nested ids (`bleed.north.title`, …) live inside the parent
 * grid cell; they are not their own CSS-grid tracks.
 */
export type BoardRegionId =
  | 'bleed.north'
  | 'bleed.south'
  | 'bleed.west'
  | 'bleed.east'
  | 'court'

export type BoardNestedRegionId =
  | 'bleed.north.title'
  | 'bleed.north.edition'
  | 'bleed.south.tagline'
  | 'bleed.west.panel'
  | 'bleed.east.panel'

export type BoardRegion = {
  id: BoardRegionId
  gridColumn: string
  gridRow: string
}

export const BOARD_REGIONS: Record<BoardRegionId, BoardRegion> = {
  /** Outer bleed band — title art, edition marks, side panels. */
  'bleed.north': { id: 'bleed.north', gridColumn: '1 / -1', gridRow: '1 / 2' },
  'bleed.south': { id: 'bleed.south', gridColumn: '1 / -1', gridRow: '21 / 22' },
  'bleed.west': { id: 'bleed.west', gridColumn: '1 / 2', gridRow: '2 / 21' },
  'bleed.east': { id: 'bleed.east', gridColumn: '21 / 22', gridRow: '2 / 21' },
  /** Inner court (church block J10–L12) — no overlay copy. */
  court: {
    id: 'court',
    gridColumn: `${gridColOf('J')} / ${gridColOf('L') + 1}`,
    gridRow: '10 / 13',
  },
}

/** Nested art slots inside the five named regions. */
export const BOARD_REGION_TREE: Record<BoardRegionId, readonly BoardNestedRegionId[]> = {
  'bleed.north': ['bleed.north.title', 'bleed.north.edition'],
  'bleed.south': ['bleed.south.tagline'],
  'bleed.west': ['bleed.west.panel'],
  'bleed.east': ['bleed.east.panel'],
  court: [],
}

/** Grid templates — streets are fixed hairline tracks, bleed bands are fractional. */
export function boardColTemplate(bleedFr: number): string {
  return COLUMNS.map((col) => {
    if (STREET_COL_SET.has(col)) return `${STREET_TRACK_PX}px`
    if (col === 'A' || col === 'U') return `${bleedFr}fr`
    return '1fr'
  }).join(' ')
}

export function boardRowTemplate(bleedFr: number): string {
  const parts: string[] = []
  for (let row = 1; row <= 21; row++) {
    if (STREET_ROW_SET.has(row)) parts.push(`${STREET_TRACK_PX}px`)
    else if (row === 1 || row === 21) parts.push(`${bleedFr}fr`)
    else parts.push('1fr')
  }
  return parts.join(' ')
}
