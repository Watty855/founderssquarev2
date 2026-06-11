import type { GameState, Player } from '@/lib/types'

/**
 * Lobby hooks and board-sync each open their own PartySocket, so PartyKit assigns a NEW connection id
 * (`_pk`/PartyKit Connection id). Seat plans still carry the lobby-era id — remap them once the sync
 * socket id is known (host knows old id via PartyBoard meta; guests match founder name).
 */

function founderDisplayMatchesPlayer(displayNameGuess: string, playerName: string): boolean {
  const ng = displayNameGuess.trim().toLowerCase()
  const pn = playerName.trim().toLowerCase()
  if (!ng || !pn) return false
  if (pn === ng) return true
  if (ng.length >= 3 && pn.includes(ng)) return true
  if (pn.length >= 3 && ng.includes(pn)) return true
  return false
}

/** Resolve which game row corresponds to this joiner's display name ("Dash" ↔ "Player Dash"). */
export function resolveGuestSeatForRemap(gs: GameState, founderDisplayName: string): Player | null {
  const humans = gs.players.filter((p) => p.isAi !== true && Boolean(p.partySeatConnectionId))
  if (humans.length === 0) return null

  const ng = founderDisplayName.trim().toLowerCase()
  if (!ng) return humans.length === 1 ? (humans[0] ?? null) : null

  const exact = humans.find((p) => p.name.trim().toLowerCase() === ng)
  if (exact) return exact

  if (ng.length >= 3) {
    const fuzzy = humans.filter((p) => founderDisplayMatchesPlayer(founderDisplayName, p.name))
    if (fuzzy.length === 1) return fuzzy[0] ?? null
  }

  return humans.length === 1 ? (humans[0] ?? null) : null
}

/** True when seat `cp` is the founders row controlled from this join tab (never matches a different human mid-turn). */
export function guestSeatMatchesBrowserTab(
  cp: Player,
  boardConnectionId: string,
  joinerDisplayName: string,
  gameState: GameState
): boolean {
  if (cp.isAi === true) return false
  const sid = String(cp.partySeatConnectionId ?? '').trim()
  const bid = boardConnectionId.trim()
  if (bid && sid === bid) return true

  const seat = resolveGuestSeatForRemap(gameState, joinerDisplayName)
  return seat != null && seat.id === cp.id
}

export function remapSeatPlanPartySocketIds(opts: {
  gameState: GameState
  role: 'host' | 'guest'
  lobbyConnectionId: string
  boardSocketConnectionId: string
  founderDisplayName: string
}): GameState | null {
  const { gameState: gs, role, lobbyConnectionId, boardSocketConnectionId, founderDisplayName } = opts

  let fromLobbyId = lobbyConnectionId.trim()
  const toBoardId = boardSocketConnectionId.trim()
  if (!fromLobbyId || !toBoardId || fromLobbyId === toBoardId) return null

  if (role === 'guest') {
    const seat = resolveGuestSeatForRemap(gs, founderDisplayName)
    if (!seat?.partySeatConnectionId) return null
    fromLobbyId = seat.partySeatConnectionId
  }

  if (fromLobbyId === toBoardId) return null

  const changed = gs.players.some((p) => p.partySeatConnectionId === fromLobbyId)
  if (!changed) return null

  return {
    ...gs,
    players: gs.players.map((p) =>
      p.partySeatConnectionId === fromLobbyId ? { ...p, partySeatConnectionId: toBoardId } : p
    ),
  }
}
