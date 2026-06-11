import type { HelloProfile, LobbyPlayer, SeatPlanEntry } from '@/lib/partyLobbyTypes'

export type SeatPlanBroadcast = {
  revision: number
  seats: SeatPlanEntry[]
  updatedByConnectionId: string | null
}

/** v2 local stub — no lobby server. Always idle; seat plans are device-local. */
export function usePartySeatPlanRoom(_opts: {
  roomId: string
  displayName: string
  enabled: boolean
  profile?: HelloProfile | null
}) {
  return {
    status: 'idle' as 'idle' | 'connecting' | 'connected' | 'error',
    roster: [] as LobbyPlayer[],
    seatPlan: null as SeatPlanBroadcast | null,
    myConnectionId: null as string | null,
    proposeSeatPlan: (_seats: SeatPlanEntry[]) => {},
    requestSeatPlan: () => {},
  }
}
