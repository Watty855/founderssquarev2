'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Plot, Player, COLUMNS } from '@/lib/types'
import { cn } from '@/lib/utils'
import { getPlotDistricts } from '@/lib/districts'
import { CHURCH_SURROUND_CELLS, CHURCH_BLOCK_CELLS } from '@/lib/boardData'
import { propertyCards } from '@/lib/cardData'
import { getPlotBoardLetter } from '@/lib/lotCategory'
import { BOARD_ART } from '@/lib/boardArt'

/** When true, the illustrated board image is the visual base; cells are interactive overlays.
 *  Kept off so builds, claim colors, and lot labels render as the integrated CSS board. */
const USE_BOARD_ART = false

/** Blueprint lot palette — used only when board art is off. */
const BLUEPRINT_LOT_BG = '#c5daf0'
const BLUEPRINT_LOT_BORDER = '#7aa8c8'
const BLUEPRINT_LOT_TEXT = '#0a0a0a'
const LOT_LABEL_FONT = "'Cinzel', 'Space Grotesk', serif"
/** Church 3×3 block (J10–L12) — shared green with the cathedral center cell. */
const CHURCH_BLOCK_FILL = 'linear-gradient(135deg, #1f5c34 0%, #0d3018 100%)'

/** Unified light blueprint tint for every named zoning district. */
const DISTRICT_ZONE_STYLE = {
  bg: '#bdd4eb',
  border: '#6d9ec4',
  text: BLUEPRINT_LOT_TEXT,
} as const

/** Named "[Player] Square" — entire 3×3 city block owned by one founder. */
export interface NamedSquare {
  ownerPlayerId: number
  name: string
  bounds: { minRow: number; maxRow: number; minCol: string; maxCol: string }
  lots: Array<{ row: number; col: string }>
  /** Founder color used for the highlight + label. */
  color: string
}

/** Named "[Player] Street" — a 6-lot, two-block, non-anchor-axis run owned by one founder. */
export interface NamedStreet {
  ownerPlayerId: number
  name: string
  orientation: 'horizontal' | 'vertical'
  lots: Array<{ row: number; col: string }>
  /** Connecting street segment between the two adjacent blocks (highlighted with founder color). */
  streetSegment: Array<{ row: number; col: string }>
  /** Founder color used for the highlight + label. */
  color: string
}

interface GameBoardProps {
  plots: Plot[]
  players: Player[]
  onPlotClaim: (row: number, col: string) => void
  placementMode?: {
    active: boolean
    propertyCardId: string | null
    validPlots: Plot[]
    /** When `investment`, highlights valid investment targets (same rules as build highlighting). */
    interaction?: 'build' | 'investment' | 'remove-investors' | 'hostile-takeover' | 'rezoning' | 'scandal'
  }
  onCardDrop?: (row: number, col: string, propertyInstanceId: string) => void
  winningSequence?: Array<{ row: number; col: string }>
  onPropertyClick?: (row: number, col: string) => void
  /** End-game named regions (computed by GameApp once game ends). */
  namedSquares?: NamedSquare[]
  namedStreets?: NamedStreet[]
  /** When true, draws the named-region overlays + labels on top of the grid. */
  showNamedRegions?: boolean
  /** Shown on even rounds; laid out on board rows 1–2 (Mountain border strip + first city row). */
  evenRoundBanner?: ReactNode
  /** Final-round turn strip; laid out around board rows 16–18 (mid–lower board, near horizontal ave. 17). */
  finalRoundBanner?: ReactNode
  /** Toast dock — top of board (does not cover city lots). */
  boardDockHud?: ReactNode
  /** “Action required” strip below row 21, columns C–S. */
  boardActionStrip?: ReactNode
  /** Opening pro-tip panel (grid region F4–P18). */
  openingProTip?: ReactNode
  /** When the player taps a vacant lot without property placement active (claiming is only via card build). */
  onVacantLotHint?: () => void
}

const STREET_COLS = new Set(['E', 'I', 'M', 'Q'])
const STREET_ROWS = new Set([5, 9, 13, 17])

/** Lot title font — small Cinzel so letter + full name fit inside the cell. */
function lotTitleFontSize(title: string, opts?: { anchor?: boolean; multiline?: boolean }) {
  const len = title.length
  const words = title.trim().split(/\s+/).length
  if (opts?.anchor) return len > 16 ? 'clamp(4px, 0.52vw, 5.5px)' : 'clamp(4.5px, 0.56vw, 6px)'
  if (opts?.multiline) return 'clamp(4px, 0.52vw, 5.5px)'
  if (len > 20 || words >= 3) return 'clamp(3.5px, 0.48vw, 5px)'
  if (len > 14 || words >= 2) return 'clamp(4px, 0.52vw, 5.5px)'
  if (len > 10) return 'clamp(4.5px, 0.56vw, 6px)'
  return 'clamp(5px, 0.62vw, 6.5px)'
}

function lotLetterFontSize(letter: string) {
  return letter.length > 1 ? 'clamp(4px, 0.5vw, 5.5px)' : 'clamp(4.5px, 0.55vw, 6px)'
}

/** Border terrain label — fits narrow strips along the board edge. */
function borderLabelFontSize(terrain: string, vertical: boolean) {
  const len = terrain.length
  if (vertical) return len > 7 ? 'clamp(5px, 0.55vw, 6.5px)' : 'clamp(5.5px, 0.6vw, 7px)'
  return len > 8 ? 'clamp(5px, 0.6vw, 6.5px)' : 'clamp(5.5px, 0.65vw, 7.5px)'
}

// Border terrain colors — rich and distinct
const BORDER_STYLES: Record<string, { bg: string; pattern?: string; accent: string }> = {
  'Mountain': { bg: '#3a2e1e', pattern: 'mountain', accent: '#8a7a5a' },
  'River': { bg: '#0e3560', pattern: 'river', accent: '#4a9ad0' },
  'Farmland': { bg: '#1e4020', pattern: 'farmland', accent: '#5aaa5a' },
  'Railway': { bg: '#35354a', pattern: 'railway', accent: '#b0b0cc' },
}

export function GameBoard({
  plots,
  players,
  onPlotClaim,
  placementMode,
  onCardDrop,
  winningSequence,
  onPropertyClick,
  namedSquares,
  namedStreets,
  showNamedRegions,
  evenRoundBanner,
  finalRoundBanner,
  boardDockHud,
  boardActionStrip,
  openingProTip,
  onVacantLotHint,
}: GameBoardProps) {
  /** Quick lookup for street-segment cells to tint them with the owner color when game-over. */
  const streetSegmentTint = (() => {
    if (!showNamedRegions || !namedStreets || namedStreets.length === 0) return new Map<string, string>()
    const m = new Map<string, string>()
    for (const s of namedStreets) {
      for (const cell of s.streetSegment) {
        m.set(`${cell.col}${cell.row}`, s.color)
      }
    }
    return m
  })()

  /**
   * Build elevation animation — when a lot's builtProperty appears, the structure
   * rises off the board casting a shadow from the Mountain–Railway apex (top-right
   * light source) toward the River–Farmland apex (bottom-left).
   */
  const prevBuiltKeysRef = useRef<Set<string> | null>(null)
  const [elevatingCells, setElevatingCells] = useState<Set<string>>(() => new Set())
  const prevSuppressedKeysRef = useRef<Set<string> | null>(null)
  const [fadingAnchorCells, setFadingAnchorCells] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    const builtNow = new Set<string>()
    for (const p of plots) {
      if (p.builtProperty) builtNow.add(`${p.col}${p.row}`)
    }
    const prev = prevBuiltKeysRef.current
    prevBuiltKeysRef.current = builtNow
    if (!prev) return
    const fresh: string[] = []
    builtNow.forEach((k) => {
      if (!prev.has(k)) fresh.push(k)
    })
    if (fresh.length === 0) return
    setElevatingCells((cur) => new Set([...cur, ...fresh]))
    const t = window.setTimeout(() => {
      setElevatingCells((cur) => {
        const next = new Set(cur)
        for (const k of fresh) next.delete(k)
        return next
      })
    }, 1700)
    return () => window.clearTimeout(t)
  }, [plots])

  useEffect(() => {
    const curKeys = new Set(
      plots.filter((p) => p.anchorInfluenceSuppressed).map((p) => `${p.col}${p.row}`)
    )
    const prev = prevSuppressedKeysRef.current
    prevSuppressedKeysRef.current = curKeys
    if (!prev) return
    const fresh: string[] = []
    curKeys.forEach((k) => {
      if (!prev.has(k)) fresh.push(k)
    })
    if (fresh.length === 0) return
    setFadingAnchorCells((cur) => new Set([...cur, ...fresh]))
    const t = window.setTimeout(() => {
      setFadingAnchorCells((cur) => {
        const next = new Set(cur)
        for (const k of fresh) next.delete(k)
        return next
      })
    }, 1600)
    return () => window.clearTimeout(t)
  }, [plots])

  const getPlotStyle = (plot: Plot): React.CSSProperties => {
    if (plot.anchorInfluenceSuppressed) {
      return {
        backgroundColor: '#1e1e28',
        boxShadow: 'inset 0 0 10px rgba(0,0,0,0.55)',
        opacity: 0.82,
        filter: 'saturate(0.35) brightness(0.88)',
      }
    }
    if (plot.claimedBy !== undefined) {
      const player = players.find(p => p.id === plot.claimedBy)
      if (player) {
        const highDensityHousing =
          plot.housingHighDensity === true && plot.builtProperty?.startsWith('housing')
        return {
          backgroundColor: player.color,
          boxShadow: highDensityHousing
            ? `inset 0 0 10px rgba(0,0,0,0.4), 0 0 16px ${player.color}, 0 0 32px ${player.color}aa, 0 0 3px 1px rgba(255,255,255,0.85)`
            : `inset 0 0 8px rgba(0,0,0,0.3), 0 0 4px ${player.color}40`,
          outline: highDensityHousing ? `2px solid ${player.color}` : undefined,
          outlineOffset: highDensityHousing ? -2 : undefined,
        }
      }
    }
    return {}
  }

  const isClaimable = (plot: Plot): boolean => {
    if (placementMode?.active) {
      return placementMode.validPlots.some(p => p.row === plot.row && p.col === plot.col)
    }
    return false
  }

  const isValidPlacement = (plot: Plot): boolean => {
    if (!placementMode?.active) return false
    return placementMode.validPlots.some(p => p.row === plot.row && p.col === plot.col)
  }

  const isWinningPlot = (plot: Plot): boolean => {
    if (!winningSequence) return false
    return winningSequence.some(p => p.row === plot.row && p.col === plot.col)
  }

  const handlePlotClick = (plot: Plot) => {
    if (placementMode?.active) {
      if (isValidPlacement(plot)) onPlotClaim(plot.row, plot.col)
      return
    }
    if (plot.builtProperty && onPropertyClick) {
      onPropertyClick(plot.row, plot.col)
      return
    }
    const vacantUnbuilt =
      plot.type === 'city' &&
      plot.claimedBy === undefined &&
      plot.building !== '' &&
      !plot.builtProperty
    if (vacantUnbuilt && onVacantLotHint) onVacantLotHint()
  }

  const handleDragOver = (e: React.DragEvent, plot: Plot) => {
    if (isValidPlacement(plot)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
  }

  const handleDrop = (e: React.DragEvent, plot: Plot) => {
    e.preventDefault()
    if (isValidPlacement(plot)) {
      const propertyInstanceId = e.dataTransfer.getData('propertyInstanceId')
      if (propertyInstanceId && onCardDrop) {
        onCardDrop(plot.row, plot.col, propertyInstanceId)
      }
    }
  }

  // Grid sizing — with board art, use equal fr tracks so the image maps evenly across the grid.
  const colTemplate = COLUMNS.map(col => {
    if (USE_BOARD_ART) {
      if (STREET_COLS.has(col)) return '0.12fr'
      if (col === 'A' || col === 'U') return '0.85fr'
      return '1fr'
    }
    if (col === 'A' || col === 'U') return '44px'
    if (STREET_COLS.has(col)) return '4px'
    return '1fr'
  }).join(' ')

  const rows = Array.from({ length: 21 }, (_, i) => i + 1)
  const rowTemplate = rows.map(row => {
    if (USE_BOARD_ART) {
      if (STREET_ROWS.has(row)) return '0.12fr'
      if (row === 1 || row === 21) return '0.85fr'
      return '1fr'
    }
    if (row === 1 || row === 21) return '32px'
    if (STREET_ROWS.has(row)) return '4px'
    return '1fr'
  }).join(' ')

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <style>{`
        @keyframes fsBuildElevate {
          0%   { transform: translate(0, 0) scale(1); filter: drop-shadow(0 0 0 rgba(0,0,0,0)); }
          22%  { transform: translate(4px, -8px) scale(1.22); filter: drop-shadow(-12px 14px 12px rgba(0,0,0,0.7)) brightness(1.18); }
          60%  { transform: translate(3px, -6px) scale(1.16); filter: drop-shadow(-9px 11px 10px rgba(0,0,0,0.55)) brightness(1.1); }
          100% { transform: translate(0, 0) scale(1); filter: drop-shadow(0 0 0 rgba(0,0,0,0)); }
        }
        @keyframes fsAnchorInfluenceFade {
          0%   { filter: saturate(1) brightness(1); opacity: 1; }
          100% { filter: saturate(0.35) brightness(0.88); opacity: 0.82; }
        }
        @keyframes fsMastheadShimmer {
          0%, 100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
        @media (max-width: 767px) {
          .fs-board-masthead { display: none !important; }
        }
      `}</style>

      {/* Masthead — Founders Square title above the board */}
      <div
        aria-label="Founders Square"
        className="fs-board-masthead"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          margin: '0 auto 8px',
          maxWidth: 1400,
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        <div
          style={{
            fontFamily: "'Cinzel', 'Space Grotesk', serif",
            fontWeight: 800,
            fontSize: 'clamp(22px, 3.2vw, 40px)',
            lineHeight: 1.05,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            backgroundImage:
              'linear-gradient(100deg, #d8b75a 0%, #f6e8b0 22%, #caa53f 45%, #fdf6d8 60%, #d8b75a 80%, #f1df9d 100%)',
            backgroundSize: '220% 100%',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            animation: 'fsMastheadShimmer 9s ease-in-out infinite',
            filter: 'drop-shadow(0 2px 10px rgba(216,183,90,0.35)) drop-shadow(0 1px 1px rgba(0,0,0,0.8))',
            whiteSpace: 'nowrap',
          }}
        >
          Founders Square
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: 'min(520px, 70%)',
          }}
        >
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #d8b75a88)' }} />
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.42em',
              textTransform: 'uppercase',
              color: 'rgba(216,183,90,0.75)',
              fontFamily: 'var(--font-jetbrains-mono), monospace',
              whiteSpace: 'nowrap',
            }}
          >
            Build · Influence · Prosper
          </span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, transparent, #d8b75a88)' }} />
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          width: '100%',
          flex: USE_BOARD_ART ? '1 1 auto' : undefined,
          height: USE_BOARD_ART ? undefined : undefined,
          maxWidth: 1600,
          maxHeight: USE_BOARD_ART ? '100%' : undefined,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          containerType: USE_BOARD_ART ? 'size' : undefined,
          ...(boardDockHud != null || boardActionStrip != null
            ? { paddingBottom: boardActionStrip != null ? 44 : 8 }
            : {}),
        }}
      >
        <div
          className={USE_BOARD_ART ? 'fs-board-art-surface' : undefined}
          style={{
            display: 'grid',
            gridTemplateColumns: colTemplate,
            gridTemplateRows: rowTemplate,
            ...(USE_BOARD_ART
              ? {
                  // Largest size that fits the container while keeping art aspect ratio.
                  width: 'min(100cqw, calc(100cqh * 1672 / 941))',
                  height: 'auto',
                  aspectRatio: `${BOARD_ART.width} / ${BOARD_ART.height}`,
                  backgroundImage: `url(${BOARD_ART.src})`,
                  backgroundSize: '100% 100%',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }
              : {
                  // Fit the board area (not full viewport width) so phone layouts
                  // with a players strip still show a readable board.
                  width: '100%',
                  maxWidth: 1400,
                  maxHeight: '100%',
                  height: 'auto',
                  aspectRatio: '21 / 9',
                }),
            flexShrink: 0,
            borderRadius: USE_BOARD_ART ? 8 : 16,
            overflow: 'hidden',
            border: 'none',
            boxShadow: USE_BOARD_ART
              ? '0 0 40px rgba(0,0,0,0.65)'
              : '0 0 60px rgba(0,0,0,0.5), 0 0 120px rgba(0,112,204,0.05), inset 0 0 80px rgba(0,0,0,0.3)',
          }}
        >
        {plots.map((plot, index) => {
          const claimable = isClaimable(plot)
          const validPlacement = isValidPlacement(plot)
          const placementHi =
            placementMode?.interaction === 'investment'
              ? { solid: '#22c55e', outer: 'rgba(34,197,94,0.45)', inner: 'rgba(34,197,94,0.18)', hoverOuter: 'rgba(74,222,128,0.35)', hoverInner: 'rgba(74,222,128,0.12)' }
              : placementMode?.interaction === 'remove-investors'
                ? {
                    solid: '#f472b6',
                    outer: 'rgba(244,114,182,0.48)',
                    inner: 'rgba(244,114,182,0.2)',
                    hoverOuter: 'rgba(251,113,133,0.42)',
                    hoverInner: 'rgba(251,113,133,0.14)',
                  }
              : placementMode?.interaction === 'hostile-takeover'
                ? {
                    solid: '#f59e0b',
                    outer: 'rgba(245,158,11,0.45)',
                    inner: 'rgba(245,158,11,0.2)',
                    hoverOuter: 'rgba(251,191,36,0.4)',
                    hoverInner: 'rgba(251,191,36,0.14)',
                  }
                : placementMode?.interaction === 'scandal'
                  ? {
                      solid: '#e879f9',
                      outer: 'rgba(232,121,249,0.48)',
                      inner: 'rgba(232,121,249,0.2)',
                      hoverOuter: 'rgba(244,171,255,0.42)',
                      hoverInner: 'rgba(244,171,255,0.14)',
                    }
                : placementMode?.interaction === 'rezoning'
                  ? {
                      solid: '#a78bfa',
                      outer: 'rgba(167,139,250,0.48)',
                      inner: 'rgba(167,139,250,0.2)',
                      hoverOuter: 'rgba(196,181,253,0.42)',
                      hoverInner: 'rgba(196,181,253,0.14)',
                    }
                  : { solid: '#1eaedb', outer: 'rgba(30,174,219,0.4)', inner: 'rgba(30,174,219,0.15)', hoverOuter: 'rgba(30,174,219,0.3)', hoverInner: 'rgba(30,174,219,0.1)' }
          const isWinning = isWinningPlot(plot)
          const isCathedral = plot.type === 'cathedral'
          const isStreet = plot.type === 'street'
          const isBorder = plot.type === 'border'
          const isCity = plot.type === 'city'
          const plotCellKey = `${plot.col}${plot.row}`
          const isChurchSurround =
            isCity &&
            CHURCH_SURROUND_CELLS.has(plotCellKey) &&
            !plot.builtProperty
          const isChurchBlockLot =
            isCity && CHURCH_BLOCK_CELLS.has(plotCellKey) && !isCathedral
          const placementBuildLens =
            placementMode?.active === true &&
            placementMode.interaction === 'build' &&
            (placementMode.validPlots?.length ?? 0) > 0
          const dimVacantCityForBuild =
            isCity &&
            placementBuildLens &&
            !validPlacement &&
            !plot.builtProperty
          const districtList = isCity ? getPlotDistricts(plot.row, plot.col) : []
          const districtStyle = districtList.length > 0 ? DISTRICT_ZONE_STYLE : null
          const borderStyle = isBorder && plot.building ? BORDER_STYLES[plot.building] : null
          const isAnchor =
            plot.building === 'Anchor' || plot.building === 'Anchor Tenet' || plot.building === 'Union'
          const isClaimed = plot.claimedBy !== undefined
          const builtPropertyCard = plot.builtProperty
            ? propertyCards.find((c) => c.id === plot.builtProperty)
            : undefined
          const anchorTenetTitle =
            isAnchor && builtPropertyCard?.type === 'anchor' ? builtPropertyCard.name : null
          const plotDisplayTitle =
            anchorTenetTitle ?? (isCity && plot.building ? plot.building : '')
          const buildingMultiline =
            !anchorTenetTitle && isCity && plot.building != null && plot.building.includes('\n')
          const lotLetter =
            isCity && plot.building && !buildingMultiline
              ? getPlotBoardLetter(plot, builtPropertyCard)
              : null
          const highDensityHousingLot =
            isClaimed &&
            plot.housingHighDensity === true &&
            (plot.builtProperty?.startsWith('housing') ?? false)

          const churchAnchorTooltip =
            isClaimed && builtPropertyCard?.type === 'anchor' && builtPropertyCard?.id === 'church'
              ? `INFLUENCE: +1 (entire board; max +1)\nINCOME: +1 (block)\nChurch affiliation created!\nEnd game value: ${builtPropertyCard.endGameValue}M (if played and built or banked)\nBuild: Any center anchor tenet (AT) except Union and any already-built anchor tenets`
              : undefined
          const farmCoopAnchorTooltip =
            isClaimed && builtPropertyCard?.type === 'anchor' && builtPropertyCard?.id === 'farm-coop'
              ? `INFLUENCE: +1 (Farmland)\nINCOME: +1 (block)\nTAKEOVER (Hostile Takeover): +1 on Farmland targets (evaluated on target block)\nFarm Bureau formed!\nEnd game value: ${builtPropertyCard.endGameValue}M (if played and built or banked)\nBuild: Any center AT adjacent to farmland except Union and already-built anchor tenets`
              : undefined
          const portAuthorityAnchorTooltip =
            isClaimed && builtPropertyCard?.type === 'anchor' && builtPropertyCard?.id === 'port-authority'
              ? `INFLUENCE: +1 (Railway district)\nINCOME: +1 (block)\nTAKEOVER (Hostile Takeover): +1 on Railway district targets (evaluated on target block)\nPort Authority engineered!\nEnd game value: ${builtPropertyCard.endGameValue}M (if played and built or banked)\nBuild: Any center AT adjacent to the railway district except Union and already-built anchor tenets`
              : undefined
          const artsCouncilAnchorTooltip =
            isClaimed && builtPropertyCard?.type === 'anchor' && builtPropertyCard?.id === 'arts-council'
              ? `INFLUENCE: +1 (River Front)\nINCOME: +1 (block)\nTAKEOVER (Hostile Takeover): +1 on River Front targets (evaluated on target block)\nArts Council crafted!\nEnd game value: ${builtPropertyCard.endGameValue}M (if played and built or banked)\nBuild: Any center AT adjacent to the riverfront district except Union and already-built anchor tenets`
              : undefined
          const tourismOfficeAnchorTooltip =
            isClaimed && builtPropertyCard?.type === 'anchor' && builtPropertyCard?.id === 'tourism-office'
              ? `INFLUENCE: +1 (Mountain Cove)\nINCOME: +1 (block)\nTAKEOVER (Hostile Takeover): +1 on Mountain Cove targets (evaluated on target block)\nTourism office conceived!\nEnd game value: ${builtPropertyCard.endGameValue}M (if played and built or banked)\nBuild: Any center AT adjacent to the mountain cove district except Union and already-built anchor tenets`
              : undefined
          const influencerAnchorTooltip =
            isClaimed && builtPropertyCard?.type === 'anchor' && builtPropertyCard?.id === 'media'
              ? `INFLUENCE: +1 (Scandals only; max +1 with News Outlet)\nINCOME: +1 (block)\nSocial media influencer launched!\nEnd game value: ${builtPropertyCard.endGameValue}M (if played and built or banked)\nBuild: Any center anchor tenet (AT) except Union and already-built anchor tenets`
              : undefined
          const newsOutletAnchorTooltip =
            isClaimed && builtPropertyCard?.type === 'anchor' && builtPropertyCard?.id === 'news-outlet'
              ? `INFLUENCE: +1 (Scandals only; max +1 with Influencer)\nINCOME: +1 (block)\nNews Outlet originated!\nEnd game value: ${builtPropertyCard.endGameValue}M (if played and built or banked)\nBuild: Any center anchor tenet (AT) except Union and already-built anchor tenets`
              : undefined
          const mafiaAnchorTooltip =
            isClaimed && builtPropertyCard?.type === 'anchor' && builtPropertyCard?.id === 'mafia'
              ? `INFLUENCE: +1 (takeover, same city block)\nINCOME: +1 (block)\nEXTORTION: Opponents pay $1M per covered non-anchor business lot to each Mafia owner in the block when they roll property income.\nMafia infiltrated!\nEnd game value: ${builtPropertyCard.endGameValue}M (if played and built or banked)\nBuild: Any center anchor tenet (AT) except Union and already-built anchor tenets`
              : undefined
          const regulationBureauAnchorTooltip =
            isClaimed && builtPropertyCard?.type === 'anchor' && builtPropertyCard?.id === 'regulation-bureau'
              ? `INFLUENCE: +1 (block) / −1 for rivals (takeover only)\nINCOME: +1 (block)\nTAKEOVER: Other players' lots in this block have −1 takeover influence vs Hostile Takeover (+1 attacker roll per distinct non-defender bureau in block).\nRegulation Bureau established!\nEnd game value: ${builtPropertyCard.endGameValue}M (if played and built or banked)\nBuild: Any center anchor tenet (AT) except Union and already-built anchor tenets`
              : undefined
          const unionAnchorTooltip =
            isClaimed && builtPropertyCard?.type === 'anchor' && builtPropertyCard?.id === 'union'
              ? `INFLUENCE: +1 (district where Union was played)\nINCOME: +$M on your other lots on this block (Church-style); rivals’ lots on this block −$M on their Income (lost, not paid to you)\nEnd game value: ${builtPropertyCard.endGameValue}M (if played and built or banked)\nBuild: Union designated anchors only`
              : undefined
          const claimingPlayer = isClaimed ? players.find((p) => p.id === plot.claimedBy) : undefined

          // Street cells
          if (isStreet) {
            const tint = streetSegmentTint.get(`${plot.col}${plot.row}`)
            return (
              <div
                key={index}
                style={{
                  backgroundColor: tint
                    ? tint
                    : USE_BOARD_ART
                      ? 'transparent'
                      : '#08080e',
                  boxShadow: tint
                    ? `0 0 12px ${tint}, inset 0 0 8px ${tint}`
                    : undefined,
                  borderTop:
                    !USE_BOARD_ART && STREET_ROWS.has(plot.row)
                      ? '1px solid rgba(255,255,255,0.03)'
                      : 'none',
                  borderLeft:
                    !USE_BOARD_ART && STREET_COLS.has(plot.col)
                      ? '1px solid rgba(255,255,255,0.03)'
                      : 'none',
                  transition: 'background-color 600ms ease, box-shadow 600ms ease',
                }}
              />
            )
          }

          // Border cells (Mountain, River, Farmland, Railway)
          if (isBorder) {
            if (USE_BOARD_ART) {
              return <div key={index} title={plot.building} style={{ background: 'transparent' }} />
            }
            const isVerticalBorder = plot.col === 'A' || plot.col === 'U'
            const terrain = plot.building ?? ''
            const accent = borderStyle?.accent || '#666'

            return (
              <div
                key={index}
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
                  <span style={{
                    fontSize: borderLabelFontSize(terrain, isVerticalBorder),
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
                  }}>
                    {terrain}
                  </span>
                ) : null}
              </div>
            )
          }

          // Cathedral (Church) — center of the 3×3 church block
          if (isCathedral) {
            if (USE_BOARD_ART) {
              return (
                <div
                  key={index}
                  title="Church"
                  style={{ background: 'transparent', cursor: 'not-allowed' }}
                />
              )
            }
            return (
              <div
                key={index}
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
                <span style={{
                  fontSize: 'clamp(5px, 0.62vw, 7px)',
                  fontWeight: 800,
                  fontFamily: LOT_LABEL_FONT,
                  color: '#e8f8ec',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  lineHeight: 1.1,
                  textShadow: '0 1px 2px rgba(0,0,0,0.55)',
                }}>
                  Church
                </span>
              </div>
            )
          }

          // City cells
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
          const claimStyle = getPlotStyle(plot)
          const artClaimOverlay =
            USE_BOARD_ART && isClaimed && !plot.anchorInfluenceSuppressed
              ? {
                  backgroundColor: `${claimingPlayer?.color ?? '#888'}99`,
                  boxShadow: highDensityHousingLot
                    ? `inset 0 0 8px rgba(0,0,0,0.35), 0 0 10px ${claimingPlayer?.color ?? '#888'}`
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
              key={index}
              title={
                unionAnchorTooltip ??
                mafiaAnchorTooltip ??
                regulationBureauAnchorTooltip ??
                newsOutletAnchorTooltip ??
                tourismOfficeAnchorTooltip ??
                influencerAnchorTooltip ??
                artsCouncilAnchorTooltip ??
                portAuthorityAnchorTooltip ??
                farmCoopAnchorTooltip ??
                churchAnchorTooltip ??
                (highDensityHousingLot
                  ? 'Large housing structure (high density) — neon outline is your founder color. Takeover dice on this city block: −1 defender influence per high-density housing lot in the district.'
                  : undefined)
              }
              onClick={() => handlePlotClick(plot)}
              onDragOver={(e) => handleDragOver(e, plot)}
              onDrop={(e) => handleDrop(e, plot)}
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
                padding: '2px',
                transition: 'opacity 180ms ease, filter 180ms ease, transform 180ms ease, box-shadow 150ms ease, border-color 150ms ease',
                ...(elevatingCells.has(`${plot.col}${plot.row}`)
                  ? { animation: 'fsBuildElevate 1.6s cubic-bezier(0.22, 1, 0.36, 1) both', zIndex: 30 }
                  : {}),
                ...(fadingAnchorCells.has(`${plot.col}${plot.row}`)
                  ? { animation: 'fsAnchorInfluenceFade 1.4s ease-out both', zIndex: 28 }
                  : {}),
                ...(!USE_BOARD_ART && isChurchBlockLot && !isClaimed
                  ? {
                      border: '1px solid rgba(120,220,150,0.38)',
                      boxShadow: 'inset 0 0 10px rgba(0,0,0,0.22)',
                    }
                  : {}),
                ...(dimVacantCityForBuild
                  ? { opacity: 0.38, filter: 'brightness(0.72) saturate(0.88)' }
                  : {}),
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
                      animation:
                        placementBuildLens
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
              {(lotLetter || plotDisplayTitle) && !isChurchSurround && !USE_BOARD_ART ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 1,
                    width: '100%',
                    minHeight: 0,
                    gap: 1,
                    textAlign: 'center',
                  }}
                >
                  {lotLetter ? (
                    <span
                      style={{
                        fontSize: lotLetterFontSize(lotLetter),
                        fontWeight: 800,
                        letterSpacing: '0.06em',
                        lineHeight: 1,
                        flexShrink: 0,
                        width: '100%',
                        textAlign: 'center',
                        color: isClaimed ? 'rgba(255,255,255,0.95)' : BLUEPRINT_LOT_TEXT,
                        fontFamily: LOT_LABEL_FONT,
                        textShadow: isClaimed ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
                      }}
                    >
                      {lotLetter}
                    </span>
                  ) : null}

                  {plotDisplayTitle ? (
                    <span
                      style={{
                        fontSize: lotTitleFontSize(plotDisplayTitle, {
                          anchor: !!anchorTenetTitle,
                          multiline: buildingMultiline,
                        }),
                        fontWeight: 700,
                        lineHeight: 1.06,
                        color: isClaimed ? 'rgba(255,255,255,0.95)' : BLUEPRINT_LOT_TEXT,
                        textAlign: 'center',
                        whiteSpace: anchorTenetTitle || buildingMultiline ? 'pre-line' : 'normal',
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                        hyphens: 'auto',
                        display: 'block',
                        width: '100%',
                        padding: '0 1px',
                        fontFamily: LOT_LABEL_FONT,
                        textShadow: isClaimed ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
                      }}
                    >
                      {plotDisplayTitle}
                      {highDensityHousingLot && (
                        <span
                          style={{
                            display: 'block',
                            fontSize: 5,
                            fontWeight: 800,
                            letterSpacing: '0.06em',
                            color: '#fef9c3',
                            textShadow: claimingPlayer
                              ? `0 0 8px ${claimingPlayer.color}, 0 0 12px rgba(255,255,255,0.9)`
                              : '0 0 8px #fff',
                            marginTop: 2,
                          }}
                        >
                          HIGH-DENSITY
                        </span>
                      )}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {/* Anchor/Union special marker */}
              {isAnchor && !isClaimed && !USE_BOARD_ART && (
                <div style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  backgroundColor: districtStyle?.border || '#666',
                  opacity: 0.6,
                }} />
              )}

              {/* Investment stripes (investor founder colors along bottom edge) */}
              {plot.investmentStripes && plot.investmentStripes.length > 0 && (
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
                  {plot.investmentStripes.map((s, si) => {
                    const inv = players.find((x) => x.id === s.investorId)
                    return (
                      <div
                        key={`${s.investorId}-${si}-${s.contributionMillion}`}
                        title={inv ? `${inv.name} — $${s.contributionMillion}M invested` : `$${s.contributionMillion}M invested`}
                        style={{
                          height: 4,
                          width: '100%',
                          background: inv?.color ?? '#94a3b8',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
                        }}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        {/* Named end-game regions: Squares (whole blocks) and Streets (6-lot runs).
            Rendered after the plots so labels and outlines layer on top. Pointer-events disabled. */}
        {showNamedRegions && namedSquares && namedSquares.length > 0 ? (
          <>
            <style>{`
              @keyframes fsNamedRegionPulse {
                0%, 100% { box-shadow: 0 0 0 2px var(--region-color), inset 0 0 24px var(--region-glow); }
                50%      { box-shadow: 0 0 0 3px var(--region-color), inset 0 0 36px var(--region-glow), 0 0 32px var(--region-color); }
              }
            `}</style>
            {namedSquares.map((sq, idx) => {
              const colStart = COLUMNS.indexOf(sq.bounds.minCol) + 1
              const colEnd = COLUMNS.indexOf(sq.bounds.maxCol) + 2
              const rowStart = sq.bounds.minRow
              const rowEnd = sq.bounds.maxRow + 1
              return (
                <div
                  key={`square-${idx}`}
                  style={{
                    gridColumn: `${colStart} / ${colEnd}`,
                    gridRow: `${rowStart} / ${rowEnd}`,
                    position: 'relative',
                    pointerEvents: 'none',
                    zIndex: 25,
                    borderRadius: 6,
                    border: `2px solid ${sq.color}`,
                    background: `radial-gradient(circle at 50% 50%, ${sq.color}26 0%, transparent 70%)`,
                    boxShadow: `0 0 24px ${sq.color}, inset 0 0 24px ${sq.color}55`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    ['--region-color' as never]: sq.color,
                    ['--region-glow' as never]: `${sq.color}55`,
                    animation: 'fsNamedRegionPulse 2.6s ease-in-out infinite',
                  } as React.CSSProperties}
                >
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      backgroundColor: 'rgba(0,0,0,0.55)',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      textShadow: `0 0 8px ${sq.color}`,
                      border: `1px solid ${sq.color}aa`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {sq.name}
                  </span>
                </div>
              )
            })}
          </>
        ) : null}
        {showNamedRegions && namedStreets && namedStreets.length > 0
          ? namedStreets.map((st, idx) => {
              // Label sits over the connecting street segment between the two adjacent blocks.
              const segRows = st.streetSegment.map((c) => c.row)
              const segCols = st.streetSegment.map((c) => COLUMNS.indexOf(c.col))
              if (segRows.length === 0 || segCols.length === 0) return null
              const minR = Math.min(...segRows)
              const maxR = Math.max(...segRows)
              const minC = Math.min(...segCols)
              const maxC = Math.max(...segCols)
              return (
                <div
                  key={`street-${idx}`}
                  style={{
                    gridColumn: `${minC + 1} / ${maxC + 2}`,
                    gridRow: `${minR} / ${maxR + 2}`,
                    position: 'relative',
                    pointerEvents: 'none',
                    zIndex: 26,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    style={{
                      padding: '3px 9px',
                      borderRadius: 999,
                      backgroundColor: 'rgba(0,0,0,0.7)',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      textShadow: `0 0 8px ${st.color}`,
                      border: `1px solid ${st.color}aa`,
                      writingMode: st.orientation === 'vertical' ? 'horizontal-tb' : undefined,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {st.name}
                  </span>
                </div>
              )
            })
          : null}
      </div>

      {evenRoundBanner != null ||
      finalRoundBanner != null ||
      boardDockHud != null ||
      boardActionStrip != null ||
      openingProTip != null ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            gridTemplateColumns: colTemplate,
            gridTemplateRows: rowTemplate,
            pointerEvents: 'none',
            zIndex: 38,
            borderRadius: 16,
            overflow: 'visible',
          }}
        >
          {evenRoundBanner != null ? (
            <div
              style={{
                gridColumn: '1 / -1',
                gridRow: '18 / 19',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 8px',
                zIndex: 41,
              }}
            >
              {evenRoundBanner}
            </div>
          ) : null}
          {finalRoundBanner != null ? (
            <div
              style={{
                gridColumn: '1 / -1',
                gridRow: '16 / 19',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 6px',
                zIndex: 39,
              }}
            >
              {finalRoundBanner}
            </div>
          ) : null}
          {boardDockHud != null ? (
            <div
              aria-label="Game activity toasts"
              style={{
                gridColumn: `${COLUMNS.indexOf('C') + 1} / ${COLUMNS.indexOf('S') + 2}`,
                gridRow: '2 / 4',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: '2px 4px 0',
                zIndex: 94,
                overflow: 'visible',
                pointerEvents: 'none',
              }}
            >
              <div style={{ pointerEvents: 'auto', width: '100%', maxWidth: '100%' }}>{boardDockHud}</div>
            </div>
          ) : null}
          {openingProTip != null ? (
            <div
              aria-label="Opening pro-tip"
              style={{
                gridColumn: `${COLUMNS.indexOf('F') + 1} / ${COLUMNS.indexOf('P') + 2}`,
                gridRow: '4 / 19',
                display: 'flex',
                alignItems: 'stretch',
                justifyContent: 'stretch',
                padding: '1px',
                zIndex: 46,
                overflow: 'hidden',
                pointerEvents: 'auto',
              }}
            >
              {openingProTip}
            </div>
          ) : null}
          {boardActionStrip != null ? (
            <div
              aria-label="Turn and card-play status"
              style={{
                gridColumn: `${COLUMNS.indexOf('C') + 1} / ${COLUMNS.indexOf('S') + 2}`,
                gridRow: '21 / 22',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'stretch',
                padding: 0,
                zIndex: 95,
                overflow: 'visible',
              }}
            >
              <div
                style={{
                  pointerEvents: 'auto',
                  width: '100%',
                  transform: 'translateY(100%)',
                }}
              >
                {boardActionStrip}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      </div>
    </div>
  )
}
