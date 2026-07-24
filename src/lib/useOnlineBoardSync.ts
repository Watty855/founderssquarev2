import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { GameState } from '@/lib/types'
import type { PartyBoardSyncConfig } from '@/lib/partyBoardSync'
import type { BoardFx, GameAction, GameEvent } from '@/lib/onlineGameActions'
import { applyGameAction } from '@/lib/gameEngine/applyGameAction'
import {
  mergePublicAndPrivateHands,
  type PrivateHandPayload,
  type PublicGameState,
} from '@/lib/onlinePublicState'
import {
  authorityApplyGameAction,
  authorityClearGame,
  authorityHydrateForClient,
  authorityInitGame,
  authorityIsLive,
  authorityLoadState,
  authorityResumeGame,
  createAuthorityStore,
  type AuthorityOutbound,
  type OnlineAuthorityStore,
} from '@/lib/onlineRoomAuthority'
import { toPublicGameState } from '@/lib/onlinePublicState'
import { boardTopic, getDeviceConnectionId, getRealtimeClient, normalizeRoomCode } from '@/lib/realtimeClient'
import {
  clearAuthoritySnapshot,
  loadAuthoritySnapshot,
  saveAuthoritySnapshot,
} from '@/lib/onlineAuthorityMemory'

export type SendActionOptions = { skipOptimistic?: boolean }
export type OnlineConnectionStatus =
  | 'offline'
  | 'connecting'
  | 'connected'
  | 'resyncing'
  | 'stale'
  | 'error'

const REVISION_HEARTBEAT_MS = 2_500
const REVISION_STALE_MS = 12_000
const SNAPSHOT_REQUEST_COOLDOWN_MS = 1_500
/** Stop hammering the host after this long without a successful public ingest. */
const RESYNC_GIVE_UP_MS = 12_000
/** When stale, try one fresh hydrate this often in case the host woke up. */
const STALE_RETRY_MS = 15_000
const AUTHORITY_PERSIST_DEBOUNCE_MS = 400

/** Wire envelope on the board channel (Supabase Realtime broadcast event "board"). */
type BoardWire =
  | { kind: 'public_state'; rev: number; state: unknown; to?: string }
  | { kind: 'private_hand'; rev: number; to: string; hand: PrivateHandPayload }
  | { kind: 'action_applied'; rev: number; actionId: string; state: unknown; events?: GameEvent[] }
  | { kind: 'action_rejected'; to: string; actionId: string; rev: number; error: string; code?: string }
  | { kind: 'game_action'; from: string; actionId: string; action: GameAction }
  | { kind: 'game_request'; from: string; displayName?: string }
  | { kind: 'revision_heartbeat'; rev: number; authorityId: string }
  | { kind: 'game_cleared' }
  | { kind: 'fx'; fx: BoardFx }

/**
 * Live board sync over Supabase Realtime — replaces the PartyKit/Colyseus
 * transports with a host-authoritative model that needs no game server:
 *
 *  - The HOST device runs the rules authority (`onlineRoomAuthority`); it seeds
 *    the board after setup and answers `game_request` hydrates for joiners.
 *  - Every seat (host included) submits typed `game_action`s; the host applies
 *    them with the shared engine, bumps the revision, and broadcasts the
 *    redacted `public_state` plus per-seat `private_hand`s.
 *  - Guests apply moves optimistically and roll back on `action_rejected`.
 *
 * Return shape matches the original hook so GameApp is unchanged.
 */
export function useOnlineBoardSync(params: {
  config: PartyBoardSyncConfig | null
  gameState: GameState
  setGameState: Dispatch<SetStateAction<GameState>>
  /** Resolve the seated human's player id for merging private_hand into public_state. */
  resolveSeatPlayerId?: (gs: GameState, boardConnectionId: string | null) => number | null
  onAuthoritySnapshotApplied?: () => void
  onGameEvents?: (events: GameEvent[]) => void
  /** Remote sound / notice effects broadcast by other devices at this table. */
  onFx?: (fx: BoardFx) => void
}) {
  const {
    config,
    gameState,
    setGameState,
    resolveSeatPlayerId,
    onAuthoritySnapshotApplied,
    onGameEvents,
    onFx,
  } = params

  const [boardPartyConnectionId, setBoardPartyConnectionId] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<OnlineConnectionStatus>(
    config ? 'connecting' : 'offline'
  )
  const connectionStatusRef = useRef<OnlineConnectionStatus>(config ? 'connecting' : 'offline')
  connectionStatusRef.current = connectionStatus

  const channelRef = useRef<RealtimeChannel | null>(null)
  const hostInitSentRef = useRef(false)
  const lastRevRef = useRef(0)
  const lastAuthorityIdRef = useRef<string | null>(null)
  const lastHeartbeatAtRef = useRef(0)
  const lastSnapshotRequestAtRef = useRef(0)
  const resyncStartedAtRef = useRef(0)
  const lastStaleRetryAtRef = useRef(0)
  const authorityPersistTimerRef = useRef<number | null>(null)
  const latestPublicRef = useRef<PublicGameState | null>(null)
  const latestPublicJsonRef = useRef('')
  /** Hands this device may hold: its own seat plus AI seats when hosting. */
  const latestHandsRef = useRef<Map<number, PrivateHandPayload>>(new Map())
  const latestHandJsonRef = useRef<Map<number, string>>(new Map())
  const latestHandRevRef = useRef<Map<number, number>>(new Map())
  const lastAppliedViewKeyRef = useRef('')
  const pendingRollbackRef = useRef<Map<string, GameState>>(new Map())
  /** Action ids whose events already fired optimistically on this device — skip the authoritative echo. */
  const optimisticEventsFiredRef = useRef<Set<string>>(new Set())
  const authorityRef = useRef<OnlineAuthorityStore>(createAuthorityStore())
  const gameStateRef = useRef(gameState)
  gameStateRef.current = gameState

  const resolveSeatRef = useRef(resolveSeatPlayerId)
  resolveSeatRef.current = resolveSeatPlayerId
  const boardConnIdRef = useRef(boardPartyConnectionId)
  boardConnIdRef.current = boardPartyConnectionId

  const onSnapshotAppliedRef = useRef(onAuthoritySnapshotApplied)
  onSnapshotAppliedRef.current = onAuthoritySnapshotApplied
  const onGameEventsRef = useRef(onGameEvents)
  onGameEventsRef.current = onGameEvents
  const onFxRef = useRef(onFx)
  onFxRef.current = onFx

  const cfgRef = useRef<PartyBoardSyncConfig | null>(null)
  cfgRef.current = config

  const resolveViewerId = useCallback(() => {
    return resolveSeatRef.current?.(gameStateRef.current, boardConnIdRef.current) ?? null
  }, [])

  const applyMergedView = useCallback(() => {
    const pub = latestPublicRef.current
    if (!pub) return
    const viewerId = resolveViewerId()
    const handKey = [...latestHandJsonRef.current.entries()]
      .sort(([a], [b]) => a - b)
      .map(([playerId, json]) => `${playerId}:${json}`)
      .join('|')
    const viewKey = `${latestPublicJsonRef.current}|${viewerId ?? 'spectator'}|${handKey}`
    if (viewKey === lastAppliedViewKeyRef.current) return
    lastAppliedViewKeyRef.current = viewKey
    const merged = mergePublicAndPrivateHands(
      pub,
      viewerId,
      [...latestHandsRef.current.values()]
    )
    // The opening narration is a per-device intro; once this device dismissed
    // it, don't let an authoritative snapshot (seeded before dismissal) bring
    // it back — it would also re-block the host's AI turn driver.
    setGameState((prev) =>
      prev.openingNarrationComplete === true && merged.openingNarrationComplete !== true
        ? { ...merged, openingNarrationComplete: true }
        : merged
    )
    onSnapshotAppliedRef.current?.()
  }, [setGameState, resolveViewerId])

  const ingestPublicState = useCallback(
    (rev: number, raw: unknown) => {
      if (!raw || typeof raw !== 'object') return
      // Older hydrate after a newer live update must not leave the badge stuck
      // on "Resyncing…" — we are already ahead of that snapshot.
      if (rev < lastRevRef.current) {
        lastHeartbeatAtRef.current = Date.now()
        resyncStartedAtRef.current = 0
        setConnectionStatus('connected')
        return
      }
      const json = JSON.stringify(raw)
      const sameSnapshot = rev === lastRevRef.current && json === latestPublicJsonRef.current
      lastRevRef.current = Math.max(lastRevRef.current, rev)
      lastHeartbeatAtRef.current = Date.now()
      resyncStartedAtRef.current = 0
      setConnectionStatus('connected')
      if (sameSnapshot) return
      latestPublicRef.current = raw as PublicGameState
      latestPublicJsonRef.current = json
      applyMergedView()
    },
    [applyMergedView]
  )

  const ingestPrivateHand = useCallback(
    (hand: PrivateHandPayload, rev: number) => {
      const previousRev = latestHandRevRef.current.get(hand.playerId) ?? -1
      if (rev < previousRev) return
      const json = JSON.stringify(hand)
      if (rev === previousRev && json === latestHandJsonRef.current.get(hand.playerId)) return
      latestHandRevRef.current.set(hand.playerId, rev)
      latestHandJsonRef.current.set(hand.playerId, json)
      latestHandsRef.current.set(hand.playerId, hand)
      applyMergedView()
    },
    [applyMergedView]
  )

  const sendWire = useCallback((msg: BoardWire) => {
    const ch = channelRef.current
    if (!ch) return
    void ch.send({ type: 'broadcast', event: 'board', payload: msg })
  }, [])

  const writeAuthoritySnapshotNow = useCallback(() => {
    const cfg = cfgRef.current
    if (cfg?.role !== 'host') return
    const live = authorityRef.current
    if (!authorityIsLive(live) || !live.authorityId || !live.gameHostId || !live.gameStateJson) {
      return
    }
    saveAuthoritySnapshot({
      roomId: cfg.roomId,
      authorityId: live.authorityId,
      gameRev: live.gameRev,
      gameHostId: live.gameHostId,
      gameStateJson: live.gameStateJson,
    })
  }, [])

  const persistAuthoritySoon = useCallback(() => {
    const cfg = cfgRef.current
    if (cfg?.role !== 'host') return
    const store = authorityRef.current
    if (!authorityIsLive(store) || !store.authorityId || !store.gameHostId || !store.gameStateJson) {
      return
    }
    if (authorityPersistTimerRef.current != null) {
      window.clearTimeout(authorityPersistTimerRef.current)
    }
    authorityPersistTimerRef.current = window.setTimeout(() => {
      authorityPersistTimerRef.current = null
      writeAuthoritySnapshotNow()
    }, AUTHORITY_PERSIST_DEBOUNCE_MS)
  }, [writeAuthoritySnapshotNow])

  /** Immediate host snapshot flush — call before soft-leaving so Resume still works. */
  const flushAuthorityPersist = useCallback(() => {
    if (authorityPersistTimerRef.current != null) {
      window.clearTimeout(authorityPersistTimerRef.current)
      authorityPersistTimerRef.current = null
    }
    writeAuthoritySnapshotNow()
  }, [writeAuthoritySnapshotNow])

  const requestSnapshot = useCallback(
    (force = false, opts?: { resetGiveUp?: boolean }) => {
      if (cfgRef.current?.role !== 'guest') return
      const from = boardConnIdRef.current
      if (!from || !channelRef.current) return
      const now = Date.now()
      if (!force && now - lastSnapshotRequestAtRef.current < SNAPSHOT_REQUEST_COOLDOWN_MS) return
      // Only manual Resync / app-resume should reopen the give-up window.
      // Silence-forced retries must NOT reset it — that caused endless Resyncing….
      if (opts?.resetGiveUp) resyncStartedAtRef.current = 0
      if (
        resyncStartedAtRef.current > 0 &&
        now - resyncStartedAtRef.current > RESYNC_GIVE_UP_MS
      ) {
        setConnectionStatus('stale')
        return
      }
      lastSnapshotRequestAtRef.current = now
      if (resyncStartedAtRef.current === 0) resyncStartedAtRef.current = now
      // Soft catch-up: if we already have a board, keep the UI interactive
      // ("Online") instead of locking the badge on endless Resyncing….
      const hasBoard = lastRevRef.current > 0 && latestPublicRef.current != null
      if (!hasBoard) setConnectionStatus('resyncing')
      const displayName = cfgRef.current?.displayName?.trim() || undefined
      sendWire({ kind: 'game_request', from, displayName })
    },
    [sendWire]
  )

  const rollbackAction = useCallback(
    (actionId: string, error?: string) => {
      optimisticEventsFiredRef.current.delete(actionId)
      const snap = pendingRollbackRef.current.get(actionId)
      if (!snap) return
      setGameState(snap)
      pendingRollbackRef.current.delete(actionId)
      onGameEventsRef.current?.([
        { type: 'toast', level: 'error', message: error ?? 'Action rejected by table authority.' },
      ])
    },
    [setGameState]
  )

  /**
   * Host-side delivery of authority output: messages for this device are
   * ingested locally (the host has no server round-trip); everything else is
   * broadcast. Targeted messages carry `to` and are filtered by receivers.
   */
  const deliverOutbound = useCallback(
    (messages: AuthorityOutbound[]) => {
      const myId = boardConnIdRef.current
      for (const m of messages) {
        if (m.target === 'all') {
          if (m.type === 'public_state') {
            sendWire({ kind: 'public_state', rev: m.rev, state: m.state })
            ingestPublicState(m.rev, m.state)
          } else if (m.type === 'action_applied') {
            sendWire({
              kind: 'action_applied',
              rev: m.rev,
              actionId: m.actionId,
              state: m.state,
              events: m.events,
            })
            ingestPublicState(m.rev, m.state)
            pendingRollbackRef.current.clear()
            const alreadyFired = optimisticEventsFiredRef.current.delete(m.actionId)
            if (m.events.length > 0 && !alreadyFired) onGameEventsRef.current?.(m.events)
          } else if (m.type === 'game_cleared') {
            sendWire({ kind: 'game_cleared' })
          }
          continue
        }
        // Targeted messages — public hydrate includes `to` so other guests ignore it.
        if (m.type === 'public_state') {
          if (m.sessionId === myId) ingestPublicState(m.rev, m.state)
          else sendWire({ kind: 'public_state', rev: m.rev, state: m.state, to: m.sessionId })
        } else if (m.type === 'private_hand') {
          if (m.sessionId === myId) ingestPrivateHand(m.hand, m.rev)
          else sendWire({ kind: 'private_hand', rev: m.rev, to: m.sessionId, hand: m.hand })
        } else if (m.type === 'action_rejected') {
          if (m.sessionId === myId) rollbackAction(m.actionId, m.error)
          else
            sendWire({
              kind: 'action_rejected',
              to: m.sessionId,
              actionId: m.actionId,
              rev: m.rev,
              error: m.error,
              code: m.code,
            })
        }
        // 'system' messages are host-side diagnostics; skip on the wire for now.
      }
      persistAuthoritySoon()
    },
    [sendWire, ingestPublicState, ingestPrivateHand, rollbackAction, persistAuthoritySoon]
  )

  const handleWire = useCallback(
    (msg: BoardWire) => {
      lastHeartbeatAtRef.current = Date.now()
      const myId = boardConnIdRef.current
      const cfg = cfgRef.current
      const isHost = cfg?.role === 'host'

      switch (msg.kind) {
        case 'public_state':
          if (msg.to && msg.to !== myId) return
          ingestPublicState(msg.rev, msg.state)
          return
        case 'private_hand':
          if (msg.to === myId) ingestPrivateHand(msg.hand, msg.rev)
          return
        case 'action_applied': {
          ingestPublicState(msg.rev, msg.state)
          pendingRollbackRef.current.clear()
          const alreadyFired = optimisticEventsFiredRef.current.delete(msg.actionId)
          const events = msg.events ?? []
          if (events.length > 0 && !alreadyFired) onGameEventsRef.current?.(events)
          return
        }
        case 'action_rejected':
          if (msg.to === myId) rollbackAction(msg.actionId, msg.error)
          return
        case 'game_action': {
          if (!isHost || !myId) return
          const result = authorityApplyGameAction(authorityRef.current, msg.action, msg.from, msg.actionId)
          if (result.ok) deliverOutbound(result.messages)
          else
            sendWire({
              kind: 'action_rejected',
              to: msg.from,
              actionId: msg.actionId,
              rev: authorityRef.current.gameRev,
              error: result.error,
              code: result.code,
            })
          return
        }
        case 'game_request': {
          if (!isHost) return
          const messages = authorityHydrateForClient(
            authorityRef.current,
            msg.from,
            msg.displayName
          )
          if (messages.length > 0) deliverOutbound(messages)
          return
        }
        case 'revision_heartbeat':
          if (!isHost) {
            const authorityChanged =
              lastAuthorityIdRef.current != null && lastAuthorityIdRef.current !== msg.authorityId
            if (authorityChanged) {
              lastRevRef.current = 0
              latestPublicRef.current = null
              latestPublicJsonRef.current = ''
              latestHandsRef.current.clear()
              latestHandJsonRef.current.clear()
              latestHandRevRef.current.clear()
              lastAppliedViewKeyRef.current = ''
              resyncStartedAtRef.current = 0
            }
            lastAuthorityIdRef.current = msg.authorityId
            const viewerId = resolveViewerId()
            // Only require private-hand catch-up after the host has successfully
            // delivered a hand for this seat. Name-fallback viewer ids without a
            // bound connection previously caused an infinite Resyncing… loop.
            const hasHandBaseline =
              viewerId != null && latestHandRevRef.current.has(viewerId)
            const handBehind =
              hasHandBaseline &&
              (latestHandRevRef.current.get(viewerId) ?? -1) < msg.rev
            if (authorityChanged || msg.rev > lastRevRef.current || handBehind) {
              requestSnapshot()
            } else {
              resyncStartedAtRef.current = 0
              setConnectionStatus('connected')
            }
          }
          return
        case 'game_cleared':
          lastRevRef.current = 0
          lastAuthorityIdRef.current = null
          latestPublicRef.current = null
          latestPublicJsonRef.current = ''
          latestHandsRef.current.clear()
          latestHandJsonRef.current.clear()
          latestHandRevRef.current.clear()
          lastAppliedViewKeyRef.current = ''
          return
        case 'fx':
          if (msg.fx) onFxRef.current?.(msg.fx)
          return
      }
    },
    [
      ingestPublicState,
      ingestPrivateHand,
      rollbackAction,
      deliverOutbound,
      sendWire,
      requestSnapshot,
      resolveViewerId,
    ]
  )
  const handleWireRef = useRef(handleWire)
  handleWireRef.current = handleWire

  /** Mirror a local sound / notice effect to every other device (the sender plays it locally). */
  const sendFx = useCallback(
    (fx: BoardFx) => {
      sendWire({ kind: 'fx', fx })
    },
    [sendWire]
  )

  const sendGameClear = useCallback(() => {
    const cfg = cfgRef.current
    const myId = boardConnIdRef.current
    if (cfg?.role !== 'host' || !myId) return
    if (authorityClearGame(authorityRef.current, myId)) {
      clearAuthoritySnapshot(cfg.roomId)
      sendWire({ kind: 'game_cleared' })
    }
  }, [sendWire])

  const sendAction = useCallback(
    (action: GameAction, opts?: SendActionOptions) => {
      const actionId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `act_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

      const connId = boardConnIdRef.current
      if (!connId) return actionId

      const cfg = cfgRef.current
      const status = connectionStatusRef.current
      if (
        cfg?.role === 'guest' &&
        (status === 'stale' || status === 'error') &&
        !opts?.skipOptimistic
      ) {
        onGameEventsRef.current?.([
          {
            type: 'toast',
            level: 'error',
            message:
              'Host unreachable — ask them to reopen the game on their device, or Leave table and Rejoin.',
          },
        ])
        return actionId
      }

      pendingRollbackRef.current.set(actionId, gameStateRef.current)

      if (!opts?.skipOptimistic) {
        const optimistic = applyGameAction(gameStateRef.current, action, {
          senderConnectionId: connId,
          senderIsHost: cfg?.role === 'host',
        })
        if (optimistic.ok) {
          setGameState(optimistic.state)
          if (optimistic.events.length > 0) {
            optimisticEventsFiredRef.current.add(actionId)
            onGameEventsRef.current?.(optimistic.events)
          }
        }
      }

      if (cfg?.role === 'host') {
        // The host IS the authority — apply directly, no network round trip.
        const result = authorityApplyGameAction(authorityRef.current, action, connId, actionId)
        if (result.ok) {
          deliverOutbound(result.messages)
          persistAuthoritySoon()
        } else rollbackAction(actionId, result.error)
      } else {
        sendWire({ kind: 'game_action', from: connId, actionId, action })
      }

      return actionId
    },
    [setGameState, deliverOutbound, rollbackAction, sendWire, persistAuthoritySoon]
  )

  const configKey = config
    ? `${normalizeRoomCode(config.roomId)}|${config.role}|${config.displayName}`
    : ''

  useEffect(() => {
    hostInitSentRef.current = false
    lastRevRef.current = 0
    lastAuthorityIdRef.current = null
    latestPublicRef.current = null
    latestPublicJsonRef.current = ''
    latestHandsRef.current.clear()
    latestHandJsonRef.current.clear()
    latestHandRevRef.current.clear()
    lastAppliedViewKeyRef.current = ''
    pendingRollbackRef.current.clear()
    optimisticEventsFiredRef.current.clear()
    lastHeartbeatAtRef.current = Date.now()
    lastSnapshotRequestAtRef.current = 0
    resyncStartedAtRef.current = 0
    lastStaleRetryAtRef.current = 0
    if (authorityPersistTimerRef.current != null) {
      window.clearTimeout(authorityPersistTimerRef.current)
      authorityPersistTimerRef.current = null
    }
    authorityRef.current = createAuthorityStore()
    setBoardPartyConnectionId(null)
    setConnectionStatus(config ? 'connecting' : 'offline')

    const cfg = cfgRef.current
    const client = getRealtimeClient()
    if (!cfg || !client) {
      const prev = channelRef.current
      if (prev) {
        void client?.removeChannel(prev)
        channelRef.current = null
      }
      return
    }

    const myId = getDeviceConnectionId()
    const room = normalizeRoomCode(cfg.roomId)

    // Host reopen: restore mid-game authority from localStorage before subscribe.
    if (cfg.role === 'host') {
      const snap = loadAuthoritySnapshot(room)
      if (snap) {
        const resumed = authorityResumeGame(authorityRef.current, snap, myId)
        if (resumed.ok) {
          hostInitSentRef.current = true
          setGameState(resumed.state)
          persistAuthoritySoon()
        }
      }
    }

    const ch = client.channel(boardTopic(room), {
      config: { broadcast: { self: false } },
    })
    channelRef.current = ch

    ch.on('broadcast', { event: 'board' }, ({ payload }) => {
      if (!payload || typeof payload !== 'object') return
      handleWireRef.current(payload as BoardWire)
    })

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        boardConnIdRef.current = myId
        setBoardPartyConnectionId(myId)
        lastHeartbeatAtRef.current = Date.now()
        if (cfgRef.current?.role === 'guest') {
          requestSnapshot(true, { resetGiveUp: true })
        } else if (cfgRef.current?.role === 'host' && authorityIsLive(authorityRef.current)) {
          setConnectionStatus('connected')
          const gs = authorityLoadState(authorityRef.current)
          if (gs) {
            void ch.send({
              type: 'broadcast',
              event: 'board',
              payload: {
                kind: 'public_state',
                rev: authorityRef.current.gameRev,
                state: toPublicGameState(gs),
              } satisfies BoardWire,
            })
            if (authorityRef.current.authorityId) {
              void ch.send({
                type: 'broadcast',
                event: 'board',
                payload: {
                  kind: 'revision_heartbeat',
                  rev: authorityRef.current.gameRev,
                  authorityId: authorityRef.current.authorityId,
                } satisfies BoardWire,
              })
            }
          }
        } else {
          setConnectionStatus('connected')
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Keep boardPartyConnectionId so guests stay in online-authoritative mode
        // instead of falling through to local-only mutations while reconnecting.
        setConnectionStatus('error')
      } else if (status === 'CLOSED') {
        setConnectionStatus('connecting')
      }
    })

    return () => {
      void client.removeChannel(ch)
      if (channelRef.current === ch) channelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, requestSnapshot, persistAuthoritySoon, setGameState])

  // The host advertises only its revision. Guests that missed a large state
  // payload can detect the gap and request a targeted hydrate.
  useEffect(() => {
    if (config?.role !== 'host' || !boardPartyConnectionId) return
    const sendHeartbeat = () => {
      const store = authorityRef.current
      if (!authorityIsLive(store) || !store.authorityId) return
      sendWire({
        kind: 'revision_heartbeat',
        rev: store.gameRev,
        authorityId: store.authorityId,
      })
    }
    sendHeartbeat()
    const id = window.setInterval(sendHeartbeat, REVISION_HEARTBEAT_MS)
    return () => window.clearInterval(id)
  }, [config?.role, boardPartyConnectionId, sendWire])

  // A quiet or backgrounded WebSocket can look connected while no longer
  // receiving table traffic. Ask for a hydrate — but do not reset give-up, so
  // endless Resyncing… cannot loop when the host is asleep / force-quit.
  useEffect(() => {
    if (config?.role !== 'guest' || !boardPartyConnectionId) return
    const id = window.setInterval(() => {
      const now = Date.now()
      const quiet = now - lastHeartbeatAtRef.current > REVISION_STALE_MS
      const status = connectionStatusRef.current
      if (status === 'stale') {
        if (now - lastStaleRetryAtRef.current < STALE_RETRY_MS) return
        lastStaleRetryAtRef.current = now
        requestSnapshot(true, { resetGiveUp: true })
        return
      }
      if (!quiet) return
      requestSnapshot(true)
    }, REVISION_HEARTBEAT_MS)
    return () => window.clearInterval(id)
  }, [config?.role, boardPartyConnectionId, requestSnapshot])

  // iOS suspends WebSockets while backgrounded. Force a hydrate whenever the
  // app becomes visible/online again; SUBSCRIBED also requests one after rejoin.
  useEffect(() => {
    if (config?.role !== 'guest') return
    const onResume = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        requestSnapshot(true, { resetGiveUp: true })
      }
    }
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('online', onResume)
    return () => {
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('online', onResume)
    }
  }, [config?.role, requestSnapshot])

  // Keep the host screen awake during online play so iOS is less likely to
  // suspend the authority WebSocket mid-game. Also burst heartbeats on resume.
  useEffect(() => {
    if (config?.role !== 'host') return
    let lock: WakeLockSentinel | null = null
    const burstHeartbeats = () => {
      const store = authorityRef.current
      if (!authorityIsLive(store) || !store.authorityId) return
      const sendOne = () =>
        sendWire({
          kind: 'revision_heartbeat',
          rev: store.gameRev,
          authorityId: store.authorityId!,
        })
      sendOne()
      window.setTimeout(sendOne, 300)
      window.setTimeout(sendOne, 800)
      const gs = authorityLoadState(store)
      if (gs) {
        sendWire({
          kind: 'public_state',
          rev: store.gameRev,
          state: toPublicGameState(gs),
        })
      }
    }
    const requestLock = async () => {
      try {
        if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return
        lock = await navigator.wakeLock.request('screen')
      } catch {
        /* unsupported / denied */
      }
    }
    void requestLock()
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void requestLock()
        burstHeartbeats()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onVis)
      void lock?.release()
    }
  }, [config?.role, boardPartyConnectionId, sendWire])

  useEffect(() => {
    if (!latestPublicRef.current) return
    applyMergedView()
  }, [boardPartyConnectionId, resolveSeatPlayerId, applyMergedView])

  const requestResync = useCallback(
    () => requestSnapshot(true, { resetGiveUp: true }),
    [requestSnapshot]
  )

  // Host seeds the authority once the local table finishes setup — or skips
  // seeding when a mid-game authority was already resumed from storage.
  useEffect(() => {
    const cfg = cfgRef.current
    if (!cfg || cfg.role !== 'host') return
    if (!boardPartyConnectionId) return
    if (hostInitSentRef.current) return
    if (authorityIsLive(authorityRef.current)) {
      hostInitSentRef.current = true
      persistAuthoritySoon()
      return
    }
    if (!gameState.isSetupComplete || gameState.players.length === 0) return

    hostInitSentRef.current = true
    const result = authorityInitGame(authorityRef.current, boardPartyConnectionId, gameState)
    if (result.ok) {
      deliverOutbound(result.messages)
      persistAuthoritySoon()
    } else {
      hostInitSentRef.current = false
      onGameEventsRef.current?.([{ type: 'toast', level: 'error', message: result.error }])
    }
  }, [
    gameState.isSetupComplete,
    gameState.players.length,
    configKey,
    boardPartyConnectionId,
    gameState,
    deliverOutbound,
    persistAuthoritySoon,
  ])

  return {
    sendGameClear,
    boardPartyConnectionId,
    sendAction,
    sendFx,
    connectionStatus,
    requestResync,
    flushAuthorityPersist,
    isOnline: config != null && getRealtimeClient() != null,
  }
}
