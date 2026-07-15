import type { GameState, Player } from '@/lib/types'
import type { CardInstance } from '@/lib/cardTypes'

/** Board-visible player row — no private cards. */
export type PublicPlayerState = Omit<Player, 'actionCards' | 'propertyCards' | 'peerHandCounts'> & {
  peerHandCounts: { actions: number; properties: number }
}

/**
 * Authoritative board JSON broadcast to every seat (hands redacted).
 * Draw piles may be omitted on the wire (`decksOmitted`) — clients keep their
 * last known decks until a hydrate or deck-changing rev includes them again.
 */
export type PublicGameState = Omit<
  GameState,
  'players' | 'newCardsDrawn' | 'showNewCardsAnimation' | 'actionDeck' | 'propertyDeck'
> & {
  players: PublicPlayerState[]
  actionDeck: CardInstance[]
  propertyDeck: CardInstance[]
  /** When true, receivers must preserve previously known draw piles. */
  decksOmitted?: boolean
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

export type ToPublicGameStateOptions = {
  /** Include action/property draw piles (hydrate / deck mutations). Default false on the wire. */
  includeDecks?: boolean
}

export function deckFingerprint(gs: Pick<GameState, 'actionDeck' | 'propertyDeck' | 'actionDiscard' | 'propertyDiscard'>): string {
  return [
    gs.actionDeck.length,
    gs.propertyDeck.length,
    gs.actionDiscard.length,
    gs.propertyDiscard.length,
    gs.actionDeck[0]?.instanceId ?? '',
    gs.propertyDeck[0]?.instanceId ?? '',
    gs.actionDiscard[gs.actionDiscard.length - 1]?.instanceId ?? '',
    gs.propertyDiscard[gs.propertyDiscard.length - 1]?.instanceId ?? '',
  ].join('|')
}

export function toPublicGameState(gs: GameState, opts: ToPublicGameStateOptions = {}): PublicGameState {
  const includeDecks = opts.includeDecks === true
  const actingId = gs.players[gs.currentPlayerIndex]?.id
  const { newCardsDrawn, showNewCardsAnimation, players, actionDeck, propertyDeck, ...rest } = gs
  return {
    ...rest,
    actionDeck: includeDecks ? actionDeck : [],
    propertyDeck: includeDecks ? propertyDeck : [],
    ...(includeDecks ? {} : { decksOmitted: true as const }),
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
 * When `decksOmitted`, keep draw piles from `previous` if provided.
 */
export function mergePublicAndPrivateHands(
  pub: PublicGameState,
  viewerPlayerId: number | null,
  hands: PrivateHandPayload[],
  previous?: Pick<GameState, 'actionDeck' | 'propertyDeck'> | null
): GameState {
  const { newCardsDrawnPlayerId, showNewCardsAnimation, players: pubPlayers, decksOmitted, ...rest } =
    pub
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

  const actionDeck =
    decksOmitted && previous ? previous.actionDeck : (pub.actionDeck ?? previous?.actionDeck ?? [])
  const propertyDeck =
    decksOmitted && previous
      ? previous.propertyDeck
      : (pub.propertyDeck ?? previous?.propertyDeck ?? [])

  return {
    ...rest,
    actionDeck,
    propertyDeck,
    players,
    newCardsDrawn: viewerGetsDraw ? viewerHand!.newCardsDrawn : undefined,
    showNewCardsAnimation: viewerGetsDraw ? showNewCardsAnimation : false,
  }
}
