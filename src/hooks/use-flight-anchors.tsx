'use client'

/**
 * Flight anchors are named DOM elements that act as either a *source* or a *target*
 * for animated card flights (deck → hand, hand → discard, etc.). Components register
 * themselves by passing their HTMLElement to `setAnchor(key, el)`. The flight layer
 * then reads `getRect(key)` at queue time to snapshot the position the card should
 * fly from / to.
 *
 * We deliberately keep the *last known rect* even after a node unmounts, so a card
 * that just left the hand can still report where it used to be when we queue its
 * flight to the discard pile in the same render pass.
 */

import { createContext, useCallback, useContext, useMemo, useRef } from 'react'

export type FlightRect = {
  left: number
  top: number
  width: number
  height: number
}

interface FlightAnchorContextValue {
  setAnchor: (key: string, el: HTMLElement | null) => void
  getRect: (key: string) => FlightRect | null
}

const FlightAnchorContext = createContext<FlightAnchorContextValue | null>(null)

export function FlightAnchorProvider({ children }: { children: React.ReactNode }) {
  /** Live elements (mounted right now). */
  const liveRefs = useRef<Map<string, HTMLElement>>(new Map())
  /** Last observed rect for any key — survives an unmount so we can still fly *from* a card that just left the hand. */
  const lastRects = useRef<Map<string, FlightRect>>(new Map())

  const setAnchor = useCallback((key: string, el: HTMLElement | null) => {
    if (el) {
      liveRefs.current.set(key, el)
      const r = el.getBoundingClientRect()
      lastRects.current.set(key, { left: r.left, top: r.top, width: r.width, height: r.height })
    } else {
      const existing = liveRefs.current.get(key)
      if (existing) {
        const r = existing.getBoundingClientRect()
        lastRects.current.set(key, { left: r.left, top: r.top, width: r.width, height: r.height })
      }
      liveRefs.current.delete(key)
    }
  }, [])

  const getRect = useCallback((key: string): FlightRect | null => {
    const live = liveRefs.current.get(key)
    if (live) {
      const r = live.getBoundingClientRect()
      const rect: FlightRect = { left: r.left, top: r.top, width: r.width, height: r.height }
      lastRects.current.set(key, rect)
      return rect
    }
    return lastRects.current.get(key) ?? null
  }, [])

  const value = useMemo(() => ({ setAnchor, getRect }), [setAnchor, getRect])

  return <FlightAnchorContext.Provider value={value}>{children}</FlightAnchorContext.Provider>
}

/** Returns a ref-callback that registers (or unregisters) a DOM element under `key`. Stable across renders for the same key. */
export function useFlightAnchorRef(key: string): (el: HTMLElement | null) => void {
  const ctx = useContext(FlightAnchorContext)
  return useCallback(
    (el: HTMLElement | null) => {
      ctx?.setAnchor(key, el)
    },
    [ctx, key]
  )
}

/** Returns a stable getter that resolves a flight anchor key to its rect. Falls back to last-known rect if the node has unmounted. */
export function useFlightRectGetter(): (key: string) => FlightRect | null {
  const ctx = useContext(FlightAnchorContext)
  return useCallback((key: string) => ctx?.getRect(key) ?? null, [ctx])
}
