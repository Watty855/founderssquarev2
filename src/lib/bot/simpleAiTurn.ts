import type { CardInstance, PropertyCard } from '@/lib/cardTypes'
import type { Player, GameState, Plot } from '@/lib/types'
import { propertyCards, ANCHOR_WILD_CARD_EMULATE_IDS } from '@/lib/cardData'
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
import { turnLimitReached, MAX_TURN_ACTIONS, canAttemptRezoning } from '@/lib/turnActions'
import { getInvestablePlots, getTakeoverTargetPlots } from '@/lib/investmentTargets'
import {
  getPlotsEligibleForScandal,
  checkForNineSequentialProperties,
  totalRemoveInvestorsBuyoutMillion,
} from '@/lib/utils'
import { buildPlotIndex, getPlotAt } from '@/lib/boardIndex'

/** Matches PlayerHand → GameApp.handlePlayCards options subset. */
export type AiPlayOptions = {
  skipTaxBuildPrompt?: boolean
  useTaxBuild?: boolean
  housingHighDensity?: boolean
  wildCardEmulatePropertyId?: string
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
}

export interface SimpleAiTurnUi {
  undoActionDialogOpen: boolean
  boardNoticeActive: boolean
  showNewCardsAnimation: boolean
  taxBuildPromptOpen: boolean
  discardPropertyConfirmOpen: boolean
  discardDialogOpen: boolean
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
  // Rough pressure: owned count toward 9, plus a boost if they already qualify.
  if (checkForNineSequentialProperties(plots)?.triggeredByPlayerId === playerId) return 100
  return owned
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

  const has = (id: string) => cp.actionCards.find((a) => a.cardId === id)

  // City Council Freeze — freeze whoever is closest to ending the game (must pass a target).
  const freeze = has('city-council-freeze')
  if (freeze && slotsLeft >= 1) {
    const rivals = gs.players.filter((p) => p.id !== cp.id)
    const threat = [...rivals].sort(
      (a, b) => endGameProximityScore(gs.plots, b.id) - endGameProximityScore(gs.plots, a.id)
    )[0]
    if (threat && endGameProximityScore(gs.plots, threat.id) >= 5) {
      h.handlePlayCards(null, [freeze.instanceId], [], {
        councilFreezeTargetId: threat.id,
      })
      return true
    }
  }

  // Hostile Takeover — only when at least one adjacent target is affordable.
  const takeover = has('hostile-takeover')
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
      h.handlePlayCards(null, [takeover.instanceId], [], undefined)
      return true
    }
  }

  // Scandal — hit the strongest active opponent anchor.
  const scandal = has('scandal')
  if (scandal && slotsLeft >= 1) {
    const eligible = getPlotsEligibleForScandal(gs.plots).filter((p) => p.claimedBy !== cp.id)
    if (eligible.length > 0) {
      const human = pickRichestHumanTarget(gs, cp.id)
      const preferHuman = human
        ? eligible.filter((p) => p.claimedBy === human.id)
        : []
      if (preferHuman.length > 0 || eligible.length > 0) {
        h.handlePlayCards(null, [scandal.instanceId], [], undefined)
        return true
      }
    }
  }

  // Police Raid — if any rival owns active Mafia.
  const raid = has('police-raid-on-mafia')
  if (raid && slotsLeft >= 1) {
    const rivalMafia = gs.plots.some(
      (p) =>
        p.builtProperty === 'mafia' &&
        p.claimedBy != null &&
        p.claimedBy !== cp.id &&
        p.anchorInfluenceSuppressed !== true
    )
    if (rivalMafia) {
      h.handlePlayCards(null, [raid.instanceId], [], undefined)
      return true
    }
  }

  // Rezoning — when we can afford success (2 slots) and have a vacant lot + template.
  const rezoning = has('rezoning')
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
        h.handlePlayCards(null, [rezoning.instanceId], [], undefined)
        return true
      }
    }
  }

  // Investment / Double Investment — only when we can afford the contribution and have targets.
  const doubleInvest = has('double-investment')
  const singleInvest = has('investment')
  const invest = doubleInvest && cp.money >= 8 ? doubleInvest : singleInvest && cp.money >= 4 ? singleInvest : null
  if (invest && slotsLeft >= 1) {
    const need = invest.cardId === 'double-investment' ? 8 : 4
    const targets = getInvestablePlots(gs.plots, cp.id)
    if (targets.length > 0 && cp.money >= need && pickInvestmentTarget(gs, cp.id, targets)) {
      h.handlePlayCards(null, [invest.instanceId], [], undefined)
      return true
    }
  }

  // Remove Investors — only when at least one own lot's buyouts are affordable.
  const removeInv = has('remove-investors')
  if (removeInv && slotsLeft >= 1) {
    const invested = gs.plots.filter(
      (p) => p.claimedBy === cp.id && (p.investmentStripes?.length ?? 0) > 0
    )
    const affordable = invested.filter(
      (p) => cp.money >= totalRemoveInvestorsBuyoutMillion(p.investmentStripes)
    )
    if (affordable.length > 0) {
      h.handlePlayCards(null, [removeInv.instanceId], [], undefined)
      return true
    }
  }

  // Discard Property Cards — trim junk when hand is bloated.
  const discardProp = has('discard-property-cards')
  if (discardProp && slotsLeft >= 1 && cp.propertyCards.length >= 5) {
    h.handlePlayCards(null, [discardProp.instanceId], [], undefined)
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
 * Primary win condition for Founderbots: maximize income / cash.
 * Play Income (with Double Income when slots allow) before builds or confrontations.
 */
function tryPlayIncomeFirst(gs: GameState, cp: Player, h: SimpleAiTurnHandlers): boolean {
  if (gs.incomeResolvedThisTurn === true) return false
  const income = cp.actionCards.find((a) => a.cardId === 'income')
  if (!income) return false
  const consumed = gs.turnActionsConsumed ?? 0
  const slotsLeft = MAX_TURN_ACTIONS - consumed
  if (slotsLeft <= 0 || turnLimitReached(consumed)) return false

  const doubleInc = cp.actionCards.find((a) => a.cardId === 'double-income')
  const playDouble = doubleInc != null && consumed + 2 <= MAX_TURN_ACTIONS
  const actions = playDouble
    ? [income.instanceId, doubleInc.instanceId]
    : [income.instanceId]
  h.handlePlayCards(null, actions, [], undefined)
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

  // Income already attempted above; remaining safe actions grow the hand / economy.
  const prefer = ['draw-2-action-cards', 'taxation', 'crossing-the-line', 'roll-die'] as const
  for (const key of prefer) {
    const inst = cp.actionCards.find((a) => a.cardId === key)
    if (!inst) continue
    if ((gs.turnActionsConsumed ?? 0) + 1 > MAX_TURN_ACTIONS) continue
    h.handlePlayCards(null, [inst.instanceId], [], undefined)
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

  if (
    ui.discardDialogOpen ||
    ui.rollDieDialogOpen ||
    ui.incomeDialogOpen ||
    ui.showNewCardsAnimation
  ) {
    return false
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
      const fullCost = card.id === 'anchor-wild-card' ? 6 : getHousingBuildCost(card, hd)
      return cp.money >= fullCost
    })

    if (validPlots.length === 0) {
      h.cancelPlacement()
      tryPlaySafeActionsOrEnd(gs, cp, h)
      return true
    }

    // Cheapest-affordable into the first legal cell (stable row/col order).
    validPlots.sort((a, b) => {
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

        const costStd = c.id === 'anchor-wild-card' ? 6 : getHousingBuildCost(c, false)
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
        return {
          inst,
          cost,
          income,
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
      endValue: number
      nplots: number
      wildEmu?: string
      highDensity: boolean
    }[]

    // Highest income first, then end-game value, then cheaper cost, then more legal lots.
    ranked.sort(
      (a, b) =>
        b.income - a.income || b.endValue - a.endValue || a.cost - b.cost || b.nplots - a.nplots
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
