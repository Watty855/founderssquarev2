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

const MIN_SCALE = 0.5
const MAX_SCALE = 3
/** Pan / capture one-finger drag only when zoomed in past default. */
const PAN_SCALE_THRESHOLD = 1.01
/** Treat as “away from 1×” for reset UI / double-tap. */
const RESET_SCALE_EPSILON = 0.02

type Point = { x: number; y: number }

function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function clampScale(s: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))
}

/**
 * Pinch-to-zoom (0.5×–3×) + one-finger pan for the board viewport on phones.
 * Zoom is centered on the pinch midpoint. Pan is only active when scale > 1×.
 * At default/minimum zoom the full board stays centered (tx/ty forced to 0).
 */
export function BoardPinchZoom({ enabled, children, className, style }: BoardPinchZoomProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const [gestureActive, setGestureActive] = useState(false)

  const transformRef = useRef({ scale: 1, tx: 0, ty: 0 })
  const pointers = useRef(new Map<number, Point>())
  const pinchStart = useRef<{
    dist: number
    scale: number
    /** Midpoint in viewport-local coords (origin = viewport center). */
    midLocal: Point
    tx: number
    ty: number
  } | null>(null)
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const lastTap = useRef(0)

  const applyTransform = useCallback((nextScale: number, nextTx: number, nextTy: number) => {
    const s = clampScale(nextScale)
    let t = { tx: nextTx, ty: nextTy }
    if (s <= PAN_SCALE_THRESHOLD) {
      t = { tx: 0, ty: 0 }
    } else {
      const el = viewportRef.current
      if (el) {
        const { clientWidth: w, clientHeight: h } = el
        // Keep some content on-screen; with center-origin scale the overhang is ((s-1)*size)/2.
        const maxX = ((s - 1) * w) / 2
        const maxY = ((s - 1) * h) / 2
        t = {
          tx: Math.max(-maxX, Math.min(maxX, nextTx)),
          ty: Math.max(-maxY, Math.min(maxY, nextTy)),
        }
      }
    }
    transformRef.current = { scale: s, tx: t.tx, ty: t.ty }
    setScale(s)
    setTx(t.tx)
    setTy(t.ty)
  }, [])

  const reset = useCallback(() => {
    applyTransform(1, 0, 0)
  }, [applyTransform])

  useEffect(() => {
    if (!enabled) reset()
  }, [enabled, reset])

  /** Client midpoint → local coords relative to viewport center (matches transform-origin: center). */
  const toLocalCenter = useCallback((client: Point): Point => {
    const el = viewportRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return {
      x: client.x - rect.left - rect.width / 2,
      y: client.y - rect.top - rect.height / 2,
    }
  }, [])

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!enabled) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    setGestureActive(true)

    const { scale: curScale, tx: curTx, ty: curTy } = transformRef.current

    if (pointers.current.size === 1) {
      const now = Date.now()
      if (now - lastTap.current < 280 && Math.abs(curScale - 1) > RESET_SCALE_EPSILON) {
        reset()
        lastTap.current = 0
        pointers.current.clear()
        setGestureActive(false)
        return
      }
      lastTap.current = now

      // One-finger pan only when zoomed in past default.
      if (curScale > PAN_SCALE_THRESHOLD) {
        e.currentTarget.setPointerCapture(e.pointerId)
        panStart.current = { x: e.clientX, y: e.clientY, tx: curTx, ty: curTy }
      }
    }

    if (pointers.current.size === 2) {
      for (const id of pointers.current.keys()) {
        try {
          e.currentTarget.setPointerCapture(id)
        } catch {
          /* already captured or released */
        }
      }
      const pts = [...pointers.current.values()]
      const mid = midpoint(pts[0], pts[1])
      pinchStart.current = {
        dist: distance(pts[0], pts[1]),
        scale: curScale,
        midLocal: toLocalCenter(mid),
        tx: curTx,
        ty: curTy,
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
      const midLocal = toLocalCenter(midpoint(pts[0], pts[1]))
      const start = pinchStart.current
      const nextScale = clampScale(start.scale * (dist / Math.max(1, start.dist)))

      // Content point that was under the start midpoint (center-origin space):
      // screen = content * scale + translate
      const contentX = (start.midLocal.x - start.tx) / start.scale
      const contentY = (start.midLocal.y - start.ty) / start.scale
      // Keep that content point under the *current* midpoint.
      const nextTx = midLocal.x - contentX * nextScale
      const nextTy = midLocal.y - contentY * nextScale
      applyTransform(nextScale, nextTx, nextTy)
      return
    }

    if (pointers.current.size === 1 && panStart.current && transformRef.current.scale > PAN_SCALE_THRESHOLD) {
      e.preventDefault()
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      applyTransform(
        transformRef.current.scale,
        panStart.current.tx + dx,
        panStart.current.ty + dy
      )
    }
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    if (!enabled) return
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchStart.current = null
    if (pointers.current.size === 0) {
      panStart.current = null
      setGestureActive(false)
      // Snap pan to zero if we ended at/below 1×.
      if (transformRef.current.scale <= PAN_SCALE_THRESHOLD) {
        applyTransform(transformRef.current.scale, 0, 0)
      }
    }
    if (pointers.current.size === 1 && transformRef.current.scale > PAN_SCALE_THRESHOLD) {
      const remaining = [...pointers.current.entries()][0]
      panStart.current = {
        x: remaining[1].x,
        y: remaining[1].y,
        tx: transformRef.current.tx,
        ty: transformRef.current.ty,
      }
    }
  }

  if (!enabled) {
    return (
      <div
        className={className}
        style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: '1 1 0%', ...style }}
      >
        {children}
      </div>
    )
  }

  const awayFromDefault = Math.abs(scale - 1) > RESET_SCALE_EPSILON

  return (
    <div
      ref={viewportRef}
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        ...style,
        // Own gestures on the board viewport (hand rail is outside this wrapper).
        // Do not set `flex` here — className supplies flex-1 / flex-[1.4] for layout.
        touchAction: 'none',
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
          transition: gestureActive ? 'none' : 'transform 120ms ease-out',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
      {awayFromDefault ? (
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
