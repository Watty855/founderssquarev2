import type { HelloProfile } from '@/lib/partyLobbyTypes'
import { CaretLeft } from '@phosphor-icons/react'

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

/**
 * v2 stub — the PartyKit lobby (chat, voice, seat plan) was removed. Online
 * matchmaking returns with the mobile backend; this screen explains and offers Back.
 */
export function MultiplayerLobby({ onBack, onSessionReady: _onSessionReady }: MultiplayerLobbyProps) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0a0f] p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/60 px-8 py-9 text-center shadow-[0_0_60px_rgba(0,0,0,0.6)] backdrop-blur-md">
        <h2 className="m-0 mb-3 text-xl font-semibold text-slate-100">Online lobby coming soon</h2>
        <p className="m-0 mb-7 text-sm leading-relaxed text-slate-400">
          Online rooms are being rebuilt for the mobile app. Until then, gather around one device
          for pass-and-play multiplayer, or take on the bots solo.
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
