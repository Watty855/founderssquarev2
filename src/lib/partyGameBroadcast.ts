import type { GameState } from '@/lib/types'
import type { PrivateHandPayload } from '@/lib/onlinePublicState'

export function buildPrivateHandForPlayer(
  gs: GameState,
  playerIndex: number,
  opts?: { includeAi?: boolean }
): PrivateHandPayload | null {
  const p = gs.players[playerIndex]
  if (!p || (p.isAi && opts?.includeAi !== true)) return null
  const actingId = gs.players[gs.currentPlayerIndex]?.id
  return {
    playerId: p.id,
    actionCards: p.actionCards,
    propertyCards: p.propertyCards,
    ...(actingId === p.id && gs.newCardsDrawn?.length
      ? { newCardsDrawn: gs.newCardsDrawn, showNewCardsAnimation: gs.showNewCardsAnimation === true }
      : {}),
  }
}
