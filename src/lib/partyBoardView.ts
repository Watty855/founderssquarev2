import type { GameState, Player } from '@/lib/types'
import { resolveGuestSeatForRemap } from '@/lib/partySeatIds'
import type { PartyBoardSyncConfig } from '@/lib/partyBoardSync'

/** Shown on other founders' sidebar rows when their real hands are withheld on this device. */
export type PeerHandCounts = { actions: number; properties: number }

export function findHostSeatIndexForConnection(host: GameState, connectionId: string): number {
  const cid = connectionId.trim()
  if (!cid) return -1
  return host.players.findIndex((p) => p.isAi !== true && String(p.partySeatConnectionId ?? '').trim() === cid)
}

/**
 * Apply a remote human's relayed snapshot on the host without wiping other players' private hands.
 * Guests only ever send redacted peers (empty arrays); public board fields still come from relay.
 */
export function mergeRelayedGuestSnapshot(
  hostState: GameState,
  senderConnectionId: string,
  relayState: GameState
): GameState | null {
  const sender = senderConnectionId.trim()
  if (!sender) return null

  let senderIdx = findHostSeatIndexForConnection(hostState, sender)
  const relayActing = relayState.players[relayState.currentPlayerIndex]
  if (!relayActing || relayActing.isAi) return null

  if (senderIdx < 0) {
    senderIdx = hostState.players.findIndex((p) => !p.isAi && p.id === relayActing.id)
  }
  if (senderIdx < 0) return null

  const players = relayState.players.map((relayP, idx) => {
    if (idx === senderIdx) {
      return {
        ...relayP,
        partySeatConnectionId: sender,
      }
    }
    const hostP = hostState.players[idx]
    if (!hostP) return relayP
    return {
      ...relayP,
      actionCards: hostP.actionCards,
      propertyCards: hostP.propertyCards,
      peerHandCounts: undefined,
    }
  })

  return { ...relayState, players }
}

/** Strip other humans' hands before applying a broadcast snapshot on a joiner's device. */
export function redactGameStateForGuestView(gs: GameState, viewerPlayerId: number): GameState {
  return {
    ...gs,
    players: gs.players.map((p) => {
      if (p.id === viewerPlayerId) {
        const { peerHandCounts: _pc, ...rest } = p
        return rest
      }
      return {
        ...p,
        actionCards: [],
        propertyCards: [],
        peerHandCounts: {
          actions: p.actionCards.length,
          properties: p.propertyCards.length,
        },
      }
    }),
    newCardsDrawn:
      gs.players[gs.currentPlayerIndex]?.id === viewerPlayerId ? gs.newCardsDrawn : undefined,
    showNewCardsAnimation:
      gs.players[gs.currentPlayerIndex]?.id === viewerPlayerId ? gs.showNewCardsAnimation : false,
  }
}

export function resolveViewerPlayerId(
  gs: GameState,
  cfg: PartyBoardSyncConfig | null,
  seatPlayer: Player | null
): number | null {
  if (!cfg || cfg.role !== 'guest') return null
  if (seatPlayer != null) return seatPlayer.id
  return resolveGuestSeatForRemap(gs, cfg.displayName)?.id ?? null
}
