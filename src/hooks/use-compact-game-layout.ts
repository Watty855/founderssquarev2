'use client'

import { useEffect, useState } from 'react'

/** Phones / small tablets — including landscape iPhone heights (~390–500). */
const WIDTH_BREAKPOINT = 900
const HEIGHT_BREAKPOINT = 560

/**
 * Compact in-game chrome: board + hand dominate; players become a thin strip.
 * True for portrait phones and landscape phones (short viewport height).
 */
export function useCompactGameLayout() {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const update = () => {
      setCompact(window.innerWidth < WIDTH_BREAKPOINT || window.innerHeight < HEIGHT_BREAKPOINT)
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return compact
}
