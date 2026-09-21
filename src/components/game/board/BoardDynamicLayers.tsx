'use client'

import { memo, type CSSProperties } from 'react'
import { CELL_COORD } from '@/lib/boardGeometry'
import type { LastBuiltToken, LotTurnState } from '@/lib/selectLotTurnState'
import { LABEL_FONT, cachedLotLabelSizes } from './boardLotVisuals'

/**
 * Turn-state layers stacked over the static track.
 *
 *   ownership — founder-color fill (claimed / suppressed lots only)
 *   buildings — letter, title, density, investor stripes
 *   tokens    — last-built pawn, placement highlights, winning pulse
 *
 * Positions come from CELL_COORD. A turn re-renders the two or three overlay
 * cells that changed, never the board.
 */

export type PlacementHi = {
  solid: string
  outer: string
  inner: string
  hoverOuter: string
  hoverInner: string
}

type InvestorStripe = LotTurnState['stripes'][number]

function stripesEqual(a: InvestorStripe[], b: InvestorStripe[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].key !== b[i].key || a[i].color !== b[i].color || a[i].title !== b[i].title) return false
  }
  return true
}

/* ------------------------------------------------------------------ */
/* Ownership layer — fill only                                        */
/* ------------------------------------------------------------------ */

type OwnershipCellProps = {
  cellKey: string
  claimColor?: string
  suppressed: boolean
  highDensity: boolean
  isFading: boolean
}

function OwnershipCellImpl({
  cellKey,
  claimColor,
  suppressed,
  highDensity,
  isFading,
}: OwnershipCellProps) {
  const coord = CELL_COORD.get(cellKey)
  if (!coord) return null

  const fill: CSSProperties = suppressed
    ? {
        backgroundColor: '#1e1e28',
        boxShadow: 'inset 0 0 10px rgba(0,0,0,0.55)',
        opacity: 0.82,
        filter: 'saturate(0.35) brightness(0.88)',
      }
    : {
        backgroundColor: claimColor ?? '#888',
        boxShadow: highDensity
          ? `inset 0 0 10px rgba(0,0,0,0.4), 0 0 16px ${claimColor}, 0 0 32px ${claimColor}aa, 0 0 3px 1px rgba(255,255,255,0.85)`
          : `inset 0 0 8px rgba(0,0,0,0.3), 0 0 4px ${claimColor}40`,
        outline: highDensity ? `2px solid ${claimColor}` : undefined,
        outlineOffset: highDensity ? -2 : undefined,
      }

  return (
    <div
      data-layer="ownership"
      data-cell={cellKey}
      style={{
        gridColumn: `${coord.gridColumn} / ${coord.gridColumn + 1}`,
        gridRow: `${coord.gridRow} / ${coord.gridRow + 1}`,
        ...fill,
        border: '1px solid rgba(255,255,255,0.12)',
        pointerEvents: 'none',
        zIndex: 4,
        minHeight: 0,
        minWidth: 0,
        transition: 'opacity 180ms ease, filter 180ms ease, box-shadow 150ms ease',
        ...(isFading ? { animation: 'fsAnchorInfluenceFade 1.4s ease-out both', zIndex: 28 } : {}),
      }}
    />
  )
}

const OwnershipCell = memo(OwnershipCellImpl)

type OwnershipLayerProps = {
  lotStates: LotTurnState[]
  fadingAnchorCells: ReadonlySet<string>
}

function OwnershipLayerImpl({ lotStates, fadingAnchorCells }: OwnershipLayerProps) {
  return (
    <div style={{ display: 'contents' }}>
      {lotStates.map((s) => (
        <OwnershipCell
          key={s.key}
          cellKey={s.key}
          claimColor={s.claimColor}
          suppressed={s.suppressed}
          highDensity={s.highDensity}
          isFading={fadingAnchorCells.has(s.key)}
        />
      ))}
    </div>
  )
}

export const OwnershipLayer = memo(OwnershipLayerImpl)

/* ------------------------------------------------------------------ */
/* Buildings layer — structure swapped in on top of ownership fill    */
/* ------------------------------------------------------------------ */

type BuildingCellProps = {
  cellKey: string
  claimColor?: string
  letter: string | null
  title: string
  tooltip?: string
  highDensity: boolean
  stripes: InvestorStripe[]
  isElevating: boolean
  cityCellPx: number
  compact: boolean
}

function BuildingCellImpl({
  cellKey,
  claimColor,
  letter,
  title,
  tooltip,
  highDensity,
  stripes,
  isElevating,
  cityCellPx,
  compact,
}: BuildingCellProps) {
  const coord = CELL_COORD.get(cellKey)
  if (!coord) return null
  const sizes = cachedLotLabelSizes(cityCellPx, title || letter || 'Lot', Boolean(letter && title), compact)

  return (
    <div
      data-layer="buildings"
      data-cell={cellKey}
      title={tooltip}
      style={{
        gridColumn: `${coord.gridColumn} / ${coord.gridColumn + 1}`,
        gridRow: `${coord.gridRow} / ${coord.gridRow + 1}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
        minHeight: 0,
        minWidth: 0,
        padding: 1,
        pointerEvents: 'none',
        zIndex: 5,
        ...(isElevating
          ? { animation: 'fsBuildElevate 1.6s cubic-bezier(0.22, 1, 0.36, 1) both', zIndex: 30 }
          : {}),
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
              color: 'rgba(255,255,255,0.95)',
              fontFamily: LABEL_FONT,
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            {letter}
          </span>
        ) : null}
        {title ? (
          <span
            className="fs-lot-title"
            style={{
              fontSize: sizes.titlePx,
              fontWeight: 600,
              lineHeight: 1.05,
              color: 'rgba(255,255,255,0.95)',
              textAlign: 'center',
              width: '100%',
              maxWidth: '100%',
              marginTop: letter ? 0.5 : 0,
              fontFamily: LABEL_FONT,
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            {title}
            {highDensity ? (
              <span
                style={{
                  display: 'block',
                  fontSize: Math.max(3, sizes.titlePx * 0.85),
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  color: '#fef9c3',
                  textShadow: claimColor
                    ? `0 0 8px ${claimColor}, 0 0 12px rgba(255,255,255,0.9)`
                    : '0 0 8px #fff',
                  marginTop: 1,
                }}
              >
                HIGH-DENSITY
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      {stripes.length > 0 ? (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            pointerEvents: 'none',
          }}
        >
          {stripes.map((s) => (
            <div
              key={s.key}
              title={s.title}
              style={{
                height: 4,
                width: '100%',
                background: s.color,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

const BuildingCell = memo(BuildingCellImpl, (a, b) => {
  return (
    a.cellKey === b.cellKey &&
    a.claimColor === b.claimColor &&
    a.letter === b.letter &&
    a.title === b.title &&
    a.tooltip === b.tooltip &&
    a.highDensity === b.highDensity &&
    a.isElevating === b.isElevating &&
    a.cityCellPx === b.cityCellPx &&
    a.compact === b.compact &&
    stripesEqual(a.stripes, b.stripes)
  )
})

type BuildingsLayerProps = {
  lotStates: LotTurnState[]
  elevatingCells: ReadonlySet<string>
  cityCellPx: number
  compact: boolean
}

function BuildingsLayerImpl({ lotStates, elevatingCells, cityCellPx, compact }: BuildingsLayerProps) {
  return (
    <div style={{ display: 'contents' }}>
      {lotStates.map((s) =>
        s.claimedBy === undefined ? null : (
          <BuildingCell
            key={s.key}
            cellKey={s.key}
            claimColor={s.claimColor}
            letter={s.letter}
            title={s.title}
            tooltip={s.tooltip}
            highDensity={s.highDensity}
            stripes={s.stripes}
            isElevating={elevatingCells.has(s.key)}
            cityCellPx={cityCellPx}
            compact={compact}
          />
        )
      )}
    </div>
  )
}

export const BuildingsLayer = memo(BuildingsLayerImpl)

/* ------------------------------------------------------------------ */
/* Token / effects layer                                              */
/* ------------------------------------------------------------------ */

type TokenLayerProps = {
  lastBuiltToken: LastBuiltToken | null
  validCellKeys: ReadonlySet<string>
  placementActive: boolean
  placementBuildLens: boolean
  placementHi: PlacementHi
  winningCellKeys: ReadonlySet<string>
  streetTints: Array<{ key: string; color: string; gridColumn: string; gridRow: string }>
}

/**
 * Transient board effects: last-built pawn, placement highlights + dim lens,
 * winning pulse, named-street tints. Empty outside those moments.
 */
function TokenLayerImpl({
  lastBuiltToken,
  validCellKeys,
  placementActive,
  placementBuildLens,
  placementHi,
  winningCellKeys,
  streetTints,
}: TokenLayerProps) {
  const nodes: React.ReactNode[] = []

  if (lastBuiltToken) {
    const coord = CELL_COORD.get(lastBuiltToken.key)
    if (coord) {
      nodes.push(
        <div
          key={`pawn-${lastBuiltToken.key}`}
          data-token="last-built"
          data-layer="tokens"
          style={{
            gridColumn: `${coord.gridColumn} / ${coord.gridColumn + 1}`,
            gridRow: `${coord.gridRow} / ${coord.gridRow + 1}`,
            zIndex: 22,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            padding: 2,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: lastBuiltToken.color,
              border: '1.5px solid #fff',
              boxShadow: `0 1px 3px rgba(0,0,0,0.55), 0 0 8px ${lastBuiltToken.color}`,
              transform: 'translate3d(0, 0, 0)',
              willChange: 'transform',
            }}
          />
        </div>
      )
    }
  }

  if (placementActive) {
    for (const key of validCellKeys) {
      const coord = CELL_COORD.get(key)
      if (!coord) continue
      nodes.push(
        <div
          key={`hi-${key}`}
          data-cell={key}
          data-layer="tokens"
          className="fs-hi-cell"
          style={
            {
              gridColumn: `${coord.gridColumn} / ${coord.gridColumn + 1}`,
              gridRow: `${coord.gridRow} / ${coord.gridRow + 1}`,
              zIndex: placementBuildLens ? 14 : 10,
              cursor: 'pointer',
              border: placementBuildLens
                ? '2px solid rgba(255,255,255,0.92)'
                : `2px solid ${placementHi.solid}`,
              boxShadow: placementBuildLens
                ? `0 0 0 1px rgba(0,212,255,0.5), 0 0 22px ${placementHi.outer}, 0 0 48px rgba(0, 140, 220, 0.35), inset 0 0 10px ${placementHi.inner}`
                : `0 0 12px ${placementHi.outer}, inset 0 0 8px ${placementHi.inner}`,
              animation: placementBuildLens
                ? 'fs-build-target-pulse 1.2s ease-in-out infinite'
                : 'placement-glow 1.5s ease-in-out infinite',
              transform: placementBuildLens ? 'scale(1.02)' : undefined,
              ['--hi-solid' as never]: placementHi.solid,
              ['--hi-houter' as never]: placementHi.hoverOuter,
              ['--hi-hinner' as never]: placementHi.hoverInner,
            } as CSSProperties
          }
        />
      )
    }
  }

  for (const key of winningCellKeys) {
    const coord = CELL_COORD.get(key)
    if (!coord) continue
    nodes.push(
      <div
        key={`win-${key}`}
        data-layer="tokens"
        style={{
          gridColumn: `${coord.gridColumn} / ${coord.gridColumn + 1}`,
          gridRow: `${coord.gridRow} / ${coord.gridRow + 1}`,
          zIndex: 20,
          pointerEvents: 'none',
          boxShadow: '0 0 20px rgba(30,174,219,0.6), inset 0 0 10px rgba(255,255,255,0.1)',
          animation: 'winning-pulse 1.5s ease-in-out infinite',
        }}
      />
    )
  }

  for (const tint of streetTints) {
    nodes.push(
      <div
        key={`tint-${tint.key}`}
        data-layer="tokens"
        style={{
          gridColumn: tint.gridColumn,
          gridRow: tint.gridRow,
          backgroundColor: tint.color,
          boxShadow: `0 0 12px ${tint.color}, inset 0 0 8px ${tint.color}`,
          zIndex: 9,
          pointerEvents: 'none',
          transition: 'background-color 600ms ease, box-shadow 600ms ease',
        }}
      />
    )
  }

  return <div style={{ display: 'contents' }}>{nodes}</div>
}

export const TokenLayer = memo(TokenLayerImpl)
