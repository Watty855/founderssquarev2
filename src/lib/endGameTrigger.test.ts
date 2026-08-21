import { describe, expect, it } from 'vitest'
import { createInitialBoard } from '@/lib/boardData'
import { updatePlotAt } from '@/lib/boardIndex'
import {
  checkForTwelveAdjacentProperties,
  largestOwnedAdjacentCluster,
} from '@/lib/utils'
import type { Plot } from '@/lib/types'

function buildFor(plots: Plot[], ownerId: number, row: number, col: string): Plot[] {
  return updatePlotAt(plots, col, row, (plot) => ({
    ...plot,
    claimedBy: ownerId,
    builtProperty: plot.isAnchor ? 'church' : 'housing',
  }))
}

/** Full 3×3 block B2–D4 plus the 3 lots across street E (F2, G2, H2) = 12 adjacent. */
function twelveAcrossStreet(ownerId: number): Plot[] {
  let plots = createInitialBoard()
  for (const row of [2, 3, 4]) {
    for (const col of ['B', 'C', 'D']) plots = buildFor(plots, ownerId, row, col)
  }
  for (const col of ['F', 'G', 'H']) plots = buildFor(plots, ownerId, 2, col)
  return plots
}

describe('Endgame adjacent cluster', () => {
  it('detects 12 connected properties spanning a street', () => {
    const plots = twelveAcrossStreet(7)
    const result = checkForTwelveAdjacentProperties(plots)
    expect(result?.kind).toBe('adjacent-cluster')
    expect(result?.triggeredByPlayerId).toBe(7)
    expect(result?.plots.length).toBeGreaterThanOrEqual(12)
  })

  it('does not unlock on a 3×3 city block (only 9 lots)', () => {
    let plots = createInitialBoard()
    for (const row of [2, 3, 4]) {
      for (const col of ['B', 'C', 'D']) plots = buildFor(plots, 11, row, col)
    }
    expect(checkForTwelveAdjacentProperties(plots)).toBeNull()
    expect(largestOwnedAdjacentCluster(plots, 11)?.plots).toHaveLength(9)
  })

  it('does not unlock on nine in a straight line', () => {
    let plots = createInitialBoard()
    const cols = ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L']
    for (const col of cols) plots = buildFor(plots, 7, 2, col)
    expect(checkForTwelveAdjacentProperties(plots)).toBeNull()
    expect(largestOwnedAdjacentCluster(plots, 7)?.plots).toHaveLength(9)
  })

  it('does not unlock when the twelve lots are split between founders', () => {
    let plots = createInitialBoard()
    for (const row of [2, 3, 4]) {
      for (const col of ['B', 'C', 'D']) plots = buildFor(plots, 1, row, col)
    }
    for (const col of ['F', 'G', 'H']) plots = buildFor(plots, 2, 2, col)
    expect(checkForTwelveAdjacentProperties(plots)).toBeNull()
  })
})
