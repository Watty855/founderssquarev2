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
  return mergePublicAndPrivateHands(pub, viewerPlayerId, hand ? [hand] : [])
}

/**
 * Merge every private hand this device is entitled to (its own seat, plus AI
 * seats when this device is the host driving them) into the public snapshot.
 */
export function mergePublicAndPrivateHands(
  pub: PublicGameState,
  viewerPlayerId: number | null,
  hands: PrivateHandPayload[]
): GameState {
  const { newCardsDrawnPlayerId, showNewCardsAnimation, players: pubPlayers, ...rest } = pub
  const handsById = new Map(hands.map((h) => [h.playerId, h]))
  const players: Player[] = pubPlayers.map((pp) => {
    const { peerHandCounts, ...base } = pp
    const hand = handsById.get(pp.id)
    if (hand && (pp.isAi === true || (viewerPlayerId != null && pp.id === viewerPlayerId))) {
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

  const viewerHand = viewerPlayerId != null ? handsById.get(viewerPlayerId) : undefined
  const viewerGetsDraw =
    viewerPlayerId != null &&
    newCardsDrawnPlayerId === viewerPlayerId &&
    viewerHand?.newCardsDrawn != null

  return {
    ...rest,
    players,
    newCardsDrawn: viewerGetsDraw ? viewerHand!.newCardsDrawn : undefined,
    showNewCardsAnimation: viewerGetsDraw ? showNewCardsAnimation : false,
  }
}
