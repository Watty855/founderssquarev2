'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react'

type BoardPinchZoomProps = {
  enabled: boolean
  children: ReactNode
  className?: string
  style?: CSSProperties
}

const MIN_SCALE = 1
const MAX_SCALE = 4.5

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * Pinch-to-zoom + pan for the board and hand together on phones.
 * At 1× scale, one-finger gestures pass through so the hand can scroll horizontally.
 */
export function BoardPinchZoom({ enabled, children, className, style }: BoardPinchZoomProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchStart = useRef<{ dist: number; scale: number; mid: { x: number; y: number }; tx: number; ty: number } | null>(
    null
  )
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const lastTap = useRef(0)
  const capturing = useRef(false)

  const clampPan = useCallback((nextScale: number, nextTx: number, nextTy: number) => {
    const el = viewportRef.current
    if (!el) return { tx: nextTx, ty: nextTy }
    const { clientWidth: w, clientHeight: h } = el
    // Extra slack so zoomed hands/cards past the edge can be panned into view.
    const maxX = ((nextScale - 1) * w) / 2 + w * 0.45
    const maxY = ((nextScale - 1) * h) / 2 + h * 0.35
    return {
      tx: Math.max(-maxX, Math.min(maxX, nextTx)),
      ty: Math.max(-maxY, Math.min(maxY, nextTy)),
    }
  }, [])

  const reset = useCallback(() => {
    setScale(1)
    setTx(0)
    setTy(0)
  }, [])

  useEffect(() => {
    if (!enabled) reset()
  }, [enabled, reset])

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!enabled) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 1) {
      const now = Date.now()
      if (now - lastTap.current < 280 && scale > 1.05) {
        reset()
        lastTap.current = 0
      } else {
        lastTap.current = now
      }
      // At 1×, leave one-finger gestures alone (hand scroll / card taps).
      if (scale > 1.01) {
        capturing.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        panStart.current = { x: e.clientX, y: e.clientY, tx, ty }
      }
    }

    if (pointers.current.size === 2) {
      capturing.current = true
      for (const id of pointers.current.keys()) {
        try {
          e.currentTarget.setPointerCapture(id)
        } catch {
          /* already captured or released */
        }
      }
      const pts = [...pointers.current.values()]
      pinchStart.current = {
        dist: distance(pts[0], pts[1]),
        scale,
        mid: midpoint(pts[0], pts[1]),
        tx,
        ty,
      }
      panStart.current = null
    }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!enabled || !pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2 && pinchStart.current) {
      e.preventDefault()
      const pts = [...pointers.current.values()]
      const dist = distance(pts[0], pts[1])
      const mid = midpoint(pts[0], pts[1])
      const nextScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, pinchStart.current.scale * (dist / Math.max(1, pinchStart.current.dist)))
      )
      const dx = mid.x - pinchStart.current.mid.x
      const dy = mid.y - pinchStart.current.mid.y
      const pan = clampPan(nextScale, pinchStart.current.tx + dx, pinchStart.current.ty + dy)
      setScale(nextScale)
      setTx(pan.tx)
      setTy(pan.ty)
      return
    }

    if (pointers.current.size === 1 && panStart.current && scale > 1.01) {
      e.preventDefault()
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      const pan = clampPan(scale, panStart.current.tx + dx, panStart.current.ty + dy)
      setTx(pan.tx)
      setTy(pan.ty)
    }
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    if (!enabled) return
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchStart.current = null
    if (pointers.current.size === 0) {
      panStart.current = null
      capturing.current = false
    }
    if (pointers.current.size === 1 && scale > 1.01) {
      const remaining = [...pointers.current.entries()][0]
      panStart.current = { x: remaining[1].x, y: remaining[1].y, tx, ty }
    }
  }

  if (!enabled) {
    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, ...style }}>
        {children}
      </div>
    )
  }

  const zoomed = scale > 1.01

  return (
    <div
      ref={viewportRef}
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        ...style,
        // At 1× allow native hand scrolling; when zoomed, we own gestures.
        touchAction: zoomed ? 'none' : 'pan-x pan-y',
        overflow: 'hidden',
        position: 'relative',
        overscrollBehavior: 'contain',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'stretch',
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: 'center center',
          transition: pointers.current.size > 0 ? 'none' : 'transform 120ms ease-out',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
      {scale > 1.05 ? (
        <button
          type="button"
          onClick={reset}
          aria-label="Reset board zoom"
          style={{
            position: 'absolute',
            right: 8,
            bottom: 8,
            zIndex: 5,
            height: 28,
            padding: '0 10px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(0,0,0,0.65)',
            color: '#f0f0f5',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reset zoom
        </button>
      ) : null}
    </div>
  )
}
