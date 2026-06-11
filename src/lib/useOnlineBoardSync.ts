import type { Dispatch, SetStateAction } from 'react'
import type { GameState } from '@/lib/types'
import type { PartyBoardSyncConfig } from '@/lib/partyBoardSync'
import type { GameAction, GameEvent } from '@/lib/onlineGameActions'

export type SendActionOptions = { skipOptimistic?: boolean }

/**
 * v2 local stub — PartyKit/Colyseus removed. All play is on-device (single player
 * vs bots, or pass-and-play multiplayer). A future online backend (e.g. Supabase
 * Realtime) can re-implement this hook with the same return shape; GameApp only
 * activates online branches when `config` is non-null, which never happens in v2.
 */
export function useOnlineBoardSync(_params: {
  config: PartyBoardSyncConfig | null
  gameState: GameState
  setGameState: Dispatch<SetStateAction<GameState>>
  resolveSeatPlayerId?: (gs: GameState, boardConnectionId: string | null) => number | null
  onAuthoritySnapshotApplied?: () => void
  onGameEvents?: (events: GameEvent[]) => void
}) {
  return {
    sendGameClear: () => {},
    boardPartyConnectionId: null as string | null,
    sendAction: (_action: GameAction, _opts?: SendActionOptions) => '' as string,
    isOnline: false,
  }
}
