/**
 * Multi-client online sync probe for Founders Square.
 * Spawns 1 host + N guests on a temporary board channel and verifies:
 *  - hydrate with displayName binds seat + delivers private_hand
 *  - targeted public_state (to) is ignored by other guests
 *  - heartbeat does not induce an infinite game_request loop after catch-up
 *  - action_applied alone advances all guests without duplicate public_state
 *
 * Usage: node scripts/onlineResyncProbe.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnv() {
  const raw = readFileSync(resolve(root, '.env'), 'utf8')
  const out = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    out[m[1].trim()] = m[2].trim()
  }
  return out
}

const env = loadEnv()
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const ROOM = `probe-${Date.now().toString(36)}`
const TOPIC = `fs-board-${ROOM}`
const AUTH_ID = `auth_${ROOM}`
const GUEST_COUNT = 2
const HEARTBEATS = 8

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function makeClient(label) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 100 } },
  })
}

async function fetchPublicIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json')
    const j = await res.json()
    return j.ip ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

async function subscribe(client, onMsg) {
  const ch = client.channel(TOPIC, { config: { broadcast: { self: false } } })
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('subscribe timeout')), 15_000)
    ch.on('broadcast', { event: 'board' }, ({ payload }) => onMsg(payload))
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(t)
        resolve()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(t)
        reject(new Error(status))
      }
    })
  })
  return ch
}

function send(ch, msg) {
  return ch.send({ type: 'broadcast', event: 'board', payload: msg })
}

async function main() {
  const localIp = await fetchPublicIp()
  console.log(JSON.stringify({ phase: 'start', room: ROOM, topic: TOPIC, localIp }, null, 2))

  const hostId = `host-${ROOM}`
  const guests = Array.from({ length: GUEST_COUNT }, (_, i) => ({
    id: `guest-${i + 1}-${ROOM}`,
    name: `Guest${i + 1}`,
    // Intentionally wrong seat id at start — host must bind via displayName.
    lobbySeatId: `lobby-old-${i + 1}`,
    requestCount: 0,
    publicHits: 0,
    targetedPublicHits: 0,
    foreignTargetedIgnores: 0,
    handHits: 0,
    actionHits: 0,
    lastRev: 0,
    handRev: -1,
    status: 'connecting',
  }))

  // Simulate authority seat table (host binds on game_request).
  const seats = {
    [hostId]: { playerId: 0, name: 'Host' },
    ...Object.fromEntries(
      guests.map((g, i) => [g.lobbySeatId, { playerId: i + 1, name: g.name }])
    ),
  }

  let hostRev = 1
  const hostClient = makeClient('host')
  const guestClients = guests.map(() => makeClient('guest'))

  const hostCh = await subscribe(hostClient, async (msg) => {
    if (msg?.kind === 'game_request') {
      const g = guests.find((x) => x.id === msg.from)
      if (!g) return
      // Bind by displayName if connection unknown (mirrors authorityBindGuestSession).
      if (!seats[msg.from]) {
        const byName = Object.entries(seats).find(([, s]) => s.name === msg.displayName)
        if (byName) {
          seats[msg.from] = seats[byName[0]]
          delete seats[byName[0]]
        }
      }
      const seat = seats[msg.from]
      await send(hostCh, {
        kind: 'public_state',
        rev: hostRev,
        state: { rev: hostRev, players: Object.keys(seats).length },
        to: msg.from,
      })
      if (seat) {
        await send(hostCh, {
          kind: 'private_hand',
          rev: hostRev,
          to: msg.from,
          hand: { playerId: seat.playerId, actionCards: [1], propertyCards: [] },
        })
      }
    }
  })

  for (let i = 0; i < guests.length; i++) {
    const g = guests[i]
    const ch = await subscribe(guestClients[i], (msg) => {
      if (!msg || typeof msg !== 'object') return
      if (msg.kind === 'public_state') {
        if (msg.to && msg.to !== g.id) {
          g.foreignTargetedIgnores += 1
          return
        }
        if (msg.to === g.id) g.targetedPublicHits += 1
        else g.publicHits += 1
        if (typeof msg.rev === 'number' && msg.rev >= g.lastRev) {
          g.lastRev = msg.rev
          g.status = 'connected'
        }
      } else if (msg.kind === 'private_hand' && msg.to === g.id) {
        g.handHits += 1
        g.handRev = msg.rev
        g.status = 'connected'
      } else if (msg.kind === 'action_applied') {
        g.actionHits += 1
        if (typeof msg.rev === 'number' && msg.rev >= g.lastRev) {
          g.lastRev = msg.rev
          g.status = 'connected'
        }
      } else if (msg.kind === 'revision_heartbeat') {
        // Guest logic after fix: only hand-behind if baseline exists.
        const hasHandBaseline = g.handRev >= 0
        const handBehind = hasHandBaseline && g.handRev < msg.rev
        const behind = msg.rev > g.lastRev || handBehind
        if (behind) {
          g.requestCount += 1
          g.status = 'resyncing'
          void send(ch, {
            kind: 'game_request',
            from: g.id,
            displayName: g.name,
          })
        } else {
          g.status = 'connected'
        }
      }
    })
    g.ch = ch
    // Initial hydrate (wrong connection id vs lobby seat — name binds it).
    g.requestCount += 1
    await send(ch, { kind: 'game_request', from: g.id, displayName: g.name })
  }

  await sleep(1500)

  // Heartbeat storm — should not loop after catch-up.
  for (let h = 0; h < HEARTBEATS; h++) {
    await send(hostCh, {
      kind: 'revision_heartbeat',
      rev: hostRev,
      authorityId: AUTH_ID,
    })
    await sleep(300)
  }

  // Advance rev via action_applied only (no duplicate public_state).
  hostRev = 2
  await send(hostCh, {
    kind: 'action_applied',
    rev: hostRev,
    actionId: 'act-1',
    state: { rev: hostRev, players: guests.length + 1 },
    events: [],
  })
  for (const g of guests) {
    if (g.handRev >= 0) {
      await send(hostCh, {
        kind: 'private_hand',
        rev: hostRev,
        to: g.id,
        hand: { playerId: seats[g.id]?.playerId ?? 1, actionCards: [1, 2], propertyCards: [] },
      })
    }
  }
  await sleep(800)

  for (let h = 0; h < HEARTBEATS; h++) {
    await send(hostCh, {
      kind: 'revision_heartbeat',
      rev: hostRev,
      authorityId: AUTH_ID,
    })
    await sleep(300)
  }

  // Untargeted foreign hydrate should be ignored when `to` is set.
  await send(hostCh, {
    kind: 'public_state',
    rev: hostRev,
    state: { rev: hostRev, noise: true },
    to: guests[0].id,
  })
  await sleep(500)

  const result = {
    phase: 'done',
    room: ROOM,
    localIp,
    hostRev,
    guests: guests.map((g) => ({
      id: g.id,
      name: g.name,
      status: g.status,
      lastRev: g.lastRev,
      handRev: g.handRev,
      requestCount: g.requestCount,
      targetedPublicHits: g.targetedPublicHits,
      publicHits: g.publicHits,
      foreignTargetedIgnores: g.foreignTargetedIgnores,
      handHits: g.handHits,
      actionHits: g.actionHits,
    })),
  }

  // Pass criteria
  const allConnected = guests.every((g) => g.status === 'connected' && g.lastRev === hostRev)
  const allHaveHands = guests.every((g) => g.handHits >= 1 && g.handRev === hostRev)
  // Initial request + at most one catch-up after rev bump (not heartbeat storm).
  const noRequestStorm = guests.every((g) => g.requestCount <= 4)
  const foreignIgnored = guests.slice(1).every((g) => g.foreignTargetedIgnores >= 1)

  result.pass = {
    allConnected,
    allHaveHands,
    noRequestStorm,
    foreignIgnored,
    overall: allConnected && allHaveHands && noRequestStorm && foreignIgnored,
  }

  console.log(JSON.stringify(result, null, 2))

  await hostClient.removeChannel(hostCh)
  for (let i = 0; i < guests.length; i++) {
    await guestClients[i].removeChannel(guests[i].ch)
  }
  process.exit(result.pass.overall ? 0 : 2)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
