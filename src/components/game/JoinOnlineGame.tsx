import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { GameState } from '@/lib/types'
import type { PartyBoardSyncConfig } from '@/lib/partyBoardSync'
import {
  mergePublicAndPrivateHand,
  type PrivateHandPayload,
  type PublicGameState,
} from '@/lib/onlinePublicState'
import {
  boardTopic,
  getDeviceConnectionId,
  getRealtimeClient,
  isOnlineConfigured,
  normalizeRoomCode,
} from '@/lib/realtimeClient'
import { CaretLeft, SignIn } from '@phosphor-icons/react'

const inputClass =
  'w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-sky-400/60 focus:bg-white/10'

const JOIN_TIMEOUT_MS = 45_000
const JOIN_RETRY_MS = 2_000

/**
 * Guest entry point: connects to the room's board channel, asks the host
 * authority for a snapshot, hydrates the local board, then hands off to
 * GameApp's live sync (which re-requests with the same device id).
 */
export function JoinOnlineGame({
  onJoined,
  onCancel,
}: {
  onJoined: (state: GameState, cfg: PartyBoardSyncConfig) => void
  onCancel: () => void
}) {
  const [displayName, setDisplayName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [phase, setPhase] = useState<'form' | 'joining'>('form')
  const [error, setError] = useState<string | null>(null)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const retryRef = useRef<number | null>(null)
  const publicRef = useRef<PublicGameState | null>(null)
  const handRef = useRef<PrivateHandPayload | null>(null)
  const doneRef = useRef(false)
  const myIdRef = useRef<string | null>(null)

  const clearJoinTimers = () => {
    if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
    if (retryRef.current != null) window.clearInterval(retryRef.current)
    timeoutRef.current = null
    retryRef.current = null
  }

  useEffect(() => {
    return () => {
      clearJoinTimers()
      const client = getRealtimeClient()
      if (channelRef.current && client) void client.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [])

  const finishJoin = (roomId: string, name: string) => {
    if (doneRef.current) return
    const pub = publicRef.current
    if (!pub) return
    doneRef.current = true
    clearJoinTimers()

    const hand = handRef.current
    const viewerId = hand?.playerId ?? null
    const state = mergePublicAndPrivateHand(pub, viewerId, hand)

    const client = getRealtimeClient()
    if (channelRef.current && client) void client.removeChannel(channelRef.current)
    channelRef.current = null

    onJoined(state, {
      roomId,
      myConnectionId: getDeviceConnectionId(),
      displayName: name,
      role: 'guest',
    })
  }

  const requestSnapshot = (ch: RealtimeChannel, from: string, seatName: string) => {
    void ch.send({
      type: 'broadcast',
      event: 'board',
      payload: {
        kind: 'game_request',
        from,
        displayName: seatName.trim() || undefined,
      },
    })
  }

  const startJoin = () => {
    const client = getRealtimeClient()
    const roomId = normalizeRoomCode(roomCode)
    const name = displayName.trim()
    if (!client || !roomId || !name) return

    clearJoinTimers()
    setError(null)
    setPhase('joining')
    doneRef.current = false
    publicRef.current = null
    handRef.current = null

    const myId = getDeviceConnectionId()
    myIdRef.current = myId
    const ch = client.channel(boardTopic(roomId), { config: { broadcast: { self: false } } })
    channelRef.current = ch

    ch.on('broadcast', { event: 'board' }, ({ payload }) => {
      const msg = payload as { kind?: string; to?: string } & Record<string, unknown>
      if (!msg || typeof msg !== 'object') return
      if (msg.kind === 'public_state' || msg.kind === 'action_applied') {
        if (msg.kind === 'public_state' && msg.to && msg.to !== myId) return
        publicRef.current = msg.state as PublicGameState
        // Give a targeted private_hand a beat to arrive before hydrating.
        window.setTimeout(() => finishJoin(roomId, name), 350)
      } else if (msg.kind === 'private_hand' && msg.to === myId) {
        handRef.current = msg.hand as PrivateHandPayload
      }
    })

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        requestSnapshot(ch, myId, name)
        retryRef.current = window.setInterval(() => {
          if (doneRef.current) return
          requestSnapshot(ch, myIdRef.current ?? myId, name)
        }, JOIN_RETRY_MS)
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearJoinTimers()
        setError('Could not reach the room. Check your connection and try again.')
        setPhase('form')
      }
    })

    timeoutRef.current = window.setTimeout(() => {
      if (doneRef.current) return
      clearJoinTimers()
      const client2 = getRealtimeClient()
      if (channelRef.current && client2) void client2.removeChannel(channelRef.current)
      channelRef.current = null
      setError(
        'No live table found for that room code. On the host computer: finish table setup and click Start game, then try again. Double-check the room code matches exactly.'
      )
      setPhase('form')
    }, JOIN_TIMEOUT_MS)
  }

  if (!isOnlineConfigured()) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0a0a0f] p-6">
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/60 px-8 py-9 text-center shadow-[0_0_60px_rgba(0,0,0,0.6)] backdrop-blur-md">
          <h2 className="m-0 mb-3 text-xl font-semibold text-slate-100">Online play not configured</h2>
          <p className="m-0 mb-7 text-sm leading-relaxed text-slate-400">
            Add <span className="text-sky-200">VITE_SUPABASE_URL</span> and{' '}
            <span className="text-sky-200">VITE_SUPABASE_ANON_KEY</span> to your{' '}
            <span className="text-sky-200">.env</span> (see .env.example), then restart.
          </p>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-2 rounded-full border border-sky-400/35 bg-sky-500/15 px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-sky-100 transition hover:border-sky-400/55 hover:bg-sky-500/25"
          >
            <CaretLeft size={14} weight="bold" />
            Back
          </button>
        </div>
      </div>
    )
  }

  const canJoin = displayName.trim().length > 0 && normalizeRoomCode(roomCode).length >= 3

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0a0f] p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/60 px-8 py-9 shadow-[0_0_60px_rgba(0,0,0,0.6)] backdrop-blur-md">
        <h2 className="m-0 mb-2 text-center text-xl font-semibold text-slate-100">Join online game</h2>
        <p className="m-0 mb-6 text-center text-sm leading-relaxed text-slate-400">
          Enter the host’s room code and the name they seated you under. The host must have clicked{' '}
          <span className="text-slate-200">Start game</span> before you join.
        </p>
        {error && (
          <p className="m-0 mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Your name
        </label>
        <input
          className={`${inputClass} mb-4`}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="must match your seat name"
          maxLength={24}
          disabled={phase === 'joining'}
        />
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Room code
        </label>
        <input
          className={`${inputClass} mb-6`}
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value)}
          placeholder="from the host"
          maxLength={48}
          disabled={phase === 'joining'}
        />
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:bg-white/10"
          >
            <CaretLeft size={14} weight="bold" />
            Back
          </button>
          <button
            type="button"
            disabled={!canJoin || phase === 'joining'}
            onClick={startJoin}
            className="inline-flex items-center gap-2 rounded-full border border-sky-400/35 bg-sky-500/15 px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-sky-100 transition enabled:hover:border-sky-400/55 enabled:hover:bg-sky-500/25 disabled:opacity-40"
          >
            <SignIn size={14} weight="bold" />
            {phase === 'joining' ? 'Joining…' : 'Join game'}
          </button>
        </div>
      </div>
    </div>
  )
}
