'use client'

import type { PlayCardsOptions } from '@/components/game/PlayerHand'
import { getGameHandlers } from '@/lib/gameHandlerBag'
import { propertyCards, actionCards } from '@/lib/cardData'
import type { PropertyCard, CardInstance } from '@/lib/cardTypes'
import { applyBuildAt } from '@/lib/gameEngine/applyBuildAt'
import { applyEndTurn } from '@/lib/gameEngine/applyEndTurn'
import { applyBankActionCards } from '@/lib/gameEngine/applyBankAction'
import { applyIncomeComplete } from '@/lib/gameEngine/applyIncomeComplete'
import { consumeOnePendingIncomeTax, incomeTaxLevyMillion, pendingIncomeTaxCount } from '@/lib/cityTax'
import { vacateOverthrownAnchorPlot } from '@/lib/gameEngine/applyRebuttalResolution'
import { attachUndoSnapshotIfTurnAction, restoreUndoSnapshot } from '@/lib/undoLastAction'
import {
  CALAMITY_OUTCOME_BANNER_MS,
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
  type InvestorIncomeAwardDetail,
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

const DOUBLE_INCOME_BANK_VALUE = actionCards.find((c) => c.id === 'double-income')?.bankValue ?? 5

/** Guards overlapping Income completes; reset when the income dialog closes. */
export const incomeCompleteLockRef = { current: false }

export function doubleIncomeOrphanConfirmBank(s: PlaySession)
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

    const instanceId = getPlayUiSnapshot().doubleIncomeOrphanDialog.instanceId
    setDoubleIncomeOrphanDialog({ open: false, instanceId: null })
    if (!instanceId) return

    patchGameState((current) => {
      const cpIdx = current.currentPlayerIndex
      const p = current.players[cpIdx]
      const inst = p.actionCards.find((c) => c.instanceId === instanceId)
      if (!inst || inst.cardId !== 'double-income') return current

      if (turnLimitReached(current.turnActionsConsumed ?? 0)) {
        queueMicrotask(() => nudgeTurnAdvanceForSpentBudget())
        return current
      }

      const bank = DOUBLE_INCOME_BANK_VALUE
      const updatedActionCards = p.actionCards.filter((c) => c.instanceId !== instanceId)
      const actionDiscard = [...current.actionDiscard, inst]
      const newConsumed = (current.turnActionsConsumed ?? 0) + 1
      const newActionsPlayed = current.actionsPlayedThisTurn + 1

      const updatedPlayers = current.players.map((pl, i) =>
        i === cpIdx ? { ...pl, money: pl.money + bank, actionCards: updatedActionCards } : pl
      )

      const nextState: GameState = {
        ...current,
        players: updatedPlayers,
        actionDiscard,
        turnActionsConsumed: newConsumed,
        actionsPlayedThisTurn: newActionsPlayed,
      }

      queueMicrotask(() =>
        toast.success(
          `Double Income banked for $${bank}M. It doubles a payout only when played together with Income in the same play.`
        )
      )

      if (turnLimitReached(newConsumed)) {
        scheduleEndOfTurn()
      }

      return withReplenishedActionHand(nextState, cpIdx)
    })
  }

export function incomeComplete(s: PlaySession, earnedIncome: number,
    doubleIncomeInstanceId?: string,
    incomeResolution: 'property-roll' | 'bank-income-card' = 'property-roll',
    dieFace?: number)
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

    const resetIncomeDialog = () => setIncomeDialogState({ ...closedIncomeDialog })

    if (incomeCompleteLockRef.current) {
      resetIncomeDialog()
      return
    }
    incomeCompleteLockRef.current = true

    try {
    if (!getPlayUiSnapshot().incomeDialogState.actionInstanceId) return

    const consumedBefore = safeGameState.turnActionsConsumed ?? 0
    let effectiveDoubleIncomeId = doubleIncomeInstanceId
    if (
      effectiveDoubleIncomeId &&
      consumedBefore + 2 > MAX_TURN_ACTIONS
    ) {
      effectiveDoubleIncomeId = undefined
      toast.error(
        `Double Income would exceed ${MAX_TURN_ACTIONS} actions this turn — applying Income only.`
      )
    }

    const incomeOwnerPreview = safeGameState.players[safeGameState.currentPlayerIndex]
    if (!incomeOwnerPreview) return
    const ownerId = incomeOwnerPreview.id
    const pendingTax = pendingIncomeTaxCount(safeGameState.pendingIncomeTaxPlayerIds, ownerId) > 0
    const totalInc = getPlayUiSnapshot().incomeDialogState.totalIncome
    const levy = pendingTax ? incomeTaxLevyMillion(totalInc) : 0

    const isPropertyRoll = incomeResolution === 'property-roll'
    const { payoutByPlayerId: rawInvestorPayout, awards: investorIncomeAwards } = isPropertyRoll
      ? computeInvestorIncomeAwardsForOwner(safeGameState.plots, incomeOwnerPreview.id)
      : { payoutByPlayerId: {} as Record<number, number>, awards: [] as InvestorIncomeAwardDetail[] }

    const { scaled: scaledInvestorPayout, ownerKeeps: afterInvestorsPreview } =
      allocateInvestorPayoutsFromOwner(earnedIncome, isPropertyRoll ? rawInvestorPayout : {})
    const mafiaOwedPreview =
      incomeResolution === 'property-roll'
        ? getMafiaLevyForIncomePlayer(incomeOwnerPreview.id, safeGameState.plots).recipientAmounts
        : {}
    const { scaled: mafiaForToast, ownerKeeps: afterMafiaPreview } = allocateMafiaTributeFromOwner(
      afterInvestorsPreview,
      mafiaOwedPreview
    )
    const cashToAdd = pendingTax ? Math.max(0, afterMafiaPreview - levy) : afterMafiaPreview

    const totalInvestorPayout =
      Object.values(scaledInvestorPayout).reduce((a, b) => a + b, 0)
    const totalInvestorOwed =
      Object.values(rawInvestorPayout).reduce((a, b) => a + b, 0)
    const investorsProRated = isPropertyRoll && totalInvestorOwed > 0 && totalInvestorPayout < totalInvestorOwed

    // Founderbots (host-driven, including Play Online) resolve locally then
    // commit_actor_state — the same path as their other card plays. Typed
    // income_complete looks the card up on the authority snapshot; if that hand
    // is empty/stale the action fails, the dialog reopens, and the bot rerolls forever.
    const incomeActorIsAi = isAiSeat(getPlayUiSnapshot().incomeDialogState.player)
    const incomeInstanceId = getPlayUiSnapshot().incomeDialogState.actionInstanceId
    if (isOnlineActor && !incomeActorIsAi) {
      if (!incomeInstanceId) return
      sendAction({
        type: 'income_complete',
        incomeInstanceId,
        earnedIncome,
        totalPropertyIncomeBase: totalInc,
        doubleIncomeInstanceId: effectiveDoubleIncomeId,
        incomeResolution,
      })
    } else {
      patchGameState((current) => {
      if (current.incomeResolvedThisTurn) return current
      const currentPlayer = current.players[current.currentPlayerIndex]
      if (!currentPlayer) return current
      const ownerIdResolved = currentPlayer.id
      const stillPendingTax = pendingIncomeTaxCount(current.pendingIncomeTaxPlayerIds, ownerIdResolved) > 0

      const { payoutByPlayerId } = isPropertyRoll
        ? computeInvestorIncomeAwardsForOwner(current.plots, ownerIdResolved)
        : { payoutByPlayerId: {} as Record<number, number> }
      const { scaled: scaledInner, ownerKeeps: afterInvestors } = allocateInvestorPayoutsFromOwner(
        earnedIncome,
        isPropertyRoll ? payoutByPlayerId : {}
      )
      const { recipientAmounts: mafiaOwed } =
        incomeResolution === 'property-roll'
          ? getMafiaLevyForIncomePlayer(ownerIdResolved, current.plots)
          : { recipientAmounts: {} as Record<number, number> }
      const { scaled: mafiaRecipientAmounts, ownerKeeps: afterMafia } = allocateMafiaTributeFromOwner(
        afterInvestors,
        mafiaOwed
      )
      const cashFromIncome = pendingTax ? Math.max(0, afterMafia - levy) : afterMafia
      const updatedMoney = currentPlayer.money + cashFromIncome

      let updatedActionCards = currentPlayer.actionCards.filter(
        c => c.instanceId !== getPlayUiSnapshot().incomeDialogState.actionInstanceId
      )

      if (effectiveDoubleIncomeId) {
        updatedActionCards = updatedActionCards.filter(
          c => c.instanceId !== effectiveDoubleIncomeId
        )
      }

      const incomeCardInstance = currentPlayer.actionCards.find(
        c => c.instanceId === getPlayUiSnapshot().incomeDialogState.actionInstanceId
      )

      const doubleIncomeCardInstance = effectiveDoubleIncomeId
        ? currentPlayer.actionCards.find(c => c.instanceId === effectiveDoubleIncomeId)
        : null

      const updatedPlayers = current.players.map((p, idx) => {
        if (idx === current.currentPlayerIndex) {
          return { ...p, money: updatedMoney, actionCards: updatedActionCards }
        }
        const investorPay = isPropertyRoll ? scaledInner[p.id] ?? 0 : 0
        const mafiaPay = mafiaRecipientAmounts[p.id] ?? 0
        const payout = investorPay + mafiaPay
        return payout > 0 ? { ...p, money: p.money + payout } : p
      })

      const actionDiscardPile = [...current.actionDiscard]

      if (incomeCardInstance) {
        actionDiscardPile.push(incomeCardInstance)
      }
      if (doubleIncomeCardInstance) {
        actionDiscardPile.push(doubleIncomeCardInstance)
      }

      const actionsPlayed = 1 + (effectiveDoubleIncomeId ? 1 : 0)
      const newActionsPlayedThisTurn = current.actionsPlayedThisTurn + actionsPlayed
      const newTurnActionsConsumed = (current.turnActionsConsumed ?? 0) + actionsPlayed

      const nextPendingTax = stillPendingTax
        ? consumeOnePendingIncomeTax(current.pendingIncomeTaxPlayerIds, ownerIdResolved)
        : (current.pendingIncomeTaxPlayerIds ?? [])

      const newState: GameState = {
        ...current,
        players: updatedPlayers,
        actionDiscard: actionDiscardPile,
        actionsPlayedThisTurn: newActionsPlayedThisTurn,
        turnActionsConsumed: newTurnActionsConsumed,
        incomeResolvedThisTurn: true,
        pendingIncomeTaxPlayerIds: nextPendingTax,
      }

      if (turnLimitReached(newTurnActionsConsumed)) {
        setTimeout(() => {
          getGameHandlers().handleEndTurn()
        }, 0)
      }

      return withReplenishedActionHand(newState, current.currentPlayerIndex)
    })
    }

    const levyNote = pendingTax && levy > 0 ? ` City tax −$${levy}M.` : ''
    const collectTitle = `${incomeOwnerPreview.name} collected income`
    const collectDetail =
      isPropertyRoll && dieFace != null
        ? `Rolled ${dieFace} — $${earnedIncome}M collected${cashToAdd !== earnedIncome ? ` · keeps $${cashToAdd}M after shares and levies` : ''}.${levyNote}`
        : incomeResolution === 'bank-income-card'
          ? `$${earnedIncome}M added to their treasury.${levyNote}`
          : `$${cashToAdd}M added to their treasury.${levyNote}`

    broadcastBoardFx({
      sound: 'income',
      notice: {
        title: collectTitle,
        detail: collectDetail,
        durationMs: CALAMITY_OUTCOME_BANNER_MS,
        replace: true,
      },
    })

    toast.success(
      pendingTax
        ? `Income collected: $${cashToAdd}M after city tax assessment${levy > 0 ? ` (−$${levy}M)` : ''}.`
        : isPropertyRoll && totalInvestorPayout > 0
          ? `You collected $${earnedIncome}M before investor shares; you keep $${cashToAdd}M.`
          : `Income collected: $${cashToAdd}M!`,
      { duration: CALAMITY_OUTCOME_BANNER_MS }
    )
    if (isPropertyRoll && totalInvestorPayout > 0) {
      const resolutionLabel =
        incomeResolution === 'property-roll' ? 'property income roll' : 'banked Income card'
      const description = investorIncomeAwards
        .filter((a) => (scaledInvestorPayout[a.investorId] ?? 0) > 0)
        .map((a) => {
          const invName =
            safeGameState.players.find((p) => p.id === a.investorId)?.name ?? `Player ${a.investorId}`
          const paid = scaledInvestorPayout[a.investorId] ?? 0
          const owed = rawInvestorPayout[a.investorId] ?? 0
          const parts = a.stripes.map((s) => `$${s.million}M on ${s.propertyLabel}`).join('; ')
          const shortfall = paid < owed ? ` (full share would be $${owed}M)` : ''
          return `${invName}: $${paid}M from ${incomeOwnerPreview.name}'s collection — ${parts}.${shortfall}`
        })
        .join('\n')
      const descWithProRata =
        investorsProRated && description
          ? `${description}\n\nProceeds were split pro-rata — the roll did not cover all amounts owed.`
          : description
      toast.info(
        `Investors paid from ${incomeOwnerPreview.name}'s income — ${resolutionLabel}`,
        { description: descWithProRata, duration: 9000 }
      )
    }
    const mafiaEntries = Object.entries(mafiaForToast).filter(([, amt]) => amt > 0)
    if (mafiaEntries.length > 0) {
      const detail = mafiaEntries
        .map(([recipientId, amount]) => {
          const nm = safeGameState.players.find((p) => p.id === Number(recipientId))?.name ?? `Player ${recipientId}`
          return `${nm}: $${amount}M`
        })
        .join(', ')
      toast.info(`Mafia tribute paid: ${detail}`)
    }
    } catch (err) {
      console.error('Income complete failed — closing dialog so play can continue:', err)
    } finally {
      resetIncomeDialog()
      incomeCompleteLockRef.current = false
    }
  }

export function incomeCancel(s: PlaySession)
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

    setIncomeDialogState({ ...closedIncomeDialog })
    toast.info('Income card not played')
  }
