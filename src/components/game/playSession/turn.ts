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
import { attachUndoSnapshotIfTurnAction, canUndoLastAction, restoreUndoSnapshot } from '@/lib/undoLastAction'
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
import { playerHasBuiltIncomeProperty, pickAiDiscardPropertyIds, pickAiActionCardDiscardIds, trySimpleAiMainPhase } from '@/lib/bot/simpleAiTurn'
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
import {
  countResolvedActionStepsInBatch,
  initialGameState,
  isAiSeat,
  REMOTE_COUNCIL_FREEZE_DEFENSE_ID,
  REMOTE_REBUTTAL_ROLL_ID,
  withReplenishedActionHand,
} from './helpers'
import type { PlaySession } from './types'
import { commitCalamityRoll } from './calamity'

export function endTurn(s: PlaySession)
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
      getPlayUiSnapshot().rollDieDialogState.open &&
      (getPlayUiSnapshot().rollDieDialogState.mode === 'hostile-takeover-attacker' ||
        getPlayUiSnapshot().rollDieDialogState.mode === 'hostile-takeover-defender' ||
        getPlayUiSnapshot().rollDieDialogState.mode === 'scandal-attacker' ||
        getPlayUiSnapshot().rollDieDialogState.mode === 'scandal-defender' ||
        getPlayUiSnapshot().rollDieDialogState.mode === 'council-freeze-attacker' ||
        getPlayUiSnapshot().rollDieDialogState.mode === 'council-freeze-defender' ||
        getPlayUiSnapshot().rollDieDialogState.mode === 'rezoning' ||
        getPlayUiSnapshot().rollDieDialogState.mode === 'police-raid-attacker' ||
        getPlayUiSnapshot().rollDieDialogState.mode === 'police-raid-defender' ||
        getPlayUiSnapshot().rollDieDialogState.mode === 'remove-investors' ||
        getPlayUiSnapshot().rollDieDialogState.mode === 'calamity')
    ) {
      toast.error('Finish the dice roll before ending your turn.')
      return
    }
    if (safeGameState.pendingCalamity) {
      toast.error('Finish the city-wide Calamity rolls before ending your turn.')
      return
    }
    if (getPlayUiSnapshot().rezoningMode.phase !== 'inactive') {
      setRezoningMode({ phase: 'inactive' })
    }
    if (getPlayUiSnapshot().takeoverSelectMode.active) {
      setTakeoverSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    }
    if (getPlayUiSnapshot().scandalSelectMode.active) {
      setScandalSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    }
    if (getPlayUiSnapshot().investmentSelectMode.active) {
      setInvestmentSelectMode({ active: false, validPlots: [], actionInstanceId: null, contributionMillion: 4 })
    }
    if (getPlayUiSnapshot().discardPropertySelectMode.active) {
      setDiscardPropertySelectMode({ active: false, actionInstanceId: null, selectedPropertyInstanceIds: [] })
    }
    setDiscardPropertyConfirmOpen(false)
    if (getPlayUiSnapshot().removeInvestorsSelectMode.active) {
      setRemoveInvestorsSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    }
    if (getPlayUiSnapshot().taxBuildMode.phase !== 'inactive') {
      setTaxBuildMode({ phase: 'inactive' })
    }
    if (getPlayUiSnapshot().taxBuildPrompt.open) {
      taxPromptResumeRef.current = null
      setTaxBuildPrompt({
        open: false,
        propertyInstanceId: null,
        actionInstanceId: null,
        housingHighDensity: undefined,
        wildCardEmulatePropertyId: undefined,
      })
    }
    if (getPlayUiSnapshot().placementMode.active) {
      setPlacementMode({
        active: false,
        propertyCardId: null,
        housingHighDensity: undefined,
        taxBuildActionInstanceId: undefined,
        wildCardEmulatePropertyId: undefined,
      })
    }
    // Seat captured at call time: a stale/double end turn (seat advanced before this
    // lands) becomes a precise no-op inside applyEndTurn instead of hitting the next
    // founder — while a legit over-cap end turn now enters the discard phase.
    const seatAtCall = aiGsRef.current?.currentPlayerIndex ?? safeGameState.currentPlayerIndex
    if (isOnlineActor) {
      sendAction({ type: 'end_turn', seatIndex: seatAtCall })
      return
    }
    setGameState((current) => {
      const result = applyEndTurn(current, { expectedSeatIndex: seatAtCall })
      if (!result.ok) {
        toast.error(result.error)
        return current
      }
      for (const ev of result.events) {
        if (ev.type === 'discard_required') {
          setDiscardDialogState({ open: true, numToDiscard: ev.numToDiscard })
        } else if (ev.type === 'game_over') {
          setTimeout(() => toast.success('Final Round complete — game over!'), 200)
        } else if (ev.type === 'turn_changed') {
          toast.info(ev.finalRound ? `${ev.playerName}'s final turn` : `${ev.playerName}'s turn`)
        } else if (ev.type === 'toast') {
          if (ev.level === 'success') toast.success(ev.message)
          else if (ev.level === 'error') toast.error(ev.message)
          else toast.info(ev.message)
        }
      }
      return result.state
    })

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

export function discardComplete(s: PlaySession, discardedInstanceIds: string[])
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

    if (!getPlayUiSnapshot().discardDialogState.open) return
    if (isOnlineActor) {
      // Online: the engine removes the cards and re-runs end turn, so decks and
      // the next player's draw resolve on the authority's full state.
      setDiscardDialogState({ open: false, numToDiscard: 0 })
      toast.success(
        `Discarded ${discardedInstanceIds.length} action card${discardedInstanceIds.length > 1 ? 's' : ''}`
      )
      sendAction({ type: 'discard_action_cards', instanceIds: discardedInstanceIds })
      return
    }
    setDiscardDialogState({ open: false, numToDiscard: 0 })
    toast.success(
      `Discarded ${discardedInstanceIds.length} action card${discardedInstanceIds.length > 1 ? 's' : ''}`
    )
    setGameState((current) => {
      const currentPlayer = current.players[current.currentPlayerIndex]
      const ids = new Set(discardedInstanceIds)
      const removed = currentPlayer.actionCards.filter((c) => ids.has(c.instanceId))
      const kept = currentPlayer.actionCards.filter((c) => !ids.has(c.instanceId))
      const afterDiscard: GameState = {
        ...current,
        players: current.players.map((p, idx) =>
          idx === current.currentPlayerIndex ? { ...p, actionCards: kept } : p
        ),
        actionDiscard: [...current.actionDiscard, ...removed],
        awaitingEndTurnActionDiscard: undefined,
      }
      // Same path as online: re-enter end turn. Next founder may draw 2 and
      // exceed 8 until *their* turn ends — do not open discard for them here.
      const result = applyEndTurn(afterDiscard)
      if (!result.ok) {
        toast.error(result.error)
        return current
      }
      for (const ev of result.events) {
        if (ev.type === 'discard_required') {
          setDiscardDialogState({ open: true, numToDiscard: ev.numToDiscard })
        } else if (ev.type === 'game_over') {
          setTimeout(() => toast.success('Final Round complete — game over!'), 200)
        } else if (ev.type === 'turn_changed') {
          toast.info(ev.finalRound ? `${ev.playerName}'s final turn` : `${ev.playerName}'s turn`)
        } else if (ev.type === 'toast') {
          if (ev.level === 'success') toast.success(ev.message)
          else if (ev.level === 'error') toast.error(ev.message)
          else toast.info(ev.message)
        }
      }
      return result.state
    })

    setTimeout(() => {
      setGameState((current) => {
        if (!current.showNewCardsAnimation) return current
        return {
          ...current,
          showNewCardsAnimation: false,
          newCardsDrawn: undefined,
        }
      })
    }, 2000)
  }

export function propertyClick(s: PlaySession, row: number, col: string)
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

    if (getPlayUiSnapshot().placementMode.active) return
    if (getPlayUiSnapshot().rezoningMode.phase !== 'inactive') return
    if (getPlayUiSnapshot().takeoverSelectMode.active) return
    if (getPlayUiSnapshot().scandalSelectMode.active) return
    if (getPlayUiSnapshot().investmentSelectMode.active) return
    if (getPlayUiSnapshot().discardPropertySelectMode.active) return
    if (getPlayUiSnapshot().removeInvestorsSelectMode.active) return

    if (
      safeGameState.lastBuiltProperty &&
      safeGameState.lastBuiltProperty.row === row &&
      safeGameState.lastBuiltProperty.col === col &&
      canUndoLastAction(safeGameState, { handInteractionsActive, isSpectator })
    ) {
      setUndoActionDialogOpen(true)
    }
  }

export function vacantLotHint(s: PlaySession)
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

    toast.info(
      'Claim a lot by placing a property: click the card (or expand it), then click a highlighted lot. Play required action cards first (for example Crossing the Line where district rules apply).'
    )
  }

export function undoLastAction(s: PlaySession)
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

    const label = safeGameState.undoLastAction?.label ?? 'Last action'
    patchGameState((current) => {
      const restored = restoreUndoSnapshot(current)
      if (restored === current) return current
      toast.success(`Undid: ${label}`)
      return restored
    })
    setUndoActionDialogOpen(false)
  }

export function undoLastActionCancel(s: PlaySession)
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

    setUndoActionDialogOpen(false)
  }

export function unstickPlay(s: PlaySession)
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
    aiCpRef,
    aiUiRef,
    aiHooksRef,
    setPartyBoardConfig,
    flushAuthorityPersist,
    handInteractionsActive,
  } = s
  const gameState = safeGameState

    const canDriveBots = !partyBoardConfig || partyBoardConfig.role === 'host'
    if (calamityAcceptPendingRef.current) {
      getGameHandlers().handleAcceptCalamity()
      toast.success('Accepted Calamity — play continues.')
      return
    }
    if (!canDriveBots) {
      // A roll dialog open on THIS device is driven by this device (e.g. a guest's
      // own defense roll). Force-resolve it locally so a hung dice renderer cannot
      // hard-lock the guest — everything else needs the host.
      const guestRoll = rollDieDialogStateRef.current
      if (guestRoll.open) {
        getGameHandlers().handleRollDieComplete(Math.floor(Math.random() * 6) + 1)
        toast.success('Forced dice resolution — play continues.')
        return
      }
      toast.info('Ask the host to tap Unstick, or use Resync if the connection looks stale.')
      return
    }

    const acting = safeGameState.players[safeGameState.currentPlayerIndex]

    // Force-resolve stuck Income (bots) — previously Unstick could not clear this dialog.
    if (getPlayUiSnapshot().incomeDialogState.open && (acting?.isAi === true || getPlayUiSnapshot().incomeDialogState.player?.isAi === true)) {
      if (getPlayUiSnapshot().incomeDialogState.hasBuiltPropertiesForIncomeRoll) {
        const face = 4
        const pct = incomePercentageForDie(face)
        const amount = Math.floor((getPlayUiSnapshot().incomeDialogState.totalIncome * pct) / 100)
        getGameHandlers().handleIncomeComplete(Math.max(0, amount), undefined, 'property-roll', face)
      } else {
        const bv = actionCards.find((c) => c.id === 'income')?.bankValue ?? 2
        getGameHandlers().handleIncomeComplete(bv, undefined, 'bank-income-card')
      }
      toast.success('Forced Income resolution for Founderbot — play continues.')
      return
    }

    // Force-resolve excess-hand discard dialog for the acting seat.
    if (getPlayUiSnapshot().discardDialogState.open && acting) {
      const n = getPlayUiSnapshot().discardDialogState.numToDiscard
      const ids = pickAiActionCardDiscardIds(acting, n)
      getGameHandlers().handleDiscardComplete(ids)
      toast.success('Forced hand discard resolution — play continues.')
      return
    }

    if (safeGameState.showNewCardsAnimation === true) {
      patchGameState((current) =>
        current.showNewCardsAnimation ? { ...current, showNewCardsAnimation: false } : current
      )
      toast.success('Cleared stuck new-cards animation.')
      return
    }

    let clearedSelect = false
    if (getPlayUiSnapshot().takeoverSelectMode.active) {
      getGameHandlers().handleCancelTakeoverSelect()
      clearedSelect = true
    }
    if (getPlayUiSnapshot().scandalSelectMode.active) {
      getGameHandlers().handleCancelScandalSelect()
      clearedSelect = true
    }
    if (getPlayUiSnapshot().investmentSelectMode.active) {
      getGameHandlers().handleCancelInvestmentSelect()
      clearedSelect = true
    }
    if (getPlayUiSnapshot().removeInvestorsSelectMode.active) {
      getGameHandlers().handleCancelRemoveInvestorsSelect()
      clearedSelect = true
    }
    if (getPlayUiSnapshot().discardPropertySelectMode.active || getPlayUiSnapshot().discardPropertyConfirmOpen) {
      // Bots must spend the action (not cancel) or they re-play Discard Property Cards forever.
      if (acting?.isAi === true) {
        getGameHandlers().handleConfirmDiscardProperty(pickAiDiscardPropertyIds(acting))
        toast.success('Completed stuck Discard Property Cards for Founderbot.')
        return
      }
      getGameHandlers().handleCancelDiscardPropertySelect()
      clearedSelect = true
    }
    if (getPlayUiSnapshot().rezoningMode.phase !== 'inactive') {
      getGameHandlers().handleCancelRezoning()
      clearedSelect = true
    }
    if (getPlayUiSnapshot().placementMode.active) {
      setPlacementMode({
        active: false,
        propertyCardId: null,
        housingHighDensity: undefined,
        taxBuildActionInstanceId: undefined,
        wildCardEmulatePropertyId: undefined,
      })
      clearedSelect = true
    }
    if (getPlayUiSnapshot().actionCriteriaDialog.open) {
      getGameHandlers().handleActionCriteriaBank()
      toast.success('Banked the stuck action card — play continues.')
      return
    }

    const rd = rollDieDialogStateRef.current
    if (rd.open && rollSeatIsAi(safeGameState, rd, acting)) {
      const forced = Math.floor(Math.random() * 6) + 1
      getGameHandlers().handleRollDieComplete(forced)
      toast.success('Forced computer dice resolution — play continues.')
      return
    }

    // Human roll stuck on this device (hung WebGL init leaves the Roll button on
    // "Loading..." with no Cancel on confrontation modes) — resolve it the same way.
    if (rd.open) {
      getGameHandlers().handleRollDieComplete(Math.floor(Math.random() * 6) + 1)
      toast.success('Forced dice resolution — play continues.')
      return
    }

    const pendingFreeze = safeGameState.pendingCouncilFreezeDefense
    if (pendingFreeze) {
      const defender = safeGameState.players.find((p) => p.id === pendingFreeze.targetPlayerId)
      if (defender?.isAi === true) {
        setRollDieDialogState({
          open: true,
          mode: 'council-freeze-defender',
          actionInstanceId: REMOTE_COUNCIL_FREEZE_DEFENSE_ID,
          targetPlayerId: pendingFreeze.targetPlayerId,
          influenceBonus: 0,
          influenceLabels: [],
          councilFreezeAttackerRollsCompleted: undefined,
          councilFreezeAttackerLastNatural: undefined,
          councilFreezeFailAuto: false,
          diceRetryNonce: 0,
          takeoverContext: undefined,
          rezoningContext: undefined,
          scandalContext: undefined,
          removeInvestorsContext: undefined,
        })
        window.setTimeout(() => {
          getGameHandlers().handleRollDieComplete(Math.floor(Math.random() * 6) + 1)
        }, 120)
        toast.success('Resumed computer City Council Freeze defense.')
        return
      }
    }

    const pendingReb = safeGameState.pendingRebuttalRoll
    if (pendingReb) {
      const defender = safeGameState.players.find((p) => p.id === pendingReb.targetPlayerId)
      if (defender?.isAi === true) {
        const defenderMode =
          pendingReb.kind === 'scandal'
            ? 'scandal-defender'
            : pendingReb.kind === 'hostile-takeover'
              ? 'hostile-takeover-defender'
              : 'police-raid-defender'
        setRollDieDialogState({
          open: true,
          mode: defenderMode,
          actionInstanceId: REMOTE_REBUTTAL_ROLL_ID,
          targetPlayerId: pendingReb.targetPlayerId,
          influenceBonus: pendingReb.policeRaidInfluenceBonus ?? 0,
          influenceLabels: pendingReb.policeRaidInfluenceLabels ?? [],
          scandalContext: pendingReb.scandalContext,
          takeoverContext: pendingReb.takeoverContext,
          councilFreezeAttackerRollsCompleted: undefined,
          councilFreezeAttackerLastNatural: undefined,
          councilFreezeFailAuto: false,
          diceRetryNonce: 0,
          rezoningContext: undefined,
          removeInvestorsContext: undefined,
        })
        window.setTimeout(() => {
          getGameHandlers().handleRollDieComplete(Math.floor(Math.random() * 6) + 1)
        }, 120)
        toast.success('Resumed computer defense roll.')
        return
      }
    }

    const pendingCalamityStuck = safeGameState.pendingCalamity
    if (pendingCalamityStuck) {
      const rollerId = pendingCalamityStuck.rollOrderPlayerIds[pendingCalamityStuck.currentRollIndex]
      const roller = safeGameState.players.find((p) => p.id === rollerId)
      setRollDieDialogState({
        open: true,
        mode: 'calamity',
        actionInstanceId: pendingCalamityStuck.instance.instanceId,
        targetPlayerId: rollerId,
        influenceBonus: 0,
        influenceLabels: [],
        councilFreezeAttackerRollsCompleted: undefined,
        councilFreezeAttackerLastNatural: undefined,
        councilFreezeFailAuto: false,
        diceRetryNonce: pendingCalamityStuck.currentRollIndex,
        takeoverContext: undefined,
        rezoningContext: undefined,
        scandalContext: undefined,
        removeInvestorsContext: undefined,
      })
      window.setTimeout(() => {
        getGameHandlers().handleRollDieComplete(Math.floor(Math.random() * 6) + 1)
      }, 120)
      toast.success(
        roller?.isAi === true
          ? `Forced Calamity roll for ${roller.name}.`
          : 'Forced Calamity roll — play continues.'
      )
      return
    }

    if (acting?.isAi === true) {
      window.setTimeout(() => {
        const gsSnap = aiGsRef.current
        const cpSnap = aiCpRef.current
        const ui = aiUiRef.current
        const hx = aiHooksRef.current
        if (ui && gsSnap && cpSnap?.isAi) {
          trySimpleAiMainPhase(gsSnap, cpSnap, ui, hx)
        }
      }, 50)
      toast.success(clearedSelect ? 'Cleared stuck selection and nudged Founderbot.' : 'Nudged Founderbot to continue.')
      return
    }

    if (clearedSelect) {
      toast.success('Cleared stuck board selection — continue your turn.')
      return
    }

    if (rd.open) {
      toast.info('A human die roll is waiting — use the dice dialog (or Roll Die on the intro).')
      return
    }

    toast.info('Nothing obvious was stuck. If the table still feels frozen, try Unstick again in a moment.')
  }
