import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { propertyCards } from './cardData'
import type { PropertyCard } from './cardTypes'
import { getOrthogonalCityNeighborsIncludingStreetSpan, isCityBuildingCell } from './boardAdjacency'
import { buildPlotIndex, getPlotAt } from './boardIndex'
import {
  getCityBlockBounds,
  isPlotInCityBlock,
  plotSupportsInvestmentIncome,
} from './investmentTargets'
import { Plot, COLUMNS } from './types'
import { getPlotDistricts, type District } from './districts'
import { getPlotPropertyIncome } from './housingEconomics'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ===== End-game trigger and bonus detection =====
// Board geometry: 21x21 grid. Streets sit at rows 5/9/13/17 and cols E/I/M/Q (indices 4/8/12/16).
// Anchor cells live on rows 3/7/11/15/19 and cols C/G/K/O/S (the 5×5 anchor lattice).
// City blocks are 3×3 lots between adjacent street rows/cols.
const STREET_ROWS = new Set<number>([5, 9, 13, 17])
const STREET_COL_INDICES = new Set<number>([4, 8, 12, 16])
const ANCHOR_ROWS = new Set<number>([3, 7, 11, 15, 19])
const ANCHOR_COLS = new Set<string>(['C', 'G', 'K', 'O', 'S'])

/** Three-row span making up the row-axis of one city block (top row, anchor row, bottom row). */
const BLOCK_ROW_SPANS: ReadonlyArray<readonly [number, number, number]> = [
  [2, 3, 4], [6, 7, 8], [10, 11, 12], [14, 15, 16], [18, 19, 20],
]
/** Three-col span (column letters) making up the col-axis of one city block. */
const BLOCK_COL_SPANS: ReadonlyArray<readonly [string, string, string]> = [
  ['B', 'C', 'D'], ['F', 'G', 'H'], ['J', 'K', 'L'], ['N', 'O', 'P'], ['R', 'S', 'T'],
]

/** Non-anchor rows that a 6-lot horizontal Street pattern may run along. */
const STREET_PATTERN_ROWS: readonly number[] = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
/** Non-anchor cols that a 6-lot vertical Street pattern may run along. */
const STREET_PATTERN_COLS: readonly string[] = ['B', 'D', 'F', 'H', 'J', 'L', 'N', 'P', 'R', 'T']

export const END_GAME_ADJACENT_THRESHOLD = 12
export const END_GAME_MAX_DEFER_TURNS = 4

export interface WinningSequence {
  /** The connected cluster that unlocked (or declared) the endgame. */
  plots: Array<{ row: number; col: string }>
  /** Founder id of the player who holds the cluster. */
  triggeredByPlayerId: number
  kind?: 'adjacent-cluster'
}

export interface AdjacentCluster {
  ownerPlayerId: number
  plots: Array<{ row: number; col: string }>
}

function lotKey(row: number, col: string): string {
  return `${col}${row}`
}

/** Largest orthogonally connected group of built lots owned by `playerId` (streets do not break adjacency). */
export function largestOwnedAdjacentCluster(plots: Plot[], playerId: number): AdjacentCluster | null {
  const index = buildPlotIndex(plots)
  const ownedKeys = new Set<string>()
  const owned: Array<{ row: number; col: string }> = []
  for (const p of plots) {
    if (p.type !== 'city' || !p.builtProperty || p.claimedBy !== playerId) continue
    if (!isCityBuildingCell(p.row, p.col)) continue
    const key = lotKey(p.row, p.col)
    ownedKeys.add(key)
    owned.push({ row: p.row, col: p.col })
  }
  if (owned.length === 0) return null

  const visited = new Set<string>()
  let best: Array<{ row: number; col: string }> = []

  for (const start of owned) {
    const startKey = lotKey(start.row, start.col)
    if (visited.has(startKey)) continue
    const stack = [start]
    const component: Array<{ row: number; col: string }> = []
    visited.add(startKey)
    while (stack.length > 0) {
      const cur = stack.pop()!
      component.push(cur)
      for (const n of getOrthogonalCityNeighborsIncludingStreetSpan(cur.row, cur.col)) {
        const nk = lotKey(n.row, n.col)
        if (visited.has(nk) || !ownedKeys.has(nk)) continue
        visited.add(nk)
        if (getPlotAt(plots, n.col, n.row, index)) stack.push({ row: n.row, col: n.col })
      }
    }
    if (component.length > best.length) best = component
  }

  return { ownerPlayerId: playerId, plots: best }
}

/**
 * Endgame unlock: a founder owns 12+ built lots in one orthogonally adjacent cluster
 * (including across a single street). Does not start the Final Round by itself.
 */
export function checkForTwelveAdjacentProperties(
  plots: Plot[],
  preferPlayerId?: number
): WinningSequence | null {
  const ownerIds = new Set<number>()
  for (const p of plots) {
    if (p.claimedBy != null && p.builtProperty) ownerIds.add(p.claimedBy)
  }
  let best: AdjacentCluster | null = null
  for (const id of ownerIds) {
    const cluster = largestOwnedAdjacentCluster(plots, id)
    if (!cluster || cluster.plots.length < END_GAME_ADJACENT_THRESHOLD) continue
    if (preferPlayerId != null && id === preferPlayerId) {
      return {
        plots: cluster.plots,
        triggeredByPlayerId: id,
        kind: 'adjacent-cluster',
      }
    }
    if (!best || cluster.plots.length > best.plots.length) best = cluster
  }
  if (!best) return null
  return {
    plots: best.plots,
    triggeredByPlayerId: best.ownerPlayerId,
    kind: 'adjacent-cluster',
  }
}

// ----- End-game bonus detection: Squares (entire 3×3 city blocks) and Streets (3+3 lines) -----

export interface SquareBonus {
  /** Founder id that fully owns the city block. */
  ownerPlayerId: number
  /** Inclusive bounds of the block. */
  bounds: { minRow: number; maxRow: number; minCol: string; maxCol: string }
  /** All 9 lots in the block (for highlight). */
  lots: Array<{ row: number; col: string }>
  bonusMillion: number
}

export interface StreetBonus {
  ownerPlayerId: number
  /** 'horizontal': run along a row (street between is a column).
   *  'vertical':   run along a col (street between is a row). */
  orientation: 'horizontal' | 'vertical'
  /** The 6 owned lots, in order. */
  lots: Array<{ row: number; col: string }>
  /** The street segment between the two blocks that should be highlighted/labelled. */
  streetSegment: Array<{ row: number; col: string }>
  bonusMillion: number
}

const SQUARE_BONUS_MILLION = 50
const STREET_BONUS_MILLION = 30

/** Find every 3×3 city block fully owned (and built) by a single player. */
export function findCompleteSquares(plots: Plot[]): SquareBonus[] {
  const out: SquareBonus[] = []
  for (const rowSpan of BLOCK_ROW_SPANS) {
    for (const colSpan of BLOCK_COL_SPANS) {
      const lots: Array<{ row: number; col: string }> = []
      let owner: number | undefined
      let qualifies = true
      for (const r of rowSpan) {
        for (const c of colSpan) {
          const p = plots.find((q) => q.row === r && q.col === c)
          if (!p || p.type !== 'city' || !p.builtProperty || p.claimedBy === undefined) {
            qualifies = false
            break
          }
          if (owner === undefined) owner = p.claimedBy
          else if (owner !== p.claimedBy) {
            qualifies = false
            break
          }
          lots.push({ row: r, col: c })
        }
        if (!qualifies) break
      }
      if (qualifies && owner !== undefined && lots.length === 9) {
        out.push({
          ownerPlayerId: owner,
          bounds: { minRow: rowSpan[0], maxRow: rowSpan[2], minCol: colSpan[0], maxCol: colSpan[2] },
          lots,
          bonusMillion: SQUARE_BONUS_MILLION,
        })
      }
    }
  }
  return out
}

/**
 * Find every 6-lot 3+3 Street pattern (built+owned by a single player) along a non-anchor row or col.
 * The run skips the connecting street row/col and never includes anchor row/col cells.
 */
export function findCompleteStreets(plots: Plot[]): StreetBonus[] {
  const out: StreetBonus[] = []

  const ownedBuiltCard = (
    row: number,
    col: string
  ): { ownerId: number } | null => {
    const p = plots.find((q) => q.row === row && q.col === col)
    if (!p || p.type !== 'city' || !p.builtProperty || p.claimedBy === undefined) return null
    return { ownerId: p.claimedBy }
  }

  // Horizontal runs: along a non-anchor row, 3 lots in one column-block + 3 lots in the next.
  for (const row of STREET_PATTERN_ROWS) {
    if (ANCHOR_ROWS.has(row)) continue
    for (let i = 0; i < BLOCK_COL_SPANS.length - 1; i++) {
      const left = BLOCK_COL_SPANS[i]
      const right = BLOCK_COL_SPANS[i + 1]
      const cells = [...left, ...right]
      // Defensive: skip any run that would touch an anchor cell (shouldn't happen on non-anchor rows
      // but guards future board changes).
      if (cells.some((c) => ANCHOR_ROWS.has(row) && ANCHOR_COLS.has(c))) continue
      const owners = cells.map((c) => ownedBuiltCard(row, c))
      if (owners.some((o) => o === null)) continue
      const ownerId = owners[0]!.ownerId
      if (!owners.every((o) => o!.ownerId === ownerId)) continue

      // Connecting street column sits between left[2] and right[0].
      const leftEndIdx = COLUMNS.indexOf(left[2])
      const rightStartIdx = COLUMNS.indexOf(right[0])
      const streetColIdx = (leftEndIdx + rightStartIdx) / 2
      const streetCol = COLUMNS[streetColIdx]
      out.push({
        ownerPlayerId: ownerId,
        orientation: 'horizontal',
        lots: cells.map((c) => ({ row, col: c })),
        // Street segment spans the same row range as the two adjacent blocks (3 rows).
        streetSegment: [-1, 0, 1].map((dr) => ({ row: row + dr, col: streetCol }))
          // Trim to actual board rows.
          .filter((s) => s.row >= 1 && s.row <= 21),
        bonusMillion: STREET_BONUS_MILLION,
      })
    }
  }

  // Vertical runs: along a non-anchor column, 3 lots in one row-block + 3 lots in the next.
  for (const col of STREET_PATTERN_COLS) {
    if (ANCHOR_COLS.has(col)) continue
    for (let i = 0; i < BLOCK_ROW_SPANS.length - 1; i++) {
      const top = BLOCK_ROW_SPANS[i]
      const bot = BLOCK_ROW_SPANS[i + 1]
      const rows = [top[0], top[1], top[2], bot[0], bot[1], bot[2]]
      const owners = rows.map((r) => ownedBuiltCard(r, col))
      if (owners.some((o) => o === null)) continue
      const ownerId = owners[0]!.ownerId
      if (!owners.every((o) => o!.ownerId === ownerId)) continue

      const streetRow = (top[2] + bot[0]) / 2
      const ci = COLUMNS.indexOf(col)
      out.push({
        ownerPlayerId: ownerId,
        orientation: 'vertical',
        lots: rows.map((r) => ({ row: r, col })),
        streetSegment: [-1, 0, 1]
          .map((dc) => {
            const newCi = ci + dc
            if (newCi < 0 || newCi >= COLUMNS.length) return null
            return { row: streetRow, col: COLUMNS[newCi] }
          })
          .filter((s): s is { row: number; col: string } => s !== null),
        bonusMillion: STREET_BONUS_MILLION,
      })
    }
  }

  return out
}

/** +1 total if the player owns built City Hall, Courthouse, and/or Police (single bonus, not per building). */
export function getCityCouncilFreezeAttackerInfluence(
  playerId: number,
  plots: Plot[]
): { bonus: number; ownedCivicLabels: string[] } {
  const ownedCivicLabels: string[] = []
  for (const [id, label] of [
    ['city-hall', 'City Hall'],
    ['courthouse', 'Courthouse'],
    ['police', 'Police'],
  ] as const) {
    if (plots.some((p) => p.claimedBy === playerId && p.builtProperty === id)) {
      ownedCivicLabels.push(label)
    }
  }
  const bonus = ownedCivicLabels.length > 0 ? 1 : 0
  return { bonus, ownedCivicLabels }
}

/**
 * Police Raid on Mafia — attacker roll: +1 total (max +1) if you own built Police, City Hall, and/or Courthouse
 * anywhere on the board.
 */
export function getPoliceRaidAttackerInfluence(
  playerId: number,
  plots: Plot[]
): { bonus: number; labels: string[] } {
  const ids = ['police', 'city-hall', 'courthouse'] as const
  const labels: string[] = []
  for (const bid of ids) {
    const has = plots.some(
      (p) => p.type === 'city' && p.claimedBy === playerId && p.builtProperty === bid
    )
    if (!has) continue
    const nm = propertyCards.find((c) => c.id === bid)?.name ?? bid
    if (!labels.includes(nm)) labels.push(nm)
  }
  return { bonus: labels.length > 0 ? 1 : 0, labels }
}

/**
 * Church Affiliation income bonus:
 * +1 income to each of the player's built properties that sits in the same city block
 * as at least one of that player's built Church Affiliation anchors.
 */
/** Built anchor lots that still contribute passive anchor bonuses (not hit by Scandal). */
function activeAnchorSourcePlots(
  plots: Plot[],
  playerId: number,
  builtPropertyId: string
): Plot[] {
  return plots.filter(
    (p) =>
      p.type === 'city' &&
      p.claimedBy === playerId &&
      p.builtProperty === builtPropertyId &&
      !p.anchorInfluenceSuppressed
  )
}

/** Targets for Scandal: claimed city lots with a built anchor whose influence is still active. */
export function getPlotsEligibleForScandal(plots: Plot[]): Plot[] {
  return plots.filter((p) => {
    if (p.type !== 'city' || p.claimedBy === undefined || !p.builtProperty) return false
    if (p.anchorInfluenceSuppressed) return false
    const c = propertyCards.find((x) => x.id === p.builtProperty) as PropertyCard | undefined
    return c?.type === 'anchor'
  })
}

function isParkPropertyId(builtPropertyId: string): boolean {
  return builtPropertyId.startsWith('park-')
}

/**
 * Park income bonus:
 * +$1M to each of the player's other income-generating lots in the same city
 * block as at least one built Park (any owner). Park lots themselves are excluded.
 */
export function getParkIncomeBonusForPlayer(
  playerId: number,
  plots: Plot[]
): { bonus: number; sourceLabels: string[] } {
  const parks = plots.filter(
    (p) => p.type === 'city' && !!p.builtProperty && isParkPropertyId(p.builtProperty)
  )

  if (parks.length === 0) {
    return { bonus: 0, sourceLabels: [] }
  }

  let bonus = 0
  const covering = new Set<string>()

  for (const p of plots) {
    if (p.type !== 'city' || p.claimedBy !== playerId || !p.builtProperty) continue
    if (isParkPropertyId(p.builtProperty)) continue
    const card = propertyCards.find((c) => c.id === p.builtProperty) as PropertyCard | undefined
    if (getPlotPropertyIncome(p, card) <= 0) continue
    const hits = parks.filter((parkPlot) => isPlotInCityBlock(p, parkPlot.row, parkPlot.col))
    if (hits.length === 0) continue
    bonus += 1
    for (const parkPlot of hits) covering.add(`${parkPlot.col}${parkPlot.row}`)
  }

  return { bonus, sourceLabels: [...covering].sort() }
}

/**
 * Church Affiliation income bonus:
 * +1 income to each of the player's built properties that sits in the same city block
 * as at least one of that player's built Church Affiliation anchors.
 */
export function getChurchIncomeBonusForPlayer(
  playerId: number,
  plots: Plot[]
): { bonus: number; sourceLabels: string[] } {
  const churchAnchors = activeAnchorSourcePlots(plots, playerId, 'church')

  if (churchAnchors.length === 0) {
    return { bonus: 0, sourceLabels: [] }
  }

  const sourceLabels = churchAnchors.map((p) => `${p.col}${p.row}`)
  let bonus = 0

  for (const p of plots) {
    if (p.type !== 'city' || p.claimedBy !== playerId || !p.builtProperty) continue
    if (p.builtProperty === 'church') continue

    const covered = churchAnchors.some((churchPlot) =>
      isPlotInCityBlock(p, churchPlot.row, churchPlot.col)
    )
    if (covered) bonus += 1
  }

  return { bonus, sourceLabels }
}

/**
 * Farm Bureau income bonus:
 * +1 income to each of the player's built properties in the same city block as a built Farm Bureau.
 */
export function getFarmCoopIncomeBonusForPlayer(
  playerId: number,
  plots: Plot[]
): { bonus: number; sourceLabels: string[] } {
  const farmCoops = activeAnchorSourcePlots(plots, playerId, 'farm-coop')

  if (farmCoops.length === 0) return { bonus: 0, sourceLabels: [] }

  const sourceLabels = farmCoops.map((p) => `${p.col}${p.row}`)
  let bonus = 0

  for (const p of plots) {
    if (p.type !== 'city' || p.claimedBy !== playerId || !p.builtProperty) continue
    if (p.builtProperty === 'farm-coop') continue
    const covered = farmCoops.some((src) => isPlotInCityBlock(p, src.row, src.col))
    if (covered) bonus += 1
  }

  return { bonus, sourceLabels }
}

/**
 * Port Authority income bonus:
 * +1 income to each of the player's built properties in the same city block as a built Port Authority.
 */
export function getPortAuthorityIncomeBonusForPlayer(
  playerId: number,
  plots: Plot[]
): { bonus: number; sourceLabels: string[] } {
  const ports = activeAnchorSourcePlots(plots, playerId, 'port-authority')
  if (ports.length === 0) return { bonus: 0, sourceLabels: [] }

  const sourceLabels = ports.map((p) => `${p.col}${p.row}`)
  let bonus = 0

  for (const p of plots) {
    if (p.type !== 'city' || p.claimedBy !== playerId || !p.builtProperty) continue
    if (p.builtProperty === 'port-authority') continue
    const covered = ports.some((src) => isPlotInCityBlock(p, src.row, src.col))
    if (covered) bonus += 1
  }

  return { bonus, sourceLabels }
}

/**
 * Arts Council income bonus:
 * +1 income to each of the player's built properties in the same city block as a built Arts Council.
 */
export function getArtsCouncilIncomeBonusForPlayer(
  playerId: number,
  plots: Plot[]
): { bonus: number; sourceLabels: string[] } {
  const arts = activeAnchorSourcePlots(plots, playerId, 'arts-council')
  if (arts.length === 0) return { bonus: 0, sourceLabels: [] }

  const sourceLabels = arts.map((p) => `${p.col}${p.row}`)
  let bonus = 0

  for (const p of plots) {
    if (p.type !== 'city' || p.claimedBy !== playerId || !p.builtProperty) continue
    if (p.builtProperty === 'arts-council') continue
    const covered = arts.some((src) => isPlotInCityBlock(p, src.row, src.col))
    if (covered) bonus += 1
  }

  return { bonus, sourceLabels }
}

/**
 * Tourism Office income bonus:
 * +1 income to each of the player's built properties in the same city block as a built Tourism Office.
 */
export function getTourismOfficeIncomeBonusForPlayer(
  playerId: number,
  plots: Plot[]
): { bonus: number; sourceLabels: string[] } {
  const tourism = activeAnchorSourcePlots(plots, playerId, 'tourism-office')
  if (tourism.length === 0) return { bonus: 0, sourceLabels: [] }

  const sourceLabels = tourism.map((p) => `${p.col}${p.row}`)
  let bonus = 0

  for (const p of plots) {
    if (p.type !== 'city' || p.claimedBy !== playerId || !p.builtProperty) continue
    if (p.builtProperty === 'tourism-office') continue
    const covered = tourism.some((src) => isPlotInCityBlock(p, src.row, src.col))
    if (covered) bonus += 1
  }

  return { bonus, sourceLabels }
}

/**
 * Influencer income bonus:
 * +1 income to each of the player's built properties in the same city block as a built Influencer (media) anchor.
 */
export function getInfluencersIncomeBonusForPlayer(
  playerId: number,
  plots: Plot[]
): { bonus: number; sourceLabels: string[] } {
  const influencers = activeAnchorSourcePlots(plots, playerId, 'media')
  if (influencers.length === 0) return { bonus: 0, sourceLabels: [] }

  const sourceLabels = influencers.map((p) => `${p.col}${p.row}`)
  let bonus = 0

  for (const p of plots) {
    if (p.type !== 'city' || p.claimedBy !== playerId || !p.builtProperty) continue
    if (p.builtProperty === 'media') continue
    const covered = influencers.some((src) => isPlotInCityBlock(p, src.row, src.col))
    if (covered) bonus += 1
  }

  return { bonus, sourceLabels }
}

/**
 * News Outlet income bonus:
 * +1 income to each of the player's built properties in the same city block as an active News Outlet.
 */
export function getNewsOutletIncomeBonusForPlayer(
  playerId: number,
  plots: Plot[]
): { bonus: number; sourceLabels: string[] } {
  const outlets = activeAnchorSourcePlots(plots, playerId, 'news-outlet')
  if (outlets.length === 0) return { bonus: 0, sourceLabels: [] }

  const sourceLabels = outlets.map((p) => `${p.col}${p.row}`)
  let bonus = 0
  for (const p of plots) {
    if (p.type !== 'city' || p.claimedBy !== playerId || !p.builtProperty) continue
    if (p.builtProperty === 'news-outlet') continue
    if (outlets.some((src) => isPlotInCityBlock(p, src.row, src.col))) bonus += 1
  }
  return { bonus, sourceLabels }
}

/**
 * Mafia income bonus:
 * +1 income to each of the player's built properties in the same city block as a built Mafia they own.
 */
export function getMafiaIncomeBonusForPlayer(
  playerId: number,
  plots: Plot[]
): { bonus: number; sourceLabels: string[] } {
  const mafias = activeAnchorSourcePlots(plots, playerId, 'mafia')
  if (mafias.length === 0) return { bonus: 0, sourceLabels: [] }

  const sourceLabels = mafias.map((p) => `${p.col}${p.row}`)
  let bonus = 0

  for (const p of plots) {
    if (p.type !== 'city' || p.claimedBy !== playerId || !p.builtProperty) continue
    if (p.builtProperty === 'mafia') continue
    const covered = mafias.some((src) => isPlotInCityBlock(p, src.row, src.col))
    if (covered) bonus += 1
  }

  return { bonus, sourceLabels }
}

/**
 * Regulation Bureau income bonus (owner):
 * +1 income to each of the player's built properties in the same city block as a built Regulation Bureau they own.
 */
export function getRegulationBureauIncomeBonusForPlayer(
  playerId: number,
  plots: Plot[]
): { bonus: number; sourceLabels: string[] } {
  const bureaus = activeAnchorSourcePlots(plots, playerId, 'regulation-bureau')
  if (bureaus.length === 0) return { bonus: 0, sourceLabels: [] }

  const sourceLabels = bureaus.map((p) => `${p.col}${p.row}`)
  let bonus = 0

  for (const p of plots) {
    if (p.type !== 'city' || p.claimedBy !== playerId || !p.builtProperty) continue
    if (p.builtProperty === 'regulation-bureau') continue
    const covered = bureaus.some((src) => isPlotInCityBlock(p, src.row, src.col))
    if (covered) bonus += 1
  }

  return { bonus, sourceLabels }
}

/**
 * Regulation Bureau pressure: each rival property in an active Bureau's block loses $1M
 * from its owner's Income base. Multiple Bureaus covering one property do not stack.
 */
export function getRegulationBureauIncomePenaltyForPlayer(
  incomePlayerId: number,
  plots: Plot[]
): { penalty: number; sourceLabels: string[] } {
  const rivalBureaus = plots.filter(
    (p) =>
      p.type === 'city' &&
      p.claimedBy !== undefined &&
      p.claimedBy !== incomePlayerId &&
      p.builtProperty === 'regulation-bureau' &&
      !p.anchorInfluenceSuppressed
  )
  if (rivalBureaus.length === 0) return { penalty: 0, sourceLabels: [] }

  let penalty = 0
  for (const p of plots) {
    if (p.type !== 'city' || p.claimedBy !== incomePlayerId || !p.builtProperty) continue
    if (rivalBureaus.some((src) => isPlotInCityBlock(p, src.row, src.col))) penalty += 1
  }
  return { penalty, sourceLabels: rivalBureaus.map((p) => `${p.col}${p.row}`) }
}

/**
 * Union anchor owner — Income resolution:
 * +$1M per other built property this player owns on the same city block as any active Union
 * they own (Union cell excluded). Action-roll influence is district-scoped separately.
 */
export function getUnionIncomeBonusForOwner(
  playerId: number,
  plots: Plot[]
): { bonus: number; sourceLabels: string[] } {
  const unions = activeAnchorSourcePlots(plots, playerId, 'union')
  if (unions.length === 0) return { bonus: 0, sourceLabels: [] }

  const sourceLabels = unions.map((p) => `${p.col}${p.row}`)
  let bonus = 0

  for (const p of plots) {
    if (p.type !== 'city' || p.claimedBy !== playerId || !p.builtProperty) continue
    if (p.builtProperty === 'union') continue
    const covered = unions.some((src) => isPlotInCityBlock(p, src.row, src.col))
    if (covered) bonus += 1
  }

  return { bonus, sourceLabels }
}

/**
 * Union — rivals’ Income resolution:
 * −$1M per built property this player owns that sits in the same city block as another
 * founder’s active Union. Lost income is not paid to the Union owner.
 */
export function getUnionIncomePenaltyForPlayer(
  incomePlayerId: number,
  plots: Plot[]
): { penalty: number; rivalUnionPlotLabels: string[] } {
  const rivalUnionPlots = plots.filter(
    (p) =>
      p.type === 'city' &&
      p.claimedBy !== undefined &&
      p.claimedBy !== incomePlayerId &&
      p.builtProperty === 'union' &&
      !p.anchorInfluenceSuppressed
  )

  if (rivalUnionPlots.length === 0) return { penalty: 0, rivalUnionPlotLabels: [] }

  const rivalUnionPlotLabels = rivalUnionPlots.map((p) => `${p.col}${p.row}`)
  let penalty = 0

  for (const p of plots) {
    if (p.type !== 'city' || p.claimedBy !== incomePlayerId || !p.builtProperty) continue
    const hit = rivalUnionPlots.some((u) => isPlotInCityBlock(p, u.row, u.col))
    if (hit) penalty += 1
  }

  return { penalty, rivalUnionPlotLabels }
}

export type AnchorInfluenceAction = 'takeover' | 'rezoning' | 'remove-investors'

/** +1 when the acting founder owns 5+ built properties in the target lot’s city block. */
export function getBlockPresenceInfluenceBonus(
  playerId: number,
  plots: Plot[],
  targetRow: number,
  targetCol: string
): { bonus: number; labels: string[] } {
  const ownedInBlock = countPlayerBuiltInCityBlock(playerId, plots, targetRow, targetCol)
  if (ownedInBlock < 5) return { bonus: 0, labels: [] }
  return { bonus: 1, labels: [`block presence (${ownedInBlock} lots)`] }
}

/**
 * How many built+claimed lots `playerId` already owns in the 3×3 city block containing `(row, col)`.
 * Vacant candidates are not counted (0–8 when the cell is empty).
 */
export function countPlayerBuiltInCityBlock(
  playerId: number,
  plots: Plot[],
  row: number,
  col: string
): number {
  if (!getCityBlockBounds(row, col)) return 0
  let ownedInBlock = 0
  for (const p of plots) {
    if (p.type !== 'city' || p.claimedBy !== playerId || !p.builtProperty) continue
    if (!isPlotInCityBlock(p, row, col)) continue
    ownedInBlock += 1
  }
  return ownedInBlock
}

/**
 * Bot placement / build-ranking bias toward deepening or completing a city block.
 * Completing the 9th lot (8 already owned) is a hard priority after income.
 */
export function blockCompletionBiasScore(ownedBuiltInBlock: number): number {
  if (ownedBuiltInBlock <= 0) return 0
  if (ownedBuiltInBlock >= 8) return 100
  if (ownedBuiltInBlock >= 5) return 10 * ownedBuiltInBlock
  return 2 * ownedBuiltInBlock
}

/**
 * +1 when the acting founder owns six sequential lots along one side of a street and the
 * target sits directly opposite those lots across that street.
 */
export function getStreetOppositeInfluenceBonus(
  playerId: number,
  plots: Plot[],
  targetRow: number,
  targetCol: string
): { bonus: number; labels: string[] } {
  const ownedBuilt = (row: number, col: string): boolean => {
    const p = plots.find((q) => q.row === row && q.col === col)
    return (
      p != null &&
      p.type === 'city' &&
      p.claimedBy === playerId &&
      !!p.builtProperty
    )
  }

  if (COLUMNS.indexOf(targetCol) < 0) return { bonus: 0, labels: [] }

  // Horizontal streets (rows 5/9/13/17): six lots on one side → opposite row across street.
  for (const streetRow of [5, 9, 13, 17] as const) {
    const northRow = streetRow - 1
    const southRow = streetRow + 1
    for (let i = 0; i < BLOCK_COL_SPANS.length - 1; i++) {
      const cols = [...BLOCK_COL_SPANS[i], ...BLOCK_COL_SPANS[i + 1]]
      const ownsNorth = cols.every((c) => ownedBuilt(northRow, c))
      const ownsSouth = cols.every((c) => ownedBuilt(southRow, c))
      if (ownsNorth && targetRow === southRow && cols.includes(targetCol)) {
        return { bonus: 1, labels: ['street opposite (6 along street)'] }
      }
      if (ownsSouth && targetRow === northRow && cols.includes(targetCol)) {
        return { bonus: 1, labels: ['street opposite (6 along street)'] }
      }
    }
  }

  // Vertical streets (cols E/I/M/Q): six lots on one side → opposite col across street.
  const streetCols = ['E', 'I', 'M', 'Q'] as const
  for (const streetCol of streetCols) {
    const sci = COLUMNS.indexOf(streetCol)
    if (sci <= 0 || sci >= COLUMNS.length - 1) continue
    const westCol = COLUMNS[sci - 1]!
    const eastCol = COLUMNS[sci + 1]!
    for (let i = 0; i < BLOCK_ROW_SPANS.length - 1; i++) {
      const rows = [
        BLOCK_ROW_SPANS[i][0],
        BLOCK_ROW_SPANS[i][1],
        BLOCK_ROW_SPANS[i][2],
        BLOCK_ROW_SPANS[i + 1][0],
        BLOCK_ROW_SPANS[i + 1][1],
        BLOCK_ROW_SPANS[i + 1][2],
      ]
      const ownsWest = rows.every((r) => ownedBuilt(r, westCol))
      const ownsEast = rows.every((r) => ownedBuilt(r, eastCol))
      if (ownsWest && targetCol === eastCol && rows.includes(targetRow)) {
        return { bonus: 1, labels: ['street opposite (6 along street)'] }
      }
      if (ownsEast && targetCol === westCol && rows.includes(targetRow)) {
        return { bonus: 1, labels: ['street opposite (6 along street)'] }
      }
    }
  }

  return { bonus: 0, labels: [] }
}

/**
 * Anchor Tenet influence for Hostile Takeover, Rezoning, and Remove Investors.
 *
 * Citywide: Church (T/R), Mafia, Regulation Bureau — each active copy stacks.
 * District: Farm Bureau, Port Authority, Arts Council, Tourism Office, Union —
 * each active copy that covers the target district stacks.
 * Community pressure: +1 for 5+ owned lots in the target block; +1 when targeting
 * a lot directly opposite your six sequential lots along a street.
 * Block pressure: an opponent Regulation Bureau applies −1 on T/IR in its block.
 */
export function getAnchorInfluenceForAction(
  playerId: number,
  plots: Plot[],
  action: AnchorInfluenceAction,
  targetRow: number,
  targetCol: string
): { bonus: number; labels: string[] } {
  let bonus = 0
  const labels: string[] = []
  const add = (amount: number, label: string) => {
    bonus += amount
    labels.push(label)
  }

  if (action === 'takeover' || action === 'rezoning') {
    for (const church of activeAnchorSourcePlots(plots, playerId, 'church')) {
      add(1, `Church Affiliation (citywide @ ${church.col}${church.row})`)
    }
  }
  for (const mafia of activeAnchorSourcePlots(plots, playerId, 'mafia')) {
    add(1, `Mafia (citywide @ ${mafia.col}${mafia.row})`)
  }
  for (const bureau of activeAnchorSourcePlots(plots, playerId, 'regulation-bureau')) {
    add(1, `Regulation Bureau (citywide @ ${bureau.col}${bureau.row})`)
  }

  const targetDistricts = getPlotDistricts(targetRow, targetCol)
  const regional: Array<{ id: string; district: District; label: string }> = [
    { id: 'farm-coop', district: 'Farmland', label: 'Farm Bureau (Farmland)' },
    { id: 'port-authority', district: 'Railway District', label: 'Port Authority (Railway)' },
    { id: 'arts-council', district: 'Riverfront', label: 'Arts Council (River Parkway)' },
    { id: 'tourism-office', district: 'Mountain Cove', label: 'Tourism Office (Mountain Cove)' },
  ]
  for (const entry of regional) {
    if (!targetDistricts.includes(entry.district)) continue
    for (const src of activeAnchorSourcePlots(plots, playerId, entry.id)) {
      add(1, `${entry.label} @ ${src.col}${src.row}`)
    }
  }

  for (const union of activeAnchorSourcePlots(plots, playerId, 'union')) {
    const unionDistricts = getPlotDistricts(union.row, union.col)
    if (unionDistricts.some((district) => targetDistricts.includes(district))) {
      const districtLabel = unionDistricts.join('/')
      add(1, `Union (${districtLabel} @ ${union.col}${union.row})`)
    }
  }

  const blockPresence = getBlockPresenceInfluenceBonus(playerId, plots, targetRow, targetCol)
  if (blockPresence.bonus > 0) add(blockPresence.bonus, blockPresence.labels[0]!)

  const streetOpp = getStreetOppositeInfluenceBonus(playerId, plots, targetRow, targetCol)
  if (streetOpp.bonus > 0) add(streetOpp.bonus, streetOpp.labels[0]!)

  if (action === 'takeover' || action === 'remove-investors') {
    const rivalBureauInBlock = plots.some(
      (bureau) =>
        bureau.type === 'city' &&
        bureau.claimedBy !== undefined &&
        bureau.claimedBy !== playerId &&
        bureau.builtProperty === 'regulation-bureau' &&
        !bureau.anchorInfluenceSuppressed &&
        isPlotInCityBlock(bureau, targetRow, targetCol)
    )
    if (rivalBureauInBlock) add(-1, 'rival Regulation Bureau (block)')
  }

  return { bonus, labels }
}

/**
 * When `incomePlayerId` resolves Income from properties: for each of their built **business** lots
 * (non-anchor property cards) that share a city block with an active opponent Mafia, $1M is owed to that
 * Mafia owner (per distinct opposing Mafia owner in that block).
 */
export function getMafiaLevyForIncomePlayer(
  incomePlayerId: number,
  plots: Plot[]
): { levyTotal: number; recipientAmounts: Record<number, number> } {
  const recipientAmounts: Record<number, number> = {}
  let levyTotal = 0

  for (const p of plots) {
    if (p.type !== 'city' || p.claimedBy !== incomePlayerId || !p.builtProperty) continue
    const card = propertyCards.find((x) => x.id === p.builtProperty) as PropertyCard | undefined
    if (!card || card.type === 'anchor') continue

    const mafiaInBlock = plots.filter(
      (m) =>
        m.type === 'city' &&
        m.builtProperty === 'mafia' &&
        m.claimedBy !== undefined &&
        m.claimedBy !== incomePlayerId &&
        !m.anchorInfluenceSuppressed &&
        isPlotInCityBlock(p, m.row, m.col)
    )
    if (mafiaInBlock.length === 0) continue

    const owners = new Set(mafiaInBlock.map((m) => m.claimedBy!))
    for (const ownerId of owners) {
      recipientAmounts[ownerId] = (recipientAmounts[ownerId] ?? 0) + 1
      levyTotal += 1
    }
  }

  return { levyTotal, recipientAmounts }
}

/**
 * Scandal attacker: +1 to your roll if you own a built Influencer anchor whose influence is still active.
 */
export function getInfluencerScandalRollBonus(
  attackerPlayerId: number,
  plots: Plot[]
): { bonus: number; labels: string[] } {
  const has = activeAnchorSourcePlots(plots, attackerPlayerId, 'media').length > 0
  if (!has) return { bonus: 0, labels: [] }
  return { bonus: 1, labels: ['Influencer (Scandals)'] }
}

/**
 * Scandal attacker: +1 max when you own a built Influencer and/or News Outlet (each qualifies Scandal rolls only).
 */
export function getScandalAttackerRollBonuses(
  attackerPlayerId: number,
  plots: Plot[]
): { bonus: number; labels: string[] } {
  const labels: string[] = []
  const hasInf = activeAnchorSourcePlots(plots, attackerPlayerId, 'media').length > 0
  const hasNews = activeAnchorSourcePlots(plots, attackerPlayerId, 'news-outlet').length > 0
  if (hasInf) labels.push('Influencer (Scandals)')
  if (hasNews) labels.push('News Outlet (Scandals)')
  const bonus = hasInf || hasNews ? 1 : 0
  return { bonus, labels }
}

/** Cash (in $M) the owner pays an investor when Remove Investors succeeds — 50% of contribution, rounded down to integer $M. */
export function investorRemovalBuyoutMillion(contributionMillion: number): number {
  if (contributionMillion <= 0) return 0
  return Math.floor(contributionMillion / 2)
}

/** Total buyout the owner must cover to succeed at Remove Investors on this lot (every investor payout summed). */
export function totalRemoveInvestorsBuyoutMillion(
  stripes: Array<{ contributionMillion: number }> | undefined
): number {
  if (!stripes?.length) return 0
  return stripes.reduce((acc, s) => acc + investorRemovalBuyoutMillion(s.contributionMillion), 0)
}

export type InvestorIncomeStripeDetail = { million: number; propertyLabel: string }

export type InvestorIncomeAwardDetail = {
  investorId: number
  totalMillion: number
  stripes: InvestorIncomeStripeDetail[]
}

/**
 * Cash from the bank to an investor each time the property owner resolves Income for that stripe:
 * 25% of the amount invested ($M), i.e. contribution ÷ 4 (e.g. $4M → $1M, $8M → $2M). When the
 * owner collects Income, this amount is paid from the owner's collected proceeds, not from the bank.
 */
export function investmentIncomePayoutMillion(contributionMillion: number): number {
  if (contributionMillion <= 0) return 0
  return Math.floor(contributionMillion / 4)
}

/**
 * Investors are paid only from the owner's collected income for this resolution (no bank top-up).
 * If total owed exceeds `earnedIncome`, each investor's payout is pro-rated down (integer $M, sums to earnedIncome).
 */
export function allocateInvestorPayoutsFromOwner(
  earnedIncome: number,
  payoutByPlayerId: Record<number, number>
): { scaled: Record<number, number>; ownerKeeps: number } {
  const entries = Object.entries(payoutByPlayerId).filter(([, v]) => v > 0)
  const totalOwed = entries.reduce((s, [, v]) => s + v, 0)
  if (entries.length === 0 || totalOwed <= 0) {
    return { scaled: {}, ownerKeeps: earnedIncome }
  }
  if (earnedIncome <= 0) {
    const scaled: Record<number, number> = {}
    for (const [idStr] of entries) scaled[Number(idStr)] = 0
    return { scaled, ownerKeeps: 0 }
  }
  if (earnedIncome >= totalOwed) {
    const scaled: Record<number, number> = {}
    for (const [idStr, v] of entries) scaled[Number(idStr)] = v
    return { scaled, ownerKeeps: earnedIncome - totalOwed }
  }
  let allocated = 0
  const scaled: Record<number, number> = {}
  entries.forEach(([idStr, owed], idx) => {
    const id = Number(idStr)
    if (idx === entries.length - 1) {
      scaled[id] = earnedIncome - allocated
    } else {
      const x = Math.floor((earnedIncome * owed) / totalOwed)
      scaled[id] = x
      allocated += x
    }
  })
  return { scaled, ownerKeeps: 0 }
}

/**
 * Mafia tribute is paid only from income remaining after investor shares.
 * If remaining cash cannot cover the full levy, recipients are pro-rated so money is never created.
 */
export function allocateMafiaTributeFromOwner(
  availableMillion: number,
  recipientAmounts: Record<number, number>
): { scaled: Record<number, number>; ownerKeeps: number; paidTotal: number } {
  const entries = Object.entries(recipientAmounts).filter(([, v]) => v > 0)
  const totalOwed = entries.reduce((s, [, v]) => s + v, 0)
  if (entries.length === 0 || totalOwed <= 0) {
    return { scaled: {}, ownerKeeps: availableMillion, paidTotal: 0 }
  }
  if (availableMillion <= 0) {
    const scaled: Record<number, number> = {}
    for (const [idStr] of entries) scaled[Number(idStr)] = 0
    return { scaled, ownerKeeps: 0, paidTotal: 0 }
  }
  if (availableMillion >= totalOwed) {
    const scaled: Record<number, number> = {}
    for (const [idStr, v] of entries) scaled[Number(idStr)] = v
    return { scaled, ownerKeeps: availableMillion - totalOwed, paidTotal: totalOwed }
  }
  let allocated = 0
  const scaled: Record<number, number> = {}
  entries.forEach(([idStr, owed], idx) => {
    const id = Number(idStr)
    if (idx === entries.length - 1) {
      scaled[id] = availableMillion - allocated
    } else {
      const x = Math.floor((availableMillion * owed) / totalOwed)
      scaled[id] = x
      allocated += x
    }
  })
  return { scaled, ownerKeeps: 0, paidTotal: availableMillion }
}

/**
 * When a founder resolves Income on properties they own, each investment stripe (other players only)
 * accrues 25% of the contributed amount ($M) per stripe per resolution — paid from the owner's
 * collected income (see allocateInvestorPayoutsFromOwner). Park, Museum, Civic Center lots,
 * City Hall, Courthouse, and Police do not pay investors.
 */
export function computeInvestorIncomeAwardsForOwner(
  plots: Plot[],
  ownerPlayerId: number
): { payoutByPlayerId: Record<number, number>; awards: InvestorIncomeAwardDetail[] } {
  const pending = new Map<number, { total: number; stripes: InvestorIncomeStripeDetail[] }>()
  for (const plot of plots) {
    if (plot.claimedBy !== ownerPlayerId || !plot.builtProperty || !plot.investmentStripes?.length) continue
    if (!plotSupportsInvestmentIncome(plot.builtProperty)) continue
    const propertyName =
      propertyCards.find((c) => c.id === plot.builtProperty)?.name ?? plot.building ?? 'Property'
    const propertyLabel = `${propertyName} (${plot.col}${plot.row})`
    for (const stripe of plot.investmentStripes) {
      if (stripe.investorId === ownerPlayerId) continue
      if (stripe.contributionMillion <= 0) continue
      const payout = investmentIncomePayoutMillion(stripe.contributionMillion)
      if (payout <= 0) continue
      const cur = pending.get(stripe.investorId) ?? { total: 0, stripes: [] }
      cur.total += payout
      cur.stripes.push({ million: payout, propertyLabel })
      pending.set(stripe.investorId, cur)
    }
  }
  const payoutByPlayerId: Record<number, number> = {}
  const awards: InvestorIncomeAwardDetail[] = []
  for (const [investorId, { total, stripes }] of pending) {
    payoutByPlayerId[investorId] = total
    awards.push({ investorId, totalMillion: total, stripes })
  }
  awards.sort((a, b) => a.investorId - b.investorId)
  return { payoutByPlayerId, awards }
}
