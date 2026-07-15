import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  mergePublicAndPrivateHand,
  type PrivateHandPayload,
  type PublicGameState,
} from '@/lib/onlinePublicState'
import type { GameState } from '@/lib/types'
import {
  boardTopic,
  getDeviceConnectionId,
  getRealtimeClient,
  normalizeRoomCode,
} from '@/lib/realtimeClient'

const POLL_MS = 2_000

/**
 * Guest-side listener: stays on the board channel and polls the host for a
 * snapshot until the host clicks Start game and the authority goes live.
 */
export function useWaitForHostGame(opts: {
  roomId: string
  displayName: string
  enabled: boolean
  onReady: (state: GameState) => void
}) {
  const { roomId, displayName, enabled, onReady } = opts
  const [status, setStatus] = useState<'idle' | 'connecting' | 'waiting' | 'joining' | 'error'>('idle')

  const channelRef = useRef<RealtimeChannel | null>(null)
  const pollRef = useRef<number | null>(null)
  const doneRef = useRef(false)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  const roomKey = enabled ? `${normalizeRoomCode(roomId)}|${displayName.trim()}` : ''

  useEffect(() => {
    doneRef.current = false
    if (pollRef.current != null) window.clearInterval(pollRef.current)
    pollRef.current = null

    const client = getRealtimeClient()
    const room = normalizeRoomCode(roomId)
    if (!enabled || !room || !displayName.trim() || !client) {
      setStatus('idle')
      return
    }

    setStatus('connecting')
    const myId = getDeviceConnectionId()
    let publicSnap: PublicGameState | null = null
    let handSnap: PrivateHandPayload | null = null

    const finish = () => {
      if (doneRef.current || !publicSnap) return
      doneRef.current = true
      if (pollRef.current != null) window.clearInterval(pollRef.current)
      pollRef.current = null
      setStatus('joining')
      const viewerId = handSnap?.playerId ?? null
      const state = mergePublicAndPrivateHand(publicSnap, viewerId, handSnap)
      onReadyRef.current(state)
    }

    const requestSnapshot = (ch: RealtimeChannel) => {
      void ch.send({
        type: 'broadcast',
        event: 'board',
        payload: { kind: 'game_request', from: myId },
      })
    }

    const ch = client.channel(boardTopic(room), { config: { broadcast: { self: false } } })
    channelRef.current = ch

    ch.on('broadcast', { event: 'board' }, ({ payload }) => {
      const msg = payload as { kind?: string; to?: string; state?: PublicGameState; hand?: PrivateHandPayload }
      if (!msg || typeof msg !== 'object') return
      if (msg.kind === 'public_state' || msg.kind === 'action_applied') {
        publicSnap = msg.state ?? null
        window.setTimeout(finish, 350)
      } else if (msg.kind === 'private_hand' && msg.to === myId) {
        handSnap = msg.hand ?? null
      }
    })

    ch.subscribe((sub) => {
      if (sub === 'SUBSCRIBED') {
        setStatus('waiting')
        requestSnapshot(ch)
        pollRef.current = window.setInterval(() => {
          if (doneRef.current) return
          requestSnapshot(ch)
        }, POLL_MS)
      } else if (sub === 'CHANNEL_ERROR' || sub === 'TIMED_OUT') {
        setStatus('error')
      }
    })

    return () => {
      if (pollRef.current != null) window.clearInterval(pollRef.current)
      pollRef.current = null
      void client.removeChannel(ch)
      if (channelRef.current === ch) channelRef.current = null
    }
  }, [roomKey, roomId, displayName, enabled])

  return { status }
}
