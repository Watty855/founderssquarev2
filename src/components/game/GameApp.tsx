'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback, type CSSProperties } from 'react'
import { useGameState } from '@/hooks/use-game-state'
import { Player, Plot, GameState, PlayerScore } from '@/lib/types'
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
import { PlayerInfo } from '@/components/game/PlayerInfo'
import { PlayerHand, type PlayCardsOptions, handCardAnchorKey, handTargetAnchorKey } from '@/components/game/PlayerHand'
import { SidebarHandFlightAnchors } from '@/components/game/SidebarHandFlightAnchors'
import { RequiredActionBanner, type RequiredAction } from '@/components/game/RequiredActionBanner'
import { FinalTurnBanner } from '@/components/game/FinalTurnBanner'
import { RulesQuickSheet } from '@/components/game/RulesQuickSheet'
import { PROPERTY_DECK_ANCHOR_KEY, ACTION_DECK_ANCHOR_KEY } from '@/components/game/DeckPile'
import { CardFlightLayer, type CardFlight } from '@/components/game/CardFlightLayer'
import { FlightAnchorProvider, useFlightRectGetter, type FlightRect } from '@/hooks/use-flight-anchors'
import { DiscardDialog } from '@/components/dialogs/DiscardDialog'
import { GameEndDialog } from '@/components/dialogs/GameEndDialog'
import { UndoBuildDialog } from '@/components/dialogs/UndoBuildDialog'
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
import { ArrowCounterClockwise, BookOpen, CurrencyDollar } from '@phosphor-icons/react'
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
} from '@/lib/soundEffects'
import { trySimpleAiMainPhase } from '@/lib/bot/simpleAiTurn'
import type { SimpleAiTurnHandlers, SimpleAiTurnUi } from '@/lib/bot/simpleAiTurn'
import {
  checkForNineSequentialProperties,
  findCompleteSquares,
  findCompleteStreets,
  getChurchIncomeBonusForPlayer,
  getArtsCouncilIncomeBonusForPlayer,
  getArtsCouncilTakeoverInfluenceBonus,
  getFarmCoopIncomeBonusForPlayer,
  getFarmCoopTakeoverInfluenceBonus,
  getPortAuthorityIncomeBonusForPlayer,
  getPortAuthorityTakeoverInfluenceBonus,
  getTourismOfficeIncomeBonusForPlayer,
  getTourismOfficeTakeoverInfluenceBonus,
  getInfluencersIncomeBonusForPlayer,
  getMafiaIncomeBonusForPlayer,
  getMafiaLevyForIncomePlayer,
  getMafiaTakeoverInfluenceBonus,
  getRegulationBureauIncomeBonusForPlayer,
  getUnionIncomeBonusForOwner,
  getUnionIncomePenaltyForPlayer,
  getRegulationBureauTakeoverAttackerBonus,
  getScandalAttackerRollBonuses,
  getPlotsEligibleForScandal,
  getCityCouncilFreezeAttackerInfluence,
  getPoliceRaidAttackerInfluence,
  getRezoningCivicInfluenceBoardWide,
  getRemoveInvestorsRollBonuses,
  totalRemoveInvestorsBuyoutMillion,
  investorRemovalBuyoutMillion,
  computeInvestorIncomeAwardsForOwner,
  allocateInvestorPayoutsFromOwner,
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
import { getBuildCelebrationMessage } from '@/lib/buildCelebrationMessages'
import {
  MAX_TURN_ACTIONS,
  replenishCurrentPlayerActionHand,
  turnLimitReached,
} from '@/lib/turnActions'
import { nextPlayRoundNumber } from '@/lib/playRound'
import {
  type PartyBoardSyncConfig,
  type PartyBoardSyncMeta,
} from '@/lib/partyBoardSync'
import { remapSeatPlanPartySocketIds, resolveGuestSeatForRemap } from '@/lib/partySeatIds'
import { redactGameStateForGuestView } from '@/lib/partyBoardView'
import { useOnlineBoardSync } from '@/lib/useOnlineBoardSync'
import type { GameEvent } from '@/lib/onlineGameActions'

// Statically imported in v2 (no SSR concerns in the Vite/Capacitor build).
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
    case 'police-raid-defender': {
      const ownerId = gs.plots.find((p) => p.builtProperty === 'mafia' && p.claimedBy != null)?.claimedBy
      return playerIsAi(ownerId ?? undefined)
    }
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

function clearCouncilFreezeIfEndingPlayer(current: GameState, finishingPlayerIndex: number): Partial<GameState> {
  const finisherId = current.players[finishingPlayerIndex]?.id
  if (finisherId != null && current.councilFreezeBlockBuildForPlayerId === finisherId) {
    return { councilFreezeBlockBuildForPlayerId: undefined }
  }
  return {}
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

/**
 * If `newPlots` now contains a 9-sequential built run for a single founder AND the trigger has not yet
 * fired, returns the patch fields that mark the final round as started. Otherwise returns an empty object.
 *
 * Invoke after ordinary placement, rezoning builds, or hostile takeover (any change that updates
 * ownership of built lots can complete the qualifying cluster).
 * The triggerer's current turn finishes normally; `finalRoundTurnsRemaining = players.length + 1` lets
 * the next `applyFinalRoundCountdown` call decrement it down to N (the trigger turn end), then each of
 * the N follow-on turns decrements one more, ending the game after the last final turn.
 */
function buildEndGameTriggerPatch(
  current: GameState,
  newPlots: Plot[],
  triggerLocation: { row: number; col: string }
): {
  endGameTriggered?: true
  endGameTriggerPlayerId?: number
  endGameTriggerLocation?: { row: number; col: string }
  winningSequence?: Array<{ row: number; col: string }>
  finalRoundTurnsRemaining?: number
} {
  if (current.endGameTriggered) return {}
  const found = checkForNineSequentialProperties(newPlots)
  if (!found) return {}
  return {
    endGameTriggered: true,
    endGameTriggerPlayerId: found.triggeredByPlayerId,
    endGameTriggerLocation: triggerLocation,
    winningSequence: found.plots,
    finalRoundTurnsRemaining: current.players.length + 1,
  }
}

/**
 * Decrement the final-round counter by one when a turn ends. Returns the patch the caller must merge
 * into the state. When the counter hits 0, returns `{ gameEnded: true, finalRoundTurnsRemaining: 0 }`
 * and the caller MUST NOT advance the player index / draw new cards (the game is over).
 */
function applyFinalRoundCountdown(current: GameState): {
  gameEnded?: true
  finalRoundTurnsRemaining?: number
} {
  if (current.finalRoundTurnsRemaining === undefined) return {}
  const next = current.finalRoundTurnsRemaining - 1
  if (next <= 0) return { gameEnded: true, finalRoundTurnsRemaining: 0 }
  return { finalRoundTurnsRemaining: next }
}

let cardFlightCounter = 0
const nextCardFlightId = (): string => `flight-${++cardFlightCounter}`

/** Queue a face-down draw flight (deck → hand). Hand position should be the current player's hand-target rect. */
function makeDrawFlight(
  inst: CardInstance,
  cardType: 'property' | 'action',
  source: FlightRect,
  target: FlightRect,
  delayMs: number
): CardFlight {
  return {
    id: nextCardFlightId(),
    kind: 'draw',
    cardType,
    instance: inst,
    source,
    target,
    delayMs,
  }
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

function AppInner() {
  const [partyBoardConfig, setPartyBoardConfig] = useState<PartyBoardSyncConfig | null>(null)
  const [gameState, setGameState] = useGameState<GameState>('founders-square-game', initialGameState, {
    persist: partyBoardConfig?.role !== 'guest',
  })
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
  })

  const { boardPartyConnectionId, sendAction } = partyBoardSync
  const sendActionRef = useRef(sendAction)
  sendActionRef.current = sendAction

  const isOnlineActor = Boolean(partyBoardConfig && boardPartyConnectionId)

  const commitOnlineAfterState = useCallback(
    (state: GameState) => {
      if (partyBoardConfig && boardPartyConnectionId) {
        sendActionRef.current({ type: 'commit_actor_state', state }, { skipOptimistic: true })
      }
    },
    [partyBoardConfig, boardPartyConnectionId]
  )

  const setGameStateWithOnlineCommit = useCallback(
    (updater: React.SetStateAction<GameState>) => {
      setGameState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        if (partyBoardConfig && boardPartyConnectionId && next !== prev) {
          queueMicrotask(() => commitOnlineAfterState(next))
        }
        return next
      })
    },
    [partyBoardConfig, boardPartyConnectionId, setGameState, commitOnlineAfterState]
  )

  const patchGameState = useCallback(
    (updater: React.SetStateAction<GameState>) => {
      if (isOnlineActor) {
        setGameStateWithOnlineCommit(updater)
      } else {
        setGameState(updater)
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
    mafiaIncomeBonus: number
    mafiaBonusSourceLabels: string[]
    mafiaLevyTotal: number
    regulationBureauIncomeBonus: number
    regulationBureauBonusSourceLabels: string[]
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
    mafiaIncomeBonus: 0,
    mafiaBonusSourceLabels: [],
    mafiaLevyTotal: 0,
    regulationBureauIncomeBonus: 0,
    regulationBureauBonusSourceLabels: [],
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
  const [undoBuildDialogState, setUndoBuildDialogState] = useState<{
    open: boolean
    row: number | null
    col: string | null
    propertyName: string
    buildCost: number
  }>({ open: false, row: null, col: null, propertyName: '', buildCost: 0 })
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
  const aiHooksRef = useRef<SimpleAiTurnHandlers>({
    handleEndTurn: () => {},
    handleUndoBuildCancel: () => {},
    handleActionCriteriaBank: () => {},
    handleCancelTakeoverSelect: () => {},
    handleCancelScandalSelect: () => {},
    handleCancelRezoning: () => {},
    handleCancelInvestmentSelect: () => {},
    handleCancelRemoveInvestorsSelect: () => {},
    handleCancelDiscardPropertySelect: () => {},
    dismissTaxBuildPrompt: () => {},
    cancelPlacement: () => {},
    handlePlayCards: () => {},
    handlePlotSelect: () => {},
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

  const [boardNotice, setBoardNotice] = useState<{ title: string; detail?: string } | null>(null)
  const boardNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showBoardNotice = useCallback((title: string, detail?: string) => {
    if (boardNoticeTimerRef.current) {
      clearTimeout(boardNoticeTimerRef.current)
      boardNoticeTimerRef.current = null
    }
    setBoardNotice({ title, detail })
    boardNoticeTimerRef.current = setTimeout(() => {
      setBoardNotice(null)
      boardNoticeTimerRef.current = null
    }, 4000)
  }, [])

  onGameEventsRef.current = (events: GameEvent[]) => {
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
        setDiscardDialogState({ open: true, numToDiscard: e.numToDiscard })
      } else if (e.type === 'game_over') {
        toast.success('Final Round complete — game over!')
      } else if (e.type === 'build_celebration') {
        showBoardNotice(e.title, e.detail)
        playConstructionSound()
      }
    }
  }

  // D11 plot fix - moved into useEffect to avoid setState during render
  useEffect(() => {
    const d11Plot = gameState.plots?.find(p => p.row === 11 && p.col === 'D')
    if (d11Plot && d11Plot.building === 'Housing') {
      setGameState((current) => {
        const updatedPlots = current.plots.map(p =>
          p.row === 11 && p.col === 'D' ? { ...p, building: 'Park' } : p
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

  /** Shown briefly when `playRoundNumber` becomes each even round ≥ 2 (not for the whole round). */
  const MOTIVATIONAL_EVEN_ROUND_FLASH_MS = 4000
  const [motivationalFlashRound, setMotivationalFlashRound] = useState<number | null>(null)
  const motivationalFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showOpeningProTip, setShowOpeningProTip] = useState(false)
  const openingProTipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** At the start of each seat’s turn during the final round, show the strip briefly so the board stays clear for play. */
  const FINAL_TURN_BANNER_VISIBLE_MS = 5000
  const [showFinalTurnBanner, setShowFinalTurnBanner] = useState(false)
  const [rulesQuickOpen, setRulesQuickOpen] = useState(false)

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
      setShowOpeningProTip(false)
    }, OPENING_PRO_TIP_DURATION_MS)
    return () => {
      if (openingProTipTimerRef.current !== null) {
        clearTimeout(openingProTipTimerRef.current)
        openingProTipTimerRef.current = null
      }
    }
  }, [showOpeningProTip])

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
  }

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
      // First reconciliation post-setup: animate the starting player's *initial* hand onto the table.
      const currentPlayerId = cur.players[cur.currentPlayerIndex]?.id
      if (currentPlayerId == null) {
        prevFlightStateRef.current = {
          handByPlayer: curHandByPlayer,
          propertyDiscardIds: curPropDiscardIds,
          actionDiscardIds: curActDiscardIds,
          isSetupComplete: cur.isSetupComplete,
        }
        return
      }
      const queued: CardFlight[] = []
      const newlyHidden: string[] = []
      let staggerIdx = 0

      const propTargetRect = getFlightRect(handTargetAnchorKey(currentPlayerId, 'property'))
      const actTargetRect = getFlightRect(handTargetAnchorKey(currentPlayerId, 'action'))
      const propDeckRect = getFlightRect(PROPERTY_DECK_ANCHOR_KEY)
      const actDeckRect = getFlightRect(ACTION_DECK_ANCHOR_KEY)

      const startingHand = cur.players[cur.currentPlayerIndex]
      if (startingHand) {
        startingHand.propertyCards.forEach((inst) => {
          if (!propDeckRect || !propTargetRect) return
          queued.push(makeDrawFlight(inst, 'property', propDeckRect, propTargetRect, staggerIdx++ * 100))
          newlyHidden.push(inst.instanceId)
        })
        startingHand.actionCards.forEach((inst) => {
          if (!actDeckRect || !actTargetRect) return
          queued.push(makeDrawFlight(inst, 'action', actDeckRect, actTargetRect, staggerIdx++ * 100))
          newlyHidden.push(inst.instanceId)
        })
      }
      if (queued.length > 0) {
        setCardFlights((q) => [...q, ...queued])
        setHiddenInstanceIds((s) => {
          const next = new Set(s)
          newlyHidden.forEach((id) => next.add(id))
          return next
        })
      }

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
          : (partyBoardSeatPlayer?.id ?? cur.players[cur.currentPlayerIndex]?.id)

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

      handRailFounder.propertyCards.forEach((inst) => {
        if (prevHand?.property.has(inst.instanceId)) return
        if (!propDeckRect || !propTargetRect) return
        queued.push(makeDrawFlight(inst, 'property', propDeckRect, propTargetRect, drawStagger++ * 100))
        newlyHidden.push(inst.instanceId)
      })
      handRailFounder.actionCards.forEach((inst) => {
        if (prevHand?.action.has(inst.instanceId)) return
        if (!actDeckRect || !actTargetRect) return
        queued.push(makeDrawFlight(inst, 'action', actDeckRect, actTargetRect, drawStagger++ * 100))
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
    setGameState(gs)
    setPartyBoardConfig(cfg)
  }, [])

  const handleSetupComplete = (players: Player[], partyBoard?: PartyBoardSyncMeta) => {
    if (partyBoard) {
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

    setShowOpeningProTip(false)
    if (openingProTipTimerRef.current !== null) {
      clearTimeout(openingProTipTimerRef.current)
      openingProTipTimerRef.current = null
    }

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
        toast.error(`You have used all ${MAX_TURN_ACTIONS} actions this turn. Click End Turn.`)
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
                : 'Choose City Hall, Courthouse, Police, or Civic Center for this Civic card.'
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
              : 'Choose City Hall, Courthouse, Police, or Civic Center for this Civic card.'
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
        toast.error(`You have used all ${MAX_TURN_ACTIONS} actions this turn. Click End Turn.`)
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

    if (hasCouncilFreeze) {
      const tid = options?.councilFreezeTargetId
      if (tid == null) {
        toast.error('Choose a target player for City Council Freeze.')
        return
      }
      if (tid === safeGameState.players[cpIdx].id) {
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
      options?.councilFreezeTargetId != null
    ) {
      const instanceId = actionInstanceIds[0]
      const inst = safeGameState.players[cpIdx].actionCards.find((a) => a.instanceId === instanceId)
      if (inst?.cardId === 'city-council-freeze') {
        if (turnLimitReached(safeGameState.turnActionsConsumed)) {
          toast.error(`You have used all ${MAX_TURN_ACTIONS} actions this turn. Click End Turn.`)
          return
        }
        const freezeTarget = options.councilFreezeTargetId as number
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
          toast.error(`You need $${contributionMillion}M cash to play ${ac.name}.`)
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
          toast.error(`You have used all ${MAX_TURN_ACTIONS} actions this turn. Click End Turn.`)
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
        const validTakeoverPlots = getTakeoverTargetPlots(safeGameState.plots, safeGameState.players[cpIdx].id)
        if (validTakeoverPlots.length === 0) {
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
        const attacker = safeGameState.players[cpIdx]
        let maxCashNeeded = 1
        for (const tp of validTakeoverPlots) {
          const defCard = tp.builtProperty ? propertyCards.find((c) => c.id === tp.builtProperty) : undefined
          if (!defCard) continue
          const endVal = getPlotPropertyEndValue(tp, defCard)
          maxCashNeeded = Math.max(maxCashNeeded, 1 + Math.ceil(endVal * 1.2))
        }
        if (attacker.money < maxCashNeeded) {
          toast.error(
            `You need at least $${maxCashNeeded}M cash ($1M attempt plus up to 120% of a target lot's end value) to play Hostile Takeover.`
          )
          return
        }
        if (turnLimitReached(safeGameState.turnActionsConsumed)) {
          toast.error(`You have used all ${MAX_TURN_ACTIONS} actions this turn. Click End Turn.`)
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
          toast.error(`You have used all ${MAX_TURN_ACTIONS} actions this turn. Click End Turn.`)
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
          toast.error(`You have used all ${MAX_TURN_ACTIONS} actions this turn. Click End Turn.`)
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
        const myInvestedPlots = safeGameState.plots.filter(
          (p) =>
            p.claimedBy === safeGameState.players[cpIdx].id &&
            p.builtProperty &&
            Array.isArray(p.investmentStripes) &&
            p.investmentStripes.length > 0
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
        if (turnLimitReached(safeGameState.turnActionsConsumed)) {
          toast.error(`You have used all ${MAX_TURN_ACTIONS} actions this turn. Click End Turn.`)
          return
        }
        setRemoveInvestorsSelectMode({
          active: true,
          validPlots: myInvestedPlots,
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
          toast.error(
            'You already built a property this turn. Rezoning completes a build — play it before you build from your hand.'
          )
          return
        }
        const acting = safeGameState.players[cpIdx]
        const hasTemplate = acting.propertyCards.some((pi) => {
          const c = propertyCards.find((x) => x.id === pi.cardId) as PropertyCard | undefined
          return c != null && c.type !== 'anchor'
        })
        if (!hasTemplate) {
          toast.error('You need at least one non-anchor property card in your hand to use Rezoning.')
          return
        }
        if (getVacantCityLotsForRezoning(safeGameState.plots).length === 0) {
          toast.error('No vacant city lots are available — Rezoning cannot be used right now.')
          return
        }
        if (turnLimitReached(safeGameState.turnActionsConsumed)) {
          toast.error(`You have used all ${MAX_TURN_ACTIONS} actions this turn. Click End Turn.`)
          return
        }
        setRezoningMode({ phase: 'pick-property', actionInstanceId: actionInstanceIds[0] })
        toast.info(
          'Rezoning: click a highlighted property card in your hand, then a vacant lot on the board. Roll — total 5–6 after civic influence approves the build.'
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
          toast.error('You need at least one property card in your hand to use Build with Tax Dollars.')
          return
        }
        setTaxBuildMode({ phase: 'pick-property', actionInstanceId: actionInstanceIds[0] })
        toast.info('Choose a highlighted property card to build with tax dollars at 50% cost.')
        return
      }
      if (ac?.id === 'discard-property-cards') {
        if (turnLimitReached(safeGameState.turnActionsConsumed)) {
          toast.error(`You have used all ${MAX_TURN_ACTIONS} actions this turn. Click End Turn.`)
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
      toast.error(
        `You only have ${MAX_TURN_ACTIONS} actions per turn. Play or bank fewer cards, or click End Turn.`
      )
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
                playCrowdBooSound()
                showBoardNotice(
                  'Taxation levied!',
                  `${currentPlayer.name} sheltered their income — all other founders face a 50% city assessment.`
                )
                return
              }

              if (card.id === 'crossing-the-line') {
                crossingActivated = true
                toast.success('Crossing the Line activated! Build anywhere in the city!')
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
          const { bonus: mafiaIncomeBonus, sourceLabels: mafiaBonusSourceLabels } =
            getMafiaIncomeBonusForPlayer(currentPlayer.id, current.plots)
          const { bonus: regulationBureauIncomeBonus, sourceLabels: regulationBureauBonusSourceLabels } =
            getRegulationBureauIncomeBonusForPlayer(currentPlayer.id, current.plots)
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
            mafiaIncomeBonus +
            regulationBureauIncomeBonus +
            unionIncomeBonus -
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
            mafiaIncomeBonus,
            mafiaBonusSourceLabels,
            mafiaLevyTotal,
            regulationBureauIncomeBonus,
            regulationBureauBonusSourceLabels,
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
        setTimeout(() => {
          handleEndTurn()
        }, 500)
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
      const currentPlayer = current.players[current.currentPlayerIndex]
      if (current.councilFreezeBlockBuildForPlayerId === currentPlayer.id) {
        toast.error('City Council Freeze is in effect — you cannot build properties this turn.')
        return current
      }
      const instance = currentPlayer.propertyCards.find(c => c.instanceId === propertyCardId)

      if (!instance) return current

      const card = propertyCards.find(c => c.id === instance.cardId) as PropertyCard
      if (!card) return current

      const plotIndex = current.plots.findIndex(p => p.row === row && p.col === col)

      if (plotIndex === -1) return current

      const plot = current.plots[plotIndex]

      const wildEmulate = placementMode.wildCardEmulatePropertyId
      const isWildBuild = card.id === 'anchor-wild-card' && !!wildEmulate
      const isCivicFlexBuild = isCivicFlexHandCard(card) && !!wildEmulate
      const placementTemplate = resolvePropertyPlacementTemplate(card, wildEmulate)
      if ((isWildBuild || isCivicFlexBuild) && !placementTemplate) {
        toast.error(
          isWildBuild
            ? 'Anchor Wild Card lost its anchor choice. Cancel placement and try again.'
            : 'Civic card lost its building choice. Cancel placement and try again.'
        )
        return current
      }
      const resolvedTemplate = placementTemplate ?? card

      const validPlots = getValidPlotsForProperty(resolvedTemplate, current.plots, current.crossingTheLineActive)
      const isValid = validPlots.some(p => p.row === row && p.col === col)

      if (!isValid) {
        toast.error(`Cannot build ${resolvedTemplate.name} here!`)
        return current
      }

      const highDensityPlacement = placementMode.housingHighDensity === true && isHousingPropertyCard(card)
      const ANCHOR_WILD_BUILD_COST_M = 6
      const fullBuildCost = isWildBuild
        ? ANCHOR_WILD_BUILD_COST_M
        : getHousingBuildCost(card, highDensityPlacement)
      const taxBuildActionInstanceId = placementMode.taxBuildActionInstanceId
      const taxBuildCardInstance =
        taxBuildActionInstanceId
          ? currentPlayer.actionCards.find((c) => c.instanceId === taxBuildActionInstanceId)
          : undefined
      const usingTaxBuild =
        taxBuildActionInstanceId != null && taxBuildCardInstance?.cardId === 'build-with-tax-dollars'
      const buildCost = usingTaxBuild ? Math.ceil(fullBuildCost / 2) : fullBuildCost

      if (currentPlayer.money < buildCost) {
        toast.error(`Not enough money! Need $${buildCost}M`)
        return current
      }

      if (turnLimitReached(current.turnActionsConsumed)) {
        toast.error(`You have used all ${MAX_TURN_ACTIONS} actions this turn. Click End Turn.`)
        return current
      }

      const newPlots = [...current.plots]
      newPlots[plotIndex] = {
        ...plot,
        builtProperty: resolvedTemplate.id,
        claimedBy: currentPlayer.id,
        housingHighDensity: highDensityPlacement ? true : undefined,
      }

      const updatedMoney = currentPlayer.money - buildCost
      const updatedPropertyCards = currentPlayer.propertyCards.filter(
        (c) => c.instanceId !== instance.instanceId
      )
      const updatedPropertyDiscard = [...current.propertyDiscard, instance]
      const updatedActionCards = usingTaxBuild
        ? currentPlayer.actionCards.filter((c) => c.instanceId !== taxBuildActionInstanceId)
        : currentPlayer.actionCards
      const updatedActionDiscard = usingTaxBuild && taxBuildCardInstance
        ? [...current.actionDiscard, taxBuildCardInstance]
        : current.actionDiscard

      const updatedPlayers = current.players.map((p, idx) =>
        idx === current.currentPlayerIndex
          ? { ...p, money: updatedMoney, propertyCards: updatedPropertyCards, actionCards: updatedActionCards }
          : p
      )

      {
        const celebration = getBuildCelebrationMessage(resolvedTemplate, { housingHighDensity: highDensityPlacement })
        const isAnchorBuild = resolvedTemplate.type === 'anchor'
        const title = celebration ?? `Built ${resolvedTemplate.name}!`
        showBoardNotice(
          isAnchorBuild ? `⚓ ${resolvedTemplate.name} anchored!` : title,
          `${col}${row} · $${buildCost}M`
        )
        if (isAnchorBuild) playAnchorDropSound()
        else playConstructionSound()
      }
      setPlacementMode({
        active: false,
        propertyCardId: null,
        housingHighDensity: undefined,
        taxBuildActionInstanceId: undefined,
        wildCardEmulatePropertyId: undefined,
      })
      if (usingTaxBuild) {
        toast.success(`Built with Tax Dollars at 50% cost ($${fullBuildCost}M → $${buildCost}M).`)
      }

      const newPropertiesBuiltThisTurn = current.propertiesBuiltThisTurn + 1
      const newActionsPlayedThisTurn = current.actionsPlayedThisTurn + (usingTaxBuild ? 1 : 0)
      const newTurnActionsConsumed = (current.turnActionsConsumed ?? 0) + 1 + (usingTaxBuild ? 1 : 0)

      const newState: GameState = {
        ...current,
        players: updatedPlayers,
        plots: newPlots,
        actionDiscard: updatedActionDiscard,
        propertyDiscard: updatedPropertyDiscard,
        propertiesBuiltThisTurn: newPropertiesBuiltThisTurn,
        actionsPlayedThisTurn: newActionsPlayedThisTurn,
        turnActionsConsumed: newTurnActionsConsumed,
        playedPropertyCardThisTurn: instance.instanceId,
        lastBuiltProperty: {
          row,
          col,
          propertyId: resolvedTemplate.id,
          buildCost,
          undoTitle: isWildBuild
            ? `Anchor Wild Card (${resolvedTemplate.name})`
            : isCivicFlexBuild
              ? `Civic (${resolvedTemplate.name})`
              : undefined,
        },
      }

      const triggerPatch = buildEndGameTriggerPatch(current, newPlots, { row, col })
      const stateWithTrigger: GameState = { ...newState, ...triggerPatch }

      if (triggerPatch.endGameTriggered) {
        const triggererName =
          current.players.find((p) => p.id === triggerPatch.endGameTriggerPlayerId)?.name ?? 'A founder'
        setTimeout(() => {
          toast.success(
            `${triggererName} reached nine sequential built properties — Final Round! Each founder gets one more turn.`
          )
        }, 600)
      }

      if (turnLimitReached(newTurnActionsConsumed)) {
        setTimeout(() => {
          handleEndTurn()
        }, 500)
      }

      return withReplenishedActionHand(stateWithTrigger, current.currentPlayerIndex)
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
      const currentPlayer = current.players[current.currentPlayerIndex]
      let updatedActionCards = [...(currentPlayer.actionCards || [])]
      let updatedPropertyCards = [...(currentPlayer.propertyCards || [])]
      let updatedActionDeck = [...current.actionDeck]
      let updatedPropertyDeck = [...current.propertyDeck]
      let updatedPropertyDiscard = [...current.propertyDiscard]

      if (current.playedPropertyCardThisTurn) {
        const playedPropertyInstance = updatedPropertyCards.find(
          c => c.instanceId === current.playedPropertyCardThisTurn
        )
        if (playedPropertyInstance) {
          updatedPropertyCards = updatedPropertyCards.filter(
            c => c.instanceId !== current.playedPropertyCardThisTurn
          )
          updatedPropertyDiscard.push(playedPropertyInstance)
        }
      }

      const propertyCardsToDraw = Math.max(0, 5 - updatedPropertyCards.length)
      if (propertyCardsToDraw > 0) {
        const { drawn, remaining } = drawCards(updatedPropertyDeck, propertyCardsToDraw)
        updatedPropertyCards = [...updatedPropertyCards, ...drawn]
        updatedPropertyDeck = remaining
      }

      const totalActionCards = updatedActionCards.length

      const updatedPlayers = current.players.map((p, idx) =>
        idx === current.currentPlayerIndex
          ? { ...p, actionCards: updatedActionCards, propertyCards: updatedPropertyCards }
          : p
      )

      const newState = {
        ...current,
        players: updatedPlayers,
        actionDeck: updatedActionDeck,
        propertyDeck: updatedPropertyDeck,
        propertyDiscard: updatedPropertyDiscard,
        propertiesBuiltThisTurn: 0,
        actionsPlayedThisTurn: 0,
        turnActionsConsumed: 0,
        incomeResolvedThisTurn: false,
        crossingTheLineActive: false,
        playedPropertyCardThisTurn: undefined,
      }

      if (totalActionCards > 8) {
        setDiscardDialogState({ open: true, numToDiscard: totalActionCards - 8 })
        return newState
      }

      const finalRoundPatch = applyFinalRoundCountdown(current)
      if (finalRoundPatch.gameEnded) {
        setTimeout(() => toast.success('Final Round complete — game over!'), 200)
        return {
          ...newState,
          ...clearCouncilFreezeIfEndingPlayer(current, current.currentPlayerIndex),
          ...finalRoundPatch,
          lastBuiltProperty: undefined,
        }
      }

      const nextPlayerIndex = (current.currentPlayerIndex + 1) % current.players.length
      const nextPlayer = current.players[nextPlayerIndex]
      const playRoundNumber = nextPlayRoundNumber(current, nextPlayerIndex)

      const {
        drawn: newActionCards,
        deck: nextActionDeck,
        discard: nextActionDiscard,
      } = drawFromDeckWithDiscardReshuffle(updatedActionDeck, current.actionDiscard, 2)

      const nextPlayerUpdated = {
        ...nextPlayer,
        actionCards: [...nextPlayer.actionCards, ...newActionCards]
      }

      const playersWithNewCards = newState.players.map((p, idx) =>
        idx === nextPlayerIndex ? nextPlayerUpdated : p
      )

      const inFinalRound = finalRoundPatch.finalRoundTurnsRemaining !== undefined
      toast.info(
        inFinalRound
          ? `${nextPlayer.name}'s final turn`
          : `${nextPlayer.name}'s turn`
      )

      return {
        ...newState,
        ...clearCouncilFreezeIfEndingPlayer(current, current.currentPlayerIndex),
        ...finalRoundPatch,
        players: playersWithNewCards,
        actionDeck: nextActionDeck,
        actionDiscard: nextActionDiscard,
        currentPlayerIndex: nextPlayerIndex,
        playRoundNumber,
        newCardsDrawn: newActionCards,
        showNewCardsAnimation: true,
        lastBuiltProperty: undefined,
      }
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

  const handleDiscardComplete = (discardedInstanceIds: string[]) => {
    patchGameState((current) => {
      const currentPlayer = current.players[current.currentPlayerIndex]

      const updatedActionCards = currentPlayer.actionCards.filter(
        c => !discardedInstanceIds.includes(c.instanceId)
      )

      const discardedActionCards = currentPlayer.actionCards.filter(
        c => discardedInstanceIds.includes(c.instanceId)
      )

      const updatedPlayers = current.players.map((p, idx) =>
        idx === current.currentPlayerIndex
          ? { ...p, actionCards: updatedActionCards }
          : p
      )

      toast.success(`Discarded ${discardedInstanceIds.length} action card${discardedInstanceIds.length > 1 ? 's' : ''}`)

      setDiscardDialogState({ open: false, numToDiscard: 0 })

      const finalRoundPatch = applyFinalRoundCountdown(current)
      if (finalRoundPatch.gameEnded) {
        setTimeout(() => toast.success('Final Round complete — game over!'), 200)
        return {
          ...current,
          ...clearCouncilFreezeIfEndingPlayer(current, current.currentPlayerIndex),
          ...finalRoundPatch,
          players: updatedPlayers,
          actionDiscard: [...current.actionDiscard, ...discardedActionCards],
          propertiesBuiltThisTurn: 0,
          actionsPlayedThisTurn: 0,
          turnActionsConsumed: 0,
          incomeResolvedThisTurn: false,
          crossingTheLineActive: false,
          playedPropertyCardThisTurn: undefined,
          lastBuiltProperty: undefined,
        }
      }

      const nextPlayerIndex = (current.currentPlayerIndex + 1) % current.players.length
      const nextPlayer = current.players[nextPlayerIndex]
      const playRoundNumber = nextPlayRoundNumber(current, nextPlayerIndex)

      const mergedActionDiscard = [...current.actionDiscard, ...discardedActionCards]
      const {
        drawn: newActionCards,
        deck: nextActionDeck,
        discard: nextActionDiscard,
      } = drawFromDeckWithDiscardReshuffle(current.actionDeck, mergedActionDiscard, 2)

      const nextPlayerUpdated = {
        ...nextPlayer,
        actionCards: [...nextPlayer.actionCards, ...newActionCards]
      }

      const playersWithNewCards = updatedPlayers.map((p, idx) =>
        idx === nextPlayerIndex ? nextPlayerUpdated : p
      )

      const inFinalRound = finalRoundPatch.finalRoundTurnsRemaining !== undefined
      toast.info(
        inFinalRound
          ? `${nextPlayer.name}'s final turn`
          : `${nextPlayer.name}'s turn`
      )

      return {
        ...current,
        ...clearCouncilFreezeIfEndingPlayer(current, current.currentPlayerIndex),
        ...finalRoundPatch,
        players: playersWithNewCards,
        currentPlayerIndex: nextPlayerIndex,
        playRoundNumber,
        actionDeck: nextActionDeck,
        actionDiscard: nextActionDiscard,
        propertiesBuiltThisTurn: 0,
        actionsPlayedThisTurn: 0,
        turnActionsConsumed: 0,
        incomeResolvedThisTurn: false,
        crossingTheLineActive: false,
        playedPropertyCardThisTurn: undefined,
        newCardsDrawn: newActionCards,
        showNewCardsAnimation: true,
        lastBuiltProperty: undefined,
      }
    })

    setTimeout(() => {
      if (isOnlineActor) {
        sendActionRef.current({ type: 'animation_flags_clear' }, { skipOptimistic: true })
      } else {
        setGameState((current) => {
          return {
            ...current,
            showNewCardsAnimation: false,
            newCardsDrawn: undefined,
          }
        })
      }
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

  const handleConfirmDiscardProperty = () => {
    const mode = discardPropertySelectModeRef.current
    if (!mode.active || !mode.actionInstanceId) return

    const cpIdx = safeGameState.currentPlayerIndex
    const previewPlayer = safeGameState.players[cpIdx]
    const actionInstPreview = previewPlayer.actionCards.find((a) => a.instanceId === mode.actionInstanceId)
    if (!actionInstPreview || actionInstPreview.cardId !== 'discard-property-cards') {
      toast.error('That action is no longer in your hand.')
      setDiscardPropertySelectMode({ active: false, actionInstanceId: null, selectedPropertyInstanceIds: [] })
      setDiscardPropertyConfirmOpen(false)
      return
    }
    const handIds = new Set(previewPlayer.propertyCards.map((c) => c.instanceId))
    if (mode.selectedPropertyInstanceIds.some((id) => !handIds.has(id))) {
      toast.error('Selection is out of date. Close the dialog and try again.')
      return
    }

    let applied = false
    let nOut = 0
    let drawnLen = 0
    patchGameState((current) => {
      const currentPlayer = current.players[current.currentPlayerIndex]
      const actionInst = currentPlayer.actionCards.find((a) => a.instanceId === mode.actionInstanceId)
      if (!actionInst || actionInst.cardId !== 'discard-property-cards') {
        return current
      }
      const selectedSet = new Set(mode.selectedPropertyInstanceIds)
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
      const newActionCards = currentPlayer.actionCards.filter((a) => a.instanceId !== mode.actionInstanceId)
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
        setTimeout(() => handleEndTurn(), 500)
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
      toast.error(`Need $${contribution}M to complete this investment.`)
      return
    }
    const plotPreview = safeGameState.plots.find((p) => p.row === row && p.col === col)
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
        setTimeout(() => handleEndTurn(), 500)
      }

      return withReplenishedActionHand(newState, cpIdx)
    })
    setInvestmentSelectMode({ active: false, validPlots: [], actionInstanceId: null, contributionMillion: 4 })
    toast.success('Investment — cash to owner', {
      description: `${investorPreview.name} is investing $${contribution}M in ${ownerPreview?.name ?? 'the owner'}'s ${propertyTitle} at ${col}${row}. $${contribution}M is paid from the investor to the property owner.`,
      duration: 8000,
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
    patchGameState((current) => {
      const cpIdx = current.currentPlayerIndex
      const ownerId = current.players[cpIdx].id
      const plot = current.plots.find((p) => p.row === row && p.col === col)
      if (!plot || plot.claimedBy !== ownerId || !plot.investmentStripes?.length) return current

      const buyoutNeeded = totalRemoveInvestorsBuyoutMillion(plot.investmentStripes)
      const owner = current.players[cpIdx]
      if (owner.money < buyoutNeeded) {
        toast.error(
          `You need at least $${buyoutNeeded}M to cover mandatory 50% payouts to every investor on ${col}${row}.`
        )
        return current
      }

      const { bonus, labels } = getRemoveInvestorsRollBonuses(ownerId, current.plots, row, col)

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
      if (bonus > 0) {
        toast.success(`+${bonus} on Remove Investors roll — ${labels.join(', ')}.`)
      }
      toast.info(`Roll total 5+ to remove all investors. On success, pay $${buyoutNeeded}M total in 50% buyouts. No investor counter-roll.`)

      return current
    })
  }

  const handleActionCriteriaBank = () => {
    const id = actionCriteriaDialog.actionInstanceId
    if (!id) return
    if (turnLimitReached(safeGameState.turnActionsConsumed)) {
      toast.error(`You have used all ${MAX_TURN_ACTIONS} actions this turn. Click End Turn.`)
      return
    }
    const banked = actionCriteriaDialog.bankValue
    patchGameState((current) => {
      const cpIdx = current.currentPlayerIndex
      const cp = current.players[cpIdx]
      const inst = cp.actionCards.find((a) => a.instanceId === id)
      const card = inst ? actionCards.find((c) => c.id === inst.cardId) : undefined
      const bank = card?.bankValue ?? 0
      const updatedActionCards = cp.actionCards.filter((c) => c.instanceId !== id)
      const actionDiscardPile = inst ? [...current.actionDiscard, inst] : current.actionDiscard
      const newActionsPlayed = current.actionsPlayedThisTurn + 1
      const newTurnActionsConsumed = (current.turnActionsConsumed ?? 0) + 1
      const players = current.players.map((p, i) =>
        i === cpIdx ? { ...p, money: p.money + bank, actionCards: updatedActionCards } : p
      )
      const newState: GameState = {
        ...current,
        players,
        actionDiscard: actionDiscardPile,
        actionsPlayedThisTurn: newActionsPlayed,
        turnActionsConsumed: newTurnActionsConsumed,
      }
      if (turnLimitReached(newTurnActionsConsumed)) {
        setTimeout(() => handleEndTurn(), 500)
      }
      return withReplenishedActionHand(newState, cpIdx)
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
      toast.error(`You need $${buildCost}M to complete this build if the roll succeeds.`)
      return
    }
    const { bonus, labels } = getRezoningCivicInfluenceBoardWide(player.id, safeGameState.plots)
    if (bonus > 0) {
      toast.success(`+${bonus} rezoning influence — civic holdings anywhere on the board: ${labels.join(' & ')}.`)
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
      toast.error(
        `You need at least $${minCash}M ($1M to the owner now, plus $${payment120}M if you win the rolls) to target this property.`
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
        setTimeout(() => handleEndTurn(), 500)
      }
      return withReplenishedActionHand(newState, cpIdx)
    })

    setTakeoverSelectMode({ active: false, validPlots: [], actionInstanceId: null })
    const farmTakeover = getFarmCoopTakeoverInfluenceBonus(
      attackerPreview.id,
      safeGameState.plots,
      row,
      col
    )
    const portTakeover = getPortAuthorityTakeoverInfluenceBonus(
      attackerPreview.id,
      safeGameState.plots,
      row,
      col
    )
    const artsTakeover = getArtsCouncilTakeoverInfluenceBonus(
      attackerPreview.id,
      safeGameState.plots,
      row,
      col
    )
    const tourismTakeover = getTourismOfficeTakeoverInfluenceBonus(
      attackerPreview.id,
      safeGameState.plots,
      row,
      col
    )
    const mafiaTakeover = getMafiaTakeoverInfluenceBonus(
      attackerPreview.id,
      safeGameState.plots,
      row,
      col
    )
    const regulationTakeover = getRegulationBureauTakeoverAttackerBonus(
      attackerPreview.id,
      safeGameState.plots,
      row,
      col
    )
    const takeoverBonus =
      farmTakeover.bonus +
      portTakeover.bonus +
      artsTakeover.bonus +
      tourismTakeover.bonus +
      mafiaTakeover.bonus +
      regulationTakeover.bonus
    const takeoverLabels = [
      ...farmTakeover.labels,
      ...portTakeover.labels,
      ...artsTakeover.labels,
      ...tourismTakeover.labels,
      ...mafiaTakeover.labels,
      ...regulationTakeover.labels,
    ]
    setRollDieDialogState({
      open: true,
      mode: 'hostile-takeover-attacker',
      actionInstanceId: instId,
      takeoverContext: { row, col, ownerPlayerId, payment120Million: payment120 },
      targetPlayerId: undefined,
      influenceBonus: takeoverBonus > 0 ? takeoverBonus : undefined,
      influenceLabels: takeoverBonus > 0 ? takeoverLabels : undefined,
      councilFreezeAttackerRollsCompleted: undefined,
      councilFreezeAttackerLastNatural: undefined,
      councilFreezeFailAuto: undefined,
      diceRetryNonce: 0,
      rezoningContext: undefined,
      scandalContext: undefined,
    })
    if (takeoverBonus > 0) {
      toast.success(
        `+${takeoverBonus} takeover influence from ${takeoverLabels.join(' + ')}.`
      )
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

  const handleNewGame = () => {
    if (partyBoardConfig?.role === 'host') {
      partyBoardSync.sendGameClear()
    }
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
      mafiaIncomeBonus: 0,
      mafiaBonusSourceLabels: [],
      mafiaLevyTotal: 0,
      regulationBureauIncomeBonus: 0,
      regulationBureauBonusSourceLabels: [],
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
        queueMicrotask(() =>
          toast.error(`You have used all ${MAX_TURN_ACTIONS} actions this turn. Click End Turn.`)
        )
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
        setTimeout(() => handleEndTurn(), 500)
      }

      return withReplenishedActionHand(nextState, cpIdx)
    })
  }

  const handleIncomeComplete = (
    earnedIncome: number,
    doubleIncomeInstanceId?: string,
    incomeResolution: 'property-roll' | 'bank-income-card' = 'property-roll'
  ) => {
    if (!incomeDialogState.actionInstanceId) return

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

    const { scaled: scaledInvestorPayout, ownerKeeps } = allocateInvestorPayoutsFromOwner(
      earnedIncome,
      isPropertyRoll ? rawInvestorPayout : {}
    )
    const cashToAdd = pendingTax ? Math.max(0, ownerKeeps - levy) : ownerKeeps

    const totalInvestorPayout =
      Object.values(scaledInvestorPayout).reduce((a, b) => a + b, 0)
    const totalInvestorOwed =
      Object.values(rawInvestorPayout).reduce((a, b) => a + b, 0)
    const investorsProRated = isPropertyRoll && totalInvestorOwed > 0 && totalInvestorPayout < totalInvestorOwed

    const mafiaForToast: Record<number, number> =
      incomeResolution === 'property-roll'
        ? getMafiaLevyForIncomePlayer(incomeOwnerPreview.id, safeGameState.plots).recipientAmounts
        : {}

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
        mafiaIncomeBonus: 0,
        mafiaBonusSourceLabels: [],
        mafiaLevyTotal: 0,
        regulationBureauIncomeBonus: 0,
        regulationBureauBonusSourceLabels: [],
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
      setGameState((current) => {
      const currentPlayer = current.players[current.currentPlayerIndex]
      const ownerIdResolved = currentPlayer.id
      const stillPendingTax = (current.pendingIncomeTaxPlayerIds ?? []).includes(ownerIdResolved)

      const { payoutByPlayerId } = isPropertyRoll
        ? computeInvestorIncomeAwardsForOwner(current.plots, ownerIdResolved)
        : { payoutByPlayerId: {} as Record<number, number> }
      const { scaled: scaledInner, ownerKeeps: ownerKeepsInner } = allocateInvestorPayoutsFromOwner(
        earnedIncome,
        isPropertyRoll ? payoutByPlayerId : {}
      )
      const cashFromIncome = pendingTax ? Math.max(0, ownerKeepsInner - levy) : ownerKeepsInner
      const updatedMoney = currentPlayer.money + cashFromIncome

      const { recipientAmounts: mafiaRecipientAmounts } =
        incomeResolution === 'property-roll'
          ? getMafiaLevyForIncomePlayer(ownerIdResolved, current.plots)
          : { recipientAmounts: {} as Record<number, number> }

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
        }, 500)
      }

      return withReplenishedActionHand(newState, current.currentPlayerIndex)
    })
    }

    if (!isOnlineActor) {
      resetIncomeDialog()
    }

    toast.success(
      pendingTax
        ? `Income collected: $${cashToAdd}M after city tax assessment${levy > 0 ? ` (−$${levy}M)` : ''}.`
        : isPropertyRoll && totalInvestorPayout > 0
          ? `You collected $${earnedIncome}M before investor shares; you keep $${cashToAdd}M.`
          : `Income collected: $${cashToAdd}M!`
    )
    if (pendingTax) {
      showBoardNotice(
        'Tax Time Boys & Girls!',
        levy > 0
          ? `City assessment: −$${levy}M (50% of your $${totalInc}M property income base). You keep $${cashToAdd}M. Cannot be overturned.`
          : `Assessment cleared on this Income. You keep $${cashToAdd}M. Cannot be overturned.`
      )
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
      mafiaIncomeBonus: 0,
      mafiaBonusSourceLabels: [],
      mafiaLevyTotal: 0,
      regulationBureauIncomeBonus: 0,
      regulationBureauBonusSourceLabels: [],
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

    if (safeGameState.lastBuiltProperty &&
        safeGameState.lastBuiltProperty.row === row &&
        safeGameState.lastBuiltProperty.col === col) {
      const propertyCard = propertyCards.find(c => c.id === safeGameState.lastBuiltProperty?.propertyId)
      const propertyName =
        safeGameState.lastBuiltProperty.undoTitle ?? propertyCard?.name ?? 'Property'
      if (propertyCard || safeGameState.lastBuiltProperty.undoTitle) {
        setUndoBuildDialogState({
          open: true,
          row,
          col,
          propertyName,
          buildCost: safeGameState.lastBuiltProperty.buildCost
        })
      }
    }
  }

  const handleUndoBuild = () => {
    if (!undoBuildDialogState.row || !undoBuildDialogState.col) return

    patchGameState((current) => {
      if (!current.lastBuiltProperty) return current

      const { row, col, buildCost } = current.lastBuiltProperty

      const plotIndex = current.plots.findIndex(p => p.row === row && p.col === col)
      if (plotIndex === -1) return current

      const plot = current.plots[plotIndex]

      const newPlots = [...current.plots]
      newPlots[plotIndex] = {
        ...plot,
        builtProperty: undefined,
        claimedBy: undefined,
        housingHighDensity: undefined,
        investmentStripes: undefined,
      }

      const currentPlayer = current.players[current.currentPlayerIndex]
      const updatedMoney = currentPlayer.money + buildCost

      const undonePropertyInstanceId = current.playedPropertyCardThisTurn
      let restoredPropertyCard = null

      if (undonePropertyInstanceId) {
        const discardedCard = current.propertyDiscard.find(c => c.instanceId === undonePropertyInstanceId)
        if (discardedCard) {
          restoredPropertyCard = discardedCard
        }
      }

      const updatedPropertyCards = restoredPropertyCard
        ? [...currentPlayer.propertyCards, restoredPropertyCard]
        : currentPlayer.propertyCards

      const updatedPropertyDiscard = restoredPropertyCard
        ? current.propertyDiscard.filter(c => c.instanceId !== undonePropertyInstanceId)
        : current.propertyDiscard

      const updatedPlayers = current.players.map((p, idx) =>
        idx === current.currentPlayerIndex
          ? { ...p, money: updatedMoney, propertyCards: updatedPropertyCards }
          : p
      )

      toast.success(`Undid build at ${col}${row}! Refunded $${buildCost}M`)

      return {
        ...current,
        players: updatedPlayers,
        plots: newPlots,
        propertyDiscard: updatedPropertyDiscard,
        propertiesBuiltThisTurn: 0,
        turnActionsConsumed: Math.max(0, (current.turnActionsConsumed ?? 0) - 1),
        playedPropertyCardThisTurn: undefined,
        lastBuiltProperty: undefined
      }
    })

    setUndoBuildDialogState({ open: false, row: null, col: null, propertyName: '', buildCost: 0 })
  }

  const handleUndoBuildCancel = () => {
    setUndoBuildDialogState({ open: false, row: null, col: null, propertyName: '', buildCost: 0 })
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
        setTimeout(() => handleEndTurn(), 500)
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
    if (source === 'accept') {
      toast.info('City Council Freeze ends — you did not reach 5–6 after influence.')
    }
  }, [])

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
          setTimeout(() => handleEndTurn(), 500)
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
        setTimeout(() => handleEndTurn(), 500)
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
          setTimeout(() => handleEndTurn(), 500)
        }

        return withReplenishedActionHand(newState, current.currentPlayerIndex)
      })

      if (negated) {
        toast.success(`${targetName} rolled 6 — City Council Freeze negated.`)
      } else {
        toast.success(
          `${targetName} rolled ${result} — freeze applies. They cannot build properties until they finish their next turn.`
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

      if (blocked) {
        toast.success('Rolled 6 — takeover blocked. The property stays with its owner.')
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
                `${triggererName} reached nine sequential built properties — Final Round! Each founder gets one more turn.`
              )
            }, 600)
          }
          return stateAfterTakeover
        })
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
      if (negated) {
        toast.success('Rolled 6 — scandal negated. The anchor keeps its influence.')
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
            setTimeout(() => handleEndTurn(), 500)
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
            setTimeout(() => handleEndTurn(), 500)
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
        const newTurnConsumed = (current.turnActionsConsumed ?? 0) + 1
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
        if (card.type === 'anchor') playAnchorDropSound()
        else playConstructionSound()
        {
          const celebration = getBuildCelebrationMessage(card, { housingHighDensity: highDensity })
          const title =
            card.type === 'anchor' ? `⚓ ${card.name} anchored!` : (celebration ?? `Built ${card.name}!`)
          showBoardNotice(title, `Rezoning — ${ctx.col}${ctx.row} · $${buildCost}M`)
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
              `${triggererName} reached nine sequential built properties — Final Round! Each founder gets one more turn.`
            )
          }, 600)
        }
        if (turnLimitReached(newTurnConsumed)) {
          setTimeout(() => handleEndTurn(), 500)
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

      if (total < 5) {
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
            setTimeout(() => handleEndTurn(), 500)
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
          setTimeout(() => handleEndTurn(), 500)
        }

        toast.success(
          `Investors removed from ${ctx.col}${ctx.row}. Paid $${buyoutTotal}M total in 50% buyouts (roll ${result}${bonus > 0 ? ` + ${bonus}` : ''} = ${total}).`
        )

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
    handleUndoBuildCancel,
    handleActionCriteriaBank,
    handleCancelTakeoverSelect,
    handleCancelScandalSelect,
    handleCancelRezoning,
    handleCancelInvestmentSelect,
    handleCancelRemoveInvestorsSelect,
    handleCancelDiscardPropertySelect,
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
  }
  aiUiRef.current = {
    undoBuildDialogOpen: undoBuildDialogState.open,
    boardNoticeActive: boardNotice != null,
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
  }

  const aiPlayerReady =
    currentPlayerMaybe?.isAi === true &&
    safeGameState.isSetupComplete &&
    !safeGameState.gameEnded &&
    safeGameState.openingNarrationComplete !== false &&
    (!partyBoardConfig || partyBoardConfig.role === 'host')

  const aiWakeKey = [
    aiPlayerReady ? 1 : 0,
    safeGameState.currentPlayerIndex,
    discardDialogState.open ? 1 : 0,
    discardDialogState.numToDiscard ?? 0,
    rollDieDialogState.open ? 1 : 0,
    incomeDialogState.open ? 1 : 0,
    safeGameState.showNewCardsAnimation ? 1 : 0,
    undoBuildDialogState.open ? 1 : 0,
    boardNotice != null ? 1 : 0,
    taxBuildPrompt.open ? 1 : 0,
    discardPropertyConfirmOpen ? 1 : 0,
    takeoverSelectMode.active ? 1 : 0,
    scandalSelectMode.active ? 1 : 0,
    rezoningMode.phase,
    investmentSelectMode.active ? 1 : 0,
    removeInvestorsSelectMode.active ? 1 : 0,
    discardPropertySelectMode.active ? 1 : 0,
    taxBuildMode.phase,
    placementMode.active ? 1 : 0,
    placementMode.propertyCardId ?? '',
    safeGameState.turnActionsConsumed ?? 0,
    safeGameState.propertiesBuiltThisTurn ?? 0,
    safeGameState.incomeResolvedThisTurn ? 1 : 0,
    currentPlayerMaybe?.money ?? 0,
    currentPlayerMaybe?.actionCards.length ?? 0,
    currentPlayerMaybe?.propertyCards.length ?? 0,
  ].join('|')

  useEffect(() => {
    if (!aiPlayerReady) return
    const id = window.setTimeout(() => {
      const gsSnap = aiGsRef.current
      const cpSnap = aiCpRef.current
      const ui = aiUiRef.current
      const hx = aiHooksRef.current
      if (!ui || !gsSnap || !cpSnap || !cpSnap.isAi) return
      trySimpleAiMainPhase(gsSnap, cpSnap, ui, hx)
    }, 700)
    return () => window.clearTimeout(id)
  }, [aiPlayerReady, aiWakeKey])

  if (!setupReady || currentPlayerMaybe == null) {
    return (
      <>
        <GameSetupWizard onComplete={handleSetupComplete} onGuestJoined={handleGuestJoined} />
        <Toaster />
      </>
    )
  }

  const currentPlayer = currentPlayerMaybe
  /** Solo vs bots: bottom rail sticks to the human so they can evaluate off-turn; otherwise rail follows current seat. */
  /** Solo vs bots pins the lone human as the rail; multiplayer / online pins the PartyKit seat for this browser. */
  const soloVersusBotsTable = isSinglePlayerVersusBots(safeGameState.players)
  const localHumanSeat = soloVersusBotsTable
    ? safeGameState.players.find((p) => p.isAi !== true) ?? currentPlayer
    : partyBoardSeatPlayer ?? currentPlayer
  const handRailPlayer = localHumanSeat
  const handRailPlayerIndex = safeGameState.players.findIndex((p) => p.id === handRailPlayer.id)
  const actingPlayerSeat = safeGameState.players[safeGameState.currentPlayerIndex]
  const handInteractionsActive =
    !isSpectator &&
    handRailPlayerIndex === safeGameState.currentPlayerIndex &&
    actingPlayerSeat?.isAi !== true

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
      switch (rollDieDialogState.mode) {
        case 'council-freeze-attacker':
          return {
            id: 'cf-att',
            title: 'City Council Freeze — your roll',
            detail:
              'Roll the die in the dialog. First roll free; each retry costs $5M. After 3 misses the freeze fails.',
            tone: 'danger',
            ctaLabel: 'Roll in dialog',
          }
        case 'council-freeze-defender':
          return {
            id: 'cf-def',
            title: `City Council Freeze — ${defenderName ?? 'defender'} rolls`,
            detail: 'Defender rolls once in the dialog. Only a 6 negates the freeze.',
            tone: 'danger',
            ctaLabel: 'Roll in dialog',
          }
        case 'hostile-takeover-attacker':
          return {
            id: 'ht-att',
            title: 'Hostile Takeover — your roll',
            detail:
              '$1M attempt fee paid. Roll the die in the dialog — 5–6 succeeds. There is no exit until you roll.',
            tone: 'danger',
            ctaLabel: 'Roll in dialog',
          }
        case 'hostile-takeover-defender':
          return {
            id: 'ht-def',
            title: `Hostile Takeover — ${defenderName ?? 'owner'} rolls`,
            detail: 'Owner rolls once. Only a 6 blocks the takeover.',
            tone: 'danger',
            ctaLabel: 'Roll in dialog',
          }
        case 'scandal-attacker':
          return {
            id: 'sc-att',
            title: 'Scandal — your roll',
            detail: 'Roll in the dialog. Total 6+ after Influencer / News Outlet bonuses succeeds.',
            tone: 'warning',
            ctaLabel: 'Roll in dialog',
          }
        case 'scandal-defender':
          return {
            id: 'sc-def',
            title: `Scandal — ${defenderName ?? 'anchor owner'} rolls`,
            detail: 'Anchor owner rolls once. Only a 6 negates the scandal.',
            tone: 'warning',
            ctaLabel: 'Roll in dialog',
          }
        case 'rezoning':
          return {
            id: 'rz-roll',
            title: 'Rezoning — roll required',
            detail: 'Roll in the dialog. 5–6 approves (4–6 with +1 civic influence).',
            tone: 'warning',
            ctaLabel: 'Roll in dialog',
          }
        case 'police-raid-attacker':
          return {
            id: 'pr-att',
            title: 'Police Raid on Mafia — your roll',
            detail: 'Roll in the dialog. 5–6 succeeds (4–6 if you own a built Police lot).',
            tone: 'danger',
            ctaLabel: 'Roll in dialog',
          }
        case 'police-raid-defender':
          return {
            id: 'pr-def',
            title: 'Police Raid on Mafia — Mafia counter roll',
            detail: 'Mafia rolls once. A 6 counters (5–6 if you own Police).',
            tone: 'danger',
            ctaLabel: 'Roll in dialog',
          }
        case 'remove-investors':
          return {
            id: 'ri',
            title: 'Remove Investors — roll required',
            detail:
              'Roll in the dialog. Total 5+ includes block anchor and civic influence. No investor counter-roll. On success pay each investor 50% of their stake; all stripes on that lot clear.',
            tone: 'warning',
            ctaLabel: 'Roll in dialog',
          }
        case 'roll-die':
          return {
            id: 'roll-die',
            title: 'Roll required',
            detail: 'Roll the die in the dialog to continue.',
            tone: 'info',
            ctaLabel: 'Roll in dialog',
          }
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
        title: 'Hostile Takeover — pick a target',
        detail:
          'Click a highlighted opponent property on the board (same city block or orthogonal to your built lots, including across a street).',
        tone: 'danger',
        cancelLabel: 'Cancel Takeover',
        onCancel: handleCancelTakeoverSelect,
      }
    }
    if (scandalSelectMode.active) {
      return {
        id: 'sc-pick',
        title: 'Scandal — pick an anchor target',
        detail: 'Click a highlighted built anchor tenant on the board to scandalize.',
        tone: 'warning',
        cancelLabel: 'Cancel Scandal',
        onCancel: handleCancelScandalSelect,
      }
    }
    if (removeInvestorsSelectMode.active) {
      return {
        id: 'ri-pick',
        title: 'Remove Investors — pick your property',
        detail:
          'Click a highlighted lot you own that still has investor stripes. Multiple investors on one lot are cleared together if you succeed. You must be able to afford the combined 50% buyouts before the roll.',
        tone: 'warning',
        cancelLabel: 'Cancel',
        onCancel: handleCancelRemoveInvestorsSelect,
      }
    }
    if (investmentSelectMode.active) {
      return {
        id: 'inv-pick',
        title: 'Investment — pick a target',
        detail: 'Click a highlighted opponent property on the board to invest in it.',
        tone: 'info',
        cancelLabel: 'Cancel Investment',
        onCancel: handleCancelInvestmentSelect,
      }
    }
    if (discardPropertySelectMode.active) {
      return {
        id: 'dpc-pick',
        title: 'Discard Property Cards — choose from hand',
        detail:
          'All property cards are highlighted. Tap to select (orange) or deselect. Confirm in the dialog to discard and draw replacements — or discard none and spend only the action.',
        tone: 'info',
        ctaLabel: 'Review / discard…',
        onCta: () => setDiscardPropertyConfirmOpen(true),
        cancelLabel: 'Cancel',
        onCancel: handleCancelDiscardPropertySelect,
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
    <div className="h-screen flex flex-col overflow-hidden game-table">
      <div style={{ flexShrink: 0 }}>
      {/* Header bar */}
      <header style={{
        flexShrink: 0,
        height: 56,
        padding: '0 32px',
        backgroundColor: '#0a0a0f',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <h1 style={{ fontSize: 18, fontWeight: 300, letterSpacing: '0.03em', color: 'rgba(240,240,245,0.9)', margin: 0 }}>
            Founders Square
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleEndTurn}
            disabled={isSpectator || currentPlayer.isAi === true}
            className="btn-ps"
            style={{
              height: 34,
              padding: '0 20px',
              borderRadius: 9999,
              border: '1px solid rgba(255,255,255,0.15)',
              backgroundColor: 'transparent',
              color: '#f0f0f5',
              fontSize: 12,
              fontWeight: 500,
              cursor: isSpectator || currentPlayer.isAi === true ? 'not-allowed' : 'pointer',
              opacity: isSpectator || currentPlayer.isAi === true ? 0.45 : 1,
            }}
          >
            End Turn
          </button>
          <button
            onClick={handleNewGame}
            data-board-sync-skip-lock
            className="btn-ps"
            style={{
              height: 34,
              padding: '0 20px',
              borderRadius: 9999,
              border: '1px solid rgba(255,255,255,0.15)',
              backgroundColor: 'transparent',
              color: '#f0f0f5',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <ArrowCounterClockwise size={13} weight="bold" />
            New Game
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

      {/* Main content area */}
      <div
        className="flex-1 flex overflow-hidden min-h-0"
        style={{ pointerEvents: isSpectator ? 'none' : 'auto' }}
      >
        {/* Left player panel */}
        <aside style={{
          width: 264,
          flexShrink: 0,
          padding: 24,
          overflowY: 'auto',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          backgroundColor: '#0c0c12',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase' as const,
              color: 'rgba(240,240,245,0.45)',
            }}>
              Players
            </span>
            <div style={isSpectator ? { pointerEvents: 'auto' } : undefined}>
            <button
              type="button"
              aria-label="Open quick rules"
              title="Quick rules"
              onClick={() => setRulesQuickOpen(true)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-[#a8b0c8] transition-colors hover:border-[#5ac8fa]/40 hover:bg-[#1a1a24] hover:text-[#e0e8ff]"
            >
              <BookOpen size={20} weight="duotone" />
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
                  padding: isActive ? 20 : 16,
                  borderRadius: 12,
                  borderLeft: `4px solid ${isActive ? player.color : 'transparent'}`,
                  backgroundColor: isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
                  opacity: isActive ? 1 : 0.5,
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
                    fontWeight: 300,
                    letterSpacing: '0.02em',
                    color: isActive ? player.color : 'rgba(240,240,245,0.6)',
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
                    marginTop: isActive ? 14 : 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    fontSize: isActive ? 12 : 11,
                  }}
                  aria-hidden
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'rgba(240,240,245,0.4)' }}>Cash</span>
                    <span style={{ fontWeight: 500, color: 'rgba(240,240,245,0.85)', fontVariantNumeric: 'tabular-nums' }}>${player.money}M</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'rgba(240,240,245,0.4)' }}>Property</span>
                    <span style={{ fontWeight: 500, color: 'rgba(240,240,245,0.85)', fontVariantNumeric: 'tabular-nums' }}>${stats.propertyValue}M</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'rgba(240,240,245,0.4)' }}>Income</span>
                    <span style={{ fontWeight: 500, color: 'rgba(240,240,245,0.85)', fontVariantNumeric: 'tabular-nums' }}>${stats.income}M/turn</span>
                  </div>
                </div>
                {showSidebarAnchors ? <SidebarHandFlightAnchors player={player} /> : null}
              </article>
            )
          })}
          </div>
        </aside>

        {/* Center board + bottom hand */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Board area */}
          <div className="relative flex-1 flex items-center justify-center overflow-auto p-6 min-h-0">
            <GameBoard
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
              openingProTip={showOpeningProTip ? <OpeningProTipOverlay /> : null}
              onVacantLotHint={() =>
                toast.info(
                  'Claim a lot by placing a property: click the card (or expand it), then click a highlighted lot. Play required action cards first (for example Crossing the Line where district rules apply).'
                )
              }
            />
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
                className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-6"
                aria-live="polite"
                role="status"
              >
                <div className="fs-board-notice-panel max-w-xl rounded-2xl border border-white/25 bg-black/80 px-10 py-9 text-center shadow-[0_0_60px_rgba(0,0,0,0.65)] backdrop-blur-md">
                  <p
                    style={{
                      fontSize: 'clamp(1.35rem, 2.8vw, 2rem)',
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
                        marginTop: 14,
                        fontSize: 15,
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

          {/* Bottom player hand. Each deck pile is rendered inside PlayerHand, flanking its matching
              section: [Property Deck] [Property Fan] [Action Fan] [Action Deck]. */}
          <div className="flex-shrink-0 border-t border-white/8 bg-[#0e0e16] px-8 py-5">
            <PlayerHand
              player={handRailPlayer}
              opponents={safeGameState.players.filter((_, i) => i !== safeGameState.currentPlayerIndex)}
              handInteractionsActive={handInteractionsActive}
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
            />
          </div>
        </div>
      </div>

      <CardFlightLayer flights={cardFlights} onFlightDone={handleFlightDone} />

      <Toaster />
      <RulesQuickSheet open={rulesQuickOpen} onOpenChange={setRulesQuickOpen} />
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
          mafiaIncomeBonus={incomeDialogState.mafiaIncomeBonus}
          mafiaBonusSourceLabels={incomeDialogState.mafiaBonusSourceLabels}
          mafiaLevyTotal={incomeDialogState.mafiaLevyTotal}
          regulationBureauIncomeBonus={incomeDialogState.regulationBureauIncomeBonus}
          regulationBureauBonusSourceLabels={incomeDialogState.regulationBureauBonusSourceLabels}
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
      {undoBuildDialogState.open && undoBuildDialogState.row && undoBuildDialogState.col && (
        <UndoBuildDialog
          open={undoBuildDialogState.open}
          propertyName={undoBuildDialogState.propertyName}
          plotLocation={`${undoBuildDialogState.col}${undoBuildDialogState.row}`}
          buildCost={undoBuildDialogState.buildCost}
          onConfirm={handleUndoBuild}
          onCancel={handleUndoBuildCancel}
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
            <Button type="button" onClick={handleConfirmDiscardProperty}>
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
