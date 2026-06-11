import { useState } from 'react'
import type { HelloProfile } from '@/lib/partyLobbyTypes'
import { usePartySeatPlanRoom } from '@/lib/usePartySeatPlanRoom'
import {
  generateRoomCode,
  getDeviceConnectionId,
  isOnlineConfigured,
  normalizeRoomCode,
} from '@/lib/realtimeClient'
import { ArrowsClockwise, CaretLeft, Play, UsersThree } from '@phosphor-icons/react'

interface MultiplayerLobbyProps {
  onBack: () => void
  onSessionReady: (opts: {
    roomId: string
    displayName: string
    connectionId: string
    profile: HelloProfile
  }) => void
}

/** Kept for compatibility with older lobby links. */
export const COMMUNITY_ROOM_SLUG = 'community-lobby'

const inputClass =
  'w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-sky-400/60 focus:bg-white/10'

/**
 * Online room lobby over Supabase Realtime. Everyone enters the same room code,
 * sees the live roster via presence, then the host continues into table setup
 * where roster members are seated.
 */
export function MultiplayerLobby({ onBack, onSessionReady }: MultiplayerLobbyProps) {
  const [displayName, setDisplayName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [joined, setJoined] = useState(false)

  const roomId = normalizeRoomCode(roomCode)
  const party = usePartySeatPlanRoom({
    roomId,
    displayName,
    enabled: joined && roomId.length > 0,
  })

  if (!isOnlineConfigured()) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0a0a0f] p-6">
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/60 px-8 py-9 text-center shadow-[0_0_60px_rgba(0,0,0,0.6)] backdrop-blur-md">
          <h2 className="m-0 mb-3 text-xl font-semibold text-slate-100">Online play not configured</h2>
          <p className="m-0 mb-7 text-sm leading-relaxed text-slate-400">
            Live multiplayer uses Supabase Realtime. Add <span className="text-sky-200">VITE_SUPABASE_URL</span>{' '}
            and <span className="text-sky-200">VITE_SUPABASE_ANON_KEY</span> to your{' '}
            <span className="text-sky-200">.env</span> (see .env.example), then restart. Pass-and-play and
            single player work without it.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-sky-400/35 bg-sky-500/15 px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-sky-100 transition hover:border-sky-400/55 hover:bg-sky-500/25"
          >
            <CaretLeft size={14} weight="bold" />
            Back
          </button>
        </div>
      </div>
    )
  }

  const canEnter = displayName.trim().length > 0 && roomId.length >= 3

  if (!joined) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0a0a0f] p-6">
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/60 px-8 py-9 shadow-[0_0_60px_rgba(0,0,0,0.6)] backdrop-blur-md">
          <h2 className="m-0 mb-2 text-center text-xl font-semibold text-slate-100">Online room</h2>
          <p className="m-0 mb-6 text-center text-sm leading-relaxed text-slate-400">
            Share one room code — everyone who enters it sees the table live.
          </p>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Your name
          </label>
          <input
            className={`${inputClass} mb-4`}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Ada"
            maxLength={24}
          />
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Room code
          </label>
          <div className="mb-6 flex gap-2">
            <input
              className={inputClass}
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="enter or generate"
              maxLength={48}
            />
            <button
              type="button"
              onClick={() => setRoomCode(generateRoomCode())}
              title="Generate a fresh room code"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-semibold text-slate-200 transition hover:border-sky-400/50 hover:bg-sky-500/15"
            >
              <ArrowsClockwise size={14} weight="bold" />
              New
            </button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:bg-white/10"
            >
              <CaretLeft size={14} weight="bold" />
              Back
            </button>
            <button
              type="button"
              disabled={!canEnter}
              onClick={() => setJoined(true)}
              className="inline-flex items-center gap-2 rounded-full border border-sky-400/35 bg-sky-500/15 px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-sky-100 transition enabled:hover:border-sky-400/55 enabled:hover:bg-sky-500/25 disabled:opacity-40"
            >
              <UsersThree size={14} weight="bold" />
              Enter room
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0a0f] p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/60 px-8 py-9 shadow-[0_0_60px_rgba(0,0,0,0.6)] backdrop-blur-md">
        <p className="m-0 mb-1 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Room code — share with your founders
        </p>
        <p className="m-0 mb-5 text-center text-2xl font-bold tracking-[0.25em] text-sky-200">{roomId}</p>
        <div className="mb-5 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {party.status === 'connected'
              ? `In the room (${party.roster.length})`
              : party.status === 'error'
                ? 'Connection problem — retrying…'
                : 'Connecting…'}
          </p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {party.roster.map((p) => (
              <li key={p.connectionId} className="flex items-center gap-2 text-sm text-slate-200">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                {p.displayName}
                {p.connectionId === party.myConnectionId && (
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">(you)</span>
                )}
              </li>
            ))}
            {party.roster.length === 0 && <li className="text-sm text-slate-500">Waiting for players…</li>}
          </ul>
        </div>
        <p className="m-0 mb-6 text-center text-xs leading-relaxed text-slate-500">
          The host continues to table setup and seats everyone here. Guests can also use “Join online
          game” from the title screen once the host’s table is live.
        </p>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setJoined(false)}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:bg-white/10"
          >
            <CaretLeft size={14} weight="bold" />
            Back
          </button>
          <button
            type="button"
            disabled={party.status !== 'connected'}
            onClick={() =>
              onSessionReady({
                roomId,
                displayName: displayName.trim(),
                connectionId: party.myConnectionId ?? getDeviceConnectionId(),
                profile: {},
              })
            }
            className="inline-flex items-center gap-2 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-100 transition enabled:hover:border-emerald-400/55 enabled:hover:bg-emerald-500/25 disabled:opacity-40"
          >
            <Play size={14} weight="bold" />
            Continue to setup
          </button>
        </div>
      </div>
    </div>
  )
}
