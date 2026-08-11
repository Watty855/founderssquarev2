'use client'

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useGameState } from '@/hooks/use-game-state'
import { Player, Plot, GameState, PlayerScore } from '@/lib/types'
import { attachUndoSnapshotIfTurnAction, canUndoLastAction, restoreUndoSnapshot } from '@/lib/undoLastAction'
import { applyBuildAt } from '@/lib/gameEngine/applyBuildAt'
import { applyEndTurn } from '@/lib/gameEngine/applyEndTurn'
import { applyBankActionCards } from '@/lib/gameEngine/applyBankAction'
import {
  buildEndGameTriggerPatch,
  applyFinalRoundCountdown,
  clearCouncilFreezeIfEndingPlayer,
} from '@/lib/gameEngine/statePatches'
import { createInitialBoard } from '@/lib/boardData'
import { createActionDeck, createPropertyDeck, drawCards, drawFromDeckWithDiscardReshuffle } from '@/lib/deckUtils'
import { GameSetupWizard } from '@/components/game/GameSetupWizard'
import { GameOpeningSequence } from '@/components/game/GameOpeningSequence'
import {
  OpeningProTipOverlay,
  OPENING_PRO_TIP_DURATION_MS,
} from '@/components/game/OpeningProTipOverlay'
import { MotivationalRoundBanner } from '@/components/game/MotivationalRoundBanner'
import { GameBoard } from '@/components/game/GameBoard'
import { BoardPinchZoom } from '@/components/game/BoardPinchZoom'
import { PlayerInfo } from '@/components/game/PlayerInfo'
import { PlayerHand, type PlayCardsOptions, handCardAnchorKey, handTargetAnchorKey } from '@/components/game/PlayerHand'
import { useCompactGameLayout } from '@/hooks/use-compact-game-layout'
import { SidebarHandFlightAnchors } from '@/components/game/SidebarHandFlightAnchors'
import { RequiredActionBanner, type RequiredAction } from '@/components/game/RequiredActionBanner'
import { FinalTurnBanner } from '@/components/game/FinalTurnBanner'
import { RulesQuickSheet } from '@/components/game/RulesQuickSheet'
import { AnchorTenetsQuickSheet } from '@/components/game/AnchorTenetsQuickSheet'
import { ActionCardsQuickSheet } from '@/components/game/ActionCardsQuickSheet'
import { PROPERTY_DECK_ANCHOR_KEY, ACTION_DECK_ANCHOR_KEY } from '@/components/game/DeckPile'
import { CardFlightLayer, type CardFlight } from '@/components/game/CardFlightLayer'
import { FlightAnchorProvider, useFlightRectGetter, type FlightRect } from '@/hooks/use-flight-anchors'
import { DiscardDialog } from '@/components/dialogs/DiscardDialog'
import { GameEndDialog } from '@/components/dialogs/GameEndDialog'
import { UndoLastActionDialog } from '@/components/dialogs/UndoLastActionDialog'
import { InvestmentOrphanDialog } from '@/components/dialogs/InvestmentOrphanDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Anchor, ArrowCounterClockwise, BookOpen, CurrencyDollar, Gavel } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Toaster as BoardDockToaster } from 'sonner'
import { FS_BOARD_TOASTER_ID, gameDockToast as toast } from '@/lib/fsGameToast'
import { Toaster } from '@/components/ui/sonner'
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
} from '@/lib/soundEffects'
import { trySimpleAiMainPhase, pickAiDiscardPropertyIds } from '@/lib/bot/simpleAiTurn'
import type { SimpleAiTurnHandlers, SimpleAiTurnUi } from '@/lib/bot/simpleAiTurn'
import { AI_MAIN_PHASE_DELAY_NORMAL_MS } from '@/lib/bot/aiTiming'
import {
  confrontationAttemptTitle,
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

// Statically imported — dice/income dialogs are on the AI critical path; lazy+null Suspense
// left the required-action badge up with no dialog (looked like a frozen "choose target" turn).
import { IncomeDialog } from '@/components/dialogs/IncomeDialog'
import { RollDieDialog } from '@/components/dialogs/RollDieDialog'

type ActionCriteriaDialogState = {
  open: boolean
  actionInstanceId: string | null
  cardName: string
  bankValue: number
  reasonDescription: string
}

function createClosedActionCriteriaDialog(): ActionCriteriaDialogState {
  return {
    open: false,
    actionInstanceId: null,
    cardName: '',
    bankValue: 0,
    reasonDescription: '',
  }
}

/** True when the seat that must use the roll dialog this moment is an AI (defender modes use context, not currentPlayer). */
function rollSeatIsAi(
  gs: GameState,
  rd: {
    open: boolean
    mode: string
    targetPlayerId?: number
    takeoverContext?: { ownerPlayerId: number }
    scandalContext?: { anchorOwnerPlayerId: number }
  },
  currentSeat: Player | undefined
): boolean {
  if (!rd.open) return false
  const playerIsAi = (id: number | undefined | null): boolean =>
    id != null && gs.players.some((p) => p.id === id && p.isAi)
  switch (rd.mode) {
    case 'council-freeze-defender':
      return playerIsAi(rd.targetPlayerId)
    case 'hostile-takeover-defender':
      return playerIsAi(rd.takeoverContext?.ownerPlayerId)
    case 'scandal-defender':
      return playerIsAi(rd.scandalContext?.anchorOwnerPlayerId)
    case 'police-raid-defender':
      return playerIsAi(rd.targetPlayerId)
    default:
      return currentSeat?.isAi === true
  }
}

const initialGameState: GameState = {
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

function countResolvedActionStepsInBatch(
  actionInstanceIds: string[],
  actionCardsInHand: CardInstance[]
): number {
  let n = 0
  for (const instanceId of actionInstanceIds) {
    const instance = actionCardsInHand.find((c) => c.instanceId === instanceId)
    if (!instance) continue
    if (instance.cardId === 'roll-die') {
      n += 1
      continue
    }
    const card = actionCards.find((c) => c.id === instance.cardId)
    if (!card) continue
    if (card.id === 'income' || card.id === 'double-income' || card.id === 'city-council-freeze' || card.id === 'rezoning' || card.id === 'discard-property-cards') continue
    n += 1
  }
  return n
}

function withReplenishedActionHand(gameState: GameState, playerIndex: number): GameState {
  const { state: nextState, drew } = replenishCurrentPlayerActionHand(gameState, playerIndex)
  if (drew > 0) {
    queueMicrotask(() =>
      toast.success(
        drew === 5
          ? 'Your action hand was empty — drew 5 new action cards.'
          : `Your action hand was empty — drew ${drew} new action card${drew === 1 ? '' : 's'}.`
      )
    )
  }
  return nextState
}

function sumInvestmentBookForPlayer(plots: Plot[], investorId: number): number {
  let s = 0
  for (const p of plots) {
    p.investmentStripes?.forEach((t) => {
      if (t.investorId === investorId) s += t.contributionMillion
    })
  }
  return s
}

let cardFlightCounter = 0
const nextCardFlightId = (): string => `flight-${++cardFlightCounter}`

/** Sentinel action-instance id for the online council-freeze defense dialog (card already spent). */
const REMOTE_COUNCIL_FREEZE_DEFENSE_ID = 'remote-council-freeze-defense'
const REMOTE_REBUTTAL_ROLL_ID = 'remote-rebuttal-roll'
/** Max cards animated from deck per state tick — matches turn replenish (2 action cards). */
const MAX_DRAW_FLIGHTS_PER_TICK = 2

/** Queue a face-down draw flight (deck → hand). Hand position should be the current player's hand-target rect. */
function makeDrawFlight(
  inst: CardInstance,
  cardType: 'property' | 'action',
  source: FlightRect,
  target: FlightRect,
  delayMs: number,
  durationSec?: number
): CardFlight {
  return {
    id: nextCardFlightId(),
    kind: 'draw',
    cardType,
    instance: inst,
    source,
    target,
    delayMs,
    durationSec,
  }
}

/** All hand deliveries (initial deal + mid-game draws) fly at hand-card size over 1 s. */
const HAND_DRAW_DURATION_SEC = 1
const HAND_DRAW_STAGGER_MS = 140
const REPLENISH_DRAW_STAGGER_MS = 220

/** Prefer the card's slot in the fan; fall back to the section anchor. */
function resolveHandDrawTargetRect(
  getRect: (key: string) => FlightRect | null,
  playerId: number,
  instanceId: string,
  sectionRect: FlightRect | null
): FlightRect | null {
  return getRect(handCardAnchorKey(playerId, instanceId)) ?? sectionRect
}

/** One human versus one or more AI seats (solo on this device, not pass-and-play with multiple humans). */
function isSinglePlayerVersusBots(players: { isAi?: boolean }[]): boolean {
  const humans = players.filter((p) => !p.isAi).length
  const bots = players.filter((p) => p.isAi === true).length
  return humans === 1 && bots >= 1
}

/** Queue a face-up "out of the hand" discard flight (or face-down when `concealedDiscard` hides AI plays). */
function makeDiscardFlight(
  inst: CardInstance,
  cardType: 'property' | 'action',
  source: FlightRect,
  delayMs: number,
  concealedDiscard?: boolean
): CardFlight {
  const cardDef =
    cardType === 'property'
      ? (propertyCards.find((c) => c.id === inst.cardId) as PropertyCard | undefined)
      : (actionCards.find((c) => c.id === inst.cardId) as ActionCard | undefined)
  return {
    id: nextCardFlightId(),
    kind: 'discard',
    cardType,
    instance: inst,
    card: concealedDiscard ? null : cardDef ?? null,
    source,
    delayMs,
    concealedDiscard: concealedDiscard === true,
  }
}

function restoreHostOnlineConfig(): PartyBoardSyncConfig | null {
  try {
    const last = loadLastOnlineSession()
    if (last?.role !== 'host') return null
    if (!hasResumableHostAuthority(last.roomId)) return null
    return {
      roomId: last.roomId,
      displayName: last.displayName,
      myConnectionId: getDeviceConnectionId(),
      role: 'host',
    }
  } catch {
    return null
  }
}

function AppInner() {
  const [partyBoardConfig, setPartyBoardConfig] = useState<PartyBoardSyncConfig | null>(
    restoreHostOnlineConfig
  )
  const [gameState, setGameState] = useGameState<GameState>('founders-square-game', initialGameState, {
    persist: partyBoardConfig?.role !== 'guest',
  })
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
    connectionStatus,
    requestResync,
    flushAuthorityPersist,
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

  /** Card-flight system. We snapshot source/target rects at queue time so a hand re-layout doesn't tug a flying card mid-flight.
   *  `hiddenInstanceIds` mirrors which hand cards are currently animating *in* — those slots render at opacity 0 so the flying overlay is the only visible motion. */
  const [cardFlights, setCardFlights] = useState<CardFlight[]>([])
  const [hiddenInstanceIds, setHiddenInstanceIds] = useState<Set<string>>(new Set())
  const getFlightRect = useFlightRectGetter()
  const [placementMode, setPlacementMode] = useState<{
    active: boolean
    propertyCardId: string | null
    housingHighDensity?: boolean
    taxBuildActionInstanceId?: string
    /** Anchor Wild Card: emulated anchor property id for placement and build result. */
    wildCardEmulatePropertyId?: string
  }>({ active: false, propertyCardId: null })
  const [incomeDialogState, setIncomeDialogState] = useState<{
    open: boolean
    player: Player | null
    totalIncome: number
    churchIncomeBonus: number
    churchBonusSourceLabels: string[]
    farmCoopIncomeBonus: number
    farmCoopBonusSourceLabels: string[]
    portAuthorityIncomeBonus: number
    portAuthorityBonusSourceLabels: string[]
    artsCouncilIncomeBonus: number
    artsCouncilBonusSourceLabels: string[]
    tourismOfficeIncomeBonus: number
    tourismOfficeBonusSourceLabels: string[]
    influencersIncomeBonus: number
    influencersBonusSourceLabels: string[]
    newsOutletIncomeBonus: number
    newsOutletBonusSourceLabels: string[]
    mafiaIncomeBonus: number
    mafiaBonusSourceLabels: string[]
    mafiaLevyTotal: number
    regulationBureauIncomeBonus: number
    regulationBureauBonusSourceLabels: string[]
    regulationBureauIncomePenalty: number
    rivalRegulationBureauPlotLabels: string[]
    unionIncomeBonus: number
    unionBonusSourceLabels: string[]
    unionIncomePenalty: number
    rivalUnionPlotLabels: string[]
    hasBuiltPropertiesForIncomeRoll: boolean
    actionInstanceId: string | null
  }>({
    open: false,
    player: null,
    totalIncome: 0,
    churchIncomeBonus: 0,
    churchBonusSourceLabels: [],
    farmCoopIncomeBonus: 0,
    farmCoopBonusSourceLabels: [],
    portAuthorityIncomeBonus: 0,
    portAuthorityBonusSourceLabels: [],
    artsCouncilIncomeBonus: 0,
    artsCouncilBonusSourceLabels: [],
    tourismOfficeIncomeBonus: 0,
    tourismOfficeBonusSourceLabels: [],
    influencersIncomeBonus: 0,
    influencersBonusSourceLabels: [],
    newsOutletIncomeBonus: 0,
    newsOutletBonusSourceLabels: [],
    mafiaIncomeBonus: 0,
    mafiaBonusSourceLabels: [],
    mafiaLevyTotal: 0,
    regulationBureauIncomeBonus: 0,
    regulationBureauBonusSourceLabels: [],
    regulationBureauIncomePenalty: 0,
    rivalRegulationBureauPlotLabels: [],
    unionIncomeBonus: 0,
    unionBonusSourceLabels: [],
    unionIncomePenalty: 0,
    rivalUnionPlotLabels: [],
    hasBuiltPropertiesForIncomeRoll: false,
    actionInstanceId: null,
  })
  /** Double Income played alone: must confirm bank-only (cannot double payout without Income). */
  const [doubleIncomeOrphanDialog, setDoubleIncomeOrphanDialog] = useState<{
    open: boolean
    instanceId: string | null
  }>({ open: false, instanceId: null })
  const [discardDialogState, setDiscardDialogState] = useState<{
    open: boolean
    numToDiscard: number
  }>({ open: false, numToDiscard: 0 })
  const [undoActionDialogOpen, setUndoActionDialogOpen] = useState(false)
  const [rollDieDialogState, setRollDieDialogState] = useState<{
    open: boolean
    mode:
      | 'roll-die'
      | 'council-freeze-attacker'
      | 'council-freeze-defender'
      | 'hostile-takeover-attacker'
      | 'hostile-takeover-defender'
      | 'scandal-attacker'
      | 'scandal-defender'
      | 'rezoning'
      | 'police-raid-attacker'
      | 'police-raid-defender'
      | 'remove-investors'
    actionInstanceId: string | null
    targetPlayerId?: number
    influenceBonus?: number
    influenceLabels?: string[]
    councilFreezeAttackerRollsCompleted?: number
    councilFreezeAttackerLastNatural?: number
    councilFreezeFailAuto?: boolean
    diceRetryNonce?: number
    takeoverContext?: {
      row: number
      col: string
      ownerPlayerId: number
      payment120Million: number
    }
    rezoningContext?: {
      row: number
      col: string
      propertyInstanceId: string
      propertyCardId: string
      buildCost: number
      housingHighDensity?: boolean
    }
    scandalContext?: {
      row: number
      col: string
      anchorOwnerPlayerId: number
      anchorCardId: string
    }
    /** Remove Investors: lot the owner picked before rolling (own property with stripes). */
    removeInvestorsContext?: {
      row: number
      col: string
    }
  }>({ open: false, mode: 'roll-die', actionInstanceId: null })

  const rollDieDialogStateRef = useRef(rollDieDialogState)
  rollDieDialogStateRef.current = rollDieDialogState

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
    dismissTaxBuildPrompt: () => {},
    cancelPlacement: () => {},
    handlePlayCards: () => {},
    handlePlotSelect: () => {},
    handleBoardPlotSelect: () => {},
    handleRezoningPropertySelect: () => {},
    handleRezoningHousingDensity: () => {},
  })
  const aiUiRef = useRef<SimpleAiTurnUi | null>(null)

  const [investmentSelectMode, setInvestmentSelectMode] = useState<{
    active: boolean
    validPlots: Plot[]
    actionInstanceId: string | null
    contributionMillion: number
  }>({ active: false, validPlots: [], actionInstanceId: null, contributionMillion: 4 })

  const investmentSelectModeRef = useRef(investmentSelectMode)
  investmentSelectModeRef.current = investmentSelectMode

  const [removeInvestorsSelectMode, setRemoveInvestorsSelectMode] = useState<{
    active: boolean
    validPlots: Plot[]
    actionInstanceId: string | null
  }>({ active: false, validPlots: [], actionInstanceId: null })
  const removeInvestorsSelectModeRef = useRef(removeInvestorsSelectMode)
  removeInvestorsSelectModeRef.current = removeInvestorsSelectMode

  const [discardPropertySelectMode, setDiscardPropertySelectMode] = useState<{
    active: boolean
    actionInstanceId: string | null
    selectedPropertyInstanceIds: string[]
  }>({ active: false, actionInstanceId: null, selectedPropertyInstanceIds: [] })
  const discardPropertySelectModeRef = useRef(discardPropertySelectMode)
  discardPropertySelectModeRef.current = discardPropertySelectMode

  const [discardPropertyConfirmOpen, setDiscardPropertyConfirmOpen] = useState(false)

  const [actionCriteriaDialog, setActionCriteriaDialog] = useState(createClosedActionCriteriaDialog)

  const [takeoverSelectMode, setTakeoverSelectMode] = useState<{
    active: boolean
    validPlots: Plot[]
    actionInstanceId: string | null
  }>({ active: false, validPlots: [], actionInstanceId: null })

  const takeoverSelectModeRef = useRef(takeoverSelectMode)
  takeoverSelectModeRef.current = takeoverSelectMode

  const [scandalSelectMode, setScandalSelectMode] = useState<{
    active: boolean
    validPlots: Plot[]
    actionInstanceId: string | null
  }>({ active: false, validPlots: [], actionInstanceId: null })

  const scandalSelectModeRef = useRef(scandalSelectMode)
  scandalSelectModeRef.current = scandalSelectMode

  type RezoningModeState =
    | { phase: 'inactive' }
    | { phase: 'pick-property'; actionInstanceId: string }
    | {
        phase: 'pick-housing-density'
        actionInstanceId: string
        propertyInstanceId: string
      }
    | {
        phase: 'pick-plot'
        actionInstanceId: string
        propertyInstanceId: string
        housingHighDensity?: boolean
      }

  const [rezoningMode, setRezoningMode] = useState<RezoningModeState>({ phase: 'inactive' })
  const rezoningModeRef = useRef(rezoningMode)
  rezoningModeRef.current = rezoningMode
  const [taxBuildMode, setTaxBuildMode] = useState<
    { phase: 'inactive' } | { phase: 'pick-property'; actionInstanceId: string }
  >({ phase: 'inactive' })
  const [taxBuildPrompt, setTaxBuildPrompt] = useState<{
    open: boolean
    propertyInstanceId: string | null
    housingHighDensity?: boolean
    actionInstanceId: string | null
    wildCardEmulatePropertyId?: string
  }>({ open: false, propertyInstanceId: null, actionInstanceId: null })

  /** When the tax-dollar prompt opens, stash payload so dismissal (No / ESC) can resume placement at full price. Cleared before “Yes”. */
  const taxPromptResumeRef = useRef<{
    propertyInstanceId: string
    housingHighDensity?: boolean
    wildCardEmulatePropertyId?: string
    taxActionInstanceId: string
  } | null>(null)

  const [boardNotice, setBoardNotice] = useState<{ title: ReactNode; detail?: string } | null>(null)
  const boardNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showBoardNotice = useCallback(
    (title: ReactNode, detail?: string, opts?: { quick?: boolean; durationMs?: number }) => {
      if (boardNoticeTimerRef.current) {
        clearTimeout(boardNoticeTimerRef.current)
        boardNoticeTimerRef.current = null
      }
      setBoardNotice({ title, detail })
      const ms = opts?.durationMs ?? (opts?.quick ? 900 : 4000)
      boardNoticeTimerRef.current = setTimeout(() => {
        setBoardNotice(null)
        boardNoticeTimerRef.current = null
      }, ms)
    },
    []
  )

  onBoardFxRef.current = (fx: BoardFx) => {
    if (fx.sound === 'construction') playConstructionSound()
    else if (fx.sound === 'anchor') playAnchorDropSound()
    else if (fx.sound === 'income') playIncomeSound()
    else if (fx.sound === 'boo') playCrowdBooSound()
    else if (fx.sound === 'cheer') playCrowdCheerSound()
    else if (fx.sound === 'dwindle') playInfluenceDwindleSound()
    if (fx.notice) {
      showBoardNotice(fx.notice.title, fx.notice.detail, {
        durationMs: fx.notice.durationMs,
      })
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
      broadcastBoardFx({ notice: { title: diceTitle, detail }, sound })
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
      sound?: BoardFx['sound']
    ) => {
      broadcastBoardFx({
        notice: {
          title: confrontationNoticeTitle(kind, attackerName, targetName),
          detail: confrontationNoticeDetail(outcome, detail),
        },
        sound,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOnlineActor]
  )

  /**
   * Table-wide drama when a vs-player action is laid / targeted.
   * Example: "Alice is attempting a Hostile Takeover against Bob"
   */
  const announceConfrontationAttempt = useCallback(
    (
      kind: ConfrontationKind,
      attackerName: string,
      targetName: string,
      detail: string,
      sound: BoardFx['sound'] = 'boo'
    ) => {
      broadcastBoardFx({
        notice: {
          title: confrontationAttemptTitle(kind, attackerName, targetName),
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
        toast.success('Final Round complete — game over!')
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
            vsTitle,
            confrontationNoticeDetail(
              'blocked',
              `${e.targetName} rolled ${e.result} — ${e.attackerName}'s play is repelled.`
            ),
            isAiName(e.targetName) && isAiName(e.attackerName) ? { quick: true } : undefined
          )
          playCrowdCheerSound()
        } else {
          showBoardNotice(
            vsTitle,
            confrontationNoticeDetail(
              'success',
              e.kind === 'hostile-takeover'
                ? `${e.attackerName} takes ${e.plotLabel ?? 'the lot'} — ownership changes.`
                : e.kind === 'scandal'
                  ? `Anchor influence discontinued${e.plotLabel ? ` at ${e.plotLabel}` : ''}.`
                  : `Police Raid succeeds${e.plotLabel ? ` at ${e.plotLabel}` : ''} — Mafia influence discontinued.`
            ),
            isAiName(e.targetName) && isAiName(e.attackerName) ? { quick: true } : undefined
          )
          playInfluenceDwindleSound()
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
  const [motivationalFlashRound, setMotivationalFlashRound] = useState<number | null>(null)
  const motivationalFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showOpeningProTip, setShowOpeningProTip] = useState(false)
  const openingProTipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismissOpeningProTip = useCallback(() => {
    setShowOpeningProTip(false)
    if (openingProTipTimerRef.current !== null) {
      clearTimeout(openingProTipTimerRef.current)
      openingProTipTimerRef.current = null
    }
  }, [])

  /** At the start of each seat’s turn during the final round, show the strip briefly so the board stays clear for play. */
  const FINAL_TURN_BANNER_VISIBLE_MS = 5000
  const [showFinalTurnBanner, setShowFinalTurnBanner] = useState(false)
  const [rulesQuickOpen, setRulesQuickOpen] = useState(false)
  const [anchorTenetsOpen, setAnchorTenetsOpen] = useState(false)
  const [actionCardsOpen, setActionCardsOpen] = useState(false)
  const { compact: isCompactLayout, landscape: isLandscapeLayout } = useCompactGameLayout()

  useEffect(() => {
    if (motivationalFlashTimerRef.current !== null) {
      clearTimeout(motivationalFlashTimerRef.current)
      motivationalFlashTimerRef.current = null
    }

    const prn = gameState.playRoundNumber ?? 1
    if (gameState.gameEnded === true) {
      setMotivationalFlashRound(null)
      return
    }
    if (gameState.openingNarrationComplete === false) {
      setMotivationalFlashRound(null)
      return
    }
    if (prn < 2 || prn % 2 !== 0) {
      setMotivationalFlashRound(null)
      return
    }

    setMotivationalFlashRound(prn)
    motivationalFlashTimerRef.current = setTimeout(() => {
      motivationalFlashTimerRef.current = null
      setMotivationalFlashRound(null)
    }, MOTIVATIONAL_EVEN_ROUND_FLASH_MS)

    return () => {
      if (motivationalFlashTimerRef.current !== null) {
        clearTimeout(motivationalFlashTimerRef.current)
        motivationalFlashTimerRef.current = null
      }
    }
  }, [
    gameState.playRoundNumber,
    gameState.gameEnded,
    gameState.openingNarrationComplete,
  ])

  useEffect(() => {
    if (!showOpeningProTip) return
    if (openingProTipTimerRef.current !== null) {
      clearTimeout(openingProTipTimerRef.current)
    }
    openingProTipTimerRef.current = setTimeout(() => {
      openingProTipTimerRef.current = null
      dismissOpeningProTip()
    }, OPENING_PRO_TIP_DURATION_MS)
    return () => {
      if (openingProTipTimerRef.current !== null) {
        clearTimeout(openingProTipTimerRef.current)
        openingProTipTimerRef.current = null
      }
    }
  }, [showOpeningProTip, dismissOpeningProTip])

  /** Lot placement: Escape cancels (replaces removed hand-rail Cancel). */
  useEffect(() => {
    if (
      isSpectator ||
      !placementMode.active ||
      placementMode.propertyCardId == null
    ) {
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
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
  }, [
    isSpectator,
    placementMode.active,
    placementMode.propertyCardId,
  ])

  useEffect(() => {
    if (!gameState.endGameTriggered || gameState.gameEnded) {
      setShowFinalTurnBanner(false)
      return
    }
    setShowFinalTurnBanner(true)
    const id = window.setTimeout(() => setShowFinalTurnBanner(false), FINAL_TURN_BANNER_VISIBLE_MS)
    return () => window.clearTimeout(id)
  }, [gameState.endGameTriggered, gameState.gameEnded, gameState.currentPlayerIndex])

  /** Drives the card-flight diff. Holds the previous safeGameState we last reconciled against. */
  const prevFlightStateRef = useRef<{
    handByPlayer: Map<number, { property: Set<string>; action: Set<string> }>
    propertyDiscardIds: Set<string>
    actionDiscardIds: Set<string>
    isSetupComplete: boolean
  } | null>(null)

  onGuestSnapshotAppliedRef.current = () => {
    prevFlightStateRef.current = null
    setCardFlights((q) => (q.length === 0 ? q : []))
    setHiddenInstanceIds((s) => (s.size === 0 ? s : new Set()))
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

  const handleFlightDone = useCallback((flightId: string, instanceId: string | null) => {
    setCardFlights((prev) => prev.filter((f) => f.id !== flightId))
    if (instanceId) {
      setHiddenInstanceIds((s) => {
        if (!s.has(instanceId)) return s
        const next = new Set(s)
        next.delete(instanceId)
        return next
      })
    }
  }, [])

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
      setCardFlights((q) => (q.length === 0 ? q : []))
      setHiddenInstanceIds((s) => (s.size === 0 ? s : new Set()))
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
      setCardFlights((q) => [...q, ...queued])
      if (newlyHidden.length > 0) {
        setHiddenInstanceIds((s) => {
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

  const handleGuestJoined = useCallback((gs: GameState, cfg: PartyBoardSyncConfig) => {
    saveLastOnlineSession({
      roomId: cfg.roomId,
      displayName: cfg.displayName,
      role: 'guest',
    })
    setGameState(gs)
    setPartyBoardConfig(cfg)
  }, [])

  const handleResumeHostTable = useCallback((gs: GameState, cfg: PartyBoardSyncConfig) => {
    saveLastOnlineSession({
      roomId: cfg.roomId,
      displayName: cfg.displayName,
      role: 'host',
    })
    setGameState(gs)
    setPartyBoardConfig(cfg)
    toast.success(`Resumed hosting room ${cfg.roomId}. Guests can Resync or Rejoin.`)
  }, [])

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
        `🎲 City Council Freeze on ${pending.targetName}!`,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pendingFreezeKey,
    rollDieDialogState.open,
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
      showBoardNotice(`🎲 ${kindTitle} — ${pending.targetName} must roll!`, defenseDetail)
      broadcastBoardFx(
        {
          sound: 'cheer',
          notice: {
            title: `🎲 ${kindTitle} defense roll`,
            detail:
              defender?.isAi === true
                ? `${pending.targetName} (computer) is rolling.`
                : `${pending.targetName} is rolling.`,
          },
        },
        { localEcho: false }
      )
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pendingRebuttalKey,
    rollDieDialogState.open,
    partyBoardConfig?.role,
    partyBoardSeatPlayer?.id,
  ])

  /** Mirror local dice-dialog drama to every device (attacker rolls, income, etc.). */
  const announcedLocalDramaKeyRef = useRef('')
  useEffect(() => {
    if (!rollDieDialogState.open) {
      announcedLocalDramaKeyRef.current = ''
      return
    }
    const mode = rollDieDialogState.mode
    // Attacker "attempting" banners fire at target-commit; keep drama for defenses + rezoning only.
    const dramaModes = new Set([
      'hostile-takeover-defender',
      'scandal-defender',
      'council-freeze-defender',
      'police-raid-defender',
      'rezoning',
    ])
    if (!dramaModes.has(mode)) return
    const key = `${mode}|${rollDieDialogState.diceRetryNonce ?? 0}|${rollDieDialogState.actionInstanceId ?? ''}`
    if (announcedLocalDramaKeyRef.current === key) return
    announcedLocalDramaKeyRef.current = key
    const titles: Record<string, { title: string; detail: string }> = {
      'hostile-takeover-defender': { title: '🎲 Hostile Takeover defense', detail: 'Owner rolls — only a 6 blocks the takeover.' },
      'scandal-defender': { title: '🎲 Scandal defense', detail: 'Anchor owner rolls — only a 6 negates the scandal.' },
      'council-freeze-defender': { title: '🎲 Freeze defense roll', detail: 'Frozen founder rolls — only a 6 negates.' },
      'police-raid-defender': { title: '🎲 Mafia counter roll', detail: 'Mafia owner rolls to repel the raid.' },
      'rezoning': { title: '🎲 Rezoning roll', detail: 'Founder is rolling to rezone a vacant lot.' },
    }
    const copy = titles[mode]
    if (copy) {
      broadcastBoardFx({ notice: copy, sound: mode.includes('defender') ? 'cheer' : 'boo' }, { localEcho: false })
    }
  }, [rollDieDialogState.open, rollDieDialogState.mode, rollDieDialogState.diceRetryNonce, rollDieDialogState.actionInstanceId])

  const announcedIncomeKeyRef = useRef('')
  useEffect(() => {
    if (!incomeDialogState.open) {
      announcedIncomeKeyRef.current = ''
      return
    }
    const key = `${incomeDialogState.player?.id ?? ''}|${incomeDialogState.actionInstanceId ?? ''}`
    if (announcedIncomeKeyRef.current === key) return
    announcedIncomeKeyRef.current = key
    broadcastBoardFx(
      {
        notice: {
          title: '🎲 Income resolution',
          detail: `${incomeDialogState.player?.name ?? 'A founder'} is rolling for income.`,
        },
        sound: 'income',
      },
      { localEcho: false }
    )
  }, [incomeDialogState.open, incomeDialogState.player?.id, incomeDialogState.actionInstanceId, incomeDialogState.player?.name])

  const handleSetupComplete = (players: Player[], partyBoard?: PartyBoardSyncMeta) => {
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

    const playersWithCards = players.map((player, index) => {
      const { drawn: actionCards, remaining: remainingActions } = drawCards(remainingActionDeck, 5)
      remainingActionDeck = remainingActions

      const { drawn: propertyCards, remaining: remainingProperties } = drawCards(remainingPropertyDeck, 5)
      remainingPropertyDeck = remainingProperties

      const updatedPlayer: Player = {
        ...player,
        actionCards,
        propertyCards
      }
      return updatedPlayer
    })

    const firstPlayer = playersWithCards[0]
    const { drawn: initialActionCards, remaining: finalActionDeck } = drawCards(remainingActionDeck, 2)

    const playersWithInitialDraw = playersWithCards.map((player, index) =>
      index === 0 ? { ...player, actionCards: [...player.actionCards, ...initialActionCards] } : player
    )

    dismissOpeningProTip()

    setGameState((current) => {
      return {
        ...current,
        players: playersWithInitialDraw,
        plots: createInitialBoard(),
        isSetupComplete: true,
        actionDeck: finalActionDeck,
        propertyDeck: remainingPropertyDeck,
        currentPlayerIndex: 0,
        actionDiscard: [],
        propertyDiscard: [],
        turnActionsConsumed: 0,
        incomeResolvedThisTurn: false,
        awaitingEndTurnActionDiscard: undefined,
        newCardsDrawn: initialActionCards,
        showNewCardsAnimation: true,
        openingNarrationComplete: false,
        playRoundNumber: 1,
        // Do not inherit these from persisted `...current` — they would block end-game detection and scoring.
        crossingTheLineActive: false,
        playedPropertyCardThisTurn: undefined,
        propertiesBuiltThisTurn: 0,
        actionsPlayedThisTurn: 0,
        lastBuiltProperty: undefined,
        councilFreezeBlockBuildForPlayerId: undefined,
        pendingCouncilFreezeDefense: undefined,
        pendingIncomeTaxPlayerIds: [],
        gameEnded: undefined,
        winningSequence: undefined,
        endGameTriggered: undefined,
        endGameTriggerPlayerId: undefined,
        endGameTriggerLocation: undefined,
        finalRoundTurnsRemaining: undefined,
      }
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

  const handlePlayCards = (
    propertyInstanceId: string | null,
    actionInstanceIds: string[],
    convertToCashInstanceIds: string[],
    options?: PlayCardsOptions
  ) => {
    if (safeGameState.awaitingEndTurnActionDiscard || discardDialogState.open) {
      toast.info(
        `Discard down to ${MAX_ACTION_HAND_SIZE} action cards to finish ending your turn.`
      )
      return
    }
    if (propertyInstanceId) {
      if (rezoningMode.phase !== 'inactive') {
        toast.error('Finish or cancel Rezoning before building from your hand.')
        return
      }
      if (takeoverSelectMode.active) {
        toast.error('Finish or cancel Hostile Takeover selection before building.')
        return
      }
      if (scandalSelectMode.active) {
        toast.error('Finish or cancel Scandal target selection before building.')
        return
      }
      if (investmentSelectMode.active) {
        toast.error('Finish or cancel investment selection before building.')
        return
      }
      if (discardPropertySelectMode.active) {
        toast.error('Finish or cancel Discard Property Cards before building.')
        return
      }
      if (removeInvestorsSelectMode.active) {
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

      if (placementMode.active && placementMode.propertyCardId === propertyInstanceId) {
        const opt = options ?? {}
        const hasStructuralPatch =
          opt.housingHighDensity !== undefined ||
          opt.wildCardEmulatePropertyId !== undefined ||
          opt.useTaxBuild !== undefined ||
          opt.taxBuildActionInstanceId !== undefined

        if (!hasStructuralPatch) return

        const emulateMerged =
          emulateFromOptions !== undefined ? emulateFromOptions : placementMode.wildCardEmulatePropertyId

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

        let nextHd = placementMode.housingHighDensity
        if (opt.housingHighDensity === true) nextHd = true
        else if (opt.housingHighDensity === false) nextHd = undefined

        let nextTaxInstanceId = placementMode.taxBuildActionInstanceId
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
      if (taxBuildMode.phase === 'pick-property') {
        setTaxBuildMode({ phase: 'inactive' })
      }
      const quiet = options?.suppressPlacementToast === true
      if (!quiet) {
        if (highDensity) {
          toast.info(
            options?.useTaxBuild
              ? 'Build with Tax Dollars active (50% cost): select a lot for high-density housing.'
              : 'High-density housing ($18M): select a lot. After build, the lot shows your color with a neon outline.'
          )
        } else {
          const placeName = needsEmulate ? placementTemplate.name : card.name
          const buildCostLabel =
            isWild ? '$6M' : `$${(needsEmulate ? placementTemplate : card).buildCost}M`
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

    if (takeoverSelectMode.active) {
      if (actionInstanceIds.length > 0 || convertToCashInstanceIds.length > 0) {
        toast.error('Finish or cancel Hostile Takeover selection first.')
        return
      }
    }
    if (scandalSelectMode.active) {
      if (actionInstanceIds.length > 0 || convertToCashInstanceIds.length > 0) {
        toast.error('Finish or cancel Scandal target selection first.')
        return
      }
    }
    if (investmentSelectMode.active) {
      if (actionInstanceIds.length > 0 || convertToCashInstanceIds.length > 0) {
        toast.error('Finish or cancel investment selection first.')
        return
      }
    }
    if (discardPropertySelectMode.active) {
      if (actionInstanceIds.length > 0 || convertToCashInstanceIds.length > 0) {
        toast.error('Finish or cancel Discard Property Cards first.')
        return
      }
    }
    if (removeInvestorsSelectMode.active) {
      if (actionInstanceIds.length > 0 || convertToCashInstanceIds.length > 0) {
        toast.error('Finish or cancel Remove Investors property pick first.')
        return
      }
    }
    if (taxBuildMode.phase !== 'inactive') {
      if (actionInstanceIds.length > 0 || convertToCashInstanceIds.length > 0) {
        toast.error('Finish or cancel Build with Tax Dollars selection first.')
        return
      }
    }
    if (rezoningMode.phase !== 'inactive') {
      if (actionInstanceIds.length > 0 || convertToCashInstanceIds.length > 0) {
        toast.error('Finish or cancel Rezoning before playing or banking other cards.')
        return
      }
    }

    const cpIdx = safeGameState.currentPlayerIndex
    const hasCouncilFreeze = actionInstanceIds.some((id) => {
      const inst = safeGameState.players[cpIdx].actionCards.find((c) => c.instanceId === id)
      if (!inst) return false
      return inst.cardId === 'city-council-freeze'
    })
    if (hasCouncilFreeze && actionInstanceIds.length > 1) {
      toast.error('Play City Council Freeze by itself.')
      return
    }

    const hasScandal = actionInstanceIds.some((id) => {
      const inst = safeGameState.players[cpIdx].actionCards.find((c) => c.instanceId === id)
      return inst?.cardId === 'scandal'
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
      return inst?.cardId === 'income'
    })
    if (hasIncome && safeGameState.incomeResolvedThisTurn) {
      toast.error('You already resolved Income this turn — only one Income resolution per turn.')
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
      return inst?.cardId === 'discard-property-cards'
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
        return inst ? actionCards.find((c) => c.id === inst.cardId) : undefined
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
      if (inst?.cardId === 'city-council-freeze') {
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
      const ac = inst0 ? actionCards.find((c) => c.id === inst0.cardId) : undefined
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
              'Every built anchor on the board already has discontinued influence. Bank Scandal or try again later.',
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
          'Rezoning: click a highlighted property card, then a vacant lot. Roll a total of 5+ after applicable Anchor Tenet influence to approve the build (success uses 2 actions).'
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
          handleConfirmDiscardProperty(pickAiDiscardPropertyIds(acting), actionInstanceIds[0])
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
    const playStepsBatch = countResolvedActionStepsInBatch(actionInstanceIds, handForStepCount)
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
            const card = actionCards.find(c => c.id === instance.cardId)
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
                updatedActionDeck = deckAfter
                updatedActionDiscard = [...discardAfter, instance]
                updatedActionCards = [...updatedActionCards, ...drawn]
                if (drawn.length === 2) {
                  toast.success(`Played ${card.name} — drew 2 new action cards into your hand.`)
                } else if (drawn.length === 1) {
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
                pendingIncomeTaxPlayerIds = Array.from(new Set([...pendingIncomeTaxPlayerIds, ...otherIds]))
                broadcastBoardFx({
                  sound: 'boo',
                  notice: {
                    title: 'Taxation levied!',
                    detail: `${currentPlayer.name} sheltered their income — all other founders face a 50% city assessment.`,
                  },
                })
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
                toast.success(`Played ${card.name}!`)
              }
            }
          }
        })

        if (incomeCardInstance) {
          const ownedPlots = current.plots.filter(p => p.claimedBy === currentPlayer.id && p.builtProperty)
          let baseIncome = 0

          ownedPlots.forEach(plot => {
            const propertyCard = propertyCards.find(c => c.id === plot.builtProperty)
            if (propertyCard) {
              baseIncome += getPlotPropertyIncome(plot, propertyCard)
            }
          })

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

          setIncomeDialogState({
            open: true,
            player: currentPlayer,
            totalIncome,
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

      const updatedPlayers = current.players.map((p, idx) =>
        idx === current.currentPlayerIndex
          ? { ...p, money: updatedMoney, propertyCards: updatedPropertyCards, actionCards: updatedActionCards }
          : p
      )

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

      return withReplenishedActionHand(newState, current.currentPlayerIndex)
    })
  }

  const handlePlotSelect = (row: number, col: string) => {
    if (!placementMode.active || !placementMode.propertyCardId) {
      return
    }

    const propertyCardId = placementMode.propertyCardId
    const plotPlacementMode = {
      housingHighDensity: placementMode.housingHighDensity,
      taxBuildActionInstanceId: placementMode.taxBuildActionInstanceId,
      wildCardEmulatePropertyId: placementMode.wildCardEmulatePropertyId,
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
            <>
              {isAnchor ? '⚓ ' : ''}
              <strong>{ev.lotName}</strong>
              {ev.suffix}
            </>,
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
          handleEndTurn()
        }, 0)
      }
      return attachUndoSnapshotIfTurnAction(current, result.state)
    })
  }

  const handleEndTurn = () => {
    if (
      rollDieDialogState.open &&
      (rollDieDialogState.mode === 'hostile-takeover-attacker' ||
        rollDieDialogState.mode === 'hostile-takeover-defender' ||
        rollDieDialogState.mode === 'scandal-attacker' ||
        rollDieDialogState.mode === 'scandal-defender' ||
        rollDieDialogState.mode === 'council-freeze-attacker' ||
        rollDieDialogState.mode === 'council-freeze-defender' ||
        rollDieDialogState.mode === 'rezoning' ||
        rollDieDialogState.mode === 'police-raid-attacker' ||
        rollDieDialogState.mode === 'police-raid-defender' ||
        rollDieDialogState.mode === 'remove-investors')
    ) {
      toast.error('Finish the dice roll before ending your turn.')
      return
    }
    if (rezoningMode.phase !== 'inactive') {
      setRezoningMode({ phase: 'inactive' })
    }
    if (takeoverSelectMode.active) {
      setTakeoverSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    }
    if (scandalSelectMode.active) {
      setScandalSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    }
    if (investmentSelectMode.active) {
      setInvestmentSelectMode({ active: false, validPlots: [], actionInstanceId: null, contributionMillion: 4 })
    }
    if (discardPropertySelectMode.active) {
      setDiscardPropertySelectMode({ active: false, actionInstanceId: null, selectedPropertyInstanceIds: [] })
    }
    setDiscardPropertyConfirmOpen(false)
    if (removeInvestorsSelectMode.active) {
      setRemoveInvestorsSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    }
    if (taxBuildMode.phase !== 'inactive') {
      setTaxBuildMode({ phase: 'inactive' })
    }
    if (taxBuildPrompt.open) {
      taxPromptResumeRef.current = null
      setTaxBuildPrompt({
        open: false,
        propertyInstanceId: null,
        actionInstanceId: null,
        housingHighDensity: undefined,
        wildCardEmulatePropertyId: undefined,
      })
    }
    if (isOnlineActor) {
      sendAction({ type: 'end_turn' })
      return
    }
    setGameState((current) => {
      const result = applyEndTurn(current)
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

  // Invalidate any pending auto-end when the acting seat changes.
  useEffect(() => {
    autoEndTurnGenerationRef.current += 1
    autoEndTurnScheduledRef.current = false
    // A turn change must never leave the previous founder's discard dialog open on
    // the new founder (who may legally hold 9+ after their start-of-turn draw 2).
    setDiscardDialogState((prev) => (prev.open ? { open: false, numToDiscard: 0 } : prev))
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
    !rollDieDialogState.open &&
    !incomeDialogState.open &&
    !discardDialogState.open &&
    !placementMode.active &&
    rezoningMode.phase === 'inactive' &&
    taxBuildMode.phase === 'inactive' &&
    !taxBuildPrompt.open &&
    !takeoverSelectMode.active &&
    !scandalSelectMode.active &&
    !investmentSelectMode.active &&
    !removeInvestorsSelectMode.active &&
    !discardPropertySelectMode.active &&
    !actionCriteriaDialog.open &&
    shouldAutoAdvanceTurn(safeGameState)
  useEffect(() => {
    if (!safeGameState.isSetupComplete || safeGameState.gameEnded) return
    if (safeGameState.openingNarrationComplete === false) return
    if (!localControlsActingSeat) return
    if (!boardIdleForAutoEnd) return
    scheduleEndOfTurn()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    safeGameState.turnActionsConsumed,
    safeGameState.currentPlayerIndex,
    safeGameState.isSetupComplete,
    safeGameState.gameEnded,
    safeGameState.openingNarrationComplete,
    localControlsActingSeat,
    boardIdleForAutoEnd,
  ])

  const handleDiscardComplete = (discardedInstanceIds: string[]) => {
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

  const handleCancelInvestmentSelect = () => {
    setInvestmentSelectMode({ active: false, validPlots: [], actionInstanceId: null, contributionMillion: 4 })
    toast.info('Investment cancelled.')
  }

  const handleCancelDiscardPropertySelect = () => {
    setDiscardPropertySelectMode({ active: false, actionInstanceId: null, selectedPropertyInstanceIds: [] })
    setDiscardPropertyConfirmOpen(false)
    toast.info('Discard Property Cards cancelled.')
  }

  const handleToggleDiscardPropertySelection = (propertyInstanceId: string) => {
    setDiscardPropertySelectMode((prev) => {
      if (!prev.active) return prev
      const sel = prev.selectedPropertyInstanceIds
      const next = sel.includes(propertyInstanceId)
        ? sel.filter((id) => id !== propertyInstanceId)
        : [...sel, propertyInstanceId]
      return { ...prev, selectedPropertyInstanceIds: next }
    })
  }

  /**
   * Resolve Discard Property Cards for the acting seat.
   * Optional overrides let Founderbots finish without the host hand UI
   * (solo tables pin the human hand rail, so AI select mode looked like the host's cards).
   */
  const handleConfirmDiscardProperty = (
    selectedPropertyInstanceIds?: string[],
    actionInstanceIdOverride?: string
  ) => {
    const mode = discardPropertySelectModeRef.current
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

  const handleInvestmentPlotSelect = (row: number, col: string) => {
    const sel = investmentSelectModeRef.current
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
    const propertyTitle = plotPreview?.builtProperty
      ? propertyCards.find((c) => c.id === plotPreview.builtProperty)?.name ??
        plotPreview.building ??
        'property'
      : 'property'
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
    // Instant resolve — use attempt-style title so every seat sees the vs-player play.
    broadcastBoardFx({
      notice: {
        title: confrontationAttemptTitle(investKind, investorPreview.name, ownerName),
        detail: confrontationNoticeDetail(
          'success',
          `$${contribution}M invested in ${propertyTitle} at ${col}${row}. Cash paid to ${ownerName}.`
        ),
        durationMs: 5500,
      },
      sound: 'income',
    })
  }

  const handleCancelRemoveInvestorsSelect = () => {
    setRemoveInvestorsSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    toast.info('Remove Investors cancelled.')
  }

  const handleRemoveInvestorsPlotSelect = (row: number, col: string) => {
    const sel = removeInvestorsSelectModeRef.current
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

  const handleActionCriteriaBank = () => {
    const id = actionCriteriaDialog.actionInstanceId
    if (!id) return
    if (turnLimitReached(safeGameState.turnActionsConsumed)) {
      nudgeTurnAdvanceForSpentBudget()
      return
    }
    const banked = actionCriteriaDialog.bankValue
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

  const handleCancelTakeoverSelect = () => {
    setTakeoverSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    toast.info('Hostile Takeover cancelled.')
  }

  const handleCancelScandalSelect = () => {
    setScandalSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    toast.info('Scandal cancelled.')
  }

  const handleCancelRezoning = () => {
    setRezoningMode({ phase: 'inactive' })
    toast.info('Rezoning cancelled.')
  }

  /** Exit property placement without building; does not discard the card or consume actions. */
  const handleCancelPlacement = useCallback(() => {
    setPlacementMode({
      active: false,
      propertyCardId: null,
      housingHighDensity: undefined,
      taxBuildActionInstanceId: undefined,
      wildCardEmulatePropertyId: undefined,
    })
    toast.info('Build cancelled — your property card stays in hand.')
  }, [])

  /** Close “Build with Tax Dollars?” without starting placement (user aborts before choosing half vs full cost). */
  const abortTaxBuildPrompt = useCallback(() => {
    taxPromptResumeRef.current = null
    setTaxBuildPrompt({
      open: false,
      propertyInstanceId: null,
      actionInstanceId: null,
      housingHighDensity: undefined,
      wildCardEmulatePropertyId: undefined,
    })
    toast.info('Property build cancelled — your card stays in hand.')
  }, [])

  const handleRezoningPropertyFromHand = (propertyInstanceId: string) => {
    const m = rezoningModeRef.current
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

  const handleRezoningHousingDensity = (highDensity: boolean) => {
    const m = rezoningModeRef.current
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

  const handleRezoningPlotSelect = (row: number, col: string) => {
    const m = rezoningModeRef.current
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

  const handleTakeoverPlotSelect = (row: number, col: string) => {
    const sel = takeoverSelectModeRef.current
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
      `${attackerPreview.name} paid $1M and is rolling to seize ${col}${row}.`
    )
    if (takeoverBonus !== 0) {
      const prefix = takeoverBonus > 0 ? `+${takeoverBonus}` : `${takeoverBonus}`
      toast.info(`${prefix} takeover influence — ${takeoverLabels.join(', ')}.`)
    }
    toast.success(
      `You paid $1M to ${ownerName}. The die must be rolled in the dialog — 5–6 is a Successful Take Over; 1–4 is Unsuccessful.`
    )
  }

  const handleScandalPlotSelect = (row: number, col: string) => {
    const sel = scandalSelectModeRef.current
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
      toast.error('That anchor’s influence is already discontinued.')
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

  const handlePlotClaim = (row: number, col: string) => {
    if (rezoningModeRef.current.phase === 'pick-plot') {
      handleRezoningPlotSelect(row, col)
      return
    }
    if (scandalSelectModeRef.current.active) {
      handleScandalPlotSelect(row, col)
      return
    }
    if (takeoverSelectModeRef.current.active) {
      handleTakeoverPlotSelect(row, col)
      return
    }
    if (removeInvestorsSelectModeRef.current.active) {
      handleRemoveInvestorsPlotSelect(row, col)
      return
    }
    if (investmentSelectModeRef.current.active) {
      handleInvestmentPlotSelect(row, col)
      return
    }
    if (discardPropertySelectModeRef.current.active) {
      toast.error('Finish or cancel Discard Property Cards before using the board.')
      return
    }
    if (placementMode.active) {
      handlePlotSelect(row, col)
      return
    }

    return
  }

  const resetLocalUiToTitle = () => {
    setPartyBoardConfig(null)
    setGameState(initialGameState)
    setPlacementMode({
      active: false,
      propertyCardId: null,
      housingHighDensity: undefined,
      taxBuildActionInstanceId: undefined,
      wildCardEmulatePropertyId: undefined,
    })
    setIncomeDialogState({
      open: false,
      player: null,
      totalIncome: 0,
      churchIncomeBonus: 0,
      churchBonusSourceLabels: [],
      farmCoopIncomeBonus: 0,
      farmCoopBonusSourceLabels: [],
      portAuthorityIncomeBonus: 0,
      portAuthorityBonusSourceLabels: [],
      artsCouncilIncomeBonus: 0,
      artsCouncilBonusSourceLabels: [],
      tourismOfficeIncomeBonus: 0,
      tourismOfficeBonusSourceLabels: [],
      influencersIncomeBonus: 0,
      influencersBonusSourceLabels: [],
      newsOutletIncomeBonus: 0,
      newsOutletBonusSourceLabels: [],
      mafiaIncomeBonus: 0,
      mafiaBonusSourceLabels: [],
      mafiaLevyTotal: 0,
      regulationBureauIncomeBonus: 0,
      regulationBureauBonusSourceLabels: [],
      regulationBureauIncomePenalty: 0,
      rivalRegulationBureauPlotLabels: [],
      unionIncomeBonus: 0,
      unionBonusSourceLabels: [],
      unionIncomePenalty: 0,
      rivalUnionPlotLabels: [],
      hasBuiltPropertiesForIncomeRoll: false,
      actionInstanceId: null,
    })
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
    if (boardNoticeTimerRef.current) {
      clearTimeout(boardNoticeTimerRef.current)
      boardNoticeTimerRef.current = null
    }
    setBoardNotice(null)
  }

  /** Soft leave — keeps host authority so the same table can be Resumed after a freeze/exit. */
  const handleLeaveTable = () => {
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
    resetLocalUiToTitle()
  }

  /** Host-only: tear down the live table and delete the resume snapshot. */
  const handleEndTable = () => {
    if (partyBoardConfig?.role === 'host') {
      partyBoardSync.sendGameClear()
      clearAuthoritySnapshot(partyBoardConfig.roomId)
      clearLastOnlineSession()
      toast.info('Table ended. Guests can no longer rejoin this room.')
    }
    resetLocalUiToTitle()
  }

  /** Title / New Game control — soft-leave online tables so host/guest can Resume/Rejoin. */
  const handleNewGame = () => {
    if (partyBoardConfig && safeGameState.isSetupComplete) {
      handleLeaveTable()
      return
    }
    if (partyBoardConfig?.role === 'host') {
      handleEndTable()
      return
    }
    resetLocalUiToTitle()
    toast.info('Starting a new game...')
  }

  const DOUBLE_INCOME_BANK_VALUE = actionCards.find((c) => c.id === 'double-income')?.bankValue ?? 5

  const handleDoubleIncomeOrphanConfirmBank = () => {
    const instanceId = doubleIncomeOrphanDialog.instanceId
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

  const handleIncomeComplete = (
    earnedIncome: number,
    doubleIncomeInstanceId?: string,
    incomeResolution: 'property-roll' | 'bank-income-card' = 'property-roll',
    dieFace?: number
  ) => {
    if (!incomeDialogState.actionInstanceId) return

    // The acting device's IncomeDialog already played the cash register locally;
    // mirror it to the rest of the table so income lands with sound everywhere.
    broadcastBoardFx(
      {
        sound: 'income',
        notice: {
          title: `${incomeDialogState.player?.name ?? 'A founder'} collected income`,
          detail: `$${earnedIncome}M added to their treasury.`,
        },
      },
      { localEcho: false }
    )

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
    const ownerId = incomeOwnerPreview.id
    const pendingTax = (safeGameState.pendingIncomeTaxPlayerIds ?? []).includes(ownerId)
    const totalInc = incomeDialogState.totalIncome
    const levy = pendingTax ? Math.floor(totalInc * 0.5) : 0

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

    const resetIncomeDialog = () =>
      setIncomeDialogState({
        open: false,
        player: null,
        totalIncome: 0,
        churchIncomeBonus: 0,
        churchBonusSourceLabels: [],
        farmCoopIncomeBonus: 0,
        farmCoopBonusSourceLabels: [],
        portAuthorityIncomeBonus: 0,
        portAuthorityBonusSourceLabels: [],
        artsCouncilIncomeBonus: 0,
        artsCouncilBonusSourceLabels: [],
        tourismOfficeIncomeBonus: 0,
        tourismOfficeBonusSourceLabels: [],
        influencersIncomeBonus: 0,
        influencersBonusSourceLabels: [],
        newsOutletIncomeBonus: 0,
        newsOutletBonusSourceLabels: [],
        mafiaIncomeBonus: 0,
        mafiaBonusSourceLabels: [],
        mafiaLevyTotal: 0,
        regulationBureauIncomeBonus: 0,
        regulationBureauBonusSourceLabels: [],
        regulationBureauIncomePenalty: 0,
        rivalRegulationBureauPlotLabels: [],
        unionIncomeBonus: 0,
        unionBonusSourceLabels: [],
        unionIncomePenalty: 0,
        rivalUnionPlotLabels: [],
        hasBuiltPropertiesForIncomeRoll: false,
        actionInstanceId: null,
      })

    if (isOnlineActor) {
      sendAction({
        type: 'income_complete',
        incomeInstanceId: incomeDialogState.actionInstanceId,
        earnedIncome,
        totalPropertyIncomeBase: totalInc,
        doubleIncomeInstanceId: effectiveDoubleIncomeId,
        incomeResolution,
      })
      resetIncomeDialog()
    } else {
      patchGameState((current) => {
      const currentPlayer = current.players[current.currentPlayerIndex]
      const ownerIdResolved = currentPlayer.id
      const stillPendingTax = (current.pendingIncomeTaxPlayerIds ?? []).includes(ownerIdResolved)

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
        c => c.instanceId !== incomeDialogState.actionInstanceId
      )

      if (effectiveDoubleIncomeId) {
        updatedActionCards = updatedActionCards.filter(
          c => c.instanceId !== effectiveDoubleIncomeId
        )
      }

      const incomeCardInstance = currentPlayer.actionCards.find(
        c => c.instanceId === incomeDialogState.actionInstanceId
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

      const nextPendingTax =
        stillPendingTax
          ? (current.pendingIncomeTaxPlayerIds ?? []).filter((id) => id !== ownerIdResolved)
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
          handleEndTurn()
        }, 0)
      }

      return withReplenishedActionHand(newState, current.currentPlayerIndex)
    })
    }

    if (!isOnlineActor) {
      resetIncomeDialog()
    }

    if (isPropertyRoll && dieFace != null) {
      broadcastDiceRollNotice(
        `${incomeOwnerPreview.name} rolled ${dieFace}`,
        `$${earnedIncome}M collected${cashToAdd !== earnedIncome ? ` · keeps $${cashToAdd}M after shares and levies` : ''}.`,
        'income'
      )
    } else if (incomeResolution === 'bank-income-card') {
      broadcastDiceRollNotice(
        `${incomeOwnerPreview.name} banked Income`,
        `$${earnedIncome}M added to their treasury.`,
        'income'
      )
    }

    toast.success(
      pendingTax
        ? `Income collected: $${cashToAdd}M after city tax assessment${levy > 0 ? ` (−$${levy}M)` : ''}.`
        : isPropertyRoll && totalInvestorPayout > 0
          ? `You collected $${earnedIncome}M before investor shares; you keep $${cashToAdd}M.`
          : `Income collected: $${cashToAdd}M!`
    )
    if (pendingTax) {
      const taxTitle = 'Tax Time Boys & Girls!'
      const taxDetail =
        levy > 0
          ? `City assessment: −$${levy}M (50% of your $${totalInc}M property income base). You keep $${cashToAdd}M. Cannot be overturned.`
          : `Assessment cleared on this Income. You keep $${cashToAdd}M. Cannot be overturned.`
      broadcastBoardFx({ notice: { title: taxTitle, detail: taxDetail }, sound: 'boo' })
    }
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
  }

  const handleIncomeCancel = () => {
    setIncomeDialogState({
      open: false,
      player: null,
      totalIncome: 0,
      churchIncomeBonus: 0,
      churchBonusSourceLabels: [],
      farmCoopIncomeBonus: 0,
      farmCoopBonusSourceLabels: [],
      portAuthorityIncomeBonus: 0,
      portAuthorityBonusSourceLabels: [],
      artsCouncilIncomeBonus: 0,
      artsCouncilBonusSourceLabels: [],
      tourismOfficeIncomeBonus: 0,
      tourismOfficeBonusSourceLabels: [],
      influencersIncomeBonus: 0,
      influencersBonusSourceLabels: [],
      newsOutletIncomeBonus: 0,
      newsOutletBonusSourceLabels: [],
      mafiaIncomeBonus: 0,
      mafiaBonusSourceLabels: [],
      mafiaLevyTotal: 0,
      regulationBureauIncomeBonus: 0,
      regulationBureauBonusSourceLabels: [],
      regulationBureauIncomePenalty: 0,
      rivalRegulationBureauPlotLabels: [],
      unionIncomeBonus: 0,
      unionBonusSourceLabels: [],
      unionIncomePenalty: 0,
      rivalUnionPlotLabels: [],
      hasBuiltPropertiesForIncomeRoll: false,
      actionInstanceId: null,
    })
    toast.info('Income card not played')
  }

  const handlePropertyClick = (row: number, col: string) => {
    if (placementMode.active) return
    if (rezoningMode.phase !== 'inactive') return
    if (takeoverSelectMode.active) return
    if (scandalSelectMode.active) return
    if (investmentSelectMode.active) return
    if (discardPropertySelectMode.active) return
    if (removeInvestorsSelectMode.active) return

    if (
      safeGameState.lastBuiltProperty &&
      safeGameState.lastBuiltProperty.row === row &&
      safeGameState.lastBuiltProperty.col === col &&
      canUndoLastAction(safeGameState, { handInteractionsActive, isSpectator })
    ) {
      setUndoActionDialogOpen(true)
    }
  }

  const handleUndoLastAction = () => {
    const label = safeGameState.undoLastAction?.label ?? 'Last action'
    patchGameState((current) => {
      const restored = restoreUndoSnapshot(current)
      if (restored === current) return current
      toast.success(`Undid: ${label}`)
      return restored
    })
    setUndoActionDialogOpen(false)
  }

  const handleUndoLastActionCancel = () => {
    setUndoActionDialogOpen(false)
  }

  const finalizeCouncilFreezeAttackFailure = useCallback((instanceId: string, source: 'accept' | 'auto' = 'accept') => {
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
  }, [announceConfrontation])

  const handleAttackerDieSettled = useCallback((natural: number) => {
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
  }, [])

  const handleCouncilFreezeAttackerRollAgain = useCallback(() => {
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
  }, [])

  const handleCouncilFreezeFailDismiss = useCallback(() => {
    const id = rollDieDialogStateRef.current.actionInstanceId
    if (!id) return
    finalizeCouncilFreezeAttackFailure(id, 'auto')
  }, [finalizeCouncilFreezeAttackFailure])

  /** Discard a played action card, count it against the turn, and clear the dice dialog. Used by police raid and remove investors single-roll flows. */
  const finalizeSimpleActionResolution = useCallback(
    (instanceId: string, toastMessage: { type: 'success' | 'info' | 'error'; text: string }) => {
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
    },
    [handleEndTurn]
  )

  const finalizeScandalCardSpent = useCallback((instanceId: string) => {
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
  }, [])

  const handleRollDieComplete = (result: number) => {
    const dialog = rollDieDialogStateRef.current
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

      finalizeCouncilFreezeAttackFailure(dialog.actionInstanceId)
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
          `Rolled ${takeoverTotal} — ${ownerName} must roll a 6 at ${ctx.col}${ctx.row} to block.`,
          'boo'
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
            `Rolled ${takeoverTotal} — ${ownerName} must roll a 6 at ${ctx.col}${ctx.row} to block.`,
            'boo'
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
          'cheer'
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
          const takeoverTriggerPatch = buildEndGameTriggerPatch(current, newPlots, { row, col })
          const stateAfterTakeover: GameState = { ...baseUpdate, ...takeoverTriggerPatch }
          setTimeout(() => {
            toast.success(
              `Takeover complete — paid $${payment120Million}M (120% of end value) to the former owner.`
            )
          }, 0)
          if (takeoverTriggerPatch.endGameTriggered) {
            const triggererName =
              current.players.find((p) => p.id === takeoverTriggerPatch.endGameTriggerPlayerId)?.name ??
              'A founder'
            setTimeout(() => {
              toast.success(
                `${triggererName} completed nine properties in a row or a city block — Final Round! Each founder gets one more turn.`
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
            'dwindle'
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
        finalizeScandalCardSpent(instanceId)
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
        finalizeScandalCardSpent(instanceId)
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
        finalizeScandalCardSpent(instanceId)
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
            newPlots[plotIndex] = { ...plot, anchorInfluenceSuppressed: true }
            const anchorName =
              propertyCards.find((c) => c.id === ctx.anchorCardId)?.name ?? 'Anchor'
            setTimeout(() => {
              toast.success(`Influence discontinued for ${anchorName} at ${ctx.col}${ctx.row}.`)
            }, 0)
            return { ...current, plots: newPlots }
          })
          announceConfrontation(
            'Scandal',
            attackerName,
            ownerName,
            'success',
            `Anchor influence discontinued at ${ctx.col}${ctx.row}.`,
            'dwindle'
          )
        }
      }
      finalizeScandalCardSpent(instanceId)
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
        const triggerPatch = buildEndGameTriggerPatch(current, newPlots, { row: ctx.row, col: ctx.col })
        const stateWithTrigger: GameState = { ...newState, ...triggerPatch }
        if (triggerPatch.endGameTriggered) {
          const triggererName =
            current.players.find((p) => p.id === triggerPatch.endGameTriggerPlayerId)?.name ?? 'A founder'
          setTimeout(() => {
            toast.success(
              `${triggererName} completed nine properties in a row or a city block — Final Round! Each founder gets one more turn.`
            )
          }, 600)
        }
        if (turnLimitReached(newTurnConsumed)) {
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
        finalizeSimpleActionResolution(instanceId, {
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
        targetPlayerId: undefined,
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
                  ? { ...p, anchorInfluenceSuppressed: true }
                  : p
              ),
            }))
          }
          announceConfrontation(
            'Police Raid on Mafia',
            attackerName,
            mafiaOwner,
            'success',
            `Mafia rolls ${result} — cannot counter (needed ${counterThreshold}+). Influence discontinued.`,
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

      finalizeSimpleActionResolution(dialog.actionInstanceId, {
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
        finalizeSimpleActionResolution(instanceId, {
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
        finalizeSimpleActionResolution(instanceId, {
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

  const handleRollDieCancel = () => {
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
      rollDieDialogStateRef.current.mode === 'remove-investors'
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

  /**
   * In-table recovery without Leave/Resume. Clears stuck select modes, force-resolves
   * computer dice (City Council Freeze / Scandal / Takeover / etc.), and nudges Founderbots.
   */
  const handleUnstickPlay = () => {
    const canDriveBots = !partyBoardConfig || partyBoardConfig.role === 'host'
    if (!canDriveBots) {
      // A roll dialog open on THIS device is driven by this device (e.g. a guest's
      // own defense roll). Force-resolve it locally so a hung dice renderer cannot
      // hard-lock the guest — everything else needs the host.
      const guestRoll = rollDieDialogStateRef.current
      if (guestRoll.open) {
        handleRollDieComplete(Math.floor(Math.random() * 6) + 1)
        toast.success('Forced dice resolution — play continues.')
        return
      }
      toast.info('Ask the host to tap Unstick, or use Resync if the connection looks stale.')
      return
    }

    const acting = safeGameState.players[safeGameState.currentPlayerIndex]

    // Force-resolve stuck Income (bots) — previously Unstick could not clear this dialog.
    if (incomeDialogState.open && (acting?.isAi === true || incomeDialogState.player?.isAi === true)) {
      if (incomeDialogState.hasBuiltPropertiesForIncomeRoll) {
        const face = 4
        const pct = incomePercentageForDie(face)
        const amount = Math.floor((incomeDialogState.totalIncome * pct) / 100)
        handleIncomeComplete(Math.max(0, amount), undefined, 'property-roll', face)
      } else {
        const bv = actionCards.find((c) => c.id === 'income')?.bankValue ?? 2
        handleIncomeComplete(bv, undefined, 'bank-income-card')
      }
      toast.success('Forced Income resolution for Founderbot — play continues.')
      return
    }

    // Force-resolve excess-hand discard dialog for the acting seat.
    if (discardDialogState.open && acting) {
      const n = discardDialogState.numToDiscard
      const hand = acting.actionCards || []
      const ids = hand.slice(0, Math.min(Math.max(0, n), hand.length)).map((c) => c.instanceId)
      handleDiscardComplete(ids)
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
    if (takeoverSelectMode.active) {
      handleCancelTakeoverSelect()
      clearedSelect = true
    }
    if (scandalSelectMode.active) {
      handleCancelScandalSelect()
      clearedSelect = true
    }
    if (investmentSelectMode.active) {
      handleCancelInvestmentSelect()
      clearedSelect = true
    }
    if (removeInvestorsSelectMode.active) {
      handleCancelRemoveInvestorsSelect()
      clearedSelect = true
    }
    if (discardPropertySelectMode.active || discardPropertyConfirmOpen) {
      // Bots must spend the action (not cancel) or they re-play Discard Property Cards forever.
      if (acting?.isAi === true) {
        handleConfirmDiscardProperty(pickAiDiscardPropertyIds(acting))
        toast.success('Completed stuck Discard Property Cards for Founderbot.')
        return
      }
      handleCancelDiscardPropertySelect()
      clearedSelect = true
    }
    if (rezoningMode.phase !== 'inactive') {
      handleCancelRezoning()
      clearedSelect = true
    }
    if (placementMode.active) {
      setPlacementMode({
        active: false,
        propertyCardId: null,
        housingHighDensity: undefined,
        taxBuildActionInstanceId: undefined,
        wildCardEmulatePropertyId: undefined,
      })
      clearedSelect = true
    }
    if (actionCriteriaDialog.open) {
      handleActionCriteriaBank()
      toast.success('Banked the stuck action card — play continues.')
      return
    }

    const rd = rollDieDialogStateRef.current
    if (rd.open && rollSeatIsAi(safeGameState, rd, acting)) {
      const forced = Math.floor(Math.random() * 6) + 1
      handleRollDieComplete(forced)
      toast.success('Forced computer dice resolution — play continues.')
      return
    }

    // Human roll stuck on this device (hung WebGL init leaves the Roll button on
    // "Loading..." with no Cancel on confrontation modes) — resolve it the same way.
    if (rd.open) {
      handleRollDieComplete(Math.floor(Math.random() * 6) + 1)
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
          handleRollDieComplete(Math.floor(Math.random() * 6) + 1)
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
          handleRollDieComplete(Math.floor(Math.random() * 6) + 1)
        }, 120)
        toast.success('Resumed computer defense roll.')
        return
      }
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
    handleUndoLastActionCancel,
    handleActionCriteriaBank,
    handleCancelTakeoverSelect,
    handleCancelScandalSelect,
    handleCancelRezoning,
    handleCancelInvestmentSelect,
    handleCancelRemoveInvestorsSelect,
    handleCancelDiscardPropertySelect,
    handleConfirmDiscardProperty,
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
  aiUiRef.current = {
    undoActionDialogOpen,
    // Notices are drama for humans; bots must keep resolving or select modes freeze the table.
    boardNoticeActive: false,
    showNewCardsAnimation: !!safeGameState.showNewCardsAnimation,
    taxBuildPromptOpen: taxBuildPrompt.open,
    discardPropertyConfirmOpen,
    discardDialogOpen: discardDialogState.open,
    rollDieDialogOpen: rollDieDialogState.open,
    incomeDialogOpen: incomeDialogState.open,
    takeoverSelectActive: takeoverSelectMode.active,
    scandalSelectActive: scandalSelectMode.active,
    rezoningPhase: rezoningMode.phase,
    investmentSelectActive: investmentSelectMode.active,
    removeInvestorsSelectActive: removeInvestorsSelectMode.active,
    discardPropertySelectActive: discardPropertySelectMode.active,
    taxBuildModePhase: taxBuildMode.phase,
    placementActive: placementMode.active,
    placementPropertyCardId: placementMode.propertyCardId,
    placementWildEmulatePropertyId: placementMode.wildCardEmulatePropertyId,
    placementHousingHighDensity: placementMode.housingHighDensity,
    actionCriteriaDialogOpen: actionCriteriaDialog.open,
    selectValidPlots: takeoverSelectMode.active
      ? takeoverSelectMode.validPlots
      : scandalSelectMode.active
        ? scandalSelectMode.validPlots
        : investmentSelectMode.active
          ? investmentSelectMode.validPlots
          : removeInvestorsSelectMode.active
            ? removeInvestorsSelectMode.validPlots
            : undefined,
    investmentContributionMillion: investmentSelectMode.active
      ? investmentSelectMode.contributionMillion
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
      const gsSnap = aiGsRef.current
      const cpSnap = aiCpRef.current
      const ui = aiUiRef.current
      const hx = aiHooksRef.current
      if (!ui || !gsSnap || !cpSnap || !cpSnap.isAi) return
      const acted = trySimpleAiMainPhase(gsSnap, cpSnap, ui, hx)
      if (acted) lastAiProgressAtRef.current = Date.now()
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
    !showOpeningProTip &&
    handRailPlayerIndex === safeGameState.currentPlayerIndex &&
    actingPlayerSeat?.isAi !== true

  const undoLastActionAvailable = canUndoLastAction(safeGameState, {
    handInteractionsActive,
    isSpectator,
  })

  const boardHudIconButtonClass =
    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-[#a8b0c8] transition-colors hover:border-[#c9a85c]/45 hover:bg-[#1a1a24] hover:text-[#f5ecd7] disabled:opacity-35 disabled:pointer-events-none disabled:hover:border-white/12 disabled:hover:bg-white/[0.04] disabled:hover:text-[#a8b0c8]'

  const calculatePlayerStats = (player: Player) => {
    const ownedPlots = safeGameState.plots.filter(p => p.claimedBy === player.id && p.builtProperty)

    let totalPropertyValue = 0
    let totalIncome = 0

    ownedPlots.forEach(plot => {
      const propertyCard = propertyCards.find(c => c.id === plot.builtProperty)
      if (propertyCard) {
        totalPropertyValue += getPlotPropertyEndValue(plot, propertyCard)
        totalIncome += getPlotPropertyIncome(plot, propertyCard)
      }
    })

    const investmentBook = sumInvestmentBookForPlayer(safeGameState.plots, player.id)

    return {
      plotCount: safeGameState.plots.filter(p => p.claimedBy === player.id).length,
      propertyValue: totalPropertyValue,
      income: totalIncome,
      totalValue: player.money + totalPropertyValue + investmentBook,
    }
  }

  /**
   * Once the game has ended (and only then, per the spec — final accounting), gather the named
   * Squares + Streets so the GameBoard can render player-colored highlights and labels and
   * `calculateFinalScores` can attribute bonuses without redoing the work.
   */
  const namedRegionsForBoard = (() => {
    if (!safeGameState.gameEnded) {
      return {
        squares: [] as Array<{ ownerPlayerId: number; name: string; bounds: { minRow: number; maxRow: number; minCol: string; maxCol: string }; lots: Array<{ row: number; col: string }>; color: string }>,
        streets: [] as Array<{ ownerPlayerId: number; name: string; orientation: 'horizontal' | 'vertical'; lots: Array<{ row: number; col: string }>; streetSegment: Array<{ row: number; col: string }>; color: string }>,
      }
    }
    const allSquares = findCompleteSquares(safeGameState.plots)
    const allStreets = findCompleteStreets(safeGameState.plots)
    const playerById = new Map(safeGameState.players.map((p) => [p.id, p]))
    return {
      squares: allSquares.map((s) => {
        const p = playerById.get(s.ownerPlayerId)
        return {
          ownerPlayerId: s.ownerPlayerId,
          name: `${p?.name ?? 'Founder'} Square`,
          bounds: s.bounds,
          lots: s.lots,
          color: p?.color ?? 'rgba(255,255,255,0.6)',
        }
      }),
      streets: allStreets.map((s) => {
        const p = playerById.get(s.ownerPlayerId)
        return {
          ownerPlayerId: s.ownerPlayerId,
          name: `${p?.name ?? 'Founder'} Street`,
          orientation: s.orientation,
          lots: s.lots,
          streetSegment: s.streetSegment,
          color: p?.color ?? 'rgba(255,255,255,0.6)',
        }
      }),
    }
  })()
  const namedSquaresForBoard = namedRegionsForBoard.squares
  const namedStreetsForBoard = namedRegionsForBoard.streets

  const calculateFinalScores = (): PlayerScore[] => {
    /** Squares + Streets are computed once per scoring call; any number per player is allowed and each
     *  earns its own $30M bonus. Names are formed from the founder's display name at scoring time. */
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

  const rollDieAiAutoplay = rollSeatIsAi(safeGameState, rollDieDialogState, currentPlayer)

  const councilFreezeTargetId = safeGameState.councilFreezeBlockBuildForPlayerId
  const councilFreezePlayerIndex =
    councilFreezeTargetId != null
      ? safeGameState.players.findIndex((p) => p.id === councilFreezeTargetId)
      : -1
  const councilFreezePlayerNumber =
    councilFreezePlayerIndex >= 0 ? councilFreezePlayerIndex + 1 : null

  /** Compute the single, hard-to-miss "Required Action" banner step from current UI state. Order matters — most-blocking first. */
  const requiredAction: RequiredAction | null = (() => {
    if (rollDieDialogState.open) {
      const defenderName =
        rollDieDialogState.targetPlayerId != null
          ? safeGameState.players.find((p) => p.id === rollDieDialogState.targetPlayerId)?.name
          : undefined
      const aiDiceCta = rollDieAiAutoplay
        ? {
            ctaLabel: 'Unstick',
            onCta: handleUnstickPlay,
            detailSuffix: ' Computer is resolving — tap Unstick if this hangs.',
          }
        : { ctaLabel: 'Roll in dialog', onCta: undefined as (() => void) | undefined, detailSuffix: '' }
      switch (rollDieDialogState.mode) {
        case 'council-freeze-attacker':
          return {
            id: 'cf-att',
            title: rollDieAiAutoplay
              ? 'City Council Freeze — computer rolling'
              : 'City Council Freeze — your roll',
            detail:
              (rollDieAiAutoplay
                ? 'Founderbot is rolling City Council Freeze.'
                : 'Roll the die in the dialog. First roll free; each retry costs $5M. After 3 misses the freeze fails.') +
              aiDiceCta.detailSuffix,
            tone: 'danger',
            ctaLabel: aiDiceCta.ctaLabel,
            onCta: aiDiceCta.onCta,
          }
        case 'council-freeze-defender':
          return {
            id: 'cf-def',
            title: `City Council Freeze — ${defenderName ?? 'defender'} rolls`,
            detail:
              (rollDieAiAutoplay
                ? `${defenderName ?? 'Computer'} is rolling to negate the freeze.`
                : 'Defender rolls once in the dialog. Only a 6 negates the freeze.') +
              aiDiceCta.detailSuffix,
            tone: 'danger',
            ctaLabel: aiDiceCta.ctaLabel,
            onCta: aiDiceCta.onCta,
          }
        case 'hostile-takeover-attacker':
          return {
            id: 'ht-att',
            title: rollDieAiAutoplay
              ? 'Hostile Takeover — computer rolling'
              : 'Hostile Takeover — your roll',
            detail:
              (rollDieAiAutoplay
                ? 'Founderbot is resolving Hostile Takeover.'
                : '$1M attempt fee paid. Roll the die in the dialog — 5–6 succeeds. There is no exit until you roll.') +
              aiDiceCta.detailSuffix,
            tone: 'danger',
            ctaLabel: aiDiceCta.ctaLabel,
            onCta: aiDiceCta.onCta,
          }
        case 'hostile-takeover-defender':
          return {
            id: 'ht-def',
            title: `Hostile Takeover — ${defenderName ?? 'owner'} rolls`,
            detail:
              (rollDieAiAutoplay
                ? `${defenderName ?? 'Computer'} is rolling the defense.`
                : 'Owner rolls once. Only a 6 blocks the takeover.') + aiDiceCta.detailSuffix,
            tone: 'danger',
            ctaLabel: aiDiceCta.ctaLabel,
            onCta: aiDiceCta.onCta,
          }
        case 'scandal-attacker':
          return {
            id: 'sc-att',
            title: rollDieAiAutoplay ? 'Scandal — computer rolling' : 'Scandal — your roll',
            detail:
              (rollDieAiAutoplay
                ? 'Founderbot is resolving Scandal.'
                : 'Roll in the dialog. Total 6+ after Influencer / News Outlet bonuses succeeds.') +
              aiDiceCta.detailSuffix,
            tone: 'warning',
            ctaLabel: aiDiceCta.ctaLabel,
            onCta: aiDiceCta.onCta,
          }
        case 'scandal-defender':
          return {
            id: 'sc-def',
            title: `Scandal — ${defenderName ?? 'anchor owner'} rolls`,
            detail:
              (rollDieAiAutoplay
                ? `${defenderName ?? 'Computer'} is rolling the defense.`
                : 'Anchor owner rolls once. Only a 6 negates the scandal.') + aiDiceCta.detailSuffix,
            tone: 'warning',
            ctaLabel: aiDiceCta.ctaLabel,
            onCta: aiDiceCta.onCta,
          }
        case 'rezoning':
          return {
            id: 'rz-roll',
            title: rollDieAiAutoplay ? 'Rezoning — computer rolling' : 'Rezoning — roll required',
            detail:
              (rollDieAiAutoplay
                ? 'Founderbot is rolling for Rezoning approval.'
                : 'Roll in the dialog. 5–6 approves (4–6 with +1 civic influence).') +
              aiDiceCta.detailSuffix,
            tone: 'warning',
            ctaLabel: aiDiceCta.ctaLabel,
            onCta: aiDiceCta.onCta,
          }
        case 'police-raid-attacker':
          return {
            id: 'pr-att',
            title: rollDieAiAutoplay
              ? 'Police Raid — computer rolling'
              : 'Police Raid on Mafia — your roll',
            detail:
              (rollDieAiAutoplay
                ? 'Founderbot is resolving Police Raid on Mafia.'
                : 'Roll in the dialog. 5–6 succeeds (4–6 if you own a built Police lot).') +
              aiDiceCta.detailSuffix,
            tone: 'danger',
            ctaLabel: aiDiceCta.ctaLabel,
            onCta: aiDiceCta.onCta,
          }
        case 'police-raid-defender':
          return {
            id: 'pr-def',
            title: 'Police Raid on Mafia — Mafia counter roll',
            detail:
              (rollDieAiAutoplay
                ? 'Computer is rolling the Mafia counter.'
                : 'Mafia rolls once. A 6 counters (5–6 if you own Police).') + aiDiceCta.detailSuffix,
            tone: 'danger',
            ctaLabel: aiDiceCta.ctaLabel,
            onCta: aiDiceCta.onCta,
          }
        case 'remove-investors':
          return {
            id: 'ri',
            title: rollDieAiAutoplay
              ? 'Remove Investors — computer rolling'
              : 'Remove Investors — roll required',
            detail:
              (rollDieAiAutoplay
                ? 'Founderbot is rolling to clear investors.'
                : 'Roll in the dialog. Total 5+ includes block anchor and civic influence. No investor counter-roll. On success pay each investor 50% of their stake; all stripes on that lot clear.') +
              aiDiceCta.detailSuffix,
            tone: 'warning',
            ctaLabel: aiDiceCta.ctaLabel,
            onCta: aiDiceCta.onCta,
          }
        case 'roll-die':
          return {
            id: 'roll-die',
            title: 'Roll required',
            detail: 'Roll the die in the dialog to continue.' + aiDiceCta.detailSuffix,
            tone: 'info',
            ctaLabel: aiDiceCta.ctaLabel,
            onCta: aiDiceCta.onCta,
          }
      }
    }
    if (safeGameState.pendingCouncilFreezeDefense) {
      const pending = safeGameState.pendingCouncilFreezeDefense
      const pendingDefAi =
        safeGameState.players.find((p) => p.id === pending.targetPlayerId)?.isAi === true
      return {
        id: 'cf-def-wait',
        title: `City Council Freeze — ${pending.targetName} is rolling`,
        detail: pendingDefAi
          ? `${pending.attackerName}'s freeze succeeded. ${pending.targetName} (computer) should auto-roll — tap Unstick if this hangs.`
          : `${pending.attackerName}'s freeze succeeded. ${pending.targetName} rolls on their own screen — only a 6 negates it.`,
        tone: 'danger',
        ctaLabel: pendingDefAi ? 'Unstick' : 'Waiting for their roll',
        onCta: pendingDefAi ? handleUnstickPlay : undefined,
      }
    }
    if (safeGameState.pendingRebuttalRoll) {
      const pending = safeGameState.pendingRebuttalRoll
      const kindTitle =
        pending.kind === 'scandal'
          ? 'Scandal'
          : pending.kind === 'hostile-takeover'
            ? 'Hostile Takeover'
            : 'Police Raid on Mafia'
      const pendingDefAi =
        safeGameState.players.find((p) => p.id === pending.targetPlayerId)?.isAi === true
      return {
        id: 'rebuttal-wait',
        title: `${kindTitle} — ${pending.targetName} is rolling`,
        detail: pendingDefAi
          ? `${pending.attackerName}'s play succeeded. ${pending.targetName} (computer) should auto-roll — tap Unstick if this hangs.`
          : `${pending.attackerName}'s play succeeded. ${pending.targetName} rolls on their own screen.`,
        tone: 'danger',
        ctaLabel: pendingDefAi ? 'Unstick' : 'Waiting for their roll',
        onCta: pendingDefAi ? handleUnstickPlay : undefined,
      }
    }
    if (discardDialogState.open || safeGameState.awaitingEndTurnActionDiscard) {
      return {
        id: 'action-hand-discard',
        title: `End of turn — discard to ${MAX_ACTION_HAND_SIZE}`,
        detail: `You may hold more than ${MAX_ACTION_HAND_SIZE} action cards during your turn. Discard down to ${MAX_ACTION_HAND_SIZE} now to finish ending this turn.`,
        tone: 'warning',
        ctaLabel: 'Choose cards in dialog',
      }
    }
    if (incomeDialogState.open) {
      return {
        id: 'income',
        title: 'Income — review and confirm',
        detail:
          'Review your income breakdown in the dialog and click Collect to take your earnings before continuing your turn.',
        tone: 'info',
        ctaLabel: 'Collect in dialog',
      }
    }
    if (rezoningMode.phase === 'pick-property') {
      return {
        id: 'rz-pick-property',
        title: 'Rezoning — pick a property card',
        detail: 'Click a highlighted non-anchor property card in your hand to use for Rezoning.',
        tone: 'warning',
        cancelLabel: 'Cancel Rezoning',
        onCancel: handleCancelRezoning,
      }
    }
    if (rezoningMode.phase === 'pick-housing-density') {
      return {
        id: 'rz-density',
        title: 'Rezoning — choose Housing density',
        detail: 'Pick standard ($10M) or high-density ($18M) housing in your hand panel.',
        tone: 'warning',
        cancelLabel: 'Cancel Rezoning',
        onCancel: handleCancelRezoning,
      }
    }
    if (rezoningMode.phase === 'pick-plot') {
      return {
        id: 'rz-pick-plot',
        title: 'Rezoning — pick a vacant city lot',
        detail: 'Click a highlighted vacant city lot on the board.',
        tone: 'warning',
        cancelLabel: 'Cancel Rezoning',
        onCancel: handleCancelRezoning,
      }
    }
    if (takeoverSelectMode.active) {
      return {
        id: 'ht-pick',
        title: currentPlayer.isAi
          ? 'Hostile Takeover — computer choosing target'
          : 'Hostile Takeover — pick a target',
        detail: currentPlayer.isAi
          ? 'Founderbot should select a highlighted lot — tap Unstick if this hangs.'
          : 'Click a highlighted opponent property on the board (same city block or orthogonal to your built lots, including across a street).',
        tone: 'danger',
        ctaLabel: currentPlayer.isAi ? 'Unstick' : undefined,
        onCta: currentPlayer.isAi ? handleUnstickPlay : undefined,
        cancelLabel: currentPlayer.isAi ? undefined : 'Cancel Takeover',
        onCancel: currentPlayer.isAi ? undefined : handleCancelTakeoverSelect,
      }
    }
    if (scandalSelectMode.active) {
      return {
        id: 'sc-pick',
        title: currentPlayer.isAi
          ? 'Scandal — computer choosing target'
          : 'Scandal — pick an anchor target',
        detail: currentPlayer.isAi
          ? 'Founderbot should select a highlighted anchor — tap Unstick if this hangs.'
          : 'Click a highlighted built anchor tenant on the board to scandalize.',
        tone: 'warning',
        ctaLabel: currentPlayer.isAi ? 'Unstick' : undefined,
        onCta: currentPlayer.isAi ? handleUnstickPlay : undefined,
        cancelLabel: currentPlayer.isAi ? undefined : 'Cancel Scandal',
        onCancel: currentPlayer.isAi ? undefined : handleCancelScandalSelect,
      }
    }
    if (removeInvestorsSelectMode.active) {
      return {
        id: 'ri-pick',
        title: currentPlayer.isAi
          ? 'Remove Investors — computer choosing lot'
          : 'Remove Investors — pick your property',
        detail: currentPlayer.isAi
          ? 'Founderbot should pick an invested lot — tap Unstick if this hangs.'
          : 'Click a highlighted lot you own that still has investor stripes. Multiple investors on one lot are cleared together if you succeed. You must be able to afford the combined 50% buyouts before the roll.',
        tone: 'warning',
        ctaLabel: currentPlayer.isAi ? 'Unstick' : undefined,
        onCta: currentPlayer.isAi ? handleUnstickPlay : undefined,
        cancelLabel: currentPlayer.isAi ? undefined : 'Cancel',
        onCancel: currentPlayer.isAi ? undefined : handleCancelRemoveInvestorsSelect,
      }
    }
    if (investmentSelectMode.active) {
      return {
        id: 'inv-pick',
        title: currentPlayer.isAi
          ? 'Investment — computer choosing target'
          : 'Investment — pick a target',
        detail: currentPlayer.isAi
          ? 'Founderbot should select a highlighted lot — tap Unstick if this hangs.'
          : 'Click a highlighted opponent property on the board to invest in it.',
        tone: 'info',
        ctaLabel: currentPlayer.isAi ? 'Unstick' : undefined,
        onCta: currentPlayer.isAi ? handleUnstickPlay : undefined,
        cancelLabel: currentPlayer.isAi ? undefined : 'Cancel Investment',
        onCancel: currentPlayer.isAi ? undefined : handleCancelInvestmentSelect,
      }
    }
    if (discardPropertySelectMode.active) {
      return {
        id: 'dpc-pick',
        title: currentPlayer.isAi
          ? 'Discard Property Cards — computer resolving'
          : 'Discard Property Cards — choose from hand',
        detail: currentPlayer.isAi
          ? 'Founderbot is discarding from its own hand (not the host rail) — tap Unstick if this hangs.'
          : 'All property cards are highlighted. Tap to select (orange) or deselect. Confirm in the dialog to discard and draw replacements — or discard none and spend only the action.',
        tone: 'info',
        ctaLabel: currentPlayer.isAi ? 'Unstick' : 'Review / discard…',
        onCta: currentPlayer.isAi
          ? handleUnstickPlay
          : () => setDiscardPropertyConfirmOpen(true),
        cancelLabel: currentPlayer.isAi ? undefined : 'Cancel',
        onCancel: currentPlayer.isAi ? undefined : handleCancelDiscardPropertySelect,
      }
    }
    if (taxBuildMode.phase === 'pick-property') {
      return {
        id: 'tax-pick',
        title: 'Build with Tax Dollars — pick a property card',
        detail: 'Click a highlighted property card in your hand to build at 50% cost.',
        tone: 'info',
        cancelLabel: 'Cancel',
        onCancel: () => {
          setTaxBuildMode({ phase: 'inactive' })
          toast.info('Build with Tax Dollars cancelled.')
        },
      }
    }
    if (placementMode.active && placementMode.propertyCardId) {
      const instance = currentPlayer.propertyCards.find((c) => c.instanceId === placementMode.propertyCardId)
      const card = instance ? propertyCards.find((c) => c.id === instance.cardId) : undefined
      const emulateId = placementMode.wildCardEmulatePropertyId
      const template =
        card && needsEmulateChoiceBeforePlacement(card as PropertyCard)
          ? resolvePropertyPlacementTemplate(card as PropertyCard, emulateId)
          : card
      const placeName = template?.name ?? 'property'
      const placementPlotCount =
        template && instance
          ? getValidPlotsForProperty(
              template as PropertyCard,
              safeGameState.plots,
              safeGameState.crossingTheLineActive
            ).length
          : 0
      const noLots = placementPlotCount === 0
      return {
        id: `place-${placementMode.propertyCardId}`,
        title: noLots ? `Build — no legal lots for ${placeName}` : `Build — pick a lot for ${placeName}`,
        detail: noLots
          ? 'District rules or the board state leave nowhere to build. Click Cancel — nothing is spent; your property card stays in hand.'
          : card && needsEmulateChoiceBeforePlacement(card as PropertyCard)
            ? `Click a highlighted lot on the board to build as ${placeName}, or Cancel to stop without building.`
            : 'Click a highlighted lot on the board to build, or Cancel to stop without building.',
        tone: noLots ? 'warning' : 'info',
        cancelLabel: 'Cancel build',
        onCancel: handleCancelPlacement,
      }
    }
    return null
  })()

  const hostileTakeoverExchange =
    rollDieDialogState.open &&
    rollDieDialogState.mode === 'hostile-takeover-attacker' &&
    rollDieDialogState.takeoverContext
      ? (() => {
          const ctx = rollDieDialogState.takeoverContext
          const plot = safeGameState.plots.find((p) => p.row === ctx.row && p.col === ctx.col)
          const card = plot?.builtProperty ? propertyCards.find((c) => c.id === plot.builtProperty) : undefined
          return {
            attackerName: currentPlayer.name,
            ownerName: safeGameState.players.find((p) => p.id === ctx.ownerPlayerId)?.name ?? 'Owner',
            plotLabel: `${ctx.col}${ctx.row}`,
            buildingName: card?.name ?? 'Property',
          }
        })()
      : undefined

  const rezoningSummaryForDialog =
    rollDieDialogState.open && rollDieDialogState.mode === 'rezoning' && rollDieDialogState.rezoningContext
      ? (() => {
          const rz = rollDieDialogState.rezoningContext
          const nm = propertyCards.find((c) => c.id === rz.propertyCardId)?.name ?? 'Property'
          return {
            propertyName: nm,
            plotLabel: `${rz.col}${rz.row}`,
            buildCostMillion: rz.buildCost,
          }
        })()
      : undefined

  const scandalSummaryForDialog =
    rollDieDialogState.open &&
    rollDieDialogState.mode === 'scandal-attacker' &&
    rollDieDialogState.scandalContext
      ? (() => {
          const sc = rollDieDialogState.scandalContext!
          const nm = propertyCards.find((c) => c.id === sc.anchorCardId)?.name ?? 'Anchor'
          return {
            anchorName: nm,
            plotLabel: `${sc.col}${sc.row}`,
            ownerName:
              safeGameState.players.find((p) => p.id === sc.anchorOwnerPlayerId)?.name ?? 'Owner',
          }
        })()
      : undefined

  const rezoningVacantPlots =
    rezoningMode.phase === 'pick-plot' ? getVacantCityLotsForRezoning(safeGameState.plots) : []

  const boardPlacementMode =
    rezoningMode.phase === 'pick-plot'
      ? {
          active: true as const,
          propertyCardId: null,
          validPlots: rezoningVacantPlots,
          interaction: 'rezoning' as const,
        }
      : scandalSelectMode.active
        ? {
            active: true as const,
            propertyCardId: null,
            validPlots: scandalSelectMode.validPlots,
            interaction: 'scandal' as const,
          }
      : takeoverSelectMode.active
        ? {
            active: true as const,
            propertyCardId: null,
            validPlots: takeoverSelectMode.validPlots,
            interaction: 'hostile-takeover' as const,
          }
        : removeInvestorsSelectMode.active
          ? {
              active: true as const,
              propertyCardId: null,
              validPlots: removeInvestorsSelectMode.validPlots,
              interaction: 'remove-investors' as const,
            }
          : investmentSelectMode.active
          ? {
              active: true as const,
              propertyCardId: null,
              validPlots: investmentSelectMode.validPlots,
              interaction: 'investment' as const,
            }
          : placementMode.active
            ? {
                active: true as const,
                propertyCardId: placementMode.propertyCardId,
                validPlots: placementMode.propertyCardId
                  ? (() => {
                      const instance = currentPlayer.propertyCards.find(
                        (c) => c.instanceId === placementMode.propertyCardId
                      )
                      if (!instance) return [] as Plot[]
                      const card = propertyCards.find((c) => c.id === instance.cardId) as PropertyCard
                      if (!card) return [] as Plot[]
                      const emulateId = placementMode.wildCardEmulatePropertyId
                      const template = resolvePropertyPlacementTemplate(card, emulateId) ?? card
                      if (needsEmulateChoiceBeforePlacement(card) && !emulateId) return [] as Plot[]
                      return getValidPlotsForProperty(
                        template,
                        safeGameState.plots,
                        safeGameState.crossingTheLineActive
                      )
                    })()
                  : ([] as Plot[]),
                interaction: 'build' as const,
              }
            : {
                active: false as const,
                propertyCardId: null,
                validPlots: [] as Plot[],
                interaction: 'build' as const,
              }

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
                ? 'Online table connection — click to resync'
                : 'You are the table host — keep this screen open'
            }
            aria-live="polite"
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] shadow-lg backdrop-blur-md"
            style={{
              cursor: partyBoardConfig.role === 'guest' ? 'pointer' : 'default',
              color:
                connectionStatus === 'connected'
                  ? '#bbf7d0'
                  : connectionStatus === 'error'
                    ? '#fecaca'
                    : '#fde68a',
              borderColor:
                connectionStatus === 'connected'
                  ? 'rgba(74,222,128,0.45)'
                  : connectionStatus === 'error'
                    ? 'rgba(248,113,113,0.5)'
                    : 'rgba(251,191,36,0.5)',
              background:
                connectionStatus === 'connected'
                  ? 'rgba(6,78,59,0.88)'
                  : connectionStatus === 'error'
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
                  connectionStatus === 'connected'
                    ? '#4ade80'
                    : connectionStatus === 'error'
                      ? '#f87171'
                      : '#fbbf24',
                boxShadow:
                  connectionStatus === 'connected' ? '0 0 8px rgba(74,222,128,0.8)' : undefined,
              }}
            />
            {partyBoardConfig.role === 'host'
              ? connectionStatus === 'connected'
                ? 'Hosting'
                : 'Host reconnecting…'
              : connectionStatus === 'connected'
                ? 'Online'
                : connectionStatus === 'resyncing'
                  ? 'Resyncing…'
                  : connectionStatus === 'stale'
                    ? 'Host unreachable'
                    : connectionStatus === 'error'
                      ? 'Connection error'
                      : 'Connecting…'}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: isCompactLayout ? 8 : 12 }}>
          <button
            onClick={handleEndTurn}
            disabled={isSpectator || currentPlayer.isAi === true || showOpeningProTip}
            className="btn-ps"
            style={{
              height: isCompactLayout ? 30 : 34,
              padding: isCompactLayout ? '0 12px' : '0 20px',
              borderRadius: 9999,
              border: '1px solid rgba(255,255,255,0.15)',
              backgroundColor: 'transparent',
              color: '#f0f0f5',
              fontSize: isCompactLayout ? 11 : 12,
              fontWeight: 500,
              cursor: isSpectator || currentPlayer.isAi === true || showOpeningProTip ? 'not-allowed' : 'pointer',
              opacity: isSpectator || currentPlayer.isAi === true || showOpeningProTip ? 0.45 : 1,
            }}
          >
            End Turn
          </button>
          <button
            type="button"
            onClick={handleUnstickPlay}
            data-board-sync-skip-lock
            disabled={isSpectator || showOpeningProTip}
            className="btn-ps"
            title="Clear a stuck Founderbot or confrontation roll without leaving the table"
            style={{
              height: isCompactLayout ? 30 : 34,
              padding: isCompactLayout ? '0 12px' : '0 16px',
              borderRadius: 9999,
              border: '1px solid rgba(251, 191, 36, 0.45)',
              backgroundColor: 'rgba(251, 191, 36, 0.12)',
              color: '#fde68a',
              fontSize: isCompactLayout ? 11 : 12,
              fontWeight: 600,
              cursor: isSpectator || showOpeningProTip ? 'not-allowed' : 'pointer',
              opacity: isSpectator || showOpeningProTip ? 0.45 : 1,
            }}
          >
            Unstick
          </button>
          <button
            onClick={handleNewGame}
            data-board-sync-skip-lock
            className="btn-ps"
            style={{
              height: isCompactLayout ? 30 : 34,
              padding: isCompactLayout ? '0 12px' : '0 20px',
              borderRadius: 9999,
              border: '1px solid rgba(255,255,255,0.15)',
              backgroundColor: 'transparent',
              color: '#f0f0f5',
              fontSize: isCompactLayout ? 11 : 12,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <ArrowCounterClockwise size={13} weight="bold" />
            {isCompactLayout ? 'New' : 'New Game'}
          </button>
        </div>
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
        {/* Players — compact strip on phones; full sidebar on desktop */}
        {isCompactLayout ? (
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              background: 'linear-gradient(180deg, #0a0a0a 0%, #121212 100%)',
              pointerEvents: showOpeningProTip ? 'none' : 'auto',
              opacity: showOpeningProTip ? 0.55 : 1,
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                flexShrink: 0,
                ...(isSpectator ? { pointerEvents: 'auto' } : undefined),
              }}
            >
              <button
                type="button"
                aria-label="Undo last action"
                title={
                  undoLastActionAvailable
                    ? `Undo: ${safeGameState.undoLastAction?.label ?? 'last action'}`
                    : 'No action to undo this turn'
                }
                disabled={!undoLastActionAvailable}
                onClick={() => setUndoActionDialogOpen(true)}
                className={boardHudIconButtonClass}
                style={{ height: 32, width: 32 }}
              >
                <ArrowCounterClockwise size={16} weight="duotone" />
              </button>
              <button
                type="button"
                aria-label="Open quick rules"
                title="Quick rules"
                onClick={() => setRulesQuickOpen(true)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-[#a8b0c8]"
              >
                <BookOpen size={16} weight="duotone" />
              </button>
              <button
                type="button"
                aria-label="Open Anchor Tenets summary"
                title="Anchor Tenets"
                onClick={() => setAnchorTenetsOpen(true)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-[#d8b75a]"
              >
                <Anchor size={16} weight="duotone" />
              </button>
              <button
                type="button"
                aria-label="Open Action Cards reference"
                title="Action Cards"
                onClick={() => setActionCardsOpen(true)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-[#c4b5fd]"
              >
                <Gavel size={16} weight="duotone" />
              </button>
            </div>
            {safeGameState.players.map((player, index) => {
              const isActive = index === safeGameState.currentPlayerIndex
              const stats = calculatePlayerStats(player)
              return (
                <div
                  key={player.id}
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 10px',
                    borderRadius: 999,
                    border: isActive ? `1.5px solid ${player.color}` : '1px solid rgba(255,255,255,0.1)',
                    background: isActive ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                    boxShadow: isActive ? `0 0 12px ${player.color}44` : undefined,
                    maxWidth: 200,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: player.color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: isActive ? player.color : '#f0f0f5',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 72,
                    }}
                  >
                    {player.name}
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(248,250,252,0.75)', fontVariantNumeric: 'tabular-nums' }}>
                    ${player.money}M
                  </span>
                  {isActive ? (
                    <span style={{ fontSize: 10, color: '#fef9c3', fontVariantNumeric: 'tabular-nums' }}>
                      ${stats.income}M/t
                    </span>
                  ) : null}
                  {player.id !== handRailPlayer.id ? <SidebarHandFlightAnchors player={player} /> : null}
                </div>
              )
            })}
          </div>
        ) : (
        <aside style={{
          width: 188,
          flexShrink: 0,
          padding: '14px 12px',
          overflowY: 'auto',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'linear-gradient(180deg, #0a0a0a 0%, #121212 52%, #080808 100%)',
          pointerEvents: showOpeningProTip ? 'none' : 'auto',
          opacity: showOpeningProTip ? 0.55 : 1,
          transition: 'opacity 200ms ease',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase' as const,
              color: 'rgba(226, 232, 240, 0.55)',
            }}>
              Players
            </span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                ...(isSpectator ? { pointerEvents: 'auto' } : undefined),
              }}
            >
              <button
                type="button"
                aria-label="Undo last action"
                title={
                  undoLastActionAvailable
                    ? `Undo: ${safeGameState.undoLastAction?.label ?? 'last action'}`
                    : 'No action to undo this turn'
                }
                disabled={!undoLastActionAvailable}
                onClick={() => setUndoActionDialogOpen(true)}
                className={boardHudIconButtonClass}
              >
                <ArrowCounterClockwise size={20} weight="duotone" />
              </button>
              <button
                type="button"
                aria-label="Open quick rules"
                title="Quick rules"
                onClick={() => setRulesQuickOpen(true)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-[#a8b0c8] transition-colors hover:border-[#5ac8fa]/40 hover:bg-[#1a1a24] hover:text-[#e0e8ff]"
              >
                <BookOpen size={20} weight="duotone" />
              </button>
              <button
                type="button"
                aria-label="Open Anchor Tenets summary"
                title="Anchor Tenets"
                onClick={() => setAnchorTenetsOpen(true)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#d8b75a]/25 bg-[#d8b75a]/[0.06] text-[#d8b75a] transition-colors hover:border-[#d8b75a]/55 hover:bg-[#d8b75a]/[0.12] hover:text-[#f1df9d]"
              >
                <Anchor size={20} weight="duotone" />
              </button>
              <button
                type="button"
                aria-label="Open Action Cards reference"
                title="Action Cards"
                onClick={() => setActionCardsOpen(true)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#c4b5fd]/25 bg-[#c4b5fd]/[0.06] text-[#c4b5fd] transition-colors hover:border-[#c4b5fd]/55 hover:bg-[#c4b5fd]/[0.12] hover:text-[#ddd6fe]"
              >
                <Gavel size={20} weight="duotone" />
              </button>
            </div>
          </div>
          {safeGameState.players.map((player, index) => {
            const isActive = index === safeGameState.currentPlayerIndex
            const stats = calculatePlayerStats(player)
            const showSidebarAnchors = player.id !== handRailPlayer.id
            const handCounts = `${player.propertyCards.length} property and ${player.actionCards.length} action cards in hand`
            const handNote = showSidebarAnchors
              ? `${handCounts}. Card flights land at this player's row — backs only.`
              : `${handCounts}. Main table hand strip below.`
            const statusSummary = `${player.name}.${isActive ? ' Current turn.' : ''} Cash ${player.money} million dollars. Property book value ${stats.propertyValue} million dollars. Income ${stats.income} million dollars per turn. ${handNote}`
            return (
              <article
                key={player.id}
                role="region"
                aria-label={statusSummary}
                tabIndex={0}
                style={{
                  position: 'relative',
                  overflow: 'visible',
                  padding: isActive ? 12 : 10,
                  borderRadius: 10,
                  borderLeft: `3px solid ${isActive ? player.color : 'transparent'}`,
                  backgroundColor: isActive ? 'rgba(0, 0, 0, 0.14)' : 'transparent',
                  opacity: isActive ? 1 : 0.72,
                  transition: 'all 300ms ease',
                  outline: 'none',
                  ...(isActive ? ({ '--player-color': player.color } as CSSProperties) : {}),
                }}
                className={isActive ? 'player-panel-active' : ''}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    backgroundColor: player.color,
                    flexShrink: 0,
                  }} />
                  <p style={{
                    fontSize: isActive ? 14 : 12,
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    color: isActive ? player.color : '#ffffff',
                    textShadow: isActive
                      ? `0 0 10px ${player.color}66`
                      : '0 1px 3px rgba(0, 0, 0, 0.55)',
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {player.name}
                  </p>
                </div>
                <div
                  style={{
                    marginTop: isActive ? 10 : 8,
                    padding: '8px 10px',
                    borderRadius: 8,
                    backgroundColor: isActive ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    fontSize: isActive ? 11 : 10,
                  }}
                  aria-hidden
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'rgba(226, 232, 240, 0.62)', fontWeight: 500 }}>Cash</span>
                    <span style={{ fontWeight: 600, color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>${player.money}M</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'rgba(226, 232, 240, 0.62)', fontWeight: 500 }}>Property</span>
                    <span style={{ fontWeight: 600, color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>${stats.propertyValue}M</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'rgba(226, 232, 240, 0.62)', fontWeight: 500 }}>Income</span>
                    <span style={{ fontWeight: 600, color: '#fef9c3', fontVariantNumeric: 'tabular-nums' }}>${stats.income}M/turn</span>
                  </div>
                </div>
                {showSidebarAnchors ? <SidebarHandFlightAnchors player={player} /> : null}
              </article>
            )
          })}
          </div>
        </aside>
        )}

        {/* Center board (pinch/pan on phones) + fixed bottom hand */}
        <div
          className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0"
          style={{ backgroundColor: '#000000' }}
        >
          {/* Board area — pinch/pan viewport on compact phones only */}
          <BoardPinchZoom
            enabled={isCompactLayout}
            className={
              isCompactLayout
                ? isLandscapeLayout
                  ? 'relative flex-[1.4] min-h-0 min-w-0'
                  : 'relative flex-1 min-h-0 min-w-0'
                : 'relative flex-1 min-h-0 min-w-0'
            }
          >
          <div
            className={
              isCompactLayout
                ? isLandscapeLayout
                  ? 'relative h-full w-full flex items-center justify-center overflow-hidden px-1 pt-0.5'
                  : 'relative h-full w-full flex items-center justify-center overflow-hidden px-1 pt-1'
                : 'relative flex-1 h-full w-full flex items-center justify-center overflow-hidden px-3 pt-2 min-h-0'
            }
          >
            {showOpeningProTip ? (
              <div
                aria-hidden
                className="absolute inset-0 z-[40]"
                style={{ pointerEvents: 'auto' }}
              />
            ) : null}
            <div
              className="relative w-full h-full min-h-0 flex items-center justify-center"
              style={{ zIndex: showOpeningProTip ? 45 : undefined }}
            >
            <GameBoard
              compact={isCompactLayout}
              plots={safeGameState.plots}
              players={safeGameState.players}
              onPlotClaim={handlePlotClaim}
              winningSequence={safeGameState.winningSequence}
              onPropertyClick={handlePropertyClick}
              placementMode={boardPlacementMode}
              namedSquares={namedSquaresForBoard}
              namedStreets={namedStreetsForBoard}
              showNamedRegions={safeGameState.gameEnded === true}
              evenRoundBanner={
                motivationalFlashRound !== null ? (
                  <MotivationalRoundBanner playRoundNumber={motivationalFlashRound} />
                ) : null
              }
              finalRoundBanner={
                safeGameState.endGameTriggered && !safeGameState.gameEnded && showFinalTurnBanner ? (
                  <FinalTurnBanner
                    triggererName={
                      safeGameState.players.find((p) => p.id === safeGameState.endGameTriggerPlayerId)?.name ??
                      'A founder'
                    }
                    currentPlayerName={currentPlayer.name}
                    currentPlayerColor={currentPlayer.color}
                    turnsRemainingThisRound={safeGameState.finalRoundTurnsRemaining ?? 1}
                  />
                ) : null
              }
              boardDockHud={
                <div className="fs-board-toast-anchor" aria-label="Game activity">
                  <BoardDockToaster
                    id={FS_BOARD_TOASTER_ID}
                    theme="dark"
                    position="top-center"
                    offset={8}
                    visibleToasts={4}
                    expand
                    richColors
                    toastOptions={{
                      classNames: { toast: 'fs-board-dock-toast' },
                      style: {
                        fontSize: 13,
                        lineHeight: 1.35,
                        padding: '11px 14px',
                        minHeight: 46,
                        background: 'rgba(10, 14, 24, 0.94)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        color: 'rgba(248,250,252,0.95)',
                      },
                    }}
                    style={
                      {
                        '--normal-bg': 'rgba(14, 18, 30, 0.96)',
                        '--normal-border': 'rgba(255,255,255,0.14)',
                        '--success-bg': 'rgba(12, 40, 28, 0.95)',
                        '--success-border': 'rgba(74, 222, 128, 0.35)',
                        '--error-bg': 'rgba(60, 15, 20, 0.94)',
                        '--error-border': 'rgba(248, 113, 113, 0.45)',
                        '--info-bg': 'rgba(12, 26, 48, 0.95)',
                        '--info-border': 'rgba(96, 165, 250, 0.4)',
                        '--warning-bg': 'rgba(55, 40, 8, 0.94)',
                        '--warning-border': 'rgba(251, 191, 36, 0.45)',
                      } as CSSProperties
                    }
                  />
                </div>
              }
              boardActionStrip={<RequiredActionBanner layout="boardStrip" action={requiredAction} />}
              openingProTip={
                showOpeningProTip ? <OpeningProTipOverlay onSkip={dismissOpeningProTip} /> : null
              }
              onVacantLotHint={() =>
                toast.info(
                  'Claim a lot by placing a property: click the card (or expand it), then click a highlighted lot. Play required action cards first (for example Crossing the Line where district rules apply).'
                )
              }
            />
            </div>
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
            {boardNotice && (
              <div
                className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-3 sm:p-6"
                aria-live="polite"
                role="status"
              >
                <div className="fs-board-notice-panel max-w-[min(92vw,28rem)] rounded-xl border border-white/25 bg-black/80 px-4 py-3 text-center shadow-[0_0_40px_rgba(0,0,0,0.55)] backdrop-blur-md sm:rounded-2xl sm:px-6 sm:py-5">
                  <p
                    style={{
                      fontSize: 'clamp(0.95rem, 2.2vw, 1.35rem)',
                      fontWeight: 600,
                      lineHeight: 1.35,
                      letterSpacing: '0.01em',
                      color: 'rgba(248,250,252,0.98)',
                      margin: 0,
                    }}
                  >
                    {boardNotice.title}
                  </p>
                  {boardNotice.detail ? (
                    <p
                      style={{
                        marginTop: 8,
                        fontSize: 'clamp(12px, 1.6vw, 14px)',
                        fontWeight: 500,
                        color: 'rgba(226,232,240,0.72)',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {boardNotice.detail}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
            </div>
          </BoardPinchZoom>

          {/* Bottom hand rail — fixed outside board pinch/pan so cards stay usable */}
          <div
            className={
              isCompactLayout
                ? isLandscapeLayout
                  ? 'flex-shrink-0 border-t border-[#d8b75a40] px-2 py-1'
                  : 'flex-shrink-0 border-t border-[#d8b75a40] px-2 py-2'
                : 'flex-shrink-0 border-t border-[#d8b75a40] px-8 py-5'
            }
            style={{
              background: 'linear-gradient(180deg, #4a4028 0%, #362e1a 55%, #2a2414 100%)',
              pointerEvents: showOpeningProTip ? 'none' : 'auto',
              opacity: showOpeningProTip ? 0.55 : 1,
              transition: 'opacity 200ms ease',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <PlayerHand
              player={handRailPlayer}
              opponents={safeGameState.players.filter((_, i) => i !== safeGameState.currentPlayerIndex)}
              handInteractionsActive={handInteractionsActive}
              compact={isCompactLayout}
              landscape={isLandscapeLayout}
              onPlayCards={handlePlayCards}
              onEndTurn={handleEndTurn}
              placementMode={placementMode}
              investmentSelectMode={investmentSelectMode}
              discardPropertySelectMode={discardPropertySelectMode}
              onToggleDiscardProperty={handleToggleDiscardPropertySelection}
              onOpenDiscardPropertyConfirm={() => setDiscardPropertyConfirmOpen(true)}
              onCancelDiscardProperty={handleCancelDiscardPropertySelect}
              removeInvestorsSelectMode={removeInvestorsSelectMode}
              takeoverSelectMode={takeoverSelectMode}
              scandalSelectMode={scandalSelectMode}
              rezoningPhase={rezoningMode.phase}
              taxBuildPhase={taxBuildMode.phase}
              taxBuildActionInstanceId={
                taxBuildMode.phase === 'pick-property' ? taxBuildMode.actionInstanceId : undefined
              }
              onTaxBuildPropertySelect={(propertyInstanceId) => {
                if (taxBuildMode.phase !== 'pick-property') return
                handlePlayCards(propertyInstanceId, [], [], {
                  useTaxBuild: true,
                  taxBuildActionInstanceId: taxBuildMode.actionInstanceId,
                  skipTaxBuildPrompt: true,
                })
              }}
              onCancelTaxBuild={() => {
                setTaxBuildMode({ phase: 'inactive' })
                toast.info('Build with Tax Dollars cancelled.')
              }}
              onRezoningPropertySelect={handleRezoningPropertyFromHand}
              onRezoningHousingStandard={() => handleRezoningHousingDensity(false)}
              onRezoningHousingHighDensity={() => handleRezoningHousingDensity(true)}
              onCancelRezoning={handleCancelRezoning}
              onCancelInvestment={handleCancelInvestmentSelect}
              onCancelRemoveInvestors={handleCancelRemoveInvestorsSelect}
              onCancelTakeover={handleCancelTakeoverSelect}
              onCancelScandal={handleCancelScandalSelect}
              onCancelPlacement={handleCancelPlacement}
              onPropertyCardPeekPlacement={(instanceId) =>
                handlePlayCards(instanceId, [], [], { suppressPlacementToast: true })
              }
              showNewCardsAnimation={safeGameState.showNewCardsAnimation}
              newCardsDrawn={safeGameState.newCardsDrawn}
              hiddenInstanceIds={hiddenInstanceIds}
              propertyDeckHasCards={safeGameState.propertyDeck.length > 0}
              actionDeckHasCards={safeGameState.actionDeck.length > 0}
              plots={safeGameState.plots}
              crossingTheLineActive={safeGameState.crossingTheLineActive}
            />
          </div>
        </div>
      </div>

      <CardFlightLayer flights={cardFlights} onFlightDone={handleFlightDone} />

      <Toaster />
      <RulesQuickSheet open={rulesQuickOpen} onOpenChange={setRulesQuickOpen} />
      <AnchorTenetsQuickSheet open={anchorTenetsOpen} onOpenChange={setAnchorTenetsOpen} />
      <ActionCardsQuickSheet open={actionCardsOpen} onOpenChange={setActionCardsOpen} />
      <InvestmentOrphanDialog
        open={actionCriteriaDialog.open}
        cardName={actionCriteriaDialog.cardName}
        bankValue={actionCriteriaDialog.bankValue}
        reasonDescription={actionCriteriaDialog.reasonDescription}
        onBank={handleActionCriteriaBank}
        onCancel={() => setActionCriteriaDialog(createClosedActionCriteriaDialog())}
      />
      <AlertDialog
        open={doubleIncomeOrphanDialog.open}
        onOpenChange={(open) => {
          if (!open) setDoubleIncomeOrphanDialog({ open: false, instanceId: null })
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Playing Double Income without Income</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left text-sm text-muted-foreground">
                <p>
                  <strong>Double Income</strong> does not collect or roll for income on its own. It only{' '}
                  <strong>doubles the payout</strong> when you play it <strong>together with an Income card</strong>{' '}
                  in the same play, before you roll for that Income.
                </p>
                <p>
                  Without an Income card in that play, Double Income can only be <strong>banked</strong> for its
                  printed cash value (${DOUBLE_INCOME_BANK_VALUE}M). It will not double anything.
                </p>
                <p className="font-medium text-foreground">Bank this Double Income card now?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={handleDoubleIncomeOrphanConfirmBank}>
              Bank for ${DOUBLE_INCOME_BANK_VALUE}M
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {incomeDialogState.open && incomeDialogState.player && (
        <IncomeDialog
          open={incomeDialogState.open}
          player={incomeDialogState.player}
          totalIncome={incomeDialogState.totalIncome}
          churchIncomeBonus={incomeDialogState.churchIncomeBonus}
          churchBonusSourceLabels={incomeDialogState.churchBonusSourceLabels}
          farmCoopIncomeBonus={incomeDialogState.farmCoopIncomeBonus}
          farmCoopBonusSourceLabels={incomeDialogState.farmCoopBonusSourceLabels}
          portAuthorityIncomeBonus={incomeDialogState.portAuthorityIncomeBonus}
          portAuthorityBonusSourceLabels={incomeDialogState.portAuthorityBonusSourceLabels}
          artsCouncilIncomeBonus={incomeDialogState.artsCouncilIncomeBonus}
          artsCouncilBonusSourceLabels={incomeDialogState.artsCouncilBonusSourceLabels}
          tourismOfficeIncomeBonus={incomeDialogState.tourismOfficeIncomeBonus}
          tourismOfficeBonusSourceLabels={incomeDialogState.tourismOfficeBonusSourceLabels}
          influencersIncomeBonus={incomeDialogState.influencersIncomeBonus}
          influencersBonusSourceLabels={incomeDialogState.influencersBonusSourceLabels}
          newsOutletIncomeBonus={incomeDialogState.newsOutletIncomeBonus}
          newsOutletBonusSourceLabels={incomeDialogState.newsOutletBonusSourceLabels}
          mafiaIncomeBonus={incomeDialogState.mafiaIncomeBonus}
          mafiaBonusSourceLabels={incomeDialogState.mafiaBonusSourceLabels}
          mafiaLevyTotal={incomeDialogState.mafiaLevyTotal}
          regulationBureauIncomeBonus={incomeDialogState.regulationBureauIncomeBonus}
          regulationBureauBonusSourceLabels={incomeDialogState.regulationBureauBonusSourceLabels}
          regulationBureauIncomePenalty={incomeDialogState.regulationBureauIncomePenalty}
          rivalRegulationBureauPlotLabels={incomeDialogState.rivalRegulationBureauPlotLabels}
          unionIncomeBonus={incomeDialogState.unionIncomeBonus}
          unionBonusSourceLabels={incomeDialogState.unionBonusSourceLabels}
          unionIncomePenalty={incomeDialogState.unionIncomePenalty}
          rivalUnionPlotLabels={incomeDialogState.rivalUnionPlotLabels}
          hasBuiltPropertiesForIncomeRoll={incomeDialogState.hasBuiltPropertiesForIncomeRoll}
          doubleIncomeAllowed={(safeGameState.turnActionsConsumed ?? 0) + 2 <= MAX_TURN_ACTIONS}
          onComplete={handleIncomeComplete}
          onCancel={handleIncomeCancel}
          aiAutoplay={incomeDialogState.player?.isAi === true}
        />
      )}
      {discardDialogState.open && (
        <DiscardDialog
          open={discardDialogState.open}
          player={safeGameState.players[safeGameState.currentPlayerIndex]}
          numToDiscard={discardDialogState.numToDiscard}
          onComplete={handleDiscardComplete}
          aiConfirmSelection={currentPlayer?.isAi === true}
        />
      )}
      {safeGameState.gameEnded && (
        <GameEndDialog
          open={safeGameState.gameEnded}
          scores={calculateFinalScores()}
          onNewGame={handleNewGame}
        />
      )}
      {undoActionDialogOpen && safeGameState.undoLastAction && (
        <UndoLastActionDialog
          open={undoActionDialogOpen}
          actionLabel={safeGameState.undoLastAction.label}
          onConfirm={handleUndoLastAction}
          onCancel={handleUndoLastActionCancel}
        />
      )}
      {rollDieDialogState.open && (
          <RollDieDialog
            key={`${rollDieDialogState.mode}-${rollDieDialogState.actionInstanceId ?? ''}`}
            open={rollDieDialogState.open}
            mode={rollDieDialogState.mode}
            influenceBonus={rollDieDialogState.influenceBonus ?? 0}
            influenceLabels={rollDieDialogState.influenceLabels ?? []}
            defenderName={
              rollDieDialogState.mode === 'council-freeze-attacker' ||
              rollDieDialogState.mode === 'council-freeze-defender'
                ? rollDieDialogState.targetPlayerId != null
                  ? safeGameState.players.find((p) => p.id === rollDieDialogState.targetPlayerId)?.name
                  : undefined
                : rollDieDialogState.mode === 'hostile-takeover-defender'
                  ? safeGameState.players.find(
                      (p) => p.id === rollDieDialogState.takeoverContext?.ownerPlayerId
                    )?.name
                  : rollDieDialogState.mode === 'scandal-defender' &&
                      rollDieDialogState.scandalContext != null
                    ? safeGameState.players.find(
                        (p) => p.id === rollDieDialogState.scandalContext!.anchorOwnerPlayerId
                      )?.name
                    : undefined
            }
            actingPlayerName={currentPlayer.name}
            councilFreezeAttackerRollsCompleted={rollDieDialogState.councilFreezeAttackerRollsCompleted}
            attackerMoney={currentPlayer.money}
            councilFreezeFailAuto={rollDieDialogState.councilFreezeFailAuto === true}
            diceRetryNonce={rollDieDialogState.diceRetryNonce}
            onAttackerDieSettled={handleAttackerDieSettled}
            onCouncilFreezeAttackerRollAgain={handleCouncilFreezeAttackerRollAgain}
            onCouncilFreezeFailDismiss={handleCouncilFreezeFailDismiss}
            onComplete={handleRollDieComplete}
            onCancel={handleRollDieCancel}
            hostileTakeoverExchange={hostileTakeoverExchange}
            rezoningSummary={rezoningSummaryForDialog}
            scandalSummary={scandalSummaryForDialog}
            aiAutoplay={rollDieAiAutoplay}
          />
      )}
      <AlertDialog
        open={taxBuildPrompt.open}
        onOpenChange={(open) => {
          if (!open) {
            taxPromptResumeRef.current = null
            setTaxBuildPrompt({
              open: false,
              propertyInstanceId: null,
              actionInstanceId: null,
              housingHighDensity: undefined,
              wildCardEmulatePropertyId: undefined,
            })
          }
        }}
      >
        <AlertDialogContent
          onEscapeKeyDown={(event) => {
            if (!taxBuildPrompt.open) return
            event.preventDefault()
            const pending = taxPromptResumeRef.current
            taxPromptResumeRef.current = null
            setTaxBuildPrompt({
              open: false,
              propertyInstanceId: null,
              actionInstanceId: null,
              housingHighDensity: undefined,
              wildCardEmulatePropertyId: undefined,
            })
            if (pending?.propertyInstanceId) {
              handlePlayCards(pending.propertyInstanceId, [], [], {
                ...(pending.housingHighDensity === true ? { housingHighDensity: true } : {}),
                useTaxBuild: false,
                skipTaxBuildPrompt: true,
                ...(pending.wildCardEmulatePropertyId
                  ? { wildCardEmulatePropertyId: pending.wildCardEmulatePropertyId }
                  : {}),
              })
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Use Build with Tax Dollars?</AlertDialogTitle>
            <AlertDialogDescription>
              You have Build with Tax Dollars in hand. Build this property at 50% cost and discard that action card?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="order-first w-full text-sm text-muted-foreground underline-offset-4 hover:underline sm:order-none sm:mr-auto sm:w-auto"
              onClick={() => abortTaxBuildPrompt()}
            >
              Cancel — don&apos;t build
            </button>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <AlertDialogCancel
              onClick={(e) => {
                e.preventDefault()
                const pending = taxPromptResumeRef.current
                taxPromptResumeRef.current = null
                setTaxBuildPrompt({
                  open: false,
                  propertyInstanceId: null,
                  actionInstanceId: null,
                  housingHighDensity: undefined,
                  wildCardEmulatePropertyId: undefined,
                })
                if (pending?.propertyInstanceId) {
                  handlePlayCards(pending.propertyInstanceId, [], [], {
                    ...(pending.housingHighDensity === true ? { housingHighDensity: true } : {}),
                    useTaxBuild: false,
                    skipTaxBuildPrompt: true,
                    ...(pending.wildCardEmulatePropertyId
                      ? { wildCardEmulatePropertyId: pending.wildCardEmulatePropertyId }
                      : {}),
                  })
                }
              }}
            >
              No, normal cost
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const pending = taxPromptResumeRef.current
                if (!pending?.propertyInstanceId || !pending.taxActionInstanceId) return
                taxPromptResumeRef.current = null
                handlePlayCards(pending.propertyInstanceId, [], [], {
                  housingHighDensity: pending.housingHighDensity,
                  useTaxBuild: true,
                  taxBuildActionInstanceId: pending.taxActionInstanceId,
                  skipTaxBuildPrompt: true,
                  wildCardEmulatePropertyId: pending.wildCardEmulatePropertyId,
                })
              }}
            >
              Yes, build at half cost
            </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={discardPropertyConfirmOpen}
        onOpenChange={(open) => {
          if (!open) setDiscardPropertyConfirmOpen(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard property cards?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {discardPropertySelectMode.selectedPropertyInstanceIds.length === 0 ? (
                  <p style={{ color: 'rgba(148,163,184,0.95)', fontSize: 14, lineHeight: 1.5, margin: 0 }}>
                    You selected no property cards. The action will still be discarded and you will not draw replacements.
                  </p>
                ) : (
                  <>
                    <p style={{ color: 'rgba(148,163,184,0.95)', fontSize: 14, lineHeight: 1.5, margin: '0 0 12px' }}>
                      These cards go to the property discard pile; you draw the same number from the property deck
                      only (the property discard pile is not reshuffled into the deck).
                    </p>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: 20,
                        color: 'rgba(226,232,240,0.92)',
                        fontSize: 14,
                        lineHeight: 1.5,
                      }}
                    >
                      {discardPropertySelectMode.selectedPropertyInstanceIds.map((id) => {
                        const inst = currentPlayer.propertyCards.find((c) => c.instanceId === id)
                        const nm = inst ? propertyCards.find((c) => c.id === inst.cardId)?.name : undefined
                        return <li key={id}>{nm ?? 'Unknown card'}</li>
                      })}
                    </ul>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDiscardPropertyConfirmOpen(false)}>Cancel</AlertDialogCancel>
            <Button type="button" onClick={() => handleConfirmDiscardProperty()}>
              Discard
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
