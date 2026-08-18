'use client'

import type { PlayCardsOptions } from '@/components/game/PlayerHand'
import { getGameHandlers } from '@/lib/gameHandlerBag'
import { propertyCards, actionCards } from '@/lib/cardData'
import type { PropertyCard, CardInstance } from '@/lib/cardTypes'
import { applyBuildAt } from '@/lib/gameEngine/applyBuildAt'
import { applyEndTurn } from '@/lib/gameEngine/applyEndTurn'
import { applyBankActionCards } from '@/lib/gameEngine/applyBankAction'
import { applyIncomeComplete } from '@/lib/gameEngine/applyIncomeComplete'
import { vacateOverthrownAnchorPlot } from '@/lib/gameEngine/applyRebuttalResolution'
import { attachUndoSnapshotIfTurnAction, restoreUndoSnapshot } from '@/lib/undoLastAction'
import {
  beginCalamity,
  calamityAllowedThisRound,
  calamityLossMillion,
  calamityPercentForFace,
  applyCalamityRoll,
  findCalamityVariant,
  pickCalamityVariant,
  resolveCalamityDraw,
  dealActionHandSkippingCalamity,
  ingestActionDraw,
} from '@/lib/calamity'
import { createActionDeck, createPropertyDeck, drawCards, drawFromDeckWithDiscardReshuffle, shuffleDeck } from '@/lib/deckUtils'
import { createInitialBoard } from '@/lib/boardData'
import { playerHasBuiltIncomeProperty, pickAiDiscardPropertyIds, pickAiActionCardDiscardIds } from '@/lib/bot/simpleAiTurn'
import { incomePercentageForDie } from '@/lib/incomeDice'
import { getInvestablePlots, getTakeoverTargetPlots } from '@/lib/investmentTargets'
import { boardHasBuiltAnchorTenant, boardHasBuiltMafia } from '@/lib/actionPreconditions'
import {
  getHousingBuildCost,
  getPlotPropertyEndValue,
  getPlotPropertyIncome,
  HIGH_DENSITY_HOUSING_STATS,
  isHousingPropertyCard,
} from '@/lib/housingEconomics'
import { getBuildCelebrationNotice, getPlotLotDisplayName } from '@/lib/buildCelebrationMessages'
import {
  getChurchIncomeBonusForPlayer,
  getArtsCouncilIncomeBonusForPlayer,
  getFarmCoopIncomeBonusForPlayer,
  getPortAuthorityIncomeBonusForPlayer,
  getTourismOfficeIncomeBonusForPlayer,
  getInfluencersIncomeBonusForPlayer,
  getNewsOutletIncomeBonusForPlayer,
  getMafiaIncomeBonusForPlayer,
  getMafiaLevyForIncomePlayer,
  getRegulationBureauIncomeBonusForPlayer,
  getRegulationBureauIncomePenaltyForPlayer,
  getUnionIncomeBonusForOwner,
  getUnionIncomePenaltyForPlayer,
  getAnchorInfluenceForAction,
  getScandalAttackerRollBonuses,
  getPlotsEligibleForScandal,
  getCityCouncilFreezeAttackerInfluence,
  getPoliceRaidAttackerInfluence,
  totalRemoveInvestorsBuyoutMillion,
  investorRemovalBuyoutMillion,
  computeInvestorIncomeAwardsForOwner,
  allocateInvestorPayoutsFromOwner,
  allocateMafiaTributeFromOwner,
} from '@/lib/utils'
import {
  MAX_TURN_ACTIONS,
  MAX_ACTION_HAND_SIZE,
  REZONING_SUCCESS_ACTION_COST,
  canAttemptRezoning,
  replenishCurrentPlayerActionHand,
  turnLimitReached,
} from '@/lib/turnActions'
import { nextPlayRoundNumber } from '@/lib/playRound'
import { gameDockToast as toast } from '@/lib/fsGameToast'
import { playCalamitySound } from '@/lib/soundEffects'
import { clearBoardNotice, dismissOpeningProTip, resetOverlayStore } from '@/lib/gameOverlayStore'
import {
  closedIncomeDialog,
  createClosedActionCriteriaDialog,
  getPlayUiSnapshot,
  resetPlayUiStore,
  setActionCriteriaDialog,
  setCalamityAcceptPending,
  setDiscardDialogState,
  setDiscardPropertyConfirmOpen,
  setDiscardPropertySelectMode,
  setDoubleIncomeOrphanDialog,
  setIncomeDialogState,
  setInvestmentSelectMode,
  setPlacementMode,
  setRemoveInvestorsSelectMode,
  setRezoningMode,
  setRollDieDialogState,
  setScandalSelectMode,
  setTakeoverSelectMode,
  setTaxBuildMode,
  setTaxBuildPrompt,
  setUndoActionDialogOpen,
  taxPromptResumeRef,
} from '@/lib/playUiStore'
import { saveLastOnlineSession, clearLastOnlineSession } from '@/lib/onlineSessionMemory'
import { clearAuthoritySnapshot } from '@/lib/onlineAuthorityMemory'
import type { Player, GameState } from '@/lib/types'
import type { PartyBoardSyncConfig, PartyBoardSyncMeta } from '@/lib/partyBoardSync'
import { rollSeatIsAi } from '@/lib/buildRequiredAction'
import { getValidPlotsForProperty, getVacantCityLotsForRezoning } from '@/lib/placementRules'
import { needsEmulateChoiceBeforePlacement, resolvePropertyPlacementTemplate } from '@/lib/placementTemplate'
import { isCivicFlexHandCard } from '@/lib/civicFlexProperty'
import {
  confrontationAttemptTitle,
  hostileTakeoverAttemptTitle,
  hostileTakeoverAttackerSuccessTitle,
  hostileTakeoverDefenseSuccessTitle,
  investmentNoticeTitle,
} from '@/lib/confrontationNotice'
import { countResolvedActionStepsInBatch, initialGameState, isAiSeat, withReplenishedActionHand } from './helpers'
import type { PlaySession } from './types'
import { commitCalamityRoll } from './calamity'

export function guestJoined(s: PlaySession, gs: GameState, cfg: PartyBoardSyncConfig)
{
  const {
    safeGameState,
    setGameState,
    patchGameState,
    isOnlineActor,
    sendAction,
    broadcastBoardFx,
    broadcastDiceRollNotice,
    announceConfrontation,
    announceConfrontationAttempt,
    getPlotAt,
    getFlightRect,
    isSpectator,
    partyBoardConfig,
    partyBoardSeatPlayer,
    nudgeTurnAdvanceForSpentBudget,
    scheduleEndOfTurn,
    rollDieDialogStateRef,
    calamityAcceptPendingRef,
    calamityCommitInFlightRef,
    aiGsRef,
    setPartyBoardConfig,
    flushAuthorityPersist,
    handInteractionsActive,
  } = s
  const gameState = safeGameState

    saveLastOnlineSession({
      roomId: cfg.roomId,
      displayName: cfg.displayName,
      role: 'guest',
    })
    setGameState(gs)
    setPartyBoardConfig(cfg)
  }

export function resumeHostTable(s: PlaySession, gs: GameState, cfg: PartyBoardSyncConfig)
{
  const {
    safeGameState,
    setGameState,
    patchGameState,
    isOnlineActor,
    sendAction,
    broadcastBoardFx,
    broadcastDiceRollNotice,
    announceConfrontation,
    announceConfrontationAttempt,
    getPlotAt,
    getFlightRect,
    isSpectator,
    partyBoardConfig,
    partyBoardSeatPlayer,
    nudgeTurnAdvanceForSpentBudget,
    scheduleEndOfTurn,
    rollDieDialogStateRef,
    calamityAcceptPendingRef,
    calamityCommitInFlightRef,
    aiGsRef,
    setPartyBoardConfig,
    flushAuthorityPersist,
    handInteractionsActive,
  } = s
  const gameState = safeGameState

    saveLastOnlineSession({
      roomId: cfg.roomId,
      displayName: cfg.displayName,
      role: 'host',
    })
    setGameState(gs)
    setPartyBoardConfig(cfg)
    toast.success(`Resumed hosting room ${cfg.roomId}. Guests can Resync or Rejoin.`)
  }

export function setupComplete(s: PlaySession, players: Player[], partyBoard?: PartyBoardSyncMeta)
{
  const {
    safeGameState,
    setGameState,
    patchGameState,
    isOnlineActor,
    sendAction,
    broadcastBoardFx,
    broadcastDiceRollNotice,
    announceConfrontation,
    announceConfrontationAttempt,
    getPlotAt,
    getFlightRect,
    isSpectator,
    partyBoardConfig,
    partyBoardSeatPlayer,
    nudgeTurnAdvanceForSpentBudget,
    scheduleEndOfTurn,
    rollDieDialogStateRef,
    calamityAcceptPendingRef,
    calamityCommitInFlightRef,
    aiGsRef,
    setPartyBoardConfig,
    flushAuthorityPersist,
    handInteractionsActive,
  } = s
  const gameState = safeGameState

    if (partyBoard) {
      saveLastOnlineSession({
        roomId: partyBoard.roomId,
        displayName: partyBoard.displayName,
        role: 'host',
      })
      setPartyBoardConfig({ ...partyBoard, role: 'host' })
    } else {
      setPartyBoardConfig(null)
    }
    const actionDeck = createActionDeck()
    const propertyDeck = createPropertyDeck()

    let remainingActionDeck = actionDeck
    let remainingPropertyDeck = propertyDeck

    const playersWithCards = players.map((player) => {
      const { hand: dealtActions, remaining: remainingActions } = dealActionHandSkippingCalamity(
        remainingActionDeck,
        5
      )
      remainingActionDeck = remainingActions

      const { drawn: propertyHand, remaining: remainingProperties } = drawCards(remainingPropertyDeck, 5)
      remainingPropertyDeck = remainingProperties

      const updatedPlayer: Player = {
        ...player,
        actionCards: dealtActions,
        propertyCards: propertyHand,
      }
      return updatedPlayer
    })

    const { drawn: initialActionCards, remaining: afterExtraDraw } = drawCards(remainingActionDeck, 2)

    dismissOpeningProTip()

    setGameState((current) => {
      const base: GameState = {
        ...current,
        players: playersWithCards,
        plots: createInitialBoard(),
        isSetupComplete: true,
        actionDeck: remainingActionDeck,
        propertyDeck: remainingPropertyDeck,
        currentPlayerIndex: 0,
        actionDiscard: [],
        propertyDiscard: [],
        turnActionsConsumed: 0,
        incomeResolvedThisTurn: false,
        awaitingEndTurnActionDiscard: undefined,
        openingNarrationComplete: false,
        playRoundNumber: 1,
        crossingTheLineActive: false,
        playedPropertyCardThisTurn: undefined,
        propertiesBuiltThisTurn: 0,
        actionsPlayedThisTurn: 0,
        lastBuiltProperty: undefined,
        councilFreezeBlockBuildForPlayerId: undefined,
        pendingCouncilFreezeDefense: undefined,
        pendingRebuttalRoll: undefined,
        pendingIncomeTaxPlayerIds: [],
        pendingCalamity: undefined,
        calamityUsedVariantKeys: [],
        lastCalamityPlayRound: undefined,
        gameEnded: undefined,
        winningSequence: undefined,
        endGameTriggered: undefined,
        endGameTriggerPlayerId: undefined,
        endGameTriggerLocation: undefined,
        finalRoundTurnsRemaining: undefined,
      }
      // First founder's extra 2 is a real draw — Calamity here fires immediately after narration.
      return ingestActionDraw(base, 0, initialActionCards, afterExtraDraw, [], 'append')
    })
    toast.success('Game started! Each player received 5 property cards and 5 action cards.')

    setTimeout(() => {
      setGameState((current) => {
        return {
          ...current,
          showNewCardsAnimation: false,
          newCardsDrawn: undefined,
        }
      })
    }, 2000)
  }

export function resetLocalUiToTitle(s: PlaySession)
{
  const {
    safeGameState,
    setGameState,
    patchGameState,
    isOnlineActor,
    sendAction,
    broadcastBoardFx,
    broadcastDiceRollNotice,
    announceConfrontation,
    announceConfrontationAttempt,
    getPlotAt,
    getFlightRect,
    isSpectator,
    partyBoardConfig,
    partyBoardSeatPlayer,
    nudgeTurnAdvanceForSpentBudget,
    scheduleEndOfTurn,
    rollDieDialogStateRef,
    calamityAcceptPendingRef,
    calamityCommitInFlightRef,
    aiGsRef,
    setPartyBoardConfig,
    flushAuthorityPersist,
    handInteractionsActive,
  } = s
  const gameState = safeGameState

    setPartyBoardConfig(null)
    setGameState(initialGameState)
    setPlacementMode({
      active: false,
      propertyCardId: null,
      housingHighDensity: undefined,
      taxBuildActionInstanceId: undefined,
      wildCardEmulatePropertyId: undefined,
    })
    setIncomeDialogState({ ...closedIncomeDialog })
    setDiscardDialogState({ open: false, numToDiscard: 0 })
    setRollDieDialogState({
      open: false,
      mode: 'roll-die',
      actionInstanceId: null,
      targetPlayerId: undefined,
      influenceBonus: undefined,
      influenceLabels: undefined,
      councilFreezeAttackerRollsCompleted: undefined,
      councilFreezeAttackerLastNatural: undefined,
      councilFreezeFailAuto: undefined,
      diceRetryNonce: undefined,
      takeoverContext: undefined,
      rezoningContext: undefined,
      scandalContext: undefined,
      removeInvestorsContext: undefined,
    })
    setScandalSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    setInvestmentSelectMode({ active: false, validPlots: [], actionInstanceId: null, contributionMillion: 4 })
    setDiscardPropertySelectMode({ active: false, actionInstanceId: null, selectedPropertyInstanceIds: [] })
    setDiscardPropertyConfirmOpen(false)
    setRemoveInvestorsSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    setTakeoverSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    setRezoningMode({ phase: 'inactive' })
    setTaxBuildMode({ phase: 'inactive' })
    taxPromptResumeRef.current = null
    setTaxBuildPrompt({
      open: false,
      propertyInstanceId: null,
      actionInstanceId: null,
      housingHighDensity: undefined,
      wildCardEmulatePropertyId: undefined,
    })
    setActionCriteriaDialog(createClosedActionCriteriaDialog())
    setDoubleIncomeOrphanDialog({ open: false, instanceId: null })
    resetOverlayStore()
    resetPlayUiStore()
  }

export function leaveTable(s: PlaySession)
{
  const {
    safeGameState,
    setGameState,
    patchGameState,
    isOnlineActor,
    sendAction,
    broadcastBoardFx,
    broadcastDiceRollNotice,
    announceConfrontation,
    announceConfrontationAttempt,
    getPlotAt,
    getFlightRect,
    isSpectator,
    partyBoardConfig,
    partyBoardSeatPlayer,
    nudgeTurnAdvanceForSpentBudget,
    scheduleEndOfTurn,
    rollDieDialogStateRef,
    calamityAcceptPendingRef,
    calamityCommitInFlightRef,
    aiGsRef,
    setPartyBoardConfig,
    flushAuthorityPersist,
    handInteractionsActive,
  } = s
  const gameState = safeGameState

    if (partyBoardConfig?.role === 'host') {
      flushAuthorityPersist()
      saveLastOnlineSession({
        roomId: partyBoardConfig.roomId,
        displayName: partyBoardConfig.displayName,
        role: 'host',
      })
      toast.info(
        `Left hosting room ${partyBoardConfig.roomId}. Use Resume table on the title screen to re-enter the same game.`
      )
    } else if (partyBoardConfig?.role === 'guest') {
      saveLastOnlineSession({
        roomId: partyBoardConfig.roomId,
        displayName: partyBoardConfig.displayName,
        role: 'guest',
      })
      toast.info(
        `Left the table. Rejoin room ${partyBoardConfig.roomId} with seat name "${partyBoardConfig.displayName}" while the host stays online.`
      )
    }
    resetLocalUiToTitle(s)
  }

export function endTable(s: PlaySession)
{
  const {
    safeGameState,
    setGameState,
    patchGameState,
    isOnlineActor,
    sendAction,
    broadcastBoardFx,
    broadcastDiceRollNotice,
    announceConfrontation,
    announceConfrontationAttempt,
    getPlotAt,
    getFlightRect,
    isSpectator,
    partyBoardConfig,
    partyBoardSeatPlayer,
    nudgeTurnAdvanceForSpentBudget,
    scheduleEndOfTurn,
    rollDieDialogStateRef,
    calamityAcceptPendingRef,
    calamityCommitInFlightRef,
    aiGsRef,
    setPartyBoardConfig,
    flushAuthorityPersist,
    handInteractionsActive,
  } = s
  const gameState = safeGameState

    if (partyBoardConfig?.role === 'host') {
      s.sendGameClear()
      clearAuthoritySnapshot(partyBoardConfig.roomId)
      clearLastOnlineSession()
      toast.info('Table ended. Guests can no longer rejoin this room.')
    }
    resetLocalUiToTitle(s)
  }

export function newGame(s: PlaySession)
{
  const {
    safeGameState,
    setGameState,
    patchGameState,
    isOnlineActor,
    sendAction,
    broadcastBoardFx,
    broadcastDiceRollNotice,
    announceConfrontation,
    announceConfrontationAttempt,
    getPlotAt,
    getFlightRect,
    isSpectator,
    partyBoardConfig,
    partyBoardSeatPlayer,
    nudgeTurnAdvanceForSpentBudget,
    scheduleEndOfTurn,
    rollDieDialogStateRef,
    calamityAcceptPendingRef,
    calamityCommitInFlightRef,
    aiGsRef,
    setPartyBoardConfig,
    flushAuthorityPersist,
    handInteractionsActive,
  } = s
  const gameState = safeGameState

    if (partyBoardConfig && safeGameState.isSetupComplete) {
      leaveTable(s)
      return
    }
    if (partyBoardConfig?.role === 'host') {
      endTable(s)
      return
    }
    resetLocalUiToTitle(s)
    toast.info('Starting a new game...')
  }
