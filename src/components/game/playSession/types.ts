'use client'

import type { MutableRefObject, SetStateAction } from 'react'
import type { SimpleAiTurnHandlers, SimpleAiTurnUi } from '@/lib/bot/simpleAiTurn'
import type { FlightRect } from '@/hooks/use-flight-anchors'
import type { ConfrontationKind, ConfrontationOutcome } from '@/lib/confrontationNotice'
import type { GameAction, BoardFx } from '@/lib/onlineGameActions'
import type { SendActionOptions } from '@/lib/useOnlineBoardSync'
import type { PartyBoardSyncConfig } from '@/lib/partyBoardSync'
import type { CalamityAcceptPending, RollDieDialogState } from '@/lib/playUiStore'
import type { GameState, Player, Plot } from '@/lib/types'

export type PlaySession = {
  safeGameState: GameState
  setGameState: (valueOrUpdater: GameState | ((current: GameState) => GameState)) => void
  patchGameState: (updater: SetStateAction<GameState>) => void
  isOnlineActor: boolean
  sendAction: (action: GameAction, opts?: SendActionOptions) => void
  broadcastBoardFx: (fx: BoardFx, opts?: { localEcho?: boolean }) => void
  broadcastDiceRollNotice: (title: string, detail?: string, sound?: BoardFx['sound']) => void
  announceConfrontation: (
    kind: ConfrontationKind,
    attackerName: string,
    targetName: string,
    outcome: ConfrontationOutcome,
    detail: string,
    sound?: BoardFx['sound'],
    titleOverride?: string
  ) => void
  announceConfrontationAttempt: (
    kind: ConfrontationKind,
    attackerName: string,
    targetName: string,
    detail: string,
    sound?: BoardFx['sound'],
    titleOverride?: string
  ) => void
  getPlotAt: (row: number, col: string) => Plot | undefined
  getFlightRect: (key: string) => FlightRect | null
  isSpectator: boolean
  partyBoardConfig: PartyBoardSyncConfig | null
  partyBoardSeatPlayer: Player | null
  nudgeTurnAdvanceForSpentBudget: () => void
  scheduleEndOfTurn: () => void
  rollDieDialogStateRef: MutableRefObject<RollDieDialogState>
  calamityAcceptPendingRef: MutableRefObject<CalamityAcceptPending | null>
  calamityCommitInFlightRef: MutableRefObject<boolean>
  aiGsRef: MutableRefObject<GameState | null>
  aiCpRef: MutableRefObject<Player | null>
  aiUiRef: MutableRefObject<SimpleAiTurnUi | null>
  aiHooksRef: MutableRefObject<SimpleAiTurnHandlers>
  setPartyBoardConfig: (cfg: PartyBoardSyncConfig | null) => void
  flushAuthorityPersist: () => void
  sendGameClear: () => void
  handInteractionsActive: boolean
}

export type CalamitySettledInfo = {
  face: number
  variant: { key: string; title: string; flavor: string }
}
