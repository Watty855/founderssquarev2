'use client'

import { useEffect, useState } from 'react'

/** Phones / small tablets — including landscape iPhone heights (~390–500). */
const WIDTH_BREAKPOINT = 900
const HEIGHT_BREAKPOINT = 560

export type GameLayoutFlags = {
  /** Board + hand dominate; players become a thin strip. */
  compact: boolean
  /** Phone held sideways — shorter vertical space for the board. */
  landscape: boolean
}

/**
 * Compact in-game chrome: board + hand dominate; players become a thin strip.
 * True for portrait phones and landscape phones (short viewport height).
 */
export function useCompactGameLayout(): GameLayoutFlags {
  const [flags, setFlags] = useState<GameLayoutFlags>({ compact: false, landscape: false })

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      setFlags({
        compact: w < WIDTH_BREAKPOINT || h < HEIGHT_BREAKPOINT,
        landscape: w > h,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return flags
}
