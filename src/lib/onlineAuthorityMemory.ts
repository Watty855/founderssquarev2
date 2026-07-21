import { normalizeRoomCode } from '@/lib/realtimeClient'

const AUTHORITY_KEY_PREFIX = 'fs-authority-v1:'

export type PersistedAuthoritySnapshot = {
  roomId: string
  authorityId: string
  gameRev: number
  gameHostId: string
  gameStateJson: string
  savedAt: number
}

function keyForRoom(roomId: string): string {
  return `${AUTHORITY_KEY_PREFIX}${normalizeRoomCode(roomId)}`
}

/** Persist the host's live authority so force-quit / reopen can resume mid-game. */
export function saveAuthoritySnapshot(snap: Omit<PersistedAuthoritySnapshot, 'savedAt' | 'roomId'> & {
  roomId: string
}): void {
  const roomId = normalizeRoomCode(snap.roomId)
  if (!roomId || !snap.authorityId || !snap.gameHostId || !snap.gameStateJson) return
  if (snap.gameStateJson.length > 6_000_000) return
  const payload: PersistedAuthoritySnapshot = {
    roomId,
    authorityId: snap.authorityId,
    gameRev: Math.max(1, Math.floor(snap.gameRev)),
    gameHostId: snap.gameHostId,
    gameStateJson: snap.gameStateJson,
    savedAt: Date.now(),
  }
  try {
    localStorage.setItem(keyForRoom(roomId), JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

export function loadAuthoritySnapshot(roomId: string): PersistedAuthoritySnapshot | null {
  try {
    const raw = localStorage.getItem(keyForRoom(roomId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedAuthoritySnapshot>
    if (
      typeof parsed.authorityId !== 'string' ||
      typeof parsed.gameHostId !== 'string' ||
      typeof parsed.gameStateJson !== 'string' ||
      typeof parsed.gameRev !== 'number'
    ) {
      return null
    }
    return {
      roomId: normalizeRoomCode(roomId),
      authorityId: parsed.authorityId,
      gameRev: parsed.gameRev,
      gameHostId: parsed.gameHostId,
      gameStateJson: parsed.gameStateJson,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    }
  } catch {
    return null
  }
}

export function clearAuthoritySnapshot(roomId: string): void {
  try {
    localStorage.removeItem(keyForRoom(roomId))
  } catch {
    /* noop */
  }
}

export function hasResumableHostAuthority(roomId: string): boolean {
  return loadAuthoritySnapshot(roomId) != null
}
