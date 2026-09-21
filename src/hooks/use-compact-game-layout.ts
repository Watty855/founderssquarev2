'use client'

import { useEffect, useState } from 'react'

/** Phones / small tablets — including landscape iPhone heights (~390–500). */
const WIDTH_BREAKPOINT = 900
const HEIGHT_BREAKPOINT = 560
/** Shortest edge on phones (~320–440). iPad mini is ~744, so it stays unlocked. */
const PHONE_SHORT_EDGE = 600

export type GameLayoutFlags = {
  /** Board + hand dominate; players become a thin strip. */
  compact: boolean
  /** Phone held sideways — shorter vertical space for the board. */
  landscape: boolean
  /** Cell phone (not tablet/desktop) — landscape lock applies here. */
  phone: boolean
}

export function layoutFlagsForViewport(w: number, h: number): GameLayoutFlags {
  return {
    compact: w < WIDTH_BREAKPOINT || h < HEIGHT_BREAKPOINT,
    landscape: w > h,
    phone: Math.min(w, h) < PHONE_SHORT_EDGE,
  }
}

/**
 * Compact in-game chrome: board + hand dominate; players become a thin strip.
 * True for portrait phones and landscape phones (short viewport height).
 */
export function useCompactGameLayout(): GameLayoutFlags {
  const [flags, setFlags] = useState<GameLayoutFlags>({
    compact: false,
    landscape: false,
    phone: false,
  })

  useEffect(() => {
    const update = () => {
      setFlags(layoutFlagsForViewport(window.innerWidth, window.innerHeight))
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
