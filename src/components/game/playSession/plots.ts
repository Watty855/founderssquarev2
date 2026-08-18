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
import { playAnchorDropSound, playCalamitySound, playConstructionSound } from '@/lib/soundEffects'
import { clearBoardNotice, dismissOpeningProTip, resetOverlayStore, showBoardNotice } from '@/lib/gameOverlayStore'
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
  confrontationNoticeDetail,
  hostileTakeoverAttemptTitle,
  hostileTakeoverAttackerSuccessTitle,
  hostileTakeoverDefenseSuccessTitle,
  investmentNoticeTitle,
  type ConfrontationKind,
} from '@/lib/confrontationNotice'
import { countResolvedActionStepsInBatch, initialGameState, isAiSeat, withReplenishedActionHand } from './helpers'
import type { PlaySession } from './types'
import { commitCalamityRoll } from './calamity'

export function plotSelect(s: PlaySession, row: number, col: string)
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

    const placement = getPlayUiSnapshot().placementMode
    if (!placement.active || !placement.propertyCardId) {
      return
    }

    const propertyCardId = placement.propertyCardId
    const plotPlacementMode = {
      housingHighDensity: placement.housingHighDensity,
      taxBuildActionInstanceId: placement.taxBuildActionInstanceId,
      wildCardEmulatePropertyId: placement.wildCardEmulatePropertyId,
    }

    if (isOnlineActor) {
      const current = safeGameState
      const currentPlayer = current.players[current.currentPlayerIndex]
      if (current.councilFreezeBlockBuildForPlayerId === currentPlayer.id) {
        toast.error('City Council Freeze is in effect — you cannot build properties this turn.')
        return
      }
      sendAction({
        type: 'build_at',
        row,
        col,
        propertyInstanceId: propertyCardId,
        ...plotPlacementMode,
      })
      setPlacementMode({
        active: false,
        propertyCardId: null,
        housingHighDensity: undefined,
        taxBuildActionInstanceId: undefined,
        wildCardEmulatePropertyId: undefined,
      })
      return
    }

    setGameState((current) => {
      const result = applyBuildAt(current, {
        row,
        col,
        propertyInstanceId: propertyCardId,
        ...plotPlacementMode,
      })
      if (!result.ok) {
        toast.error(result.error)
        // Clear placement on hard fails so AI/human turns cannot freeze in build-select.
        if (
          result.code === 'insufficient_funds' ||
          result.code === 'council_freeze' ||
          result.code === 'build_limit' ||
          result.code === 'turn_limit' ||
          result.code === 'missing_card'
        ) {
          setPlacementMode({
            active: false,
            propertyCardId: null,
            housingHighDensity: undefined,
            taxBuildActionInstanceId: undefined,
            wildCardEmulatePropertyId: undefined,
          })
        }
        return current
      }
      for (const ev of result.events) {
        if (ev.type === 'toast') {
          if (ev.level === 'success') toast.success(ev.message)
          else if (ev.level === 'error') toast.error(ev.message)
          else toast.info(ev.message)
        } else if (ev.type === 'build_celebration') {
          const isAnchor = ev.suffix.includes('anchored')
          showBoardNotice(
            `${isAnchor ? '⚓ ' : ''}${ev.lotName}${ev.suffix}`,
            ev.detail
          )
          if (isAnchor) playAnchorDropSound()
          else playConstructionSound()
        }
      }
      setPlacementMode({
        active: false,
        propertyCardId: null,
        housingHighDensity: undefined,
        taxBuildActionInstanceId: undefined,
        wildCardEmulatePropertyId: undefined,
      })
      if (result.state.endGameTriggered && !current.endGameTriggered) {
        const triggererName =
          current.players.find((p) => p.id === result.state.endGameTriggerPlayerId)?.name ?? 'A founder'
        setTimeout(() => {
          toast.success(
            `${triggererName} completed nine properties in a row or a city block — Final Round! Each founder gets one more turn.`
          )
        }, 600)
      }
      if (turnLimitReached(result.state.turnActionsConsumed)) {
        setTimeout(() => {
          getGameHandlers().handleEndTurn()
        }, 0)
      }
      return attachUndoSnapshotIfTurnAction(current, result.state)
    })
  }

export function cancelInvestmentSelect(s: PlaySession)
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

    setInvestmentSelectMode({ active: false, validPlots: [], actionInstanceId: null, contributionMillion: 4 })
    toast.info('Investment cancelled.')
  }

export function cancelDiscardPropertySelect(s: PlaySession)
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

    setDiscardPropertySelectMode({ active: false, actionInstanceId: null, selectedPropertyInstanceIds: [] })
    setDiscardPropertyConfirmOpen(false)
    toast.info('Discard Property Cards cancelled.')
  }

export function toggleDiscardPropertySelection(s: PlaySession, propertyInstanceId: string)
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

    setDiscardPropertySelectMode((prev) => {
      if (!prev.active) return prev
      const sel = prev.selectedPropertyInstanceIds
      const next = sel.includes(propertyInstanceId)
        ? sel.filter((id) => id !== propertyInstanceId)
        : [...sel, propertyInstanceId]
      return { ...prev, selectedPropertyInstanceIds: next }
    })
  }

export function confirmDiscardProperty(s: PlaySession, selectedPropertyInstanceIds?: string[],
    actionInstanceIdOverride?: string)
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

    const mode = getPlayUiSnapshot().discardPropertySelectMode
    const cpIdx = safeGameState.currentPlayerIndex
    const previewPlayer = safeGameState.players[cpIdx]
    const actionInstanceId =
      actionInstanceIdOverride ??
      (mode.active ? mode.actionInstanceId : null) ??
      previewPlayer.actionCards.find((a) => a.cardId === 'discard-property-cards')?.instanceId ??
      null
    if (!actionInstanceId) {
      toast.error('That action is no longer in your hand.')
      setDiscardPropertySelectMode({ active: false, actionInstanceId: null, selectedPropertyInstanceIds: [] })
      setDiscardPropertyConfirmOpen(false)
      return
    }

    const actionInstPreview = previewPlayer.actionCards.find((a) => a.instanceId === actionInstanceId)
    if (!actionInstPreview || actionInstPreview.cardId !== 'discard-property-cards') {
      toast.error('That action is no longer in your hand.')
      setDiscardPropertySelectMode({ active: false, actionInstanceId: null, selectedPropertyInstanceIds: [] })
      setDiscardPropertyConfirmOpen(false)
      return
    }

    const selectedIds = selectedPropertyInstanceIds ?? mode.selectedPropertyInstanceIds
    const handIds = new Set(previewPlayer.propertyCards.map((c) => c.instanceId))
    if (selectedIds.some((id) => !handIds.has(id))) {
      toast.error('Selection is out of date. Close the dialog and try again.')
      return
    }

    let applied = false
    let nOut = 0
    let drawnLen = 0
    patchGameState((current) => {
      const currentPlayer = current.players[current.currentPlayerIndex]
      const actionInst = currentPlayer.actionCards.find((a) => a.instanceId === actionInstanceId)
      if (!actionInst || actionInst.cardId !== 'discard-property-cards') {
        return current
      }
      const selectedSet = new Set(selectedIds)
      const toDiscard = currentPlayer.propertyCards.filter((c) => selectedSet.has(c.instanceId))
      if (toDiscard.length !== selectedSet.size) {
        return current
      }
      const n = toDiscard.length
      const { drawn, remaining: newPropertyDeck } = drawCards(current.propertyDeck, n)
      nOut = n
      drawnLen = drawn.length

      const discardIds = new Set(toDiscard.map((c) => c.instanceId))
      const remainingHand = currentPlayer.propertyCards.filter((c) => !discardIds.has(c.instanceId))
      const newPropertyDiscard = [...current.propertyDiscard, ...toDiscard]
      const newActionCards = currentPlayer.actionCards.filter((a) => a.instanceId !== actionInstanceId)
      const newActionsPlayed = current.actionsPlayedThisTurn + 1
      const newTurnConsumed = (current.turnActionsConsumed ?? 0) + 1

      const players = current.players.map((p, i) =>
        i === current.currentPlayerIndex
          ? {
              ...p,
              propertyCards: [...remainingHand, ...drawn],
              actionCards: newActionCards,
            }
          : p
      )

      applied = true
      const nextState: GameState = {
        ...current,
        players,
        propertyDeck: newPropertyDeck,
        propertyDiscard: newPropertyDiscard,
        actionDiscard: [...current.actionDiscard, actionInst],
        actionsPlayedThisTurn: newActionsPlayed,
        turnActionsConsumed: newTurnConsumed,
      }

      if (turnLimitReached(newTurnConsumed)) {
        scheduleEndOfTurn()
      }

      return withReplenishedActionHand(nextState, current.currentPlayerIndex)
    })

    if (applied) {
      setDiscardPropertySelectMode({ active: false, actionInstanceId: null, selectedPropertyInstanceIds: [] })
      setDiscardPropertyConfirmOpen(false)
      if (nOut === 0) {
        toast.success('Played Discard Property Cards — no properties discarded, action spent.')
      } else {
        toast.success(
          `Discarded ${nOut} propert${nOut === 1 ? 'y' : 'ies'} and drew ${drawnLen} replacement${drawnLen === 1 ? '' : 's'}.`
        )
      }
    } else {
      toast.error('Could not apply discard — try again or cancel.')
    }
  }

export function investmentPlotSelect(s: PlaySession, row: number, col: string)
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

    const sel = getPlayUiSnapshot().investmentSelectMode
    if (!sel.active || !sel.actionInstanceId) return
    const ok = sel.validPlots.some((p) => p.row === row && p.col === col)
    if (!ok) {
      toast.error('That lot is not a valid investment target.')
      return
    }
    const contribution = sel.contributionMillion
    const investorPreview = safeGameState.players[safeGameState.currentPlayerIndex]
    if (investorPreview.money < contribution) {
      // Clear select mode so the turn cannot freeze (common for Founderbot / mid-turn cash drain).
      setInvestmentSelectMode({
        active: false,
        validPlots: [],
        actionInstanceId: null,
        contributionMillion: 4,
      })
      toast.error(
        `Need $${contribution}M to complete this investment — cancelled. Continue your turn or End Turn.`
      )
      return
    }
    const plotPreview = getPlotAt(row, col)
    const ownerPreview =
      plotPreview?.claimedBy != null
        ? safeGameState.players.find((p) => p.id === plotPreview.claimedBy)
        : undefined
    // Board lot label (e.g. "Ski & See"), not the card category/type.
    const lotTitle = getPlotLotDisplayName(col, row, plotPreview?.building)
    patchGameState((current) => {
      const cpIdx = current.currentPlayerIndex
      const investor = current.players[cpIdx]
      const plotIndex = current.plots.findIndex((p) => p.row === row && p.col === col)
      if (plotIndex === -1) return current
      const plot = current.plots[plotIndex]
      const ownerId = plot.claimedBy
      if (ownerId === undefined || ownerId === investor.id || !plot.builtProperty) return current
      const ownerIdx = current.players.findIndex((p) => p.id === ownerId)
      if (ownerIdx === -1) return current
      if (investor.money < contribution) return current

      const stripe = { investorId: investor.id, contributionMillion: contribution }
      const prevStripes = plot.investmentStripes ?? []
      const newPlots = [...current.plots]
      newPlots[plotIndex] = { ...plot, investmentStripes: [...prevStripes, stripe] }

      const instId = sel.actionInstanceId
      const updatedActionCards = investor.actionCards.filter((c) => c.instanceId !== instId)
      const inst = investor.actionCards.find((c) => c.instanceId === instId)
      const actionDiscardPile = inst ? [...current.actionDiscard, inst] : current.actionDiscard

      const players = current.players.map((p, i) => {
        if (i === cpIdx) return { ...p, money: p.money - contribution, actionCards: updatedActionCards }
        if (i === ownerIdx) return { ...p, money: p.money + contribution }
        return p
      })

      const newActionsPlayed = current.actionsPlayedThisTurn + 1
      const newTurnActionsConsumed = (current.turnActionsConsumed ?? 0) + 1
      const newState: GameState = {
        ...current,
        players,
        plots: newPlots,
        actionDiscard: actionDiscardPile,
        actionsPlayedThisTurn: newActionsPlayed,
        turnActionsConsumed: newTurnActionsConsumed,
      }

      if (turnLimitReached(newTurnActionsConsumed)) {
        scheduleEndOfTurn()
      }

      return withReplenishedActionHand(newState, cpIdx)
    })
    setInvestmentSelectMode({ active: false, validPlots: [], actionInstanceId: null, contributionMillion: 4 })
    const investKind: ConfrontationKind = contribution >= 8 ? 'Double Investment' : 'Investment'
    const ownerName = ownerPreview?.name ?? 'the owner'
    // Instant resolve — investment wording (not "is attempting").
    broadcastBoardFx({
      notice: {
        title: investmentNoticeTitle(investorPreview.name, ownerName, lotTitle),
        detail: confrontationNoticeDetail(
          'success',
          `${investKind}: $${contribution}M paid to ${ownerName} at ${col}${row}.`
        ),
        durationMs: 5500,
      },
      sound: 'income',
    })
  }

export function cancelRemoveInvestorsSelect(s: PlaySession)
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

    setRemoveInvestorsSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    toast.info('Remove Investors cancelled.')
  }

export function removeInvestorsPlotSelect(s: PlaySession, row: number, col: string)
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

    const sel = getPlayUiSnapshot().removeInvestorsSelectMode
    if (!sel.active || !sel.actionInstanceId) return
    const ok = sel.validPlots.some((p) => p.row === row && p.col === col)
    if (!ok) {
      toast.error('Pick one of your own highlighted properties that has investors.')
      return
    }
    const plotPreview = getPlotAt(row, col)
    const ownerPreview = safeGameState.players[safeGameState.currentPlayerIndex]
    if (
      !plotPreview ||
      plotPreview.claimedBy !== ownerPreview.id ||
      !plotPreview.investmentStripes?.length
    ) {
      return
    }
    const buyoutPreview = totalRemoveInvestorsBuyoutMillion(plotPreview.investmentStripes)
    if (ownerPreview.money < buyoutPreview) {
      setRemoveInvestorsSelectMode({ active: false, validPlots: [], actionInstanceId: null })
      toast.error(
        `Need $${buyoutPreview}M for mandatory 50% buyouts on ${col}${row} — Remove Investors cancelled. Continue your turn or End Turn.`
      )
      return
    }
    patchGameState((current) => {
      const cpIdx = current.currentPlayerIndex
      const ownerId = current.players[cpIdx].id
      const plot = current.plots.find((p) => p.row === row && p.col === col)
      if (!plot || plot.claimedBy !== ownerId || !plot.investmentStripes?.length) return current

      const buyoutNeeded = totalRemoveInvestorsBuyoutMillion(plot.investmentStripes)
      const owner = current.players[cpIdx]
      if (owner.money < buyoutNeeded) {
        setRemoveInvestorsSelectMode({ active: false, validPlots: [], actionInstanceId: null })
        toast.error(
          `You need at least $${buyoutNeeded}M to cover mandatory 50% payouts to every investor on ${col}${row}.`
        )
        return current
      }

      const { bonus, labels } = getAnchorInfluenceForAction(
        ownerId,
        current.plots,
        'remove-investors',
        row,
        col
      )

      setRemoveInvestorsSelectMode({ active: false, validPlots: [], actionInstanceId: null })
      setRollDieDialogState({
        open: true,
        mode: 'remove-investors',
        actionInstanceId: sel.actionInstanceId,
        targetPlayerId: undefined,
        influenceBonus: bonus,
        influenceLabels: labels,
        councilFreezeAttackerRollsCompleted: undefined,
        councilFreezeAttackerLastNatural: undefined,
        councilFreezeFailAuto: undefined,
        diceRetryNonce: 0,
        takeoverContext: undefined,
        rezoningContext: undefined,
        scandalContext: undefined,
        removeInvestorsContext: { row, col },
      })
      if (bonus !== 0) {
        const prefix = bonus > 0 ? `+${bonus}` : `${bonus}`
        toast.info(`${prefix} on Remove Investors roll — ${labels.join(', ')}.`)
      }
      toast.info(`Roll total 5+ to remove all investors. On success, pay $${buyoutNeeded}M total in 50% buyouts. No investor counter-roll.`)

      return current
    })
    {
      const investorIds = [
        ...new Set((plotPreview.investmentStripes ?? []).map((s) => s.investorId)),
      ]
      const investorLabel =
        investorIds
          .map((id) => safeGameState.players.find((p) => p.id === id)?.name)
          .filter(Boolean)
          .join(', ') || 'investors'
      announceConfrontationAttempt(
        'Remove Investors',
        ownerPreview.name,
        investorLabel,
        `${ownerPreview.name} is rolling to clear investors from ${col}${row}.`
      )
    }
  }

export function actionCriteriaBank(s: PlaySession)
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

    const id = getPlayUiSnapshot().actionCriteriaDialog.actionInstanceId
    if (!id) return
    if (turnLimitReached(safeGameState.turnActionsConsumed)) {
      nudgeTurnAdvanceForSpentBudget()
      return
    }
    const banked = getPlayUiSnapshot().actionCriteriaDialog.bankValue
    patchGameState((current) => {
      const result = applyBankActionCards(current, [id])
      if (!result.ok) {
        toast.error(result.error)
        return current
      }
      if (turnLimitReached(result.state.turnActionsConsumed)) {
        scheduleEndOfTurn()
      }
      return result.state
    })
    setActionCriteriaDialog(createClosedActionCriteriaDialog())
    toast.success(`Banked the card for $${banked}M.`)
  }

export function cancelTakeoverSelect(s: PlaySession)
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

    setTakeoverSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    toast.info('Hostile Takeover cancelled.')
  }

export function cancelScandalSelect(s: PlaySession)
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

    setScandalSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    toast.info('Scandal cancelled.')
  }

export function cancelRezoning(s: PlaySession)
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

    setRezoningMode({ phase: 'inactive' })
    toast.info('Rezoning cancelled.')
  }

export function cancelPlacement(s: PlaySession)
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

    setPlacementMode({
      active: false,
      propertyCardId: null,
      housingHighDensity: undefined,
      taxBuildActionInstanceId: undefined,
      wildCardEmulatePropertyId: undefined,
    })
    toast.info('Build cancelled — your property card stays in hand.')
  }

export function abortTaxBuildPrompt(s: PlaySession)
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

    taxPromptResumeRef.current = null
    setTaxBuildPrompt({
      open: false,
      propertyInstanceId: null,
      actionInstanceId: null,
      housingHighDensity: undefined,
      wildCardEmulatePropertyId: undefined,
    })
    toast.info('Property build cancelled — your card stays in hand.')
  }

export function rezoningPropertyFromHand(s: PlaySession, propertyInstanceId: string)
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

    const m = getPlayUiSnapshot().rezoningMode
    if (m.phase !== 'pick-property') return
    const player = safeGameState.players[safeGameState.currentPlayerIndex]
    const inst = player.propertyCards.find((c) => c.instanceId === propertyInstanceId)
    if (!inst) return
    const card = propertyCards.find((c) => c.id === inst.cardId) as PropertyCard | undefined
    if (!card || card.type === 'anchor') {
      toast.error('Choose a standard property card (not an anchor).')
      return
    }
    if (isHousingPropertyCard(card)) {
      setRezoningMode({
        phase: 'pick-housing-density',
        actionInstanceId: m.actionInstanceId,
        propertyInstanceId,
      })
      toast.info('Choose standard or high-density housing, then pick a vacant lot on the board.')
      return
    }
    if (getVacantCityLotsForRezoning(safeGameState.plots).length === 0) {
      toast.error('No vacant city lots are available for rezoning.')
      return
    }
    setRezoningMode({
      phase: 'pick-plot',
      actionInstanceId: m.actionInstanceId,
      propertyInstanceId,
    })
    toast.info(`Rezoning: select a vacant lot for ${card.name}, then roll for approval.`)
  }

export function rezoningHousingDensity(s: PlaySession, highDensity: boolean)
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

    const m = getPlayUiSnapshot().rezoningMode
    if (m.phase !== 'pick-housing-density') return
    if (getVacantCityLotsForRezoning(safeGameState.plots).length === 0) {
      toast.error('No vacant city lots are available for rezoning.')
      return
    }
    setRezoningMode({
      phase: 'pick-plot',
      actionInstanceId: m.actionInstanceId,
      propertyInstanceId: m.propertyInstanceId,
      housingHighDensity: highDensity ? true : undefined,
    })
    toast.info('Select a vacant city lot for the rezoning attempt.')
  }

export function rezoningPlotSelect(s: PlaySession, row: number, col: string)
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

    const m = getPlayUiSnapshot().rezoningMode
    if (m.phase !== 'pick-plot') return
    const lots = getVacantCityLotsForRezoning(safeGameState.plots)
    if (!lots.some((p) => p.row === row && p.col === col)) {
      toast.error('That lot is not a valid vacant lot for rezoning.')
      return
    }
    const player = safeGameState.players[safeGameState.currentPlayerIndex]
    if (safeGameState.councilFreezeBlockBuildForPlayerId === player.id) {
      toast.error('City Council Freeze is in effect — you cannot complete a rezoning build this turn.')
      return
    }
    const inst = player.propertyCards.find((c) => c.instanceId === m.propertyInstanceId)
    if (!inst) return
    const card = propertyCards.find((c) => c.id === inst.cardId) as PropertyCard
    const highDensity = m.housingHighDensity === true && isHousingPropertyCard(card)
    const buildCost = getHousingBuildCost(card, highDensity)
    if (player.money < buildCost) {
      setRezoningMode({ phase: 'inactive' })
      toast.error(
        `Need $${buildCost}M to complete this build if the roll succeeds — Rezoning cancelled. Continue your turn or End Turn.`
      )
      return
    }
    const { bonus, labels } = getAnchorInfluenceForAction(
      player.id,
      safeGameState.plots,
      'rezoning',
      row,
      col
    )
    if (bonus !== 0) {
      const prefix = bonus > 0 ? `+${bonus}` : `${bonus}`
      toast.info(`${prefix} rezoning influence — ${labels.join(', ')}.`)
    }
    setRezoningMode({ phase: 'inactive' })
    setRollDieDialogState({
      open: true,
      mode: 'rezoning',
      actionInstanceId: m.actionInstanceId,
      influenceBonus: bonus,
      influenceLabels: labels,
      rezoningContext: {
        row,
        col,
        propertyInstanceId: m.propertyInstanceId,
        propertyCardId: card.id,
        buildCost,
        housingHighDensity: highDensity ? true : undefined,
      },
      targetPlayerId: undefined,
      councilFreezeAttackerRollsCompleted: undefined,
      councilFreezeAttackerLastNatural: undefined,
      councilFreezeFailAuto: undefined,
      diceRetryNonce: 0,
      takeoverContext: undefined,
      scandalContext: undefined,
      removeInvestorsContext: undefined,
    })
  }

export function takeoverPlotSelect(s: PlaySession, row: number, col: string)
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

    const sel = getPlayUiSnapshot().takeoverSelectMode
    if (!sel.active || !sel.actionInstanceId) return
    if (!sel.validPlots.some((p) => p.row === row && p.col === col)) {
      toast.error('That lot is not a valid Hostile Takeover target.')
      return
    }
    const plotPrev = safeGameState.plots.find((p) => p.row === row && p.col === col)
    const attackerPreview = safeGameState.players[safeGameState.currentPlayerIndex]
    if (
      !plotPrev?.builtProperty ||
      plotPrev.claimedBy === undefined ||
      plotPrev.claimedBy === attackerPreview.id
    ) {
      toast.error('Invalid takeover target.')
      return
    }
    const propertyCard = propertyCards.find((c) => c.id === plotPrev.builtProperty)
    if (!propertyCard) return
    const payment120 = Math.ceil(getPlotPropertyEndValue(plotPrev, propertyCard) * 1.2)
    const minCash = 1 + payment120
    if (attackerPreview.money < minCash) {
      setTakeoverSelectMode({ active: false, validPlots: [], actionInstanceId: null })
      toast.error(
        `Need $${minCash}M ($1M now + $${payment120}M if you win) for that lot — Hostile Takeover cancelled. Continue your turn or End Turn.`
      )
      return
    }
    const ownerPlayerId = plotPrev.claimedBy
    const ownerIdxPreview = safeGameState.players.findIndex((p) => p.id === ownerPlayerId)
    if (ownerIdxPreview === -1) return
    const ownerName =
      safeGameState.players.find((p) => p.id === ownerPlayerId)?.name ?? 'the property owner'
    const instId = sel.actionInstanceId

    patchGameState((current) => {
      const cpIdx = current.currentPlayerIndex
      const atk = current.players[cpIdx]
      const pi = current.plots.findIndex((p) => p.row === row && p.col === col)
      if (pi === -1) return current
      const plot = current.plots[pi]
      const oid = plot.claimedBy
      const oidx = oid != null ? current.players.findIndex((p) => p.id === oid) : -1
      if (oid === undefined || oid === atk.id || !plot.builtProperty || oidx === -1) return current
      const card = propertyCards.find((c) => c.id === plot.builtProperty)
      if (!card) return current
      const p120 = Math.ceil(getPlotPropertyEndValue(plot, card) * 1.2)
      if (atk.money < 1 + p120) return current
      const inst = atk.actionCards.find((a) => a.instanceId === instId)
      if (!inst) return current
      const updatedActionCards = atk.actionCards.filter((a) => a.instanceId !== instId)
      const actionDiscardPile = [...current.actionDiscard, inst]
      const newActionsPlayed = current.actionsPlayedThisTurn + 1
      const newTurnActionsConsumed = (current.turnActionsConsumed ?? 0) + 1
      const players = current.players.map((p, i) => {
        if (i === cpIdx) return { ...p, money: p.money - 1, actionCards: updatedActionCards }
        if (i === oidx) return { ...p, money: p.money + 1 }
        return p
      })
      const newState: GameState = {
        ...current,
        players,
        actionDiscard: actionDiscardPile,
        actionsPlayedThisTurn: newActionsPlayed,
        turnActionsConsumed: newTurnActionsConsumed,
      }
      if (turnLimitReached(newTurnActionsConsumed)) {
        scheduleEndOfTurn()
      }
      return withReplenishedActionHand(newState, cpIdx)
    })

    setTakeoverSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    const { bonus: takeoverBonus, labels: takeoverLabels } = getAnchorInfluenceForAction(
      attackerPreview.id,
      safeGameState.plots,
      'takeover',
      row,
      col
    )
    setRollDieDialogState({
      open: true,
      mode: 'hostile-takeover-attacker',
      actionInstanceId: instId,
      takeoverContext: { row, col, ownerPlayerId, payment120Million: payment120 },
      targetPlayerId: undefined,
      influenceBonus: takeoverBonus !== 0 ? takeoverBonus : undefined,
      influenceLabels: takeoverBonus !== 0 ? takeoverLabels : undefined,
      councilFreezeAttackerRollsCompleted: undefined,
      councilFreezeAttackerLastNatural: undefined,
      councilFreezeFailAuto: undefined,
      diceRetryNonce: 0,
      rezoningContext: undefined,
      scandalContext: undefined,
    })
    announceConfrontationAttempt(
      'Hostile Takeover',
      attackerPreview.name,
      ownerName,
      `${attackerPreview.name} paid $1M and is rolling to seize ${col}${row}.`,
      'boo',
      hostileTakeoverAttemptTitle(attackerPreview.name, ownerName, propertyCard.name)
    )
    if (takeoverBonus !== 0) {
      const prefix = takeoverBonus > 0 ? `+${takeoverBonus}` : `${takeoverBonus}`
      toast.info(`${prefix} takeover influence — ${takeoverLabels.join(', ')}.`)
    }
    toast.success(
      `You paid $1M to ${ownerName}. The die must be rolled in the dialog — 5–6 is a Successful Take Over; 1–4 is Unsuccessful.`
    )
  }

export function scandalPlotSelect(s: PlaySession, row: number, col: string)
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

    const sel = getPlayUiSnapshot().scandalSelectMode
    if (!sel.active || !sel.actionInstanceId) return
    if (!sel.validPlots.some((p) => p.row === row && p.col === col)) {
      toast.error('That lot is not a valid Scandal target.')
      return
    }
    const plotPrev = safeGameState.plots.find((p) => p.row === row && p.col === col)
    const attackerPreview = safeGameState.players[safeGameState.currentPlayerIndex]
    if (!plotPrev?.builtProperty || plotPrev.claimedBy === undefined) {
      toast.error('Invalid scandal target.')
      return
    }
    const anchorCard = propertyCards.find((c) => c.id === plotPrev.builtProperty) as PropertyCard | undefined
    if (!anchorCard || anchorCard.type !== 'anchor') {
      toast.error('Scandal can only target a built anchor tenant.')
      return
    }
    if (plotPrev.anchorInfluenceSuppressed) {
      toast.error('That Anchor Tenet is no longer active.')
      return
    }
    const ownerPlayerId = plotPrev.claimedBy
    const { bonus: scandalRollBonus, labels: scandalRollLabels } = getScandalAttackerRollBonuses(
      attackerPreview.id,
      safeGameState.plots
    )
    const instId = sel.actionInstanceId
    setScandalSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    setRollDieDialogState({
      open: true,
      mode: 'scandal-attacker',
      actionInstanceId: instId,
      influenceBonus: scandalRollBonus > 0 ? scandalRollBonus : undefined,
      influenceLabels: scandalRollBonus > 0 ? scandalRollLabels : undefined,
      scandalContext: {
        row,
        col,
        anchorOwnerPlayerId: ownerPlayerId,
        anchorCardId: plotPrev.builtProperty,
      },
      targetPlayerId: undefined,
      councilFreezeAttackerRollsCompleted: undefined,
      councilFreezeAttackerLastNatural: undefined,
      councilFreezeFailAuto: undefined,
      diceRetryNonce: 0,
      takeoverContext: undefined,
      rezoningContext: undefined,
    })
    {
      const ownerName =
        safeGameState.players.find((p) => p.id === ownerPlayerId)?.name ?? 'the anchor owner'
      announceConfrontationAttempt(
        'Scandal',
        attackerPreview.name,
        ownerName,
        `${attackerPreview.name} is targeting ${ownerName}'s anchor at ${col}${row}.`
      )
    }
    if (scandalRollBonus > 0) {
      toast.success(`+${scandalRollBonus} on your scandal roll from ${scandalRollLabels.join(' & ')}.`)
    }
    toast.info(
      'Roll in the dialog — you need 6+ after scandal bonuses (Influencer / News Outlet). The anchor owner may then roll 6 to negate.'
    )
  }

export function plotClaim(s: PlaySession, row: number, col: string)
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

    if (getPlayUiSnapshot().rezoningMode.phase === 'pick-plot') {
      rezoningPlotSelect(s, row, col)
      return
    }
    if (getPlayUiSnapshot().scandalSelectMode.active) {
      scandalPlotSelect(s, row, col)
      return
    }
    if (getPlayUiSnapshot().takeoverSelectMode.active) {
      takeoverPlotSelect(s, row, col)
      return
    }
    if (getPlayUiSnapshot().removeInvestorsSelectMode.active) {
      removeInvestorsPlotSelect(s, row, col)
      return
    }
    if (getPlayUiSnapshot().investmentSelectMode.active) {
      investmentPlotSelect(s, row, col)
      return
    }
    if (getPlayUiSnapshot().discardPropertySelectMode.active) {
      toast.error('Finish or cancel Discard Property Cards before using the board.')
      return
    }
    if (getPlayUiSnapshot().placementMode.active) {
      plotSelect(s, row, col)
      return
    }

    return
  }
