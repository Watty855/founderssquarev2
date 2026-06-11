import type { LobbyPlayer, SeatPlanEntry } from '@/lib/partyLobbyTypes'
import { PLAYER_COLORS, type Player } from '@/lib/types'

export function pickDistinctColors(used: Set<string>, need: number): string[] {
  const out: string[] = []
  for (const c of PLAYER_COLORS) {
    if (out.length >= need) break
    if (!used.has(c.value)) out.push(c.value)
  }
  return out
}

const COLOR_SET = new Set(PLAYER_COLORS.map((c) => c.value))

/** Humans from Party roster + optional bots; 2–6 total or null if invalid. */
export function rosterPlusBotsToSeatPlan(roster: LobbyPlayer[], botCount: number): SeatPlanEntry[] | null {
  const humans = [...roster].sort((a, b) => a.displayName.localeCompare(b.displayName))
  const total = humans.length + botCount
  if (total < 2 || total > 6) return null
  const usedColors = new Set<string>()
  const seats: SeatPlanEntry[] = humans.map((p, i) => {
    const color = PLAYER_COLORS[i % PLAYER_COLORS.length].value
    usedColors.add(color)
    return {
      connectionId: p.connectionId,
      displayName: p.displayName,
      isAi: false,
      color,
    }
  })
  for (let i = 0; i < botCount; i++) {
    const [c] = pickDistinctColors(usedColors, 1)
    const color = c ?? PLAYER_COLORS[(humans.length + i) % PLAYER_COLORS.length].value
    usedColors.add(color)
    seats.push({
      connectionId: null,
      displayName: `Founderbot ${i + 1}`,
      isAi: true,
      color,
      aiDifficulty: 'normal',
    })
  }
  return seats
}

export function manualLayoutToSeatPlan(
  myConnectionId: string,
  humanName: string,
  humanColor: string,
  aiSlots: Array<{ name: string; color: string; difficulty: 'easy' | 'normal' | 'hard' }>
): SeatPlanEntry[] {
  return [
    {
      connectionId: myConnectionId,
      displayName: humanName.trim() || 'Founder',
      isAi: false,
      color: humanColor,
    },
    ...aiSlots.map((s) => ({
      connectionId: null as string | null,
      displayName: s.name.trim() || 'Bot',
      isAi: true as const,
      color: s.color,
      aiDifficulty: s.difficulty,
    })),
  ]
}

export function seatPlanToPlayers(seats: SeatPlanEntry[]): Player[] {
  const usedColors = new Set<string>()
  const base: Player[] = seats.map((s, i) => {
    let color = s.color && COLOR_SET.has(s.color) ? s.color : ''
    if (!color || usedColors.has(color)) {
      const [c] = pickDistinctColors(usedColors, 1)
      color = c ?? PLAYER_COLORS[i % PLAYER_COLORS.length].value
    }
    usedColors.add(color)
    const isAi = s.isAi === true
    return {
      id: i,
      name: s.displayName,
      color,
      isAi,
      aiDifficulty: isAi ? (s.aiDifficulty ?? 'normal') : undefined,
      money: 20,
      actionCards: [],
      propertyCards: [],
      ...(isAi ? {} : { partySeatConnectionId: s.connectionId ?? null }),
    }
  })
  const shuffled = [...base].sort(() => Math.random() - 0.5)
  return shuffled.map((p, i) => ({ ...p, id: i }))
}

export function seatPlanColorsUnique(seats: SeatPlanEntry[]): boolean {
  const colors = seats.map((s) => (s.color && COLOR_SET.has(s.color) ? s.color : '')).filter(Boolean)
  return new Set(colors).size === colors.length
}
