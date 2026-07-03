import type { GameState } from '@/lib/types'
import { propertyCards } from '@/lib/cardData'
import type { PropertyCard } from '@/lib/cardTypes'
import { isCivicFlexHandCard } from '@/lib/civicFlexProperty'
import { resolvePropertyPlacementTemplate } from '@/lib/placementTemplate'
import { getValidPlotsForProperty } from '@/lib/placementRules'
import { getHousingBuildCost, isHousingPropertyCard } from '@/lib/housingEconomics'
import { getBuildCelebrationMessage } from '@/lib/buildCelebrationMessages'
import { MAX_TURN_ACTIONS, replenishCurrentPlayerActionHand, turnLimitReached } from '@/lib/turnActions'
import type { ApplyGameActionResult, GameEvent } from '@/lib/onlineGameActions'
import { buildEndGameTriggerPatch } from '@/lib/gameEngine/statePatches'

export type BuildAtParams = {
  row: number
  col: string
  propertyInstanceId: string
  housingHighDensity?: boolean
  taxBuildActionInstanceId?: string
  wildCardEmulatePropertyId?: string
}

export function applyBuildAt(state: GameState, params: BuildAtParams): ApplyGameActionResult {
  const currentPlayer = state.players[state.currentPlayerIndex]
  if (!currentPlayer) return { ok: false, error: 'No active player.', code: 'no_player' }

  if (state.councilFreezeBlockBuildForPlayerId === currentPlayer.id) {
    return { ok: false, error: 'City Council Freeze blocks building this turn.', code: 'council_freeze' }
  }

  const instance = currentPlayer.propertyCards.find((c) => c.instanceId === params.propertyInstanceId)
  if (!instance) return { ok: false, error: 'Property card not in hand.', code: 'missing_card' }

  const card = propertyCards.find((c) => c.id === instance.cardId) as PropertyCard | undefined
  if (!card) return { ok: false, error: 'Unknown property.', code: 'unknown_card' }

  const plotIndex = state.plots.findIndex((p) => p.row === params.row && p.col === params.col)
  if (plotIndex === -1) return { ok: false, error: 'Invalid plot.', code: 'invalid_plot' }

  const plot = state.plots[plotIndex]
  const wildEmulate = params.wildCardEmulatePropertyId
  const isWildBuild = card.id === 'anchor-wild-card' && !!wildEmulate
  const isCivicFlexBuild = isCivicFlexHandCard(card) && !!wildEmulate
  const placementTemplate = resolvePropertyPlacementTemplate(card, wildEmulate) ?? card

  if (isWildBuild && (!wildEmulate || placementTemplate.id !== wildEmulate)) {
    return { ok: false, error: 'Invalid Anchor Wild Card target.', code: 'wild_invalid' }
  }
  if (isCivicFlexBuild && (!wildEmulate || placementTemplate.id !== wildEmulate)) {
    return { ok: false, error: 'Invalid Civic property choice.', code: 'civic_invalid' }
  }
  const validPlots = getValidPlotsForProperty(placementTemplate, state.plots, state.crossingTheLineActive)
  if (!validPlots.some((p) => p.row === params.row && p.col === params.col)) {
    return { ok: false, error: 'Cannot build here.', code: 'invalid_placement' }
  }

  if (state.propertiesBuiltThisTurn >= 1) {
    return { ok: false, error: 'Already built this turn.', code: 'build_limit' }
  }

  if (turnLimitReached(state.turnActionsConsumed)) {
    return { ok: false, error: `All ${MAX_TURN_ACTIONS} actions used.`, code: 'turn_limit' }
  }

  const highDensityPlacement = params.housingHighDensity === true && isHousingPropertyCard(card)
  const ANCHOR_WILD_BUILD_COST_M = 6
  const fullBuildCost = isWildBuild
    ? ANCHOR_WILD_BUILD_COST_M
    : getHousingBuildCost(card, highDensityPlacement)

  const taxBuildActionInstanceId = params.taxBuildActionInstanceId
  const taxBuildCardInstance = taxBuildActionInstanceId
    ? currentPlayer.actionCards.find((c) => c.instanceId === taxBuildActionInstanceId)
    : undefined
  const usingTaxBuild =
    taxBuildActionInstanceId != null && taxBuildCardInstance?.cardId === 'build-with-tax-dollars'
  const buildCost = usingTaxBuild ? Math.ceil(fullBuildCost / 2) : fullBuildCost

  if (currentPlayer.money < buildCost) {
    return { ok: false, error: `Need $${buildCost}M.`, code: 'insufficient_funds' }
  }

  const newPlots = [...state.plots]
  newPlots[plotIndex] = {
    ...plot,
    builtProperty: placementTemplate.id,
    claimedBy: currentPlayer.id,
    housingHighDensity: highDensityPlacement ? true : undefined,
  }

  const updatedMoney = currentPlayer.money - buildCost
  const updatedPropertyCards = currentPlayer.propertyCards.filter((c) => c.instanceId !== instance.instanceId)
  const updatedPropertyDiscard = [...state.propertyDiscard, instance]
  const updatedActionCards = usingTaxBuild
    ? currentPlayer.actionCards.filter((c) => c.instanceId !== taxBuildActionInstanceId)
    : currentPlayer.actionCards
  const updatedActionDiscard =
    usingTaxBuild && taxBuildCardInstance
      ? [...state.actionDiscard, taxBuildCardInstance]
      : state.actionDiscard

  const updatedPlayers = state.players.map((p, idx) =>
    idx === state.currentPlayerIndex
      ? { ...p, money: updatedMoney, propertyCards: updatedPropertyCards, actionCards: updatedActionCards }
      : p
  )

  const newPropertiesBuiltThisTurn = state.propertiesBuiltThisTurn + 1
  const newActionsPlayedThisTurn = state.actionsPlayedThisTurn + (usingTaxBuild ? 1 : 0)
  const newTurnActionsConsumed = (state.turnActionsConsumed ?? 0) + 1 + (usingTaxBuild ? 1 : 0)

  const newState: GameState = {
    ...state,
    players: updatedPlayers,
    plots: newPlots,
    actionDiscard: updatedActionDiscard,
    propertyDiscard: updatedPropertyDiscard,
    propertiesBuiltThisTurn: newPropertiesBuiltThisTurn,
    actionsPlayedThisTurn: newActionsPlayedThisTurn,
    turnActionsConsumed: newTurnActionsConsumed,
    playedPropertyCardThisTurn: instance.instanceId,
    lastBuiltProperty: {
      row: params.row,
      col: params.col,
      propertyId: placementTemplate.id,
      buildCost,
      undoTitle: isWildBuild
        ? `Anchor Wild Card (${placementTemplate.name})`
        : isCivicFlexBuild
          ? `Civic (${placementTemplate.name})`
          : undefined,
    },
  }

  const triggerPatch = buildEndGameTriggerPatch(state, newPlots, { row: params.row, col: params.col })
  let merged: GameState = { ...newState, ...triggerPatch }

  const events: GameEvent[] = []
  const celebration = getBuildCelebrationMessage(placementTemplate, {
    housingHighDensity: highDensityPlacement,
  })
  const title =
    placementTemplate.type === 'anchor'
      ? `⚓ ${placementTemplate.name} anchored!`
      : celebration ?? `Built ${placementTemplate.name}!`
  events.push({
    type: 'build_celebration',
    title,
    detail: `${params.col}${params.row} · $${buildCost}M`,
  })
  if (usingTaxBuild) {
    events.push({
      type: 'toast',
      level: 'success',
      message: `Built with Tax Dollars at 50% cost ($${fullBuildCost}M → $${buildCost}M).`,
    })
  }
  if (triggerPatch.endGameTriggered) {
    const triggererName =
      state.players.find((p) => p.id === triggerPatch.endGameTriggerPlayerId)?.name ?? 'A founder'
    events.push({
      type: 'toast',
      level: 'success',
      message: `${triggererName} reached nine sequential built properties — Final Round!`,
    })
  }

  const { state: replenished } = replenishCurrentPlayerActionHand(merged, state.currentPlayerIndex)
  merged = replenished

  return { ok: true, state: merged, events }
}
