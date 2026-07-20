import type { HelloProfile } from '@/lib/partyLobbyTypes'
import type { PartyBoardSyncConfig } from '@/lib/partyBoardSync'
import type { GameState } from '@/lib/types'
import { resolveGuestSeatForRemap } from '@/lib/partySeatIds'
import { redactGameStateForGuestView } from '@/lib/partyBoardView'
import { usePartySeatPlanRoom } from '@/lib/usePartySeatPlanRoom'
import { useWaitForHostGame } from '@/lib/useWaitForHostGame'
import { getDeviceConnectionId } from '@/lib/realtimeClient'
import { CaretLeft, Hourglass, UsersThree } from '@phosphor-icons/react'

export type GuestOnlineSession = {
  roomId: string
  displayName: string
  connectionId?: string
  profile?: HelloProfile
  role: 'guest'
}

/**
 * Pre-start guest room: join the lobby roster, wait for the host to seat you
 * and click Start game, then auto-enter the live table.
 */
export function GuestWaitingRoom({
  session,
  onGameStarted,
  onBack,
}: {
  session: GuestOnlineSession
  onGameStarted: (state: GameState, cfg: PartyBoardSyncConfig) => void
  onBack: () => void
}) {
  const party = usePartySeatPlanRoom({
    roomId: session.roomId,
    displayName: session.displayName,
    enabled: true,
    profile: session.profile ?? null,
  })

  const seatedName = session.displayName.trim()
  const seatPlan = party.seatPlan?.seats ?? []
  const seated = seatPlan.some(
    (s) => !s.isAi && s.displayName.trim().toLowerCase() === seatedName.toLowerCase()
  )

  const { status: boardStatus } = useWaitForHostGame({
    roomId: session.roomId,
    displayName: session.displayName,
    enabled: party.status === 'connected',
    onReady: (gs) => {
      const cfg: PartyBoardSyncConfig = {
        roomId: session.roomId,
        myConnectionId: party.myConnectionId ?? session.connectionId ?? getDeviceConnectionId(),
        displayName: seatedName,
        role: 'guest',
      }
      const seat = resolveGuestSeatForRemap(gs, cfg.displayName)
      onGameStarted(seat ? redactGameStateForGuestView(gs, seat.id) : gs, cfg)
    },
  })

  const waitLabel =
    party.hostStarting
      ? 'Host is starting the game…'
      : boardStatus === 'joining'
      ? 'Entering the table…'
      : boardStatus === 'waiting'
        ? seated
          ? 'You are seated — waiting for the host to start…'
          : 'In the room — ask the host to seat you from the Party roster, then start'
        : boardStatus === 'error'
          ? 'Connection problem — check your network'
          : 'Connecting to the room…'

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0a0f] p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/60 px-8 py-9 shadow-[0_0_60px_rgba(0,0,0,0.6)] backdrop-blur-md">
        <p className="m-0 mb-1 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Room code
        </p>
        <p className="m-0 mb-5 text-center text-2xl font-bold tracking-[0.25em] text-sky-200">{session.roomId}</p>

        <div className="mb-4 flex items-center justify-center gap-2 text-sm text-amber-200/90">
          <Hourglass size={18} weight="duotone" className="animate-pulse" />
          {waitLabel}
        </div>

        <div className="mb-5 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="m-0 mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            <UsersThree size={14} />
            Founders in room ({party.roster.length})
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
          </ul>
        </div>

        {seatPlan.length > 0 && (
          <div className="mb-5 rounded-xl border border-sky-400/20 bg-sky-500/10 px-4 py-3">
            <p className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200/80">
              Host seat table
            </p>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-slate-200">
              {seatPlan.map((s, i) => (
                <li key={`${s.displayName}-${i}`}>
                  {s.displayName}
                  {s.isAi ? ' (bot)' : ''}
                  {!s.isAi && s.displayName.trim().toLowerCase() === seatedName.toLowerCase() ? ' ← you' : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="m-0 mb-6 text-center text-xs leading-relaxed text-slate-500">
          If the host already started, you will re-enter the live table automatically — use the{' '}
          <span className="text-slate-300">same room code</span> and{' '}
          <span className="text-slate-300">same seat name</span>. Otherwise you enter when they click{' '}
          <span className="text-slate-300">Start game</span>.
        </p>

        <button
          type="button"
          onClick={onBack}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:bg-white/10"
        >
          <CaretLeft size={14} weight="bold" />
          Leave room
        </button>
      </div>
    </div>
  )
}
