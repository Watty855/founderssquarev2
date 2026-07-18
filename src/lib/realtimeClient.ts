import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase Realtime is the live-sync backbone for Founders Square v2 online play.
 * Broadcast channels carry the game protocol (no database tables required), and
 * presence powers lobby rosters. The same code path works in the browser and in
 * the Capacitor iOS/Android shells.
 *
 * Configure via env (see .env.example):
 *   VITE_SUPABASE_URL=https://<project>.supabase.co
 *   VITE_SUPABASE_ANON_KEY=<anon key>
 *
 * When unconfigured, online play is disabled gracefully (single player and
 * pass-and-play keep working on-device).
 */
let cached: SupabaseClient | null | undefined

export function getRealtimeClient(): SupabaseClient | null {
  if (cached !== undefined) return cached
  const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  cached =
    url && key
      ? createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          // A single game action fans out public state, private hands, events,
          // and table effects. Keep the client-side limiter comfortably above
          // those bursts; Supabase still enforces the project's server limits.
          realtime: { params: { eventsPerSecond: 100 } },
        })
      : null
  return cached
}

export function isOnlineConfigured(): boolean {
  return getRealtimeClient() != null
}

const CONNECTION_ID_STORAGE_KEY = 'fs-device-connection-id'

let deviceConnectionId: string | null = null

/**
 * Stable per-device session id used as the presence key, seat-plan connection id,
 * and board sender id — one identity from lobby through live play, surviving
 * page reloads within the session.
 */
export function getDeviceConnectionId(): string {
  if (deviceConnectionId) return deviceConnectionId
  try {
    const existing = sessionStorage.getItem(CONNECTION_ID_STORAGE_KEY)
    if (existing) {
      deviceConnectionId = existing
      return existing
    }
  } catch {
    /* sessionStorage unavailable — fall through to in-memory id */
  }
  const fresh =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `conn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  deviceConnectionId = fresh
  try {
    sessionStorage.setItem(CONNECTION_ID_STORAGE_KEY, fresh)
  } catch {
    /* noop */
  }
  return fresh
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 48)
}

export function generateRoomCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}

/** Lobby channel topic (presence roster + seat plan sync). */
export function lobbyTopic(roomId: string): string {
  return `fs-lobby-${normalizeRoomCode(roomId)}`
}

/** Board channel topic (game actions + authoritative state broadcasts). */
export function boardTopic(roomId: string): string {
  return `fs-board-${normalizeRoomCode(roomId)}`
}
