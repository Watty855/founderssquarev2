'use client'

import { ActionCard } from '@/lib/cardTypes'

interface ActionCardViewProps {
  card?: ActionCard
  className?: string
  onClick?: () => void
  showBack?: boolean
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'legal': return '#d97706'
    case 'financial': return '#059669'
    case 'social': return '#0284c7'
    case 'regulatory': return '#dc2626'
    default: return '#6b7280'
  }
}

export function ActionCardView({ card, className, onClick, showBack = false }: ActionCardViewProps) {
  if (showBack || !card) {
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
          backgroundColor: '#2a0e16',
          border: '1px solid rgba(200,27,58,0.3)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          color: '#ffffff',
        }}
      >
        <div style={{ height: 4, backgroundColor: '#c81b3a', position: 'absolute', top: 0, left: 0, right: 0 }} />
        <div style={{ fontSize: 28, fontWeight: 300, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.6)' }}>
          ACTION
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>
          Founders Square
        </div>
      </div>
    )
  }

  const color = getCategoryColor(card.category)

  const formatCost = (cost: number | string): string => {
    if (typeof cost === 'number') return cost === 0 ? 'Free' : `$${cost}M`
    return String(cost)
  }

  const showActionIncome =
    typeof card.buildIncome === 'number' && card.buildIncome > 0
  const bookM = card.endGameValue

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
        backgroundColor: '#1e0a10',
        border: `1px solid ${color}33`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        color: '#ffffff',
        position: 'relative',
      }}
    >
      {/* Top accent bar */}
      <div style={{ height: 4, backgroundColor: color }} />

      {/* Header */}
      <div style={{ padding: '20px 20px 0', textAlign: 'center' }}>
        <div style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase' as const,
          color: color,
          marginBottom: 6,
        }}>
          {card.category}
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>
          {card.name}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)', margin: '16px 20px' }} />

      {/* Description */}
      <div style={{ padding: '0 20px', flex: 1 }}>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,0.7)', margin: 0 }}>
          {card.description}
        </p>

        {card.diceRequired && (
          <div style={{
            marginTop: 16,
            padding: '8px 12px',
            borderRadius: 8,
            backgroundColor: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: 10,
            color: 'rgba(255,255,255,0.6)',
          }}>
            Dice: {card.diceRollRule}
          </div>
        )}
      </div>

      {/* Bottom stats */}
      <div style={{
        padding: '12px 20px',
        backgroundColor: 'rgba(0,0,0,0.3)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        rowGap: 6,
        fontSize: 11,
      }}>
        <span style={{ color: 'rgba(255,255,255,0.4)' }}>
          Cost: <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{formatCost(card.buildCost)}</span>
        </span>
        {showActionIncome ? (
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>
            Income: <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>${card.buildIncome}M</span>
          </span>
        ) : null}
        <span style={{ color: 'rgba(255,255,255,0.4)' }}>
          Bank: <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>${card.bankValue}M</span>
        </span>
        {bookM != null && bookM > 0 ? (
          <span style={{ color: 'rgba(255,255,255,0.4)', width: '100%', textAlign: 'center' }}>
            End book: <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>${bookM}M</span> on property
          </span>
        ) : null}
      </div>
    </div>
  )
}
