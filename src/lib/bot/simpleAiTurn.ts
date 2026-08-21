import type { ActionCard, CardInstance, PropertyCard } from '@/lib/cardTypes'
import type { Player, GameState, Plot } from '@/lib/types'
import { actionCards, propertyCards, ANCHOR_WILD_CARD_EMULATE_IDS, ACTION_WILD_CARD_ID } from '@/lib/cardData'
import { isActionWildCard, isValidActionWildEmulateId } from '@/lib/actionWildCard'
import { isCivicFlexHandCard } from '@/lib/civicFlexProperty'
import { getAvailableCivicVariantIds } from '@/lib/lotCategory'
import { resolvePropertyPlacementTemplate } from '@/lib/placementTemplate'
import { getValidPlotsForProperty, getVacantCityLotsForRezoning } from '@/lib/placementRules'
import {
  getHousingBuildCost,
  getPlotPropertyEndValue,
  getPlotPropertyIncome,
  HIGH_DENSITY_HOUSING_STATS,
  isHousingPropertyCard,
} from '@/lib/housingEconomics'
import {
  turnLimitReached,
  MAX_TURN_ACTIONS,
  MAX_ACTION_HAND_SIZE,
  canAttemptRezoning,
} from '@/lib/turnActions'
import { getInvestablePlots, getTakeoverTargetPlots } from '@/lib/investmentTargets'
import {
  getPlotsEligibleForScandal,
  largestOwnedAdjacentCluster,
  END_GAME_ADJACENT_THRESHOLD,
  totalRemoveInvestorsBuyoutMillion,
  countPlayerBuiltInCityBlock,
  blockCompletionBiasScore,
} from '@/lib/utils'
import { buildPlotIndex, getPlotAt } from '@/lib/boardIndex'

/** Matches PlayerHand → GameApp.handlePlayCards options subset. */
export type AiPlayOptions = {
  skipTaxBuildPrompt?: boolean
  useTaxBuild?: boolean
  housingHighDensity?: boolean
  wildCardEmulatePropertyId?: string
  wildCardEmulateActionId?: string
  taxBuildActionInstanceId?: string
  councilFreezeTargetId?: number
}

export interface SimpleAiTurnHandlers {
  handleEndTurn: () => void
  handleUndoLastActionCancel: () => void
  handleActionCriteriaBank: () => void
  handleCancelTakeoverSelect: () => void
  handleCancelScandalSelect: () => void
  handleCancelRezoning: () => void
  handleCancelInvestmentSelect: () => void
  handleCancelRemoveInvestorsSelect: () => void
  handleCancelDiscardPropertySelect: () => void
  /**
   * Complete Discard Property Cards for the acting seat (bots must not wait on the host hand rail).
   * Pass property instance ids to discard (may be empty — still spends the action).
   */
  handleConfirmDiscardProperty: (selectedPropertyInstanceIds?: string[]) => void
  /**
   * End-of-turn action-hand discard (soft cap of 8). Bots must resolve this in one shot —
   * never cancel/reopen — or the turn stalls forever.
   */
  handleDiscardActionCards: (discardedInstanceIds: string[]) => void
  /** Close Tax Dollars prompt panel (reject half-cost shortcut). */
  dismissTaxBuildPrompt: () => void
  cancelPlacement: () => void
  handlePlayCards: (
    propertyInstanceId: string | null,
    actionInstanceIds: string[],
    convertToCashInstanceIds: string[],
    options?: AiPlayOptions
  ) => void
  /** Property-card placement only. */
  handlePlotSelect: (row: number, col: string) => void
  /**
   * Board click for the active mode (investment / takeover / scandal / rezoning / remove-investors /
   * placement). Bots must use this so confrontational moves resolve without the host clicking.
   */
  handleBoardPlotSelect: (row: number, col: string) => void
  /** Rezoning hand / density steps (bots must complete these or they cancel-loop). */
  handleRezoningPropertySelect: (propertyInstanceId: string) => void
  handleRezoningHousingDensity: (highDensity: boolean) => void
  /** Resolve the 12-adjacent endgame declare / continue prompt. */
  handleEndGameDecision: (declare: boolean) => void
}

export interface SimpleAiTurnUi {
  undoActionDialogOpen: boolean
  boardNoticeActive: boolean
  showNewCardsAnimation: boolean
  taxBuildPromptOpen: boolean
  discardPropertyConfirmOpen: boolean
  discardDialogOpen: boolean
  /** How many action cards the end-of-turn discard dialog requires. */
  discardDialogNumToDiscard: number
  rollDieDialogOpen: boolean
  incomeDialogOpen: boolean
  takeoverSelectActive: boolean
  scandalSelectActive: boolean
  rezoningPhase: string
  investmentSelectActive: boolean
  removeInvestorsSelectActive: boolean
  discardPropertySelectActive: boolean
  taxBuildModePhase: string
  placementActive: boolean
  placementPropertyCardId: string | null
  placementWildEmulatePropertyId?: string
  placementHousingHighDensity?: boolean
  actionCriteriaDialogOpen: boolean
  /** Valid plots for the active select mode (takeover / scandal / investment / etc.). */
  selectValidPlots?: Plot[]
  /** Cash required to finish an open Investment / Double Investment select. */
  investmentContributionMillion?: number
}

function endGameProximityScore(plots: Plot[], playerId: number): number {
  const owned = plots.filter(
    (p) => p.type === 'city' && p.builtProperty && p.claimedBy === playerId
  ).length
  const cluster = largestOwnedAdjacentCluster(plots, playerId)
  if (cluster && cluster.plots.length >= END_GAME_ADJACENT_THRESHOLD) return 100
  return Math.max(owned, cluster?.plots.length ?? 0)
}

function propertyEndValue(builtPropertyId: string | undefined): number {
  if (!builtPropertyId) return 0
  const card = propertyCards.find((c) => c.id === builtPropertyId) as PropertyCard | undefined
  return card?.endGameValue ?? card?.buildCost ?? 0
}

/** Prefer discarding cheap non-anchor excess when the hand is bloated; keep anchors. */
export function pickAiDiscardPropertyIds(cp: Player): string[] {
  const ranked = cp.propertyCards
    .map((inst) => {
      const c = propertyCards.find((pc) => pc.id === inst.cardId) as PropertyCard | undefined
      if (!c || c.type === 'anchor') return null
      return {
        instanceId: inst.instanceId,
        cost: c.buildCost ?? 99,
        end: c.endGameValue ?? 0,
      }
    })
    .filter(Boolean) as { instanceId: string; cost: number; end: number }[]
  ranked.sort((a, b) => a.cost - b.cost || a.end - b.end)
  const excess = Math.max(0, cp.propertyCards.length - 4)
  const discardCount = Math.min(ranked.length, Math.max(excess > 0 ? 1 : 0, Math.min(excess, 3)))
  return ranked.slice(0, discardCount).map((r) => r.instanceId)
}

/**
 * Keep-score for end-of-turn action discard / mid-turn banking.
 * Higher = more valuable to keep (revenue + build tactics). Lower = discard or bank first.
 */
export function actionCardKeepScore(cardId: string): number {
  switch (cardId) {
    case 'income':
      return 100
    case ACTION_WILD_CARD_ID:
      return 92
    case 'double-income':
      return 95
    case 'investment':
    case 'double-investment':
      return 90
    case 'rezoning':
    case 'build-with-tax-dollars':
    case 'crossing-the-line':
      return 80
    case 'hostile-takeover':
    case 'remove-investors':
    case 'city-council-freeze':
    case 'scandal':
    case 'police-raid-on-mafia':
      return 45
    case 'taxation':
    case 'property-taxation':
      return 35
    case 'calamity':
      return 0
    case 'discard-property-cards':
      return 25
    case 'draw-2-action-cards':
      return 10
    case 'roll-die':
      return 15
    default:
      return 30
  }
}

function actionCardBankValue(cardId: string): number {
  const card = actionCards.find((c) => c.id === cardId) as ActionCard | undefined
  return card?.bankValue ?? 0
}

/** Exact card, or Action Wild Card copied as `cardId`. */
function findHandAction(
  cp: Player,
  cardId: string
): { instanceId: string; options?: AiPlayOptions } | null {
  const exact = cp.actionCards.find((a) => a.cardId === cardId)
  if (exact) return { instanceId: exact.instanceId }
  const wild = cp.actionCards.find((a) => isActionWildCard(a.cardId))
  if (wild && isValidActionWildEmulateId(cardId)) {
    return { instanceId: wild.instanceId, options: { wildCardEmulateActionId: cardId } }
  }
  return null
}

/**
 * Choose which action cards to discard down to the soft hand cap.
 * Discards lowest keep-score first (Draw 2 / fillers), keeps Income / Investment / build enablers.
 */
export function pickAiActionCardDiscardIds(cp: Player, discardCount: number): string[] {
  const n = Math.max(0, Math.floor(discardCount))
  if (n <= 0) return []
  const hand = cp.actionCards || []
  if (hand.length === 0) return []
  const ranked = hand.map((inst) => ({
    instanceId: inst.instanceId,
    keep: actionCardKeepScore(inst.cardId),
    bank: actionCardBankValue(inst.cardId),
  }))
  // Discard lowest keep first; among ties, discard lower bankValue (keep cashable cards if equal keep).
  ranked.sort((a, b) => a.keep - b.keep || a.bank - b.bank)
  return ranked.slice(0, Math.min(n, ranked.length)).map((r) => r.instanceId)
}

/**
 * Mid-turn: bank low-keep action cards for cash instead of drawing more that must be discarded.
 * Prefer cards with low keep-score but positive bankValue (cash flow).
 */
export function pickAiActionCardsToBank(cp: Player, maxToBank: number): string[] {
  const n = Math.max(0, Math.floor(maxToBank))
  if (n <= 0) return []
  const hand = cp.actionCards || []
  // Never bank core revenue engines — those should be played.
  const bankable = hand
    .filter((inst) => {
      const keep = actionCardKeepScore(inst.cardId)
      const bank = actionCardBankValue(inst.cardId)
      return bank > 0 && keep < 80
    })
    .map((inst) => ({
      instanceId: inst.instanceId,
      keep: actionCardKeepScore(inst.cardId),
      bank: actionCardBankValue(inst.cardId),
    }))
  // Bank lowest keep first; among ties, bank higher cash value.
  bankable.sort((a, b) => a.keep - b.keep || b.bank - a.bank)
  return bankable.slice(0, Math.min(n, bankable.length)).map((r) => r.instanceId)
}

/** $1M attempt + 120% of lot end value (Hostile Takeover buyout ceiling). */
function hostileTakeoverCashNeeded(plot: Plot): number {
  const card = plot.builtProperty
    ? (propertyCards.find((c) => c.id === plot.builtProperty) as PropertyCard | undefined)
    : undefined
  if (!card) return Number.POSITIVE_INFINITY
  return 1 + Math.ceil(getPlotPropertyEndValue(plot, card) * 1.2)
}

function pickRichestHumanTarget(gs: GameState, selfId: number): Player | null {
  const humans = gs.players.filter((p) => !p.isAi && p.id !== selfId)
  if (humans.length === 0) {
    const rivals = gs.players.filter((p) => p.id !== selfId)
    return rivals.sort((a, b) => b.money - a.money)[0] ?? null
  }
  return [...humans].sort((a, b) => b.money - a.money)[0] ?? null
}

/** Rough wealth so the bot avoids feeding the current table leader with investment cash. */
function playerWealthScore(gs: GameState, playerId: number): number {
  const p = gs.players.find((x) => x.id === playerId)
  if (!p) return 0
  let propertyValue = 0
  for (const plot of gs.plots) {
    if (plot.claimedBy !== playerId || !plot.builtProperty) continue
    propertyValue += propertyEndValue(plot.builtProperty)
  }
  return p.money + propertyValue
}

function tableLeaderId(gs: GameState, excludeId?: number): number | null {
  let bestId: number | null = null
  let best = -1
  for (const p of gs.players) {
    if (excludeId != null && p.id === excludeId) continue
    const w = playerWealthScore(gs, p.id)
    if (w > best) {
      best = w
      bestId = p.id
    }
  }
  return bestId
}

/**
 * Prefer investing in weaker (lower cash / property value) rivals — never feed the table leader.
 * Among those, prefer cheaper lots so the stripe is cheap relative to the cash paid.
 */
function pickInvestmentTarget(gs: GameState, selfId: number, valid: Plot[]): Plot | null {
  if (valid.length === 0) return null
  const leaderId = tableLeaderId(gs, selfId)
  const scored = valid.map((plot) => {
    const ownerId = plot.claimedBy
    const ownerWealth = ownerId != null ? playerWealthScore(gs, ownerId) : 0
    const feedsLeader = ownerId != null && ownerId === leaderId ? 1 : 0
    const lotValue = propertyEndValue(plot.builtProperty)
    // Higher score = better for the bot. Penalize feeding the leader; prefer poorer owners & cheaper lots.
    const score = -feedsLeader * 1000 - ownerWealth * 2 - lotValue
    return { plot, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.plot ?? null
}

function tryPlayConfrontation(
  gs: GameState,
  cp: Player,
  h: SimpleAiTurnHandlers
): boolean {
  const slotsLeft = MAX_TURN_ACTIONS - (gs.turnActionsConsumed ?? 0)
  if (slotsLeft <= 0) return false

  const freeze = findHandAction(cp, 'city-council-freeze')
  if (freeze && slotsLeft >= 1) {
    const rivals = gs.players.filter((p) => p.id !== cp.id)
    const threat = [...rivals].sort(
      (a, b) => endGameProximityScore(gs.plots, b.id) - endGameProximityScore(gs.plots, a.id)
    )[0]
    if (threat && endGameProximityScore(gs.plots, threat.id) >= 5) {
      h.handlePlayCards(null, [freeze.instanceId], [], {
        ...freeze.options,
        councilFreezeTargetId: threat.id,
      })
      return true
    }
  }

  // Hostile Takeover — only when at least one adjacent target is affordable.
  const takeover = findHandAction(cp, 'hostile-takeover')
  if (takeover && slotsLeft >= 1) {
    const targets = getTakeoverTargetPlots(gs.plots, cp.id).filter(
      (plot) => cp.money >= hostileTakeoverCashNeeded(plot)
    )
    const scored = targets
      .map((plot) => {
        const value = propertyEndValue(plot.builtProperty)
        const owner = gs.players.find((p) => p.id === plot.claimedBy)
        const againstHuman = owner && !owner.isAi ? 4 : 0
        return { plot, score: value + againstHuman }
      })
      .filter((t) => t.score >= 4)
      .sort((a, b) => b.score - a.score)
    if (scored.length > 0) {
      h.handlePlayCards(null, [takeover.instanceId], [], takeover.options)
      return true
    }
  }

  // Scandal — hit the strongest active opponent anchor.
  const scandal = findHandAction(cp, 'scandal')
  if (scandal && slotsLeft >= 1) {
    const eligible = getPlotsEligibleForScandal(gs.plots).filter((p) => p.claimedBy !== cp.id)
    if (eligible.length > 0) {
      const human = pickRichestHumanTarget(gs, cp.id)
      const preferHuman = human
        ? eligible.filter((p) => p.claimedBy === human.id)
        : []
      if (preferHuman.length > 0 || eligible.length > 0) {
        h.handlePlayCards(null, [scandal.instanceId], [], scandal.options)
        return true
      }
    }
  }

  // Police Raid — if any rival owns active Mafia.
  const raid = findHandAction(cp, 'police-raid-on-mafia')
  if (raid && slotsLeft >= 1) {
    const rivalMafia = gs.plots.some(
      (p) =>
        p.builtProperty === 'mafia' &&
        p.claimedBy != null &&
        p.claimedBy !== cp.id &&
        p.anchorInfluenceSuppressed !== true
    )
    if (rivalMafia) {
      h.handlePlayCards(null, [raid.instanceId], [], raid.options)
      return true
    }
  }

  // Rezoning — when we can afford success (2 slots) and have a vacant lot + template.
  const rezoning = findHandAction(cp, 'rezoning')
  if (
    rezoning &&
    canAttemptRezoning(gs.turnActionsConsumed) &&
    (gs.propertiesBuiltThisTurn ?? 0) < 1 &&
    gs.councilFreezeBlockBuildForPlayerId !== cp.id
  ) {
    const template = cp.propertyCards.find((pi) => {
      const c = propertyCards.find((x) => x.id === pi.cardId) as PropertyCard | undefined
      return c != null && c.type !== 'anchor'
    })
    if (template && getVacantCityLotsForRezoning(gs.plots).length > 0) {
      const card = propertyCards.find((c) => c.id === template.cardId) as PropertyCard
      const cost = getHousingBuildCost(card, false)
      if (cp.money >= cost) {
        h.handlePlayCards(null, [rezoning.instanceId], [], rezoning.options)
        return true
      }
    }
  }

  // Investment / Double Investment — only when we can afford the contribution and have targets.
  const doubleInvest = findHandAction(cp, 'double-investment')
  const singleInvest = findHandAction(cp, 'investment')
  const invest =
    doubleInvest && cp.money >= 8
      ? { ...doubleInvest, need: 8 }
      : singleInvest && cp.money >= 4
        ? { ...singleInvest, need: 4 }
        : null
  if (invest && slotsLeft >= 1) {
    const targets = getInvestablePlots(gs.plots, cp.id)
    if (targets.length > 0 && cp.money >= invest.need && pickInvestmentTarget(gs, cp.id, targets)) {
      h.handlePlayCards(null, [invest.instanceId], [], invest.options)
      return true
    }
  }

  // Remove Investors — only when at least one own lot's buyouts are affordable.
  const removeInv = findHandAction(cp, 'remove-investors')
  if (removeInv && slotsLeft >= 1) {
    const invested = gs.plots.filter(
      (p) => p.claimedBy === cp.id && (p.investmentStripes?.length ?? 0) > 0
    )
    const affordable = invested.filter(
      (p) => cp.money >= totalRemoveInvestorsBuyoutMillion(p.investmentStripes)
    )
    if (affordable.length > 0) {
      h.handlePlayCards(null, [removeInv.instanceId], [], removeInv.options)
      return true
    }
  }

  // Discard Property Cards — trim junk when hand is bloated.
  const discardProp = findHandAction(cp, 'discard-property-cards')
  if (discardProp && slotsLeft >= 1 && cp.propertyCards.length >= 5) {
    h.handlePlayCards(null, [discardProp.instanceId], [], discardProp.options)
    return true
  }

  return false
}

function tryCompleteSelectMode(
  gs: GameState,
  cp: Player,
  ui: SimpleAiTurnUi,
  h: SimpleAiTurnHandlers
): boolean {
  const valid = ui.selectValidPlots ?? []

  if (ui.takeoverSelectActive) {
    const affordable = valid.filter((p) => cp.money >= hostileTakeoverCashNeeded(p))
    if (affordable.length === 0) {
      h.handleCancelTakeoverSelect()
      return true
    }
    const best = [...affordable].sort(
      (a, b) => propertyEndValue(b.builtProperty) - propertyEndValue(a.builtProperty)
    )[0]
    h.handleBoardPlotSelect(best.row, best.col)
    return true
  }

  if (ui.scandalSelectActive) {
    if (valid.length === 0) {
      h.handleCancelScandalSelect()
      return true
    }
    const human = pickRichestHumanTarget(gs, cp.id)
    const prefer =
      (human && valid.find((p) => p.claimedBy === human.id)) ||
      [...valid].sort((a, b) => propertyEndValue(b.builtProperty) - propertyEndValue(a.builtProperty))[0]
    h.handleBoardPlotSelect(prefer.row, prefer.col)
    return true
  }

  if (ui.investmentSelectActive) {
    const need = ui.investmentContributionMillion ?? 4
    if (valid.length === 0 || cp.money < need) {
      // Insufficient cash / no targets — abandon select so the turn can continue.
      h.handleCancelInvestmentSelect()
      return true
    }
    const pick = pickInvestmentTarget(gs, cp.id, valid)
    if (!pick) {
      h.handleCancelInvestmentSelect()
      return true
    }
    h.handleBoardPlotSelect(pick.row, pick.col)
    return true
  }

  if (ui.removeInvestorsSelectActive) {
    const affordable = valid.filter(
      (p) => cp.money >= totalRemoveInvestorsBuyoutMillion(p.investmentStripes)
    )
    if (affordable.length === 0) {
      h.handleCancelRemoveInvestorsSelect()
      return true
    }
    // Prefer cheapest buyout so cash-strapped bots clear something.
    affordable.sort(
      (a, b) =>
        totalRemoveInvestorsBuyoutMillion(a.investmentStripes) -
        totalRemoveInvestorsBuyoutMillion(b.investmentStripes)
    )
    h.handleBoardPlotSelect(affordable[0].row, affordable[0].col)
    return true
  }

  if (ui.rezoningPhase === 'pick-property') {
    const ranked = cp.propertyCards
      .map((inst) => {
        const c = propertyCards.find((pc) => pc.id === inst.cardId) as PropertyCard | undefined
        if (!c || c.type === 'anchor') return null
        const cost = getHousingBuildCost(c, false)
        if (cp.money < cost) return null
        return { inst, cost }
      })
      .filter(Boolean) as { inst: CardInstance; cost: number }[]
    ranked.sort((a, b) => a.cost - b.cost)
    if (ranked.length === 0) {
      h.handleCancelRezoning()
      return true
    }
    h.handleRezoningPropertySelect(ranked[0].inst.instanceId)
    return true
  }

  if (ui.rezoningPhase === 'pick-housing-density') {
    // Standard density is cheaper — prefer it so cash stays sufficient.
    h.handleRezoningHousingDensity(false)
    return true
  }

  if (ui.rezoningPhase === 'pick-plot') {
    const lots = getVacantCityLotsForRezoning(gs.plots)
    if (lots.length === 0) {
      h.handleCancelRezoning()
      return true
    }
    lots.sort((a, b) => a.row - b.row || a.col.localeCompare(b.col))
    h.handleBoardPlotSelect(lots[0].row, lots[0].col)
    return true
  }

  if (ui.rezoningPhase !== 'inactive') {
    h.handleCancelRezoning()
    return true
  }

  if (ui.discardPropertySelectActive) {
    // Never cancel+replay — that loops forever and highlights the host's hand rail.
    h.handleConfirmDiscardProperty(pickAiDiscardPropertyIds(cp))
    return true
  }

  return false
}

/**
 * True when this founder owns at least one built city lot that can generate Income.
 * Online snapshots can drop `id` or stringify `claimedBy`; treat those as "no property"
 * rather than matching vacant lots (`undefined === undefined`).
 */
export function playerHasBuiltIncomeProperty(
  plots: Plot[] | undefined | null,
  playerId: number | undefined | null
): boolean {
  if (playerId == null) return false
  const id = typeof playerId === 'number' ? playerId : Number(playerId)
  if (!Number.isFinite(id)) return false
  if (!plots || plots.length === 0) return false
  return plots.some((p) => {
    if (p.type !== 'city') return false
    if (p.claimedBy == null) return false
    const owner = typeof p.claimedBy === 'number' ? p.claimedBy : Number(p.claimedBy)
    if (!Number.isFinite(owner) || owner !== id) return false
    const built = p.builtProperty
    if (typeof built !== 'string' || built.length === 0) return false
    return propertyCards.some((c) => c.id === built)
  })
}

/**
 * Primary win condition for Founderbots: maximize income / cash.
 * Play Income (with Double Income when slots allow) before builds or confrontations —
 * but never open Income with zero built properties (that only shows bank/cancel).
 */
function tryPlayIncomeFirst(gs: GameState, cp: Player, h: SimpleAiTurnHandlers): boolean {
  if (gs.incomeResolvedThisTurn === true) return false
  if (!playerHasBuiltIncomeProperty(gs.plots, cp.id)) return false
  const income = findHandAction(cp, 'income')
  if (!income) return false
  const consumed = gs.turnActionsConsumed ?? 0
  const slotsLeft = MAX_TURN_ACTIONS - consumed
  if (slotsLeft <= 0 || turnLimitReached(consumed)) return false

  h.handlePlayCards(null, [income.instanceId], [], income.options)
  return true
}

function tryPlaySafeActionsOrEnd(gs: GameState, cp: Player, h: SimpleAiTurnHandlers): void {
  const consumed = gs.turnActionsConsumed ?? 0
  const slotsLeft = MAX_TURN_ACTIONS - consumed
  if (slotsLeft <= 0 || turnLimitReached(consumed)) {
    h.handleEndTurn()
    return
  }

  if (tryPlayIncomeFirst(gs, cp, h)) return
  if (tryPlayConfrontation(gs, cp, h)) return

  const handSize = cp.actionCards?.length ?? 0
  // Soft cap is 8 at end of turn. Prefer banking low-value cards for cash over
  // Draw 2 (which forces a later discard of free money left on the table).
  const nearOrOverCap = handSize >= MAX_ACTION_HAND_SIZE - 1
  if (nearOrOverCap || cp.money < 8) {
    const toBank = pickAiActionCardsToBank(cp, 1)
    if (toBank.length > 0) {
      h.handlePlayCards(null, [], toBank, undefined)
      return
    }
  }

  // Avoid Draw 2 when the hand is already at/near the end-of-turn cap.
  const prefer = (
    nearOrOverCap
      ? (['property-taxation', 'taxation', 'crossing-the-line', 'roll-die'] as const)
      : (['property-taxation', 'taxation', 'crossing-the-line', 'draw-2-action-cards', 'roll-die'] as const)
  )
  for (const key of prefer) {
    const inst = cp.actionCards.find((a) => a.cardId === key)
    if (!inst) continue
    if ((gs.turnActionsConsumed ?? 0) + 1 > MAX_TURN_ACTIONS) continue
    h.handlePlayCards(null, [inst.instanceId], [], undefined)
    return
  }

  const wild = cp.actionCards.find((a) => isActionWildCard(a.cardId))
  if (wild && (gs.turnActionsConsumed ?? 0) + 1 <= MAX_TURN_ACTIONS) {
    const emu = nearOrOverCap ? 'crossing-the-line' : 'draw-2-action-cards'
    if (isValidActionWildEmulateId(emu)) {
      h.handlePlayCards(null, [wild.instanceId], [], { wildCardEmulateActionId: emu })
      return
    }
  }

  // Last resort: bank something rather than ending with a bloated hand and $0 from it.
  const fallbackBank = pickAiActionCardsToBank(cp, 1)
  if (fallbackBank.length > 0) {
    h.handlePlayCards(null, [], fallbackBank, undefined)
    return
  }

  h.handleEndTurn()
}

export function trySimpleAiMainPhase(
  gs: GameState,
  cp: Player,
  ui: SimpleAiTurnUi,
  h: SimpleAiTurnHandlers
): boolean {
  if (!cp.isAi) return false
  if (!gs.isSetupComplete || gs.gameEnded) return false
  if (gs.openingNarrationComplete === false) return false

  if (ui.rollDieDialogOpen || ui.incomeDialogOpen || ui.showNewCardsAnimation) {
    return false
  }
  if (gs.pendingCalamity) return false

  if (gs.pendingEndGameDeclaration && gs.pendingEndGameDeclaration.playerId === cp.id) {
    const pending = gs.pendingEndGameDeclaration
    const self = playerWealthScore(gs, cp.id)
    let rivalBest = 0
    for (const p of gs.players) {
      if (p.id === cp.id) continue
      rivalBest = Math.max(rivalBest, playerWealthScore(gs, p.id))
    }
    const leading = self >= rivalBest
    const declare = pending.lastChance ? !leading : leading
    h.handleEndGameDecision(declare)
    return true
  }

  // End-of-turn soft hand cap — resolve in one call (never cancel/reopen).
  if (ui.discardDialogOpen) {
    const n =
      ui.discardDialogNumToDiscard > 0
        ? ui.discardDialogNumToDiscard
        : Math.max(0, (cp.actionCards?.length ?? 0) - MAX_ACTION_HAND_SIZE)
    h.handleDiscardActionCards(pickAiActionCardDiscardIds(cp, n))
    return true
  }

  if (ui.undoActionDialogOpen) {
    h.handleUndoLastActionCancel()
    return true
  }

  if (ui.boardNoticeActive) {
    return false
  }

  if (ui.taxBuildPromptOpen) {
    h.dismissTaxBuildPrompt()
    return true
  }

  if (ui.discardPropertyConfirmOpen) {
    // Confirm whatever is selected (usually empty for bots) instead of cancel-looping.
    h.handleConfirmDiscardProperty()
    return true
  }

  if (ui.actionCriteriaDialogOpen) {
    // Prefer playing confrontational criteria when possible; otherwise bank for cash.
    h.handleActionCriteriaBank()
    return true
  }

  if (tryCompleteSelectMode(gs, cp, ui, h)) {
    return true
  }

  if (ui.taxBuildModePhase !== 'inactive') {
    h.dismissTaxBuildPrompt()
    return true
  }

  if (ui.placementActive && ui.placementPropertyCardId) {
    const index = buildPlotIndex(gs.plots)
    const instance = cp.propertyCards.find((c) => c.instanceId === ui.placementPropertyCardId)
    if (!instance) {
      h.cancelPlacement()
      return true
    }
    const card = propertyCards.find((c) => c.id === instance.cardId) as PropertyCard | undefined
    if (!card) {
      h.cancelPlacement()
      return true
    }
    const defaultEmulate =
      card.id === 'anchor-wild-card'
        ? (ANCHOR_WILD_CARD_EMULATE_IDS[0] as string)
        : isCivicFlexHandCard(card)
          ? (getAvailableCivicVariantIds(gs.plots, gs.crossingTheLineActive)[0] as string | undefined)
          : undefined
    const emu = ui.placementWildEmulatePropertyId ?? defaultEmulate
    const resolved = resolvePropertyPlacementTemplate(card, emu)
    if (!resolved) {
      h.cancelPlacement()
      return true
    }
    const template: PropertyCard = resolved

    let validPlots = getValidPlotsForProperty(template, gs.plots, gs.crossingTheLineActive)
    const hd = ui.placementHousingHighDensity === true && isHousingPropertyCard(card)
    validPlots = validPlots.filter((plot) => {
      const at = getPlotAt(gs.plots, plot.col, plot.row, index)
      if (!at) return false
      const fullCost = getHousingBuildCost(template, hd)
      return cp.money >= fullCost
    })

    if (validPlots.length === 0) {
      h.cancelPlacement()
      tryPlaySafeActionsOrEnd(gs, cp, h)
      return true
    }

    // Prefer lots that deepen / complete a city block the bot already owns; income-first card
    // choice still wins — this only picks where to place after a card is in placement mode.
    validPlots.sort((a, b) => {
      const scoreA = blockCompletionBiasScore(
        countPlayerBuiltInCityBlock(cp.id, gs.plots, a.row, a.col)
      )
      const scoreB = blockCompletionBiasScore(
        countPlayerBuiltInCityBlock(cp.id, gs.plots, b.row, b.col)
      )
      if (scoreA !== scoreB) return scoreB - scoreA
      if (a.row !== b.row) return a.row - b.row
      return a.col.localeCompare(b.col)
    })

    const pick = validPlots[0]
    h.handlePlotSelect(pick.row, pick.col)
    return true
  }

  const consumedNow = gs.turnActionsConsumed ?? 0
  if (turnLimitReached(consumedNow)) {
    h.handleEndTurn()
    return true
  }

  // Goal: greatest income — resolve Income before builds / confrontations when held.
  if (tryPlayIncomeFirst(gs, cp, h)) return true

  // Build the highest-income affordable property (high density when it pays more).
  if (
    gs.councilFreezeBlockBuildForPlayerId !== cp.id &&
    (gs.propertiesBuiltThisTurn ?? 0) < 1 &&
    consumedNow + 1 <= MAX_TURN_ACTIONS
  ) {
    const ranked = cp.propertyCards
      .map((inst) => {
        const c = propertyCards.find((pc) => pc.id === inst.cardId) as PropertyCard | undefined
        if (!c || c.type === 'anchor') return null
        const wildEmu =
          c.id === 'anchor-wild-card'
            ? (ANCHOR_WILD_CARD_EMULATE_IDS[0] as string)
            : isCivicFlexHandCard(c)
              ? (getAvailableCivicVariantIds(gs.plots, gs.crossingTheLineActive)[0] as string | undefined)
              : undefined
        const template = resolvePropertyPlacementTemplate(c, wildEmu)
        if (!template) return null
        const plots = getValidPlotsForProperty(template, gs.plots, gs.crossingTheLineActive)
        if (plots.length === 0) return null

        const costStd = getHousingBuildCost(template, false)
        const canStd = cp.money >= costStd
        const housing = isHousingPropertyCard(c)
        const costHd = housing ? getHousingBuildCost(c, true) : costStd
        const canHd = housing && cp.money >= costHd
        const incomeStd = getPlotPropertyIncome(
          { housingHighDensity: false } as Plot,
          c
        )
        const incomeHd = housing ? HIGH_DENSITY_HOUSING_STATS.buildIncome : incomeStd
        // Prefer high density when affordable and it raises income (or same income but we can afford it).
        const useHd = canHd && incomeHd >= incomeStd && (!canStd || incomeHd > incomeStd || costHd <= costStd)
        if (!canStd && !canHd) return null
        const highDensity = useHd
        const cost = highDensity ? costHd : costStd
        const income = highDensity ? incomeHd : incomeStd
        const endValue = highDensity
          ? HIGH_DENSITY_HOUSING_STATS.endGameValue
          : c.endGameValue
        const blockScore = plots.reduce((best, p) => {
          const s = blockCompletionBiasScore(
            countPlayerBuiltInCityBlock(cp.id, gs.plots, p.row, p.col)
          )
          return s > best ? s : best
        }, 0)
        return {
          inst,
          cost,
          income,
          blockScore,
          endValue,
          nplots: plots.length,
          wildEmu,
          highDensity,
        }
      })
      .filter(Boolean) as {
      inst: CardInstance
      cost: number
      income: number
      blockScore: number
      endValue: number
      nplots: number
      wildEmu?: string
      highDensity: boolean
    }[]

    // Highest income first, then city-block completion bias, then end value / cost / lot count.
    ranked.sort(
      (a, b) =>
        b.income - a.income ||
        b.blockScore - a.blockScore ||
        b.endValue - a.endValue ||
        a.cost - b.cost ||
        b.nplots - a.nplots
    )

    if (ranked.length > 0) {
      const { inst, wildEmu, highDensity } = ranked[0]
      h.handlePlayCards(inst.instanceId, [], [], {
        skipTaxBuildPrompt: true,
        useTaxBuild: false,
        housingHighDensity: highDensity,
        wildCardEmulatePropertyId: wildEmu,
      })
      return true
    }
  }

  // Confrontations after income + building — still useful for table control.
  if (tryPlayConfrontation(gs, cp, h)) return true

  tryPlaySafeActionsOrEnd(gs, cp, h)
  return true
}
