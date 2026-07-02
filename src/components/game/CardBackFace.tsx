'use client'

import { getCardBackArtStyle } from '@/lib/boardArt'

interface CardBackFaceProps {
  variant: 'property' | 'action'
  width?: number
  height?: number
  className?: string
  onClick?: () => void
}

/** Shared card back using official Founders Square property/action artwork. */
export function CardBackFace({
  variant,
  width = 110,
  height = 152,
  className,
  onClick,
}: CardBackFaceProps) {
  return (
    <div
      role="img"
      aria-label={variant === 'property' ? 'Property card back' : 'Action card back'}
      className={className}
      onClick={onClick}
      style={{
        ...getCardBackArtStyle(variant, width, height),
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
      }}
    />
  )
}
