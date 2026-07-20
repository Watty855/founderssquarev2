import { useState } from 'react'
import type { HelloProfile } from '@/lib/partyLobbyTypes'
import { usePartySeatPlanRoom } from '@/lib/usePartySeatPlanRoom'
import {
  generateRoomCode,
  getDeviceConnectionId,
  isOnlineConfigured,
  normalizeRoomCode,
} from '@/lib/realtimeClient'
import { ArrowsClockwise, CaretLeft, Crown, Hourglass, UsersThree } from '@phosphor-icons/react'

export type OnlineLobbyRole = 'host' | 'guest'

export type OnlineSessionReadyMeta = {
  roomId: string
  displayName: string
  connectionId: string
  profile: HelloProfile
  role: OnlineLobbyRole
}

interface MultiplayerLobbyProps {
  onBack: () => void
  /** When set, the post-enter screen highlights host vs join (from title screen). */
  suggestedRole?: OnlineLobbyRole
  /** Prefill from a previous seat (Leave table → Rejoin). */
  initialDisplayName?: string
  initialRoomCode?: string
  onSessionReady: (opts: OnlineSessionReadyMeta) => void
}

/** Kept for compatibility with older lobby links. */
export const COMMUNITY_ROOM_SLUG = 'community-lobby'

const inputClass =
  'w-full rounded-2xl border border-white/15 bg-white/5 px-6 py-5 text-2xl text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-sky-400/60 focus:bg-white/10'

/**
 * Online room lobby over Supabase Realtime. Everyone enters the same room code
 * and sees the live roster. Hosts configure the table; guests wait until Start.
 */
export function MultiplayerLobby({
  onBack,
  suggestedRole,
  initialDisplayName,
  initialRoomCode,
  onSessionReady,
}: MultiplayerLobbyProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName?.trim() ?? '')
  const [roomCode, setRoomCode] = useState(initialRoomCode?.trim() ?? '')
  const [joined, setJoined] = useState(false)

  const roomId = normalizeRoomCode(roomCode)
  const party = usePartySeatPlanRoom({
    roomId,
    displayName,
    enabled: joined && roomId.length > 0,
  })

  const enterSession = (role: OnlineLobbyRole) => {
    onSessionReady({
      roomId,
      displayName: displayName.trim(),
      connectionId: party.myConnectionId ?? getDeviceConnectionId(),
      profile: {},
      role,
    })
  }

  if (!isOnlineConfigured()) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0a0a0f] p-6">
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/60 px-8 py-9 text-center shadow-[0_0_60px_rgba(0,0,0,0.6)] backdrop-blur-md">
          <h2 className="m-0 mb-3 text-xl font-semibold text-slate-100">Online play not configured</h2>
          <p className="m-0 mb-7 text-sm leading-relaxed text-slate-400">
            Live multiplayer uses Supabase Realtime. Add <span className="text-sky-200">VITE_SUPABASE_URL</span>{' '}
            and <span className="text-sky-200">VITE_SUPABASE_ANON_KEY</span> to your{' '}
            <span className="text-sky-200">.env</span> (see .env.example), then restart.
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
  const connected = party.status === 'connected'

  if (!joined) {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-[#0a0a0f] p-6">
        <div className="w-full max-w-3xl rounded-3xl border border-white/15 bg-black/60 px-10 py-12 shadow-[0_0_60px_rgba(0,0,0,0.6)] backdrop-blur-md sm:px-16">
          <h2 className="m-0 mb-4 text-center text-5xl font-semibold text-slate-100">Online room</h2>
          <p className="m-0 mb-10 text-center text-2xl leading-relaxed text-slate-400">
            {suggestedRole === 'guest'
              ? 'Enter the host’s room code and your seat name. You can rejoin a game already in progress with the same code and name.'
              : 'Share one room code. Hosts set up the table; guests join and wait before Start game.'}
          </p>
          <label className="mb-2 block text-lg font-semibold uppercase tracking-[0.14em] text-slate-400">
            Your name
          </label>
          <input
            className={`${inputClass} mb-7`}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Ada"
            maxLength={24}
          />
          <label className="mb-2 block text-lg font-semibold uppercase tracking-[0.14em] text-slate-400">
            Room code
          </label>
          <div className="mb-10 flex gap-3">
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
              className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 text-lg font-semibold text-slate-200 transition hover:border-sky-400/50 hover:bg-sky-500/15"
            >
              <ArrowsClockwise size={22} weight="bold" />
              New
            </button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-9 py-5 text-lg font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:bg-white/10"
            >
              <CaretLeft size={22} weight="bold" />
              Back
            </button>
            <button
              type="button"
              disabled={!canEnter}
              onClick={() => setJoined(true)}
              className="inline-flex items-center gap-3 rounded-full border border-sky-400/35 bg-sky-500/15 px-10 py-5 text-lg font-semibold uppercase tracking-[0.12em] text-sky-100 transition enabled:hover:border-sky-400/55 enabled:hover:bg-sky-500/25 disabled:opacity-40"
            >
              <UsersThree size={22} weight="bold" />
              Enter room
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-[#0a0a0f] p-6">
      <div className="w-full max-w-3xl rounded-3xl border border-white/15 bg-black/60 px-10 py-12 shadow-[0_0_60px_rgba(0,0,0,0.6)] backdrop-blur-md sm:px-16">
        <p className="m-0 mb-3 text-center text-2xl font-semibold uppercase tracking-[0.18em] text-slate-400">
          Room code — share with your founders
        </p>
        <p className="m-0 mb-8 text-center text-6xl font-bold tracking-[0.25em] text-sky-200 sm:text-7xl">{roomId}</p>
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 px-7 py-6">
          <p className="m-0 mb-4 text-lg font-semibold uppercase tracking-[0.14em] text-slate-400">
            {connected ? `In the room (${party.roster.length})` : party.status === 'error' ? 'Connection problem…' : 'Connecting…'}
          </p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {party.roster.map((p) => (
              <li key={p.connectionId} className="flex items-center gap-3 text-2xl text-slate-200">
                <span className="inline-block h-3.5 w-3.5 rounded-full bg-emerald-400" />
                {p.displayName}
                {p.connectionId === party.myConnectionId && (
                  <span className="text-base uppercase tracking-wide text-slate-500">(you)</span>
                )}
              </li>
            ))}
            {party.roster.length === 0 && <li className="text-2xl text-slate-500">Waiting for players…</li>}
          </ul>
        </div>
        <p className="m-0 mb-8 text-center text-xl leading-relaxed text-slate-500">
          <strong className="text-slate-300">Guests</strong> should join here before the host starts. The host seats
          everyone from the Party roster, then clicks Start game.
        </p>
        <div className="flex flex-col gap-4">
          <button
            type="button"
            disabled={!connected}
            onClick={() => enterSession('guest')}
            className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-sky-400/35 bg-sky-500/15 px-8 py-5 text-xl font-semibold uppercase tracking-[0.12em] text-sky-100 transition enabled:hover:border-sky-400/55 enabled:hover:bg-sky-500/25 disabled:opacity-40"
          >
            <Hourglass size={26} weight="bold" />
            Join and wait
          </button>
          <button
            type="button"
            disabled={!connected}
            onClick={() => enterSession('host')}
            className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-8 py-5 text-xl font-semibold uppercase tracking-[0.12em] text-emerald-100 transition enabled:hover:border-emerald-400/55 enabled:hover:bg-emerald-500/25 disabled:opacity-40"
          >
            <Crown size={26} weight="bold" />
            Host this table
          </button>
        </div>
        <button
          type="button"
          onClick={() => setJoined(false)}
          className="mt-7 inline-flex w-full items-center justify-center gap-3 rounded-full border border-white/15 bg-white/5 px-8 py-4 text-lg font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:bg-white/10"
        >
          <CaretLeft size={22} weight="bold" />
          Back
        </button>
      </div>
    </div>
  )
}
