import { drawCards, shuffleDeck } from '@/lib/deckUtils'
import type { CardInstance } from '@/lib/cardTypes'
import type { GameState, Player } from '@/lib/types'

export const CALAMITY_CARD_ID = 'calamity'

export type CalamityFace = 1 | 2 | 3 | 4 | 5 | 6

/** 5% of treasury per pip — a 1 is 5%, a 6 is 30%. Flavor never changes the stakes. */
export const CALAMITY_LOSS_PERCENT: Record<CalamityFace, number> = {
  1: 5,
  2: 10,
  3: 15,
  4: 20,
  5: 25,
  6: 30,
}

/** Minimum full table rounds between Calamity events (inclusive gap from last fire). */
export const CALAMITY_MIN_ROUNDS_BETWEEN = 6

export const CALAMITY_PRE_ROLL_INSTRUCTION =
  'Roll the dice to assess the severity of your calamity. 1 is less severe and 6 is more severe.'

export type CalamityVariant = {
  key: string
  title: string
  flavor: string
}

export const CALAMITY_VARIANTS: Record<CalamityFace, CalamityVariant[]> = {
  1: [
    { key: '1-late-invoice', title: 'Late Invoice', flavor: 'A client pays 30 days late, squeezing your cash flow.' },
    { key: '1-petty-theft', title: 'Petty Theft', flavor: 'A small amount of cash or inventory goes missing.' },
    { key: '1-utility-overage', title: 'Utility Overage', flavor: 'A higher-than-expected bill catches you off guard.' },
    { key: '1-minor-glitch', title: 'Minor Glitch', flavor: 'A small equipment hiccup costs you a bit of downtime.' },
  ],
  2: [
    { key: '2-rising-costs', title: 'Rising Costs', flavor: 'Inflation nudges up your supply expenses.' },
    { key: '2-late-fee', title: 'Late Fee', flavor: 'A missed deadline triggers an interest or penalty charge.' },
    { key: '2-paperwork-fine', title: 'Paperwork Fine', flavor: 'A minor compliance slip-up costs you a fine.' },
    { key: '2-slow-season', title: 'Slow Season', flavor: 'A temporary dip in demand softens your revenue.' },
  ],
  3: [
    { key: '3-vendor-hike', title: 'Vendor Price Hike', flavor: 'A key supplier raises prices without warning.' },
    { key: '3-equipment', title: 'Equipment Breakdown', flavor: 'Something critical needs an unplanned repair.' },
    { key: '3-property-repair', title: 'Property Repair', flavor: 'A leaky roof or broken system needs fixing now.' },
    { key: '3-fender-bender', title: 'Fender Bender', flavor: 'An uninsured mishap costs more than expected.' },
  ],
  4: [
    { key: '4-data-breach', title: 'Data Breach', flavor: 'A cybersecurity incident costs you time and money to fix.' },
    { key: '4-lost-client', title: 'Lost Client', flavor: 'Your biggest account walks away for a competitor.' },
    { key: '4-key-departure', title: 'Key Departure', flavor: 'A critical team member leaves at the worst time.' },
    { key: '4-fraud-scare', title: 'Fraud Scare', flavor: 'You catch (and have to clean up after) an internal fraud attempt.' },
  ],
  5: [
    { key: '5-legal', title: 'Legal Settlement', flavor: 'A dispute gets resolved, but it costs you.' },
    { key: '5-sector', title: 'Sector Downturn', flavor: 'A market shift hits your industry hard.' },
    { key: '5-partner-buyout', title: 'Partner Buyout', flavor: 'A co-founder exits and needs to be bought out.' },
    { key: '5-property-damage', title: 'Property Damage', flavor: 'An accident or disaster damages your space.' },
  ],
  6: [
    { key: '6-judgment', title: 'Major Judgment', flavor: 'A lawsuit doesn\'t go your way.' },
    { key: '6-shakeup', title: 'Industry Shakeup', flavor: 'A sudden, sector-wide crisis hits everyone at once.' },
    { key: '6-partner-exit', title: 'Founding Partner Exit', flavor: 'A key partner leaves the company unexpectedly.' },
    { key: '6-asset-loss', title: 'Major Asset Loss', flavor: 'You lose a major piece of property or equipment outright.' },
  ],
}

const RECENT_VARIANT_CAP = 12

export function isCalamityFace(n: number): n is CalamityFace {
  return n === 1 || n === 2 || n === 3 || n === 4 || n === 5 || n === 6
}

export function calamityPercentForFace(face: number): number {
  if (!isCalamityFace(face)) return CALAMITY_LOSS_PERCENT[1]
  return CALAMITY_LOSS_PERCENT[face]
}

/** Whole millions lost, never more than current cash. */
export function calamityLossMillion(money: number, face: number): number {
  const cash = Math.max(0, Math.floor(money))
  const pct = calamityPercentForFace(face)
  return Math.min(cash, Math.floor((cash * pct) / 100))
}

export function findCalamityVariant(face: number, variantKey: string): CalamityVariant | undefined {
  if (!isCalamityFace(face)) return undefined
  return CALAMITY_VARIANTS[face].find((v) => v.key === variantKey)
}

/**
 * Prefer unused flavor for this face. Once every variant for that face has been
 * seen recently, the pool resets so the electronic table stays varied without
 * changing the 5%-step stakes.
 */
export function pickCalamityVariant(
  face: number,
  usedKeys: string[] | undefined,
  rng: () => number = Math.random
): CalamityVariant {
  const f: CalamityFace = isCalamityFace(face) ? face : 1
  const pool = CALAMITY_VARIANTS[f]
  const used = new Set(usedKeys ?? [])
  const unused = pool.filter((v) => !used.has(v.key))
  const pickFrom = unused.length > 0 ? unused : pool
  const idx = Math.min(pickFrom.length - 1, Math.max(0, Math.floor(rng() * pickFrom.length)))
  return pickFrom[idx] ?? pool[0]
}

export function rememberCalamityVariantKey(usedKeys: string[] | undefined, key: string): string[] {
  const next = [...(usedKeys ?? []).filter((k) => k !== key), key]
  return next.slice(-RECENT_VARIANT_CAP)
}

export function calamityAllowedThisRound(
  state: Pick<GameState, 'lastCalamityPlayRound' | 'playRoundNumber' | 'pendingCalamity'>
): boolean {
  if (state.pendingCalamity) return false
  const last = state.lastCalamityPlayRound
  if (last == null) return true
  const round = state.playRoundNumber ?? 1
  return round >= last + CALAMITY_MIN_ROUNDS_BETWEEN
}

export const CALAMITY_ACCEPT_LABEL = 'Accept Calamity'

/** Post-roll banner body: die result, percent of cash reserve lost, and the table cause. */
export function calamityPostRollBannerDetail(opts: {
  face?: number
  playerName: string
  percent: number
  lossMillion: number
  variant: CalamityVariant
}): string {
  const lines: string[] = []
  if (opts.face != null) lines.push(`Rolled ${opts.face}.`)
  lines.push(`${opts.percent}% of cash reserve lost.`)
  lines.push(opts.variant.title)
  lines.push(opts.variant.flavor)
  lines.push(`${opts.playerName} loses $${opts.lossMillion}M.`)
  return lines.join('\n')
}

function drawNonCalamityReplacements(
  deckIn: CardInstance[],
  discardIn: CardInstance[],
  count: number
): {
  drawn: CardInstance[]
  deck: CardInstance[]
  discard: CardInstance[]
  skipped: CardInstance[]
} {
  let deck = [...deckIn]
  let discard = [...discardIn]
  const drawn: CardInstance[] = []
  const skipped: CardInstance[] = []
  let guard = 0
  while (drawn.length < count && guard++ < 400) {
    if (deck.length === 0) {
      if (discard.length === 0) break
      deck = shuffleDeck(discard)
      discard = []
    }
    const next = deck[0]
    deck = deck.slice(1)
    if (!next) break
    if (next.cardId === CALAMITY_CARD_ID) skipped.push(next)
    else drawn.push(next)
  }
  return { drawn, deck, discard, skipped }
}

/**
 * Split a just-drawn action batch: at most one Calamity fires (and only when the
 * 6-round gap has elapsed). Extra or too-soon copies are buried back into the
 * deck and replaced with non-Calamity cards so the founder still gets their draw.
 */
export function resolveCalamityDraw(
  state: GameState,
  drawn: CardInstance[],
  deck: CardInstance[],
  discard: CardInstance[],
  opts?: { forceBury?: boolean }
): {
  kept: CardInstance[]
  firing: CardInstance[]
  deck: CardInstance[]
  discard: CardInstance[]
} {
  const { kept: drawnKept, calamities } = splitCalamityDraws(drawn)
  const firing: CardInstance[] = []
  const bury: CardInstance[] = []
  const canFire = !opts?.forceBury && calamityAllowedThisRound(state)
  for (const card of calamities) {
    if (canFire && firing.length === 0) firing.push(card)
    else bury.push(card)
  }
  const replaced = drawNonCalamityReplacements(deck, discard, bury.length)
  bury.push(...replaced.skipped)
  return {
    kept: [...drawnKept, ...replaced.drawn],
    firing,
    deck: shuffleDeck([...replaced.deck, ...bury]),
    discard: replaced.discard,
  }
}

export function dealActionHandSkippingCalamity(
  deck: CardInstance[],
  count: number
): { hand: CardInstance[]; remaining: CardInstance[] } {
  const kept: CardInstance[] = []
  const skipped: CardInstance[] = []
  let remaining = [...deck]
  while (kept.length < count && remaining.length > 0) {
    const take = Math.min(count - kept.length, remaining.length)
    const { drawn, remaining: rest } = drawCards(remaining, take)
    remaining = rest
    const split = splitCalamityDraws(drawn)
    kept.push(...split.kept)
    skipped.push(...split.calamities)
  }
  return { hand: kept, remaining: shuffleDeck([...remaining, ...skipped]) }
}

export function splitCalamityDraws(drawn: CardInstance[]): {
  kept: CardInstance[]
  calamities: CardInstance[]
} {
  const calamities: CardInstance[] = []
  const kept: CardInstance[] = []
  for (const card of drawn) {
    if (card.cardId === CALAMITY_CARD_ID) calamities.push(card)
    else kept.push(card)
  }
  return { kept, calamities }
}

export function calamityRollOrderPlayerIds(players: Player[], drawerIndex: number): number[] {
  const n = players.length
  if (n === 0) return []
  const start = ((drawerIndex % n) + n) % n
  const ids: number[] = []
  for (let i = 0; i < n; i++) {
    const p = players[(start + i) % n]
    if (p) ids.push(p.id)
  }
  return ids
}

export function currentCalamityRoller(state: GameState): Player | undefined {
  const pending = state.pendingCalamity
  if (!pending) return undefined
  const id = pending.rollOrderPlayerIds[pending.currentRollIndex]
  return state.players.find((p) => p.id === id)
}

export function beginCalamity(
  state: GameState,
  drawerPlayerIndex: number,
  calamities: CardInstance[]
): GameState {
  if (calamities.length === 0) return state
  const [first, ...rest] = calamities
  if (state.pendingCalamity) {
    return {
      ...state,
      actionDeck: shuffleDeck([...state.actionDeck, ...calamities]),
    }
  }
  const drawer = state.players[drawerPlayerIndex] ?? state.players[state.currentPlayerIndex]
  if (!first || !drawer) return state
  return {
    ...state,
    lastCalamityPlayRound: state.playRoundNumber ?? 1,
    actionDeck: rest.length > 0 ? shuffleDeck([...state.actionDeck, ...rest]) : state.actionDeck,
    pendingCalamity: {
      instance: first,
      drawnByPlayerId: drawer.id,
      drawnByName: drawer.name,
      rollOrderPlayerIds: calamityRollOrderPlayerIds(state.players, drawerPlayerIndex),
      currentRollIndex: 0,
      queuedInstances: [],
    },
  }
}

/**
 * Fold a just-drawn action batch into state: calamity never enters a hand.
 * At most one city-wide resolution starts, and only when six play rounds have
 * passed since the last Calamity. Extra copies are buried and replaced.
 */
export function ingestActionDraw(
  state: GameState,
  drawerPlayerIndex: number,
  drawn: CardInstance[],
  deck: CardInstance[],
  discard: CardInstance[],
  mode: 'append' | 'replace'
): GameState {
  const resolved = resolveCalamityDraw(state, drawn, deck, discard)
  const players = state.players.map((p, i) => {
    if (i !== drawerPlayerIndex) return p
    const hand = mode === 'replace' ? resolved.kept : [...(p.actionCards || []), ...resolved.kept]
    return { ...p, actionCards: hand }
  })
  const next: GameState = {
    ...state,
    players,
    actionDeck: resolved.deck,
    actionDiscard: resolved.discard,
    newCardsDrawn: resolved.kept.length > 0 ? resolved.kept : undefined,
    showNewCardsAnimation: resolved.kept.length > 0,
  }
  return beginCalamity(next, drawerPlayerIndex, resolved.firing)
}

export type ApplyCalamityRollResult =
  | {
      ok: true
      state: GameState
      playerName: string
      result: CalamityFace
      percent: number
      lossMillion: number
      variant: CalamityVariant
      cityWideComplete: boolean
    }
  | { ok: false; error: string; code: string }

export function applyCalamityRoll(
  state: GameState,
  result: number,
  variantKey: string
): ApplyCalamityRollResult {
  const pending = state.pendingCalamity
  if (!pending) return { ok: false, error: 'No calamity is pending.', code: 'no_pending_calamity' }
  if (!isCalamityFace(result)) return { ok: false, error: 'Invalid die result.', code: 'bad_roll' }

  const rollerId = pending.rollOrderPlayerIds[pending.currentRollIndex]
  const roller = state.players.find((p) => p.id === rollerId)
  if (!roller) return { ok: false, error: 'Calamity roller not found.', code: 'bad_roller' }

  const variant = findCalamityVariant(result, variantKey) ?? pickCalamityVariant(result, state.calamityUsedVariantKeys)
  const percent = CALAMITY_LOSS_PERCENT[result]
  const lossMillion = calamityLossMillion(roller.money, result)
  const players = state.players.map((p) =>
    p.id === roller.id ? { ...p, money: Math.max(0, p.money - lossMillion) } : p
  )
  const usedKeys = rememberCalamityVariantKey(state.calamityUsedVariantKeys, variant.key)
  const nextIndex = pending.currentRollIndex + 1
  const moreRolls = nextIndex < pending.rollOrderPlayerIds.length

  let next: GameState = {
    ...state,
    players,
    calamityUsedVariantKeys: usedKeys,
    pendingCalamity: moreRolls ? { ...pending, currentRollIndex: nextIndex } : undefined,
  }

  if (!moreRolls) {
    next = {
      ...next,
      actionDiscard: [...next.actionDiscard, pending.instance],
    }
    if (pending.queuedInstances.length > 0) {
      next = {
        ...next,
        actionDeck: shuffleDeck([...next.actionDeck, ...pending.queuedInstances]),
      }
    }
  }

  return {
    ok: true,
    state: next,
    playerName: roller.name,
    result,
    percent,
    lossMillion,
    variant,
    cityWideComplete: !moreRolls && next.pendingCalamity == null,
  }
}
