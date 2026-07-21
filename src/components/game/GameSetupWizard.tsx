'use client'

import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { Player, PLAYER_COLORS, type GameState } from '@/lib/types'
import type { HelloProfile, SeatPlanEntry } from '@/lib/partyLobbyTypes'
import {
  manualLayoutToSeatPlan,
  rosterPlusBotsToSeatPlan,
  seatPlanColorsUnique,
  seatPlanToPlayers,
} from '@/lib/onlineSeatPlan'
import type { PartyBoardSyncMeta, PartyBoardSyncConfig } from '@/lib/partyBoardSync'
import { getDeviceConnectionId, normalizeRoomCode } from '@/lib/realtimeClient'
import { loadLastOnlineSession } from '@/lib/onlineSessionMemory'
import {
  hasResumableHostAuthority,
  loadAuthoritySnapshot,
} from '@/lib/onlineAuthorityMemory'
import { parsePartyGameState } from '@/lib/partyBoardSync'
import { usePartySeatPlanRoom } from '@/lib/usePartySeatPlanRoom'
import { PlayerSetup } from '@/components/game/PlayerSetup'
import { MultiplayerLobby, type OnlineLobbyRole } from '@/components/game/MultiplayerLobby'
import { GuestWaitingRoom } from '@/components/game/GuestWaitingRoom'
import {
  CaretLeft,
  Play,
  BookOpen,
  User,
  Globe,
  UsersThree,
  Robot,
  Minus,
  Plus,
  ArrowsClockwise,
  PlugsConnected,
  Crown,
} from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

export type SetupWizardPhase = 'opening' | 'mode' | 'multiplayer' | 'lobby' | 'guest-waiting' | 'local'

type GameMode = 'single' | 'online' | 'local'

type AiDifficulty = 'easy' | 'normal' | 'hard'

type AiSlot = {
  name: string
  color: string
  difficulty: AiDifficulty
}

function pickDistinctColors(used: Set<string>, need: number): string[] {
  const out: string[] = []
  for (const c of PLAYER_COLORS) {
    if (out.length >= need) break
    if (!used.has(c.value)) out.push(c.value)
  }
  return out
}

function OpeningScreen({
  onPlayOnline,
  onNewGame,
  onJoinFriendsGame,
  onRejoinLastRoom,
  onResumeHostTable,
  lastRoomLabel,
  resumeHostLabel,
}: {
  onPlayOnline: () => void
  onNewGame: () => void
  /** Join online flow from the Online card (“Join game”) — hydrate from host snapshot + PartyKit seat id. */
  onJoinFriendsGame?: () => void
  /** Resume a previous online seat (same room code + seat name). */
  onRejoinLastRoom?: () => void
  /** Host: resume a mid-game table saved on this device. */
  onResumeHostTable?: () => void
  lastRoomLabel?: string
  resumeHostLabel?: string
}) {
  const gold = '#c9a85c'
  const goldLight = '#e8d4a0'
  const goldDark = '#8a6b2e'
  const navy = '#1a2d4a'
  const navyDeep = '#0f1a2e'
  const cream = '#f5ecd7'
  const panelBg = 'rgba(32, 22, 14, 0.88)'

  const actionBtnBase: CSSProperties = {
    width: '100%',
    height: 38,
    borderRadius: 5,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    fontFamily: 'Georgia, "Times New Roman", serif',
    transition: 'filter 0.15s ease, transform 0.15s ease',
    whiteSpace: 'nowrap',
    padding: '0 8px',
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        overflow: 'hidden',
        backgroundColor: navyDeep,
      }}
    >
      {/* Full-width cover art — center framing keeps family + player bar visible */}
      <img
        src="/founders-square-cover.png"
        alt="Founders Square — Strategy Game. Build your legacy."
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center center',
        }}
      />

      {/* Light right-edge vignette only — leaves center artwork clear */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(90deg, transparent 0%, transparent 55%, rgba(15,20,32,0.25) 78%, rgba(20,14,10,0.55) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Action panel — right margin, compact */}
      <div
        style={{
          position: 'absolute',
          right: 'max(10px, env(safe-area-inset-right))',
          top: '50%',
          transform: 'translateY(-42%)',
          width: 'clamp(148px, 22vw, 200px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            padding: '10px 10px 12px',
            borderRadius: 8,
            border: `1px solid ${goldDark}`,
            background: panelBg,
            boxShadow: `inset 0 1px 0 ${goldLight}33, 0 4px 20px rgba(0,0,0,0.4)`,
          }}
        >
          <div
            style={{
              height: 2,
              marginBottom: 10,
              background: `linear-gradient(90deg, transparent, ${gold}, ${goldLight}, transparent)`,
              opacity: 0.85,
            }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              type="button"
              onClick={onPlayOnline}
              style={{
                ...actionBtnBase,
                height: 40,
                border: `1px solid ${goldLight}`,
                background: `linear-gradient(180deg, ${goldLight} 0%, ${gold} 45%, ${goldDark} 100%)`,
                color: navyDeep,
                boxShadow: `0 3px 10px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.35)`,
              }}
            >
              <Globe size={16} weight="duotone" color={navyDeep} />
              Play online
            </button>

            {onJoinFriendsGame ? (
              <button
                type="button"
                onClick={onJoinFriendsGame}
                style={{
                  ...actionBtnBase,
                  fontSize: 9,
                  letterSpacing: '0.08em',
                  border: `1px solid ${gold}`,
                  background: `linear-gradient(180deg, ${navy} 0%, ${navyDeep} 100%)`,
                  color: cream,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
              >
                <PlugsConnected size={15} weight="duotone" color={goldLight} />
                Join friend&apos;s game
              </button>
            ) : null}

            {onResumeHostTable && resumeHostLabel ? (
              <button
                type="button"
                onClick={onResumeHostTable}
                style={{
                  ...actionBtnBase,
                  fontSize: 9,
                  letterSpacing: '0.08em',
                  border: `1px solid rgba(74, 222, 128, 0.55)`,
                  background: 'rgba(6, 78, 59, 0.55)',
                  color: '#d1fae5',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
              >
                <Crown size={15} weight="duotone" color="#86efac" />
                Resume table {resumeHostLabel}
              </button>
            ) : null}

            {onRejoinLastRoom && lastRoomLabel ? (
              <button
                type="button"
                onClick={onRejoinLastRoom}
                style={{
                  ...actionBtnBase,
                  fontSize: 9,
                  letterSpacing: '0.08em',
                  border: `1px solid rgba(125, 211, 252, 0.55)`,
                  background: 'rgba(14, 116, 144, 0.35)',
                  color: '#e0f2fe',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
              >
                <ArrowsClockwise size={15} weight="duotone" color="#7dd3fc" />
                Rejoin {lastRoomLabel}
              </button>
            ) : null}

            <button
              type="button"
              onClick={onNewGame}
              style={{
                ...actionBtnBase,
                fontSize: 9,
                letterSpacing: '0.08em',
                border: `1px solid ${goldDark}`,
                background: 'rgba(26, 45, 74, 0.55)',
                color: goldLight,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              Play on this device
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModeSelectScreen({
  onBack,
  onPick,
  onJoinOnlineAsGuest,
  deviceOnly,
}: {
  onBack: () => void
  onPick: (m: GameMode) => void
  onJoinOnlineAsGuest?: () => void
  /** True after "Play on this device" — hide Online (that path uses Play online on the title screen). */
  deviceOnly?: boolean
}) {
  const cards: { mode: GameMode; title: string; desc: string; Icon: typeof User }[] = [
    {
      mode: 'single',
      title: 'Single player',
      desc: 'Play against AI',
      Icon: User,
    },
    {
      mode: 'online',
      title: 'Online',
      desc: 'Join or create an online game with other founders',
      Icon: Globe,
    },
    {
      mode: 'local',
      title: 'Pass and play',
      desc: 'Same screen — take turns with friends',
      Icon: UsersThree,
    },
  ]

  const visibleCards = deviceOnly ? cards.filter((c) => c.mode !== 'online') : cards

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'linear-gradient(180deg, #64748b 0%, #94a3b8 40%, #cbd5e1 100%)',
        display: 'flex',
        flexDirection: 'column',
        padding: 24,
        overflow: 'auto',
      }}
    >
      <button
        type="button"
        onClick={onBack}
        style={{
          alignSelf: 'flex-start',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 40,
          padding: '0 18px',
          borderRadius: 10,
          border: '1px solid rgba(15,23,42,0.12)',
          backgroundColor: 'rgba(15,23,42,0.75)',
          color: '#f8fafc',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
          cursor: 'pointer',
          marginBottom: 16,
        }}
      >
        <CaretLeft size={18} weight="bold" />
        Back
      </button>

      <div
        style={{
          alignSelf: 'center',
          marginBottom: 28,
          padding: '10px 28px',
          backgroundColor: '#fff',
          borderRadius: 4,
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.06em',
            color: '#0f172a',
          }}
        >
          {deviceOnly ? 'PLAY ON THIS DEVICE' : 'SELECT A GAME MODE'}
        </span>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
          justifyContent: 'center',
          alignContent: 'center',
          maxWidth: 1100,
          margin: '0 auto',
        }}
      >
        {visibleCards.map(({ mode: cardMode, title, desc, Icon }) => {
          if (cardMode === 'online') {
            return (
              <div
                key={cardMode}
                style={{
                  width: 260,
                  borderRadius: 16,
                  padding: 0,
                  background: '#fff',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    height: 140,
                    position: 'relative',
                    background: 'linear-gradient(145deg, #e2e8f0 0%, #f1f5f9 100%)',
                  }}
                >
                  <button
                    type="button"
                    aria-label="Create or host an online game"
                    onClick={() => onPick('online')}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      border: 'none',
                      cursor: 'pointer',
                      background: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Globe size={56} weight="duotone" color="#64748b" />
                  </button>
                  {onJoinOnlineAsGuest ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onJoinOnlineAsGuest()
                      }}
                      aria-label="Join friend's online table"
                      title="Enter room code and wait for the host to start"
                      style={{
                        position: 'absolute',
                        bottom: 10,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 2,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: 9999,
                        border: '1px solid rgba(15,23,42,0.12)',
                        background: 'rgba(255,255,255,0.94)',
                        color: '#0f172a',
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase' as const,
                        cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
                      }}
                    >
                      <PlugsConnected size={16} weight="bold" color="#0f6ebe" aria-hidden />
                      Join game
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onPick('online')}
                  style={{
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    padding: 0,
                    margin: 0,
                    background: 'transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    font: 'inherit',
                    color: 'inherit',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 14px',
                      background: 'linear-gradient(90deg, #c81b3a 0%, #a01630 100%)',
                      color: '#fff',
                    }}
                  >
                    <Globe size={22} weight="bold" color="#fff" />
                    <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em' }}>
                      {title.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ margin: 0, padding: 16, fontSize: 13, lineHeight: 1.45, color: '#334155' }}>{desc}</p>
                </button>
              </div>
            )
          }

          return (
            <button
              key={cardMode}
              type="button"
              onClick={() => onPick(cardMode)}
              style={{
                width: 260,
                border: 'none',
                borderRadius: 16,
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
                background: '#fff',
                boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  height: 140,
                  background: 'linear-gradient(145deg, #e2e8f0 0%, #f1f5f9 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={56} weight="duotone" color="#64748b" />
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  background: 'linear-gradient(90deg, #c81b3a 0%, #a01630 100%)',
                  color: '#fff',
                }}
              >
                <Icon size={22} weight="bold" color="#fff" />
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em' }}>{title.toUpperCase()}</span>
              </div>
              <p style={{ margin: 0, padding: 16, fontSize: 13, lineHeight: 1.45, color: '#334155' }}>{desc}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LobbyScreen({
  mode,
  onBack,
  onStart,
  onlineSession,
}: {
  mode: 'single' | 'online'
  onBack: () => void
  onStart: (players: Player[], partyBoard?: PartyBoardSyncMeta) => void
  /** Present after PartyKit online lobby — used to prefill display name and show room code. */
  onlineSession?: { roomId: string; displayName: string; connectionId?: string; profile?: HelloProfile } | null
}) {
  const [rulesOpen, setRulesOpen] = useState(false)
  const [humanName, setHumanName] = useState(onlineSession?.displayName?.trim() || 'Founder')

  useEffect(() => {
    const n = onlineSession?.displayName?.trim()
    if (n) setHumanName(n)
  }, [onlineSession?.displayName])

  type OnlineSeatLayout = 'manual' | 'roster' | 'room'
  const partyEnabled = mode === 'online' && !!onlineSession
  const party = usePartySeatPlanRoom({
    roomId: onlineSession?.roomId ?? '',
    displayName: onlineSession?.displayName ?? '',
    enabled: partyEnabled,
    profile: onlineSession?.profile ?? null,
  })
  const [onlineSeatLayout, setOnlineSeatLayout] = useState<OnlineSeatLayout>('manual')
  const [rosterBotCount, setRosterBotCount] = useState(0)

  useEffect(() => {
    if (partyEnabled && party.roster.length >= 2 && onlineSeatLayout === 'manual') {
      setOnlineSeatLayout('roster')
    }
  }, [partyEnabled, party.roster.length, onlineSeatLayout])

  const minRosterBots = partyEnabled ? Math.max(0, 2 - party.roster.length) : 0
  const maxRosterBots = partyEnabled ? Math.max(0, 6 - party.roster.length) : 0

  useEffect(() => {
    if (!partyEnabled) return
    setRosterBotCount((c) => Math.min(maxRosterBots, Math.max(minRosterBots, c)))
  }, [partyEnabled, minRosterBots, maxRosterBots, party.roster.length])

  const myPartyId = party.myConnectionId ?? onlineSession?.connectionId ?? null

  const [humanColor, setHumanColor] = useState(PLAYER_COLORS[0].value)
  const [aiCount, setAiCount] = useState(2)
  const [aiSlots, setAiSlots] = useState<AiSlot[]>(() => [
    { name: 'Founderbot 1', color: PLAYER_COLORS[1].value, difficulty: 'normal' },
    { name: 'Founderbot 2', color: PLAYER_COLORS[2].value, difficulty: 'normal' },
  ])

  useEffect(() => {
    setAiSlots((prev) => {
      const next = [...prev]
      if (aiCount > next.length) {
        const used = new Set<string>([humanColor, ...next.map((s) => s.color)])
        for (let i = next.length; i < aiCount; i++) {
          const [c] = pickDistinctColors(used, 1)
          const color = c ?? PLAYER_COLORS[(i + 2) % PLAYER_COLORS.length].value
          used.add(color)
          next.push({
            name: `Founderbot ${i + 1}`,
            color,
            difficulty: 'normal',
          })
        }
      }
      return next.slice(0, aiCount)
    })
  }, [aiCount, humanColor])

  const bumpAi = (delta: number) => {
    const total = 1 + aiCount
    const nextTotal = total + delta
    if (nextTotal < 2 || nextTotal > 6) return
    setAiCount((c) => c + delta)
  }

  const updateAi = (index: number, patch: Partial<AiSlot>) => {
    setAiSlots((rows) => {
      const copy = [...rows]
      copy[index] = { ...copy[index], ...patch }
      return copy
    })
  }

  const bumpRosterBots = (delta: number) => {
    const next = rosterBotCount + delta
    if (next < minRosterBots || next > maxRosterBots) return
    setRosterBotCount(next)
  }

  const publishTableToRoom = useCallback(() => {
    if (!myPartyId || party.status !== 'connected') {
      toast.error('PartyKit is not connected.')
      return
    }
    let seats: SeatPlanEntry[] | null = null
    if (onlineSeatLayout === 'manual') {
      seats = manualLayoutToSeatPlan(myPartyId, humanName, humanColor, aiSlots)
    } else if (onlineSeatLayout === 'roster') {
      seats = rosterPlusBotsToSeatPlan(party.roster, rosterBotCount)
    } else {
      toast.message('Switch to Manual or Party roster to publish a new table.')
      return
    }
    if (!seats || seats.length < 2) {
      toast.error('Need at least two seats to publish.')
      return
    }
    if (!seatPlanColorsUnique(seats)) {
      toast.error('Each founder needs a unique color before publishing.')
      return
    }
    party.proposeSeatPlan(seats)
    toast.success('Published seat table to everyone in this room.')
  }, [
    aiSlots,
    humanColor,
    humanName,
    myPartyId,
    onlineSeatLayout,
    party,
    party.roster,
    rosterBotCount,
  ])

  const handleStart = useCallback(() => {
    const roomNote =
      mode === 'online' && onlineSession?.roomId
        ? `PartyKit room "${onlineSession.roomId}".`
        : ''

    const hostConnectionId =
      myPartyId ?? onlineSession?.connectionId ?? getDeviceConnectionId()

    const partyBoardMeta: PartyBoardSyncMeta | undefined =
      mode === 'online' && onlineSession?.roomId
        ? {
            roomId: normalizeRoomCode(onlineSession.roomId),
            myConnectionId: hostConnectionId,
            displayName: (humanName.trim() || onlineSession.displayName || 'Founder').slice(0, 40),
          }
        : undefined

    const commitPlayers = (players: Player[], detail: string) => {
      if (mode === 'online') {
        party.signalGameStarting(humanName.trim() || onlineSession?.displayName)
        toast.info(`${roomNote} ${detail}`.trim())
      }
      onStart(players, partyBoardMeta)
    }

    if (mode === 'online' && onlineSession) {
      if (onlineSeatLayout === 'room') {
        if (party.status !== 'connected' || !hostConnectionId) {
          toast.error('Room table needs a live connection — wait a moment or use Manual seats.')
          return
        }
        const sp = party.seatPlan?.seats
        if (!sp || sp.length < 2) {
          toast.error('No room table yet — publish one from Manual or Party roster, or wait for the host.')
          return
        }
        if (!seatPlanColorsUnique(sp)) {
          toast.error('Each founder needs a unique color on the room table.')
          return
        }
        commitPlayers(seatPlanToPlayers(sp), 'Using the shared room table.')
        return
      }
      if (onlineSeatLayout === 'roster') {
        if (party.status !== 'connected' || !hostConnectionId) {
          toast.error('Party roster needs a live connection — wait a moment or use Manual seats.')
          return
        }
        const seats = rosterPlusBotsToSeatPlan(party.roster, rosterBotCount)
        if (!seats) {
          toast.error('Need 2–6 founders total (Party roster + bots).')
          return
        }
        if (!seatPlanColorsUnique(seats)) {
          toast.error('Each founder needs a unique color.')
          return
        }
        party.proposeSeatPlan(seats)
        commitPlayers(seatPlanToPlayers(seats), 'Seats built from the Party roster (optional bots fill empty chairs).')
        return
      }
      const seats = manualLayoutToSeatPlan(hostConnectionId, humanName, humanColor, aiSlots)
      if (!seatPlanColorsUnique(seats)) {
        toast.error('Each founder needs a unique color.')
        return
      }
      commitPlayers(seatPlanToPlayers(seats), 'Manual seats on this device.')
      return
    }

    const colors = [humanColor, ...aiSlots.map((s) => s.color)]
    if (new Set(colors).size !== colors.length) {
      toast.error('Each founder needs a unique color.')
      return
    }
    if (mode === 'online') {
      toast.warning(
        onlineSession && party.status !== 'connected'
          ? `${roomNote} PartyKit disconnected — starting with manual seats locally.`.trim()
          : 'Starting a local game with these seats.'
      )
    }
    const base: Player[] = [
      {
        id: 0,
        name: humanName.trim() || 'Founder',
        color: humanColor,
        isAi: false,
        money: 20,
        actionCards: [],
        propertyCards: [],
      },
      ...aiSlots.map((s, i) => ({
        id: i + 1,
        name: s.name.trim() || `Founderbot ${i + 1}`,
        color: s.color,
        isAi: true as const,
        aiDifficulty: s.difficulty,
        money: 20,
        actionCards: [],
        propertyCards: [],
      })),
    ]
    const shuffled = [...base].sort(() => Math.random() - 0.5)
    const reordered = shuffled.map((p, i) => ({ ...p, id: i }))
    onStart(reordered, undefined)
  }, [
    aiSlots,
    humanColor,
    humanName,
    mode,
    myPartyId,
    onStart,
    onlineSeatLayout,
    onlineSession,
    party.roster,
    party.seatPlan?.seats,
    party.status,
    rosterBotCount,
  ])

  const startBlockedOnlineRoom =
    partyEnabled &&
    onlineSeatLayout === 'room' &&
    (!party.seatPlan?.seats?.length || party.seatPlan.seats.length < 2)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: '#0f1118',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '20px 24px 108px',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 40,
            padding: '0 18px',
            marginBottom: 16,
            borderRadius: 9999,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent',
            color: '#e2e8f0',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            cursor: 'pointer',
          }}
        >
          <CaretLeft size={18} weight="bold" />
          Back
        </button>

        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <h1
            style={{
              margin: 0,
              fontSize: 26,
              fontWeight: 300,
              color: '#f8fafc',
              letterSpacing: '0.02em',
            }}
          >
            Create game
          </h1>
          <p style={{ margin: '8px 0 20px', fontSize: 14, color: '#94a3b8', lineHeight: 1.45 }}>
            {mode === 'online'
              ? onlineSession
                ? `PartyKit room "${onlineSession.roomId}". Choose Manual seats, sync from the Party roster (+ bots), or start from the shared room table the host publishes.`
                : 'Set up your seat and AI opponents on one screen.'
              : 'Set up your seat and AI opponents on one screen.'}
          </p>

          <div
            style={{
              padding: '22px 24px 20px',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: 22,
            }}
          >
            {partyEnabled && (
              <section>
                <h2
                  style={{
                    margin: '0 0 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#64748b',
                    letterSpacing: '0.14em',
                  }}
                >
                  ONLINE TABLE SOURCE
                </h2>
                <p style={{ margin: '0 0 14px', fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
                  Pick how founder seats are chosen. &quot;Publish table to room&quot; writes an agreed list everyone can
                  load under Room table before Start game (board play still runs locally).
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  {(
                    [
                      { key: 'manual' as const, label: 'Manual seats', Icon: User },
                      { key: 'roster' as const, label: 'Party roster', Icon: UsersThree },
                      { key: 'room' as const, label: 'Room table', Icon: Globe },
                    ] as const
                  ).map(({ key, label, Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setOnlineSeatLayout(key)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 14px',
                        borderRadius: 9999,
                        border:
                          onlineSeatLayout === key
                            ? '1px solid rgba(56,189,248,0.55)'
                            : '1px solid rgba(255,255,255,0.12)',
                        background:
                          onlineSeatLayout === key ? 'rgba(56,189,248,0.14)' : 'rgba(0,0,0,0.28)',
                        color: '#e2e8f0',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Icon size={18} weight="duotone" />
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    PartyKit:{' '}
                    <strong style={{ color: '#f8fafc' }}>
                      {party.status === 'connected'
                        ? 'Connected'
                        : party.status === 'connecting'
                          ? 'Connecting…'
                          : party.status === 'error'
                            ? 'Unreachable — run npm run party:dev'
                            : 'Idle'}
                    </strong>
                    {party.roster.length > 0 ? ` · ${party.roster.length} in roster` : null}
                  </span>
                  {party.seatPlan ? (
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      Published table #{party.seatPlan.revision}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: '#64748b' }}>No published table yet</span>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <button
                    type="button"
                    onClick={publishTableToRoom}
                    disabled={party.status !== 'connected'}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 18px',
                      borderRadius: 9999,
                      border: '1px solid rgba(56,189,248,0.4)',
                      background:
                        party.status === 'connected' ? 'rgba(56,189,248,0.15)' : 'rgba(51,65,85,0.4)',
                      color: party.status === 'connected' ? '#e0f2fe' : '#64748b',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: party.status === 'connected' ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Publish table to room
                  </button>
                  <button
                    type="button"
                    onClick={() => party.requestSeatPlan()}
                    disabled={party.status !== 'connected'}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 18px',
                      borderRadius: 9999,
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(0,0,0,0.25)',
                      color: party.status === 'connected' ? '#cbd5e1' : '#64748b',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: party.status === 'connected' ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <ArrowsClockwise size={18} />
                    Refresh room table
                  </button>
                </div>
              </section>
            )}

            {partyEnabled ? <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} /> : null}

            {(!partyEnabled || onlineSeatLayout === 'manual') && (
              <>
                {/* Your seat */}
                <section>
              <h2
                style={{
                  margin: '0 0 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#64748b',
                  letterSpacing: '0.14em',
                }}
              >
                YOUR SEAT
              </h2>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 16,
                  alignItems: 'flex-end',
                }}
              >
                <div style={{ flex: '1 1 200px' }}>
                  <label style={{ display: 'block', fontSize: 11, color: '#8888a0', marginBottom: 6 }}>Name</label>
                  <input
                    value={humanName}
                    onChange={(e) => setHumanName(e.target.value)}
                    style={{
                      width: '100%',
                      height: 44,
                      padding: '0 14px',
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(0,0,0,0.35)',
                      color: '#fff',
                      fontSize: 15,
                    }}
                  />
                </div>
                <div style={{ flex: '1 1 240px' }}>
                  <span style={{ display: 'block', fontSize: 11, color: '#8888a0', marginBottom: 6 }}>Color</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {PLAYER_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setHumanColor(c.value)}
                        title={c.name}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          border: humanColor === c.value ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                          backgroundColor: c.value,
                          cursor: 'pointer',
                          boxShadow: humanColor === c.value ? `0 0 10px ${c.value}` : 'none',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />

            {/* AI count */}
            <section
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Robot size={24} weight="duotone" color="#48d0ff" />
                <h2 style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#64748b', letterSpacing: '0.14em' }}>
                  AI PLAYERS
                </h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button
                  type="button"
                  onClick={() => bumpAi(-1)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(0,0,0,0.35)',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Minus size={20} />
                </button>
                <span style={{ fontSize: 22, fontWeight: 600, color: '#f8fafc', minWidth: 28, textAlign: 'center' }}>
                  {aiCount}
                </span>
                <button
                  type="button"
                  onClick={() => bumpAi(1)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(0,0,0,0.35)',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Plus size={20} />
                </button>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>Total: {1 + aiCount} founders (2–6)</span>
              </div>
            </section>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />

            {/* Bots */}
            <section>
              <h2
                style={{
                  margin: '0 0 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#64748b',
                  letterSpacing: '0.14em',
                }}
              >
                BOT SETUP
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {aiSlots.map((slot, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(0,0,0,0.22)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 4 }}>
                        Bot {index + 1} — name
                      </span>
                      <input
                        value={slot.name}
                        onChange={(e) => updateAi(index, { name: e.target.value })}
                        style={{
                          width: '100%',
                          height: 40,
                          padding: '0 12px',
                          borderRadius: 8,
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: 'rgba(0,0,0,0.35)',
                          color: '#fff',
                          fontSize: 14,
                        }}
                      />
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 16,
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <span style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 6 }}>Color</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {PLAYER_COLORS.map((c) => (
                            <button
                              key={c.value}
                              type="button"
                              title={c.name}
                              onClick={() => updateAi(index, { color: c.value })}
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                border: slot.color === c.value ? '2px solid #fff' : '1px solid rgba(255,255,255,0.15)',
                                backgroundColor: c.value,
                                cursor: 'pointer',
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      <div style={{ flex: '1 1 200px', maxWidth: 320 }}>
                        <span style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 6 }}>
                          Difficulty
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {(['easy', 'normal', 'hard'] as AiDifficulty[]).map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => updateAi(index, { difficulty: d })}
                              style={{
                                flex: 1,
                                padding: '8px 6px',
                                borderRadius: 8,
                                border:
                                  slot.difficulty === d ? '1px solid #0070cc' : '1px solid rgba(255,255,255,0.12)',
                                background: slot.difficulty === d ? 'rgba(0,112,204,0.22)' : 'transparent',
                                color: '#e2e8f0',
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: 'capitalize' as const,
                                cursor: 'pointer',
                              }}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
              </>
            )}

            {partyEnabled && onlineSeatLayout === 'roster' && (
              <section>
                <h2
                  style={{
                    margin: '0 0 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#64748b',
                    letterSpacing: '0.14em',
                  }}
                >
                  PARTY ROSTER (+ BOTS)
                </h2>
                <p style={{ margin: '0 0 14px', fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
                  Founders connected right now become human seats in table order. Add bots so the table has 2–6 founders.
                  Publish when everyone agrees — or start locally from this roster without publishing.
                </p>
                {party.roster.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Waiting for roster… connect PartyKit.</p>
                ) : (
                  <ul style={{ margin: '0 0 18px', paddingLeft: 18, color: '#e2e8f0', fontSize: 14 }}>
                    {[...party.roster]
                      .sort((a, b) => a.displayName.localeCompare(b.displayName))
                      .map((p) => (
                        <li key={p.connectionId}>
                          {p.displayName}
                          {myPartyId && p.connectionId === myPartyId ? (
                            <span style={{ color: '#38bdf8', marginLeft: 8 }}>(you)</span>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                )}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>Extra AI bots</span>
                  <button
                    type="button"
                    onClick={() => bumpRosterBots(-1)}
                    disabled={rosterBotCount <= minRosterBots}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(0,0,0,0.35)',
                      color: '#fff',
                      cursor: rosterBotCount <= minRosterBots ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: rosterBotCount <= minRosterBots ? 0.45 : 1,
                    }}
                  >
                    <Minus size={20} />
                  </button>
                  <span style={{ fontSize: 22, fontWeight: 600, color: '#f8fafc', minWidth: 28, textAlign: 'center' }}>
                    {rosterBotCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => bumpRosterBots(1)}
                    disabled={rosterBotCount >= maxRosterBots}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(0,0,0,0.35)',
                      color: '#fff',
                      cursor: rosterBotCount >= maxRosterBots ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: rosterBotCount >= maxRosterBots ? 0.45 : 1,
                    }}
                  >
                    <Plus size={20} />
                  </button>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>
                    Total {party.roster.length + rosterBotCount} founders (2–6)
                  </span>
                </div>
              </section>
            )}

            {partyEnabled && onlineSeatLayout === 'room' && (
              <section>
                <h2
                  style={{
                    margin: '0 0 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#64748b',
                    letterSpacing: '0.14em',
                  }}
                >
                  AGREED ROOM TABLE
                </h2>
                <p style={{ margin: '0 0 14px', fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
                  This list is whatever anyone last published to the room. Use Refresh if you joined late. Start game builds
                  from this snapshot on your device.
                </p>
                {!party.seatPlan?.seats?.length ? (
                  <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
                    Nothing published yet — switch to Manual or Party roster and tap Publish table to room.
                  </p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {party.seatPlan.seats.map((seat, idx) => (
                      <li
                        key={`${seat.connectionId ?? 'bot'}-${idx}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 14px',
                          borderRadius: 12,
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: 'rgba(0,0,0,0.22)',
                        }}
                      >
                        <span
                          title="Seat color"
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            border: '1px solid rgba(255,255,255,0.2)',
                            backgroundColor: seat.color ?? '#64748b',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ flex: 1, color: '#f8fafc', fontSize: 14 }}>{seat.displayName}</span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            color: seat.isAi ? '#fbbf24' : '#38bdf8',
                          }}
                        >
                          {seat.isAi ? 'BOT' : 'HUMAN'}
                        </span>
                        {!seat.isAi && myPartyId && seat.connectionId === myPartyId ? (
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>(you)</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              style={{
                alignSelf: 'flex-start',
                marginTop: 4,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: 9999,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(0,0,0,0.2)',
                color: '#94a3b8',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <BookOpen size={20} weight="duotone" />
              Rules of the game
            </button>
          </div>
        </div>
      </div>

      {/* Start — fixed bottom */}
      <div
        style={{
          flexShrink: 0,
          padding: '12px 24px calc(12px + env(safe-area-inset-bottom, 0))',
          background: 'linear-gradient(180deg, transparent 0%, rgba(15,17,24,0.98) 28%)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <button
          type="button"
          onClick={handleStart}
          disabled={startBlockedOnlineRoom}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            width: '100%',
            maxWidth: 420,
            height: 52,
            borderRadius: 9999,
            border: 'none',
            background:
              startBlockedOnlineRoom
                ? 'rgba(51,65,85,0.7)'
                : 'linear-gradient(180deg, #0070cc 0%, #055a9e 100%)',
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
            cursor: startBlockedOnlineRoom ? 'not-allowed' : 'pointer',
            boxShadow: startBlockedOnlineRoom ? 'none' : '0 4px 20px rgba(0,112,204,0.35)',
            opacity: startBlockedOnlineRoom ? 0.65 : 1,
          }}
        >
          <Play size={22} weight="fill" />
          Start game
        </button>
      </div>

      <RulesDialog open={rulesOpen} onOpenChange={setRulesOpen} />
    </div>
  )
}

function RulesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-lg"
        style={{ background: '#141418', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: '#f8fafc' }}>Founders Square — rules overview</DialogTitle>
          <DialogDescription style={{ color: '#94a3b8' }}>
            Summary from the design spec; full card text is on the board and in your hand.
          </DialogDescription>
        </DialogHeader>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: '#cbd5e1' }}>
          <p style={{ marginTop: 0 }}>
            <strong style={{ color: '#fff' }}>Objective.</strong> 2–6 founders claim lots, build properties, play action
            cards, and use anchor influence across the city. Random turn order is set at the start and keeps cycling.
          </p>
          <p>
            <strong style={{ color: '#fff' }}>Turn.</strong> Take actions (build, bank cards, play actions), resolve
            conflicts with dice where the card says so, then end your turn. Income is resolved with your Income card and
            the property-income die when you choose to play it.
          </p>
          <p>
            <strong style={{ color: '#fff' }}>Placement.</strong> Properties must respect district rules unless a card
            lets you build elsewhere (e.g. Crossing the Line).
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong style={{ color: '#fff' }}>AI seats.</strong> Bots use the same rules; difficulty will tune future
            automation — for now all seats are pass-and-play.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function GameSetupWizard({
  onComplete,
  onGuestJoined,
  onResumeHostTable,
}: {
  onComplete: (players: Player[], partyBoard?: PartyBoardSyncMeta) => void
  onGuestJoined?: (state: GameState, cfg: PartyBoardSyncConfig) => void
  onResumeHostTable?: (state: GameState, cfg: PartyBoardSyncConfig) => void
}) {
  const [phase, setPhase] = useState<SetupWizardPhase>('opening')
  const [lobbyMode, setLobbyMode] = useState<'single' | 'online'>('single')
  /** After "Play on this device", mode picker hides Online (use Play online on title screen). */
  const [modeScreenDeviceOnly, setModeScreenDeviceOnly] = useState(false)
  const [lobbySuggestedRole, setLobbySuggestedRole] = useState<OnlineLobbyRole | undefined>(undefined)
  const [lobbyPrefill, setLobbyPrefill] = useState<{ displayName: string; roomCode: string } | null>(
    null
  )
  const [onlineSession, setOnlineSession] = useState<{
    roomId: string
    displayName: string
    connectionId?: string
    profile?: HelloProfile
    role?: OnlineLobbyRole
  } | null>(null)
  const lastOnline = loadLastOnlineSession()
  const canResumeHost =
    !!onResumeHostTable &&
    lastOnline?.role === 'host' &&
    hasResumableHostAuthority(lastOnline.roomId)

  return (
    <AnimatePresence mode="wait">
      {phase === 'opening' && (
        <motion.div
          key="opening"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <OpeningScreen
            onPlayOnline={() => {
              setModeScreenDeviceOnly(false)
              setLobbyMode('online')
              setOnlineSession(null)
              setLobbyPrefill(null)
              setLobbySuggestedRole('host')
              setPhase('multiplayer')
            }}
            onNewGame={() => {
              setModeScreenDeviceOnly(true)
              setPhase('mode')
            }}
            onJoinFriendsGame={
              onGuestJoined
                ? () => {
                    setModeScreenDeviceOnly(false)
                    setLobbyMode('online')
                    setOnlineSession(null)
                    setLobbyPrefill(null)
                    setLobbySuggestedRole('guest')
                    setPhase('multiplayer')
                  }
                : undefined
            }
            onResumeHostTable={
              canResumeHost && lastOnline
                ? () => {
                    const snap = loadAuthoritySnapshot(lastOnline.roomId)
                    if (!snap || !onResumeHostTable) {
                      toast.error('Could not find a saved table on this device.')
                      return
                    }
                    let raw: unknown
                    try {
                      raw = JSON.parse(snap.gameStateJson) as unknown
                    } catch {
                      toast.error('Saved table is corrupted.')
                      return
                    }
                    const state = parsePartyGameState(raw)
                    if (!state) {
                      toast.error('Saved table is invalid.')
                      return
                    }
                    onResumeHostTable(state, {
                      roomId: lastOnline.roomId,
                      displayName: lastOnline.displayName,
                      myConnectionId: getDeviceConnectionId(),
                      role: 'host',
                    })
                  }
                : undefined
            }
            resumeHostLabel={canResumeHost && lastOnline ? lastOnline.roomId : undefined}
            onRejoinLastRoom={
              onGuestJoined && lastOnline && lastOnline.role === 'guest'
                ? () => {
                    setModeScreenDeviceOnly(false)
                    setLobbyMode('online')
                    setOnlineSession(null)
                    setLobbyPrefill({
                      displayName: lastOnline.displayName,
                      roomCode: lastOnline.roomId,
                    })
                    setLobbySuggestedRole('guest')
                    setPhase('multiplayer')
                  }
                : undefined
            }
            lastRoomLabel={
              lastOnline?.role === 'guest' ? lastOnline.roomId : undefined
            }
          />
        </motion.div>
      )}
      {phase === 'mode' && (
        <motion.div
          key="mode"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <ModeSelectScreen
            deviceOnly={modeScreenDeviceOnly}
            onBack={() => {
              setModeScreenDeviceOnly(false)
              setPhase('opening')
            }}
            onJoinOnlineAsGuest={
              onGuestJoined
                ? () => {
                    setLobbyMode('online')
                    setOnlineSession(null)
                    setLobbySuggestedRole('guest')
                    setPhase('multiplayer')
                  }
                : undefined
            }
            onPick={(m) => {
              if (m === 'local') {
                setPhase('local')
              } else if (m === 'online') {
                setLobbyMode(m)
                setOnlineSession(null)
                setPhase('multiplayer')
              } else {
                setLobbyMode(m)
                setOnlineSession(null)
                setPhase('lobby')
              }
            }}
          />
        </motion.div>
      )}
      {phase === 'multiplayer' && (
        <motion.div
          key="multiplayer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <MultiplayerLobby
            suggestedRole={lobbySuggestedRole}
            initialDisplayName={lobbyPrefill?.displayName}
            initialRoomCode={lobbyPrefill?.roomCode}
            onBack={() => {
              setOnlineSession(null)
              setLobbyPrefill(null)
              setLobbySuggestedRole(undefined)
              setModeScreenDeviceOnly(false)
              setPhase('opening')
            }}
            onSessionReady={(meta) => {
              setOnlineSession(meta)
              setPhase(meta.role === 'guest' ? 'guest-waiting' : 'lobby')
            }}
          />
        </motion.div>
      )}
      {phase === 'guest-waiting' && onlineSession?.role === 'guest' && onGuestJoined && (
        <motion.div
          key="guest-waiting"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <GuestWaitingRoom
            session={{ ...onlineSession, role: 'guest' }}
            onGameStarted={(state, cfg) => onGuestJoined(state, cfg)}
            onBack={() => {
              setOnlineSession(null)
              setPhase('multiplayer')
            }}
          />
        </motion.div>
      )}
      {phase === 'lobby' && (
        <motion.div
          key="lobby"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <LobbyScreen
            mode={lobbyMode}
            onBack={() => {
              setOnlineSession(null)
              setPhase(lobbyMode === 'online' ? 'multiplayer' : 'mode')
            }}
            onStart={onComplete}
            onlineSession={lobbyMode === 'online' ? onlineSession : null}
          />
        </motion.div>
      )}
      {phase === 'local' && (
        <motion.div
          key="local"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <PlayerSetup onComplete={(players) => onComplete(players)} onBack={() => setPhase('mode')} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
