import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { HelloProfile, LobbyPlayer, SeatPlanEntry } from '@/lib/partyLobbyTypes'
import { getDeviceConnectionId, getRealtimeClient, lobbyTopic } from '@/lib/realtimeClient'

export type SeatPlanBroadcast = {
  revision: number
  seats: SeatPlanEntry[]
  updatedByConnectionId: string | null
}

type LobbyWire =
  | { kind: 'seat_plan'; revision: number; seats: SeatPlanEntry[]; updatedByConnectionId: string | null }
  | { kind: 'seat_plan_request'; from: string }
  | { kind: 'game_starting'; hostName?: string }

type PresencePayload = {
  displayName: string
  languageTag?: string
  countryCode?: string
  translationInChat?: boolean
}

/**
 * Live lobby room over Supabase Realtime: presence drives the roster, broadcast
 * carries seat-plan sync. Last-write-wins by revision; the most recent proposer
 * answers `seat_plan_request` so late joiners hydrate instantly.
 */
export function usePartySeatPlanRoom(opts: {
  roomId: string
  displayName: string
  enabled: boolean
  profile?: HelloProfile | null
}) {
  const { roomId, displayName, enabled, profile } = opts

  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [roster, setRoster] = useState<LobbyPlayer[]>([])
  const [seatPlan, setSeatPlan] = useState<SeatPlanBroadcast | null>(null)
  const [myConnectionId, setMyConnectionId] = useState<string | null>(null)
  const [hostStarting, setHostStarting] = useState(false)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const seatPlanRef = useRef<SeatPlanBroadcast | null>(null)
  seatPlanRef.current = seatPlan
  const myIdRef = useRef<string | null>(null)

  const profileKey = JSON.stringify(profile ?? {})

  useEffect(() => {
    const client = getRealtimeClient()
    if (!enabled || !roomId.trim() || !client) {
      setStatus('idle')
      setRoster([])
      setMyConnectionId(null)
      return
    }

    const myId = getDeviceConnectionId()
    myIdRef.current = myId
    setStatus('connecting')

    const ch = client.channel(lobbyTopic(roomId), {
      config: { presence: { key: myId }, broadcast: { self: false } },
    })
    channelRef.current = ch

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<PresencePayload>()
      const players: LobbyPlayer[] = Object.entries(state).map(([connectionId, metas]) => {
        const meta = metas[0]
        return {
          connectionId,
          displayName: meta?.displayName || 'Founder',
          languageTag: meta?.languageTag,
          countryCode: meta?.countryCode,
          translationInChat: meta?.translationInChat,
        }
      })
      players.sort((a, b) => a.displayName.localeCompare(b.displayName))
      setRoster(players)
    })

    ch.on('broadcast', { event: 'lobby' }, ({ payload }) => {
      const msg = payload as LobbyWire | undefined
      if (!msg || typeof msg !== 'object') return
      if (msg.kind === 'seat_plan') {
        const current = seatPlanRef.current
        if (!current || msg.revision > current.revision) {
          setSeatPlan({
            revision: msg.revision,
            seats: msg.seats,
            updatedByConnectionId: msg.updatedByConnectionId,
          })
        }
        return
      }
      if (msg.kind === 'seat_plan_request') {
        const current = seatPlanRef.current
        if (current && current.updatedByConnectionId === myIdRef.current) {
          void ch.send({
            type: 'broadcast',
            event: 'lobby',
            payload: { kind: 'seat_plan', ...current } satisfies LobbyWire,
          })
        }
        return
      }
      if (msg.kind === 'game_starting') {
        setHostStarting(true)
      }
    })

    ch.subscribe(async (subStatus) => {
      if (subStatus === 'SUBSCRIBED') {
        setStatus('connected')
        setMyConnectionId(myId)
        const prof = (profile ?? {}) as HelloProfile
        await ch.track({
          displayName: displayName.trim() || 'Founder',
          languageTag: prof.languageTag,
          countryCode: prof.countryCode,
          translationInChat: prof.translationInChat,
        } satisfies PresencePayload)
        // Hydrate any existing seat plan from the room.
        void ch.send({
          type: 'broadcast',
          event: 'lobby',
          payload: { kind: 'seat_plan_request', from: myId } satisfies LobbyWire,
        })
      } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') {
        setStatus('error')
      } else if (subStatus === 'CLOSED') {
        setStatus('idle')
      }
    })

    return () => {
      void client.removeChannel(ch)
      if (channelRef.current === ch) channelRef.current = null
      setRoster([])
      setMyConnectionId(null)
      setStatus('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomId, displayName, profileKey])

  const proposeSeatPlan = useCallback((seats: SeatPlanEntry[]) => {
    const ch = channelRef.current
    const myId = myIdRef.current
    if (!ch || !myId) return
    const next: SeatPlanBroadcast = {
      revision: Math.max(Date.now(), (seatPlanRef.current?.revision ?? 0) + 1),
      seats,
      updatedByConnectionId: myId,
    }
    setSeatPlan(next)
    void ch.send({
      type: 'broadcast',
      event: 'lobby',
      payload: { kind: 'seat_plan', ...next } satisfies LobbyWire,
    })
  }, [])

  const requestSeatPlan = useCallback(() => {
    const ch = channelRef.current
    const myId = myIdRef.current
    if (!ch || !myId) return
    void ch.send({
      type: 'broadcast',
      event: 'lobby',
      payload: { kind: 'seat_plan_request', from: myId } satisfies LobbyWire,
    })
  }, [])

  const signalGameStarting = useCallback((hostName?: string) => {
    const ch = channelRef.current
    if (!ch) return
    void ch.send({
      type: 'broadcast',
      event: 'lobby',
      payload: { kind: 'game_starting', hostName } satisfies LobbyWire,
    })
  }, [])

  return {
    status,
    roster,
    seatPlan,
    myConnectionId,
    hostStarting,
    proposeSeatPlan,
    requestSeatPlan,
    signalGameStarting,
  }
}
