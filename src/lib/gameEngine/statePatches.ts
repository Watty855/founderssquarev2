import type { GameState, Plot } from '@/lib/types'
import { checkForNineSequentialProperties } from '@/lib/utils'

export function clearCouncilFreezeIfEndingPlayer(
  current: GameState,
  finishingPlayerIndex: number
): Partial<GameState> {
  const finisherId = current.players[finishingPlayerIndex]?.id
  if (finisherId != null && current.councilFreezeBlockBuildForPlayerId === finisherId) {
    return { councilFreezeBlockBuildForPlayerId: undefined }
  }
  return {}
}

export function buildEndGameTriggerPatch(
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

export function applyFinalRoundCountdown(current: GameState): {
  gameEnded?: true
  finalRoundTurnsRemaining?: number
} {
  if (current.finalRoundTurnsRemaining === undefined) return {}
  const next = current.finalRoundTurnsRemaining - 1
  if (next <= 0) return { gameEnded: true, finalRoundTurnsRemaining: 0 }
  return { finalRoundTurnsRemaining: next }
}
