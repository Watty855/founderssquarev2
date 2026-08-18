'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useOverlayStore } from '@/lib/gameOverlayStore'

/** Dims and blocks pointer events while the opening pro-tip is up — without GameApp re-rendering. */
export function ChromeDimmer({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const dim = useOverlayStore((s) => s.showOpeningProTip)
  return (
    <div
      className={className}
      style={{
        ...style,
        pointerEvents: dim ? 'none' : style?.pointerEvents ?? 'auto',
        opacity: dim ? 0.55 : style?.opacity ?? 1,
        transition: style?.transition ?? 'opacity 200ms ease',
      }}
    >
      {children}
    </div>
  )
}
