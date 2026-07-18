import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { propertyCards } from './cardData'
import type { PropertyCard } from './cardTypes'
import { getOrthogonalCityNeighborsIncludingStreetSpan } from './boardAdjacency'
import { isPlotInCityBlock, plotSupportsInvestmentIncome } from './investmentTargets'
import { Plot, COLUMNS } from './types'
import { getPlotDistricts, type District } from './districts'

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

export interface WinningSequence {
  /** The 9 sequential plots that triggered the end of the game (in discovery order). */
  plots: Array<{ row: number; col: string }>
  /** Founder id of the player who triggered the end of the game. */
  triggeredByPlayerId: number
}

/** Small utility — coordinate key for a plot. */
function plotKey(row: number, col: string): string {
  return `${col}${row}`
}

/** Sequential adjacency for end-game (orthogonal or one street between). */
function sequentialNeighbors(row: number, col: string): Array<{ row: number; col: string }> {
  return getOrthogonalCityNeighborsIncludingStreetSpan(row, col)
}

/**
 * End-of-game trigger: detect any player who has 9+ built city lots forming a connected component
 * under sequential adjacency (orthogonal or street-spanning). Returns the first 9-lot subset found
 * along with the triggering player id, or null if no player qualifies.
 */
export function checkForNineSequentialProperties(plots: Plot[]): WinningSequence | null {
  const builtByOwner = new Map<number, Plot[]>()
  for (const p of plots) {
    if (p.type !== 'city' || !p.builtProperty || p.claimedBy === undefined) continue
    const arr = builtByOwner.get(p.claimedBy) ?? []
    arr.push(p)
    builtByOwner.set(p.claimedBy, arr)
  }

  for (const [playerId, ownerPlots] of builtByOwner) {
    if (ownerPlots.length < 9) continue
    const owned = new Set(ownerPlots.map((p) => plotKey(p.row, p.col)))
    const visited = new Set<string>()

    for (const seed of ownerPlots) {
      const seedKey = plotKey(seed.row, seed.col)
      if (visited.has(seedKey)) continue

      const stack: Array<{ row: number; col: string }> = [{ row: seed.row, col: seed.col }]
      const component: Array<{ row: number; col: string }> = []
      while (stack.length > 0) {
        const cur = stack.pop()!
        const key = plotKey(cur.row, cur.col)
        if (visited.has(key)) continue
        visited.add(key)
        component.push(cur)
        for (const n of sequentialNeighbors(cur.row, cur.col)) {
          if (!owned.has(plotKey(n.row, n.col))) continue
          if (visited.has(plotKey(n.row, n.col))) continue
          stack.push(n)
        }
      }
      if (component.length >= 9) {
        return { plots: component.slice(0, 9), triggeredByPlayerId: playerId }
      }
    }
  }
  return null
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

const SQUARE_BONUS_MILLION = 30
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
 * +$1M per other built property this player owns on the same city block as any active Union anchor they own
 * (Union anchor cell excluded), mirroring Church Affiliation block bonuses.
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
 * −$1M per built property this player owns that sits in the same city block as another founder’s active Union anchor.
 * Lost income is not paid to the Union owner (contrast with Mafia tribute).
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

/**
 * Anchor Tenet influence from the reference card.
 *
 * Citywide: Church (T/R), Mafia (T/R/IR), Regulation Bureau (T/R/IR).
 * District: Farm Bureau, Port Authority, Arts Council, Tourism Office, and Union (T/R/IR).
 * Block pressure: an opponent Regulation Bureau applies −1 on T/IR in its block.
 *
 * Each Anchor identity contributes at most once to a roll, even if the player owns
 * multiple copies. Different applicable identities stack.
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
  const has = (id: string) => activeAnchorSourcePlots(plots, playerId, id).length > 0

  if ((action === 'takeover' || action === 'rezoning') && has('church')) {
    add(1, 'Church Affiliation (citywide)')
  }
  if (has('mafia')) add(1, 'Mafia (citywide)')
  if (has('regulation-bureau')) add(1, 'Regulation Bureau (citywide)')

  const targetDistricts = getPlotDistricts(targetRow, targetCol)
  const regional: Array<{ id: string; district: District; label: string }> = [
    { id: 'farm-coop', district: 'Farmland', label: 'Farm Bureau (Farmland)' },
    { id: 'port-authority', district: 'Railway District', label: 'Port Authority (Railway)' },
    { id: 'arts-council', district: 'Riverfront', label: 'Arts Council (River Parkway)' },
    { id: 'tourism-office', district: 'Mountain Cove', label: 'Tourism Office (Mountain Cove)' },
  ]
  for (const entry of regional) {
    if (targetDistricts.includes(entry.district) && has(entry.id)) {
      add(1, entry.label)
    }
  }

  const unionCoversTarget = activeAnchorSourcePlots(plots, playerId, 'union').some((union) => {
    const unionDistricts = getPlotDistricts(union.row, union.col)
    return unionDistricts.some((district) => targetDistricts.includes(district))
  })
  if (unionCoversTarget) add(1, 'Union (played district)')

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
