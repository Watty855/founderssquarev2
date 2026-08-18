'use client'

import type { GameState, Plot } from '@/lib/types'
import type { PropertyCard } from '@/lib/cardTypes'
import { propertyCards } from '@/lib/cardData'
import { getVacantCityLotsForRezoning, getValidPlotsForProperty } from '@/lib/placementRules'
import { needsEmulateChoiceBeforePlacement, resolvePropertyPlacementTemplate } from '@/lib/placementTemplate'
import {
  EMPTY_PLOTS,
  type PlayUiState,
} from '@/lib/playUiStore'

export type BoardPlacementMode = {
  active: boolean
  propertyCardId: string | null
  validPlots: Plot[]
  interaction: 'build' | 'investment' | 'remove-investors' | 'hostile-takeover' | 'rezoning' | 'scandal'
}

const INACTIVE: BoardPlacementMode = {
  active: false,
  propertyCardId: null,
  validPlots: EMPTY_PLOTS,
  interaction: 'build',
}

export function selectBoardPlacement(gs: GameState, ui: PlayUiState): BoardPlacementMode {
  if (ui.rezoningMode.phase === 'pick-plot') {
    return {
      active: true,
      propertyCardId: null,
      validPlots: getVacantCityLotsForRezoning(gs.plots),
      interaction: 'rezoning',
    }
  }
  if (ui.scandalSelectMode.active) {
    return {
      active: true,
      propertyCardId: null,
      validPlots: ui.scandalSelectMode.validPlots,
      interaction: 'scandal',
    }
  }
  if (ui.takeoverSelectMode.active) {
    return {
      active: true,
      propertyCardId: null,
      validPlots: ui.takeoverSelectMode.validPlots,
      interaction: 'hostile-takeover',
    }
  }
  if (ui.removeInvestorsSelectMode.active) {
    return {
      active: true,
      propertyCardId: null,
      validPlots: ui.removeInvestorsSelectMode.validPlots,
      interaction: 'remove-investors',
    }
  }
  if (ui.investmentSelectMode.active) {
    return {
      active: true,
      propertyCardId: null,
      validPlots: ui.investmentSelectMode.validPlots,
      interaction: 'investment',
    }
  }
  if (ui.placementMode.active && ui.placementMode.propertyCardId) {
    const currentPlayer = gs.players[gs.currentPlayerIndex]
    const instance = currentPlayer?.propertyCards.find(
      (c) => c.instanceId === ui.placementMode.propertyCardId
    )
    if (!instance) {
      return {
        active: true,
        propertyCardId: ui.placementMode.propertyCardId,
        validPlots: EMPTY_PLOTS,
        interaction: 'build',
      }
    }
    const card = propertyCards.find((c) => c.id === instance.cardId) as PropertyCard | undefined
    if (!card) {
      return {
        active: true,
        propertyCardId: ui.placementMode.propertyCardId,
        validPlots: EMPTY_PLOTS,
        interaction: 'build',
      }
    }
    const emulateId = ui.placementMode.wildCardEmulatePropertyId
    const template = resolvePropertyPlacementTemplate(card, emulateId) ?? card
    if (needsEmulateChoiceBeforePlacement(card) && !emulateId) {
      return {
        active: true,
        propertyCardId: ui.placementMode.propertyCardId,
        validPlots: EMPTY_PLOTS,
        interaction: 'build',
      }
    }
    return {
      active: true,
      propertyCardId: ui.placementMode.propertyCardId,
      validPlots: getValidPlotsForProperty(template, gs.plots, gs.crossingTheLineActive),
      interaction: 'build',
    }
  }
  if (ui.placementMode.active) {
    return {
      active: true,
      propertyCardId: ui.placementMode.propertyCardId,
      validPlots: EMPTY_PLOTS,
      interaction: 'build',
    }
  }
  return INACTIVE
}
