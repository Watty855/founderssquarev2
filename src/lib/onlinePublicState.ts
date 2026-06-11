import type { GameState, Player } from '@/lib/types'

/** Board-visible player row — no private cards. */
export type PublicPlayerState = Omit<Player, 'actionCards' | 'propertyCards' | 'peerHandCounts'> & {
  peerHandCounts: { actions: number; properties: number }
}

/** Authoritative board JSON broadcast to every seat (hands redacted). */
export type PublicGameState = Omit<
  GameState,
  'players' | 'newCardsDrawn' | 'showNewCardsAnimation'
> & {
  players: PublicPlayerState[]
  /** Only included when the draw targets the acting seat this rev (optional UI hint). */
  newCardsDrawnPlayerId?: number
  showNewCardsAnimation?: boolean
}

export type PrivateHandPayload = {
  playerId: number
  actionCards: Player['actionCards']
  propertyCards: Player['propertyCards']
  newCardsDrawn?: GameState['newCardsDrawn']
  showNewCardsAnimation?: boolean
}

export function toPublicGameState(gs: GameState): PublicGameState {
  const actingId = gs.players[gs.currentPlayerIndex]?.id
  const { newCardsDrawn, showNewCardsAnimation, players, ...rest } = gs
  return {
    ...rest,
    players: players.map((p) => {
      const { actionCards, propertyCards, peerHandCounts: _pc, ...pub } = p
      return {
        ...pub,
        peerHandCounts: {
          actions: actionCards.length,
          properties: propertyCards.length,
        },
      }
    }),
    ...(newCardsDrawn && newCardsDrawn.length > 0 && actingId != null
      ? { newCardsDrawnPlayerId: actingId, showNewCardsAnimation: showNewCardsAnimation === true }
      : {}),
  }
}

export function mergePublicAndPrivateHand(
  pub: PublicGameState,
  viewerPlayerId: number | null,
  hand: PrivateHandPayload | null
): GameState {
  const { newCardsDrawnPlayerId, showNewCardsAnimation, players: pubPlayers, ...rest } = pub
  const players: Player[] = pubPlayers.map((pp) => {
    const { peerHandCounts, ...base } = pp
    if (viewerPlayerId != null && pp.id === viewerPlayerId && hand) {
      return {
        ...base,
        actionCards: hand.actionCards,
        propertyCards: hand.propertyCards,
      }
    }
    return {
      ...base,
      actionCards: [],
      propertyCards: [],
      peerHandCounts,
    }
  })

  const viewerGetsDraw =
    viewerPlayerId != null &&
    newCardsDrawnPlayerId === viewerPlayerId &&
    hand?.newCardsDrawn != null

  return {
    ...rest,
    players,
    newCardsDrawn: viewerGetsDraw ? hand!.newCardsDrawn : undefined,
    showNewCardsAnimation: viewerGetsDraw ? showNewCardsAnimation : false,
  }
}
