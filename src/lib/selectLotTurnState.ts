import { propertyCards } from '@/lib/cardData'
import { getPlotBoardLetter } from '@/lib/lotCategory'
import type { GameState } from '@/lib/types'
import { anchorTooltip } from '@/components/game/board/boardLotVisuals'

const PROPERTY_CARD_BY_ID = new Map(propertyCards.map((c) => [c.id, c]))

export type InvestorStripeView = { key: string; color: string; title: string }

/** Sparse per-lot overlay — only claimed, built, or suppressed city lots. */
export type LotTurnState = {
  key: string
  col: string
  row: number
  claimedBy?: number
  claimColor?: string
  builtProperty?: string
  letter: string | null
  title: string
  highDensity: boolean
  suppressed: boolean
  stripes: InvestorStripeView[]
  tooltip?: string
}

export type LastBuiltToken = { key: string; color: string }

const EMPTY_STATES: LotTurnState[] = []
const EMPTY_STRIPES: InvestorStripeView[] = []

type CacheEntry = { fp: string; state: LotTurnState }

let overlayCache: { arr: LotTurnState[]; byKey: Map<string, CacheEntry> } = {
  arr: EMPTY_STATES,
  byKey: new Map(),
}

let lastBuiltFp = ''
let lastBuiltCache: LastBuiltToken | null = null

function fingerprint(s: LotTurnState): string {
  const stripeFp = s.stripes.map((x) => `${x.key}:${x.color}`).join(',')
  return [
    s.claimedBy ?? '',
    s.claimColor ?? '',
    s.builtProperty ?? '',
    s.letter ?? '',
    s.title,
    s.highDensity ? 1 : 0,
    s.suppressed ? 1 : 0,
    s.tooltip ?? '',
    stripeFp,
  ].join('|')
}

function buildState(
  plot: GameState['plots'][number],
  playerById: Map<number, { id: number; color: string; name: string }>
): LotTurnState {
  const isClaimed = plot.claimedBy !== undefined
  const builtCard = plot.builtProperty ? PROPERTY_CARD_BY_ID.get(plot.builtProperty) : undefined
  const claimColor = isClaimed ? playerById.get(plot.claimedBy!)?.color : undefined
  const highDensity =
    isClaimed &&
    plot.housingHighDensity === true &&
    (plot.builtProperty?.startsWith('housing') ?? false)
  const anchorTitle = builtCard?.type === 'anchor' ? builtCard.name : null
  const title = (anchorTitle ?? plot.building ?? '').replace(/\s*\n+\s*/g, ' ').trim()
  const letter = plot.building ? getPlotBoardLetter(plot, builtCard) : null
  const tooltip =
    isClaimed && builtCard?.type === 'anchor'
      ? anchorTooltip(builtCard)
      : highDensity
        ? 'Large housing structure (high density) — neon outline is your founder color. Takeover dice on this city block: −1 defender influence per high-density housing lot in the district.'
        : undefined

  let stripes: InvestorStripeView[] = EMPTY_STRIPES
  if (plot.investmentStripes && plot.investmentStripes.length > 0) {
    stripes = plot.investmentStripes.map((s, si) => {
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

  return {
    key: `${plot.col}${plot.row}`,
    col: plot.col,
    row: plot.row,
    claimedBy: plot.claimedBy,
    claimColor,
    builtProperty: plot.builtProperty,
    letter,
    title,
    highDensity,
    suppressed: plot.anchorInfluenceSuppressed === true,
    stripes,
    tooltip,
  }
}

/**
 * Overlay records for the ownership + buildings layers.
 * Unchanged lots reuse the previous object; if nothing visual changed the
 * returned array is the same reference so React can skip the board.
 */
export function selectLotTurnStates(gs: GameState): LotTurnState[] {
  const playerById = new Map(gs.players.map((p) => [p.id, p]))
  const next: LotTurnState[] = []
  const nextByKey = new Map<string, CacheEntry>()

  for (const plot of gs.plots) {
    if (plot.type !== 'city') continue
    const isClaimed = plot.claimedBy !== undefined
    const suppressed = plot.anchorInfluenceSuppressed === true
    if (!isClaimed && !suppressed) continue

    const draft = buildState(plot, playerById)
    const fp = fingerprint(draft)
    const prev = overlayCache.byKey.get(draft.key)
    const entry = prev && prev.fp === fp ? prev : { fp, state: draft }
    next.push(entry.state)
    nextByKey.set(draft.key, entry)
  }

  if (next.length === 0) {
    overlayCache = { arr: EMPTY_STATES, byKey: nextByKey }
    return EMPTY_STATES
  }

  if (overlayCache.arr.length === next.length) {
    let same = true
    for (let i = 0; i < next.length; i++) {
      if (next[i] !== overlayCache.arr[i]) {
        same = false
        break
      }
    }
    if (same) return overlayCache.arr
  }

  overlayCache = { arr: next, byKey: nextByKey }
  return next
}

/** Single pawn token for the lot that was just built this turn. */
export function selectLastBuiltToken(gs: GameState): LastBuiltToken | null {
  const lb = gs.lastBuiltProperty
  if (!lb) {
    if (lastBuiltFp === '') return lastBuiltCache
    lastBuiltFp = ''
    lastBuiltCache = null
    return null
  }
  const key = `${lb.col}${lb.row}`
  const color = gs.players[gs.currentPlayerIndex]?.color ?? '#ffffff'
  const fp = `${key}|${color}`
  if (fp === lastBuiltFp) return lastBuiltCache
  lastBuiltFp = fp
  lastBuiltCache = { key, color }
  return lastBuiltCache
}
