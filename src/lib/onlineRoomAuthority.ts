import type { GameState } from '@/lib/types'
import type { GameAction, GameEvent } from '@/lib/onlineGameActions'
import { applyGameAction } from '@/lib/gameEngine/applyGameAction'
import { parsePartyGameState } from '@/lib/partyBoardSync'
import { findHostSeatIndexForConnection } from '@/lib/partyBoardView'
import { buildPrivateHandForPlayer } from '@/lib/partyGameBroadcast'
import { toPublicGameState, type PublicGameState, deckFingerprint } from '@/lib/onlinePublicState'
import type { PrivateHandPayload } from '@/lib/onlinePublicState'

/**
 * In-memory game authority — transport agnostic. In v2 it runs on the HOST
 * device: guests send actions over the realtime channel, the host validates
 * them with the rules engine and broadcasts authoritative state back.
 */
export type OnlineAuthorityStore = {
  gameRev: number
  gameHostId: string | null
  gameStateJson: string | null
}

export function createAuthorityStore(): OnlineAuthorityStore {
  return { gameRev: 0, gameHostId: null, gameStateJson: null }
}

export function authorityIsLive(store: OnlineAuthorityStore): boolean {
  return store.gameHostId != null && store.gameStateJson != null
}

export function authorityLoadState(store: OnlineAuthorityStore): GameState | null {
  if (!store.gameStateJson) return null
  try {
    return parsePartyGameState(JSON.parse(store.gameStateJson) as unknown)
  } catch {
    return null
  }
}

export function authoritySaveState(store: OnlineAuthorityStore, gs: GameState) {
  store.gameStateJson = JSON.stringify(gs)
}

export type AuthorityOutbound =
  | { target: 'all'; type: 'public_state'; rev: number; state: PublicGameState }
  | {
      target: 'all'
      type: 'action_applied'
      rev: number
      actionId: string
      /** State ships once via `public_state` — keep empty to avoid duplicate payloads. */
      events: GameEvent[]
    }
  | { target: 'all'; type: 'game_cleared' }
  | { target: 'client'; sessionId: string; type: 'public_state'; rev: number; state: PublicGameState }
  | { target: 'client'; sessionId: string; type: 'private_hand'; rev: number; hand: PrivateHandPayload }
  | {
      target: 'client'
      sessionId: string
      type: 'action_rejected'
      actionId: string
      rev: number
      error: string
      code?: string
    }
  | { target: 'client'; sessionId: string; type: 'system'; text: string }

export function authorityHydrateForClient(
  store: OnlineAuthorityStore,
  sessionId: string
): AuthorityOutbound[] {
  const gs = authorityLoadState(store)
  if (!gs || store.gameHostId == null) return []
  const out: AuthorityOutbound[] = [
    {
      target: 'client',
      sessionId,
      type: 'public_state',
      rev: store.gameRev,
      state: toPublicGameState(gs, { includeDecks: true }),
    },
  ]
  const idx = findHostSeatIndexForConnection(gs, sessionId)
  if (idx >= 0) {
    const hand = buildPrivateHandForPlayer(gs, idx)
    if (hand) {
      out.push({
        target: 'client',
        sessionId,
        type: 'private_hand',
        rev: store.gameRev,
        hand,
      })
    }
  }
  return out
}

export function authorityBroadcastAfterState(
  store: OnlineAuthorityStore,
  gs: GameState,
  meta?: { actionId?: string; events?: GameEvent[]; includeDecks?: boolean }
): AuthorityOutbound[] {
  const includeDecks = meta?.includeDecks === true
  const pub = toPublicGameState(gs, { includeDecks })
  const out: AuthorityOutbound[] = [
    { target: 'all', type: 'public_state', rev: store.gameRev, state: pub },
  ]
  if (meta?.actionId != null) {
    out.push({
      target: 'all',
      type: 'action_applied',
      rev: store.gameRev,
      actionId: meta.actionId,
      events: meta.events ?? [],
    })
  }
  for (const sessionId of authorityListHumanSessionIds(gs)) {
    const idx = findHostSeatIndexForConnection(gs, sessionId)
    if (idx < 0) continue
    const hand = buildPrivateHandForPlayer(gs, idx)
    if (hand) {
      out.push({
        target: 'client',
        sessionId,
        type: 'private_hand',
        rev: store.gameRev,
        hand,
      })
    }
  }
  // The host device drives AI seats, so it needs their real hands locally.
  if (store.gameHostId) {
    for (let idx = 0; idx < gs.players.length; idx++) {
      if (!gs.players[idx]?.isAi) continue
      const hand = buildPrivateHandForPlayer(gs, idx, { includeAi: true })
      if (hand) {
        out.push({
          target: 'client',
          sessionId: store.gameHostId,
          type: 'private_hand',
          rev: store.gameRev,
          hand,
        })
      }
    }
  }
  return out
}

function authorityListHumanSessionIds(gs: GameState): string[] {
  const ids = new Set<string>()
  for (const p of gs.players) {
    if (p.isAi) continue
    const cid = String(p.partySeatConnectionId ?? '').trim()
    if (cid) ids.add(cid)
  }
  return [...ids]
}

export function authorityApplyGameAction(
  store: OnlineAuthorityStore,
  action: GameAction,
  senderSessionId: string,
  actionId: string
):
  | { ok: true; state: GameState; messages: AuthorityOutbound[] }
  | { ok: false; error: string; code?: string } {
  const gs = authorityLoadState(store)
  if (!gs) {
    return { ok: false, error: 'No active game in this room.', code: 'no_game' }
  }
  const result = applyGameAction(gs, action, {
    senderConnectionId: senderSessionId,
    senderIsHost: senderSessionId === store.gameHostId,
  })
  if (!result.ok) {
    return { ok: false, error: result.error, code: result.code }
  }
  const prevFp = deckFingerprint(gs)
  const nextFp = deckFingerprint(result.state)
  store.gameRev += 1
  authoritySaveState(store, result.state)
  const messages = authorityBroadcastAfterState(store, result.state, {
    actionId,
    events: result.events,
    includeDecks: prevFp !== nextFp,
  })
  return { ok: true, state: result.state, messages }
}

export function authorityInitGame(
  store: OnlineAuthorityStore,
  hostSessionId: string,
  rawState: unknown
):
  | { ok: true; state: GameState; messages: AuthorityOutbound[] }
  | { ok: false; error: string } {
  if (store.gameHostId != null && store.gameHostId !== hostSessionId) {
    return {
      ok: false,
      error: 'A board session is already active for this room — open Join online game or use a fresh room code.',
    }
  }
  const parsed = parsePartyGameState(rawState)
  if (!parsed) return { ok: false, error: 'Invalid board snapshot.' }
  try {
    const raw = JSON.stringify(parsed)
    if (raw.length > 6_000_000) return { ok: false, error: 'Board snapshot too large to sync.' }
    store.gameHostId = hostSessionId
    store.gameRev = 1
    store.gameStateJson = raw
  } catch {
    return { ok: false, error: 'Invalid board snapshot.' }
  }
  const messages = authorityBroadcastAfterState(store, parsed, { includeDecks: true })
  return { ok: true, state: parsed, messages }
}

export function authorityClearGame(store: OnlineAuthorityStore, hostSessionId: string): boolean {
  if (store.gameHostId !== hostSessionId) return false
  store.gameHostId = null
  store.gameRev = 0
  store.gameStateJson = null
  return true
}
