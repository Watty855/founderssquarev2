import { describe, expect, it, vi } from 'vitest'
import type { GameState, Player, Plot } from '@/lib/types'
import { createInitialBoard } from '@/lib/boardData'
import { updatePlotAt } from '@/lib/boardIndex'
import {
  playerHasBuiltIncomeProperty,
  trySimpleAiMainPhase,
  type SimpleAiTurnHandlers,
  type SimpleAiTurnUi,
} from '@/lib/bot/simpleAiTurn'

function mkBot(over: Partial<Player> = {}): Player {
  return {
    id: 1,
    name: 'Founderbot 1',
    color: '#0f0',
    money: 20,
    isAi: true,
    actionCards: [{ instanceId: 'inc-1', cardId: 'income', cardNumber: 1 }],
    propertyCards: [],
    ...over,
  }
}

function mkHuman(): Player {
  return {
    id: 0,
    name: 'Host',
    color: '#00f',
    money: 20,
    isAi: false,
    actionCards: [],
    propertyCards: [],
  }
}

function idleUi(over: Partial<SimpleAiTurnUi> = {}): SimpleAiTurnUi {
  return {
    undoActionDialogOpen: false,
    boardNoticeActive: false,
    showNewCardsAnimation: false,
    taxBuildPromptOpen: false,
    discardPropertyConfirmOpen: false,
    discardDialogOpen: false,
    discardDialogNumToDiscard: 0,
    rollDieDialogOpen: false,
    incomeDialogOpen: false,
    takeoverSelectActive: false,
    scandalSelectActive: false,
    rezoningPhase: 'inactive',
    investmentSelectActive: false,
    removeInvestorsSelectActive: false,
    discardPropertySelectActive: false,
    taxBuildModePhase: 'inactive',
    placementActive: false,
    placementPropertyCardId: null,
    actionCriteriaDialogOpen: false,
    ...over,
  }
}

function stubHandlers(): SimpleAiTurnHandlers & { playCalls: unknown[][] } {
  const playCalls: unknown[][] = []
  return {
    playCalls,
    handleEndTurn: vi.fn(),
    handleUndoLastActionCancel: vi.fn(),
    handleActionCriteriaBank: vi.fn(),
    handleCancelTakeoverSelect: vi.fn(),
    handleCancelScandalSelect: vi.fn(),
    handleCancelRezoning: vi.fn(),
    handleCancelInvestmentSelect: vi.fn(),
    handleCancelRemoveInvestorsSelect: vi.fn(),
    handleCancelDiscardPropertySelect: vi.fn(),
    handleConfirmDiscardProperty: vi.fn(),
    handleDiscardActionCards: vi.fn(),
    dismissTaxBuildPrompt: vi.fn(),
    cancelPlacement: vi.fn(),
    handlePlayCards: (...args: unknown[]) => {
      playCalls.push(args)
    },
    handlePlotSelect: vi.fn(),
    handleBoardPlotSelect: vi.fn(),
    handleRezoningPropertySelect: vi.fn(),
    handleRezoningHousingDensity: vi.fn(),
  }
}

function baseState(bot: Player, plots: Plot[]): GameState {
  return {
    players: [mkHuman(), bot],
    plots,
    currentPlayerIndex: 1,
    isSetupComplete: true,
    actionDeck: [],
    propertyDeck: [],
    actionDiscard: [],
    propertyDiscard: [],
    propertiesBuiltThisTurn: 0,
    actionsPlayedThisTurn: 0,
    turnActionsConsumed: 0,
    crossingTheLineActive: false,
    openingNarrationComplete: true,
  }
}

describe('playerHasBuiltIncomeProperty', () => {
  it('is false on an empty board', () => {
    expect(playerHasBuiltIncomeProperty(createInitialBoard(), 1)).toBe(false)
  })

  it('does not treat undefined player id as matching vacant lots', () => {
    const plots = createInitialBoard()
    expect(playerHasBuiltIncomeProperty(plots, undefined)).toBe(false)
    expect(playerHasBuiltIncomeProperty(plots, null)).toBe(false)
  })

  it('does not match claimedBy 0 when checking player 0 unless a city lot is actually built', () => {
    expect(playerHasBuiltIncomeProperty(createInitialBoard(), 0)).toBe(false)
  })

  it('is true for a city lot claimed and built by that founder', () => {
    const plots = updatePlotAt(createInitialBoard(), 'B', 2, (p) => ({
      ...p,
      type: 'city',
      claimedBy: 1,
      builtProperty: 'church',
    }))
    expect(playerHasBuiltIncomeProperty(plots, 1)).toBe(true)
    expect(playerHasBuiltIncomeProperty(plots, 0)).toBe(false)
  })

  it('accepts numeric-string claimedBy from JSON snapshots', () => {
    const plots = updatePlotAt(createInitialBoard(), 'B', 2, (p) => ({
      ...p,
      type: 'city',
      claimedBy: '1' as unknown as number,
      builtProperty: 'church',
    }))
    expect(playerHasBuiltIncomeProperty(plots, 1)).toBe(true)
  })

  it('ignores board building names that are not a property card id', () => {
    const plots = updatePlotAt(createInitialBoard(), 'B', 2, (p) => ({
      ...p,
      type: 'city',
      claimedBy: 1,
      builtProperty: 'Street',
    }))
    expect(playerHasBuiltIncomeProperty(plots, 1)).toBe(false)
  })
})

describe('Founderbot Income skip', () => {
  it('does not play Income when the bot owns no built lots', () => {
    const bot = mkBot()
    const gs = baseState(bot, createInitialBoard())
    const h = stubHandlers()
    trySimpleAiMainPhase(gs, bot, idleUi(), h)
    const incomePlays = h.playCalls.filter((args) => {
      const actionIds = args[1] as string[] | undefined
      return Array.isArray(actionIds) && actionIds.includes('inc-1')
    })
    expect(incomePlays).toEqual([])
  })

  it('plays Income first once the bot owns a built lot', () => {
    const bot = mkBot()
    const plots = updatePlotAt(createInitialBoard(), 'B', 2, (p) => ({
      ...p,
      type: 'city',
      claimedBy: 1,
      builtProperty: 'church',
    }))
    const gs = baseState(bot, plots)
    const h = stubHandlers()
    trySimpleAiMainPhase(gs, bot, idleUi(), h)
    expect(h.playCalls[0]?.[1]).toEqual(['inc-1'])
  })
})
