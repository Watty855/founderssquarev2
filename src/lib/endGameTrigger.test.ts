import { describe, expect, it } from 'vitest'
import { createInitialBoard } from '@/lib/boardData'
import { updatePlotAt } from '@/lib/boardIndex'
import { checkForNineSequentialProperties } from '@/lib/utils'
import type { Plot } from '@/lib/types'

function buildFor(plots: Plot[], ownerId: number, row: number, col: string): Plot[] {
  return updatePlotAt(plots, col, row, (plot) => ({
    ...plot,
    claimedBy: ownerId,
    builtProperty: plot.isAnchor ? 'church' : 'housing',
  }))
}

describe('Final Round trigger', () => {
  it('triggers for nine connected properties in a straight line across streets', () => {
    let plots = createInitialBoard()
    const cols = ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L']
    for (const col of cols) plots = buildFor(plots, 7, 2, col)

    const result = checkForNineSequentialProperties(plots)
    expect(result?.kind).toBe('straight-line')
    expect(result?.triggeredByPlayerId).toBe(7)
    expect(result?.plots).toHaveLength(9)
  })

  it('triggers for all nine properties in one 3×3 city block', () => {
    let plots = createInitialBoard()
    for (const row of [2, 3, 4]) {
      for (const col of ['B', 'C', 'D']) plots = buildFor(plots, 11, row, col)
    }

    const result = checkForNineSequentialProperties(plots)
    expect(result?.kind).toBe('city-block')
    expect(result?.triggeredByPlayerId).toBe(11)
    expect(result?.plots).toHaveLength(9)
  })

  it('does not trigger when the nine positions are split between founders', () => {
    let plots = createInitialBoard()
    const cols = ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L']
    cols.forEach((col, index) => {
      plots = buildFor(plots, index === cols.length - 1 ? 2 : 1, 2, col)
    })
    expect(checkForNineSequentialProperties(plots)).toBeNull()
  })
})
