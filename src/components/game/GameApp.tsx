'use client'

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react'
import { useGameState } from '@/hooks/use-game-state'
import { Player, Plot, GameState, PlayerScore } from '@/lib/types'
import { attachUndoSnapshotIfTurnAction, canUndoLastAction, restoreUndoSnapshot } from '@/lib/undoLastAction'
import { createInitialBoard } from '@/lib/boardData'
import { createActionDeck, createPropertyDeck, drawCards, drawFromDeckWithDiscardReshuffle, shuffleDeck } from '@/lib/deckUtils'
import { GameSetupWizard } from '@/components/game/GameSetupWizard'
import { GameOpeningSequence } from '@/components/game/GameOpeningSequence'
import { BoardViewport } from '@/components/game/BoardViewport'
import { HandRail } from '@/components/game/HandRail'
import { PlayerSidebar } from '@/components/game/PlayerSidebar'
import { CalamityAcceptLayer, DialogHost } from '@/components/game/DialogHost'
import { HeaderPlayControls } from '@/components/game/HeaderPlayControls'
import { OverlayHost } from '@/components/game/OverlayHost'
import { type PlayCardsOptions, handCardAnchorKey, handTargetAnchorKey } from '@/components/game/PlayerHand'
import { useCompactGameLayout } from '@/hooks/use-compact-game-layout'
import { PROPERTY_DECK_ANCHOR_KEY, ACTION_DECK_ANCHOR_KEY } from '@/components/game/DeckPile'
import { type CardFlight } from '@/components/game/CardFlightLayer'
import {
  clearBoardNotice,
  dismissOpeningProTip,
  getOverlaySnapshot,
  resetOverlayStore,
  setFinalTurnBanner,
  setMotivationalFlashRound,
  setOverlayCardFlights,
  setOverlayHiddenInstanceIds,
  setShowOpeningProTip,
  showBoardNotice,
  subscribeOverlay,
} from '@/lib/gameOverlayStore'
import { getGameTableSnapshot, publishGameState, subscribeGameTable } from '@/lib/gameTableStore'
import { rollSeatIsAi } from '@/lib/buildRequiredAction'
import {
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
  setPlaySession,
  setRemoveInvestorsSelectMode,
  setRezoningMode,
  setRollDieDialogState,
  setScandalSelectMode,
  setTakeoverSelectMode,
  setTaxBuildMode,
  setTaxBuildPrompt,
  setUndoActionDialogOpen,
  subscribePlayUi,
  taxPromptResumeRef,
  isPlayUiBlockingTurnAdvance,
} from '@/lib/playUiStore'
import { setGameHandlerBag } from '@/lib/gameHandlerBag'
import type { PlaySession } from '@/components/game/playSession/types'
import {
  HAND_DRAW_DURATION_SEC,
  HAND_DRAW_STAGGER_MS,
  MAX_DRAW_FLIGHTS_PER_TICK,
  REMOTE_COUNCIL_FREEZE_DEFENSE_ID,
  REMOTE_REBUTTAL_ROLL_ID,
  REPLENISH_DRAW_STAGGER_MS,
  initialGameState,
  isAiSeat,
  isSinglePlayerVersusBots,
  makeDiscardFlight,
  makeDrawFlight,
  resolveHandDrawTargetRect,
  restoreHostOnlineConfig,
  sumInvestmentBookForPlayer,
} from '@/components/game/playSession/helpers'
import * as playCards from '@/components/game/playSession/playCards'
import * as plots from '@/components/game/playSession/plots'
import * as turn from '@/components/game/playSession/turn'
import * as income from '@/components/game/playSession/income'
import * as dice from '@/components/game/playSession/dice'
import * as calamity from '@/components/game/playSession/calamity'
import * as setup from '@/components/game/playSession/setup'
import { FlightAnchorProvider, useFlightRectGetter, type FlightRect } from '@/hooks/use-flight-anchors'
import { GameEndDialog } from '@/components/dialogs/GameEndDialog'
import { Toaster } from '@/components/ui/sonner'
import { gameDockToast as toast } from '@/lib/fsGameToast'
import { propertyCards, actionCards } from '@/lib/cardData'
import { PropertyCard, ActionCard, type CardInstance } from '@/lib/cardTypes'
import { isCivicFlexHandCard } from '@/lib/civicFlexProperty'
import { resolvePropertyPlacementTemplate, needsEmulateChoiceBeforePlacement } from '@/lib/placementTemplate'
import { getValidPlotsForProperty, getVacantCityLotsForRezoning } from '@/lib/placementRules'
import {
  playIncomeSound,
  playConstructionSound,
  playAnchorDropSound,
  playCrowdBooSound,
  playCrowdCheerSound,
  playInfluenceDwindleSound,
  playCalamitySound,
} from '@/lib/soundEffects'
import {
  trySimpleAiMainPhase,
  pickAiDiscardPropertyIds,
  pickAiActionCardDiscardIds,
  playerHasBuiltIncomeProperty,
} from '@/lib/bot/simpleAiTurn'
import type { SimpleAiTurnHandlers, SimpleAiTurnUi } from '@/lib/bot/simpleAiTurn'
import { AI_MAIN_PHASE_DELAY_NORMAL_MS, AI_MAIN_PHASE_BURST_STEPS } from '@/lib/bot/aiTiming'
import {
  applyCalamityRoll,
  beginCalamity,
  calamityAllowedThisRound,
  calamityLossMillion,
  calamityPercentForFace,
  calamityPostRollBannerDetail,
  CALAMITY_OUTCOME_BANNER_MS,
  CALAMITY_PRE_ROLL_INSTRUCTION,
  dealActionHandSkippingCalamity,
  findCalamityVariant,
  ingestActionDraw,
  pickCalamityVariant,
  resolveCalamityDraw,
} from '@/lib/calamity'
import {
  confrontationAttemptTitle,
  investmentNoticeTitle,
  hostileTakeoverAttemptTitle,
  hostileTakeoverAttackerSuccessTitle,
  hostileTakeoverDefenseSuccessTitle,
  attackRollRequiredTitle,
  defenseRollRequiredTitle,
  confrontationNoticeDetail,
  confrontationNoticeTitle,
  type ConfrontationKind,
  type ConfrontationOutcome,
} from '@/lib/confrontationNotice'
import { enablePlayKeepAwake, disablePlayKeepAwake } from '@/lib/keepAwake'
import { incomePercentageForDie } from '@/lib/incomeDice'
import {
  findCompleteSquares,
  findCompleteStreets,
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
  MAX_ACTION_HAND_SIZE,
  MAX_TURN_ACTIONS,
  REZONING_SUCCESS_ACTION_COST,
  canAttemptRezoning,
  replenishCurrentPlayerActionHand,
  shouldAutoAdvanceTurn,
  turnLimitReached,
} from '@/lib/turnActions'
import { nextPlayRoundNumber } from '@/lib/playRound'
import {
  type PartyBoardSyncConfig,
  type PartyBoardSyncMeta,
} from '@/lib/partyBoardSync'
import { saveLastOnlineSession, clearLastOnlineSession, loadLastOnlineSession } from '@/lib/onlineSessionMemory'
import {
  clearAuthoritySnapshot,
  hasResumableHostAuthority,
} from '@/lib/onlineAuthorityMemory'
import { getDeviceConnectionId } from '@/lib/realtimeClient'
import { remapSeatPlanPartySocketIds, resolveGuestSeatForRemap } from '@/lib/partySeatIds'
import { redactGameStateForGuestView } from '@/lib/partyBoardView'
import { useOnlineBoardSync } from '@/lib/useOnlineBoardSync'
import type { BoardFx, GameEvent } from '@/lib/onlineGameActions'

function AppInner() {
  const [partyBoardConfig, setPartyBoardConfig] = useState<PartyBoardSyncConfig | null>(
    restoreHostOnlineConfig
  )
  const [gameState, setGameStateRaw] = useGameState<GameState>('founders-square-game', initialGameState, {
    persist: partyBoardConfig?.role !== 'guest',
  })
  const setGameState = useCallback(
    (valueOrUpdater: GameState | ((current: GameState) => GameState)) => {
      if (typeof valueOrUpdater === 'function') {
        setGameStateRaw((prev) => {
          const next = (valueOrUpdater as (current: GameState) => GameState)(prev)
          publishGameState(next)
          return next
        })
      } else {
        publishGameState(valueOrUpdater)
        setGameStateRaw(valueOrUpdater)
      }
    },
    [setGameStateRaw]
  )
  useLayoutEffect(() => {
    if (getGameTableSnapshot() !== gameState) publishGameState(gameState)
  }, [gameState])
  const [hostAwayWarning, setHostAwayWarning] = useState(false)
  const [guestOnlineHintDismissed, setGuestOnlineHintDismissed] = useState(() => {
    if (typeof sessionStorage === 'undefined') return false
    try {
      return sessionStorage.getItem('fs-guest-online-hint-dismissed') === '1'
    } catch {
      return false
    }
  })

  const dismissGuestOnlineHint = useCallback(() => {
    try {
      sessionStorage.setItem('fs-guest-online-hint-dismissed', '1')
    } catch {
      /* noop */
    }
    setGuestOnlineHintDismissed(true)
  }, [])

  const onGuestSnapshotAppliedRef = useRef<() => void>(() => {})
  const onGameEventsRef = useRef<(events: GameEvent[]) => void>(() => {})
  const onBoardFxRef = useRef<(fx: BoardFx) => void>(() => {})

  const resolveOnlineSeatPlayerId = useCallback(
    (gs: GameState, boardId: string | null): number | null => {
      if (!partyBoardConfig) return null
      const connIds = [boardId, partyBoardConfig.myConnectionId?.trim()].filter(
        (x): x is string => Boolean(x && x.length > 0)
      )
      if (connIds.length > 0) {
        const seat = gs.players.find(
          (p) => p.isAi !== true && connIds.includes(String(p.partySeatConnectionId ?? ''))
        )
        if (seat) return seat.id
      }
      if (partyBoardConfig.role === 'guest') {
        return resolveGuestSeatForRemap(gs, partyBoardConfig.displayName ?? '')?.id ?? null
      }
      return null
    },
    [partyBoardConfig]
  )

  const partyBoardSync = useOnlineBoardSync({
    config: partyBoardConfig,
    gameState,
    setGameState,
    resolveSeatPlayerId: resolveOnlineSeatPlayerId,
    onAuthoritySnapshotApplied: () => onGuestSnapshotAppliedRef.current(),
    onGameEvents: (events) => onGameEventsRef.current(events),
    onFx: (fx) => onBoardFxRef.current(fx),
  })

  const {
    boardPartyConnectionId,
    sendAction,
    sendFx,
    sendGameClear,
    connectionStatus,
    requestResync,
    flushAuthorityPersist,
    syncClock,
  } = partyBoardSync
  const sendActionRef = useRef(sendAction)
  sendActionRef.current = sendAction
  const sendFxRef = useRef(sendFx)
  sendFxRef.current = sendFx

  const isOnlineActor = Boolean(partyBoardConfig && boardPartyConnectionId)

  const pendingOnlineCommitRef = useRef<GameState | null>(null)
  const onlineCommitScheduledRef = useRef(false)

  const commitOnlineAfterState = useCallback(
    (state: GameState) => {
      if (!partyBoardConfig || !boardPartyConnectionId) return
      // Coalesce bursty local patches into one authority commit per tick.
      pendingOnlineCommitRef.current = state
      if (onlineCommitScheduledRef.current) return
      onlineCommitScheduledRef.current = true
      queueMicrotask(() => {
        onlineCommitScheduledRef.current = false
        const next = pendingOnlineCommitRef.current
        pendingOnlineCommitRef.current = null
        if (!next) return
        sendActionRef.current({ type: 'commit_actor_state', state: next }, { skipOptimistic: true })
      })
    },
    [partyBoardConfig, boardPartyConnectionId]
  )

  const setGameStateWithOnlineCommit = useCallback(
    (updater: React.SetStateAction<GameState>) => {
      setGameState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        if (partyBoardConfig && boardPartyConnectionId && next !== prev) {
          commitOnlineAfterState(next)
        }
        return next
      })
    },
    [partyBoardConfig, boardPartyConnectionId, setGameState, commitOnlineAfterState]
  )

  const patchGameState = useCallback(
    (updater: React.SetStateAction<GameState>) => {
      const wrap: React.SetStateAction<GameState> = (prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        if (next === prev) return prev
        return attachUndoSnapshotIfTurnAction(prev, next)
      }
      if (isOnlineActor) {
        setGameStateWithOnlineCommit(wrap)
      } else {
        setGameState(wrap)
      }
    },
    [isOnlineActor, setGameStateWithOnlineCommit, setGameState]
  )

  const partySeatIdCandidates =
    boardPartyConnectionId?.trim() || partyBoardConfig?.myConnectionId?.trim()
      ? [boardPartyConnectionId, partyBoardConfig?.myConnectionId?.trim()].filter(
          (x): x is string => Boolean(x && x.length > 0)
        )
      : []

  const partyBoardSeatPlayer =
    partySeatIdCandidates.length > 0 || partyBoardConfig?.role === 'guest'
      ? gameState.players.find(
          (p) =>
            p.isAi !== true && partySeatIdCandidates.includes(String(p.partySeatConnectionId ?? ''))
        ) ??
        (partyBoardConfig?.role === 'guest'
          ? resolveGuestSeatForRemap(gameState, partyBoardConfig.displayName ?? '')
          : null)
      : null

  /** Joiners without `partySeatConnectionId` in snapshots (legacy) stay observe-only until a seated game ships. */
  const isSpectator = partyBoardConfig?.role === 'guest' && partyBoardSeatPlayer === null

  useLayoutEffect(() => {
    const cfg = partyBoardConfig
    const boardId = boardPartyConnectionId?.trim()
    if (!cfg?.roomId || !boardId) return
    setGameState((gs) => {
      const remapped = remapSeatPlanPartySocketIds({
        gameState: gs,
        role: cfg.role,
        lobbyConnectionId: cfg.myConnectionId,
        boardSocketConnectionId: boardId,
        founderDisplayName: cfg.displayName,
      }) ?? gs
      if (cfg.role !== 'guest') return remapped
      const seat = resolveGuestSeatForRemap(remapped, cfg.displayName)
      return seat ? redactGameStateForGuestView(remapped, seat.id) : remapped
    })
  }, [
    boardPartyConnectionId,
    partyBoardConfig?.role,
    partyBoardConfig?.myConnectionId,
    partyBoardConfig?.displayName,
    partyBoardConfig?.roomId,
    setGameState,
  ])

  /** Card-flight system. Overlay store owns the flying queue + hidden hand slots so a flight tick cannot rebuild the board. */
  const getFlightRect = useFlightRectGetter()
  const discardDialogStateRef = useRef(getPlayUiSnapshot().discardDialogState)
  const rollDieDialogStateRef = useRef(getPlayUiSnapshot().rollDieDialogState)
  const investmentSelectModeRef = useRef(getPlayUiSnapshot().investmentSelectMode)
  const removeInvestorsSelectModeRef = useRef(getPlayUiSnapshot().removeInvestorsSelectMode)
  const discardPropertySelectModeRef = useRef(getPlayUiSnapshot().discardPropertySelectMode)
  const takeoverSelectModeRef = useRef(getPlayUiSnapshot().takeoverSelectMode)
  const scandalSelectModeRef = useRef(getPlayUiSnapshot().scandalSelectMode)
  const rezoningModeRef = useRef(getPlayUiSnapshot().rezoningMode)
  const calamityAcceptPendingRef = useRef(getPlayUiSnapshot().calamityAcceptPending)

  const aiGsRef = useRef<GameState | null>(null)
  const aiCpRef = useRef<Player | null>(null)
  /** Stable call site for auto-ending the turn once 3 actions are spent (wired after scheduleEndOfTurn is defined). */
  const scheduleEndOfTurnRef = useRef<() => void>(() => {})
  const nudgeTurnAdvanceForSpentBudget = () => {
    toast.info(`All ${MAX_TURN_ACTIONS} actions used — moving to the next founder.`)
    scheduleEndOfTurnRef.current()
  }
  const aiHooksRef = useRef<SimpleAiTurnHandlers>({
    handleEndTurn: () => {},
    handleUndoLastActionCancel: () => {},
    handleActionCriteriaBank: () => {},
    handleCancelTakeoverSelect: () => {},
    handleCancelScandalSelect: () => {},
    handleCancelRezoning: () => {},
    handleCancelInvestmentSelect: () => {},
    handleCancelRemoveInvestorsSelect: () => {},
    handleCancelDiscardPropertySelect: () => {},
    handleConfirmDiscardProperty: () => {},
    handleDiscardActionCards: () => {},
    dismissTaxBuildPrompt: () => {},
    cancelPlacement: () => {},
    handlePlayCards: () => {},
    handlePlotSelect: () => {},
    handleBoardPlotSelect: () => {},
    handleRezoningPropertySelect: () => {},
    handleRezoningHousingDensity: () => {},
    handleEndGameDecision: () => {},
  })
  const aiUiRef = useRef<SimpleAiTurnUi | null>(null)
  const sessionRef = useRef<PlaySession>(null as unknown as PlaySession)

  useEffect(() => {
    const sync = () => {
      const ui = getPlayUiSnapshot()
      discardDialogStateRef.current = ui.discardDialogState
      rollDieDialogStateRef.current = ui.rollDieDialogState
      investmentSelectModeRef.current = ui.investmentSelectMode
      removeInvestorsSelectModeRef.current = ui.removeInvestorsSelectMode
      discardPropertySelectModeRef.current = ui.discardPropertySelectMode
      takeoverSelectModeRef.current = ui.takeoverSelectMode
      scandalSelectModeRef.current = ui.scandalSelectMode
      rezoningModeRef.current = ui.rezoningMode
      calamityAcceptPendingRef.current = ui.calamityAcceptPending
      const gs = getGameTableSnapshot()
      aiUiRef.current = {
        undoActionDialogOpen: ui.undoActionDialogOpen,
        boardNoticeActive: false,
        showNewCardsAnimation: !!gs.showNewCardsAnimation,
        taxBuildPromptOpen: ui.taxBuildPrompt.open,
        discardPropertyConfirmOpen: ui.discardPropertyConfirmOpen,
        discardDialogOpen: ui.discardDialogState.open,
        discardDialogNumToDiscard: ui.discardDialogState.numToDiscard,
        rollDieDialogOpen: ui.rollDieDialogState.open,
        incomeDialogOpen: ui.incomeDialogState.open,
        takeoverSelectActive: ui.takeoverSelectMode.active,
        scandalSelectActive: ui.scandalSelectMode.active,
        rezoningPhase: ui.rezoningMode.phase,
        investmentSelectActive: ui.investmentSelectMode.active,
        removeInvestorsSelectActive: ui.removeInvestorsSelectMode.active,
        discardPropertySelectActive: ui.discardPropertySelectMode.active,
        taxBuildModePhase: ui.taxBuildMode.phase,
        placementActive: ui.placementMode.active,
        placementPropertyCardId: ui.placementMode.propertyCardId,
        placementWildEmulatePropertyId: ui.placementMode.wildCardEmulatePropertyId,
        placementHousingHighDensity: ui.placementMode.housingHighDensity,
        actionCriteriaDialogOpen: ui.actionCriteriaDialog.open,
        selectValidPlots: ui.takeoverSelectMode.active
          ? ui.takeoverSelectMode.validPlots
          : ui.scandalSelectMode.active
            ? ui.scandalSelectMode.validPlots
            : ui.investmentSelectMode.active
              ? ui.investmentSelectMode.validPlots
              : ui.removeInvestorsSelectMode.active
                ? ui.removeInvestorsSelectMode.validPlots
                : undefined,
        investmentContributionMillion: ui.investmentSelectMode.active
          ? ui.investmentSelectMode.contributionMillion
          : undefined,
      }
    }
    sync()
    const unsubUi = subscribePlayUi(sync)
    const unsubTable = subscribeGameTable(sync)
    return () => {
      unsubUi()
      unsubTable()
    }
  }, [])

  const calamityCommitInFlightRef = useRef(false)
  const skipNextCalamityResultNoticeRef = useRef(false)

  onBoardFxRef.current = (fx: BoardFx) => {
    const audienceId = fx.audiencePlayerId
    const assessed =
      audienceId != null ? getGameTableSnapshot().players.find((p) => p.id === audienceId) : undefined
    const skipAiAssessment = assessed != null && isAiSeat(assessed)
    const localSeatId = getPlayUiSnapshot().session.handRailPlayerId
    const onlineTargeted = isOnlineActor && audienceId != null
    const showOnThisDevice =
      !skipAiAssessment && (!onlineTargeted || audienceId === localSeatId)

    if (showOnThisDevice) {
      if (fx.sound === 'construction') playConstructionSound()
      else if (fx.sound === 'anchor') playAnchorDropSound()
      else if (fx.sound === 'income') playIncomeSound()
      else if (fx.sound === 'boo') playCrowdBooSound()
      else if (fx.sound === 'cheer') playCrowdCheerSound()
      else if (fx.sound === 'dwindle') playInfluenceDwindleSound()
      else if (fx.sound === 'calamity') playCalamitySound(fx.calamityFace ?? 4)
      if (fx.notice) {
        showBoardNotice(fx.notice.title, fx.notice.detail, {
          durationMs: fx.notice.durationMs,
          tone: fx.notice.tone,
          replace: fx.notice.replace,
        })
      }
    }
  }

  /** Play a table effect on this device and mirror it to every other device in the room. */
  const broadcastBoardFx = (fx: BoardFx, opts?: { localEcho?: boolean }) => {
    if (opts?.localEcho !== false) onBoardFxRef.current(fx)
    if (isOnlineActor) sendFxRef.current(fx)
  }

  const broadcastDiceRollNotice = useCallback(
    (title: string, detail?: string, sound?: BoardFx['sound']) => {
      const diceTitle = title.startsWith('🎲') ? title : `🎲 ${title}`
      broadcastBoardFx({
        notice: { title: diceTitle, detail, durationMs: CALAMITY_OUTCOME_BANNER_MS },
        sound,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOnlineActor]
  )

  /** Prominent attacker-vs-defender outcome banner for confrontation cards. */
  const announceConfrontation = useCallback(
    (
      kind: ConfrontationKind,
      attackerName: string,
      targetName: string,
      outcome: ConfrontationOutcome,
      detail: string,
      sound?: BoardFx['sound'],
      titleOverride?: string
    ) => {
      broadcastBoardFx({
        notice: {
          title: titleOverride ?? confrontationNoticeTitle(kind, attackerName, targetName),
          detail: confrontationNoticeDetail(outcome, detail),
          durationMs: CALAMITY_OUTCOME_BANNER_MS,
        },
        sound,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOnlineActor]
  )

  /**
   * Table-wide drama when a vs-player action is laid / targeted.
   * Example: "Alice attempts Hostile Takeover of Bob's Firehouse 01"
   */
  const announceConfrontationAttempt = useCallback(
    (
      kind: ConfrontationKind,
      attackerName: string,
      targetName: string,
      detail: string,
      sound: BoardFx['sound'] = 'boo',
      titleOverride?: string
    ) => {
      broadcastBoardFx({
        notice: {
          title: titleOverride ?? confrontationAttemptTitle(kind, attackerName, targetName),
          detail: confrontationNoticeDetail('attempting', detail),
          durationMs: 5500,
        },
        sound,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOnlineActor]
  )

  onGameEventsRef.current = (events: GameEvent[]) => {
    const isAiName = (name?: string) =>
      !!name && safeGameState.players.some((p) => p.name === name && p.isAi)
    const actingIsAi = safeGameState.players[safeGameState.currentPlayerIndex]?.isAi === true
    for (const e of events) {
      if (e.type === 'toast') {
        if (e.level === 'error') toast.error(e.message)
        else if (e.level === 'success') toast.success(e.message)
        else toast.info(e.message)
      } else if (e.type === 'turn_changed') {
        toast.info(e.finalRound ? `${e.playerName}'s final turn` : `${e.playerName}'s turn`)
        window.setTimeout(() => {
          sendActionRef.current({ type: 'animation_flags_clear' }, { skipOptimistic: true })
        }, 2000)
      } else if (e.type === 'discard_required') {
        // Only the device controlling the acting seat resolves the discard:
        // the seated human's device, or the host when a bot is acting.
        const acting = gameState.players[gameState.currentPlayerIndex]
        const controlsActingSeat =
          !partyBoardConfig ||
          (acting?.isAi === true
            ? partyBoardConfig.role === 'host'
            : acting != null && partyBoardSeatPlayer != null && acting.id === partyBoardSeatPlayer.id)
        if (controlsActingSeat) {
          setDiscardDialogState({ open: true, numToDiscard: e.numToDiscard })
        }
      } else if (e.type === 'game_over') {
        toast.success(
          e.reason === 'endgame-deadline'
            ? 'Endgame deadline — scoring the city!'
            : 'Final Round complete — game over!'
        )
      } else if (e.type === 'end_game_offer') {
        toast.info(
          e.lastChance
            ? `${e.playerName} must declare the endgame now or the game ends immediately.`
            : `${e.playerName} has ${e.clusterSize} adjacent properties and may declare the endgame.`
        )
      } else if (e.type === 'build_celebration') {
        const title =
          e.suffix === ' anchored!' ? (
            <>
              ⚓ <strong>{e.lotName}</strong>
              {e.suffix}
            </>
          ) : (
            <>
              <strong>{e.lotName}</strong>
              {e.suffix}
            </>
          )
        showBoardNotice(title, e.detail, actingIsAi ? { quick: true } : undefined)
        if (e.suffix === ' anchored!') playAnchorDropSound()
        else playConstructionSound()
      } else if (e.type === 'council_freeze_result') {
        const freezeTitle = confrontationNoticeTitle(
          'City Council Freeze',
          e.attackerName,
          e.targetName
        )
        if (e.negated) {
          showBoardNotice(
            freezeTitle,
            confrontationNoticeDetail(
              'blocked',
              `${e.targetName} rolled 6 — freeze negated. They can build as usual.`
            ),
            isAiName(e.targetName) ? { quick: true } : undefined
          )
          playCrowdCheerSound()
        } else {
          showBoardNotice(
            freezeTitle,
            confrontationNoticeDetail(
              'success',
              `${e.targetName} rolled ${e.result} — freeze holds. They cannot build until they finish their next turn.`
            ),
            isAiName(e.targetName) ? { quick: true } : undefined
          )
          playCrowdBooSound()
        }
      } else if (e.type === 'rebuttal_result') {
        const kindLabel: ConfrontationKind =
          e.kind === 'scandal'
            ? 'Scandal'
            : e.kind === 'hostile-takeover'
              ? 'Hostile Takeover'
              : 'Police Raid on Mafia'
        const vsTitle = confrontationNoticeTitle(kindLabel, e.attackerName, e.targetName)
        if (e.negated) {
          showBoardNotice(
            e.kind === 'hostile-takeover' ? hostileTakeoverDefenseSuccessTitle() : vsTitle,
            confrontationNoticeDetail(
              'blocked',
              e.kind === 'hostile-takeover'
                ? `${e.targetName} rolled ${e.result} — the property stays with its owner.`
                : `${e.targetName} rolled ${e.result} — ${e.attackerName}'s play is repelled.`
            ),
            isAiName(e.targetName) && isAiName(e.attackerName) ? { quick: true } : undefined
          )
          playCrowdCheerSound()
        } else {
          showBoardNotice(
            e.kind === 'hostile-takeover' ? hostileTakeoverAttackerSuccessTitle() : vsTitle,
            confrontationNoticeDetail(
              'success',
              e.kind === 'hostile-takeover'
                ? `${e.attackerName} takes ${e.plotLabel ?? 'the lot'} — ownership changes.`
                : e.kind === 'scandal'
                  ? `Anchor overthrown${e.plotLabel ? ` at ${e.plotLabel}` : ''} — lot returns to vacant Anchor Tenet.`
                  : `Police Raid succeeds${e.plotLabel ? ` at ${e.plotLabel}` : ''} — Mafia lots return to vacant Anchor Tenet.`
            ),
            isAiName(e.targetName) && isAiName(e.attackerName) ? { quick: true } : undefined
          )
          playInfluenceDwindleSound()
        }
      } else if (e.type === 'calamity_result') {
        if (skipNextCalamityResultNoticeRef.current) {
          skipNextCalamityResultNoticeRef.current = false
        } else {
          showBoardNotice(
            'Calamity',
            calamityPostRollBannerDetail({
              face: e.result,
              playerName: e.playerName,
              percent: e.percent,
              lossMillion: e.lossMillion,
              variant: { key: '', title: e.variantTitle, flavor: e.variantFlavor },
            }) + (e.cityWideComplete ? '\nCalamity resolved — play resumes.' : ''),
            { tone: 'calamity', durationMs: CALAMITY_OUTCOME_BANNER_MS }
          )
          playCalamitySound(e.result)
        }
      }
    }
  }

  // D11 plot fix - moved into useEffect to avoid setState during render
  useEffect(() => {
    const d11Plot = gameState.plots?.find(p => p.row === 11 && p.col === 'D')
    if (d11Plot && d11Plot.building === 'Housing') {
      setGameState((current) => {
        const updatedPlots = current.plots.map(p =>
          p.row === 11 && p.col === 'D' ? { ...p, building: 'Reese Park' } : p
        )
        return { ...current, plots: updatedPlots }
      })
    }
  }, [gameState.plots, setGameState])


  const safeGameState: GameState = {
    ...gameState,
    players: gameState.players || [],
    plots: gameState.plots || [],
    actionDeck: gameState.actionDeck || [],
    propertyDeck: gameState.propertyDeck || [],
    actionDiscard: gameState.actionDiscard || [],
    propertyDiscard: gameState.propertyDiscard || [],
    turnActionsConsumed: gameState.turnActionsConsumed ?? 0,
    incomeResolvedThisTurn: gameState.incomeResolvedThisTurn ?? false,
    pendingIncomeTaxPlayerIds: gameState.pendingIncomeTaxPlayerIds ?? [],
  }

  // Keep the host/device screen awake while a table is in progress (prevents AI timer starvation).
  useEffect(() => {
    if (!safeGameState.isSetupComplete || safeGameState.gameEnded) {
      void disablePlayKeepAwake()
      return
    }
    void enablePlayKeepAwake()
    return () => {
      void disablePlayKeepAwake()
    }
  }, [safeGameState.isSetupComplete, safeGameState.gameEnded])

  const plotsByCoordKey = useMemo(() => {
    const m = new Map<string, Plot>()
    for (const p of safeGameState.plots) m.set(`${p.row}|${p.col}`, p)
    return m
  }, [safeGameState.plots])
  const getPlotAt = useCallback(
    (row: number, col: string) => plotsByCoordKey.get(`${row}|${col}`),
    [plotsByCoordKey]
  )

  /** Shown briefly when `playRoundNumber` becomes each even round ≥ 2 (not for the whole round). */
  const MOTIVATIONAL_EVEN_ROUND_FLASH_MS = 4000
  const { compact: isCompactLayout, landscape: isLandscapeLayout } = useCompactGameLayout()

  useEffect(() => {
    const prn = gameState.playRoundNumber ?? 1
    if (
      gameState.gameEnded === true ||
      gameState.openingNarrationComplete === false ||
      prn < 2 ||
      prn % 2 !== 0
    ) {
      setMotivationalFlashRound(null)
      return
    }

    setMotivationalFlashRound(prn, MOTIVATIONAL_EVEN_ROUND_FLASH_MS)
    return () => setMotivationalFlashRound(null)
  }, [
    gameState.playRoundNumber,
    gameState.gameEnded,
    gameState.openingNarrationComplete,
  ])

  /** Lot placement: Escape cancels (replaces removed hand-rail Cancel). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (isSpectator) return
      const pm = getPlayUiSnapshot().placementMode
      if (!pm.active || pm.propertyCardId == null) return
      e.preventDefault()
      setPlacementMode({
        active: false,
        propertyCardId: null,
        housingHighDensity: undefined,
        taxBuildActionInstanceId: undefined,
        wildCardEmulatePropertyId: undefined,
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isSpectator])

  useEffect(() => {
    if (!gameState.endGameTriggered || gameState.gameEnded) {
      setFinalTurnBanner(null)
      return
    }
    const current = gameState.players[gameState.currentPlayerIndex]
    setFinalTurnBanner({
      triggererName:
        gameState.players.find((p) => p.id === gameState.endGameTriggerPlayerId)?.name ?? 'A founder',
      currentPlayerName: current?.name ?? 'Founder',
      currentPlayerColor: current?.color ?? '#ffffff',
      turnsRemainingThisRound: gameState.finalRoundTurnsRemaining ?? 1,
    })
  }, [
    gameState.endGameTriggered,
    gameState.gameEnded,
    gameState.currentPlayerIndex,
    gameState.endGameTriggerPlayerId,
    gameState.finalRoundTurnsRemaining,
    gameState.players,
  ])

  /** Drives the card-flight diff. Holds the previous safeGameState we last reconciled against. */
  const prevFlightStateRef = useRef<{
    handByPlayer: Map<number, { property: Set<string>; action: Set<string> }>
    propertyDiscardIds: Set<string>
    actionDiscardIds: Set<string>
    isSetupComplete: boolean
  } | null>(null)

  onGuestSnapshotAppliedRef.current = () => {
    prevFlightStateRef.current = null
    setOverlayCardFlights((q) => (q.length === 0 ? q : []))
    setOverlayHiddenInstanceIds((s) => (s.size === 0 ? s : new Set()))
    // Clear local board-interaction shells that soft-lock a guest after desync.
    // Pending online defenses re-open from shared state effects below.
    setPlacementMode({
      active: false,
      propertyCardId: null,
      housingHighDensity: undefined,
      taxBuildActionInstanceId: undefined,
      wildCardEmulatePropertyId: undefined,
    })
    setTakeoverSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    setScandalSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    setInvestmentSelectMode({
      active: false,
      validPlots: [],
      actionInstanceId: null,
      contributionMillion: 4,
    })
    setRemoveInvestorsSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    setDiscardPropertySelectMode({
      active: false,
      actionInstanceId: null,
      selectedPropertyInstanceIds: [],
    })
  }

  // Host device: warn when the table authority is backgrounded (common freeze cause).
  useEffect(() => {
    if (partyBoardConfig?.role !== 'host') {
      setHostAwayWarning(false)
      return
    }
    const sync = () => setHostAwayWarning(document.visibilityState !== 'visible')
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [partyBoardConfig?.role])

  /** After every state update, diff prev↔current to detect cards entering the current player's hand
   *  (queue draw flights from the appropriate deck) or entering a discard pile (queue discard flights from
   *  the hand position). useLayoutEffect runs *before* paint so the hidden-set update lands in the same frame
   *  as the new card slot's render — avoiding a single-frame "card pops in then disappears" flash.
   *  We depend on `gameState` (a stable reference from useState) rather than the recomputed `safeGameState`
   *  literal, otherwise the effect would fire on every render.
   */
  useLayoutEffect(() => {
    const cur = safeGameState
    if (!cur.isSetupComplete) {
      prevFlightStateRef.current = null
      setOverlayCardFlights((q) => (q.length === 0 ? q : []))
      setOverlayHiddenInstanceIds((s) => (s.size === 0 ? s : new Set()))
      return
    }

    const curHandByPlayer = new Map<number, { property: Set<string>; action: Set<string> }>()
    cur.players.forEach((p) => {
      curHandByPlayer.set(p.id, {
        property: new Set(p.propertyCards.map((c) => c.instanceId)),
        action: new Set(p.actionCards.map((c) => c.instanceId)),
      })
    })
    const curPropDiscardIds = new Set(cur.propertyDiscard.map((c) => c.instanceId))
    const curActDiscardIds = new Set(cur.actionDiscard.map((c) => c.instanceId))

    const prev = prevFlightStateRef.current
    if (!prev) {
      // First reconciliation post-setup: record the starting hand without animating
      // every card (10 flights looked like a full reshuffle on screen).
      prevFlightStateRef.current = {
        handByPlayer: curHandByPlayer,
        propertyDiscardIds: curPropDiscardIds,
        actionDiscardIds: curActDiscardIds,
        isSetupComplete: cur.isSetupComplete,
      }
      return
    }

    /** Per-tick flight queue. Order: discards first (so the user sees what was just played leave the hand)
     *  then draws (so replenish lands in the freshly emptied hand). */
    const queued: CardFlight[] = []
    const newlyHidden: string[] = []
    let drawStagger = 0
    let discardStagger = 0

    // 1) Discards: anything new in either discard pile gets an "out of the hand" flight from the slot
    //    rect. Solo vs bots: AI discards use a face-down back so identities stay hidden (human discards stay face-up).
    const soloTableVersusBots = isSinglePlayerVersusBots(cur.players)
    const onlineMultiHuman = partyBoardConfig != null && !soloTableVersusBots
    const handRailFounderId =
      partyBoardConfig?.role === 'guest'
        ? (partyBoardSeatPlayer?.id ?? resolveGuestSeatForRemap(cur, partyBoardConfig.displayName ?? '')?.id)
        : soloTableVersusBots
          ? cur.players.find((p) => p.isAi !== true)?.id
          : partyBoardConfig
            ? // Online host: the rail is ALWAYS this device's seat — never follow the
              // acting player, which would leak bot/rival hands as turns rotate.
              (partyBoardSeatPlayer?.id ??
                resolveGuestSeatForRemap(cur, partyBoardConfig.displayName ?? '')?.id ??
                cur.players.find((p) => p.isAi !== true)?.id)
            : cur.players[cur.currentPlayerIndex]?.id

    const newPropertyDiscards = cur.propertyDiscard.filter((c) => !prev.propertyDiscardIds.has(c.instanceId))
    const newActionDiscards = cur.actionDiscard.filter((c) => !prev.actionDiscardIds.has(c.instanceId))

    const fallbackPropertyHandRect = getFlightRect(
      handTargetAnchorKey(cur.players[cur.currentPlayerIndex]?.id ?? -1, 'property')
    )
    const fallbackActionHandRect = getFlightRect(
      handTargetAnchorKey(cur.players[cur.currentPlayerIndex]?.id ?? -1, 'action')
    )

    const findOriginPlayer = (instanceId: string): number | null => {
      let foundPlayerId: number | null = null
      prev.handByPlayer.forEach((sets, pid) => {
        if (sets.property.has(instanceId) || sets.action.has(instanceId)) foundPlayerId = pid
      })
      return foundPlayerId
    }

    newPropertyDiscards.forEach((inst) => {
      const ownerPlayerId = findOriginPlayer(inst.instanceId)
      if (onlineMultiHuman && ownerPlayerId != null && ownerPlayerId !== handRailFounderId) return
      const owner = ownerPlayerId != null ? cur.players.find((p) => p.id === ownerPlayerId) : undefined
      const concealDiscard =
        soloTableVersusBots === true && owner?.isAi === true && ownerPlayerId !== null
      const sourceRect =
        (ownerPlayerId != null ? getFlightRect(handCardAnchorKey(ownerPlayerId, inst.instanceId)) : null) ??
        fallbackPropertyHandRect
      if (!sourceRect) return
      queued.push(makeDiscardFlight(inst, 'property', sourceRect, discardStagger++ * 100, concealDiscard))
    })
    newActionDiscards.forEach((inst) => {
      const ownerPlayerId = findOriginPlayer(inst.instanceId)
      if (onlineMultiHuman && ownerPlayerId != null && ownerPlayerId !== handRailFounderId) return
      const owner = ownerPlayerId != null ? cur.players.find((p) => p.id === ownerPlayerId) : undefined
      const concealDiscard =
        soloTableVersusBots === true && owner?.isAi === true && ownerPlayerId !== null
      const sourceRect =
        (ownerPlayerId != null ? getFlightRect(handCardAnchorKey(ownerPlayerId, inst.instanceId)) : null) ??
        fallbackActionHandRect
      if (!sourceRect) return
      queued.push(makeDiscardFlight(inst, 'action', sourceRect, discardStagger++ * 100, concealDiscard))
    })

    // 2) Draws into this device's hand rail only (online guests never animate draws into rivals' hidden hands).
    const handRailFounder =
      handRailFounderId != null ? cur.players.find((p) => p.id === handRailFounderId) : undefined
    if (handRailFounder) {
      const prevHand = prev.handByPlayer.get(handRailFounder.id)
      const propTargetRect = getFlightRect(handTargetAnchorKey(handRailFounder.id, 'property'))
      const actTargetRect = getFlightRect(handTargetAnchorKey(handRailFounder.id, 'action'))
      const propDeckRect = getFlightRect(PROPERTY_DECK_ANCHOR_KEY)
      const actDeckRect = getFlightRect(ACTION_DECK_ANCHOR_KEY)

      const newPropertyDraws = handRailFounder.propertyCards.filter(
        (inst) => !prevHand?.property.has(inst.instanceId)
      )
      const newActionDraws = handRailFounder.actionCards.filter(
        (inst) => !prevHand?.action.has(inst.instanceId)
      )
      // Only animate the cards drawn this tick (max 2 — matches turn replenish).
      const propertyToAnimate = newPropertyDraws.slice(-MAX_DRAW_FLIGHTS_PER_TICK)
      const actionToAnimate = newActionDraws.slice(-MAX_DRAW_FLIGHTS_PER_TICK)

      propertyToAnimate.forEach((inst) => {
        if (!propDeckRect || !propTargetRect) return
        const targetRect = resolveHandDrawTargetRect(getFlightRect, handRailFounder.id, inst.instanceId, propTargetRect)
        if (!targetRect) return
        queued.push(
          makeDrawFlight(
            inst,
            'property',
            propDeckRect,
            targetRect,
            drawStagger++ * REPLENISH_DRAW_STAGGER_MS,
            HAND_DRAW_DURATION_SEC
          )
        )
        newlyHidden.push(inst.instanceId)
      })
      actionToAnimate.forEach((inst) => {
        if (!actDeckRect || !actTargetRect) return
        const targetRect = resolveHandDrawTargetRect(getFlightRect, handRailFounder.id, inst.instanceId, actTargetRect)
        if (!targetRect) return
        queued.push(
          makeDrawFlight(
            inst,
            'action',
            actDeckRect,
            targetRect,
            drawStagger++ * REPLENISH_DRAW_STAGGER_MS,
            HAND_DRAW_DURATION_SEC
          )
        )
        newlyHidden.push(inst.instanceId)
      })
    }

    if (queued.length > 0) {
      setOverlayCardFlights((q) => [...q, ...queued])
      if (newlyHidden.length > 0) {
        setOverlayHiddenInstanceIds((s) => {
          const next = new Set(s)
          newlyHidden.forEach((id) => next.add(id))
          return next
        })
      }
    }

    prevFlightStateRef.current = {
      handByPlayer: curHandByPlayer,
      propertyDiscardIds: curPropDiscardIds,
      actionDiscardIds: curActDiscardIds,
      isSetupComplete: cur.isSetupComplete,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState])

  const handleGuestJoined = useCallback((gs: GameState, cfg: PartyBoardSyncConfig) => setup.guestJoined(sessionRef.current, gs, cfg), [])

  const handleResumeHostTable = useCallback((gs: GameState, cfg: PartyBoardSyncConfig) => setup.resumeHostTable(sessionRef.current, gs, cfg), [])

  /**
   * Online council-freeze handoff. When a pending defense appears in shared state,
   * every device announces it; the device controlling the target seat (their own
   * screen, or the host for a bot) opens the negate-roll dice dialog. When the
   * defense resolves on another device, any stale local dialog is closed.
   */
  const pendingFreezeDefense = gameState.pendingCouncilFreezeDefense ?? null
  const pendingFreezeKey = pendingFreezeDefense
    ? `${pendingFreezeDefense.targetPlayerId}|${pendingFreezeDefense.attackerPlayerId}`
    : ''
  const announcedFreezeKeyRef = useRef('')
  useEffect(() => {
    const run = () => {
    const pending = gameState.pendingCouncilFreezeDefense
    if (!pending) {
      announcedFreezeKeyRef.current = ''
      setRollDieDialogState((prev) =>
        prev.open &&
        prev.mode === 'council-freeze-defender' &&
        prev.actionInstanceId === REMOTE_COUNCIL_FREEZE_DEFENSE_ID
          ? { open: false, mode: 'roll-die', actionInstanceId: null }
          : prev
      )
      return
    }

    const defender = gameState.players.find((p) => p.id === pending.targetPlayerId)
    if (announcedFreezeKeyRef.current !== pendingFreezeKey) {
      announcedFreezeKeyRef.current = pendingFreezeKey
      showBoardNotice(
        defenseRollRequiredTitle('City Council Freeze', pending.targetName),
        defender?.isAi === true
          ? `${pending.attackerName} succeeded — ${pending.targetName} (computer) rolls to negate.`
          : `${pending.attackerName} succeeded — ${pending.targetName} must roll a 6 to negate the freeze.`
      )
    }

    // Offline solo / host-driven bots: host always owns AI defense rolls.
    const controlsDefender =
      defender?.isAi === true
        ? !partyBoardConfig || partyBoardConfig.role === 'host'
        : partyBoardSeatPlayer?.id === pending.targetPlayerId
    if (!controlsDefender) return

    // Force the defender dialog even if an attacker dialog is still open — `prev.open ? prev`
    // previously left City Council Freeze stuck on the badge with no usable roll UI.
    setRollDieDialogState((prev) => {
      if (
        prev.open &&
        prev.mode === 'council-freeze-defender' &&
        prev.targetPlayerId === pending.targetPlayerId &&
        prev.actionInstanceId === REMOTE_COUNCIL_FREEZE_DEFENSE_ID
      ) {
        return prev
      }
      return {
        open: true,
        mode: 'council-freeze-defender',
        actionInstanceId: REMOTE_COUNCIL_FREEZE_DEFENSE_ID,
        targetPlayerId: pending.targetPlayerId,
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
      }
    })
    }
    run()
    return subscribePlayUi(run)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pendingFreezeKey,
    partyBoardConfig?.role,
    partyBoardSeatPlayer?.id,
  ])

  /** Online rebuttal handoff — scandal, hostile takeover, police raid defender rolls. */
  const pendingRebuttal = gameState.pendingRebuttalRoll ?? null
  const pendingRebuttalKey = pendingRebuttal
    ? `${pendingRebuttal.kind}|${pendingRebuttal.targetPlayerId}|${pendingRebuttal.actionInstanceId}`
    : ''
  const announcedRebuttalKeyRef = useRef('')
  useEffect(() => {
    const run = () => {
    const pending = gameState.pendingRebuttalRoll
    if (!pending) {
      announcedRebuttalKeyRef.current = ''
      setRollDieDialogState((prev) =>
        prev.open &&
        prev.mode.endsWith('-defender') &&
        prev.actionInstanceId === REMOTE_REBUTTAL_ROLL_ID
          ? { open: false, mode: 'roll-die', actionInstanceId: null }
          : prev
      )
      return
    }

    const defender = gameState.players.find((p) => p.id === pending.targetPlayerId)
    if (announcedRebuttalKeyRef.current !== pendingRebuttalKey) {
      announcedRebuttalKeyRef.current = pendingRebuttalKey
      const kindTitle =
        pending.kind === 'scandal'
          ? 'Scandal'
          : pending.kind === 'hostile-takeover'
            ? 'Hostile Takeover'
            : 'Police Raid on Mafia'
      const defenseDetail =
        defender?.isAi === true
          ? `${pending.attackerName} succeeded. ${pending.targetName} (computer) initiates the defense roll.`
          : `${pending.attackerName} succeeded. ${pending.targetName} rolls on their own screen.`
      showBoardNotice(defenseRollRequiredTitle(kindTitle, pending.targetName), defenseDetail)
      if (pending.kind !== 'hostile-takeover') {
        broadcastBoardFx(
          {
            sound: 'cheer',
            notice: {
              title: defenseRollRequiredTitle(kindTitle, pending.targetName),
              detail:
                defender?.isAi === true
                  ? `${pending.targetName} (computer) is rolling.`
                  : `${pending.targetName} is rolling.`,
            },
          },
          { localEcho: false }
        )
      }
    }

    const controlsDefender =
      defender?.isAi === true
        ? !partyBoardConfig || partyBoardConfig.role === 'host'
        : partyBoardSeatPlayer?.id === pending.targetPlayerId
    if (!controlsDefender) return

    const defenderMode =
      pending.kind === 'scandal'
        ? 'scandal-defender'
        : pending.kind === 'hostile-takeover'
          ? 'hostile-takeover-defender'
          : 'police-raid-defender'

    setRollDieDialogState((prev) => {
      if (
        prev.open &&
        prev.mode === defenderMode &&
        prev.targetPlayerId === pending.targetPlayerId &&
        prev.actionInstanceId === REMOTE_REBUTTAL_ROLL_ID
      ) {
        return prev
      }
      return {
        open: true,
        mode: defenderMode,
        actionInstanceId: REMOTE_REBUTTAL_ROLL_ID,
        targetPlayerId: pending.targetPlayerId,
        influenceBonus: pending.policeRaidInfluenceBonus ?? 0,
        influenceLabels: pending.policeRaidInfluenceLabels ?? [],
        scandalContext: pending.scandalContext,
        takeoverContext: pending.takeoverContext,
        councilFreezeAttackerRollsCompleted: undefined,
        councilFreezeAttackerLastNatural: undefined,
        councilFreezeFailAuto: false,
        diceRetryNonce: 0,
        rezoningContext: undefined,
        removeInvestorsContext: undefined,
      }
    })
    }
    run()
    return subscribePlayUi(run)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pendingRebuttalKey,
    partyBoardConfig?.role,
    partyBoardSeatPlayer?.id,
  ])

  /** City-wide Calamity — each founder rolls on the device that controls their seat. */
  const pendingCalamity = gameState.pendingCalamity ?? null
  const pendingCalamityKey = pendingCalamity
    ? `${pendingCalamity.instance.instanceId}|${pendingCalamity.currentRollIndex}|${pendingCalamity.rollOrderPlayerIds.join(',')}`
    : ''
  const announcedCalamityKeyRef = useRef('')
  useEffect(() => {
    const run = () => {
    const pending = gameState.pendingCalamity
    if (!pending) {
      announcedCalamityKeyRef.current = ''
      setCalamityAcceptPending(null)
      setRollDieDialogState((prev) =>
        prev.open && prev.mode === 'calamity'
          ? { open: false, mode: 'roll-die', actionInstanceId: null }
          : prev
      )
      return
    }
    if (gameState.openingNarrationComplete === false) return
    if (getPlayUiSnapshot().calamityAcceptPending) return
    if (getOverlaySnapshot().boardNotice?.tone === 'calamity') return

    const rollerId = pending.rollOrderPlayerIds[pending.currentRollIndex]
    const roller = gameState.players.find((p) => p.id === rollerId)
    const announceKey = `${pending.instance.instanceId}|${pending.currentRollIndex}`
    if (announcedCalamityKeyRef.current !== announceKey) {
      announcedCalamityKeyRef.current = announceKey
      // Humans get a 2s pre-roll banner; Founderbots skip it so the table does not
      // sit idle. Calamity *outcome* banners still serialize the next roll.
      if (pending.currentRollIndex === 0 && !isAiSeat(roller)) {
        const step = pending.currentRollIndex + 1
        const total = pending.rollOrderPlayerIds.length
        showBoardNotice(
          'Calamity',
          `${CALAMITY_PRE_ROLL_INSTRUCTION}\n${pending.drawnByName} drew Calamity. ${roller?.name ?? 'The next founder'} rolls first (${step} of ${total}).`,
          { tone: 'calamity', durationMs: CALAMITY_OUTCOME_BANNER_MS }
        )
        return
      }
    }

    const controlsRoller =
      !partyBoardConfig
        ? true
        : isAiSeat(roller)
          ? partyBoardConfig.role === 'host'
          : partyBoardSeatPlayer?.id === rollerId
    if (!controlsRoller) return

    setRollDieDialogState((prev) => {
      if (
        prev.open &&
        prev.mode === 'calamity' &&
        prev.targetPlayerId === rollerId &&
        prev.actionInstanceId === pending.instance.instanceId
      ) {
        return prev
      }
      return {
        open: true,
        mode: 'calamity',
        actionInstanceId: pending.instance.instanceId,
        targetPlayerId: rollerId,
        influenceBonus: 0,
        influenceLabels: [],
        councilFreezeAttackerRollsCompleted: undefined,
        councilFreezeAttackerLastNatural: undefined,
        councilFreezeFailAuto: false,
        diceRetryNonce: pending.currentRollIndex,
        takeoverContext: undefined,
        rezoningContext: undefined,
        scandalContext: undefined,
        removeInvestorsContext: undefined,
      }
    })
    }
    run()
    const unsubUi = subscribePlayUi(run)
    const unsubOverlay = subscribeOverlay(run)
    return () => {
      unsubUi()
      unsubOverlay()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pendingCalamityKey,
    partyBoardConfig?.role,
    partyBoardSeatPlayer?.id,
    gameState.openingNarrationComplete,
  ])

  const handleCalamitySettled = useCallback((info: { face: number; variant: { key: string; title: string; flavor: string } }) => calamity.calamitySettled(sessionRef.current, info), [])

  /** Mirror local dice-dialog drama to every device (attacker rolls, income, etc.). */
  const announcedLocalDramaKeyRef = useRef('')
  useEffect(() => {
    const run = () => {
    if (!getPlayUiSnapshot().rollDieDialogState.open) {
      announcedLocalDramaKeyRef.current = ''
      return
    }
    const mode = getPlayUiSnapshot().rollDieDialogState.mode
    // Attacker "attempting" banners fire at target-commit; keep drama for defenses + rezoning only.
    const dramaModes = new Set([
      'hostile-takeover-defender',
      'scandal-defender',
      'council-freeze-defender',
      'police-raid-defender',
      'rezoning',
    ])
    if (!dramaModes.has(mode)) return
    const key = `${mode}|${getPlayUiSnapshot().rollDieDialogState.diceRetryNonce ?? 0}|${getPlayUiSnapshot().rollDieDialogState.actionInstanceId ?? ''}`
    if (announcedLocalDramaKeyRef.current === key) return
    announcedLocalDramaKeyRef.current = key
    const titles: Record<string, { title: string; detail: string }> = {
      'hostile-takeover-defender': {
        title: defenseRollRequiredTitle(
          'Hostile Takeover',
          safeGameState.players.find((p) => p.id === getPlayUiSnapshot().rollDieDialogState.takeoverContext?.ownerPlayerId)
            ?.name ?? 'Owner'
        ),
        detail: 'Only a 6 blocks the takeover.',
      },
      'scandal-defender': {
        title: defenseRollRequiredTitle(
          'Scandal',
          safeGameState.players.find(
            (p) => p.id === getPlayUiSnapshot().rollDieDialogState.scandalContext?.anchorOwnerPlayerId
          )?.name ?? 'Anchor owner'
        ),
        detail: 'Only a 6 negates the scandal.',
      },
      'council-freeze-defender': {
        title: defenseRollRequiredTitle(
          'City Council Freeze',
          getPlayUiSnapshot().rollDieDialogState.targetPlayerId != null
            ? safeGameState.players.find((p) => p.id === getPlayUiSnapshot().rollDieDialogState.targetPlayerId)?.name ??
                'Founder'
            : 'Founder'
        ),
        detail: 'Only a 6 negates the freeze.',
      },
      'police-raid-defender': {
        title: defenseRollRequiredTitle(
          'Police Raid on Mafia',
          getPlayUiSnapshot().rollDieDialogState.targetPlayerId != null
            ? safeGameState.players.find((p) => p.id === getPlayUiSnapshot().rollDieDialogState.targetPlayerId)?.name ??
                'Mafia owner'
            : 'Mafia owner'
        ),
        detail: 'Mafia owner rolls to repel the raid.',
      },
      rezoning: {
        title: attackRollRequiredTitle(
          'Rezoning',
          safeGameState.players[safeGameState.currentPlayerIndex]?.name ?? 'Founder'
        ),
        detail: 'Founder is rolling to rezone a vacant lot.',
      },
    }
    const copy = titles[mode]
    if (copy) {
      broadcastBoardFx({ notice: copy, sound: mode.includes('defender') ? 'cheer' : 'boo' }, { localEcho: false })
    }
    }
    run()
    return subscribePlayUi(run)
  }, [safeGameState.players, safeGameState.currentPlayerIndex])

  const announcedIncomeKeyRef = useRef('')
  const actingSeatIsAi = safeGameState.players[safeGameState.currentPlayerIndex]?.isAi === true
  useEffect(() => {
    const run = () => {
    if (!getPlayUiSnapshot().incomeDialogState.open) {
      announcedIncomeKeyRef.current = ''
      income.incomeCompleteLockRef.current = false
      return
    }
    const incomeActorIsAi = getPlayUiSnapshot().incomeDialogState.player?.isAi === true || actingSeatIsAi
    // Founderbots with no lots only hit this dialog if a play leaked through —
    // never splash the table with a roll banner for a bank/cancel.
    if (incomeActorIsAi && getPlayUiSnapshot().incomeDialogState.hasBuiltPropertiesForIncomeRoll !== true) {
      return
    }
    const key = `${getPlayUiSnapshot().incomeDialogState.player?.id ?? ''}|${getPlayUiSnapshot().incomeDialogState.actionInstanceId ?? ''}`
    if (announcedIncomeKeyRef.current === key) return
    announcedIncomeKeyRef.current = key
    broadcastBoardFx(
      {
        notice: {
          title: '🎲 Income resolution',
          detail: `${getPlayUiSnapshot().incomeDialogState.player?.name ?? 'A founder'} is rolling for income.`,
          durationMs: CALAMITY_OUTCOME_BANNER_MS,
          replace: true,
        },
      },
      { localEcho: false }
    )
    }
    run()
    return subscribePlayUi(run)
  }, [actingSeatIsAi])

  // Leftover Founderbot Income dialog (HMR / failed autoplay) must not stay open —
  // it stalls the AI tick (`incomeDialogOpen`) and rerolls forever.
  useEffect(() => {
    const run = () => {
    if (!getPlayUiSnapshot().incomeDialogState.open || !isAiSeat(getPlayUiSnapshot().incomeDialogState.player)) return
    setIncomeDialogState((s) =>
      s.open ? { ...s, open: false, player: null, actionInstanceId: null } : s
    )
    }
    run()
    return subscribePlayUi(run)
  }, [])

  const handleSetupComplete = (players: Player[], partyBoard?: PartyBoardSyncMeta) => setup.setupComplete(sessionRef.current, players, partyBoard)

  const handlePlayCards = (propertyInstanceId: string | null, actionInstanceIds: string[], convertToCashInstanceIds: string[], options?: PlayCardsOptions) => playCards.playCards(sessionRef.current, propertyInstanceId, actionInstanceIds, convertToCashInstanceIds, options)

  const handlePlotSelect = (row: number, col: string) => plots.plotSelect(sessionRef.current, row, col)

  const handleEndTurn = () => turn.endTurn(sessionRef.current)
  const handleEndGameDecision = (declare: boolean) => turn.endGameDecision(sessionRef.current, declare)

  /**
   * Auto-end guard. Once a founder consumes all 3 turn actions (1 build + 2 actions, or
   * 0 builds + 3 actions), end the turn on the next tick. Only one auto-end may be pending
   * at a time so resolution paths and the idle-state fallback never double-advance.
   *
   * Generation token: if the seat advances before the timeout fires (e.g. online authority
   * already applied end_turn), the stale callback must not run against the next founder —
   * that was forcing discard-to-8 on their start-of-turn draw 2.
   */
  const autoEndTurnScheduledRef = useRef(false)
  const autoEndTurnGenerationRef = useRef(0)
  const scheduleEndOfTurn = () => {
    if (autoEndTurnScheduledRef.current) return
    autoEndTurnScheduledRef.current = true
    const generation = autoEndTurnGenerationRef.current
    const seatAtSchedule =
      aiGsRef.current?.currentPlayerIndex ?? safeGameState.currentPlayerIndex
    window.setTimeout(() => {
      autoEndTurnScheduledRef.current = false
      if (generation !== autoEndTurnGenerationRef.current) return
      if (aiGsRef.current?.currentPlayerIndex !== seatAtSchedule) return
      // Only auto-end after the 3-action budget is spent — never against a fresh seat
      // that just received its start-of-turn draw 2.
      if (!turnLimitReached(aiGsRef.current?.turnActionsConsumed)) return
      handleEndTurn()
    }, 0)
  }
  scheduleEndOfTurnRef.current = scheduleEndOfTurn
  sessionRef.current = {
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
    sendGameClear,
    handInteractionsActive: false,
  }

  // Invalidate any pending auto-end when the acting seat changes.
  useEffect(() => {
    autoEndTurnGenerationRef.current += 1
    autoEndTurnScheduledRef.current = false
    // A turn change must never leave the previous founder's discard dialog open on
    // the new founder (who may legally hold 9+ after their start-of-turn draw 2).
    setDiscardDialogState((prev) => (prev.open ? { open: false, numToDiscard: 0 } : prev))
    // Placement belongs to exactly one acting seat. Never carry its property instance id
    // into the next founder's hand, where applyBuildAt would correctly reject it as missing.
    setPlacementMode({
      active: false,
      propertyCardId: null,
      housingHighDensity: undefined,
      taxBuildActionInstanceId: undefined,
      wildCardEmulatePropertyId: undefined,
    })
  }, [safeGameState.currentPlayerIndex])

  /**
   * Idle-state safety net: if the acting founder has used all 3 actions and nothing is
   * mid-resolution (no dialog, placement, selection, or pending freeze), end their turn.
   * Applies to humans and Founderbots this device controls (solo host or online host AI).
   */
  const actingSeatForAutoEnd = safeGameState.players[safeGameState.currentPlayerIndex]
  const localControlsActingSeat = !partyBoardConfig
    ? true // solo / local: this device drives every seat, including Founderbots
    : actingSeatForAutoEnd?.isAi === true
      ? partyBoardConfig.role === 'host'
      : partyBoardSeatPlayer?.id === actingSeatForAutoEnd?.id
  const boardIdleForAutoEnd =
    !isPlayUiBlockingTurnAdvance(getPlayUiSnapshot()) && shouldAutoAdvanceTurn(safeGameState)
  useEffect(() => {
    const maybeAdvance = () => {
      const gs = aiGsRef.current
      if (!gs?.isSetupComplete || gs.gameEnded) return
      if (gs.openingNarrationComplete === false) return
      if (!localControlsActingSeat) return
      if (isPlayUiBlockingTurnAdvance(getPlayUiSnapshot())) return
      if (!shouldAutoAdvanceTurn(gs)) return
      scheduleEndOfTurn()
    }
    maybeAdvance()
    return subscribePlayUi(maybeAdvance)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    safeGameState.turnActionsConsumed,
    safeGameState.currentPlayerIndex,
    safeGameState.isSetupComplete,
    safeGameState.gameEnded,
    safeGameState.openingNarrationComplete,
    safeGameState.pendingEndGameDeclaration,
    localControlsActingSeat,
  ])

  const handleDiscardComplete = (discardedInstanceIds: string[]) => turn.discardComplete(sessionRef.current, discardedInstanceIds)

  /** Stable identity so DiscardDialog AI auto-confirm doesn't reset its timeout every render. */
  const handleDiscardCompleteRef = useRef(handleDiscardComplete)
  handleDiscardCompleteRef.current = handleDiscardComplete
  const stableHandleDiscardComplete = useCallback((discardedInstanceIds: string[]) => {
    handleDiscardCompleteRef.current(discardedInstanceIds)
  }, [])

  const handleCancelInvestmentSelect = () => plots.cancelInvestmentSelect(sessionRef.current)

  const handleCancelDiscardPropertySelect = () => plots.cancelDiscardPropertySelect(sessionRef.current)

  const handleToggleDiscardPropertySelection = (propertyInstanceId: string) => plots.toggleDiscardPropertySelection(sessionRef.current, propertyInstanceId)

  /**
   * Resolve Discard Property Cards for the acting seat.
   * Optional overrides let Founderbots finish without the host hand UI
   * (solo tables pin the human hand rail, so AI select mode looked like the host's cards).
   */
  const handleConfirmDiscardProperty = (selectedPropertyInstanceIds?: string[], actionInstanceIdOverride?: string) => plots.confirmDiscardProperty(sessionRef.current, selectedPropertyInstanceIds, actionInstanceIdOverride)

  const handleInvestmentPlotSelect = (row: number, col: string) => plots.investmentPlotSelect(sessionRef.current, row, col)

  const handleCancelRemoveInvestorsSelect = () => plots.cancelRemoveInvestorsSelect(sessionRef.current)

  const handleRemoveInvestorsPlotSelect = (row: number, col: string) => plots.removeInvestorsPlotSelect(sessionRef.current, row, col)

  const handleActionCriteriaBank = () => plots.actionCriteriaBank(sessionRef.current)

  const handleCancelTakeoverSelect = () => plots.cancelTakeoverSelect(sessionRef.current)

  const handleCancelScandalSelect = () => plots.cancelScandalSelect(sessionRef.current)

  const handleCancelRezoning = () => plots.cancelRezoning(sessionRef.current)

  /** Exit property placement without building; does not discard the card or consume actions. */
  const handleCancelPlacement = useCallback(() => plots.cancelPlacement(sessionRef.current), [])

  /** Close “Build with Tax Dollars?” without starting placement (user aborts before choosing half vs full cost). */
  const abortTaxBuildPrompt = useCallback(() => plots.abortTaxBuildPrompt(sessionRef.current), [])

  const handleRezoningPropertyFromHand = (propertyInstanceId: string) => plots.rezoningPropertyFromHand(sessionRef.current, propertyInstanceId)

  const handleRezoningHousingDensity = (highDensity: boolean) => plots.rezoningHousingDensity(sessionRef.current, highDensity)

  const handleRezoningPlotSelect = (row: number, col: string) => plots.rezoningPlotSelect(sessionRef.current, row, col)

  const handleTakeoverPlotSelect = (row: number, col: string) => plots.takeoverPlotSelect(sessionRef.current, row, col)

  const handleScandalPlotSelect = (row: number, col: string) => plots.scandalPlotSelect(sessionRef.current, row, col)

  const handlePlotClaim = (row: number, col: string) => plots.plotClaim(sessionRef.current, row, col)

  const resetLocalUiToTitle = () => setup.resetLocalUiToTitle(sessionRef.current)

  /** Soft leave — keeps host authority so the same table can be Resumed after a freeze/exit. */
  const handleLeaveTable = () => setup.leaveTable(sessionRef.current)

  /** Host-only: tear down the live table and delete the resume snapshot. */
  const handleEndTable = () => setup.endTable(sessionRef.current)

  /** Title / New Game control — soft-leave online tables so host/guest can Resume/Rejoin. */
  const handleNewGame = () => setup.newGame(sessionRef.current)

  const DOUBLE_INCOME_BANK_VALUE = actionCards.find((c) => c.id === 'double-income')?.bankValue ?? 5

  const handleDoubleIncomeOrphanConfirmBank = () => income.doubleIncomeOrphanConfirmBank(sessionRef.current)

  const handleIncomeComplete = (earnedIncome: number, doubleIncomeInstanceId?: string, incomeResolution?: 'property-roll' | 'bank-income-card', dieFace?: number) => income.incomeComplete(sessionRef.current, earnedIncome, doubleIncomeInstanceId, incomeResolution, dieFace)

  const handleIncomeCancel = () => income.incomeCancel(sessionRef.current)

  const handlePropertyClick = (row: number, col: string) => turn.propertyClick(sessionRef.current, row, col)

  const handlePlotClaimRef = useRef(handlePlotClaim)
  handlePlotClaimRef.current = handlePlotClaim
  const stableHandlePlotClaim = useCallback((row: number, col: string) => {
    handlePlotClaimRef.current(row, col)
  }, [])

  const handlePropertyClickRef = useRef(handlePropertyClick)
  handlePropertyClickRef.current = handlePropertyClick
  const stableHandlePropertyClick = useCallback((row: number, col: string) => {
    handlePropertyClickRef.current(row, col)
  }, [])

  const handleVacantLotHint = useCallback(() => turn.vacantLotHint(sessionRef.current), [])

  const handleUndoLastAction = () => turn.undoLastAction(sessionRef.current)

  const handleUndoLastActionCancel = () => turn.undoLastActionCancel(sessionRef.current)

  const finalizeCouncilFreezeAttackFailure = useCallback((instanceId: string, source: 'accept' | 'auto' = 'accept') => dice.finalizeCouncilFreezeAttackFailure(sessionRef.current, instanceId, source), [])

  const handleAttackerDieSettled = useCallback((natural: number) => dice.attackerDieSettled(sessionRef.current, natural), [])

  const handleCouncilFreezeAttackerRollAgain = useCallback(() => dice.councilFreezeAttackerRollAgain(sessionRef.current), [])

  const handleCouncilFreezeFailDismiss = useCallback(() => dice.councilFreezeFailDismiss(sessionRef.current), [])

  /** Discard a played action card, count it against the turn, and clear the dice dialog. Used by police raid and remove investors single-roll flows. */
  const finalizeSimpleActionResolution = useCallback((instanceId: string, toastMessage: { type: 'success' | 'info' | 'error'; text: string }) => dice.finalizeSimpleActionResolution(sessionRef.current, instanceId, toastMessage), [])

  const finalizeScandalCardSpent = useCallback((instanceId: string) => dice.finalizeScandalCardSpent(sessionRef.current, instanceId), [])

  const commitCalamityRoll = (result: number, extras?: { calamityVariantKey?: string }) => calamity.commitCalamityRoll(sessionRef.current, result, extras)

  const handleAcceptCalamity = () => {
    skipNextCalamityResultNoticeRef.current = true
    calamity.acceptCalamity(sessionRef.current)
  }

  const handleRollDieComplete = (result: number, extras?: { calamityVariantKey?: string }) => dice.rollDieComplete(sessionRef.current, result, extras)

  const handleRollDieCancel = () => dice.rollDieCancel(sessionRef.current)

  /**
   * In-table recovery without Leave/Resume. Clears stuck select modes, force-resolves
   * computer dice (City Council Freeze / Scandal / Takeover / etc.), and nudges Founderbots.
   */
  const handleUnstickPlay = () => turn.unstickPlay(sessionRef.current)

  const handleUnstickPlayRef = useRef(handleUnstickPlay)
  handleUnstickPlayRef.current = handleUnstickPlay

  const setupReady =
    safeGameState.isSetupComplete &&
    Array.isArray(safeGameState.players) &&
    safeGameState.players.length > 0

  const currentPlayerMaybe = setupReady
    ? safeGameState.players[safeGameState.currentPlayerIndex]
    : undefined

  /** Keep AI snapshot refs and the autoplay effect above setup early-return so hook order is stable. */
  aiGsRef.current = safeGameState
  aiCpRef.current = currentPlayerMaybe ?? null
  aiHooksRef.current = {
    handleEndTurn,
    handleEndGameDecision,
    handleUndoLastActionCancel,
    handleActionCriteriaBank,
    handleCancelTakeoverSelect,
    handleCancelScandalSelect,
    handleCancelRezoning,
    handleCancelInvestmentSelect,
    handleCancelRemoveInvestorsSelect,
    handleCancelDiscardPropertySelect,
    handleConfirmDiscardProperty,
    handleDiscardActionCards: stableHandleDiscardComplete,
    dismissTaxBuildPrompt: () => {
      taxPromptResumeRef.current = null
      setTaxBuildPrompt({
        open: false,
        propertyInstanceId: null,
        actionInstanceId: null,
        housingHighDensity: undefined,
        wildCardEmulatePropertyId: undefined,
      })
      setTaxBuildMode({ phase: 'inactive' })
    },
    cancelPlacement: () =>
      setPlacementMode({
        active: false,
        propertyCardId: null,
        housingHighDensity: undefined,
        taxBuildActionInstanceId: undefined,
        wildCardEmulatePropertyId: undefined,
      }),
    handlePlayCards,
    handlePlotSelect,
    /** Same routing as a human board click — required so bots finish investment/takeover/etc. */
    handleBoardPlotSelect: handlePlotClaim,
    handleRezoningPropertySelect: handleRezoningPropertyFromHand,
    handleRezoningHousingDensity,
  }
  setGameHandlerBag({
    handlePlayCards,
    handleEndTurn,
    handleEndGameDecision,
    handleUnstickPlay,
    handlePlotClaim: stableHandlePlotClaim,
    handlePropertyClick: stableHandlePropertyClick,
    handleVacantLotHint,
    handleCancelPlacement,
    handleCancelRezoning,
    handleCancelTakeoverSelect,
    handleCancelScandalSelect,
    handleCancelInvestmentSelect,
    handleCancelRemoveInvestorsSelect,
    handleCancelDiscardPropertySelect,
    handleConfirmDiscardProperty,
    handleToggleDiscardPropertySelection,
    handleRezoningPropertyFromHand,
    handleRezoningHousingDensity,
    handleAcceptCalamity,
    handleIncomeComplete,
    handleIncomeCancel,
    handleRollDieComplete,
    handleRollDieCancel,
    handleAttackerDieSettled,
    handleCouncilFreezeAttackerRollAgain,
    handleCouncilFreezeFailDismiss,
    handleCalamitySettled,
    handleDiscardComplete: stableHandleDiscardComplete,
    handleActionCriteriaBank,
    handleDoubleIncomeOrphanConfirmBank,
    handleUndoLastAction,
    handleUndoLastActionCancel,
    abortTaxBuildPrompt,
    setUndoActionDialogOpen,
  })
  const uiSnap = getPlayUiSnapshot()
  aiUiRef.current = {
    undoActionDialogOpen: uiSnap.undoActionDialogOpen,
    // Notices are drama for humans; bots must keep resolving or select modes freeze the table.
    boardNoticeActive: false,
    showNewCardsAnimation: !!safeGameState.showNewCardsAnimation,
    taxBuildPromptOpen: uiSnap.taxBuildPrompt.open,
    discardPropertyConfirmOpen: uiSnap.discardPropertyConfirmOpen,
    discardDialogOpen: uiSnap.discardDialogState.open,
    discardDialogNumToDiscard: uiSnap.discardDialogState.numToDiscard,
    rollDieDialogOpen: uiSnap.rollDieDialogState.open,
    incomeDialogOpen: uiSnap.incomeDialogState.open,
    takeoverSelectActive: uiSnap.takeoverSelectMode.active,
    scandalSelectActive: uiSnap.scandalSelectMode.active,
    rezoningPhase: uiSnap.rezoningMode.phase,
    investmentSelectActive: uiSnap.investmentSelectMode.active,
    removeInvestorsSelectActive: uiSnap.removeInvestorsSelectMode.active,
    discardPropertySelectActive: uiSnap.discardPropertySelectMode.active,
    taxBuildModePhase: uiSnap.taxBuildMode.phase,
    placementActive: uiSnap.placementMode.active,
    placementPropertyCardId: uiSnap.placementMode.propertyCardId,
    placementWildEmulatePropertyId: uiSnap.placementMode.wildCardEmulatePropertyId,
    placementHousingHighDensity: uiSnap.placementMode.housingHighDensity,
    actionCriteriaDialogOpen: uiSnap.actionCriteriaDialog.open,
    selectValidPlots: uiSnap.takeoverSelectMode.active
      ? uiSnap.takeoverSelectMode.validPlots
      : uiSnap.scandalSelectMode.active
        ? uiSnap.scandalSelectMode.validPlots
        : uiSnap.investmentSelectMode.active
          ? uiSnap.investmentSelectMode.validPlots
          : uiSnap.removeInvestorsSelectMode.active
            ? uiSnap.removeInvestorsSelectMode.validPlots
            : undefined,
    investmentContributionMillion: uiSnap.investmentSelectMode.active
      ? uiSnap.investmentSelectMode.contributionMillion
      : undefined,
  }

  const aiPlayerReady =
    currentPlayerMaybe?.isAi === true &&
    safeGameState.isSetupComplete &&
    !safeGameState.gameEnded &&
    safeGameState.openingNarrationComplete !== false &&
    (!partyBoardConfig || partyBoardConfig.role === 'host')

  /**
   * Steady AI wake — interval is NOT reset by React re-renders (the prior renderTick
   * debounce was starved by online sync / card flights / notices on TestFlight).
   */
  const lastAiProgressAtRef = useRef(Date.now())
  useEffect(() => {
    lastAiProgressAtRef.current = Date.now()
  }, [safeGameState.currentPlayerIndex])

  useEffect(() => {
    if (!aiPlayerReady) return
    const tick = () => {
      const hx = aiHooksRef.current
      if (!hx) return
      for (let step = 0; step < AI_MAIN_PHASE_BURST_STEPS; step++) {
        const tableGs = getGameTableSnapshot()
        const gsSnap = tableGs.players.length > 0 ? tableGs : aiGsRef.current
        const cpSnap = gsSnap?.players[gsSnap.currentPlayerIndex]
        const playUi = getPlayUiSnapshot()
        const ui = aiUiRef.current
        if (!ui || !gsSnap || !cpSnap?.isAi) return
        if (playUi.incomeDialogState.open || playUi.rollDieDialogState.open) return
        const acted = trySimpleAiMainPhase(
          gsSnap,
          cpSnap,
          {
            ...ui,
            rollDieDialogOpen: playUi.rollDieDialogState.open,
            incomeDialogOpen: playUi.incomeDialogState.open,
            discardDialogOpen: playUi.discardDialogState.open,
            discardDialogNumToDiscard: playUi.discardDialogState.numToDiscard,
            placementActive: playUi.placementMode.active,
            placementPropertyCardId: playUi.placementMode.propertyCardId,
            placementWildEmulatePropertyId: playUi.placementMode.wildCardEmulatePropertyId,
            placementHousingHighDensity: playUi.placementMode.housingHighDensity,
            takeoverSelectActive: playUi.takeoverSelectMode.active,
            scandalSelectActive: playUi.scandalSelectMode.active,
            rezoningPhase: playUi.rezoningMode.phase,
            investmentSelectActive: playUi.investmentSelectMode.active,
            removeInvestorsSelectActive: playUi.removeInvestorsSelectMode.active,
            discardPropertySelectActive: playUi.discardPropertySelectMode.active,
            taxBuildModePhase: playUi.taxBuildMode.phase,
            taxBuildPromptOpen: playUi.taxBuildPrompt.open,
            actionCriteriaDialogOpen: playUi.actionCriteriaDialog.open,
            showNewCardsAnimation: !!gsSnap.showNewCardsAnimation,
          },
          hx
        )
        if (acted) lastAiProgressAtRef.current = Date.now()
        if (!acted) break
      }
    }
    const immediate = window.setTimeout(tick, 120)
    const interval = window.setInterval(tick, AI_MAIN_PHASE_DELAY_NORMAL_MS)
    return () => {
      window.clearTimeout(immediate)
      window.clearInterval(interval)
    }
  }, [aiPlayerReady, safeGameState.currentPlayerIndex])

  /** Host watchdog: if no AI progress for 8s, run Unstick (now covers Income / discard). */
  useEffect(() => {
    const isHost = !partyBoardConfig || partyBoardConfig.role === 'host'
    if (!isHost) return
    const AI_STALL_WATCHDOG_MS = 8000
    const id = window.setInterval(() => {
      if (!aiPlayerReady) return
      if (Date.now() - lastAiProgressAtRef.current > AI_STALL_WATCHDOG_MS) {
        lastAiProgressAtRef.current = Date.now()
        handleUnstickPlayRef.current()
      }
    }, 2000)
    return () => window.clearInterval(id)
  }, [aiPlayerReady, partyBoardConfig?.role])

  if (!setupReady || currentPlayerMaybe == null) {
    return (
      <>
        <GameSetupWizard
          onComplete={handleSetupComplete}
          onGuestJoined={handleGuestJoined}
          onResumeHostTable={handleResumeHostTable}
        />
        <Toaster />
      </>
    )
  }

  const currentPlayer = currentPlayerMaybe
  /** Solo vs bots pins the lone human as the rail; online pins this device's seat (never the acting
   *  player, which would rotate the rail through bots and rivals); local pass-and-play follows turns. */
  const soloVersusBotsTable = isSinglePlayerVersusBots(safeGameState.players)
  const localHumanSeat = soloVersusBotsTable
    ? safeGameState.players.find((p) => p.isAi !== true) ?? currentPlayer
    : partyBoardConfig
      ? partyBoardSeatPlayer ??
        resolveGuestSeatForRemap(safeGameState, partyBoardConfig.displayName ?? '') ??
        safeGameState.players.find((p) => p.isAi !== true) ??
        currentPlayer
      : currentPlayer
  const handRailPlayer = localHumanSeat
  const handRailPlayerIndex = safeGameState.players.findIndex((p) => p.id === handRailPlayer.id)
  const actingPlayerSeat = safeGameState.players[safeGameState.currentPlayerIndex]
  const handInteractionsActive =
    !isSpectator &&
    handRailPlayerIndex === safeGameState.currentPlayerIndex &&
    actingPlayerSeat?.isAi !== true &&
    !safeGameState.pendingEndGameDeclaration

  setPlaySession({
    isSpectator,
    isCompactLayout,
    isLandscapeLayout,
    handRailPlayerId: handRailPlayer.id,
    currentPlayerIsAi: currentPlayer.isAi === true,
    localControlsActingSeat,
  })
  sessionRef.current = { ...sessionRef.current, handInteractionsActive }

  const calculateFinalScores = (): PlayerScore[] => {
    /** Squares + Streets are computed once per scoring call; any number per player is allowed.
     *  Squares earn $50M each; streets earn $30M each. Names use the founder's display name at scoring. */
    const allSquares = findCompleteSquares(safeGameState.plots)
    const allStreets = findCompleteStreets(safeGameState.plots)

    return safeGameState.players.map(player => {
      const ownedPlots = safeGameState.plots.filter(p => p.claimedBy === player.id && p.builtProperty)

      let propertyValue = 0
      ownedPlots.forEach(plot => {
        const propertyCard = propertyCards.find(c => c.id === plot.builtProperty)
        if (propertyCard) {
          propertyValue += getPlotPropertyEndValue(plot, propertyCard)
        }
      })

      const investmentBook = sumInvestmentBookForPlayer(safeGameState.plots, player.id)

      const squareBonuses = allSquares
        .filter((s) => s.ownerPlayerId === player.id)
        .map((s) => ({
          name: `${player.name} Square`,
          bonusMillion: s.bonusMillion,
          bounds: s.bounds,
          lots: s.lots,
        }))
      const streetBonuses = allStreets
        .filter((s) => s.ownerPlayerId === player.id)
        .map((s) => ({
          name: `${player.name} Street`,
          bonusMillion: s.bonusMillion,
          orientation: s.orientation,
          lots: s.lots,
          streetSegment: s.streetSegment,
        }))
      const bonusMillion =
        squareBonuses.reduce((acc, b) => acc + b.bonusMillion, 0) +
        streetBonuses.reduce((acc, b) => acc + b.bonusMillion, 0)

      return {
        player,
        cashInHand: player.money,
        propertyValue,
        bonusMillion,
        squareBonuses,
        streetBonuses,
        totalScore: player.money + propertyValue + investmentBook + bonusMillion,
        propertiesOwned: ownedPlots.length
      }
    })
  }

  const councilFreezeTargetId = safeGameState.councilFreezeBlockBuildForPlayerId
  const councilFreezePlayerIndex =
    councilFreezeTargetId != null
      ? safeGameState.players.findIndex((p) => p.id === councilFreezeTargetId)
      : -1
  const councilFreezePlayerNumber =
    councilFreezePlayerIndex >= 0 ? councilFreezePlayerIndex + 1 : null

  const guestHostDelayed = partyBoardConfig?.role === 'guest' && syncClock.hostDelayed
  const guestRevBehind =
    partyBoardConfig?.role === 'guest' &&
    syncClock.hostRev > syncClock.localRev &&
    (syncClock.localRev > 0 || syncClock.hostRev > 0)
  const guestClockUnhealthy = Boolean(guestHostDelayed || guestRevBehind)
  const revPair =
    syncClock.localRev > 0 || syncClock.hostRev > 0
      ? `${syncClock.localRev}/${syncClock.hostRev}`
      : null
  const badgeTone: 'ok' | 'warn' | 'error' =
    connectionStatus === 'error'
      ? 'error'
      : connectionStatus === 'connected' && !guestClockUnhealthy
        ? 'ok'
        : 'warn'
  const guestStatusLabel =
    guestHostDelayed && revPair
      ? `Host delayed · ${revPair}`
      : guestHostDelayed
        ? 'Host delayed'
        : guestRevBehind && revPair
          ? `Behind · ${revPair}`
          : connectionStatus === 'connected'
            ? revPair
              ? `Online · ${revPair}`
              : 'Online'
            : connectionStatus === 'resyncing'
              ? revPair
                ? `Resyncing · ${revPair}`
                : 'Resyncing…'
              : connectionStatus === 'stale'
                ? 'Host unreachable'
                : connectionStatus === 'error'
                  ? 'Connection error'
                  : 'Connecting…'

  return (
    <div className="h-screen flex flex-col overflow-hidden game-table" style={{ backgroundColor: '#000000' }}>
      {partyBoardConfig ? (
        <div
          className="fixed right-2 top-2 z-[80] flex max-w-[min(92vw,22rem)] flex-col items-end gap-1.5 sm:right-3 sm:top-3"
          style={{ pointerEvents: 'auto' }}
        >
          <button
            type="button"
            onClick={partyBoardConfig.role === 'guest' ? requestResync : undefined}
            title={
              partyBoardConfig.role === 'guest'
                ? guestHostDelayed
                  ? 'Host did not ACK this action — keep their device awake, then resync'
                  : guestRevBehind
                    ? `This device is at rev ${syncClock.localRev}; host is at ${syncClock.hostRev}`
                    : 'Online table connection — click to resync'
                : 'You are the table host — keep this screen open. This device is the rules authority.'
            }
            aria-live="polite"
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] shadow-lg backdrop-blur-md"
            style={{
              cursor: partyBoardConfig.role === 'guest' ? 'pointer' : 'default',
              color:
                badgeTone === 'ok' ? '#bbf7d0' : badgeTone === 'error' ? '#fecaca' : '#fde68a',
              borderColor:
                badgeTone === 'ok'
                  ? 'rgba(74,222,128,0.45)'
                  : badgeTone === 'error'
                    ? 'rgba(248,113,113,0.5)'
                    : 'rgba(251,191,36,0.5)',
              background:
                badgeTone === 'ok'
                  ? 'rgba(6,78,59,0.88)'
                  : badgeTone === 'error'
                    ? 'rgba(127,29,29,0.9)'
                    : 'rgba(120,53,15,0.9)',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                flexShrink: 0,
                borderRadius: 999,
                backgroundColor:
                  badgeTone === 'ok' ? '#4ade80' : badgeTone === 'error' ? '#f87171' : '#fbbf24',
                boxShadow: badgeTone === 'ok' ? '0 0 8px rgba(74,222,128,0.8)' : undefined,
              }}
            />
            {partyBoardConfig.role === 'host'
              ? connectionStatus === 'connected'
                ? revPair
                  ? `Hosting · ${revPair}`
                  : 'Hosting'
                : 'Host reconnecting…'
              : guestStatusLabel}
          </button>
          {partyBoardConfig.role === 'host' ? (
            <div className="rounded-xl border border-sky-300/30 bg-black/85 px-3 py-2 text-left shadow-lg backdrop-blur-md">
              <p className="m-0 text-[11px] leading-snug text-sky-50/90">
                {hostAwayWarning
                  ? 'Host screen was backgrounded — bring this app to the front so guests can play.'
                  : `Room ${partyBoardConfig.roomId}: keep this device awake. Leave table to exit and Resume later if it freezes.`}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={handleLeaveTable}
                  className="rounded-full border border-emerald-300/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-100"
                  title="Exit without ending the table. Resume from the title screen."
                >
                  Leave & resume later
                </button>
                <button
                  type="button"
                  onClick={handleEndTable}
                  className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-100"
                >
                  End table
                </button>
              </div>
            </div>
          ) : null}
          {partyBoardConfig.role === 'guest' && guestHostDelayed && connectionStatus === 'connected' ? (
            <div className="rounded-xl border border-amber-300/50 bg-amber-950/90 px-3 py-2 text-left shadow-lg backdrop-blur-md">
              <p className="m-0 mb-2 text-[11px] leading-snug text-amber-50/90">
                Host delayed — no ACK for your last action
                {revPair ? ` (you ${syncClock.localRev}, host ${syncClock.hostRev})` : ''}. Keep
                their device awake, then Resync.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={requestResync}
                  className="rounded-full border border-sky-300/40 bg-sky-500/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-sky-100"
                >
                  Resync
                </button>
              </div>
            </div>
          ) : null}
          {partyBoardConfig.role === 'guest' &&
          (connectionStatus === 'stale' ||
            connectionStatus === 'error' ||
            connectionStatus === 'resyncing') ? (
            <div className="rounded-xl border border-amber-300/35 bg-black/85 px-3 py-2 text-left shadow-lg backdrop-blur-md">
              <p className="m-0 mb-2 text-[11px] leading-snug text-amber-50/90">
                {connectionStatus === 'resyncing'
                  ? 'Catching up… you can still view the board. Actions wait until the host answers.'
                  : 'Host may be asleep or the app was closed. Ask them to reopen Founders Square on their device (they can Resume the table), then Resync — or Leave and Rejoin the same room code.'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={requestResync}
                  className="rounded-full border border-sky-300/40 bg-sky-500/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-sky-100"
                >
                  Resync
                </button>
                <button
                  type="button"
                  onClick={handleLeaveTable}
                  className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-100"
                >
                  Leave & rejoin later
                </button>
              </div>
            </div>
          ) : null}
          {partyBoardConfig.role === 'guest' && connectionStatus === 'connected' ? (
            <button
              type="button"
              onClick={handleLeaveTable}
              className="rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-300 shadow-lg backdrop-blur-md"
              title={`Leave without ending the table. Rejoin room ${partyBoardConfig.roomId} later.`}
            >
              Leave table
            </button>
          ) : null}
        </div>
      ) : null}
      <div style={{ flexShrink: 0, backgroundColor: '#000000' }}>
      {/* Header bar */}
      <header style={{
        flexShrink: 0,
        height: isCompactLayout ? 44 : 56,
        padding: isCompactLayout ? '0 12px' : '0 32px',
        backgroundColor: '#000000',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isCompactLayout ? 12 : 32 }}>
          <h1
            style={{
              fontFamily: "'Cinzel', 'Space Grotesk', serif",
              fontSize: isCompactLayout ? 13 : 'clamp(16px, 2.2vw, 22px)',
              fontWeight: 800,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#f0f0f5',
              margin: 0,
            }}
          >
            Founders Square
          </h1>
        </div>
        <HeaderPlayControls
          compact={isCompactLayout}
          isSpectator={isSpectator}
          currentPlayerIsAi={currentPlayer.isAi === true}
          onEndTurn={handleEndTurn}
          onUnstick={handleUnstickPlay}
          onNewGame={handleNewGame}
        />
      </header>

      {isSpectator ? (
        <div
          role="status"
          style={{
            padding: '8px 32px',
            backgroundColor: 'rgba(234, 179, 8, 0.12)',
            borderBottom: '1px solid rgba(234, 179, 8, 0.28)',
            fontSize: 13,
            fontWeight: 500,
            color: '#fbbf24',
          }}
        >
          Watching only — mirroring host (no seated match for this PartyKit tab). Seat yourself in this room&apos;s lobby
          and start again, or open the invite link before the host starts.
        </div>
      ) : partyBoardConfig?.role === 'guest' && partyBoardSeatPlayer && !guestOnlineHintDismissed ? (
        <div
          role="status"
          style={{
            padding: '8px 12px 8px 32px',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            borderBottom: '1px solid rgba(56, 189, 248, 0.25)',
            fontSize: 13,
            fontWeight: 500,
            color: '#7dd3fc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <span>
            Playing online — moves from every seat update live via the shared table. The hand at the bottom follows{' '}
            <strong>{partyBoardSeatPlayer.name}</strong> here.
          </span>
          <button
            type="button"
            onClick={dismissGuestOnlineHint}
            style={{
              flexShrink: 0,
              height: 28,
              padding: '0 14px',
              borderRadius: 9999,
              border: '1px solid rgba(56, 189, 248, 0.35)',
              backgroundColor: 'transparent',
              color: '#bae6fd',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {councilFreezePlayerNumber != null && (
        <div
          role="status"
          style={{
            padding: '8px 32px',
            backgroundColor: 'rgba(30, 174, 219, 0.12)',
            borderBottom: '1px solid rgba(30, 174, 219, 0.25)',
            fontSize: 13,
            fontWeight: 500,
            color: '#7dd3fc',
            letterSpacing: '0.02em',
          }}
        >
          Player {councilFreezePlayerNumber} has City Council Freeze on building
        </div>
      )}
      </div>

      {/* Main content area — desktop: sidebar + board; phone: board-first column */}
      <div
        className={isCompactLayout ? 'flex-1 flex flex-col overflow-hidden min-h-0' : 'flex-1 flex overflow-hidden min-h-0'}
        style={{ pointerEvents: isSpectator ? 'none' : 'auto' }}
      >
        <PlayerSidebar />
        <div
          className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0"
          style={{ backgroundColor: '#000000' }}
        >
          <div
            className={
              isCompactLayout
                ? isLandscapeLayout
                  ? 'relative flex-[1.4] min-h-0 min-w-0'
                  : 'relative flex-1 min-h-0 min-w-0'
                : 'relative flex-1 min-h-0 min-w-0'
            }
          >
            <BoardViewport compact={isCompactLayout} landscape={isLandscapeLayout} />
          </div>
          <HandRail />
        </div>
      </div>

      <OverlayHost />
      {safeGameState.openingNarrationComplete === false ? (
        <GameOpeningSequence
          onProceed={() => {
            setGameState((s) => ({
              ...s,
              openingNarrationComplete: true,
            }))
            setShowOpeningProTip(true)
          }}
        />
      ) : null}


      <Toaster />
      <DialogHost />
      <CalamityAcceptLayer />
      {safeGameState.gameEnded && (
        <GameEndDialog
          open={safeGameState.gameEnded}
          scores={calculateFinalScores()}
          onNewGame={handleNewGame}
        />
      )}

    </div>
  );
}

function App() {
  return (
    <FlightAnchorProvider>
      <AppInner />
    </FlightAnchorProvider>
  )
}

export default App
