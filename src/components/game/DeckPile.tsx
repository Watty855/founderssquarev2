'use client'

import { useFlightAnchorRef } from '@/hooks/use-flight-anchors'
import { CardBackFace } from '@/components/game/CardBackFace'

/**
 * One deck pile (face-down). Sized exactly like a hand card so it reads as "the next card
 * waiting to be drawn" rather than as a separate UI widget.
 *
 * Property and action decks use blueprint artwork from the reference board mockup.
 */

export const PROPERTY_DECK_ANCHOR_KEY = 'property-deck'
export const ACTION_DECK_ANCHOR_KEY = 'action-deck'

const PILE_WIDTH = 110
const PILE_HEIGHT = 152

function EmptyDeckPlaceholder({ variant }: { variant: 'property' | 'action' }) {
  const accent = variant === 'property' ? '#1e4a7a' : '#1e3a5a'
  return (
    <div
      style={{
        width: PILE_WIDTH,
        height: PILE_HEIGHT,
        borderRadius: 12,
        border: `1px dashed ${accent}55`,
        background: 'rgba(255,255,255,0.04)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: 0.6,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.2em',
          color: accent,
          textTransform: 'uppercase',
        }}
      >
        {variant === 'property' ? 'PROPERTY' : 'ACTION'}
      </span>
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.12em',
          color: 'rgba(240,240,245,0.45)',
          textTransform: 'uppercase',
        }}
      >
        Empty
      </span>
    </div>
  )
}

interface DeckPileProps {
  variant: 'property' | 'action'
  /** When 0, render the empty placeholder (no stack). */
  hasCards: boolean
}

export function DeckPile({ variant, hasCards }: DeckPileProps) {
  const anchorKey = variant === 'property' ? PROPERTY_DECK_ANCHOR_KEY : ACTION_DECK_ANCHOR_KEY
  const setAnchor = useFlightAnchorRef(anchorKey)

  return (
    <div
      ref={setAnchor}
      role="img"
      aria-label={variant === 'property' ? 'Property deck' : 'Action deck'}
      style={{ position: 'relative', width: PILE_WIDTH, height: PILE_HEIGHT, flexShrink: 0 }}
    >
      {hasCards && (
        <>
          <div style={{ position: 'absolute', left: 5, top: 5, opacity: 0.35 }}>
            <CardBackFace variant={variant} width={PILE_WIDTH} height={PILE_HEIGHT} />
          </div>
          <div style={{ position: 'absolute', left: 3, top: 3, opacity: 0.6 }}>
            <CardBackFace variant={variant} width={PILE_WIDTH} height={PILE_HEIGHT} />
          </div>
        </>
      )}
      <div style={{ position: 'absolute', left: 0, top: 0 }}>
        {hasCards ? (
          <CardBackFace variant={variant} width={PILE_WIDTH} height={PILE_HEIGHT} />
        ) : (
          <EmptyDeckPlaceholder variant={variant} />
        )}
      </div>
    </div>
  )
}
