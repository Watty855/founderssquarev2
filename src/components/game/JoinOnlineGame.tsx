import type { GameState } from '@/lib/types'
import type { PartyBoardSyncConfig } from '@/lib/partyBoardSync'
import { CaretLeft } from '@phosphor-icons/react'

/**
 * v2 stub — networked join flow removed with PartyKit/Colyseus. Online play will
 * return via the mobile backend; until then this screen explains and offers Back.
 */
export function JoinOnlineGame({
  onJoined: _onJoined,
  onCancel,
}: {
  onJoined: (state: GameState, cfg: PartyBoardSyncConfig) => void
  onCancel: () => void
}) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0a0f] p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/60 px-8 py-9 text-center shadow-[0_0_60px_rgba(0,0,0,0.6)] backdrop-blur-md">
        <h2 className="m-0 mb-3 text-xl font-semibold text-slate-100">Online play is on the way</h2>
        <p className="m-0 mb-7 text-sm leading-relaxed text-slate-400">
          Cross-device online matches are coming to the Founders Square mobile app. For now, play
          single player against bots or pass-and-play multiplayer on this device.
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
