'use client'

import { memo } from 'react'
import { STATIC_LOTS, STREET_STRIPS } from '@/lib/boardGeometry'
import {
  BLUEPRINT_LOT_BG,
  BLUEPRINT_LOT_BORDER,
  BLUEPRINT_LOT_TEXT,
  LABEL_FONT,
  STREET_BLACK,
  cachedLotLabelSizes,
} from './boardLotVisuals'

type BoardStaticTrackProps = {
  /** City cell size bucketed to 0.5px — the only thing that can change (window resize). */
  cityCellPx: number
  compact: boolean
}

/**
 * The static track: street lattice + printed lot shells, rendered once as
 * static geometry. Nothing here reads game state, so turns never touch it —
 * ownership, buildings, and effects stack over it in separate layers.
 *
 * Cells carry `data-cell` so a single delegated handler on the board grid
 * resolves clicks / drags without per-cell listeners.
 */
function BoardStaticTrackImpl({ cityCellPx, compact }: BoardStaticTrackProps) {
  return (
    <div data-layer="static-track" style={{ display: 'contents' }}>
      {/* Static streets — black lattice, 8 full-length strips. */}
      {STREET_STRIPS.map((s) => (
        <div
          key={s.key}
          data-street={s.key}
          style={{
            gridColumn: s.gridColumn,
            gridRow: s.gridRow,
            backgroundColor: STREET_BLACK,
            borderTop: s.orientation === 'horizontal' ? '1px solid rgba(255,255,255,0.03)' : 'none',
            borderLeft: s.orientation === 'vertical' ? '1px solid rgba(255,255,255,0.03)' : 'none',
            zIndex: 1,
          }}
        />
      ))}

      {/* Printed lot shells — blueprint blue, letter + name. */}
      {STATIC_LOTS.map((lot) => {
        const letter = lot.lotCategory ?? null
        const sizes = cachedLotLabelSizes(
          cityCellPx,
          lot.building || letter || 'Lot',
          Boolean(letter),
          compact
        )
        return (
          <div
            key={lot.key}
            data-cell={lot.key}
            className="fs-static-lot"
            style={{
              gridColumn: `${lot.gridColumn} / ${lot.gridColumn + 1}`,
              gridRow: `${lot.gridRow} / ${lot.gridRow + 1}`,
              backgroundColor: BLUEPRINT_LOT_BG,
              border: lot.isAnchor
                ? `1px solid ${BLUEPRINT_LOT_BORDER}88`
                : `1px solid ${BLUEPRINT_LOT_BORDER}66`,
              boxShadow: lot.isAnchor
                ? `inset 0 0 12px ${BLUEPRINT_LOT_BORDER}30`
                : 'inset 0 1px 3px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              position: 'relative',
              minHeight: 0,
              minWidth: 0,
              padding: 1,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                width: '100%',
                minHeight: 0,
                maxHeight: '100%',
                textAlign: 'center',
                overflow: 'hidden',
                padding: '0 1px',
              }}
            >
              {letter ? (
                <span
                  style={{
                    fontSize: sizes.letterPx,
                    fontWeight: 800,
                    letterSpacing: '0.02em',
                    lineHeight: 1,
                    flexShrink: 0,
                    width: '100%',
                    textAlign: 'center',
                    color: BLUEPRINT_LOT_TEXT,
                    fontFamily: LABEL_FONT,
                  }}
                >
                  {letter}
                </span>
              ) : null}
              <span
                className="fs-lot-title"
                style={{
                  fontSize: sizes.titlePx,
                  fontWeight: 600,
                  lineHeight: 1.05,
                  color: BLUEPRINT_LOT_TEXT,
                  textAlign: 'center',
                  width: '100%',
                  maxWidth: '100%',
                  marginTop: letter ? 0.5 : 0,
                  fontFamily: LABEL_FONT,
                }}
              >
                {lot.building}
              </span>
            </div>
            {lot.isAnchor ? (
              <div
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  backgroundColor: BLUEPRINT_LOT_BORDER,
                  opacity: 0.6,
                }}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export const BoardStaticTrack = memo(BoardStaticTrackImpl)
