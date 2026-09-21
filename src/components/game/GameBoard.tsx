'use client'

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
} from 'react'
import { BoardTableChrome } from '@/components/game/BoardTableChrome'
import { BoardActionStripHost } from '@/components/game/BoardActionStripHost'
import { Toaster as BoardDockToaster } from 'sonner'
import { FS_BOARD_TOASTER_ID } from '@/lib/fsGameToast'
import { Plot, COLUMNS } from '@/lib/types'
import {
  STREET_TRACK_PX,
  STATIC_LOT_BY_KEY,
  CELL_COORD,
  boardColTemplate,
  boardRowTemplate,
} from '@/lib/boardGeometry'
import type { LastBuiltToken, LotTurnState } from '@/lib/selectLotTurnState'
import { BoardStaticTrack } from '@/components/game/board/BoardStaticTrack'
import { BoardRegions } from '@/components/game/board/BoardRegions'
import {
  OwnershipLayer,
  BuildingsLayer,
  TokenLayer,
  type PlacementHi,
} from '@/components/game/board/BoardDynamicLayers'

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
  /** Sparse overlay — claimed / built / suppressed lots only. */
  lotStates: LotTurnState[]
  lastBuiltToken?: LastBuiltToken | null
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
  /** When the player taps a vacant lot without property placement active (claiming is only via card build). */
  onVacantLotHint?: () => void
  /** Phone / compact chrome — smaller bleed bands, hide masthead, pixel-scaled lot labels. */
  compact?: boolean
}

const BOARD_ASPECT = 21 / 9
const STREET_COL_COUNT = 4
const STREET_ROW_COUNT = 4

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

/** City lot size from grid fr tracks (bleed bands + hairline streets are thinner than city blocks). */
function computeCityCellPx(gridW: number, gridH: number, compact: boolean): number {
  const bleedFr = compact ? 0.35 : 0.4
  const streetPx = STREET_TRACK_PX * STREET_COL_COUNT
  const colFr = 17 + bleedFr * 2
  const cityColW = Math.max(0, (gridW - streetPx) / colFr)

  const streetRowPx = STREET_TRACK_PX * STREET_ROW_COUNT
  const rowFr = 15 + bleedFr * 2
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

/** Resolve the board cell under a pointer event via the delegated `data-cell` attribute. */
function cellKeyFromEvent(e: { target: EventTarget | null }): string | null {
  const el = (e.target as HTMLElement | null)?.closest?.('[data-cell]') as HTMLElement | null
  return el?.dataset.cell ?? null
}

function GameBoardImpl({
  lotStates,
  lastBuiltToken = null,
  onPlotClaim,
  placementMode,
  onCardDrop,
  winningSequence,
  onPropertyClick,
  namedSquares,
  namedStreets,
  showNamedRegions,
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
  // Bucket to 0.5px so sub-pixel resize churn cannot re-render the static track.
  const cityCellPx =
    Math.round(computeCityCellPx(gridSize.w, gridSize.h, compact) * 2) / 2
  const bleedFr = compact ? 0.35 : 0.4

  const colTemplate = useMemo(() => boardColTemplate(bleedFr), [bleedFr])
  const rowTemplate = useMemo(() => boardRowTemplate(bleedFr), [bleedFr])

  /** O(1) overlay lookup for the delegated pointer handlers. */
  const overlayByKey = useMemo(() => {
    const m = new Map<string, LotTurnState>()
    for (const s of lotStates) m.set(s.key, s)
    return m
  }, [lotStates])

  const streetTints = useMemo(() => {
    if (!showNamedRegions || !namedStreets || namedStreets.length === 0) {
      return [] as Array<{ key: string; color: string; gridColumn: string; gridRow: string }>
    }
    return namedStreets.map((s, idx) => {
      const rows = s.streetSegment.map((c) => c.row)
      const cols = s.streetSegment.map((c) => COLUMNS.indexOf(c.col))
      const minR = Math.min(...rows)
      const maxR = Math.max(...rows)
      const minC = Math.min(...cols)
      const maxC = Math.max(...cols)
      return {
        key: `${idx}`,
        color: s.color,
        gridColumn: `${minC + 1} / ${maxC + 2}`,
        gridRow: `${minR} / ${maxR + 1}`,
      }
    })
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
    for (const s of lotStates) {
      if (s.builtProperty) builtNow.add(s.key)
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
  }, [lotStates])

  useEffect(() => {
    const curKeys = new Set<string>()
    for (const s of lotStates) {
      if (s.suppressed) curKeys.add(s.key)
    }
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
  }, [lotStates])

  const validPlotsKey =
    placementMode?.active && placementMode.validPlots
      ? placementMode.validPlots.map((p) => `${p.col}${p.row}`).join(',')
      : ''
  const validCellKeys = useMemo(
    () => new Set<string>(validPlotsKey ? validPlotsKey.split(',') : []),
    // Serialize lot keys so a new validPlots array with the same cells does not
    // rebuild the Set (that would bust the TokenLayer memo on every render).
    [validPlotsKey]
  )
  const winningCellKeys = useMemo(() => {
    const s = new Set<string>()
    for (const c of winningSequence ?? []) s.add(`${c.col}${c.row}`)
    return s
  }, [winningSequence])

  const placementHi = useMemo(() => {
    const kind = placementMode?.interaction ?? 'build'
    return PLACEMENT_HI[kind] ?? PLACEMENT_HI.build
  }, [placementMode?.interaction])

  const placementActive = placementMode?.active === true
  const placementBuildLens =
    placementActive &&
    placementMode?.interaction === 'build' &&
    (placementMode.validPlots?.length ?? 0) > 0

  /** Delegated pointer handlers — one listener for the whole board. */
  const handleBoardClick = useCallback(
    (e: MouseEvent) => {
      const key = cellKeyFromEvent(e)
      if (!key) return
      const coord = CELL_COORD.get(key)
      if (!coord) return
      const overlay = overlayByKey.get(key)
      if (placementActive) {
        if (validCellKeys.has(key)) onPlotClaim(coord.row, coord.col)
        return
      }
      if (overlay?.builtProperty && onPropertyClick) {
        onPropertyClick(coord.row, coord.col)
        return
      }
      const printed = STATIC_LOT_BY_KEY.get(key)
      const vacantUnbuilt =
        Boolean(printed?.building) && overlay?.claimedBy === undefined && !overlay?.builtProperty
      if (vacantUnbuilt && onVacantLotHint) onVacantLotHint()
    },
    [placementActive, validCellKeys, overlayByKey, onPlotClaim, onPropertyClick, onVacantLotHint]
  )

  const handleBoardDragOver = useCallback(
    (e: DragEvent) => {
      if (!placementActive) return
      const key = cellKeyFromEvent(e)
      if (key && validCellKeys.has(key)) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }
    },
    [placementActive, validCellKeys]
  )

  const handleBoardDrop = useCallback(
    (e: DragEvent) => {
      if (!placementActive) return
      const key = cellKeyFromEvent(e)
      if (!key || !validCellKeys.has(key)) return
      e.preventDefault()
      const coord = CELL_COORD.get(key)
      const propertyInstanceId = e.dataTransfer.getData('propertyInstanceId')
      if (coord && propertyInstanceId && onCardDrop) {
        onCardDrop(coord.row, coord.col, propertyInstanceId)
      }
    },
    [placementActive, validCellKeys, onCardDrop]
  )

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
        .fs-hi-cell:hover {
          border-color: var(--hi-solid) !important;
          box-shadow: 0 0 8px var(--hi-houter), inset 0 0 6px var(--hi-hinner) !important;
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
          flex: 1,
          maxWidth: 1600,
          maxHeight: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          paddingBottom: 44,
        }}
      >
        <div
          ref={gridRef}
          className="fs-board-grid"
          onClick={handleBoardClick}
          onDragOver={handleBoardDragOver}
          onDrop={handleBoardDrop}
          style={{
            display: 'grid',
            gridTemplateColumns: colTemplate,
            gridTemplateRows: rowTemplate,
            width: boardDimensions.w > 0 ? boardDimensions.w : '100%',
            height: boardDimensions.h > 0 ? boardDimensions.h : 'auto',
            maxWidth: 1400,
            aspectRatio: '21 / 9',
            flexShrink: 0,
            borderRadius: 16,
            overflow: 'hidden',
            border: 'none',
            boxShadow:
              '0 0 60px rgba(0,0,0,0.5), 0 0 120px rgba(0,112,204,0.05), inset 0 0 80px rgba(0,0,0,0.3)',
          }}
        >
          {/* Layer 0 — static track: streets + printed lot shells. Renders once. */}
          <BoardStaticTrack cityCellPx={cityCellPx} compact={compact} />

          {/* Layer 1 — free-canvas named regions: bleed band + inner court. */}
          <BoardRegions cityCellPx={cityCellPx} compact={compact} />

          {/* Layers 2/3 — ownership fill + buildings: only lots that carry state. */}
          <OwnershipLayer lotStates={lotStates} fadingAnchorCells={fadingAnchorCells} />
          <BuildingsLayer
            lotStates={lotStates}
            elevatingCells={elevatingCells}
            cityCellPx={cityCellPx}
            compact={compact}
          />

          {/* Layer 4 — tokens: last-built pawn, placement highlights, winning pulse. */}
          <TokenLayer
            lastBuiltToken={lastBuiltToken}
            validCellKeys={validCellKeys}
            placementActive={placementActive}
            placementBuildLens={placementBuildLens}
            placementHi={placementHi}
            winningCellKeys={winningCellKeys}
            streetTints={streetTints}
          />

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
          <BoardTableChrome />
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
              <div className="fs-board-toast-anchor" aria-label="Game activity">
                <BoardDockToaster
                  id={FS_BOARD_TOASTER_ID}
                  theme="dark"
                  position="top-center"
                  offset={8}
                  visibleToasts={4}
                  expand
                  richColors
                  toastOptions={{
                    classNames: { toast: 'fs-board-dock-toast' },
                    style: {
                      fontSize: 13,
                      lineHeight: 1.35,
                      padding: '11px 14px',
                      minHeight: 46,
                      background: 'rgba(10, 14, 24, 0.94)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: 'rgba(248,250,252,0.95)',
                    },
                  }}
                  style={
                    {
                      '--normal-bg': 'rgba(14, 18, 30, 0.96)',
                      '--normal-border': 'rgba(255,255,255,0.14)',
                      '--success-bg': 'rgba(12, 40, 28, 0.95)',
                      '--success-border': 'rgba(74, 222, 128, 0.35)',
                      '--error-bg': 'rgba(60, 15, 20, 0.94)',
                      '--error-border': 'rgba(248, 113, 113, 0.45)',
                      '--info-bg': 'rgba(12, 26, 48, 0.95)',
                      '--info-border': 'rgba(96, 165, 250, 0.4)',
                      '--warning-bg': 'rgba(55, 40, 8, 0.94)',
                      '--warning-border': 'rgba(251, 191, 36, 0.45)',
                    } as CSSProperties
                  }
                />
              </div>
            </div>
          </div>
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
              <BoardActionStripHost />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const GameBoard = memo(GameBoardImpl, (a, b) => {
  return (
    a.lotStates === b.lotStates &&
    a.lastBuiltToken === b.lastBuiltToken &&
    a.placementMode === b.placementMode &&
    a.winningSequence === b.winningSequence &&
    a.namedSquares === b.namedSquares &&
    a.namedStreets === b.namedStreets &&
    a.showNamedRegions === b.showNamedRegions &&
    a.compact === b.compact &&
    a.onPlotClaim === b.onPlotClaim &&
    a.onPropertyClick === b.onPropertyClick &&
    a.onVacantLotHint === b.onVacantLotHint &&
    a.onCardDrop === b.onCardDrop
  )
})
