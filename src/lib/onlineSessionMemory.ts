import { normalizeRoomCode } from '@/lib/realtimeClient'

const LAST_ONLINE_SESSION_KEY = 'fs-last-online-session'

export type LastOnlineSession = {
  roomId: string
  displayName: string
  role: 'host' | 'guest'
  savedAt: number
}

/** Remember the last online seat so a frozen device can rejoin the same room code. */
export function saveLastOnlineSession(opts: {
  roomId: string
  displayName: string
  role: 'host' | 'guest'
}): void {
  const roomId = normalizeRoomCode(opts.roomId)
  const displayName = opts.displayName.trim().slice(0, 40)
  if (!roomId || !displayName) return
  const payload: LastOnlineSession = {
    roomId,
    displayName,
    role: opts.role,
    savedAt: Date.now(),
  }
  try {
    localStorage.setItem(LAST_ONLINE_SESSION_KEY, JSON.stringify(payload))
  } catch {
    /* private mode */
  }
}

export function loadLastOnlineSession(): LastOnlineSession | null {
  try {
    const raw = localStorage.getItem(LAST_ONLINE_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LastOnlineSession>
    const roomId = typeof parsed.roomId === 'string' ? normalizeRoomCode(parsed.roomId) : ''
    const displayName = typeof parsed.displayName === 'string' ? parsed.displayName.trim() : ''
    const role = parsed.role === 'host' || parsed.role === 'guest' ? parsed.role : null
    if (!roomId || !displayName || !role) return null
    return {
      roomId,
      displayName,
      role,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    }
  } catch {
    return null
  }
}

export function clearLastOnlineSession(): void {
  try {
    localStorage.removeItem(LAST_ONLINE_SESSION_KEY)
  } catch {
    /* noop */
  }
}
