/**
 * Beta freeze watchdog.
 *
 * A 1s heartbeat runs on the JS main thread. If a tick arrives late (thread was
 * blocked) the stall is recorded to a localStorage ring buffer and the console.
 *
 * Reading the log during beta:
 *  - Safari Web Inspector console:  window.__fsFreezeLog()
 *  - Or watch for "[fs-watchdog]" console entries as they happen.
 */

const STORAGE_KEY = 'fs-freeze-log'
const HEARTBEAT_MS = 1000
/** Report stalls where the heartbeat arrived ≥ this much past its 1s schedule. */
const STALL_THRESHOLD_MS = 2500
const MAX_ENTRIES = 50

interface FreezeEntry {
  at: string
  stallMs: number
  visible: boolean
  note?: string
}

function readLog(): FreezeEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as FreezeEntry[]) : []
  } catch {
    return []
  }
}

function appendEntry(entry: FreezeEntry) {
  try {
    const log = readLog()
    log.push(entry)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log.slice(-MAX_ENTRIES)))
  } catch {
    /* storage full or unavailable — console entry still fires */
  }
}

export function startFreezeWatchdog() {
  if (typeof window === 'undefined') return

  let last = performance.now()

  window.setInterval(() => {
    const now = performance.now()
    const stallMs = Math.round(now - last - HEARTBEAT_MS)
    last = now
    // Backgrounded tabs legitimately throttle timers; only treat as a freeze when visible.
    if (stallMs >= STALL_THRESHOLD_MS && document.visibilityState === 'visible') {
      const entry: FreezeEntry = {
        at: new Date().toISOString(),
        stallMs,
        visible: true,
      }
      console.error(`[fs-watchdog] main thread stalled ~${stallMs}ms`, entry)
      appendEntry(entry)
    }
  }, HEARTBEAT_MS)

  window.addEventListener('error', (e) => {
    appendEntry({
      at: new Date().toISOString(),
      stallMs: 0,
      visible: document.visibilityState === 'visible',
      note: `uncaught: ${e.message}`,
    })
  })

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason)
    console.error('[fs-watchdog] unhandled rejection:', reason)
    appendEntry({
      at: new Date().toISOString(),
      stallMs: 0,
      visible: document.visibilityState === 'visible',
      note: `rejection: ${reason}`,
    })
  })
  ;(window as unknown as Record<string, unknown>).__fsFreezeLog = () => readLog()
}
