'use client'

import type { PlayCardsOptions } from '@/components/game/PlayerHand'
import { getGameHandlers } from '@/lib/gameHandlerBag'
import { propertyCards, actionCards } from '@/lib/cardData'
import type { PropertyCard, CardInstance } from '@/lib/cardTypes'
import { applyBuildAt } from '@/lib/gameEngine/applyBuildAt'
import { applyEndTurn } from '@/lib/gameEngine/applyEndTurn'
import { applyBankActionCards } from '@/lib/gameEngine/applyBankAction'
import { applyIncomeComplete } from '@/lib/gameEngine/applyIncomeComplete'
import { buildEndGameEligibilityPatch } from '@/lib/gameEngine/statePatches'
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

export function finalizeCouncilFreezeAttackFailure(s: PlaySession, instanceId: string, source: 'accept' | 'auto' = 'accept')
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

    patchGameState((current) => {
      const currentPlayer = current.players[current.currentPlayerIndex]
      const updatedActionCards = currentPlayer.actionCards.filter((c) => c.instanceId !== instanceId)
      const inst = currentPlayer.actionCards.find((c) => c.instanceId === instanceId)
      const actionDiscardPile = inst ? [...current.actionDiscard, inst] : [...current.actionDiscard]
      const newActionsPlayedThisTurn = current.actionsPlayedThisTurn + 1
      const newTurnActionsConsumed = (current.turnActionsConsumed ?? 0) + 1
      const updatedPlayers = current.players.map((p, idx) =>
        idx === current.currentPlayerIndex ? { ...p, actionCards: updatedActionCards } : p
      )
      const newState: GameState = {
        ...current,
        players: updatedPlayers,
        actionDiscard: actionDiscardPile,
        actionsPlayedThisTurn: newActionsPlayedThisTurn,
        turnActionsConsumed: newTurnActionsConsumed,
      }
      if (turnLimitReached(newTurnActionsConsumed)) {
        scheduleEndOfTurn()
      }
      return withReplenishedActionHand(newState, current.currentPlayerIndex)
    })
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
    })
    {
      toast.info('City Council Freeze ends — you did not reach 5–6 after influence.')
      const gs = aiGsRef.current
      const attackerName = gs?.players[gs.currentPlayerIndex]?.name ?? 'Attacker'
      const targetId = rollDieDialogStateRef.current.targetPlayerId
      const targetName = gs?.players.find((p) => p.id === targetId)?.name ?? 'Target'
      announceConfrontation(
        'City Council Freeze',
        attackerName,
        targetName,
        'failure',
        source === 'auto'
          ? 'Three rolls failed — freeze card spent with no effect.'
          : 'Did not reach 5–6 after influence — freeze card spent with no effect.',
        'boo'
      )
    }
  }

export function attackerDieSettled(s: PlaySession, natural: number)
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

    setRollDieDialogState((prev) => {
      if (!prev.open || prev.mode !== 'council-freeze-attacker') return prev
      const bonus = prev.influenceBonus ?? 0
      const total = natural + bonus
      const success = total >= 5
      const rolls = (prev.councilFreezeAttackerRollsCompleted ?? 0) + 1

      if (!success && rolls === 3) {
        return {
          ...prev,
          councilFreezeAttackerRollsCompleted: 3,
          councilFreezeAttackerLastNatural: natural,
          councilFreezeFailAuto: true,
        }
      }

      return {
        ...prev,
        councilFreezeAttackerRollsCompleted: rolls,
        councilFreezeAttackerLastNatural: natural,
      }
    })
  }

export function councilFreezeAttackerRollAgain(s: PlaySession)
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

    let paid = false
    patchGameState((current) => {
      const rolls = rollDieDialogStateRef.current.councilFreezeAttackerRollsCompleted ?? 0
      if (rolls < 1 || rolls >= 3) return current
      const idx = current.currentPlayerIndex
      const attacker = current.players[idx]
      if (attacker.money < 5) {
        toast.error('Need $5M to roll again.')
        return current
      }
      paid = true
      const nextPlayers = current.players.map((p, i) =>
        i === idx ? { ...p, money: p.money - 5 } : p
      )
      return { ...current, players: nextPlayers }
    })
    if (paid) {
      setRollDieDialogState((prev) =>
        prev.open && prev.mode === 'council-freeze-attacker'
          ? { ...prev, diceRetryNonce: (prev.diceRetryNonce ?? 0) + 1 }
          : prev
      )
      toast.info('$5M paid for another City Council Freeze roll.')
    }
  }

export function councilFreezeFailDismiss(s: PlaySession)
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

    const id = rollDieDialogStateRef.current.actionInstanceId
    if (!id) return
    finalizeCouncilFreezeAttackFailure(s, id, 'auto')
  }

export function finalizeSimpleActionResolution(s: PlaySession, instanceId: string, toastMessage: {
 type: 'success' | 'info' | 'error'; text: string })
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

      patchGameState((current) => {
        const cpIdx = current.currentPlayerIndex
        const p = current.players[cpIdx]
        const updatedActionCards = p.actionCards.filter((c) => c.instanceId !== instanceId)
        const inst = p.actionCards.find((c) => c.instanceId === instanceId)
        const actionDiscardPile = inst ? [...current.actionDiscard, inst] : [...current.actionDiscard]
        const newActionsPlayedThisTurn = current.actionsPlayedThisTurn + 1
        const newTurnActionsConsumed = (current.turnActionsConsumed ?? 0) + 1
        const updatedPlayers = current.players.map((pl, i) =>
          i === cpIdx ? { ...pl, actionCards: updatedActionCards } : pl
        )
        const newState: GameState = {
          ...current,
          players: updatedPlayers,
          actionDiscard: actionDiscardPile,
          actionsPlayedThisTurn: newActionsPlayedThisTurn,
          turnActionsConsumed: newTurnActionsConsumed,
        }
        if (turnLimitReached(newTurnActionsConsumed)) {
          scheduleEndOfTurn()
        }
        return withReplenishedActionHand(newState, cpIdx)
      })
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
      if (toastMessage.type === 'success') toast.success(toastMessage.text)
      else if (toastMessage.type === 'error') toast.error(toastMessage.text)
      else toast.info(toastMessage.text)
    }

export function finalizeScandalCardSpent(s: PlaySession, instanceId: string)
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

    patchGameState((current) => {
      const cpIdx = current.currentPlayerIndex
      const p = current.players[cpIdx]
      const updatedActionCards = p.actionCards.filter((c) => c.instanceId !== instanceId)
      const inst = p.actionCards.find((c) => c.instanceId === instanceId)
      const actionDiscardPile = inst ? [...current.actionDiscard, inst] : [...current.actionDiscard]
      const newActionsPlayedThisTurn = current.actionsPlayedThisTurn + 1
      const newTurnActionsConsumed = (current.turnActionsConsumed ?? 0) + 1
      const updatedPlayers = current.players.map((pl, i) =>
        i === cpIdx ? { ...pl, actionCards: updatedActionCards } : pl
      )
      const newState: GameState = {
        ...current,
        players: updatedPlayers,
        actionDiscard: actionDiscardPile,
        actionsPlayedThisTurn: newActionsPlayedThisTurn,
        turnActionsConsumed: newTurnActionsConsumed,
      }
      if (turnLimitReached(newTurnActionsConsumed)) {
        scheduleEndOfTurn()
      }
      return withReplenishedActionHand(newState, cpIdx)
    })
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
    })
  }

export function rollDieComplete(s: PlaySession, result: number, extras?: {
 calamityVariantKey?: string })
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

    const dialog = rollDieDialogStateRef.current
    if (dialog.mode === 'calamity') {
      commitCalamityRoll(s, result, extras)
      return
    }
    if (calamityAcceptPendingRef.current && !dialog.open) {
      commitCalamityRoll(s, result, extras)
      return
    }
    if (!dialog.actionInstanceId || !dialog.open) return

    if (dialog.mode === 'council-freeze-attacker') {
      const natural = dialog.councilFreezeAttackerLastNatural ?? result
      const bonus = dialog.influenceBonus ?? 0
      const labels = dialog.influenceLabels ?? []
      const total = natural + bonus
      const success = total >= 5

      if (success) {
        const detail = bonus > 0 ? ` ${natural} + ${bonus} (${labels.join(' & ')}) = ${total}` : ` ${natural}`
        toast.success(`Rolled${detail}. Success — target may roll a 6 to negate the freeze.`)
        {
          const attackerName =
            safeGameState.players[safeGameState.currentPlayerIndex]?.name ?? 'Attacker'
          const targetName =
            safeGameState.players.find((p) => p.id === dialog.targetPlayerId)?.name ?? 'Target'
          announceConfrontation(
            'City Council Freeze',
            attackerName,
            targetName,
            'pending',
            `Rolled ${total} — ${targetName} must roll a 6 to negate the freeze.`,
            'boo'
          )
        }

        if (isOnlineActor) {
          // Online: hand the negate roll to the target's own device. Spend the card
          // now (this is still the attacker's turn, so the commit is accepted) and
          // publish the pending defense; every device reacts to it from state.
          const instanceId = dialog.actionInstanceId
          const targetId = dialog.targetPlayerId
          patchGameState((current) => {
            const attacker = current.players[current.currentPlayerIndex]
            const targetName =
              current.players.find((p) => p.id === targetId)?.name ?? 'Target player'
            const inst = attacker.actionCards.find((c) => c.instanceId === instanceId)
            const updatedActionCards = attacker.actionCards.filter((c) => c.instanceId !== instanceId)
            const actionDiscardPile = inst ? [...current.actionDiscard, inst] : [...current.actionDiscard]
            const newState: GameState = {
              ...current,
              players: current.players.map((p, idx) =>
                idx === current.currentPlayerIndex ? { ...p, actionCards: updatedActionCards } : p
              ),
              actionDiscard: actionDiscardPile,
              actionsPlayedThisTurn: current.actionsPlayedThisTurn + 1,
              turnActionsConsumed: (current.turnActionsConsumed ?? 0) + 1,
              undoLastAction: undefined,
              pendingCouncilFreezeDefense:
                targetId != null
                  ? {
                      targetPlayerId: targetId,
                      attackerPlayerId: attacker.id,
                      attackerName: attacker.name,
                      targetName,
                    }
                  : undefined,
            }
            return withReplenishedActionHand(newState, current.currentPlayerIndex)
          })
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
          return
        }

        setRollDieDialogState({
          open: true,
          mode: 'council-freeze-defender',
          actionInstanceId: dialog.actionInstanceId,
          targetPlayerId: dialog.targetPlayerId,
          influenceBonus: 0,
          influenceLabels: [],
          councilFreezeAttackerRollsCompleted: undefined,
          councilFreezeAttackerLastNatural: undefined,
          councilFreezeFailAuto: false,
          diceRetryNonce: 0,
          takeoverContext: undefined,
          rezoningContext: undefined,
          scandalContext: undefined,
        })
        return
      }

      const rolls = dialog.councilFreezeAttackerRollsCompleted ?? 0
      if (rolls >= 3) {
        return
      }

      finalizeCouncilFreezeAttackFailure(s, dialog.actionInstanceId)
      return
    }

    if (dialog.mode === 'council-freeze-defender') {
      if (safeGameState.pendingCouncilFreezeDefense) {
        // Online handoff: the freeze card was already spent on the attacker's turn.
        // Report this device's negate roll to the table authority; the shared
        // council_freeze_result event announces the outcome on every screen.
        sendAction({ type: 'council_freeze_defense', result })
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
        return
      }

      const negated = result === 6
      const targetId = dialog.targetPlayerId
      const instanceId = dialog.actionInstanceId!

      let targetName = 'Target player'
      patchGameState((current) => {
        if (targetId != null) {
          targetName = current.players.find((p) => p.id === targetId)?.name ?? 'Target player'
        }
        const currentPlayer = current.players[current.currentPlayerIndex]
        const updatedActionCards = currentPlayer.actionCards.filter((c) => c.instanceId !== instanceId)
        const inst = currentPlayer.actionCards.find((c) => c.instanceId === instanceId)
        const actionDiscardPile = inst ? [...current.actionDiscard, inst] : [...current.actionDiscard]
        const newActionsPlayedThisTurn = current.actionsPlayedThisTurn + 1
        const newTurnActionsConsumed = (current.turnActionsConsumed ?? 0) + 1
        const updatedPlayers = current.players.map((p, idx) =>
          idx === current.currentPlayerIndex ? { ...p, actionCards: updatedActionCards } : p
        )

        let councilFreezeBlockBuildForPlayerId = current.councilFreezeBlockBuildForPlayerId
        if (!negated && targetId != null) {
          councilFreezeBlockBuildForPlayerId = targetId
        }

        const newState: GameState = {
          ...current,
          players: updatedPlayers,
          actionDiscard: actionDiscardPile,
          actionsPlayedThisTurn: newActionsPlayedThisTurn,
          turnActionsConsumed: newTurnActionsConsumed,
          councilFreezeBlockBuildForPlayerId,
        }

        if (turnLimitReached(newTurnActionsConsumed)) {
          scheduleEndOfTurn()
        }

        return withReplenishedActionHand(newState, current.currentPlayerIndex)
      })

      {
        const attackerName =
          safeGameState.players[safeGameState.currentPlayerIndex]?.name ?? 'Attacker'
        if (negated) {
          announceConfrontation(
            'City Council Freeze',
            attackerName,
            targetName,
            'blocked',
            `${targetName} rolled 6 — freeze negated. They can build as usual.`,
            'cheer'
          )
        } else {
          announceConfrontation(
            'City Council Freeze',
            attackerName,
            targetName,
            'success',
            `${targetName} rolled ${result} — freeze holds. They cannot build until they finish their next turn.`,
            'boo'
          )
        }
      }

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
      return
    }

    if (dialog.mode === 'hostile-takeover-attacker') {
      const ctx = dialog.takeoverContext
      const takeoverBonus = dialog.influenceBonus ?? 0
      const takeoverTotal = result + takeoverBonus
      if (!ctx) {
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
        })
        return
      }
      if (takeoverTotal < 5) {
        toast.info('Unsuccessful Take Over. The card is spent and the $1M fee is lost.')
        {
          const attackerName =
            safeGameState.players[safeGameState.currentPlayerIndex]?.name ?? 'Attacker'
          const ownerName =
            safeGameState.players.find((p) => p.id === ctx.ownerPlayerId)?.name ?? 'Owner'
          announceConfrontation(
            'Hostile Takeover',
            attackerName,
            ownerName,
            'failure',
            `Rolled ${takeoverTotal} — need 5+ after influence. Card spent; $1M fee lost.`,
            'cheer'
          )
        }
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
        })
        return
      }
      if (takeoverBonus > 0) {
        toast.success(
          `Successful Take Over (${result} + ${takeoverBonus} = ${takeoverTotal}). The owner may roll once — only a 6 blocks the takeover.`
        )
      } else {
        toast.success('Successful Take Over. The owner may roll once — only a 6 blocks the takeover.')
      }

      if (!isOnlineActor) {
        const attackerName =
          safeGameState.players[safeGameState.currentPlayerIndex]?.name ?? 'Attacker'
        const ownerName =
          safeGameState.players.find((p) => p.id === ctx.ownerPlayerId)?.name ?? 'Owner'
        announceConfrontation(
          'Hostile Takeover',
          attackerName,
          ownerName,
          'pending',
          `Rolled ${takeoverTotal} — ${ownerName} may roll once to defend; only a 6 blocks.`,
          'boo',
          hostileTakeoverAttackerSuccessTitle()
        )
      }

      if (isOnlineActor) {
        const instanceId = dialog.actionInstanceId!
        patchGameState((current) => {
          const attacker = current.players[current.currentPlayerIndex]
          const targetName =
            current.players.find((p) => p.id === ctx.ownerPlayerId)?.name ?? 'Property owner'
          return {
            ...current,
            pendingRebuttalRoll: {
              kind: 'hostile-takeover',
              targetPlayerId: ctx.ownerPlayerId,
              attackerPlayerId: attacker.id,
              attackerName: attacker.name,
              targetName,
              actionInstanceId: instanceId,
              takeoverContext: ctx,
            },
          }
        })
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
        {
          const attackerName =
            safeGameState.players[safeGameState.currentPlayerIndex]?.name ?? 'Attacker'
          const ownerName =
            safeGameState.players.find((p) => p.id === ctx.ownerPlayerId)?.name ?? 'Owner'
          announceConfrontation(
            'Hostile Takeover',
            attackerName,
            ownerName,
            'pending',
            `Rolled ${takeoverTotal} — ${ownerName} may roll once to defend; only a 6 blocks.`,
            'boo',
            hostileTakeoverAttackerSuccessTitle()
          )
        }
        return
      }

      setRollDieDialogState({
        open: true,
        mode: 'hostile-takeover-defender',
        actionInstanceId: dialog.actionInstanceId,
        takeoverContext: ctx,
        targetPlayerId: ctx.ownerPlayerId,
        influenceBonus: undefined,
        influenceLabels: undefined,
        councilFreezeAttackerRollsCompleted: undefined,
        councilFreezeAttackerLastNatural: undefined,
        councilFreezeFailAuto: undefined,
        diceRetryNonce: (dialog.diceRetryNonce ?? 0) + 1,
        rezoningContext: undefined,
        scandalContext: undefined,
        removeInvestorsContext: undefined,
      })
      return
    }

    if (dialog.mode === 'hostile-takeover-defender') {
      const ctx = dialog.takeoverContext
      const blocked = result === 6
      if (!ctx) {
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
        })
        return
      }
      const { row, col, ownerPlayerId, payment120Million } = ctx

      if (gameState.pendingRebuttalRoll?.kind === 'hostile-takeover') {
        sendAction({ type: 'rebuttal_roll', result })
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
        return
      }

      if (blocked) {
        const ownerName =
          safeGameState.players.find((p) => p.id === ownerPlayerId)?.name ?? 'Property owner'
        const attackerName =
          safeGameState.players[safeGameState.currentPlayerIndex]?.name ?? 'Attacker'
        announceConfrontation(
          'Hostile Takeover',
          attackerName,
          ownerName,
          'blocked',
          `${ownerName} rolled 6 — ${col}${row} stays with its owner.`,
          'cheer',
          hostileTakeoverDefenseSuccessTitle()
        )
      } else {
        patchGameState((current) => {
          const cpIdx = current.currentPlayerIndex
          const attacker = current.players[cpIdx]
          const ownerIdx = current.players.findIndex((p) => p.id === ownerPlayerId)
          const plotIndex = current.plots.findIndex((p) => p.row === row && p.col === col)
          if (plotIndex === -1 || ownerIdx === -1) return current
          const plot = current.plots[plotIndex]
          if (plot.claimedBy !== ownerPlayerId) return current
          if (attacker.money < payment120Million) {
            setTimeout(() => {
              toast.error(`Need $${payment120Million}M to complete the takeover.`)
            }, 0)
            return current
          }
          const newPlots = [...current.plots]
          newPlots[plotIndex] = {
            ...plot,
            claimedBy: attacker.id,
            investmentStripes: undefined,
          }
          const players = current.players.map((p, i) => {
            if (i === cpIdx) return { ...p, money: p.money - payment120Million }
            if (i === ownerIdx) return { ...p, money: p.money + payment120Million }
            return p
          })
          const baseUpdate: GameState = { ...current, players, plots: newPlots }
          const takeoverTriggerPatch = buildEndGameEligibilityPatch(current, newPlots, { row, col })
          const stateAfterTakeover: GameState = { ...baseUpdate, ...takeoverTriggerPatch }
          setTimeout(() => {
            toast.success(
              `Takeover complete — paid $${payment120Million}M (120% of end value) to the former owner.`
            )
          }, 0)
          if (takeoverTriggerPatch.pendingEndGameDeclaration) {
            const triggererName =
              current.players.find((p) => p.id === takeoverTriggerPatch.pendingEndGameDeclaration?.playerId)
                ?.name ?? 'A founder'
            setTimeout(() => {
              toast.info(
                `${triggererName} has 12 adjacent properties and may declare the endgame.`
              )
            }, 600)
          }
          return stateAfterTakeover
        })
        {
          const attackerName =
            safeGameState.players[safeGameState.currentPlayerIndex]?.name ?? 'Attacker'
          const ownerName =
            safeGameState.players.find((p) => p.id === ownerPlayerId)?.name ?? 'former owner'
          announceConfrontation(
            'Hostile Takeover',
            attackerName,
            ownerName,
            'success',
            `${attackerName} takes ${col}${row} — paid $${payment120Million}M (120% of end value).`,
            'dwindle',
            hostileTakeoverAttackerSuccessTitle()
          )
        }
      }

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
      return
    }

    if (dialog.mode === 'scandal-attacker') {
      const bonus = dialog.influenceBonus ?? 0
      const total = result + bonus
      const ctx = dialog.scandalContext
      const instanceId = dialog.actionInstanceId!
      if (!ctx) {
        toast.error('Scandal lost target context — card discarded.')
        finalizeScandalCardSpent(s, instanceId)
        return
      }
      if (total < 6) {
        toast.info('Scandal fails — need 6+ after Influencer bonus. Scandal card is discarded.')
        {
          const attackerName =
            safeGameState.players[safeGameState.currentPlayerIndex]?.name ?? 'Attacker'
          const ownerName =
            safeGameState.players.find((p) => p.id === ctx.anchorOwnerPlayerId)?.name ??
            'Anchor owner'
          announceConfrontation(
            'Scandal',
            attackerName,
            ownerName,
            'failure',
            `Rolled ${total} — need 6+ after influence. Scandal card discarded.`,
            'cheer'
          )
        }
        finalizeScandalCardSpent(s, instanceId)
        return
      }
      if (bonus > 0) {
        toast.success(
          `Scandal roll succeeds (${result} + ${bonus} = ${total}). The anchor owner may roll a 6 to negate.`
        )
      } else {
        toast.success('Scandal roll succeeds. The anchor owner may roll a 6 to negate.')
      }

      if (isOnlineActor && ctx) {
        const targetId = ctx.anchorOwnerPlayerId
        patchGameState((current) => {
          const attacker = current.players[current.currentPlayerIndex]
          const targetName =
            current.players.find((p) => p.id === targetId)?.name ?? 'Anchor owner'
          const inst = attacker.actionCards.find((c) => c.instanceId === instanceId)
          const updatedActionCards = attacker.actionCards.filter((c) => c.instanceId !== instanceId)
          const actionDiscardPile = inst ? [...current.actionDiscard, inst] : [...current.actionDiscard]
          const newState: GameState = {
            ...current,
            players: current.players.map((p, idx) =>
              idx === current.currentPlayerIndex ? { ...p, actionCards: updatedActionCards } : p
            ),
            actionDiscard: actionDiscardPile,
            actionsPlayedThisTurn: current.actionsPlayedThisTurn + 1,
            turnActionsConsumed: (current.turnActionsConsumed ?? 0) + 1,
            undoLastAction: undefined,
            pendingRebuttalRoll: {
              kind: 'scandal',
              targetPlayerId: targetId,
              attackerPlayerId: attacker.id,
              attackerName: attacker.name,
              targetName,
              actionInstanceId: instanceId,
              scandalContext: ctx,
            },
          }
          return withReplenishedActionHand(newState, current.currentPlayerIndex)
        })
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
        {
          const attackerName =
            safeGameState.players[safeGameState.currentPlayerIndex]?.name ?? 'Attacker'
          const ownerName =
            safeGameState.players.find((p) => p.id === ctx.anchorOwnerPlayerId)?.name ?? 'Anchor owner'
          announceConfrontation(
            'Scandal',
            attackerName,
            ownerName,
            'pending',
            `Rolled ${total} — ${ownerName} must roll a 6 at ${ctx.col}${ctx.row} to negate.`,
            'boo'
          )
        }
        return
      }

      {
        const attackerName =
          safeGameState.players[safeGameState.currentPlayerIndex]?.name ?? 'Attacker'
        const ownerName =
          safeGameState.players.find((p) => p.id === ctx.anchorOwnerPlayerId)?.name ??
          'Anchor owner'
        announceConfrontation(
          'Scandal',
          attackerName,
          ownerName,
          'pending',
          `Rolled ${total} — ${ownerName} must roll a 6 at ${ctx.col}${ctx.row} to negate.`,
          'boo'
        )
      }
      setRollDieDialogState({
        open: true,
        mode: 'scandal-defender',
        actionInstanceId: instanceId,
        targetPlayerId: ctx.anchorOwnerPlayerId,
        scandalContext: ctx,
        influenceBonus: undefined,
        influenceLabels: undefined,
        councilFreezeAttackerRollsCompleted: undefined,
        councilFreezeAttackerLastNatural: undefined,
        councilFreezeFailAuto: undefined,
        diceRetryNonce: (dialog.diceRetryNonce ?? 0) + 1,
        takeoverContext: undefined,
        rezoningContext: undefined,
      })
      return
    }

    if (dialog.mode === 'scandal-defender') {
      const ctx = dialog.scandalContext
      const instanceId = dialog.actionInstanceId!
      const negated = result === 6
      if (!ctx) {
        finalizeScandalCardSpent(s, instanceId)
        return
      }
      if (gameState.pendingRebuttalRoll?.kind === 'scandal') {
        sendAction({ type: 'rebuttal_roll', result })
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
        return
      }
      {
        const attackerName =
          safeGameState.players[safeGameState.currentPlayerIndex]?.name ?? 'Attacker'
        const ownerName =
          safeGameState.players.find((p) => p.id === ctx.anchorOwnerPlayerId)?.name ??
          'Anchor owner'
        if (negated) {
          toast.success('Rolled 6 — scandal negated. The anchor keeps its influence.')
          announceConfrontation(
            'Scandal',
            attackerName,
            ownerName,
            'blocked',
            `${ownerName} rolled 6 — anchor keeps its influence at ${ctx.col}${ctx.row}.`,
            'cheer'
          )
        } else {
          patchGameState((current) => {
            const plotIndex = current.plots.findIndex((p) => p.row === ctx.row && p.col === ctx.col)
            if (plotIndex === -1) return current
            const plot = current.plots[plotIndex]
            if (plot.builtProperty !== ctx.anchorCardId) return current
            const newPlots = [...current.plots]
            newPlots[plotIndex] = vacateOverthrownAnchorPlot(plot)
            const anchorName =
              propertyCards.find((c) => c.id === ctx.anchorCardId)?.name ?? 'Anchor'
            setTimeout(() => {
              toast.success(
                `${anchorName} overthrown at ${ctx.col}${ctx.row} — lot returns to vacant Anchor Tenet.`
              )
            }, 0)
            return { ...current, plots: newPlots }
          })
          announceConfrontation(
            'Scandal',
            attackerName,
            ownerName,
            'success',
            `Anchor overthrown at ${ctx.col}${ctx.row} — lot is vacant Anchor Tenet again.`,
            'dwindle'
          )
        }
      }
      finalizeScandalCardSpent(s, instanceId)
      return
    }

    if (dialog.mode === 'rezoning') {
      const ctx = dialog.rezoningContext
      const actionInstId = dialog.actionInstanceId
      if (!ctx || !actionInstId) {
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
        })
        setRezoningMode({ phase: 'inactive' })
        return
      }
      const bonus = dialog.influenceBonus ?? 0
      const total = result + bonus
      const success = total >= 5

      if (!success) {
        patchGameState((current) => {
          const cpIdx = current.currentPlayerIndex
          const p = current.players[cpIdx]
          const inst = p.actionCards.find((a) => a.instanceId === actionInstId)
          const updated = p.actionCards.filter((a) => a.instanceId !== actionInstId)
          const discard = inst ? [...current.actionDiscard, inst] : current.actionDiscard
          const nActions = current.actionsPlayedThisTurn + 1
          const nTurnConsumed = (current.turnActionsConsumed ?? 0) + 1
          const players = current.players.map((pl, i) =>
            i === cpIdx ? { ...pl, actionCards: updated } : pl
          )
          const ns: GameState = {
            ...current,
            players,
            actionDiscard: discard,
            actionsPlayedThisTurn: nActions,
            turnActionsConsumed: nTurnConsumed,
          }
          if (turnLimitReached(nTurnConsumed)) {
            scheduleEndOfTurn()
          }
          return withReplenishedActionHand(ns, cpIdx)
        })
        toast.error(
          `Rezoning denied (total ${total}). Zoning unchanged — Rezoning card discarded; you cannot build on that lot this attempt.`
        )
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
        })
        setRezoningMode({ phase: 'inactive' })
        return
      }

      patchGameState((current) => {
        const cpIdx = current.currentPlayerIndex
        const player = current.players[cpIdx]
        const plotIndex = current.plots.findIndex((p) => p.row === ctx.row && p.col === ctx.col)
        if (plotIndex === -1) return current
        const plot = current.plots[plotIndex]
        if (plot.builtProperty) return current
        const card = propertyCards.find((c) => c.id === ctx.propertyCardId) as PropertyCard
        if (!card) return current
        const highDensity = ctx.housingHighDensity === true && isHousingPropertyCard(card)
        const buildCost = getHousingBuildCost(card, highDensity)
        const propInst = player.propertyCards.find((c) => c.instanceId === ctx.propertyInstanceId)
        const rezInst = player.actionCards.find((c) => c.instanceId === actionInstId)
        if (!propInst || player.money < buildCost) {
          if (!rezInst) return current
          const updatedActionCards = player.actionCards.filter((c) => c.instanceId !== actionInstId)
          const actionDiscardPile = [...current.actionDiscard, rezInst]
          const nActions = current.actionsPlayedThisTurn + 1
          const nTurnConsumed = (current.turnActionsConsumed ?? 0) + 1
          const players = current.players.map((pl, i) =>
            i === cpIdx ? { ...pl, actionCards: updatedActionCards } : pl
          )
          queueMicrotask(() => {
            toast.error(
              !propInst
                ? 'That property card is no longer in your hand — Rezoning card discarded.'
                : `Need $${buildCost}M to complete the rezoning build — Rezoning card discarded.`
            )
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
            })
            setRezoningMode({ phase: 'inactive' })
          })
          const ns: GameState = {
            ...current,
            players,
            actionDiscard: actionDiscardPile,
            actionsPlayedThisTurn: nActions,
            turnActionsConsumed: nTurnConsumed,
          }
          if (turnLimitReached(nTurnConsumed)) {
            scheduleEndOfTurn()
          }
          return withReplenishedActionHand(ns, cpIdx)
        }
        const newPlots = [...current.plots]
        newPlots[plotIndex] = {
          ...plot,
          builtProperty: card.id,
          claimedBy: player.id,
          housingHighDensity: highDensity ? true : undefined,
        }
        const updatedMoney = player.money - buildCost
        const updatedPropertyCards = player.propertyCards.filter((c) => c.instanceId !== ctx.propertyInstanceId)
        const updatedActionCards = player.actionCards.filter((c) => c.instanceId !== actionInstId)
        const propertyDiscardPile = [...current.propertyDiscard, propInst]
        const actionDiscardPile = rezInst ? [...current.actionDiscard, rezInst] : current.actionDiscard
        const newProps = current.propertiesBuiltThisTurn + 1
        const newActions = current.actionsPlayedThisTurn + 1
        // Success = action play + included build (two of the three turn actions).
        const newTurnConsumed = Math.min(
          MAX_TURN_ACTIONS,
          (current.turnActionsConsumed ?? 0) + REZONING_SUCCESS_ACTION_COST
        )
        const players = current.players.map((pl, i) =>
          i === cpIdx
            ? {
                ...pl,
                money: updatedMoney,
                propertyCards: updatedPropertyCards,
                actionCards: updatedActionCards,
              }
            : pl
        )
        {
          const rezPlot = current.plots[plotIndex]
          const celebration = getBuildCelebrationNotice(rezPlot, card, { housingHighDensity: highDensity })
          const notice =
            card.type === 'anchor'
              ? { lotName: card.name, suffix: ' anchored!' }
              : celebration ?? { lotName: getPlotLotDisplayName(ctx.col, ctx.row, rezPlot.building), suffix: ' built!' }
          broadcastBoardFx({
            sound: card.type === 'anchor' ? 'anchor' : 'construction',
            notice: {
              title: `🎲 Rezoning — ${notice.lotName}${notice.suffix}`,
              detail: `${ctx.col}${ctx.row} · $${buildCost}M · 2 actions`,
            },
          })
        }
        const newState: GameState = {
          ...current,
          players,
          plots: newPlots,
          propertyDiscard: propertyDiscardPile,
          actionDiscard: actionDiscardPile,
          propertiesBuiltThisTurn: newProps,
          actionsPlayedThisTurn: newActions,
          turnActionsConsumed: newTurnConsumed,
          playedPropertyCardThisTurn: propInst.instanceId,
          lastBuiltProperty: {
            row: ctx.row,
            col: ctx.col,
            propertyId: card.id,
            buildCost,
          },
        }
        const triggerPatch = buildEndGameEligibilityPatch(current, newPlots, { row: ctx.row, col: ctx.col })
        const stateWithTrigger: GameState = { ...newState, ...triggerPatch }
        if (triggerPatch.pendingEndGameDeclaration) {
          const triggererName =
            current.players.find((p) => p.id === triggerPatch.pendingEndGameDeclaration?.playerId)?.name ??
            'A founder'
          setTimeout(() => {
            toast.info(
              `${triggererName} has 12 adjacent properties and may declare the endgame.`
            )
          }, 600)
        }
        if (turnLimitReached(newTurnConsumed) && !stateWithTrigger.pendingEndGameDeclaration) {
          scheduleEndOfTurn()
        }
        return withReplenishedActionHand(stateWithTrigger, cpIdx)
      })

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
      setRezoningMode({ phase: 'inactive' })
      return
    }

    if (dialog.mode === 'police-raid-attacker') {
      const bonus = dialog.influenceBonus ?? 0
      const total = result + bonus
      const success = total >= 5
      const instanceId = dialog.actionInstanceId
      if (!success) {
        finalizeSimpleActionResolution(s, instanceId, {
          type: 'info',
          text: `Police Raid fails (${result}${bonus > 0 ? ` + ${bonus}` : ''}). Need 5+ to succeed.`,
        })
        return
      }
      /** Counter roll: Mafia owner rolls one. Needs 6 if attacker had no raid influence; 5–6 if attacker had +1 from Police/City Hall/Courthouse. */
      const mafiaOwnerId = safeGameState.plots.find(
        (p) => p.builtProperty === 'mafia' && p.claimedBy != null
      )?.claimedBy

      if (isOnlineActor && mafiaOwnerId != null) {
        patchGameState((current) => {
          const attacker = current.players[current.currentPlayerIndex]
          const targetName =
            current.players.find((p) => p.id === mafiaOwnerId)?.name ?? 'Mafia owner'
          return {
            ...current,
            pendingRebuttalRoll: {
              kind: 'police-raid',
              targetPlayerId: mafiaOwnerId,
              attackerPlayerId: attacker.id,
              attackerName: attacker.name,
              targetName,
              actionInstanceId: instanceId!,
              policeRaidInfluenceBonus: bonus,
              policeRaidInfluenceLabels: dialog.influenceLabels ?? [],
            },
          }
        })
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
        {
          const attackerName =
            safeGameState.players[safeGameState.currentPlayerIndex]?.name ?? 'Attacker'
          const mafiaOwner =
            safeGameState.players.find((p) =>
              safeGameState.plots.some(
                (pl) => pl.builtProperty === 'mafia' && pl.claimedBy === p.id
              )
            )?.name ?? 'Mafia owner'
          announceConfrontation(
            'Police Raid on Mafia',
            attackerName,
            mafiaOwner,
            'pending',
            `Raid succeeds (${result}${bonus > 0 ? ` + ${bonus}` : ''}) — ${mafiaOwner} must roll to counter.`,
            'boo'
          )
        }
        return
      }

      {
        const attackerName =
          safeGameState.players[safeGameState.currentPlayerIndex]?.name ?? 'Attacker'
        const mafiaOwner =
          safeGameState.players.find((p) =>
            safeGameState.plots.some(
              (pl) => pl.builtProperty === 'mafia' && pl.claimedBy === p.id
            )
          )?.name ?? 'Mafia owner'
        announceConfrontation(
          'Police Raid on Mafia',
          attackerName,
          mafiaOwner,
          'pending',
          `Raid succeeds (${result}${bonus > 0 ? ` + ${bonus}` : ''}) — ${mafiaOwner} must roll to counter.`,
          'boo'
        )
      }
      setRollDieDialogState({
        open: true,
        mode: 'police-raid-defender',
        actionInstanceId: instanceId,
        targetPlayerId: mafiaOwnerId,
        influenceBonus: bonus,
        influenceLabels: dialog.influenceLabels ?? [],
        councilFreezeAttackerRollsCompleted: undefined,
        councilFreezeAttackerLastNatural: undefined,
        councilFreezeFailAuto: undefined,
        diceRetryNonce: (dialog.diceRetryNonce ?? 0) + 1,
        takeoverContext: undefined,
        rezoningContext: undefined,
        scandalContext: undefined,
        removeInvestorsContext: undefined,
      })
      toast.success(`Police Raid succeeds (${result}${bonus > 0 ? ` + ${bonus}` : ''}). Mafia rolls to counter.`)
      return
    }

    if (dialog.mode === 'police-raid-defender') {
      const bonus = dialog.influenceBonus ?? 0
      /** Attacker had raid influence (+1 max) if bonus > 0 — defender then needs 5–6 to counter. Otherwise only a 6 counters. */
      const counterThreshold = bonus > 0 ? 5 : 6
      const counters = result >= counterThreshold

      if (gameState.pendingRebuttalRoll?.kind === 'police-raid') {
        sendAction({ type: 'rebuttal_roll', result })
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
        return
      }

      {
        const attackerName =
          safeGameState.players[safeGameState.currentPlayerIndex]?.name ?? 'Attacker'
        const mafiaOwnerId = safeGameState.plots.find(
          (p) => p.builtProperty === 'mafia' && p.claimedBy != null
        )?.claimedBy
        const mafiaOwner =
          safeGameState.players.find((p) => p.id === mafiaOwnerId)?.name ?? 'Mafia owner'
        if (!counters) {
          if (mafiaOwnerId != null) {
            patchGameState((current) => ({
              ...current,
              plots: current.plots.map((p) =>
                p.builtProperty === 'mafia' && p.claimedBy === mafiaOwnerId
                  ? vacateOverthrownAnchorPlot(p)
                  : p
              ),
            }))
          }
          announceConfrontation(
            'Police Raid on Mafia',
            attackerName,
            mafiaOwner,
            'success',
            `Mafia rolls ${result} — cannot counter (needed ${counterThreshold}+). Mafia lots return to vacant Anchor Tenet.`,
            'dwindle'
          )
        } else {
          announceConfrontation(
            'Police Raid on Mafia',
            attackerName,
            mafiaOwner,
            'blocked',
            `Mafia counters with ${result} (needed ${counterThreshold}+). Police Raid is repelled.`,
            'cheer'
          )
        }
      }

      finalizeSimpleActionResolution(s, dialog.actionInstanceId, {
        type: counters ? 'info' : 'success',
        text: counters
          ? `Mafia counters with ${result} (needed ${counterThreshold}+). Police Raid is repelled.`
          : `Mafia rolls ${result} — cannot counter. Police Raid succeeds.`,
      })
      return
    }

    if (dialog.mode === 'remove-investors') {
      const bonus = dialog.influenceBonus ?? 0
      const total = result + bonus
      const instanceId = dialog.actionInstanceId
      const ctx = dialog.removeInvestorsContext
      if (!instanceId) return

      if (!ctx) {
        finalizeSimpleActionResolution(s, instanceId, {
          type: 'error',
          text: 'Remove Investors could not find the selected property. Card discarded.',
        })
        return
      }

      const riOwnerName =
        safeGameState.players[safeGameState.currentPlayerIndex]?.name ?? 'Owner'
      const riPlot = getPlotAt(ctx.row, ctx.col)
      const riInvestorIds = [
        ...new Set((riPlot?.investmentStripes ?? []).map((s) => s.investorId)),
      ]
      const riInvestorLabel =
        riInvestorIds
          .map((id) => safeGameState.players.find((p) => p.id === id)?.name)
          .filter(Boolean)
          .join(', ') || 'investors'

      if (total < 5) {
        announceConfrontation(
          'Remove Investors',
          riOwnerName,
          riInvestorLabel,
          'failure',
          `Rolled ${result}${bonus > 0 ? ` + ${bonus}` : ''} (need 5+) — investors stay at ${ctx.col}${ctx.row}.`,
          'cheer'
        )
        finalizeSimpleActionResolution(s, instanceId, {
          type: 'info',
          text: `Remove Investors fails (rolled ${result}${bonus > 0 ? ` + ${bonus}` : ''}, need 5+). Investors stay.`,
        })
        return
      }

      patchGameState((current) => {
        const cpIdx = current.currentPlayerIndex
        const ownerId = current.players[cpIdx].id
        const plotIndex = current.plots.findIndex((p) => p.row === ctx.row && p.col === ctx.col)
        if (plotIndex === -1) return current
        const plot = current.plots[plotIndex]
        if (plot.claimedBy !== ownerId || !plot.investmentStripes?.length) return current

        const buyoutTotal = totalRemoveInvestorsBuyoutMillion(plot.investmentStripes)
        const owner = current.players[cpIdx]
        if (owner.money < buyoutTotal) {
          toast.error(
            `You no longer have $${buyoutTotal}M for mandatory 50% buyouts — investors stay; card still spent.`
          )
          const p = current.players[cpIdx]
          const updatedActionCards = p.actionCards.filter((c) => c.instanceId !== instanceId)
          const inst = p.actionCards.find((c) => c.instanceId === instanceId)
          const actionDiscardPile = inst ? [...current.actionDiscard, inst] : [...current.actionDiscard]
          const newTurnConsumed = (current.turnActionsConsumed ?? 0) + 1
          const updatedPlayers = current.players.map((pl, i) =>
            i === cpIdx ? { ...pl, actionCards: updatedActionCards } : pl
          )
          const newState: GameState = {
            ...current,
            players: updatedPlayers,
            actionDiscard: actionDiscardPile,
            actionsPlayedThisTurn: current.actionsPlayedThisTurn + 1,
            turnActionsConsumed: newTurnConsumed,
          }
          if (turnLimitReached(newTurnConsumed)) {
            scheduleEndOfTurn()
          }
          return withReplenishedActionHand(newState, cpIdx)
        }

        const payoutByInvestor = new Map<number, number>()
        for (const s of plot.investmentStripes) {
          const pay = investorRemovalBuyoutMillion(s.contributionMillion)
          if (pay <= 0) continue
          payoutByInvestor.set(s.investorId, (payoutByInvestor.get(s.investorId) ?? 0) + pay)
        }

        const newPlayers = current.players.map((pl) => {
          if (pl.id === ownerId) return { ...pl, money: pl.money - buyoutTotal }
          const add = payoutByInvestor.get(pl.id) ?? 0
          return add > 0 ? { ...pl, money: pl.money + add } : pl
        })

        const newPlots = [...current.plots]
        newPlots[plotIndex] = { ...plot, investmentStripes: undefined }

        const p = newPlayers[cpIdx]
        const updatedActionCards = p.actionCards.filter((c) => c.instanceId !== instanceId)
        const inst = p.actionCards.find((c) => c.instanceId === instanceId)
        const actionDiscardPile = inst ? [...current.actionDiscard, inst] : [...current.actionDiscard]
        const newTurnConsumed = (current.turnActionsConsumed ?? 0) + 1

        const updatedPlayersWithCards = newPlayers.map((pl, i) =>
          i === cpIdx ? { ...pl, actionCards: updatedActionCards } : pl
        )

        const newState: GameState = {
          ...current,
          players: updatedPlayersWithCards,
          plots: newPlots,
          actionDiscard: actionDiscardPile,
          actionsPlayedThisTurn: current.actionsPlayedThisTurn + 1,
          turnActionsConsumed: newTurnConsumed,
        }

        if (turnLimitReached(newTurnConsumed)) {
          scheduleEndOfTurn()
        }

        toast.success(
          `Investors removed from ${ctx.col}${ctx.row}. Paid $${buyoutTotal}M total in 50% buyouts (roll ${result}${bonus > 0 ? ` + ${bonus}` : ''} = ${total}).`
        )

        return withReplenishedActionHand(newState, cpIdx)
      })

      announceConfrontation(
        'Remove Investors',
        riOwnerName,
        riInvestorLabel,
        'success',
        `Investors cleared from ${ctx.col}${ctx.row} (roll ${result}${bonus > 0 ? ` + ${bonus}` : ''} = ${total}).`,
        'dwindle'
      )

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
      return
    }

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
  }

export function rollDieCancel(s: PlaySession)
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

    if (
      rollDieDialogStateRef.current.mode === 'rezoning' ||
      rollDieDialogStateRef.current.mode === 'hostile-takeover-attacker' ||
      rollDieDialogStateRef.current.mode === 'hostile-takeover-defender' ||
      rollDieDialogStateRef.current.mode === 'scandal-attacker' ||
      rollDieDialogStateRef.current.mode === 'scandal-defender' ||
      rollDieDialogStateRef.current.mode === 'council-freeze-attacker' ||
      rollDieDialogStateRef.current.mode === 'council-freeze-defender' ||
      rollDieDialogStateRef.current.mode === 'police-raid-attacker' ||
      rollDieDialogStateRef.current.mode === 'police-raid-defender' ||
      rollDieDialogStateRef.current.mode === 'remove-investors' ||
      rollDieDialogStateRef.current.mode === 'calamity'
    ) {
      toast.error('This action must be resolved with a die roll. Roll the die to continue.')
      return
    }
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
    toast.info('Dice roll cancelled.')
  }
