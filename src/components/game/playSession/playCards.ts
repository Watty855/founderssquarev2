'use client'

import type { PlayCardsOptions } from '@/components/game/PlayerHand'
import { getGameHandlers } from '@/lib/gameHandlerBag'
import { propertyCards, actionCards } from '@/lib/cardData'
import type { PropertyCard, CardInstance } from '@/lib/cardTypes'
import { applyBuildAt } from '@/lib/gameEngine/applyBuildAt'
import { applyEndTurn } from '@/lib/gameEngine/applyEndTurn'
import { applyBankActionCards } from '@/lib/gameEngine/applyBankAction'
import { applyIncomeComplete } from '@/lib/gameEngine/applyIncomeComplete'
import {
  appendIncomeTaxAssessments,
  propertyTaxLevyMillion,
} from '@/lib/cityTax'
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
  getParkIncomeBonusForPlayer,
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
import { isActionWildCard, isValidActionWildEmulateId, resolveActionPlayId } from '@/lib/actionWildCard'
import { countResolvedActionStepsInBatch, initialGameState, isAiSeat, withReplenishedActionHand } from './helpers'
import type { PlaySession } from './types'
import { commitCalamityRoll } from './calamity'

export function playCards(s: PlaySession, propertyInstanceId: string | null,
    actionInstanceIds: string[],
    convertToCashInstanceIds: string[],
    options?: PlayCardsOptions)
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

    if (safeGameState.awaitingEndTurnActionDiscard || getPlayUiSnapshot().discardDialogState.open) {
      toast.info(
        `Discard down to ${MAX_ACTION_HAND_SIZE} action cards to finish ending your turn.`
      )
      return
    }
    if (safeGameState.pendingCalamity) {
      toast.info('Finish the city-wide Calamity rolls before playing.')
      return
    }
    if (propertyInstanceId) {
      if (getPlayUiSnapshot().rezoningMode.phase !== 'inactive') {
        toast.error('Finish or cancel Rezoning before building from your hand.')
        return
      }
      if (getPlayUiSnapshot().takeoverSelectMode.active) {
        toast.error('Finish or cancel Hostile Takeover selection before building.')
        return
      }
      if (getPlayUiSnapshot().scandalSelectMode.active) {
        toast.error('Finish or cancel Scandal target selection before building.')
        return
      }
      if (getPlayUiSnapshot().investmentSelectMode.active) {
        toast.error('Finish or cancel investment selection before building.')
        return
      }
      if (getPlayUiSnapshot().discardPropertySelectMode.active) {
        toast.error('Finish or cancel Discard Property Cards before building.')
        return
      }
      if (getPlayUiSnapshot().removeInvestorsSelectMode.active) {
        toast.error('Finish or cancel Remove Investors — pick your property with investors first.')
        return
      }
      const actingPlayer = safeGameState.players[safeGameState.currentPlayerIndex]
      if (safeGameState.councilFreezeBlockBuildForPlayerId === actingPlayer.id) {
        toast.error('City Council Freeze is in effect — you cannot build properties this turn.')
        return
      }
      if (safeGameState.propertiesBuiltThisTurn >= 1) {
        toast.error('You can only build one property per turn!')
        return
      }
      if (turnLimitReached(safeGameState.turnActionsConsumed)) {
        nudgeTurnAdvanceForSpentBudget()
        return
      }

      const instance = safeGameState.players[safeGameState.currentPlayerIndex].propertyCards.find(
        (c) => c.instanceId === propertyInstanceId
      )
      if (!instance) return

      const card = propertyCards.find((c) => c.id === instance.cardId) as PropertyCard | undefined
      if (!card) return

      const isWild = card.id === 'anchor-wild-card'
      const isCivicFlex = isCivicFlexHandCard(card)
      const needsEmulate = needsEmulateChoiceBeforePlacement(card)
      const emulateFromOptions = options?.wildCardEmulatePropertyId
      const taxBuildActionDefault =
        actingPlayer.actionCards.find((a) => {
          const ac = actionCards.find((c) => c.id === a.cardId)
          return ac?.id === 'build-with-tax-dollars'
        })?.instanceId

      if (getPlayUiSnapshot().placementMode.active && getPlayUiSnapshot().placementMode.propertyCardId === propertyInstanceId) {
        const opt = options ?? {}
        const hasStructuralPatch =
          opt.housingHighDensity !== undefined ||
          opt.wildCardEmulatePropertyId !== undefined ||
          opt.useTaxBuild !== undefined ||
          opt.taxBuildActionInstanceId !== undefined

        if (!hasStructuralPatch) return

        const emulateMerged =
          emulateFromOptions !== undefined ? emulateFromOptions : getPlayUiSnapshot().placementMode.wildCardEmulatePropertyId

        if (needsEmulate) {
          const placementTemplateMerged = resolvePropertyPlacementTemplate(card, emulateMerged)
          if (!emulateMerged || !placementTemplateMerged) {
            toast.error(
              isWild
                ? 'Choose which anchor your Anchor Wild Card will become.'
                : 'Choose a vacant civic (C) lot for this Civic card.'
            )
            return
          }
        }
        const placementTemplateMerged = resolvePropertyPlacementTemplate(card, emulateMerged) ?? card

        let nextHd = getPlayUiSnapshot().placementMode.housingHighDensity
        if (opt.housingHighDensity === true) nextHd = true
        else if (opt.housingHighDensity === false) nextHd = undefined

        let nextTaxInstanceId = getPlayUiSnapshot().placementMode.taxBuildActionInstanceId
        if (opt.useTaxBuild === true) {
          nextTaxInstanceId = opt.taxBuildActionInstanceId ?? taxBuildActionDefault
        } else if (opt.useTaxBuild === false) {
          nextTaxInstanceId = undefined
        }

        if (needsEmulate || placementTemplateMerged) {
          const validPlotsMerge = getValidPlotsForProperty(
            placementTemplateMerged,
            safeGameState.plots,
            safeGameState.crossingTheLineActive
          )
          if (validPlotsMerge.length === 0) {
            toast.error(
              needsEmulate
                ? `No valid locations to build as ${placementTemplateMerged.name}!`
                : `No valid locations to build ${card.name}!`
            )
            setPlacementMode({
              active: false,
              propertyCardId: null,
              housingHighDensity: undefined,
              taxBuildActionInstanceId: undefined,
              wildCardEmulatePropertyId: undefined,
            })
            return
          }
        }

        setPlacementMode({
          active: true,
          propertyCardId: propertyInstanceId,
          housingHighDensity: nextHd,
          taxBuildActionInstanceId: nextTaxInstanceId,
          wildCardEmulatePropertyId: needsEmulate ? emulateMerged : undefined,
        })
        return
      }

      const emulateId = emulateFromOptions
      if (needsEmulate) {
        const placementCheck = resolvePropertyPlacementTemplate(card, emulateId)
        if (!emulateId || !placementCheck) {
          toast.error(
            isWild
              ? 'Choose which anchor your Anchor Wild Card will become.'
              : 'Choose a vacant civic (C) lot for this Civic card.'
          )
          return
        }
      }
      const placementTemplate = resolvePropertyPlacementTemplate(card, emulateId) ?? card

      const taxBuildActionInstanceId = options?.taxBuildActionInstanceId ?? taxBuildActionDefault

      if (!options?.skipTaxBuildPrompt && !options?.useTaxBuild && taxBuildActionInstanceId) {
        taxPromptResumeRef.current = {
          propertyInstanceId,
          housingHighDensity: options?.housingHighDensity === true ? true : undefined,
          wildCardEmulatePropertyId: needsEmulate ? emulateId : undefined,
          taxActionInstanceId: taxBuildActionInstanceId,
        }
        setTaxBuildPrompt({
          open: true,
          propertyInstanceId,
          housingHighDensity: options?.housingHighDensity === true ? true : undefined,
          actionInstanceId: taxBuildActionInstanceId,
          wildCardEmulatePropertyId: needsEmulate ? emulateId : undefined,
        })
        return
      }

      const validPlots = getValidPlotsForProperty(
        placementTemplate!,
        safeGameState.plots,
        safeGameState.crossingTheLineActive
      )
      if (validPlots.length === 0) {
        toast.error(
          needsEmulate
            ? `No valid locations to build as ${placementTemplate.name}!`
            : `No valid locations to build ${card.name}!`
        )
        return
      }
      const highDensity = card.name === 'Housing' && options?.housingHighDensity === true
      setPlacementMode({
        active: true,
        propertyCardId: propertyInstanceId,
        housingHighDensity: highDensity ? true : undefined,
        taxBuildActionInstanceId: options?.useTaxBuild ? taxBuildActionInstanceId : undefined,
        wildCardEmulatePropertyId: needsEmulate ? emulateId : undefined,
      })
      if (getPlayUiSnapshot().taxBuildMode.phase === 'pick-property') {
        setTaxBuildMode({ phase: 'inactive' })
      }
      const quiet = options?.suppressPlacementToast === true
      if (!quiet) {
        if (highDensity) {
          toast.info(
            options?.useTaxBuild
              ? 'Build with Tax Dollars active (50% cost): select a lot for high-density housing.'
              : `High-density housing ($${HIGH_DENSITY_HOUSING_STATS.buildCost}M): select a lot. After build, the lot shows your color with a neon outline.`
          )
        } else {
          const placeName = needsEmulate ? placementTemplate.name : card.name
          const buildCostLabel = `$${(needsEmulate ? placementTemplate : card).buildCost}M`
          toast.info(
            options?.useTaxBuild
              ? `Build with Tax Dollars active (50% cost): select a lot to build ${placeName}.`
              : needsEmulate
                ? `Select a plot to build ${isCivicFlex ? 'Civic' : 'your Anchor Wild Card'} as ${placeName} (${buildCostLabel}).`
                : `Click a highlighted lot on the board to build ${placeName}.`
          )
        }
      }
      return
    }

    if (getPlayUiSnapshot().takeoverSelectMode.active) {
      if (actionInstanceIds.length > 0 || convertToCashInstanceIds.length > 0) {
        toast.error('Finish or cancel Hostile Takeover selection first.')
        return
      }
    }
    if (getPlayUiSnapshot().scandalSelectMode.active) {
      if (actionInstanceIds.length > 0 || convertToCashInstanceIds.length > 0) {
        toast.error('Finish or cancel Scandal target selection first.')
        return
      }
    }
    if (getPlayUiSnapshot().investmentSelectMode.active) {
      if (actionInstanceIds.length > 0 || convertToCashInstanceIds.length > 0) {
        toast.error('Finish or cancel investment selection first.')
        return
      }
    }
    if (getPlayUiSnapshot().discardPropertySelectMode.active) {
      if (actionInstanceIds.length > 0 || convertToCashInstanceIds.length > 0) {
        toast.error('Finish or cancel Discard Property Cards first.')
        return
      }
    }
    if (getPlayUiSnapshot().removeInvestorsSelectMode.active) {
      if (actionInstanceIds.length > 0 || convertToCashInstanceIds.length > 0) {
        toast.error('Finish or cancel Remove Investors property pick first.')
        return
      }
    }
    if (getPlayUiSnapshot().taxBuildMode.phase !== 'inactive') {
      if (actionInstanceIds.length > 0 || convertToCashInstanceIds.length > 0) {
        toast.error('Finish or cancel Build with Tax Dollars selection first.')
        return
      }
    }
    if (getPlayUiSnapshot().rezoningMode.phase !== 'inactive') {
      if (actionInstanceIds.length > 0 || convertToCashInstanceIds.length > 0) {
        toast.error('Finish or cancel Rezoning before playing or banking other cards.')
        return
      }
    }

    const cpIdx = safeGameState.currentPlayerIndex
    const emulateActionId = options?.wildCardEmulateActionId
    const playedIdOf = (inst: { cardId: string } | undefined | null): string | undefined =>
      inst ? resolveActionPlayId(inst.cardId, emulateActionId) : undefined

    const wildInPlay = actionInstanceIds.filter((id) => {
      const inst = safeGameState.players[cpIdx].actionCards.find((c) => c.instanceId === id)
      return inst != null && isActionWildCard(inst.cardId)
    })
    if (wildInPlay.length > 0) {
      if (wildInPlay.length > 1 || actionInstanceIds.length > 1 || convertToCashInstanceIds.length > 0 || propertyInstanceId) {
        toast.error('Play the Action Wild Card by itself — choose which action it copies.')
        return
      }
      if (!isValidActionWildEmulateId(emulateActionId)) {
        toast.error('Choose which action the Action Wild Card copies.')
        return
      }
    }

    const hasCouncilFreeze = actionInstanceIds.some((id) => {
      const inst = safeGameState.players[cpIdx].actionCards.find((c) => c.instanceId === id)
      if (!inst) return false
      return playedIdOf(inst) === 'city-council-freeze'
    })
    if (hasCouncilFreeze && actionInstanceIds.length > 1) {
      toast.error('Play City Council Freeze by itself.')
      return
    }

    const hasScandal = actionInstanceIds.some((id) => {
      const inst = safeGameState.players[cpIdx].actionCards.find((c) => c.instanceId === id)
      return playedIdOf(inst) === 'scandal'
    })
    if (hasScandal && (actionInstanceIds.length > 1 || convertToCashInstanceIds.length > 0)) {
      toast.error('Play Scandal by itself (no other actions or bank steps in the same play).')
      return
    }
    if (hasScandal && propertyInstanceId) {
      toast.error('Play Scandal by itself — finish or cancel any property build first.')
      return
    }

    const hasIncome = actionInstanceIds.some((id) => {
      const inst = safeGameState.players[cpIdx].actionCards.find((c) => c.instanceId === id)
      return playedIdOf(inst) === 'income'
    })
    if (hasIncome && safeGameState.incomeResolvedThisTurn) {
      toast.error('You already resolved Income this turn — only one Income resolution per turn.')
      return
    }
    // Founderbots must not open Income (host dialog / bank-cancel) until they own a built lot.
    // Humans may still bank the card with zero properties. Online host drives bots locally,
    // so this guard is required even when the AI chooser already skipped.
    const actingForIncome = safeGameState.players[cpIdx]
    if (
      hasIncome &&
      actingForIncome?.isAi === true &&
      !playerHasBuiltIncomeProperty(safeGameState.plots, actingForIncome.id)
    ) {
      return
    }

    const hasDoubleIncomeInPlay = actionInstanceIds.some((id) => {
      const inst = safeGameState.players[cpIdx].actionCards.find((c) => c.instanceId === id)
      return inst?.cardId === 'double-income'
    })
    if (hasDoubleIncomeInPlay && !hasIncome) {
      const onlyDoubleIncomeAlone =
        actionInstanceIds.length === 1 && convertToCashInstanceIds.length === 0 && !propertyInstanceId
      if (!onlyDoubleIncomeAlone) {
        toast.error(
          'Double Income doubles a payout only when played together with an Income card in the same play. To bank Double Income by itself (for its printed cash value), play only that card—you will be asked to confirm.'
        )
        return
      }
      if (turnLimitReached(safeGameState.turnActionsConsumed)) {
        nudgeTurnAdvanceForSpentBudget()
        return
      }
      setDoubleIncomeOrphanDialog({ open: true, instanceId: actionInstanceIds[0] ?? null })
      return
    }

    if (hasIncome && hasDoubleIncomeInPlay) {
      if ((safeGameState.turnActionsConsumed ?? 0) + 2 > MAX_TURN_ACTIONS) {
        toast.error(
          `Income with Double Income uses two actions. You only have room for one more action this turn — drop Double Income from this play or wait until next turn.`
        )
        return
      }
    }

    const hasDiscardProperty = actionInstanceIds.some((id) => {
      const inst = safeGameState.players[cpIdx].actionCards.find((c) => c.instanceId === id)
      return playedIdOf(inst) === 'discard-property-cards'
    })
    if (
      hasDiscardProperty &&
      (actionInstanceIds.length > 1 || convertToCashInstanceIds.length > 0 || propertyInstanceId)
    ) {
      toast.error('Play Discard Property Cards by itself.')
      return
    }

    let resolvedCouncilFreezeTargetId = options?.councilFreezeTargetId
    if (hasCouncilFreeze) {
      const actingForFreeze = safeGameState.players[cpIdx]
      // Founderbots never wait on a human target picker — auto-pick the strongest threat.
      if (resolvedCouncilFreezeTargetId == null && actingForFreeze.isAi === true) {
        const rivals = safeGameState.players.filter((p) => p.id !== actingForFreeze.id)
        const threat = [...rivals].sort((a, b) => {
          const score = (id: number) =>
            safeGameState.plots.filter((pl) => pl.claimedBy === id && pl.builtProperty).length
          return score(b.id) - score(a.id)
        })[0]
        resolvedCouncilFreezeTargetId = threat?.id
      }
      if (resolvedCouncilFreezeTargetId == null) {
        const freezeInst = actionInstanceIds[0]
        const freezeCard = actionCards.find((c) => c.id === 'city-council-freeze')
        if (freezeInst && freezeCard) {
          setActionCriteriaDialog({
            open: true,
            actionInstanceId: freezeInst,
            bankValue: freezeCard.bankValue,
            cardName: freezeCard.name,
            reasonDescription:
              'Choose a target player for City Council Freeze, or bank this card and continue your turn.',
          })
        } else {
          toast.error('Choose a target player for City Council Freeze.')
        }
        return
      }
      if (resolvedCouncilFreezeTargetId === actingForFreeze.id) {
        toast.error('You cannot target yourself with City Council Freeze.')
        return
      }
    }

    const actionDefsInPlay = actionInstanceIds
      .map((id) => {
        const inst = safeGameState.players[cpIdx].actionCards.find((a) => a.instanceId === id)
        return inst ? actionCards.find((c) => c.id === playedIdOf(inst)) : undefined
      })
      .filter((c): c is NonNullable<typeof c> => c != null)

    if (
      actionDefsInPlay.some((c) => c.id === 'scandal') &&
      !boardHasBuiltAnchorTenant(safeGameState.plots) &&
      actionInstanceIds.length > 1
    ) {
      toast.error(
        'No anchor tenant on the board. Play Scandal by itself so you can bank it or cancel — do not combine it with other actions in one play.'
      )
      return
    }
    if (
      actionDefsInPlay.some((c) => c.id === 'police-raid-on-mafia') &&
      !boardHasBuiltMafia(safeGameState.plots) &&
      actionInstanceIds.length > 1
    ) {
      toast.error(
        'No Mafia on the board. Play Police Raid on Mafia by itself so you can bank it or cancel — do not combine it with other actions in one play.'
      )
      return
    }

    /** Open freeze dice outside setGameState — nesting setRollDieDialogState inside setGameState + returning `current` dropped updates and blocked the flow. */
    if (
      actionInstanceIds.length === 1 &&
      convertToCashInstanceIds.length === 0 &&
      !propertyInstanceId &&
      hasCouncilFreeze &&
      resolvedCouncilFreezeTargetId != null
    ) {
      const instanceId = actionInstanceIds[0]
      const inst = safeGameState.players[cpIdx].actionCards.find((a) => a.instanceId === instanceId)
      if (playedIdOf(inst) === 'city-council-freeze') {
        if (turnLimitReached(safeGameState.turnActionsConsumed)) {
          nudgeTurnAdvanceForSpentBudget()
          return
        }
        const freezeTarget = resolvedCouncilFreezeTargetId
        const acting = safeGameState.players[cpIdx]
        const { bonus, ownedCivicLabels } = getCityCouncilFreezeAttackerInfluence(acting.id, safeGameState.plots)
        if (bonus > 0) {
          toast.success(
            `+${bonus} influence on your roll — alignment with ${ownedCivicLabels.join(' & ')} (built civic lot).`
          )
        }
        setRollDieDialogState({
          open: true,
          mode: 'council-freeze-attacker',
          actionInstanceId: instanceId,
          targetPlayerId: freezeTarget,
          influenceBonus: bonus,
          influenceLabels: ownedCivicLabels,
          councilFreezeAttackerRollsCompleted: 0,
          councilFreezeAttackerLastNatural: undefined,
          councilFreezeFailAuto: false,
          diceRetryNonce: 0,
          takeoverContext: undefined,
          rezoningContext: undefined,
          scandalContext: undefined,
          removeInvestorsContext: undefined,
        })
        {
          const targetName =
            safeGameState.players.find((p) => p.id === freezeTarget)?.name ?? 'a rival founder'
          announceConfrontationAttempt(
            'City Council Freeze',
            acting.name,
            targetName,
            `${acting.name} is rolling to freeze ${targetName}'s builds.`
          )
        }
        return
      }
    }

    if (
      actionInstanceIds.length === 1 &&
      !propertyInstanceId &&
      convertToCashInstanceIds.length === 0
    ) {
      const inst0 = safeGameState.players[cpIdx].actionCards.find((a) => a.instanceId === actionInstanceIds[0])
      const ac = inst0 ? actionCards.find((c) => c.id === playedIdOf(inst0)) : undefined
      if (ac?.id === 'investment' || ac?.id === 'double-investment') {
        setPlacementMode({
          active: false,
          propertyCardId: null,
          housingHighDensity: undefined,
          wildCardEmulatePropertyId: undefined,
        })
        const contributionMillion =
          typeof ac.buildCost === 'number' ? ac.buildCost : ac.id === 'double-investment' ? 8 : 4
        if (safeGameState.players[cpIdx].money < contributionMillion) {
          // Bank / skip — do not hard-stop (AI and humans must be able to continue the turn).
          setActionCriteriaDialog({
            open: true,
            actionInstanceId: actionInstanceIds[0],
            bankValue: ac.bankValue,
            cardName: ac.name,
            reasonDescription: `You need $${contributionMillion}M cash to play ${ac.name}. Bank this card or continue your turn with another action.`,
          })
          return
        }
        const validPlots = getInvestablePlots(safeGameState.plots, safeGameState.players[cpIdx].id)
        if (validPlots.length === 0) {
          setActionCriteriaDialog({
            open: true,
            actionInstanceId: actionInstanceIds[0],
            bankValue: ac.bankValue,
            cardName: ac.name,
            reasonDescription:
              'Investment needs an opponent-built lot in the same city block as one of your built properties, or orthogonally adjacent (including across a street). No valid targets right now.',
          })
          return
        }
        if (turnLimitReached(safeGameState.turnActionsConsumed)) {
          nudgeTurnAdvanceForSpentBudget()
          return
        }
        setInvestmentSelectMode({
          active: true,
          validPlots,
          actionInstanceId: actionInstanceIds[0],
          contributionMillion,
        })
        toast.info(
          `Select an opponent's built property to invest ($${contributionMillion}M to the owner). Highlighted lots are valid.`
        )
        return
      }
      if (ac?.id === 'hostile-takeover') {
        setPlacementMode({
          active: false,
          propertyCardId: null,
          housingHighDensity: undefined,
          wildCardEmulatePropertyId: undefined,
        })
        const attacker = safeGameState.players[cpIdx]
        const allTakeoverPlots = getTakeoverTargetPlots(safeGameState.plots, attacker.id)
        // Only lots this founder can fund ($1M attempt + 120% buyout if they win).
        const validTakeoverPlots = allTakeoverPlots.filter((tp) => {
          const defCard = tp.builtProperty
            ? (propertyCards.find((c) => c.id === tp.builtProperty) as PropertyCard | undefined)
            : undefined
          if (!defCard) return false
          const cashNeeded = 1 + Math.ceil(getPlotPropertyEndValue(tp, defCard) * 1.2)
          return attacker.money >= cashNeeded
        })
        if (allTakeoverPlots.length === 0) {
          setActionCriteriaDialog({
            open: true,
            actionInstanceId: actionInstanceIds[0],
            bankValue: ac.bankValue,
            cardName: ac.name,
            reasonDescription:
              'Hostile Takeover needs an opponent-built lot in the same city block as one of your built properties, or orthogonally adjacent (including across a street). No valid targets right now.',
          })
          return
        }
        if (validTakeoverPlots.length === 0) {
          // Do not hard-stop the turn — bank / skip so AI and humans can continue.
          let minCashNeeded = Number.POSITIVE_INFINITY
          for (const tp of allTakeoverPlots) {
            const defCard = tp.builtProperty
              ? (propertyCards.find((c) => c.id === tp.builtProperty) as PropertyCard | undefined)
              : undefined
            if (!defCard) continue
            minCashNeeded = Math.min(
              minCashNeeded,
              1 + Math.ceil(getPlotPropertyEndValue(tp, defCard) * 1.2)
            )
          }
          const needLabel = Number.isFinite(minCashNeeded) ? minCashNeeded : 16
          setActionCriteriaDialog({
            open: true,
            actionInstanceId: actionInstanceIds[0],
            bankValue: ac.bankValue,
            cardName: ac.name,
            reasonDescription: `You need at least $${needLabel}M cash ($1M attempt plus up to 120% of a target lot's end value) to play Hostile Takeover. Bank this card or continue your turn with another action.`,
          })
          return
        }
        if (turnLimitReached(safeGameState.turnActionsConsumed)) {
          nudgeTurnAdvanceForSpentBudget()
          return
        }
        setTakeoverSelectMode({
          active: true,
          validPlots: validTakeoverPlots,
          actionInstanceId: actionInstanceIds[0],
        })
        toast.info(
          `Hostile Takeover: select a highlighted opponent property (same city block or orthogonal to your built lots, including across a street). You will pay $1M to roll; if you win the roll sequence you pay 120% of end value and take the lot.`
        )
        return
      }
      if (ac?.id === 'scandal') {
        setPlacementMode({
          active: false,
          propertyCardId: null,
          housingHighDensity: undefined,
          wildCardEmulatePropertyId: undefined,
        })
        if (!boardHasBuiltAnchorTenant(safeGameState.plots)) {
          setActionCriteriaDialog({
            open: true,
            actionInstanceId: actionInstanceIds[0],
            bankValue: ac.bankValue,
            cardName: ac.name,
            reasonDescription:
              'Scandal requires at least one anchor tenant on the board (a built anchor lot). There is none right now.',
          })
          return
        }
        const scandalTargets = getPlotsEligibleForScandal(safeGameState.plots)
        if (scandalTargets.length === 0) {
          setActionCriteriaDialog({
            open: true,
            actionInstanceId: actionInstanceIds[0],
            bankValue: ac.bankValue,
            cardName: ac.name,
            reasonDescription:
              'No active Anchor Tenets on the board to scandal. Bank Scandal or try again later.',
          })
          return
        }
        if (turnLimitReached(safeGameState.turnActionsConsumed)) {
          nudgeTurnAdvanceForSpentBudget()
          return
        }
        setScandalSelectMode({
          active: true,
          validPlots: scandalTargets,
          actionInstanceId: actionInstanceIds[0],
        })
        toast.info(
          'Scandal: select a highlighted built anchor tenant. You will roll — 6+ succeeds (max +1 from built Influencer and/or News Outlet; they do not stack). The owner may roll 6 to negate.'
        )
        return
      }
      if (ac?.id === 'police-raid-on-mafia') {
        setPlacementMode({
          active: false,
          propertyCardId: null,
          housingHighDensity: undefined,
          wildCardEmulatePropertyId: undefined,
        })
        if (!boardHasBuiltMafia(safeGameState.plots)) {
          setActionCriteriaDialog({
            open: true,
            actionInstanceId: actionInstanceIds[0],
            bankValue: ac.bankValue,
            cardName: ac.name,
            reasonDescription:
              'Police Raid on Mafia requires at least one Mafia property on the board. There is none right now.',
          })
          return
        }
        if (turnLimitReached(safeGameState.turnActionsConsumed)) {
          nudgeTurnAdvanceForSpentBudget()
          return
        }
        /** +1 raid influence (max +1) when attacker owns built Police, City Hall, and/or Courthouse anywhere. */
        const { bonus: influenceBonus, labels: influenceLabels } = getPoliceRaidAttackerInfluence(
          safeGameState.players[cpIdx].id,
          safeGameState.plots
        )
        setRollDieDialogState({
          open: true,
          mode: 'police-raid-attacker',
          actionInstanceId: actionInstanceIds[0],
          targetPlayerId: undefined,
          influenceBonus,
          influenceLabels,
          councilFreezeAttackerRollsCompleted: undefined,
          councilFreezeAttackerLastNatural: undefined,
          councilFreezeFailAuto: undefined,
          diceRetryNonce: 0,
          takeoverContext: undefined,
          rezoningContext: undefined,
          scandalContext: undefined,
          removeInvestorsContext: undefined,
        })
        {
          const attackerName = safeGameState.players[cpIdx]?.name ?? 'Attacker'
          const mafiaOwner =
            safeGameState.players.find((p) =>
              safeGameState.plots.some(
                (pl) => pl.builtProperty === 'mafia' && pl.claimedBy === p.id
              )
            )?.name ?? 'the Mafia owner'
          announceConfrontationAttempt(
            'Police Raid on Mafia',
            attackerName,
            mafiaOwner,
            `${attackerName} is raiding ${mafiaOwner}'s Mafia influence.`
          )
        }
        if (influenceBonus > 0) {
          toast.success(`+${influenceBonus} raid influence (${influenceLabels.join(' / ')}) on your Police Raid roll.`)
        }
        return
      }
      if (ac?.id === 'remove-investors') {
        setPlacementMode({
          active: false,
          propertyCardId: null,
          housingHighDensity: undefined,
          wildCardEmulatePropertyId: undefined,
        })
        const ownerCash = safeGameState.players[cpIdx].money
        const myInvestedPlots = safeGameState.plots.filter(
          (p) =>
            p.claimedBy === safeGameState.players[cpIdx].id &&
            p.builtProperty &&
            Array.isArray(p.investmentStripes) &&
            p.investmentStripes.length > 0
        )
        const affordableInvestedPlots = myInvestedPlots.filter(
          (p) => ownerCash >= totalRemoveInvestorsBuyoutMillion(p.investmentStripes)
        )
        if (myInvestedPlots.length === 0) {
          setActionCriteriaDialog({
            open: true,
            actionInstanceId: actionInstanceIds[0],
            bankValue: ac.bankValue,
            cardName: ac.name,
            reasonDescription:
              'Remove Investors needs one of your built properties that currently has investors on it. None of yours do right now.',
          })
          return
        }
        if (affordableInvestedPlots.length === 0) {
          const minBuyout = Math.min(
            ...myInvestedPlots.map((p) => totalRemoveInvestorsBuyoutMillion(p.investmentStripes))
          )
          setActionCriteriaDialog({
            open: true,
            actionInstanceId: actionInstanceIds[0],
            bankValue: ac.bankValue,
            cardName: ac.name,
            reasonDescription: `You need at least $${minBuyout}M cash to cover mandatory 50% investor buyouts. Bank this card or continue your turn with another action.`,
          })
          return
        }
        if (turnLimitReached(safeGameState.turnActionsConsumed)) {
          nudgeTurnAdvanceForSpentBudget()
          return
        }
        setRemoveInvestorsSelectMode({
          active: true,
          validPlots: affordableInvestedPlots,
          actionInstanceId: actionInstanceIds[0],
        })
        toast.info(
          'Remove Investors: click one of your highlighted properties with investors. You must afford 50% payouts to all of them if the roll succeeds.'
        )
        return
      }
      if (ac?.id === 'rezoning') {
        setPlacementMode({
          active: false,
          propertyCardId: null,
          housingHighDensity: undefined,
          wildCardEmulatePropertyId: undefined,
        })
        if (safeGameState.propertiesBuiltThisTurn >= 1) {
          setActionCriteriaDialog({
            open: true,
            actionInstanceId: actionInstanceIds[0],
            bankValue: ac.bankValue,
            cardName: ac.name,
            reasonDescription:
              'You already built a property this turn. Successful Rezoning includes a build — bank this card or play it before you build from your hand on a later turn.',
          })
          return
        }
        const acting = safeGameState.players[cpIdx]
        const affordableTemplate = acting.propertyCards.find((pi) => {
          const c = propertyCards.find((x) => x.id === pi.cardId) as PropertyCard | undefined
          if (!c || c.type === 'anchor') return false
          return acting.money >= getHousingBuildCost(c, false)
        })
        if (!affordableTemplate) {
          const hasAnyTemplate = acting.propertyCards.some((pi) => {
            const c = propertyCards.find((x) => x.id === pi.cardId) as PropertyCard | undefined
            return c != null && c.type !== 'anchor'
          })
          setActionCriteriaDialog({
            open: true,
            actionInstanceId: actionInstanceIds[0],
            bankValue: ac.bankValue,
            cardName: ac.name,
            reasonDescription: hasAnyTemplate
              ? 'You do not have enough cash to complete a rezoning build with any non-anchor property in your hand. Bank this card or continue your turn with another action.'
              : 'You need at least one non-anchor property card in your hand to use Rezoning. Bank this card or continue your turn.',
          })
          return
        }
        if (getVacantCityLotsForRezoning(safeGameState.plots).length === 0) {
          setActionCriteriaDialog({
            open: true,
            actionInstanceId: actionInstanceIds[0],
            bankValue: ac.bankValue,
            cardName: ac.name,
            reasonDescription:
              'No vacant city lots are available — Rezoning cannot be used right now. Bank this card or continue your turn.',
          })
          return
        }
        if (!canAttemptRezoning(safeGameState.turnActionsConsumed)) {
          setActionCriteriaDialog({
            open: true,
            actionInstanceId: actionInstanceIds[0],
            bankValue: ac.bankValue,
            cardName: ac.name,
            reasonDescription: `Successful Rezoning uses ${REZONING_SUCCESS_ACTION_COST} actions (the roll + the build). You need at least ${REZONING_SUCCESS_ACTION_COST} actions left this turn. Bank this card or End Turn.`,
          })
          return
        }
        setRezoningMode({ phase: 'pick-property', actionInstanceId: actionInstanceIds[0] })
        toast.info(
          'Rezoning: click a highlighted property card, then a vacant lot. Roll 5–6 to approve; +1 influence makes 4–6 approve; +2 makes 3–6 approve (success uses 2 actions).'
        )
        return
      }
      if (ac?.id === 'build-with-tax-dollars') {
        setPlacementMode({
          active: false,
          propertyCardId: null,
          housingHighDensity: undefined,
          taxBuildActionInstanceId: undefined,
          wildCardEmulatePropertyId: undefined,
        })
        const hasProperty = safeGameState.players[cpIdx].propertyCards.length > 0
        if (!hasProperty) {
          setActionCriteriaDialog({
            open: true,
            actionInstanceId: actionInstanceIds[0],
            bankValue: ac.bankValue,
            cardName: ac.name,
            reasonDescription:
              'You need at least one property card in your hand to use Build with Tax Dollars. Bank this card or continue your turn.',
          })
          return
        }
        setTaxBuildMode({ phase: 'pick-property', actionInstanceId: actionInstanceIds[0] })
        toast.info('Choose a highlighted property card to build with tax dollars at 50% cost.')
        return
      }
      if (ac?.id === 'discard-property-cards') {
        if (turnLimitReached(safeGameState.turnActionsConsumed)) {
          nudgeTurnAdvanceForSpentBudget()
          return
        }
        const acting = safeGameState.players[cpIdx]
        // Founderbots never use the host hand rail — resolve immediately so the table cannot freeze.
        if (acting.isAi === true) {
          getGameHandlers().handleConfirmDiscardProperty(pickAiDiscardPropertyIds(acting), actionInstanceIds[0])
          return
        }
        setDiscardPropertySelectMode({
          active: true,
          actionInstanceId: actionInstanceIds[0],
          selectedPropertyInstanceIds: [],
        })
        setDiscardPropertyConfirmOpen(false)
        toast.info(
          'Discard Property Cards: all properties in your hand are highlighted. Click to select/deselect, then confirm. Draw as many replacements as you discard (0–all).'
        )
        return
      }
    }

    const handForStepCount = safeGameState.players[cpIdx].actionCards
    const playStepsBatch = countResolvedActionStepsInBatch(actionInstanceIds, handForStepCount, emulateActionId)
    const bankStepsBatch = convertToCashInstanceIds.length
    if ((safeGameState.turnActionsConsumed ?? 0) + playStepsBatch + bankStepsBatch > MAX_TURN_ACTIONS) {
      if (turnLimitReached(safeGameState.turnActionsConsumed)) {
        nudgeTurnAdvanceForSpentBudget()
      } else {
        toast.error(
          `You only have ${MAX_TURN_ACTIONS} actions per turn. Play or bank fewer cards this play.`
        )
      }
      return
    }

    patchGameState((current) => {
      const currentPlayer = current.players[current.currentPlayerIndex]
      let updatedMoney = currentPlayer.money
      let updatedPropertyCards = [...(currentPlayer.propertyCards || [])]
      let updatedActionCards = [...(currentPlayer.actionCards || [])]
      let updatedActionDiscard = [...current.actionDiscard]
      let updatedPropertyDiscard = [...current.propertyDiscard]
      let actionsPlayedCount = 0
      let crossingActivated = current.crossingTheLineActive
      let updatedActionDeck = [...current.actionDeck]
      let pendingIncomeTaxPlayerIds = [...(current.pendingIncomeTaxPlayerIds ?? [])]
      /** Property Taxation: playerId → immediate city assessment (not rebuttable). */
      const propertyTaxByPlayerId = new Map<number, number>()
      let drawnCalamities: CardInstance[] = []

      if (convertToCashInstanceIds.length > 0) {
        let totalCash = 0
        let churchBanked = false
        convertToCashInstanceIds.forEach(instanceId => {
          const propInstance = updatedPropertyCards.find(c => c.instanceId === instanceId)
          const actInstance = updatedActionCards.find(c => c.instanceId === instanceId)

          if (propInstance) {
            const propertyCard = propertyCards.find(c => c.id === propInstance.cardId)
            if (propertyCard) {
              updatedMoney += propertyCard.bankValue
              totalCash += propertyCard.bankValue
              updatedPropertyCards = updatedPropertyCards.filter(c => c.instanceId !== instanceId)
              updatedPropertyDiscard.push(propInstance)
              if (propertyCard.id === 'church') churchBanked = true
            }
          } else if (actInstance) {
            const actionCard = actionCards.find(c => c.id === actInstance.cardId)
            if (actionCard) {
              updatedMoney += actionCard.bankValue
              totalCash += actionCard.bankValue
              updatedActionCards = updatedActionCards.filter(c => c.instanceId !== instanceId)
              updatedActionDiscard.push(actInstance)
            } else if (actInstance.cardId === 'roll-die') {
              const legacyBank = 2
              updatedMoney += legacyBank
              totalCash += legacyBank
              updatedActionCards = updatedActionCards.filter((c) => c.instanceId !== instanceId)
              updatedActionDiscard.push(actInstance)
            }
          }
        })

        toast.success(`Converted ${convertToCashInstanceIds.length} card(s) to cash for $${totalCash}M`)
        if (churchBanked) {
          toast.info('Church affiliation created!')
        }
        if (
          convertToCashInstanceIds.some((instanceId) => {
            const propInstance = currentPlayer.propertyCards.find((c) => c.instanceId === instanceId)
            if (!propInstance) return false
            return propInstance.cardId === 'farm-coop'
          })
        ) {
          toast.info('Farm Bureau formed!')
        }
        if (
          convertToCashInstanceIds.some((instanceId) => {
            const propInstance = currentPlayer.propertyCards.find((c) => c.instanceId === instanceId)
            if (!propInstance) return false
            return propInstance.cardId === 'port-authority'
          })
        ) {
          toast.info('Port Authority engineered!')
        }
        if (
          convertToCashInstanceIds.some((instanceId) => {
            const propInstance = currentPlayer.propertyCards.find((c) => c.instanceId === instanceId)
            if (!propInstance) return false
            return propInstance.cardId === 'arts-council'
          })
        ) {
          toast.info('Arts Council crafted!')
        }
        if (
          convertToCashInstanceIds.some((instanceId) => {
            const propInstance = currentPlayer.propertyCards.find((c) => c.instanceId === instanceId)
            if (!propInstance) return false
            return propInstance.cardId === 'tourism-office'
          })
        ) {
          toast.info('Tourism office conceived!')
        }
        if (
          convertToCashInstanceIds.some((instanceId) => {
            const propInstance = currentPlayer.propertyCards.find((c) => c.instanceId === instanceId)
            if (!propInstance) return false
            return propInstance.cardId === 'media'
          })
        ) {
          toast.info('Social media influencer launched!')
        }
        if (
          convertToCashInstanceIds.some((instanceId) => {
            const propInstance = currentPlayer.propertyCards.find((c) => c.instanceId === instanceId)
            if (!propInstance) return false
            return propInstance.cardId === 'mafia'
          })
        ) {
          toast.info('Mafia infiltrated!')
        }
        if (
          convertToCashInstanceIds.some((instanceId) => {
            const propInstance = currentPlayer.propertyCards.find((c) => c.instanceId === instanceId)
            if (!propInstance) return false
            return propInstance.cardId === 'news-outlet'
          })
        ) {
          toast.info('News Outlet originated!')
        }
        if (
          convertToCashInstanceIds.some((instanceId) => {
            const propInstance = currentPlayer.propertyCards.find((c) => c.instanceId === instanceId)
            if (!propInstance) return false
            return propInstance.cardId === 'regulation-bureau'
          })
        ) {
          toast.info('Regulation Bureau established!')
        }
        if (
          convertToCashInstanceIds.some((instanceId) => {
            const propInstance = currentPlayer.propertyCards.find((c) => c.instanceId === instanceId)
            if (!propInstance) return false
            return propInstance.cardId === 'anchor-wild-card'
          })
        ) {
          toast.info('Anchor Wild Card banked — flexibility kept in reserve.')
        }
      }

      if (actionInstanceIds.length > 0) {
        let incomeCardInstance: string | null = null

        actionInstanceIds.forEach(instanceId => {
          const instance = updatedActionCards.find(c => c.instanceId === instanceId)
          if (instance) {
            if (instance.cardId === 'roll-die') {
              updatedActionCards = updatedActionCards.filter((c) => c.instanceId !== instanceId)
              updatedActionDiscard.push(instance)
              actionsPlayedCount++
              toast.info('Roll Die is no longer in the deck. Card discarded.')
              return
            }
            const card = actionCards.find(c => c.id === playedIdOf(instance))
            if (card) {
              if (card.id === 'income') {
                incomeCardInstance = instanceId
                return
              }

              if (card.id === 'double-income') {
                return
              }

              if (card.id === 'city-council-freeze') {
                return
              }

              if (card.id === 'rezoning') {
                return
              }

              if (card.id === 'discard-property-cards') {
                return
              }

              if (card.id === 'draw-2-action-cards') {
                updatedActionCards = updatedActionCards.filter((c) => c.instanceId !== instanceId)
                actionsPlayedCount++
                const {
                  drawn,
                  deck: deckAfter,
                  discard: discardAfter,
                } = drawFromDeckWithDiscardReshuffle(updatedActionDeck, updatedActionDiscard, 2)
                const resolved = resolveCalamityDraw(
                  current,
                  drawn,
                  deckAfter,
                  discardAfter,
                  { forceBury: drawnCalamities.length > 0 }
                )
                drawnCalamities = [...drawnCalamities, ...resolved.firing]
                updatedActionDeck = resolved.deck
                updatedActionDiscard = [...resolved.discard, instance]
                updatedActionCards = [...updatedActionCards, ...resolved.kept]
                if (resolved.firing.length > 0) {
                  toast.info(
                    resolved.kept.length > 0
                      ? `Played ${card.name} — drew ${resolved.kept.length} action card${resolved.kept.length === 1 ? '' : 's'}; Calamity strikes the city!`
                      : `Played ${card.name} — Calamity strikes the city!`
                  )
                } else if (resolved.kept.length === 2) {
                  toast.success(`Played ${card.name} — drew 2 new action cards into your hand.`)
                } else if (resolved.kept.length === 1) {
                  toast.success(`Played ${card.name} — drew 1 action card (deck and discard had one available).`)
                } else {
                  toast.info(`Played ${card.name} — no action cards left in deck or discard to draw.`)
                }
                return
              }

              if (card.id === 'taxation') {
                updatedActionCards = updatedActionCards.filter((c) => c.instanceId !== instanceId)
                updatedActionDiscard.push(instance)
                actionsPlayedCount++
                const actorId = currentPlayer.id
                const otherIds = current.players.filter((p) => p.id !== actorId).map((p) => p.id)
                pendingIncomeTaxPlayerIds = appendIncomeTaxAssessments(pendingIncomeTaxPlayerIds, otherIds)
                broadcastBoardFx({
                  sound: 'boo',
                  notice: {
                    title: 'Income Taxation levied!',
                    detail: `${currentPlayer.name} sheltered their income — every other founder is assessed 50% on a later Income card. Extra Taxation cards stack.`,
                    durationMs: 2000,
                  },
                })
                return
              }

              if (card.id === 'property-taxation') {
                updatedActionCards = updatedActionCards.filter((c) => c.instanceId !== instanceId)
                updatedActionDiscard.push(instance)
                actionsPlayedCount++
                const actorId = currentPlayer.id
                current.players.forEach((p) => {
                  if (p.id === actorId) return
                  let ownedValue = 0
                  current.plots.forEach((plot) => {
                    if (plot.claimedBy !== p.id || !plot.builtProperty) return
                    const propertyCard = propertyCards.find((c) => c.id === plot.builtProperty)
                    if (propertyCard) ownedValue += getPlotPropertyEndValue(plot, propertyCard)
                  })
                  const assessed = propertyTaxLevyMillion(ownedValue, p.money)
                  const prior = propertyTaxByPlayerId.get(p.id) ?? 0
                  propertyTaxByPlayerId.set(p.id, prior + assessed)
                })
                broadcastBoardFx({ sound: 'boo' })
                current.players.forEach((p) => {
                  if (p.id === actorId) return
                  const assessed = propertyTaxByPlayerId.get(p.id) ?? 0
                  if (assessed <= 0) return
                  if (isAiSeat(p)) return
                  broadcastBoardFx({
                    audiencePlayerId: p.id,
                    notice: {
                      title: 'Property Taxation',
                      detail: `You paid $${assessed}M in city property tax.`,
                      durationMs: 2000,
                    },
                  })
                })
                return
              }

              if (card.id === 'calamity') {
                updatedActionCards = updatedActionCards.filter((c) => c.instanceId !== instanceId)
                if (calamityAllowedThisRound(current) && drawnCalamities.length === 0) {
                  drawnCalamities = [...drawnCalamities, instance]
                } else {
                  updatedActionDeck = shuffleDeck([...updatedActionDeck, instance])
                }
                return
              }

              if (card.id === 'crossing-the-line') {
                crossingActivated = true
                toast.success('Crossing the Line activated! Build anywhere in the city!')
                broadcastBoardFx({
                  notice: {
                    title: 'Crossing the Line!',
                    detail: `${currentPlayer.name} can build anywhere in the city this play.`,
                  },
                  sound: 'cheer',
                })
              }
              updatedActionCards = updatedActionCards.filter(c => c.instanceId !== instanceId)
              updatedActionDiscard.push(instance)
              actionsPlayedCount++
              if (card.id !== 'crossing-the-line') {
                toast.success(
                  isActionWildCard(instance.cardId)
                    ? `Played Action Wild Card as ${card.name}!`
                    : `Played ${card.name}!`
                )
              }
            }
          }
        })

        if (incomeCardInstance) {
          if (isAiSeat(currentPlayer) && !playerHasBuiltIncomeProperty(current.plots, currentPlayer.id)) {
            return current
          }
          const ownedPlots = current.plots.filter(p => p.claimedBy === currentPlayer.id && p.builtProperty)
          let baseIncome = 0

          ownedPlots.forEach(plot => {
            const propertyCard = propertyCards.find(c => c.id === plot.builtProperty)
            if (propertyCard) {
              baseIncome += getPlotPropertyIncome(plot, propertyCard)
            }
          })

          const { bonus: parkIncomeBonus, sourceLabels: parkBonusSourceLabels } = getParkIncomeBonusForPlayer(
            currentPlayer.id,
            current.plots
          )
          const { bonus: churchIncomeBonus, sourceLabels: churchBonusSourceLabels } = getChurchIncomeBonusForPlayer(
            currentPlayer.id,
            current.plots
          )
          const { bonus: farmCoopIncomeBonus, sourceLabels: farmCoopBonusSourceLabels } =
            getFarmCoopIncomeBonusForPlayer(currentPlayer.id, current.plots)
          const { bonus: portAuthorityIncomeBonus, sourceLabels: portAuthorityBonusSourceLabels } =
            getPortAuthorityIncomeBonusForPlayer(currentPlayer.id, current.plots)
          const { bonus: artsCouncilIncomeBonus, sourceLabels: artsCouncilBonusSourceLabels } =
            getArtsCouncilIncomeBonusForPlayer(currentPlayer.id, current.plots)
          const { bonus: tourismOfficeIncomeBonus, sourceLabels: tourismOfficeBonusSourceLabels } =
            getTourismOfficeIncomeBonusForPlayer(currentPlayer.id, current.plots)
          const { bonus: influencersIncomeBonus, sourceLabels: influencersBonusSourceLabels } =
            getInfluencersIncomeBonusForPlayer(currentPlayer.id, current.plots)
          const { bonus: newsOutletIncomeBonus, sourceLabels: newsOutletBonusSourceLabels } =
            getNewsOutletIncomeBonusForPlayer(currentPlayer.id, current.plots)
          const { bonus: mafiaIncomeBonus, sourceLabels: mafiaBonusSourceLabels } =
            getMafiaIncomeBonusForPlayer(currentPlayer.id, current.plots)
          const { bonus: regulationBureauIncomeBonus, sourceLabels: regulationBureauBonusSourceLabels } =
            getRegulationBureauIncomeBonusForPlayer(currentPlayer.id, current.plots)
          const {
            penalty: regulationBureauIncomePenalty,
            sourceLabels: rivalRegulationBureauPlotLabels,
          } = getRegulationBureauIncomePenaltyForPlayer(currentPlayer.id, current.plots)
          const { bonus: unionIncomeBonus, sourceLabels: unionBonusSourceLabels } = getUnionIncomeBonusForOwner(
            currentPlayer.id,
            current.plots
          )
          const { penalty: unionIncomePenalty, rivalUnionPlotLabels } = getUnionIncomePenaltyForPlayer(
            currentPlayer.id,
            current.plots
          )
          const { levyTotal: mafiaLevyTotal } = getMafiaLevyForIncomePlayer(currentPlayer.id, current.plots)
          const grossIncomePool =
            baseIncome +
            parkIncomeBonus +
            churchIncomeBonus +
            farmCoopIncomeBonus +
            portAuthorityIncomeBonus +
            artsCouncilIncomeBonus +
            tourismOfficeIncomeBonus +
            influencersIncomeBonus +
            newsOutletIncomeBonus +
            mafiaIncomeBonus +
            regulationBureauIncomeBonus +
            unionIncomeBonus -
            regulationBureauIncomePenalty -
            unionIncomePenalty
          const totalIncome = Math.max(0, grossIncomePool)

          // Founderbots never open IncomeDialog — the host dice/autoplay loop was
          // cancelling collect and reopening the roll forever. Resolve in this patch.
          if (isAiSeat(currentPlayer)) {
            if (current.incomeResolvedThisTurn) return current
            const doubleFromPlay = actionInstanceIds
              .map((id) => currentPlayer.actionCards.find((c) => c.instanceId === id))
              .find((inst) => inst?.cardId === 'double-income')
            const consumed = current.turnActionsConsumed ?? 0
            const canDouble = Boolean(doubleFromPlay) && consumed + 2 <= MAX_TURN_ACTIONS
            const face = Math.floor(Math.random() * 6) + 1
            const pct = incomePercentageForDie(face)
            let earned = Math.floor((totalIncome * pct) / 100)
            if (canDouble) earned *= 2
            const result = applyIncomeComplete(current, {
              incomeInstanceId: incomeCardInstance,
              earnedIncome: earned,
              totalPropertyIncomeBase: totalIncome,
              doubleIncomeInstanceId: canDouble ? doubleFromPlay?.instanceId : undefined,
              incomeResolution: 'property-roll',
            })
            if (!result.ok) return current
            const gained =
              (result.state.players[result.state.currentPlayerIndex]?.money ?? currentPlayer.money) -
              currentPlayer.money
            queueMicrotask(() => {
              toast.success(
                `${currentPlayer.name} collected income: $${Math.max(0, gained)}M (rolled ${face}).`,
                { duration: CALAMITY_OUTCOME_BANNER_MS }
              )
              broadcastBoardFx({
                sound: 'income',
                notice: {
                  title: `${currentPlayer.name} collected income`,
                  detail: `Rolled ${face} — $${Math.max(0, gained)}M added to their treasury.`,
                  durationMs: CALAMITY_OUTCOME_BANNER_MS,
                  replace: true,
                },
              })
            })
            if (turnLimitReached(result.state.turnActionsConsumed ?? 0)) {
              scheduleEndOfTurn()
            }
            return result.state
          }

          setIncomeDialogState({
            open: true,
            player: currentPlayer,
            totalIncome,
            parkIncomeBonus,
            parkBonusSourceLabels,
            churchIncomeBonus,
            churchBonusSourceLabels,
            farmCoopIncomeBonus,
            farmCoopBonusSourceLabels,
            portAuthorityIncomeBonus,
            portAuthorityBonusSourceLabels,
            artsCouncilIncomeBonus,
            artsCouncilBonusSourceLabels,
            tourismOfficeIncomeBonus,
            tourismOfficeBonusSourceLabels,
            influencersIncomeBonus,
            influencersBonusSourceLabels,
            newsOutletIncomeBonus,
            newsOutletBonusSourceLabels,
            mafiaIncomeBonus,
            mafiaBonusSourceLabels,
            mafiaLevyTotal,
            regulationBureauIncomeBonus,
            regulationBureauBonusSourceLabels,
            regulationBureauIncomePenalty,
            rivalRegulationBureauPlotLabels,
            unionIncomeBonus,
            unionBonusSourceLabels,
            unionIncomePenalty,
            rivalUnionPlotLabels,
            hasBuiltPropertiesForIncomeRoll: ownedPlots.length > 0,
            actionInstanceId: incomeCardInstance
          })

          return current
        }
      }

      const bankStepCount = convertToCashInstanceIds.length
      const newActionsPlayedThisTurn = current.actionsPlayedThisTurn + actionsPlayedCount
      const newTurnActionsConsumed =
        (current.turnActionsConsumed ?? 0) + bankStepCount + actionsPlayedCount

      const updatedPlayers = current.players.map((p, idx) => {
        if (idx === current.currentPlayerIndex) {
          return { ...p, money: updatedMoney, propertyCards: updatedPropertyCards, actionCards: updatedActionCards }
        }
        const propertyTax = propertyTaxByPlayerId.get(p.id) ?? 0
        return propertyTax > 0 ? { ...p, money: Math.max(0, p.money - propertyTax) } : p
      })

      const newState: GameState = {
        ...current,
        players: updatedPlayers,
        actionDeck: updatedActionDeck,
        actionDiscard: updatedActionDiscard,
        propertyDiscard: updatedPropertyDiscard,
        actionsPlayedThisTurn: newActionsPlayedThisTurn,
        turnActionsConsumed: newTurnActionsConsumed,
        crossingTheLineActive: crossingActivated,
        pendingIncomeTaxPlayerIds,
      }

      if (turnLimitReached(newTurnActionsConsumed)) {
        scheduleEndOfTurn()
      }

      return beginCalamity(
        withReplenishedActionHand(newState, current.currentPlayerIndex),
        current.currentPlayerIndex,
        drawnCalamities
      )
    })
  }
