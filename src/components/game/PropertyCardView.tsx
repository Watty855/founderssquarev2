'use client'

import type { CSSProperties } from 'react'
import { PropertyCard } from '@/lib/cardTypes'
import { getPropertyCornerLetter, getAnchorCornerNotation } from '@/lib/cardCornerLetter'

interface PropertyCardViewProps {
  card: PropertyCard
  className?: string
  onClick?: () => void
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'civic': return '#0070cc'
    case 'commercial': return '#7c3aed'
    case 'residential': return '#059669'
    case 'industrial': return '#d97706'
    case 'service': return '#0891b2'
    case 'anchor': return '#7dd3fc'
    default: return '#6b7280'
  }
}

const ANCHOR_CARD_BG = 'linear-gradient(180deg, #2a5f8f 0%, #1a4060 100%)'

export function PropertyCardView({ card, className, onClick }: PropertyCardViewProps) {
  const isAnchor = card.type === 'anchor'
  const color = getCategoryColor(card.category)
  const panelBackground = isAnchor ? ANCHOR_CARD_BG : '#0d1a2e'
  const cornerLetter = getPropertyCornerLetter(card)
  const anchorNotation = getAnchorCornerNotation(card)
  const cornerText = anchorNotation ?? cornerLetter

  const cornerStyle = (side: 'left' | 'right', place: 'top' | 'bottom' = 'top'): CSSProperties => ({
    position: 'absolute',
    [place]: 10,
    [side]: 12,
    fontSize: cornerText && cornerText.length > 2 ? 13 : 20,
    fontWeight: 800,
    fontFamily: "'Cinzel', 'Space Grotesk', serif",
    lineHeight: 1,
    color,
    textShadow: '0 1px 6px rgba(0,0,0,0.6)',
    letterSpacing: cornerText && cornerText.length > 1 ? '-0.02em' : undefined,
    transform: place === 'bottom' ? 'rotate(180deg)' : undefined,
    userSelect: 'none' as const,
    pointerEvents: 'none' as const,
    zIndex: 2,
  })

  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        width: 240,
        height: 340,
        borderRadius: 16,
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        background: panelBackground,
        border: `1px solid ${color}44`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        color: '#ffffff',
        position: 'relative',
      }}
    >
      {/* Top accent bar */}
      <div style={{ height: 4, backgroundColor: color }} />

      {/* Face-card corner letters — anchors carry their notation on all four corners */}
      {cornerText ? (
        <>
          <span style={cornerStyle('left')}>{cornerText}</span>
          <span style={cornerStyle('right')}>{cornerText}</span>
          {anchorNotation ? (
            <>
              <span style={cornerStyle('left', 'bottom')}>{anchorNotation}</span>
              <span style={cornerStyle('right', 'bottom')}>{anchorNotation}</span>
            </>
          ) : null}
        </>
      ) : null}

      {/* Header */}
      <div style={{ padding: '20px 20px 0', textAlign: 'center' }}>
        <div style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase' as const,
          color: color,
          marginBottom: 6,
          textAlign: 'center' as const,
          paddingTop: cornerText ? 2 : 0,
          position: 'relative',
          zIndex: 1,
        }}>
          {card.category}
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>
          {card.name}
        </div>
        {card.subtitle ? (
          <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.62)', marginTop: 6, lineHeight: 1.35 }}>
            {card.subtitle}
          </div>
        ) : null}
        {card.district && card.category !== 'civic' && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: card.subtitle ? 6 : 4 }}>
            {card.district}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)', margin: '16px 20px' }} />

      {/* Stats grid */}
      <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ textAlign: 'center', padding: '10px 0', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 4 }}>Cost</div>
          <div style={{ fontSize: 22, fontWeight: 300 }}>${card.buildCost}M</div>
        </div>
        <div style={{ textAlign: 'center', padding: '10px 0', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 4 }}>Value</div>
          <div style={{ fontSize: 22, fontWeight: 300 }}>${card.endGameValue}M</div>
        </div>
      </div>

      {/* Income — hero stat */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 20px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, fontWeight: 300, lineHeight: 1 }}>${card.buildIncome}M</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 6, letterSpacing: '0.15em', textTransform: 'uppercase' as const }}>
            Income / Turn
          </div>
        </div>
      </div>

      {/* Bottom stats — extra side padding clears the anchor corner notations */}
      <div style={{
        padding: anchorNotation ? '12px 48px' : '12px 20px',
        backgroundColor: 'rgba(0,0,0,0.3)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 11,
      }}>
        <span style={{ color: 'rgba(255,255,255,0.4)' }}>
          Influence: <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{card.influence}</span>
        </span>
        <span style={{ color: 'rgba(255,255,255,0.4)' }}>
          Bank: <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>${card.bankValue}M</span>
        </span>
      </div>
    </div>
  )
}
