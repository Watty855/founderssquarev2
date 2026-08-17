'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from 'react'
import { Plot, Player, COLUMNS } from '@/lib/types'
import { propertyCards } from '@/lib/cardData'
import { coordKeySet, plotCoordKey } from '@/lib/boardIndex'
import {
  BoardLot,
  USE_BOARD_ART,
  borderLabelPx,
  type InvestorStripeView,
  type PlacementHi,
} from '@/components/game/BoardLot'
import { BOARD_ART } from '@/lib/boardArt'

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
  /** Phone / compact chrome — smaller terrain strips, hide masthead, pixel-scaled lot labels. */
  compact?: boolean
}

const STREET_COLS = new Set(['E', 'I', 'M', 'Q'])
const STREET_ROWS = new Set([5, 9, 13, 17])

const BOARD_ASPECT = 21 / 9
const STREET_TRACK_PX = 4
const STREET_COL_COUNT = 4
const STREET_ROW_COUNT = 4

const EMPTY_STRIPES: InvestorStripeView[] = []

const PLACEMENT_HI: Record<string, PlacementHi> = {
  investment: {
    solid: '#22c55e',
    outer: 'rgba(34,197,94,0.45)',
    inner: 'rgba(34,197,94,0.18)',
    hoverOuter: 'rgba(74,222,128,0.35)',
    hoverInner: 'rgba(74,222,128,0.12)',
  },
  'remove-investors': {
    solid: '#f472b6',
    outer: 'rgba(244,114,182,0.48)',
    inner: 'rgba(244,114,182,0.2)',
    hoverOuter: 'rgba(251,113,133,0.42)',
    hoverInner: 'rgba(251,113,133,0.14)',
  },
  'hostile-takeover': {
    solid: '#f59e0b',
    outer: 'rgba(245,158,11,0.45)',
    inner: 'rgba(245,158,11,0.2)',
    hoverOuter: 'rgba(251,191,36,0.4)',
    hoverInner: 'rgba(251,191,36,0.14)',
  },
  scandal: {
    solid: '#e879f9',
    outer: 'rgba(232,121,249,0.48)',
    inner: 'rgba(232,121,249,0.2)',
    hoverOuter: 'rgba(244,171,255,0.42)',
    hoverInner: 'rgba(244,171,255,0.14)',
  },
  rezoning: {
    solid: '#a78bfa',
    outer: 'rgba(167,139,250,0.48)',
    inner: 'rgba(167,139,250,0.2)',
    hoverOuter: 'rgba(196,181,253,0.42)',
    hoverInner: 'rgba(196,181,253,0.14)',
  },
  build: {
    solid: '#1eaedb',
    outer: 'rgba(30,174,219,0.4)',
    inner: 'rgba(30,174,219,0.15)',
    hoverOuter: 'rgba(30,174,219,0.3)',
    hoverInner: 'rgba(30,174,219,0.1)',
  },
}

/** City lot size from grid fr tracks (terrain strips + hairline streets are thinner than city blocks). */
function computeCityCellPx(gridW: number, gridH: number, compact: boolean): number {
  const terrainFr = compact ? 0.35 : 0.4
  const streetPx = STREET_TRACK_PX * STREET_COL_COUNT
  const colFr = 17 + terrainFr * 2
  const cityColW = Math.max(0, (gridW - streetPx) / colFr)

  const streetRowPx = STREET_TRACK_PX * STREET_ROW_COUNT
  const rowFr = 15 + terrainFr * 2
  const cityRowH = Math.max(0, (gridH - streetRowPx) / rowFr)

  return Math.min(cityColW, cityRowH)
}

function fitBoardDimensions(containerW: number, containerH: number): { w: number; h: number } {
  if (containerW <= 0 || containerH <= 0) return { w: 0, h: 0 }
  const widthLed = containerW
  const heightFromWidth = widthLed / BOARD_ASPECT
  if (heightFromWidth <= containerH) return { w: widthLed, h: heightFromWidth }
  const heightLed = containerH
  return { w: heightLed * BOARD_ASPECT, h: heightLed }
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
  compact = false,
}: GameBoardProps) {
  const fitRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [fitSize, setFitSize] = useState({ w: 800, h: 360 })
  const [gridSize, setGridSize] = useState({ w: 800, h: 340 })

  useEffect(() => {
    const fitEl = fitRef.current
    const gridEl = gridRef.current
    if (!fitEl || !gridEl) return

    const update = () => {
      const fitRect = fitEl.getBoundingClientRect()
      if (fitRect.width > 0 && fitRect.height > 0) {
        setFitSize({ w: fitRect.width, h: fitRect.height })
      }
      const gridRect = gridEl.getBoundingClientRect()
      if (gridRect.width > 0 && gridRect.height > 0) {
        setGridSize({ w: gridRect.width, h: gridRect.height })
      }
    }

    const ro = new ResizeObserver(update)
    ro.observe(fitEl)
    ro.observe(gridEl)
    update()
    return () => ro.disconnect()
  }, [])

  const boardDimensions = fitBoardDimensions(fitSize.w, fitSize.h)
  const cityCellPx = computeCityCellPx(gridSize.w, gridSize.h, compact)
  const borderFs = borderLabelPx(cityCellPx, compact)
  const terrainFr = compact ? '0.35fr' : '0.4fr'

  const streetSegmentTint = useMemo(() => {
    if (!showNamedRegions || !namedStreets || namedStreets.length === 0) return new Map<string, string>()
    const m = new Map<string, string>()
    for (const s of namedStreets) {
      for (const cell of s.streetSegment) {
        m.set(`${cell.col}${cell.row}`, s.color)
      }
    }
    return m
  }, [showNamedRegions, namedStreets])

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

  const validPlotsKey =
    placementMode?.active && placementMode.validPlots
      ? placementMode.validPlots.map((p) => `${p.col}${p.row}`).join(',')
      : ''
  const validPlotKeys = useMemo(
    () => (placementMode?.active ? coordKeySet(placementMode.validPlots) : new Set<string>()),
    // Serialize lot keys so a new validPlots array with the same cells does not
    // rebuild the Set (that busted BoardLot memo on every GameApp render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placementMode?.active, validPlotsKey]
  )
  const winningPlotKeys = useMemo(() => coordKeySet(winningSequence), [winningSequence])
  const playerById = useMemo(() => {
    const m = new Map<number, Player>()
    for (const p of players) m.set(p.id, p)
    return m
  }, [players])
  const propertyCardById = useMemo(() => {
    const m = new Map<string, (typeof propertyCards)[number]>()
    for (const c of propertyCards) m.set(c.id, c)
    return m
  }, [])

  const placementHi = useMemo(() => {
    const kind = placementMode?.interaction ?? 'build'
    return PLACEMENT_HI[kind] ?? PLACEMENT_HI.build
  }, [placementMode?.interaction])

  const placementBuildLens =
    placementMode?.active === true &&
    placementMode.interaction === 'build' &&
    (placementMode.validPlots?.length ?? 0) > 0

  const handlePlotClick = useCallback(
    (plot: Plot) => {
      if (placementMode?.active) {
        if (validPlotKeys.has(plotCoordKey(plot.col, plot.row))) onPlotClaim(plot.row, plot.col)
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
    },
    [placementMode?.active, validPlotKeys, onPlotClaim, onPropertyClick, onVacantLotHint]
  )

  const handleDragOver = useCallback(
    (e: DragEvent, plot: Plot) => {
      if (placementMode?.active === true && validPlotKeys.has(plotCoordKey(plot.col, plot.row))) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }
    },
    [placementMode?.active, validPlotKeys]
  )

  const handleDrop = useCallback(
    (e: DragEvent, plot: Plot) => {
      e.preventDefault()
      if (placementMode?.active === true && validPlotKeys.has(plotCoordKey(plot.col, plot.row))) {
        const propertyInstanceId = e.dataTransfer.getData('propertyInstanceId')
        if (propertyInstanceId && onCardDrop) {
          onCardDrop(plot.row, plot.col, propertyInstanceId)
        }
      }
    },
    [placementMode?.active, validPlotKeys, onCardDrop]
  )

  const colTemplate = COLUMNS.map((col) => {
    if (STREET_COLS.has(col)) return '4px'
    if (col === 'A' || col === 'U') return terrainFr
    return '1fr'
  }).join(' ')

  const rows = Array.from({ length: 21 }, (_, i) => i + 1)
  const rowTemplate = rows
    .map((row) => {
      if (STREET_ROWS.has(row)) return '4px'
      if (row === 1 || row === 21) return terrainFr
      return '1fr'
    })
    .join(' ')

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
        .fs-board-masthead.fs-board-masthead--compact { display: none !important; }
        .fs-lot-title {
          overflow: visible;
          white-space: normal;
          word-break: break-word;
          overflow-wrap: break-word;
          hyphens: none;
        }
      `}</style>

      {!compact ? (
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
              filter:
                'drop-shadow(0 2px 10px rgba(216,183,90,0.35)) drop-shadow(0 1px 1px rgba(0,0,0,0.8))',
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
            <div
              style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #d8b75a88)' }}
            />
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
            <div
              style={{
                flex: 1,
                height: 1,
                background: 'linear-gradient(270deg, transparent, #d8b75a88)',
              }}
            />
          </div>
        </div>
      ) : null}

      <div
        ref={fitRef}
        className="fs-board-fit"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          flex: USE_BOARD_ART ? '1 1 auto' : 1,
          maxWidth: 1600,
          maxHeight: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          ...(boardDockHud != null || boardActionStrip != null
            ? { paddingBottom: boardActionStrip != null ? 44 : 8 }
            : {}),
        }}
      >
        <div
          ref={gridRef}
          className={USE_BOARD_ART ? 'fs-board-art-surface' : 'fs-board-grid'}
          style={{
            display: 'grid',
            gridTemplateColumns: colTemplate,
            gridTemplateRows: rowTemplate,
            ...(USE_BOARD_ART
              ? {
                  width: boardDimensions.w > 0 ? boardDimensions.w : '100%',
                  height: boardDimensions.h > 0 ? boardDimensions.h : 'auto',
                  aspectRatio: `${BOARD_ART.width} / ${BOARD_ART.height}`,
                  backgroundImage: `url(${BOARD_ART.src})`,
                  backgroundSize: '100% 100%',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }
              : {
                  width: boardDimensions.w > 0 ? boardDimensions.w : '100%',
                  height: boardDimensions.h > 0 ? boardDimensions.h : 'auto',
                  maxWidth: 1400,
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
          {plots.map((plot) => {
            const cellKey = `${plot.col}${plot.row}`
            const validPlacement =
              placementMode?.active === true && validPlotKeys.has(plotCoordKey(plot.col, plot.row))
            const claimable = validPlacement
            const isWinning = winningPlotKeys.has(plotCoordKey(plot.col, plot.row))
            const builtCard = plot.builtProperty
              ? propertyCardById.get(plot.builtProperty)
              : undefined
            const claimColor =
              plot.claimedBy !== undefined ? playerById.get(plot.claimedBy)?.color : undefined
            const dimVacantForBuild =
              plot.type === 'city' &&
              placementBuildLens &&
              !validPlacement &&
              !plot.builtProperty

            let investorStripes = EMPTY_STRIPES
            if (plot.investmentStripes && plot.investmentStripes.length > 0) {
              investorStripes = plot.investmentStripes.map((s, si) => {
                const inv = playerById.get(s.investorId)
                return {
                  key: `${s.investorId}-${si}-${s.contributionMillion}`,
                  color: inv?.color ?? '#94a3b8',
                  title: inv
                    ? `${inv.name} — $${s.contributionMillion}M invested`
                    : `$${s.contributionMillion}M invested`,
                }
              })
            }

            return (
              <BoardLot
                key={cellKey}
                plot={plot}
                builtCard={builtCard}
                claimColor={claimColor}
                investorStripes={investorStripes}
                validPlacement={validPlacement}
                claimable={claimable}
                isWinning={isWinning}
                placementBuildLens={placementBuildLens}
                dimVacantForBuild={dimVacantForBuild}
                isElevating={elevatingCells.has(cellKey)}
                isFading={fadingAnchorCells.has(cellKey)}
                streetTint={streetSegmentTint.get(cellKey)}
                cityCellPx={cityCellPx}
                compact={compact}
                borderFs={borderFs}
                placementHi={placementHi}
                onPlotClick={handlePlotClick}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            )
          })}
          {/* Named end-game regions: Squares (whole blocks) and Streets (6-lot runs). */}
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
                    style={
                      {
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
                      } as CSSProperties
                    }
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
                <div style={{ pointerEvents: 'auto', width: '100%', maxWidth: '100%' }}>
                  {boardDockHud}
                </div>
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
