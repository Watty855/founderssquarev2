import type { CSSProperties } from 'react'

export const CARD_BACK_ART = {
  property: '/cards/property-back.png',
  action: '/cards/action-back.png',
} as const

export function getCardBackArtStyle(
  variant: 'property' | 'action',
  width: number,
  height: number,
): CSSProperties {
  return {
    width,
    height,
    backgroundImage: `url(${CARD_BACK_ART[variant]})`,
    backgroundSize: '100% 100%',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    borderRadius: Math.max(4, Math.min(16, width / 9)),
    overflow: 'hidden',
    boxShadow: '0 10px 22px -10px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.06) inset',
  }
}
