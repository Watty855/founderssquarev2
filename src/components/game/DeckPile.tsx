'use client'

import { Buildings, Lightning } from '@phosphor-icons/react'
import { useFlightAnchorRef } from '@/hooks/use-flight-anchors'

/**
 * One deck pile (face-down). Sized exactly like a hand card so it reads as "the next card
 * waiting to be drawn" rather than as a separate UI widget. Discards are no longer rendered
 * — when a card leaves the hand it just animates out of the slot via the flight layer.
 *
 * Property and action decks are visually unmistakable from each other:
 *   • Property — deep blue gradient, cyan accent, Buildings icon, "PROPERTY" tag.
 *   • Action   — deep crimson gradient, amber accent, Lightning icon, "ACTION" tag.
 */

export const PROPERTY_DECK_ANCHOR_KEY = 'property-deck'
export const ACTION_DECK_ANCHOR_KEY = 'action-deck'

const PILE_WIDTH = 110
const PILE_HEIGHT = 152

interface VariantStyle {
  gradient: string
  accent: string
  shadowAccent: string
  label: string
  Icon: typeof Buildings
}

function variantStyles(variant: 'property' | 'action'): VariantStyle {
  if (variant === 'property') {
    return {
      gradient: 'linear-gradient(160deg, #0d3a6e 0%, #06214a 60%, #03132d 100%)',
      accent: '#06b6d4',
      shadowAccent: 'rgba(6, 182, 212, 0.35)',
      label: 'PROPERTY',
      Icon: Buildings,
    }
  }
  return {
    gradient: 'linear-gradient(160deg, #5a1828 0%, #3a0e18 60%, #1f0810 100%)',
    accent: '#f59e0b',
    shadowAccent: 'rgba(245, 158, 11, 0.32)',
    label: 'ACTION',
    Icon: Lightning,
  }
}

function DeckBackFace({ variant }: { variant: 'property' | 'action' }) {
  const v = variantStyles(variant)
  const Icon = v.Icon
  return (
    <div
      style={{
        width: PILE_WIDTH,
        height: PILE_HEIGHT,
        borderRadius: 12,
        background: v.gradient,
        border: `1px solid ${v.accent}55`,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: `0 10px 22px -10px rgba(0,0,0,0.75), 0 0 0 1px ${v.accent}10 inset, 0 0 18px -10px ${v.shadowAccent}`,
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: v.accent }} />
      <div
        style={{
          position: 'absolute',
          inset: 8,
          borderRadius: 8,
          border: `1px dashed ${v.accent}55`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
        }}
      >
        <Icon size={42} weight="duotone" color={v.accent} />
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.22em',
            color: v.accent,
            textTransform: 'uppercase',
            opacity: 0.95,
          }}
        >
          {v.label}
        </span>
      </div>
    </div>
  )
}

function EmptyDeckPlaceholder({ variant }: { variant: 'property' | 'action' }) {
  const v = variantStyles(variant)
  return (
    <div
      style={{
        width: PILE_WIDTH,
        height: PILE_HEIGHT,
        borderRadius: 12,
        border: `1px dashed ${v.accent}45`,
        background: 'rgba(255,255,255,0.02)',
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
          color: v.accent,
          textTransform: 'uppercase',
        }}
      >
        {v.label}
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
      {/* Stack depth — purely decorative, three offset card backs to hint at "many cards in pile". */}
      {hasCards && (
        <>
          <div style={{ position: 'absolute', left: 5, top: 5, opacity: 0.35 }}>
            <DeckBackFace variant={variant} />
          </div>
          <div style={{ position: 'absolute', left: 3, top: 3, opacity: 0.6 }}>
            <DeckBackFace variant={variant} />
          </div>
        </>
      )}
      <div style={{ position: 'absolute', left: 0, top: 0 }}>
        {hasCards ? <DeckBackFace variant={variant} /> : <EmptyDeckPlaceholder variant={variant} />}
      </div>
    </div>
  )
}
