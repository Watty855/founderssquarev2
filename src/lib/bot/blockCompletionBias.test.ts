import { describe, expect, it } from 'vitest'
import type { Plot } from '@/lib/types'
import {
  blockCompletionBiasScore,
  countPlayerBuiltInCityBlock,
} from '@/lib/utils'

function cityLot(
  row: number,
  col: string,
  opts: { claimedBy?: number; builtProperty?: string } = {}
): Plot {
  return {
    row,
    col,
    type: 'city',
    claimedBy: opts.claimedBy,
    builtProperty: opts.builtProperty,
  } as Plot
}

describe('blockCompletionBiasScore', () => {
  it('returns 0 for empty blocks', () => {
    expect(blockCompletionBiasScore(0)).toBe(0)
  })

  it('mildly rewards early presence', () => {
    expect(blockCompletionBiasScore(1)).toBe(2)
    expect(blockCompletionBiasScore(4)).toBe(8)
  })

  it('strongly rewards late block control', () => {
    expect(blockCompletionBiasScore(5)).toBe(50)
    expect(blockCompletionBiasScore(7)).toBe(70)
  })

  it('hard-prioritizes completing the 9th lot', () => {
    expect(blockCompletionBiasScore(8)).toBe(100)
  })
})

describe('countPlayerBuiltInCityBlock', () => {
  // B2–D4 is one 3×3 city block (rows 2–4, cols B–D).
  it('counts only the acting founder’s built lots in the target block', () => {
    const plots: Plot[] = [
      cityLot(2, 'B', { claimedBy: 1, builtProperty: 'housing' }),
      cityLot(2, 'C', { claimedBy: 1, builtProperty: 'grocery' }),
      cityLot(2, 'D', { claimedBy: 2, builtProperty: 'dining' }),
      cityLot(3, 'B'), // vacant in same block
      cityLot(6, 'B', { claimedBy: 1, builtProperty: 'housing' }), // different block
    ]
    expect(countPlayerBuiltInCityBlock(1, plots, 3, 'B')).toBe(2)
    expect(countPlayerBuiltInCityBlock(1, plots, 2, 'B')).toBe(2)
    expect(countPlayerBuiltInCityBlock(2, plots, 2, 'D')).toBe(1)
  })

  it('scores completing a square higher than starting a fresh block', () => {
    const nearlyDone: Plot[] = []
    const cells: Array<[number, string]> = [
      [2, 'B'],
      [2, 'C'],
      [2, 'D'],
      [3, 'B'],
      [3, 'C'],
      [3, 'D'],
      [4, 'B'],
      [4, 'C'],
      [4, 'D'],
    ]
    for (let i = 0; i < 8; i++) {
      const [r, c] = cells[i]
      nearlyDone.push(cityLot(r, c, { claimedBy: 1, builtProperty: 'housing' }))
    }
    nearlyDone.push(cityLot(4, 'D')) // vacant 9th
    nearlyDone.push(cityLot(6, 'F')) // empty other block

    const completeScore = blockCompletionBiasScore(
      countPlayerBuiltInCityBlock(1, nearlyDone, 4, 'D')
    )
    const freshScore = blockCompletionBiasScore(
      countPlayerBuiltInCityBlock(1, nearlyDone, 6, 'F')
    )
    expect(completeScore).toBe(100)
    expect(freshScore).toBe(0)
    expect(completeScore).toBeGreaterThan(freshScore)
  })
})
