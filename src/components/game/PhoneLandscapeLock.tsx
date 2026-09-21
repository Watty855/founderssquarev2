'use client'

import { useEffect } from 'react'
import { DeviceRotate } from '@phosphor-icons/react'
import { useCompactGameLayout } from '@/hooks/use-compact-game-layout'

type LockableOrientation = {
  lock?: (orientation: string) => Promise<void>
}

async function lockLandscape() {
  const orientation = window.screen?.orientation as LockableOrientation | undefined
  if (typeof orientation?.lock !== 'function') return
  try {
    await orientation.lock('landscape')
  } catch {
    /* Browser lock often needs fullscreen; native iOS/Android manifests enforce it. */
  }
}

/**
 * Phones play in landscape only. Pinch-zoom on the board is unchanged
 * (`BoardPinchZoom` still runs in compact layout).
 */
export function PhoneLandscapeLock({ children }: { children: React.ReactNode }) {
  const { phone, landscape } = useCompactGameLayout()

  useEffect(() => {
    if (!phone) return
    void lockLandscape()
  }, [phone, landscape])

  return (
    <>
      {children}
      {phone && !landscape ? (
        <div
          role="dialog"
          aria-label="Rotate your phone"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 32,
            background: 'radial-gradient(ellipse at center, #1a2d4a 0%, #0a0a0f 70%)',
            color: '#f5ecd7',
            textAlign: 'center',
          }}
        >
          <DeviceRotate size={56} weight="duotone" color="#c9a85c" />
          <p
            style={{
              margin: 0,
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#e8d4a0',
            }}
          >
            Turn your phone sideways
          </p>
          <p style={{ margin: 0, maxWidth: 280, fontSize: 14, lineHeight: 1.45, color: '#9b9bad' }}>
            Founders Square plays in landscape on phones. Pinch the board to zoom.
          </p>
        </div>
      ) : null}
    </>
  )
}
