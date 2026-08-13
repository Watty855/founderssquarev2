'use client'

import { memo, type CSSProperties, type DragEvent } from 'react'
import type { Plot } from '@/lib/types'
import { COLUMNS } from '@/lib/types'
import { CHURCH_SURROUND_CELLS, CHURCH_BLOCK_CELLS } from '@/lib/boardData'
import { getPlotDistricts } from '@/lib/districts'
import { getPlotBoardLetter } from '@/lib/lotCategory'
import type { PropertyCard } from '@/lib/cardTypes'

/** When true, the illustrated board image is the visual base; cells are interactive overlays. */
export const USE_BOARD_ART = false

const BLUEPRINT_LOT_BG = '#c5daf0'
const BLUEPRINT_LOT_BORDER = '#7aa8c8'
const BLUEPRINT_LOT_TEXT = '#0a0a0a'
const LOT_LABEL_FONT = "'Cinzel', 'Space Grotesk', serif"
const CHURCH_BLOCK_FILL = 'linear-gradient(135deg, #1f5c34 0%, #0d3018 100%)'
const DISTRICT_ZONE_STYLE = {
  bg: '#bdd4eb',
  border: '#6d9ec4',
  text: BLUEPRINT_LOT_TEXT,
} as const

const STREET_COLS = new Set(['E', 'I', 'M', 'Q'])
const STREET_ROWS = new Set([5, 9, 13, 17])

const BORDER_STYLES: Record<string, { bg: string; accent: string }> = {
  Mountain: { bg: '#3a2e1e', accent: '#8a7a5a' },
  River: { bg: '#0e3560', accent: '#4a9ad0' },
  Farmland: { bg: '#1e4020', accent: '#5aaa5a' },
  Railway: { bg: '#35354a', accent: '#b0b0cc' },
}

const LABEL_FONT = "'Space Grotesk', system-ui, sans-serif"

export type PlacementHi = {
  solid: string
  outer: string
  inner: string
  hoverOuter: string
  hoverInner: string
}

export type InvestorStripeView = {
  key: string
  color: string
  title: string
}

/** Static geometry / zoning for a cell — built once at module load. */
export type StaticLotMeta = {
  cellKey: string
  isChurchSurround: boolean
  isChurchBlockLot: boolean
  isAnchorLot: boolean
  hasDistrict: boolean
}

const staticLotMetaByKey: Map<string, StaticLotMeta> = (() => {
  const m = new Map<string, StaticLotMeta>()
  for (const col of COLUMNS) {
    for (let row = 1; row <= 21; row++) {
      const cellKey = `${col}${row}`
      m.set(cellKey, {
        cellKey,
        isChurchSurround: CHURCH_SURROUND_CELLS.has(cellKey),
        isChurchBlockLot: CHURCH_BLOCK_CELLS.has(cellKey),
        // Anchor Tenet lots are identified at render from plot.building (board data).
        isAnchorLot: false,
        hasDistrict: getPlotDistricts(row, col).length > 0,
      })
    }
  }
  return m
})()

export function getStaticLotMeta(col: string, row: number, building?: string): StaticLotMeta {
  const cellKey = `${col}${row}`
  const base = staticLotMetaByKey.get(cellKey) ?? {
    cellKey,
    isChurchSurround: CHURCH_SURROUND_CELLS.has(cellKey),
    isChurchBlockLot: CHURCH_BLOCK_CELLS.has(cellKey),
    isAnchorLot: false,
    hasDistrict: getPlotDistricts(row, col).length > 0,
  }
  const isAnchorLot =
    building === 'Anchor' || building === 'Anchor Tenet' || building === 'Union'
  if (base.isAnchorLot === isAnchorLot) return base
  return { ...base, isAnchorLot }
}

function estimateWrappedLines(text: string, charsPerLine: number): number {
  if (!text || charsPerLine < 1) return 1
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 1
  let lines = 1
  let used = 0
  for (const word of words) {
    const need = word.length
    if (used === 0) {
      used = need
      if (need > charsPerLine) {
        lines += Math.ceil(need / charsPerLine) - 1
        used = need % charsPerLine
      }
      continue
    }
    if (used + 1 + need <= charsPerLine) {
      used += 1 + need
    } else {
      lines += 1
      used = need
      if (need > charsPerLine) {
        lines += Math.ceil(need / charsPerLine) - 1
        used = need % charsPerLine
      }
    }
  }
  return Math.max(1, lines)
}

function computeLotLabelSizes(
  cityCell: number,
  title: string,
  hasLetter: boolean,
  compact: boolean
): { letterPx: number; titlePx: number } {
  const pad = 2
  const usableW = Math.max(8, cityCell - pad)
  const usableH = Math.max(8, cityCell - pad)
  const letterMax = compact ? 8 : 10
  const titleMax = compact ? 8 : 9
  const titleMin = 3.25
  const lineHeight = 1.05
  const charWidthFactor = 0.58

  let bestLetter = hasLetter ? Math.min(letterMax, usableH * 0.28) : 0
  let bestTitle = titleMin

  for (let titlePx = titleMax; titlePx >= titleMin; titlePx -= 0.25) {
    const letterPx = hasLetter
      ? Math.min(letterMax, Math.max(3.5, Math.min(titlePx * 1.15, usableH * 0.26)))
      : 0
    const gap = hasLetter ? 1 : 0
    const titleBudgetH = usableH - letterPx - gap
    const charsPerLine = Math.max(1, Math.floor(usableW / (titlePx * charWidthFactor)))
    const lines = estimateWrappedLines(title, charsPerLine)
    const titleH = lines * titlePx * lineHeight
    if (titleH <= titleBudgetH + 0.5) {
      bestLetter = letterPx
      bestTitle = titlePx
      break
    }
  }

  return { letterPx: bestLetter, titlePx: bestTitle }
}

const labelSizeCache = new Map<string, { letterPx: number; titlePx: number }>()

/** Cached label fit — keyed by cell-size bucket + title + letter flag + compact. */
export function cachedLotLabelSizes(
  cityCellPx: number,
  title: string,
  hasLetter: boolean,
  compact: boolean
): { letterPx: number; titlePx: number } {
  const bucket = Math.round(cityCellPx * 2) / 2
  const key = `${bucket}|${compact ? 1 : 0}|${hasLetter ? 1 : 0}|${title}`
  let hit = labelSizeCache.get(key)
  if (!hit) {
    hit = computeLotLabelSizes(cityCellPx, title, hasLetter, compact)
    labelSizeCache.set(key, hit)
  }
  return hit
}

export function borderLabelPx(cityCell: number, compact: boolean): number {
  return Math.max(4, Math.min(compact ? 7 : 8, cityCell * 0.28))
}

function lotTitleForDisplay(title: string, multiline: boolean): string {
  if (!multiline) return title
  return title.replace(/\s*\n+\s*/g, ' ').trim()
}

function stripesEqual(
  a: Plot['investmentStripes'] | undefined,
  b: Plot['investmentStripes'] | undefined
): boolean {
  if (a === b) return true
  if (!a || !b) return !a && !b
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].investorId !== b[i].investorId || a[i].contributionMillion !== b[i].contributionMillion) {
      return false
    }
  }
  return true
}

/** Visual fields that affect BoardLot paint — used by React.memo. */
export function plotVisualEqual(a: Plot, b: Plot): boolean {
  return (
    a.row === b.row &&
    a.col === b.col &&
    a.type === b.type &&
    a.building === b.building &&
    a.claimedBy === b.claimedBy &&
    a.builtProperty === b.builtProperty &&
    a.anchorInfluenceSuppressed === b.anchorInfluenceSuppressed &&
    a.housingHighDensity === b.housingHighDensity &&
    a.lotCategory === b.lotCategory &&
    stripesEqual(a.investmentStripes, b.investmentStripes)
  )
}

function anchorTooltip(card: PropertyCard): string | undefined {
  switch (card.id) {
    case 'church':
      return `INFLUENCE: +1 (entire board; max +1)\nINCOME: +1 (block)\nChurch affiliation created!\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any center anchor tenet (AT) except Union and any already-built anchor tenets`
    case 'farm-coop':
      return `INFLUENCE: +1 (Farmland)\nINCOME: +1 (block)\nTAKEOVER (Hostile Takeover): +1 on Farmland targets (evaluated on target block)\nFarm Bureau formed!\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any center AT adjacent to farmland except Union and already-built anchor tenets`
    case 'port-authority':
      return `INFLUENCE: +1 (Railway district)\nINCOME: +1 (block)\nTAKEOVER (Hostile Takeover): +1 on Railway district targets (evaluated on target block)\nPort Authority engineered!\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any center AT adjacent to the railway district except Union and already-built anchor tenets`
    case 'arts-council':
      return `INFLUENCE: +1 (River Front)\nINCOME: +1 (block)\nTAKEOVER (Hostile Takeover): +1 on River Front targets (evaluated on target block)\nArts Council crafted!\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any center AT adjacent to the riverfront district except Union and already-built anchor tenets`
    case 'tourism-office':
      return `INFLUENCE: +1 (Mountain Cove)\nINCOME: +1 (block)\nTAKEOVER (Hostile Takeover): +1 on Mountain Cove targets (evaluated on target block)\nTourism office conceived!\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any center AT adjacent to the mountain cove district except Union and already-built anchor tenets`
    case 'media':
      return `INFLUENCE: +1 (Scandals only; max +1 with News Outlet)\nINCOME: +1 (block)\nSocial media influencer launched!\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any center anchor tenet (AT) except Union and already-built anchor tenets`
    case 'news-outlet':
      return `INFLUENCE: +1 (Scandals only; max +1 with Influencer)\nINCOME: +1 (block)\nNews Outlet originated!\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any center anchor tenet (AT) except Union and already-built anchor tenets`
    case 'mafia':
      return `INFLUENCE: +1 (takeover, same city block)\nINCOME: +1 (block)\nEXTORTION: Opponents pay $1M per covered non-anchor business lot to each Mafia owner in the block when they roll property income.\nMafia infiltrated!\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any center anchor tenet (AT) except Union and already-built anchor tenets`
    case 'regulation-bureau':
      return `INFLUENCE: +1 (block) / −1 for rivals (takeover only)\nINCOME: +1 (block)\nTAKEOVER: Other players' lots in this block have −1 takeover influence vs Hostile Takeover (+1 attacker roll per distinct non-defender bureau in block).\nRegulation Bureau established!\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any center anchor tenet (AT) except Union and already-built anchor tenets`
    case 'union':
      return `INFLUENCE: +1 in the district where this Union was played (stacks with other Unions)\nINCOME: +$M on your other lots on this city block; rivals’ lots on this block −$M on their Income (lost, not paid to you)\nEnd game value: ${card.endGameValue}M (if played and built or banked)\nBuild: Any vacant Anchor Tenet lot`
    default:
      return undefined
  }
}

export type BoardLotProps = {
  plot: Plot
  builtCard?: PropertyCard
  claimColor?: string
  investorStripes: InvestorStripeView[]
  validPlacement: boolean
  claimable: boolean
  isWinning: boolean
  placementBuildLens: boolean
  dimVacantForBuild: boolean
  isElevating: boolean
  isFading: boolean
  streetTint?: string
  cityCellPx: number
  compact: boolean
  borderFs: number
  placementHi: PlacementHi
  onPlotClick: (plot: Plot) => void
  onDragOver: (e: DragEvent, plot: Plot) => void
  onDrop: (e: DragEvent, plot: Plot) => void
}

function BoardLotImpl({
  plot,
  builtCard,
  claimColor,
  investorStripes,
  validPlacement,
  claimable,
  isWinning,
  placementBuildLens,
  dimVacantForBuild,
  isElevating,
  isFading,
  streetTint,
  cityCellPx,
  compact,
  borderFs,
  placementHi,
  onPlotClick,
  onDragOver,
  onDrop,
}: BoardLotProps) {
  const meta = getStaticLotMeta(plot.col, plot.row, plot.building)
  const isCathedral = plot.type === 'cathedral'
  const isStreet = plot.type === 'street'
  const isBorder = plot.type === 'border'
  const isCity = plot.type === 'city'
  const isClaimed = plot.claimedBy !== undefined
  const isAnchor = meta.isAnchorLot
  const districtStyle = meta.hasDistrict ? DISTRICT_ZONE_STYLE : null
  const borderStyle = isBorder && plot.building ? BORDER_STYLES[plot.building] : null

  if (isStreet) {
    return (
      <div
        style={{
          backgroundColor: streetTint ? streetTint : USE_BOARD_ART ? 'transparent' : '#08080e',
          boxShadow: streetTint ? `0 0 12px ${streetTint}, inset 0 0 8px ${streetTint}` : undefined,
          borderTop:
            !USE_BOARD_ART && STREET_ROWS.has(plot.row) ? '1px solid rgba(255,255,255,0.03)' : 'none',
          borderLeft:
            !USE_BOARD_ART && STREET_COLS.has(plot.col) ? '1px solid rgba(255,255,255,0.03)' : 'none',
          transition: 'background-color 600ms ease, box-shadow 600ms ease',
        }}
      />
    )
  }

  if (isBorder) {
    if (USE_BOARD_ART) {
      return <div title={plot.building} style={{ background: 'transparent' }} />
    }
    const isVerticalBorder = plot.col === 'A' || plot.col === 'U'
    const terrain = plot.building ?? ''
    const accent = borderStyle?.accent || '#666'
    return (
      <div
        title={terrain}
        style={{
          backgroundColor: borderStyle?.bg || '#1a1a22',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          padding: isVerticalBorder ? '2px 1px' : '1px 2px',
          borderTop: plot.row === 1 ? `2px solid ${accent}55` : undefined,
          borderBottom: plot.row === 21 ? `2px solid ${accent}55` : undefined,
          borderLeft: plot.col === 'A' ? `2px solid ${accent}55` : undefined,
          borderRight: plot.col === 'U' ? `2px solid ${accent}55` : undefined,
          boxShadow: `inset 0 0 12px ${accent}18`,
        }}
      >
        {terrain ? (
          <span
            style={{
              fontSize: borderFs,
              fontWeight: 800,
              color: accent,
              letterSpacing: isVerticalBorder ? '0.08em' : '0.1em',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              textAlign: 'center',
              lineHeight: 1.05,
              textShadow: `0 1px 3px rgba(0,0,0,0.65), 0 0 8px ${accent}44`,
              writingMode: isVerticalBorder ? 'vertical-rl' : undefined,
              textOrientation: isVerticalBorder ? 'mixed' : undefined,
              maxWidth: '100%',
              maxHeight: '100%',
            }}
          >
            {terrain}
          </span>
        ) : null}
      </div>
    )
  }

  if (isCathedral) {
    if (USE_BOARD_ART) {
      return <div title="Church" style={{ background: 'transparent', cursor: 'not-allowed' }} />
    }
    return (
      <div
        style={{
          background: CHURCH_BLOCK_FILL,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          border: '2px solid rgba(120,220,150,0.45)',
          boxShadow: '0 0 24px rgba(100,200,120,0.25), inset 0 0 18px rgba(0,0,0,0.35)',
          cursor: 'not-allowed',
          minHeight: 0,
          overflow: 'hidden',
          padding: '2px 4px',
        }}
      >
        <span style={{ fontSize: 'clamp(10px, 1.2vw, 16px)', lineHeight: 1 }}>⛪</span>
        <span
          style={{
            fontSize: 'clamp(5px, 0.62vw, 7px)',
            fontWeight: 800,
            fontFamily: LOT_LABEL_FONT,
            color: '#e8f8ec',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            textAlign: 'center',
            lineHeight: 1.1,
            textShadow: '0 1px 2px rgba(0,0,0,0.55)',
          }}
        >
          Church
        </span>
      </div>
    )
  }

  if (!isCity) return <div />

  const isChurchSurround = meta.isChurchSurround && !plot.builtProperty
  const isChurchBlockLot = meta.isChurchBlockLot && !isCathedral
  const highDensityHousingLot =
    isClaimed &&
    plot.housingHighDensity === true &&
    (plot.builtProperty?.startsWith('housing') ?? false)

  const anchorTenetTitle =
    isAnchor && builtCard?.type === 'anchor' ? builtCard.name : null
  const plotDisplayTitle = anchorTenetTitle ?? (plot.building ? plot.building : '')
  const buildingMultiline =
    !anchorTenetTitle && plot.building != null && plot.building.includes('\n')
  const lotLetter =
    plot.building && !buildingMultiline ? getPlotBoardLetter(plot, builtCard) : null
  const lotTitleText = plotDisplayTitle
    ? lotTitleForDisplay(plotDisplayTitle, buildingMultiline)
    : ''
  const showLotLetter = Boolean(lotLetter)
  const showLotTitle = Boolean(lotTitleText)
  const lotSizes = cachedLotLabelSizes(
    cityCellPx,
    lotTitleText || lotLetter || 'Lot',
    showLotLetter && showLotTitle,
    compact
  )

  const tooltip =
    isClaimed && builtCard?.type === 'anchor'
      ? anchorTooltip(builtCard)
      : highDensityHousingLot
        ? 'Large housing structure (high density) — neon outline is your founder color. Takeover dice on this city block: −1 defender influence per high-density housing lot in the district.'
        : undefined

  const claimStyle: CSSProperties = plot.anchorInfluenceSuppressed
    ? {
        backgroundColor: '#1e1e28',
        boxShadow: 'inset 0 0 10px rgba(0,0,0,0.55)',
        opacity: 0.82,
        filter: 'saturate(0.35) brightness(0.88)',
      }
    : isClaimed && claimColor
      ? {
          backgroundColor: claimColor,
          boxShadow: highDensityHousingLot
            ? `inset 0 0 10px rgba(0,0,0,0.4), 0 0 16px ${claimColor}, 0 0 32px ${claimColor}aa, 0 0 3px 1px rgba(255,255,255,0.85)`
            : `inset 0 0 8px rgba(0,0,0,0.3), 0 0 4px ${claimColor}40`,
          outline: highDensityHousingLot ? `2px solid ${claimColor}` : undefined,
          outlineOffset: highDensityHousingLot ? -2 : undefined,
        }
      : {}

  const cellBg = USE_BOARD_ART
    ? undefined
    : isClaimed
      ? undefined
      : isChurchBlockLot && !plot.builtProperty
        ? undefined
        : districtStyle?.bg || BLUEPRINT_LOT_BG
  const cellBackground = USE_BOARD_ART
    ? undefined
    : isChurchBlockLot && !isClaimed && !plot.builtProperty
      ? CHURCH_BLOCK_FILL
      : undefined

  const artClaimOverlay =
    USE_BOARD_ART && isClaimed && !plot.anchorInfluenceSuppressed
      ? {
          backgroundColor: `${claimColor ?? '#888'}99`,
          boxShadow: highDensityHousingLot
            ? `inset 0 0 8px rgba(0,0,0,0.35), 0 0 10px ${claimColor ?? '#888'}`
            : `inset 0 0 6px rgba(0,0,0,0.25)`,
        }
      : USE_BOARD_ART && plot.anchorInfluenceSuppressed
        ? {
            backgroundColor: 'rgba(30,30,40,0.55)',
            filter: 'saturate(0.4) brightness(0.9)',
          }
        : {}

  return (
    <div
      title={tooltip}
      onClick={() => onPlotClick(plot)}
      onDragOver={(e) => onDragOver(e, plot)}
      onDrop={(e) => onDrop(e, plot)}
      style={{
        background: cellBackground,
        backgroundColor: cellBg,
        ...(USE_BOARD_ART ? artClaimOverlay : claimStyle),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        overflow: 'hidden',
        position: 'relative',
        cursor: claimable ? 'pointer' : 'default',
        minHeight: 0,
        padding: '1px',
        transition:
          'opacity 180ms ease, filter 180ms ease, transform 180ms ease, box-shadow 150ms ease, border-color 150ms ease',
        ...(isElevating
          ? { animation: 'fsBuildElevate 1.6s cubic-bezier(0.22, 1, 0.36, 1) both', zIndex: 30 }
          : {}),
        ...(isFading ? { animation: 'fsAnchorInfluenceFade 1.4s ease-out both', zIndex: 28 } : {}),
        ...(!USE_BOARD_ART && isChurchBlockLot && !isClaimed
          ? {
              border: '1px solid rgba(120,220,150,0.38)',
              boxShadow: 'inset 0 0 10px rgba(0,0,0,0.22)',
            }
          : {}),
        ...(dimVacantForBuild ? { opacity: 0.38, filter: 'brightness(0.72) saturate(0.88)' } : {}),
        border: validPlacement
          ? placementBuildLens
            ? `2px solid rgba(255,255,255,0.92)`
            : `2px solid ${placementHi.solid}`
          : USE_BOARD_ART
            ? isClaimed
              ? `1px solid rgba(255,255,255,0.2)`
              : '1px solid transparent'
            : isAnchor
              ? `1px solid ${districtStyle?.border || BLUEPRINT_LOT_BORDER}88`
              : `1px solid ${isClaimed ? 'rgba(255,255,255,0.12)' : `${BLUEPRINT_LOT_BORDER}66`}`,
        boxShadow: validPlacement
          ? placementBuildLens
            ? `0 0 0 1px rgba(0,212,255,0.5), 0 0 22px ${placementHi.outer}, 0 0 48px rgba(0, 140, 220, 0.35), inset 0 0 10px ${placementHi.inner}`
            : `0 0 12px ${placementHi.outer}, inset 0 0 8px ${placementHi.inner}`
          : isWinning
            ? '0 0 20px rgba(30,174,219,0.6), inset 0 0 10px rgba(255,255,255,0.1)'
            : USE_BOARD_ART
              ? artClaimOverlay.boxShadow
              : isAnchor && !isClaimed
                ? `inset 0 0 12px ${districtStyle?.border || '#333'}30`
                : isClaimed
                  ? 'inset 0 0 6px rgba(0,0,0,0.3)'
                  : 'inset 0 1px 3px rgba(0,0,0,0.2)',
        ...(validPlacement
          ? {
              animation: placementBuildLens
                ? 'fs-build-target-pulse 1.2s ease-in-out infinite'
                : 'placement-glow 1.5s ease-in-out infinite',
              ...(placementBuildLens ? { zIndex: 14, transform: 'scale(1.02)' } : {}),
            }
          : {}),
        ...(isWinning ? { animation: 'winning-pulse 1.5s ease-in-out infinite', zIndex: 20 } : {}),
      }}
      onMouseEnter={(e) => {
        if (claimable) {
          e.currentTarget.style.borderColor = placementHi.solid
          e.currentTarget.style.boxShadow = `0 0 8px ${placementHi.hoverOuter}, inset 0 0 6px ${placementHi.hoverInner}`
        }
      }}
      onMouseLeave={(e) => {
        if (claimable && !validPlacement) {
          e.currentTarget.style.borderColor = isAnchor
            ? `${districtStyle?.border || 'rgba(255,255,255,0.1)'}88`
            : 'rgba(255,255,255,0.04)'
          e.currentTarget.style.boxShadow = isAnchor
            ? `inset 0 0 12px ${districtStyle?.border || '#333'}30`
            : 'inset 0 1px 3px rgba(0,0,0,0.2)'
        }
      }}
    >
      {(showLotLetter || showLotTitle) && !isChurchSurround && !USE_BOARD_ART ? (
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
            gap: 0,
            textAlign: 'center',
            overflow: 'hidden',
            padding: '0 1px',
          }}
        >
          {showLotLetter && lotLetter ? (
            <span
              style={{
                fontSize: lotSizes.letterPx,
                fontWeight: 800,
                letterSpacing: '0.02em',
                lineHeight: 1,
                flexShrink: 0,
                width: '100%',
                textAlign: 'center',
                color: isClaimed ? 'rgba(255,255,255,0.95)' : BLUEPRINT_LOT_TEXT,
                fontFamily: LABEL_FONT,
                textShadow: isClaimed ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
              }}
            >
              {lotLetter}
            </span>
          ) : null}

          {showLotTitle && lotTitleText ? (
            <span
              className="fs-lot-title"
              style={{
                fontSize: lotSizes.titlePx,
                fontWeight: 600,
                lineHeight: 1.05,
                color: isClaimed ? 'rgba(255,255,255,0.95)' : BLUEPRINT_LOT_TEXT,
                textAlign: 'center',
                width: '100%',
                maxWidth: '100%',
                padding: 0,
                marginTop: showLotLetter ? 0.5 : 0,
                fontFamily: LABEL_FONT,
                textShadow: isClaimed ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
              }}
            >
              {lotTitleText}
              {highDensityHousingLot && (
                <span
                  style={{
                    display: 'block',
                    fontSize: Math.max(3, lotSizes.titlePx * 0.85),
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
              )}
            </span>
          ) : null}
        </div>
      ) : null}

      {isAnchor && !isClaimed && !USE_BOARD_ART && (
        <div
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 4,
            height: 4,
            borderRadius: '50%',
            backgroundColor: districtStyle?.border || '#666',
            opacity: 0.6,
          }}
        />
      )}

      {investorStripes.length > 0 && (
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
          {investorStripes.map((s) => (
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
      )}
    </div>
  )
}

function investorStripesEqual(a: InvestorStripeView[], b: InvestorStripeView[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].key !== b[i].key || a[i].color !== b[i].color || a[i].title !== b[i].title) return false
  }
  return true
}

function boardLotPropsEqual(prev: BoardLotProps, next: BoardLotProps): boolean {
  return (
    plotVisualEqual(prev.plot, next.plot) &&
    prev.builtCard?.id === next.builtCard?.id &&
    prev.claimColor === next.claimColor &&
    prev.validPlacement === next.validPlacement &&
    prev.claimable === next.claimable &&
    prev.isWinning === next.isWinning &&
    prev.placementBuildLens === next.placementBuildLens &&
    prev.dimVacantForBuild === next.dimVacantForBuild &&
    prev.isElevating === next.isElevating &&
    prev.isFading === next.isFading &&
    prev.streetTint === next.streetTint &&
    prev.cityCellPx === next.cityCellPx &&
    prev.compact === next.compact &&
    prev.borderFs === next.borderFs &&
    prev.placementHi === next.placementHi &&
    prev.onPlotClick === next.onPlotClick &&
    prev.onDragOver === next.onDragOver &&
    prev.onDrop === next.onDrop &&
    investorStripesEqual(prev.investorStripes, next.investorStripes)
  )
}

export const BoardLot = memo(BoardLotImpl, boardLotPropsEqual)
