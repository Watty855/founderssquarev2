'use client'

import { PropertyCard, ActionCard } from '@/lib/cardTypes'
import { getPropertyHandDisplayName } from '@/lib/civicFlexProperty'
import { getPropertyCornerLetter } from '@/lib/cardCornerLetter'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { PropertyCardView } from '@/components/game/PropertyCardView'
import { ActionCardView } from '@/components/game/ActionCardView'

interface CompactCardViewProps {
  card: PropertyCard | ActionCard
  onClick?: () => void
  selected?: boolean
  /** Rezoning: eligible property cards in hand get a violet outline */
  rezoningPickable?: boolean
  /** Build with Tax Dollars: eligible property cards in hand get a gold outline */
  taxBuildPickable?: boolean
  /** Discard Property Cards: property cards in hand get a teal ring (selected cards use a stronger accent) */
  discardPickable?: boolean
  /** Solo vs bots during AI turn — show deck-style back; no hover preview. */
  faceDown?: boolean
}

// Property cards: deep blue tones
// Action cards: deep red/crimson tones
// This makes them immediately distinguishable at a glance

function getCardStyle(card: PropertyCard | ActionCard): {
  bg: string
  topAccent: string
  label: string
} {
  if (card.type === 'anchor') {
    return {
      bg: 'linear-gradient(180deg, #2d6ba3 0%, #1f4f78 100%)',
      topAccent: '#7dd3fc',
      label: 'ANCHOR',
    }
  }

  const isProperty = card.type === 'property'

  if (isProperty) {
    // All property cards: PlayStation Blue family
    return {
      bg: 'linear-gradient(180deg, #0d2847 0%, #091a30 100%)',
      topAccent: '#0070cc',
      label: 'PROPERTY',
    }
  } else {
    // All action cards: Crimson/Red family
    return {
      bg: 'linear-gradient(180deg, #3d1520 0%, #2a0e16 100%)',
      topAccent: '#c81b3a',
      label: 'ACTION',
    }
  }
}

/** In-hand slot backed like the draw flight — used when bot hands are hidden (solo vs AI). */
function CompactCardSlotBack({ card }: { card: PropertyCard | ActionCard }) {
  const style = getCardStyle(card)
  return (
    <div
      style={{
        position: 'relative',
        width: 110,
        height: 152,
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'default',
        border: '1px solid rgba(255,255,255,0.12)',
        background: style.bg,
        flexShrink: 0,
        pointerEvents: 'none',
      }}
    >
      <div style={{ height: 3, backgroundColor: style.topAccent }} />
      <div
        style={{
          position: 'absolute',
          inset: 8,
          borderRadius: 8,
          border: `1px dashed ${style.topAccent}55`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.18em',
            color: style.topAccent,
            textTransform: 'uppercase',
            opacity: 0.9,
          }}
        >
          FS
        </span>
      </div>
    </div>
  )
}

export function CompactCardView({
  card,
  onClick,
  selected,
  rezoningPickable,
  taxBuildPickable,
  discardPickable,
  faceDown,
}: CompactCardViewProps) {
  const isProperty = card.type === 'property' || card.type === 'anchor'
  if (faceDown) {
    return <CompactCardSlotBack card={card} />
  }
  const propCard = isProperty ? (card as PropertyCard) : null
  const actCard = !isProperty ? card as ActionCard : null
  const style = getCardStyle(card)
  const borderColor =
    discardPickable && selected
      ? '#fb923c'
      : selected
        ? '#1eaedb'
        : rezoningPickable
          ? '#a78bfa'
          : taxBuildPickable
            ? '#fbbf24'
            : discardPickable
              ? '#2dd4bf'
              : 'rgba(255,255,255,0.12)'
  const borderWidth =
    rezoningPickable || taxBuildPickable || selected || discardPickable ? 2 : 1

  const formatCost = (cost: number | string): string => {
    if (typeof cost === 'number') return cost === 0 ? 'Free' : `$${cost}M`
    return String(cost)
  }

  const showCompactActionIncome =
    actCard && typeof actCard.buildIncome === 'number' && actCard.buildIncome > 0
  const compactActionBook = actCard?.endGameValue

  return (
    <HoverCard openDelay={300}>
      <HoverCardTrigger asChild>
        <div
          onClick={onClick}
          style={{
            position: 'relative',
            width: 110,
            height: 152,
            borderRadius: 12,
            overflow: 'hidden',
            cursor: 'pointer',
            border: `${borderWidth}px solid ${borderColor}`,
            background: style.bg,
            transition: 'border-color 180ms ease, transform 180ms ease',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (rezoningPickable) e.currentTarget.style.borderColor = '#c4b5fd'
            else if (discardPickable) e.currentTarget.style.borderColor = selected ? '#fdba74' : '#5eead4'
            else if (!selected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = borderColor
          }}
        >
          {/* Top accent stripe */}
          <div style={{
            height: 3,
            backgroundColor: style.topAccent,
          }} />

          {/* Face-card corner letters */}
          {propCard && getPropertyCornerLetter(propCard) ? (
            <>
              <span style={{
                position: 'absolute', top: 7, left: 7, fontSize: 12, fontWeight: 800,
                fontFamily: "'Cinzel', 'Space Grotesk', serif", lineHeight: 1,
                color: style.topAccent, textShadow: '0 1px 4px rgba(0,0,0,0.7)',
                userSelect: 'none', pointerEvents: 'none',
              }}>
                {getPropertyCornerLetter(propCard)}
              </span>
              <span style={{
                position: 'absolute', top: 7, right: 7, fontSize: 12, fontWeight: 800,
                fontFamily: "'Cinzel', 'Space Grotesk', serif", lineHeight: 1,
                color: style.topAccent, textShadow: '0 1px 4px rgba(0,0,0,0.7)',
                userSelect: 'none', pointerEvents: 'none',
              }}>
                {getPropertyCornerLetter(propCard)}
              </span>
            </>
          ) : null}

          {/* Card type label */}
          <div style={{
            padding: '8px 10px 0',
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: '0.1em',
            color: style.topAccent,
            opacity: 0.8,
          }}>
            {style.label}
          </div>

          {/* Card name */}
          <div style={{ padding: '4px 10px 0' }}>
            <p style={{
              fontSize: 11,
              fontWeight: 500,
              lineHeight: 1.2,
              color: '#ffffff',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: propCard?.subtitle ? 'normal' : 'nowrap',
              display: propCard?.subtitle ? '-webkit-box' : 'block',
              WebkitLineClamp: propCard?.subtitle ? 2 : undefined,
              WebkitBoxOrient: propCard?.subtitle ? 'vertical' : undefined,
              margin: 0,
            }}>
              {propCard ? getPropertyHandDisplayName(propCard) : card.name}
            </p>
            {propCard?.subtitle ? (
              <p style={{
                fontSize: 8,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.65)',
                marginTop: 3,
                lineHeight: 1.25,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                marginBottom: 0,
              }}>
                {propCard.subtitle}
              </p>
            ) : null}
            {propCard?.district && !propCard.subtitle ? (
              <p style={{
                fontSize: 8,
                color: 'rgba(255,255,255,0.4)',
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                margin: '2px 0 0',
              }}>
                {propCard.district}
              </p>
            ) : null}
          </div>

          {/* Main stat */}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 10px',
          }}>
            {propCard ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 300, color: '#ffffff', lineHeight: 1 }}>
                  ${propCard.buildIncome}M
                </div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                  Income
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '0 2px' }}>
                <div style={{
                  fontSize: 9,
                  fontWeight: 400,
                  color: 'rgba(255,255,255,0.7)',
                  lineHeight: 1.4,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {actCard?.description}
                </div>
              </div>
            )}
          </div>

          {/* Bottom stats */}
          <div style={{
            backgroundColor: 'rgba(0,0,0,0.4)',
            padding: '6px 10px',
            display: 'flex',
            flexWrap: actCard ? 'wrap' : 'nowrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: actCard ? 4 : 0,
            rowGap: 4,
            fontSize: 9,
          }}>
            {actCard ? (
              <>
                <span style={{ color: 'rgba(255,255,255,0.5)' }} title="Cost">
                  {formatCost(card.buildCost)}
                </span>
                {showCompactActionIncome ? (
                  <span style={{ color: 'rgba(255,255,255,0.5)' }} title="Income per owner Income resolution">
                    ${actCard.buildIncome}M
                  </span>
                ) : null}
                <span style={{ color: 'rgba(255,255,255,0.5)' }} title="Bank if played alone">
                  ${card.bankValue}M
                </span>
                {compactActionBook != null && compactActionBook > 0 ? (
                  <span style={{ color: 'rgba(255,255,255,0.45)' }} title="Book on property">
                    Bk ${compactActionBook}M
                  </span>
                ) : null}
              </>
            ) : (
              <>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {formatCost(card.buildCost)}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                  ${card.bankValue}M
                </span>
              </>
            )}
          </div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="center" className="w-auto p-0 border-0 bg-transparent shadow-none">
        <div style={{ transform: 'scale(0.6)', transformOrigin: 'bottom center' }}>
          {isProperty ? (
            <PropertyCardView card={card as PropertyCard} />
          ) : (
            <ActionCardView card={card as ActionCard} />
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
