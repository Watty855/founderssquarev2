import type { CardInstance, PropertyCard } from '@/lib/cardTypes'
import type { Player, GameState } from '@/lib/types'
import { propertyCards, actionCards, ANCHOR_WILD_CARD_EMULATE_IDS, CIVIC_VARIANT_PROPERTY_IDS } from '@/lib/cardData'
import { isCivicFlexHandCard } from '@/lib/civicFlexProperty'
import { resolvePropertyPlacementTemplate } from '@/lib/placementTemplate'
import { getValidPlotsForProperty } from '@/lib/placementRules'
import { getHousingBuildCost, isHousingPropertyCard } from '@/lib/housingEconomics'
import { turnLimitReached, MAX_TURN_ACTIONS } from '@/lib/turnActions'

/** Matches PlayerHand → GameApp.handlePlayCards options subset. */
export type AiPlayOptions = {
  skipTaxBuildPrompt?: boolean
  useTaxBuild?: boolean
  housingHighDensity?: boolean
  wildCardEmulatePropertyId?: string
  taxBuildActionInstanceId?: string
}

export interface SimpleAiTurnHandlers {
  handleEndTurn: () => void
  handleUndoBuildCancel: () => void
  handleActionCriteriaBank: () => void
  handleCancelTakeoverSelect: () => void
  handleCancelScandalSelect: () => void
  handleCancelRezoning: () => void
  handleCancelInvestmentSelect: () => void
  handleCancelRemoveInvestorsSelect: () => void
  handleCancelDiscardPropertySelect: () => void
  /** Close Tax Dollars prompt panel (reject half-cost shortcut). */
  dismissTaxBuildPrompt: () => void
  cancelPlacement: () => void
  handlePlayCards: (
    propertyInstanceId: string | null,
    actionInstanceIds: string[],
    convertToCashInstanceIds: string[],
    options?: AiPlayOptions
  ) => void
  handlePlotSelect: (row: number, col: string) => void
}

export interface SimpleAiTurnUi {
  undoBuildDialogOpen: boolean
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
}

const UNSUPPORTED_ACTION_IDS = new Set([
  'hostile-takeover',
  'scandal',
  'rezoning',
  'investment',
  'double-investment',
  'remove-investors',
  'discard-property-cards',
  'city-council-freeze',
  'police-raid',
  'build-with-tax-dollars',
])

function tryPlaySafeActionsOrEnd(gs: GameState, cp: Player, h: SimpleAiTurnHandlers): void {
  const consumed = gs.turnActionsConsumed ?? 0
  const slotsLeft = MAX_TURN_ACTIONS - consumed
  if (slotsLeft <= 0 || turnLimitReached(consumed)) {
    h.handleEndTurn()
    return
  }

  const prioritized: CardInstance[] = []
  const prefer = ['draw-2-action-cards', 'taxation', 'crossing-the-line', 'roll-die', 'income'] as const
  for (const key of prefer) {
    const inst = cp.actionCards.find((a) => a.cardId === key)
    if (!inst) continue
    if (key === 'income' && gs.incomeResolvedThisTurn === true) continue
    prioritized.push(inst)
  }

  for (const inst of prioritized) {
    const def = actionCards.find((a) => a.id === inst.cardId)
    if (!def || UNSUPPORTED_ACTION_IDS.has(def.id)) continue

    let stepCost = 1
    if (def.id === 'crossing-the-line') stepCost = 1
    if ((gs.turnActionsConsumed ?? 0) + stepCost > MAX_TURN_ACTIONS) continue

    h.handlePlayCards(null, [inst.instanceId], [], undefined)
    return
  }

  for (const inst of cp.actionCards) {
    const def = actionCards.find((a) => a.id === inst.cardId)
    if (!def || UNSUPPORTED_ACTION_IDS.has(def.id)) continue
    if (prioritized.some((p) => p.instanceId === inst.instanceId)) continue
    if (def.id !== 'income') continue

    if ((gs.turnActionsConsumed ?? 0) + 1 > MAX_TURN_ACTIONS) break
    if (gs.incomeResolvedThisTurn === true) break

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

  if (ui.undoBuildDialogOpen) {
    h.handleUndoBuildCancel()
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
    h.handleCancelDiscardPropertySelect()
    return true
  }

  if (ui.actionCriteriaDialogOpen) {
    h.handleActionCriteriaBank()
    return true
  }

  if (ui.takeoverSelectActive) {
    h.handleCancelTakeoverSelect()
    return true
  }
  if (ui.scandalSelectActive) {
    h.handleCancelScandalSelect()
    return true
  }
  if (ui.rezoningPhase !== 'inactive') {
    h.handleCancelRezoning()
    return true
  }
  if (ui.investmentSelectActive) {
    h.handleCancelInvestmentSelect()
    return true
  }
  if (ui.removeInvestorsSelectActive) {
    h.handleCancelRemoveInvestorsSelect()
    return true
  }
  if (ui.discardPropertySelectActive) {
    h.handleCancelDiscardPropertySelect()
    return true
  }
  if (ui.taxBuildModePhase !== 'inactive') {
    h.dismissTaxBuildPrompt()
    return true
  }

  if (ui.placementActive && ui.placementPropertyCardId) {
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
          ? (CIVIC_VARIANT_PROPERTY_IDS[0] as string)
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
      const plotIndex = gs.plots.findIndex((pp) => pp.row === plot.row && pp.col === plot.col)
      if (plotIndex === -1) return false
      const fullCost = card.id === 'anchor-wild-card' ? 6 : getHousingBuildCost(card, hd)
      return cp.money >= fullCost
    })

    if (validPlots.length === 0) {
      h.cancelPlacement()
      tryPlaySafeActionsOrEnd(gs, cp, h)
      return true
    }

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

  if (
    gs.councilFreezeBlockBuildForPlayerId === cp.id ||
    gs.incomeResolvedThisTurn === true ||
    (gs.propertiesBuiltThisTurn ?? 0) >= 1
  ) {
    tryPlaySafeActionsOrEnd(gs, cp, h)
    return true
  }

  const ranked = cp.propertyCards
    .map((inst) => {
      const c = propertyCards.find((pc) => pc.id === inst.cardId) as PropertyCard | undefined
      if (!c || c.type === 'anchor') return null
      const wildEmu =
        c.id === 'anchor-wild-card'
          ? (ANCHOR_WILD_CARD_EMULATE_IDS[0] as string)
          : isCivicFlexHandCard(c)
            ? (CIVIC_VARIANT_PROPERTY_IDS[0] as string)
            : undefined
      const template = resolvePropertyPlacementTemplate(c, wildEmu)
      if (!template) return null
      const plots = getValidPlotsForProperty(template, gs.plots, gs.crossingTheLineActive)
      const cheapest = c.id === 'anchor-wild-card' ? 6 : getHousingBuildCost(c, false)
      const canAfford = cp.money >= cheapest && plots.length > 0
      return canAfford ? { inst, cheapest, nplots: plots.length } : null
    })
    .filter(Boolean) as { inst: CardInstance; cheapest: number; nplots: number }[]

  ranked.sort((a, b) => a.cheapest - b.cheapest || b.nplots - a.nplots)

  if (
    ranked.length > 0 &&
    (gs.turnActionsConsumed ?? 0) + 1 <= MAX_TURN_ACTIONS &&
    (gs.propertiesBuiltThisTurn ?? 0) < 1 &&
    gs.councilFreezeBlockBuildForPlayerId !== cp.id
  ) {
    const { inst } = ranked[0]
    const pc = propertyCards.find((x) => x.id === inst.cardId) as PropertyCard
    const wildEmu =
      pc?.id === 'anchor-wild-card'
        ? (ANCHOR_WILD_CARD_EMULATE_IDS[0] as string)
        : pc && isCivicFlexHandCard(pc)
          ? (CIVIC_VARIANT_PROPERTY_IDS[0] as string)
          : undefined
    h.handlePlayCards(inst.instanceId, [], [], {
      skipTaxBuildPrompt: true,
      useTaxBuild: false,
      housingHighDensity: false,
      wildCardEmulatePropertyId: wildEmu,
    })
    return true
  }

  tryPlaySafeActionsOrEnd(gs, cp, h)
  return true
}
