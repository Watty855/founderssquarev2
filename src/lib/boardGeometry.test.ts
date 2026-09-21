import { describe, expect, it } from 'vitest'
import { buildingData, lotCategoryData } from '@/lib/boardLotData'
import { CHURCH_BLOCK_CELLS } from '@/lib/boardData'
import {
  BOARD_REGIONS,
  BOARD_REGION_TREE,
  STREET_COLS,
  STREET_ROWS,
  STATIC_LOT_BY_KEY,
  STATIC_LOTS,
  STREET_COL_SET,
  STREET_ROW_SET,
} from '@/lib/boardGeometry'

describe('board geometry from sample-board CSV', () => {
  it('maps spreadsheet streets D/H/L/P × 5/9/13/17 onto engine E/I/M/Q', () => {
    expect([...STREET_COLS]).toEqual(['E', 'I', 'M', 'Q'])
    expect([...STREET_ROWS]).toEqual([5, 9, 13, 17])
  })

  it('keeps the church court at spreadsheet I10–K12 (engine J10–L12)', () => {
    expect(CHURCH_BLOCK_CELLS.has('J10')).toBe(true)
    expect(CHURCH_BLOCK_CELLS.has('K11')).toBe(true)
    expect(CHURCH_BLOCK_CELLS.has('L12')).toBe(true)
    expect(BOARD_REGIONS.court.gridColumn).toBe('10 / 13')
    expect(BOARD_REGIONS.court.gridRow).toBe('10 / 13')
  })

  it('prints CSV lot names on city cells, not on streets or the church', () => {
    expect(buildingData.B2).toBe('Paper Mill')
    expect(lotCategoryData.B2).toBe('I')
    expect(buildingData.J4).toBe('Summit Market')
    expect(lotCategoryData.J4).toBe('F')
    expect(buildingData.H12).toBe('Courthouse')
    expect(lotCategoryData.B12).toBe('I') // Taylor Boats (II) typo → I
    expect(buildingData.M2).toBeUndefined() // Brax Trail Tours printed on street col L
    expect(buildingData.G13).toBeUndefined() // stray B Bank on street row 13
    expect(STATIC_LOT_BY_KEY.has('K11')).toBe(false)
    expect(STATIC_LOTS).toHaveLength(216)
    for (const lot of STATIC_LOTS) {
      expect(STREET_COL_SET.has(lot.col)).toBe(false)
      expect(STREET_ROW_SET.has(lot.row)).toBe(false)
      expect(CHURCH_BLOCK_CELLS.has(lot.key)).toBe(false)
    }
  })

  it('exposes named free-canvas regions independent of game logic', () => {
    expect(Object.keys(BOARD_REGIONS)).toEqual([
      'bleed.north',
      'bleed.south',
      'bleed.west',
      'bleed.east',
      'court',
    ])
    expect(BOARD_REGION_TREE.court).toEqual([])
    expect(BOARD_REGION_TREE['bleed.north']).toEqual(['bleed.north.title', 'bleed.north.edition'])
  })
})
