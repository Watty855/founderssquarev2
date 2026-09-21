import { describe, expect, it } from 'vitest'
import { layoutFlagsForViewport } from '@/hooks/use-compact-game-layout'

describe('layoutFlagsForViewport', () => {
  it('treats an iPhone in portrait as phone + compact, not landscape', () => {
    expect(layoutFlagsForViewport(390, 844)).toEqual({
      compact: true,
      landscape: false,
      phone: true,
    })
  })

  it('treats an iPhone in landscape as phone + compact so pinch-zoom stays on', () => {
    expect(layoutFlagsForViewport(844, 390)).toEqual({
      compact: true,
      landscape: true,
      phone: true,
    })
  })

  it('does not landscape-lock an iPad in portrait', () => {
    expect(layoutFlagsForViewport(768, 1024).phone).toBe(false)
    expect(layoutFlagsForViewport(768, 1024).compact).toBe(true)
  })

  it('leaves a desktop window unlocked and non-compact', () => {
    expect(layoutFlagsForViewport(1440, 900)).toEqual({
      compact: false,
      landscape: true,
      phone: false,
    })
  })
})
