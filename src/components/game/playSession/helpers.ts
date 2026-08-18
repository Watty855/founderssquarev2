'use client'

import type { CardFlight } from '@/components/game/CardFlightLayer'
import { handCardAnchorKey } from '@/components/game/PlayerHand'
import { actionCards, propertyCards } from '@/lib/cardData'
import type { ActionCard, CardInstance, PropertyCard } from '@/lib/cardTypes'
import { createInitialBoard } from '@/lib/boardData'
import type { FlightRect } from '@/hooks/use-flight-anchors'
import { hasResumableHostAuthority } from '@/lib/onlineAuthorityMemory'
import { loadLastOnlineSession } from '@/lib/onlineSessionMemory'
import type { PartyBoardSyncConfig } from '@/lib/partyBoardSync'
import { getDeviceConnectionId } from '@/lib/realtimeClient'
import { gameDockToast as toast } from '@/lib/fsGameToast'
import { replenishCurrentPlayerActionHand } from '@/lib/turnActions'
import { resolveActionPlayId } from '@/lib/actionWildCard'
import type { GameState, Plot } from '@/lib/types'

export function isAiSeat(p: { isAi?: boolean; aiDifficulty?: unknown } | null | undefined): boolean {
  return p?.isAi === true || p?.aiDifficulty != null
}

export const initialGameState: GameState = {
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

export function countResolvedActionStepsInBatch(
  actionInstanceIds: string[],
  actionCardsInHand: CardInstance[],
  emulateActionId?: string | null
): number {
  let n = 0
  for (const instanceId of actionInstanceIds) {
    const instance = actionCardsInHand.find((c) => c.instanceId === instanceId)
    if (!instance) continue
    const playedId = resolveActionPlayId(instance.cardId, emulateActionId)
    if (playedId === 'roll-die') {
      n += 1
      continue
    }
    const card = actionCards.find((c) => c.id === playedId)
    if (!card) continue
    if (
      card.id === 'income' ||
      card.id === 'city-council-freeze' ||
      card.id === 'rezoning' ||
      card.id === 'discard-property-cards'
    )
      continue
    n += 1
  }
  return n
}

export function withReplenishedActionHand(gameState: GameState, playerIndex: number): GameState {
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

export function sumInvestmentBookForPlayer(plots: Plot[], investorId: number): number {
  let s = 0
  for (const p of plots) {
    p.investmentStripes?.forEach((t) => {
      if (t.investorId === investorId) s += t.contributionMillion
    })
  }
  return s
}

let cardFlightCounter = 0
export const nextCardFlightId = (): string => `flight-${++cardFlightCounter}`

/** Sentinel action-instance id for the online council-freeze defense dialog (card already spent). */
export const REMOTE_COUNCIL_FREEZE_DEFENSE_ID = 'remote-council-freeze-defense'
export const REMOTE_REBUTTAL_ROLL_ID = 'remote-rebuttal-roll'
/** Max cards animated from deck per state tick — matches turn replenish (2 action cards). */
export const MAX_DRAW_FLIGHTS_PER_TICK = 2

export function makeDrawFlight(
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

export const HAND_DRAW_DURATION_SEC = 1
export const HAND_DRAW_STAGGER_MS = 140
export const REPLENISH_DRAW_STAGGER_MS = 220

export function resolveHandDrawTargetRect(
  getRect: (key: string) => FlightRect | null,
  playerId: number,
  instanceId: string,
  sectionRect: FlightRect | null
): FlightRect | null {
  return getRect(handCardAnchorKey(playerId, instanceId)) ?? sectionRect
}

export function isSinglePlayerVersusBots(players: { isAi?: boolean }[]): boolean {
  const humans = players.filter((p) => !p.isAi).length
  const bots = players.filter((p) => p.isAi === true).length
  return humans === 1 && bots >= 1
}

export function makeDiscardFlight(
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

export function restoreHostOnlineConfig(): PartyBoardSyncConfig | null {
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
