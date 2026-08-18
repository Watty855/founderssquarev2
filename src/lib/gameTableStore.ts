'use client'

import type { GameState } from '@/lib/types'
import { createInitialBoard } from '@/lib/boardData'
import { createSelectorStore } from '@/lib/selectorStore'

export const initialGameTableState: GameState = {
  players: [],
  plots: createInitialBoard(),
  currentPlayerIndex: 0,
  isSetupComplete: false,
  actionDeck: [],
  propertyDeck: [],
  actionDiscard: [],
  propertyDiscard: [],
  propertiesBuiltThisTurn: 0,
  actionsPlayedThisTurn: 0,
  turnActionsConsumed: 0,
  incomeResolvedThisTurn: false,
  crossingTheLineActive: false,
  councilFreezeBlockBuildForPlayerId: undefined,
  pendingIncomeTaxPlayerIds: [],
  openingNarrationComplete: false,
  playRoundNumber: 1,
}

const table = createSelectorStore<GameState>(initialGameTableState)

export const getGameTableSnapshot = table.getSnapshot
export const subscribeGameTable = table.subscribe
export const useGameTableStore = table.useStore

export function publishGameState(next: GameState) {
  table.setState(next)
}

export function resetGameTableStore() {
  table.setState(initialGameTableState)
}
