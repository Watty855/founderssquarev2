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

export function calamitySettled(s: PlaySession, info: {
 face: number; variant: { key: string; title: string; flavor: string } })
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

      const pending = gameState.pendingCalamity
      if (!pending) return
      const rollerId = pending.rollOrderPlayerIds[pending.currentRollIndex]
      const roller = gameState.players.find((p) => p.id === rollerId)
      const face = info.face
      const percent = calamityPercentForFace(face)
      const lossMillion = calamityLossMillion(roller?.money ?? 0, face)
      const playerName = roller?.name ?? 'Founder'
      setCalamityAcceptPending({
        face,
        variantKey: info.variant.key,
        variantTitle: info.variant.title,
        variantFlavor: info.variant.flavor,
        percent,
        lossMillion,
        playerName,
        autoAccept: isAiSeat(roller),
      })
      playCalamitySound(face)
      clearBoardNotice()
      setRollDieDialogState({
        open: false,
        mode: 'roll-die',
        actionInstanceId: null,
        targetPlayerId: undefined,
      })
}

export function commitCalamityRoll(s: PlaySession, result: number, extras?: {
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

    if (calamityCommitInFlightRef.current) return
    const pending = aiGsRef.current?.pendingCalamity ?? safeGameState.pendingCalamity
    if (!pending) {
      setCalamityAcceptPending(null)
      setRollDieDialogState({ open: false, mode: 'roll-die', actionInstanceId: null })
      return
    }
    calamityCommitInFlightRef.current = true
    const face = Math.round(result)
    const usedKeys = aiGsRef.current?.calamityUsedVariantKeys ?? safeGameState.calamityUsedVariantKeys
    const variant = extras?.calamityVariantKey
      ? findCalamityVariant(face, extras.calamityVariantKey) ?? pickCalamityVariant(face, usedKeys)
      : pickCalamityVariant(face, usedKeys)
    setCalamityAcceptPending(null)
    const release = () => {
      queueMicrotask(() => {
        calamityCommitInFlightRef.current = false
      })
    }
    if (isOnlineActor) {
      sendAction({ type: 'calamity_roll', result: face, variantKey: variant.key })
      setRollDieDialogState({ open: false, mode: 'roll-die', actionInstanceId: null })
      release()
      return
    }
    patchGameState((current) => {
      const applied = applyCalamityRoll(current, face, variant.key)
      if (!applied.ok) return current
      queueMicrotask(() => {
        if (applied.cityWideComplete) {
          toast.info('Calamity resolved — play resumes.')
        }
      })
      if (turnLimitReached(applied.state.turnActionsConsumed) && !applied.state.pendingCalamity) {
        scheduleEndOfTurn()
      }
      return applied.state
    })
    setRollDieDialogState({ open: false, mode: 'roll-die', actionInstanceId: null })
    release()
  }

export function acceptCalamity(s: PlaySession)
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

    const pending = calamityAcceptPendingRef.current
    if (!pending) return
    commitCalamityRoll(s, pending.face, { calamityVariantKey: pending.variantKey })
  }
