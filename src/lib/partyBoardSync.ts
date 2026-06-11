import type { GameState } from '@/lib/types'

export type PartyBoardRole = 'host' | 'guest'

/** Passed when the host finishes setup — drives PartyKit board snapshots. */
export type PartyBoardSyncMeta = {
  roomId: string
  myConnectionId: string
  displayName: string
}

export type PartyBoardSyncConfig = PartyBoardSyncMeta & { role: PartyBoardRole }

/** Loose validation before replacing local React state from the wire. */
export function parsePartyGameState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.players) || !Array.isArray(o.plots)) return null
  if (o.isSetupComplete !== true) return null
  return raw as GameState
}
